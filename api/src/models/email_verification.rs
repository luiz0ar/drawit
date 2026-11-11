use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::bson_date::{flexible_datetime, flexible_datetime_option};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VerificationStatus {
    Pending,
    Sent,
    Used,
    Invalidated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailVerification {
    #[serde(rename = "_id")]
    pub id: String,
    pub user_id: String,
    pub email: String,
    #[serde(default)]
    pub token_hash: Option<String>,
    pub status: VerificationStatus,
    #[serde(with = "flexible_datetime")]
    pub expires_at: DateTime<Utc>,
    #[serde(default, with = "flexible_datetime_option")]
    pub used_at: Option<DateTime<Utc>>,
    #[serde(with = "flexible_datetime")]
    pub created_at: DateTime<Utc>,
}

impl EmailVerification {
    pub fn new(user_id: String, email: String, expires_at: DateTime<Utc>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            user_id,
            email,
            token_hash: None,
            status: VerificationStatus::Pending,
            expires_at,
            used_at: None,
            created_at: Utc::now(),
        }
    }
}
