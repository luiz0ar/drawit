use chrono::{Duration, Utc};
use mongodb::{
    bson::{doc, DateTime as BsonDateTime},
    Collection, Database,
};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tracing::{info, warn};

use crate::{
    error::{AppError, InvalidParam},
    models::{EmailVerification, User, VerificationStatus},
    services::mq::MessagePublisher,
};

pub struct VerificationService {
    users_col: Collection<User>,
    verifications_col: Collection<EmailVerification>,
    publisher: Arc<dyn MessagePublisher>,
    link_ttl_hours: i64,
    cooldown_seconds: i64,
}

impl VerificationService {
    pub fn new(
        db: &Database,
        publisher: Arc<dyn MessagePublisher>,
        link_ttl_hours: i64,
        cooldown_seconds: i64,
    ) -> Self {
        Self {
            users_col: db.collection("users"),
            verifications_col: db.collection("email_verifications"),
            publisher,
            link_ttl_hours,
            cooldown_seconds,
        }
    }

    /// Helper to compute SHA-256 hash in lowercase hex
    pub fn hash_token(raw_token: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(raw_token.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Request a new email verification.
    /// Checks 90-second cooldown, invalidates prior tokens, creates a Pending record, and publishes message.
    pub async fn request_verification(
        &self,
        user_id: &str,
        email: &str,
    ) -> Result<String, AppError> {
        let now = Utc::now();

        // 1. Check cooldown: query most recent verification for this user
        let latest = self
            .verifications_col
            .find_one(doc! { "user_id": user_id })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        if let Some(recent) = latest {
            let elapsed = now.signed_duration_since(recent.created_at).num_seconds();
            if elapsed < self.cooldown_seconds {
                let remaining = (self.cooldown_seconds - elapsed).max(1) as u64;
                return Err(AppError::TooManyRequests {
                    retry_after_seconds: remaining,
                });
            }
        }

        // 2. Invalidate previous pending or sent verifications
        let _ = self
            .verifications_col
            .update_many(
                doc! {
                    "user_id": user_id,
                    "status": { "$in": ["pending", "sent"] }
                },
                doc! {
                    "$set": { "status": "invalidated" }
                },
            )
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        // 3. Create new Pending verification record
        let expires_at = now + Duration::hours(self.link_ttl_hours);
        let new_verif = EmailVerification::new(user_id.to_string(), email.to_string(), expires_at);

        self.verifications_col
            .insert_one(&new_verif)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        info!(
            verification_id = %new_verif.id,
            user_id = user_id,
            email = email,
            "Verification record created in pending state"
        );

        // 4. Publish event to Message Queue
        if let Err(err) = self
            .publisher
            .publish_verification_requested(&new_verif.id, user_id, email)
            .await
        {
            warn!(
                verification_id = %new_verif.id,
                error = %err,
                "Failed to publish verification message to queue (user may resend later)"
            );
        }

        Ok(new_verif.id)
    }

    /// Atomic token verification with replay protection and detailed diagnostics on failure
    pub async fn verify_token(&self, raw_token: &str) -> Result<(), AppError> {
        let trimmed = raw_token.trim();
        if trimmed.is_empty() {
            return Err(AppError::Validation(vec![InvalidParam {
                name: "token".to_string(),
                reason: "Verification token cannot be empty.".to_string(),
            }]));
        }

        let token_hash = Self::hash_token(trimmed);
        let now = Utc::now();

        let bson_now = BsonDateTime::from_millis(now.timestamp_millis());

        // Atomic check-and-consume: status must be "sent" and expires_at > now
        let filter = doc! {
            "token_hash": &token_hash,
            "status": "sent",
            "expires_at": { "$gt": bson_now }
        };
        let update = doc! {
            "$set": {
                "status": "used",
                "used_at": bson_now
            }
        };

        let result = self
            .verifications_col
            .find_one_and_update(filter, update)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        if let Some(consumed) = result {
            // Mark user email as verified
            self.users_col
                .update_one(
                    doc! { "_id": &consumed.user_id },
                    doc! {
                        "$set": {
                            "email_verified": true,
                            "email_verified_at": bson_now
                        }
                    },
                )
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;

            info!(
                user_id = %consumed.user_id,
                email = %consumed.email,
                "User email successfully verified via magic link"
            );
            return Ok(());
        }

        // Diagnostic lookup to return clear RFC 7807 validation error
        let existing = self
            .verifications_col
            .find_one(doc! { "token_hash": &token_hash })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let reason = match existing {
            Some(v) if v.status == VerificationStatus::Used => {
                "This verification link has already been used. Please log in or request a new one."
            }
            Some(v) if v.status == VerificationStatus::Invalidated => {
                "A newer verification email was requested. Please use the link from the most recent email."
            }
            Some(v) if v.expires_at <= now => {
                "This verification link has expired. Please request a new verification email."
            }
            _ => "The verification link is invalid or could not be found.",
        };

        Err(AppError::Validation(vec![InvalidParam {
            name: "token".to_string(),
            reason: reason.to_string(),
        }]))
    }
}
