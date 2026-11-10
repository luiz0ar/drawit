use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::models::bson_date::{flexible_datetime, flexible_datetime_option};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    #[serde(rename = "_id")]
    pub id: String,
    pub owner_id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub color: Option<String>,
    #[serde(with = "flexible_datetime")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "flexible_datetime")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Board {
    #[serde(rename = "_id")]
    pub id: String,
    pub owner_id: String,
    pub group_id: Option<String>,
    pub title: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub is_favorite: bool,
    pub thumbnail: Option<String>,
    #[serde(default)]
    pub is_deleted: bool,
    #[serde(default, with = "flexible_datetime_option")]
    pub deleted_at: Option<DateTime<Utc>>,
    #[serde(default, with = "flexible_datetime_option")]
    pub last_opened_at: Option<DateTime<Utc>>,
    #[serde(with = "flexible_datetime")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "flexible_datetime")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardScene {
    #[serde(rename = "_id")]
    pub id: String,
    pub owner_id: String,
    pub schema_version: u32,
    pub revision: u64,
    pub last_client_save_id: Option<String>,
    pub content_hash: String,
    pub elements: Vec<serde_json::Value>,
    pub viewport: Viewport,
    #[serde(with = "flexible_datetime")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardVersion {
    #[serde(rename = "_id")]
    pub id: String,
    pub board_id: String,
    pub owner_id: String,
    pub revision: u64,
    pub label: Option<String>,
    pub elements: Vec<serde_json::Value>,
    pub viewport: Viewport,
    #[serde(with = "flexible_datetime")]
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Viewport {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

impl Default for Viewport {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            zoom: 1.0,
        }
    }
}
