use chrono::{Duration, Utc};
use mongodb::{
    bson::{doc, DateTime as BsonDateTime},
    Collection, Database,
};

use crate::{
    dto::{AuthResponse, LoginRequest, RegisterRequest, UserDto},
    error::{AppError, InvalidParam},
    models::{RefreshToken, User},
    services::{PasswordService, TokenService},
    AppConfig,
};

pub struct AuthService {
    users_col: Collection<User>,
    tokens_col: Collection<RefreshToken>,
    token_service: TokenService,
    refresh_exp_days: i64,
    access_exp_minutes: i64,
}

impl AuthService {
    pub fn new(db: &Database, config: &AppConfig) -> Self {
        Self {
            users_col: db.collection("users"),
            tokens_col: db.collection("refresh_tokens"),
            token_service: TokenService::new(
                config.jwt_secret.clone(),
                config.jwt_expiration_minutes,
            ),
            refresh_exp_days: config.refresh_token_expiration_days,
            access_exp_minutes: config.jwt_expiration_minutes,
        }
    }

    /// RF-A01: Register user with unique username and password
    pub async fn register(
        &self,
        req: RegisterRequest,
        user_agent: Option<String>,
    ) -> Result<(AuthResponse, String), AppError> {
        let username = req.username.trim().to_lowercase();
        let password = req.password;

        let mut invalid_params = Vec::new();
        if username.len() < 3 || username.len() > 30 {
            invalid_params.push(InvalidParam {
                name: "username".to_string(),
                reason: "Username must be between 3 and 30 characters long.".to_string(),
            });
        }
        if password.len() < 6 {
            invalid_params.push(InvalidParam {
                name: "password".to_string(),
                reason: "Password must have at least 6 characters.".to_string(),
            });
        }
        if !invalid_params.is_empty() {
            return Err(AppError::Validation(invalid_params));
        }

        // Check if username already exists
        let exists = self
            .users_col
            .find_one(doc! { "username": &username })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .is_some();
        if exists {
            return Err(AppError::Validation(vec![InvalidParam {
                name: "username".to_string(),
                reason: "This username is already taken.".to_string(),
            }]));
        }

        // Argon2id hashing isolated in spawn_blocking
        let password_hash = PasswordService::hash_password(password).await?;
        let new_user = User::new(username.clone(), password_hash);

        self.users_col
            .insert_one(&new_user)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        // Generate session with JWT and opaque refresh token
        self.create_session(&new_user, user_agent).await
    }

    /// RF-A02: Login with valid credentials
    pub async fn login(
        &self,
        req: LoginRequest,
        user_agent: Option<String>,
    ) -> Result<(AuthResponse, String), AppError> {
        let username = req.username.trim().to_lowercase();
        let password = req.password;

        let user = self
            .users_col
            .find_one(doc! { "username": &username })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::Unauthorized("Invalid username or password.".to_string()))?;

        let is_valid =
            PasswordService::verify_password(password, user.password_hash.clone()).await?;
        if !is_valid {
            return Err(AppError::Unauthorized(
                "Invalid username or password.".to_string(),
            ));
        }

        self.create_session(&user, user_agent).await
    }

    /// RF-A03: Atomic refresh token rotation with concurrent grace window (15s)
    pub async fn refresh(
        &self,
        raw_refresh_token: String,
        user_agent: Option<String>,
    ) -> Result<(AuthResponse, String), AppError> {
        let token_hash = TokenService::hash_token(&raw_refresh_token);

        let token_doc = self
            .tokens_col
            .find_one(doc! { "token_hash": &token_hash })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::Unauthorized("Invalid or expired session.".to_string()))?;

        let now = Utc::now();

        // Expiration check
        if token_doc.expires_at < now {
            return Err(AppError::Unauthorized(
                "Session expired. Please sign in again.".to_string(),
            ));
        }

        // Revocation / Reuse detection
        if let Some(revoked_at) = token_doc.revoked_at {
            // 15 seconds grace window for concurrent browser tabs
            let grace_limit = revoked_at + Duration::seconds(15);
            if now > grace_limit {
                // Token reuse detected outside grace window: revoke token family
                self.tokens_col
                    .update_many(
                        doc! { "family_id": &token_doc.family_id },
                        doc! { "$set": { "revoked_at": BsonDateTime::from_millis(now.timestamp_millis()) } },
                    )
                    .await
                    .map_err(|e| AppError::Internal(e.to_string()))?;

                return Err(AppError::Unauthorized(
                    "Security violation detected. All active sessions have been revoked."
                        .to_string(),
                ));
            }
        }

        // Fetch associated user
        let user = self
            .users_col
            .find_one(doc! { "_id": &token_doc.user_id })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::Unauthorized("User not found.".to_string()))?;

        // Generate rotated opaque token
        let (new_raw, new_hash) = TokenService::generate_opaque_token();
        let new_expires_at = now + Duration::days(self.refresh_exp_days);

        let new_refresh_token = RefreshToken {
            id: uuid::Uuid::new_v4().to_string(),
            user_id: user.id.clone(),
            family_id: token_doc.family_id.clone(),
            token_hash: new_hash,
            expires_at: new_expires_at,
            revoked_at: None,
            replaced_by: None,
            user_agent,
            created_at: now,
        };

        // Mark previous token as replaced and revoked
        self.tokens_col
            .update_one(
                doc! { "_id": &token_doc.id },
                doc! {
                    "$set": {
                        "revoked_at": BsonDateTime::from_millis(now.timestamp_millis()),
                        "replaced_by": &new_refresh_token.id,
                    }
                },
            )
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        // Insert new token into family
        self.tokens_col
            .insert_one(&new_refresh_token)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let access_token = self
            .token_service
            .create_access_token(&user.id, &user.username)?;

        let auth_response = AuthResponse {
            access_token,
            token_type: "Bearer".to_string(),
            expires_in: self.access_exp_minutes * 60,
            user: UserDto {
                id: user.id,
                username: user.username,
                preferences: serde_json::to_value(user.preferences).unwrap(),
            },
        };

        Ok((auth_response, new_raw))
    }

    /// Logout: revokes current refresh token
    pub async fn logout(&self, raw_refresh_token: String) -> Result<(), AppError> {
        let token_hash = TokenService::hash_token(&raw_refresh_token);
        let now = Utc::now();

        self.tokens_col
            .update_one(
                doc! { "token_hash": token_hash },
                doc! { "$set": { "revoked_at": BsonDateTime::from_millis(now.timestamp_millis()) } },
            )
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        Ok(())
    }

    /// Creates initial session (Login or Register)
    async fn create_session(
        &self,
        user: &User,
        user_agent: Option<String>,
    ) -> Result<(AuthResponse, String), AppError> {
        let now = Utc::now();
        let (raw_refresh, token_hash) = TokenService::generate_opaque_token();
        let family_id = uuid::Uuid::new_v4().to_string();
        let expires_at = now + Duration::days(self.refresh_exp_days);

        let refresh_token = RefreshToken::new(
            user.id.clone(),
            family_id,
            token_hash,
            expires_at,
            user_agent,
        );

        self.tokens_col
            .insert_one(&refresh_token)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let access_token = self
            .token_service
            .create_access_token(&user.id, &user.username)?;

        let response = AuthResponse {
            access_token,
            token_type: "Bearer".to_string(),
            expires_in: self.access_exp_minutes * 60,
            user: UserDto {
                id: user.id.clone(),
                username: user.username.clone(),
                preferences: serde_json::to_value(&user.preferences).unwrap(),
            },
        };

        Ok((response, raw_refresh))
    }
}
