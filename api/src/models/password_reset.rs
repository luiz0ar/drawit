use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::bson_date::{flexible_datetime, flexible_datetime_option};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasswordReset {
    #[serde(rename = "_id")]
    pub id: String,
    pub user_id: String,
    pub email: String,
    pub token_hash: String,
    pub used: bool,
    #[serde(with = "flexible_datetime")]
    pub expires_at: DateTime<Utc>,
    #[serde(default, with = "flexible_datetime_option")]
    pub used_at: Option<DateTime<Utc>>,
    #[serde(with = "flexible_datetime")]
    pub created_at: DateTime<Utc>,
}

impl PasswordReset {
    pub fn new(
        user_id: String,
        email: String,
        token_hash: String,
        expires_at: DateTime<Utc>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            user_id,
            email,
            token_hash,
            used: false,
            expires_at,
            used_at: None,
            created_at: Utc::now(),
        }
    }
}
