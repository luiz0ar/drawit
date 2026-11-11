use chrono::{Duration, Utc};
use mongodb::{
    bson::{doc, DateTime as BsonDateTime},
    Collection, Database,
};
use std::sync::Arc;

use crate::{
    dto::{
        AuthResponse, ChangePasswordRequest, LoginRequest, RegisterRequest, RegisterResponse,
        UserDto,
    },
    error::{AppError, InvalidParam},
    models::{RefreshToken, User},
    services::{verification_service::VerificationService, PasswordService, TokenService},
    AppConfig,
};

pub struct AuthService {
    users_col: Collection<User>,
    tokens_col: Collection<RefreshToken>,
    token_service: TokenService,
    verification_service: Arc<VerificationService>,
    refresh_exp_days: i64,
    access_exp_minutes: i64,
}

impl AuthService {
    pub fn new(
        db: &Database,
        config: &AppConfig,
        verification_service: Arc<VerificationService>,
    ) -> Self {
        Self {
            users_col: db.collection("users"),
            tokens_col: db.collection("refresh_tokens"),
            token_service: TokenService::new(
                config.jwt_secret.clone(),
                config.jwt_expiration_minutes,
            ),
            verification_service,
            refresh_exp_days: config.refresh_token_expiration_days,
            access_exp_minutes: config.jwt_expiration_minutes,
        }
    }

    /// Helper to validate email format
    fn is_valid_email(email: &str) -> bool {
        let parts: Vec<&str> = email.split('@').collect();
        if parts.len() != 2 {
            return false;
        }
        let user = parts[0];
        let domain = parts[1];
        if user.is_empty() || domain.is_empty() {
            return false;
        }
        domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.')
    }

    /// Register user with unique username, email, password and confirmPassword.
    /// Creates user with email_verified = false and dispatches email verification.
    pub async fn register(&self, req: RegisterRequest) -> Result<RegisterResponse, AppError> {
        let username = req.username.trim().to_lowercase();
        let email = req.email.trim().to_lowercase();
        let password = req.password;
        let confirm_password = req.confirm_password;

        let mut invalid_params = Vec::new();
        if username.len() < 3 || username.len() > 30 {
            invalid_params.push(InvalidParam {
                name: "username".to_string(),
                reason: "Username must be between 3 and 30 characters long.".to_string(),
            });
        }
        if !username
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-')
        {
            invalid_params.push(InvalidParam {
                name: "username".to_string(),
                reason:
                    "Username can only contain letters, numbers, dots, hyphens, and underscores."
                        .to_string(),
            });
        }
        if email.is_empty() || !Self::is_valid_email(&email) {
            invalid_params.push(InvalidParam {
                name: "email".to_string(),
                reason: "Please provide a valid email address.".to_string(),
            });
        }
        if password.len() < 6 {
            invalid_params.push(InvalidParam {
                name: "password".to_string(),
                reason: "Password must have at least 6 characters.".to_string(),
            });
        }
        if password != confirm_password {
            invalid_params.push(InvalidParam {
                name: "confirmPassword".to_string(),
                reason: "Passwords do not match.".to_string(),
            });
        }
        if !invalid_params.is_empty() {
            return Err(AppError::Validation(invalid_params));
        }

        // Check if email already exists (explicit 422 as chosen by user)
        let email_exists = self
            .users_col
            .find_one(doc! { "email": &email })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .is_some();
        if email_exists {
            return Err(AppError::Validation(vec![InvalidParam {
                name: "email".to_string(),
                reason: "An account with this email address already exists.".to_string(),
            }]));
        }

        // Check if username already exists
        let username_exists = self
            .users_col
            .find_one(doc! { "username": &username })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .is_some();
        if username_exists {
            return Err(AppError::Validation(vec![InvalidParam {
                name: "username".to_string(),
                reason: "This username is already taken.".to_string(),
            }]));
        }

        // Argon2id hashing isolated in spawn_blocking
        let password_hash = PasswordService::hash_password(password).await?;
        let new_user = User::new(username, email.clone(), password_hash);

        self.users_col
            .insert_one(&new_user)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        // Dispatch verification email request
        self.verification_service
            .request_verification(&new_user.id, &new_user.email)
            .await?;

        Ok(RegisterResponse {
            message:
                "Account created successfully. Please check your email to verify your account."
                    .to_string(),
            email: new_user.email,
        })
    }

    /// Login with valid email and password credentials
    pub async fn login(
        &self,
        req: LoginRequest,
        user_agent: Option<String>,
    ) -> Result<(AuthResponse, String), AppError> {
        let email = req.email.trim().to_lowercase();
        let password = req.password;

        let user_opt = self
            .users_col
            .find_one(doc! { "email": &email })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        // Constant-time defense: execute password verification on a valid dummy hash
        // even if user is not found to prevent timing side-channel user enumeration.
        const DUMMY_HASH: &str = "$argon2id$v=19$m=19456,t=2,p=1$WEDNDxlpgAra9d7zpwalTw$aj5O4j1QFg45uvp1waCWNny9pM1eVeDeUyeJhEz/kNc";
        let target_hash = match &user_opt {
            Some(u) => u.password_hash.clone(),
            None => DUMMY_HASH.to_string(),
        };

        let is_valid = PasswordService::verify_password(password, target_hash).await?;

        let user = match user_opt {
            Some(u) if is_valid => u,
            _ => {
                return Err(AppError::Unauthorized(
                    "Invalid email or password.".to_string(),
                ));
            }
        };

        // Check if email has been verified
        if !user.email_verified {
            return Err(AppError::EmailNotVerified {
                email: user.email.clone(),
            });
        }

        self.create_session(&user, user_agent).await
    }

    /// Resend verification email for an unverified user
    pub async fn resend_verification(&self, email: &str) -> Result<(), AppError> {
        let normalized = email.trim().to_lowercase();
        if normalized.is_empty() {
            return Ok(());
        }

        if let Some(user) = self
            .users_col
            .find_one(doc! { "email": &normalized })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
        {
            if !user.email_verified {
                self.verification_service
                    .request_verification(&user.id, &user.email)
                    .await?;
            }
        }

        Ok(())
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
                email: user.email,
                email_verified: user.email_verified,
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

    /// RF-A05: Logout all devices by revoking all refresh tokens for the user
    pub async fn logout_all(&self, user_id: &str) -> Result<(), AppError> {
        let now = Utc::now();
        self.tokens_col
            .update_many(
                doc! { "user_id": user_id, "revoked_at": null },
                doc! { "$set": { "revoked_at": BsonDateTime::from_millis(now.timestamp_millis()) } },
            )
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        Ok(())
    }

    /// RF-A06: Change password and revoke all existing refresh tokens
    pub async fn change_password(
        &self,
        user_id: &str,
        req: ChangePasswordRequest,
    ) -> Result<(), AppError> {
        if req.new_password.len() < 6 {
            return Err(AppError::Validation(vec![InvalidParam {
                name: "new_password".to_string(),
                reason: "New password must have at least 6 characters.".to_string(),
            }]));
        }

        let user = self
            .users_col
            .find_one(doc! { "_id": user_id })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::NotFound("User not found.".to_string()))?;

        let is_valid =
            PasswordService::verify_password(req.current_password, user.password_hash).await?;
        if !is_valid {
            return Err(AppError::Unauthorized(
                "Current password is incorrect.".to_string(),
            ));
        }

        let new_hash = PasswordService::hash_password(req.new_password).await?;
        let now = Utc::now();

        self.users_col
            .update_one(
                doc! { "_id": user_id },
                doc! {
                    "$set": {
                        "password_hash": new_hash,
                        "updated_at": BsonDateTime::from_millis(now.timestamp_millis()),
                    }
                },
            )
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        self.logout_all(user_id).await?;
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
                email: user.email.clone(),
                email_verified: user.email_verified,
                preferences: serde_json::to_value(&user.preferences).unwrap(),
            },
        };

        Ok((response, raw_refresh))
    }
}
