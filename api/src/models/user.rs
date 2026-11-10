use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::bson_date::flexible_datetime;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    #[serde(rename = "_id")]
    pub id: String,
    pub username: String,
    pub password_hash: String,
    #[serde(default)]
    pub preferences: UserPreferences,
    #[serde(with = "flexible_datetime")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "flexible_datetime")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPreferences {
    pub theme: String,
    pub language: String,
}

impl Default for UserPreferences {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            language: "pt-BR".to_string(),
        }
    }
}

impl User {
    pub fn new(username: String, password_hash: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            username,
            password_hash,
            preferences: UserPreferences::default(),
            created_at: now,
            updated_at: now,
        }
    }
}
