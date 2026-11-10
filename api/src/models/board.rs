use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    #[serde(rename = "_id")]
    pub id: String,
    pub owner_id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub color: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Board {
    #[serde(rename = "_id")]
    pub id: String,
    pub owner_id: String,
    pub group_id: Option<String>,
    pub title: String,
    pub tags: Vec<String>,
    pub is_favorite: bool,
    pub thumbnail: Option<String>,
    pub is_deleted: bool,
    pub deleted_at: Option<DateTime<Utc>>,
    pub last_opened_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardScene {
    #[serde(rename = "_id")]
    pub id: String, // igual a board_id
    pub owner_id: String,
    pub schema_version: u32,
    pub revision: u64,
    pub last_client_save_id: Option<String>,
    pub content_hash: String,
    pub elements: Vec<serde_json::Value>,
    pub viewport: Viewport,
    pub updated_at: DateTime<Utc>,
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
