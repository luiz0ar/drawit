use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use tokio::task::spawn_blocking;

use crate::error::AppError;

pub struct PasswordService;

impl PasswordService {
    /// Hashes password with Argon2id, isolating CPU-intensive execution into blocking thread pool
    pub async fn hash_password(password: String) -> Result<String, AppError> {
        spawn_blocking(move || {
            let salt = SaltString::generate(&mut OsRng);
            let argon2 = Argon2::default();

            argon2
                .hash_password(password.as_bytes(), &salt)
                .map(|h| h.to_string())
                .map_err(|e| AppError::Internal(format!("Failed to hash password: {}", e)))
        })
        .await
        .map_err(|e| AppError::Internal(format!("Thread pool executor error: {}", e)))?
    }

    /// Verifies password against Argon2id hash asynchronously inside `spawn_blocking`
    pub async fn verify_password(password: String, hash: String) -> Result<bool, AppError> {
        spawn_blocking(move || {
            let parsed_hash = match PasswordHash::new(&hash) {
                Ok(h) => h,
                Err(_) => return Ok(false),
            };

            let argon2 = Argon2::default();
            Ok(argon2
                .verify_password(password.as_bytes(), &parsed_hash)
                .is_ok())
        })
        .await
        .map_err(|e| AppError::Internal(format!("Thread pool executor error: {}", e)))?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_hash_and_verify() {
        let hash = PasswordService::hash_password("dummy_password_for_timing_safety".to_string())
            .await
            .unwrap();
        println!("VALID_ARGON2_HASH: {}", hash);
        assert!(PasswordService::verify_password(
            "dummy_password_for_timing_safety".to_string(),
            hash.clone()
        )
        .await
        .unwrap());
        assert!(
            !PasswordService::verify_password("wrong_password".to_string(), hash)
                .await
                .unwrap()
        );
    }
}
