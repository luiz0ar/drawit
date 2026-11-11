use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use tokio::task::spawn_blocking;

use crate::error::{AppError, InvalidParam};

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

    /// Validates password against security complexity requirements:
    /// - At least 8 characters
    /// - At least one uppercase letter (A-Z)
    /// - At least one lowercase letter (a-z)
    /// - At least one digit (0-9)
    /// - At least one special character (!@#$%^&* etc.)
    pub fn validate_complexity(password: &str, field_name: &str) -> Vec<InvalidParam> {
        let mut errors = Vec::new();

        if password.len() < 8 {
            errors.push(InvalidParam {
                name: field_name.to_string(),
                reason: "Password must have at least 8 characters.".to_string(),
            });
        }
        if !password.chars().any(|c| c.is_ascii_uppercase()) {
            errors.push(InvalidParam {
                name: field_name.to_string(),
                reason: "Password must contain at least one uppercase letter.".to_string(),
            });
        }
        if !password.chars().any(|c| c.is_ascii_lowercase()) {
            errors.push(InvalidParam {
                name: field_name.to_string(),
                reason: "Password must contain at least one lowercase letter.".to_string(),
            });
        }
        if !password.chars().any(|c| c.is_ascii_digit()) {
            errors.push(InvalidParam {
                name: field_name.to_string(),
                reason: "Password must contain at least one number.".to_string(),
            });
        }
        if !password.chars().any(|c| !c.is_alphanumeric()) {
            errors.push(InvalidParam {
                name: field_name.to_string(),
                reason: "Password must contain at least one special character.".to_string(),
            });
        }

        errors
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

    #[test]
    fn test_validate_complexity_rules() {
        // Less than 8 characters
        let errors = PasswordService::validate_complexity("Pass1!", "password");
        assert!(errors.iter().any(|e| e.reason.contains("8 characters")));

        // No uppercase
        let errors = PasswordService::validate_complexity("password123!", "password");
        assert!(errors.iter().any(|e| e.reason.contains("uppercase")));

        // No lowercase
        let errors = PasswordService::validate_complexity("PASSWORD123!", "password");
        assert!(errors.iter().any(|e| e.reason.contains("lowercase")));

        // No number
        let errors = PasswordService::validate_complexity("Password!", "password");
        assert!(errors.iter().any(|e| e.reason.contains("number")));

        // No special character
        let errors = PasswordService::validate_complexity("Password123", "password");
        assert!(errors
            .iter()
            .any(|e| e.reason.contains("special character")));

        // Valid password meets all 5 criteria
        let errors = PasswordService::validate_complexity("StrongP@ssw0rd!", "password");
        assert!(errors.is_empty());
    }
}
