use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // userId
    pub username: String,
    pub exp: usize,
    pub iat: usize,
}

pub struct TokenService {
    secret: String,
    access_token_exp_minutes: i64,
}

impl TokenService {
    pub fn new(secret: String, access_token_exp_minutes: i64) -> Self {
        Self {
            secret,
            access_token_exp_minutes,
        }
    }

    /// Generates signed JWT Access Token with HS256
    pub fn create_access_token(
        &self,
        user_id: &str,
        username: &str,
    ) -> Result<String, AppError> {
        let now = Utc::now();
        let exp = now + Duration::minutes(self.access_token_exp_minutes);

        let claims = Claims {
            sub: user_id.to_string(),
            username: username.to_string(),
            iat: now.timestamp() as usize,
            exp: exp.timestamp() as usize,
        };

        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.secret.as_bytes()),
        )
        .map_err(|e| AppError::Internal(format!("Failed to generate JWT: {}", e)))
    }

    /// Validates and decodes JWT Access Token
    pub fn verify_access_token(&self, token: &str) -> Result<Claims, AppError> {
        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(self.secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|e| AppError::Unauthorized(format!("Invalid or expired token: {}", e)))?;

        Ok(token_data.claims)
    }

    /// Generates a cryptographically secure 256-bit (32 bytes hex) opaque token
    pub fn generate_opaque_token() -> (String, String) {
        use rand::RngCore;
        use std::fmt::Write;

        let mut bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);

        let mut raw_token = String::with_capacity(64);
        for byte in bytes {
            write!(&mut raw_token, "{:02x}", byte).unwrap();
        }

        // SHA-256 hash of opaque token stored in database
        let token_hash = Self::hash_token(&raw_token);

        (raw_token, token_hash)
    }

    /// Calculates SHA-256 hash of raw token
    pub fn hash_token(raw_token: &str) -> String {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(raw_token.as_bytes());
        format!("{:x}", hasher.finalize())
    }
}
