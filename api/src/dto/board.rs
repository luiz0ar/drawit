use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateBoardRequest {
    pub title: String,
    pub group_id: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateBoardRequest {
    pub title: Option<String>,
    pub group_id: Option<Option<String>>,
    pub tags: Option<Vec<String>>,
    pub is_favorite: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct BoardDto {
    pub id: String,
    pub owner_id: String,
    pub group_id: Option<String>,
    pub title: String,
    pub tags: Vec<String>,
    pub is_favorite: bool,
    pub is_deleted: bool,
    pub deleted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SaveSceneRequest {
    pub revision: u64,
    pub last_client_save_id: Option<String>,
    pub content_hash: String,
    pub elements: Vec<serde_json::Value>,
    pub viewport: ViewportDto,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct ViewportDto {
    pub pan_x: f64,
    pub pan_y: f64,
    pub zoom: f64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SceneDto {
    pub board_id: String,
    pub schema_version: u32,
    pub revision: u64,
    pub elements: Vec<serde_json::Value>,
    pub viewport: ViewportDto,
    pub updated_at: DateTime<Utc>,
}
