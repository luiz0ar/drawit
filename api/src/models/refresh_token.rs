use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::models::bson_date::{flexible_datetime, flexible_datetime_option};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshToken {
    #[serde(rename = "_id")]
    pub id: String,
    pub user_id: String,
    pub family_id: String,
    pub token_hash: String,
    #[serde(with = "flexible_datetime")]
    pub expires_at: DateTime<Utc>,
    #[serde(default, with = "flexible_datetime_option")]
    pub revoked_at: Option<DateTime<Utc>>,
    pub replaced_by: Option<String>,
    pub user_agent: Option<String>,
    #[serde(with = "flexible_datetime")]
    pub created_at: DateTime<Utc>,
}

impl RefreshToken {
    pub fn new(
        user_id: String,
        family_id: String,
        token_hash: String,
        expires_at: DateTime<Utc>,
        user_agent: Option<String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            user_id,
            family_id,
            token_hash,
            expires_at,
            revoked_at: None,
            replaced_by: None,
            user_agent,
            created_at: Utc::now(),
        }
    }
}
