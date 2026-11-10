use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateGroupRequest {
    pub name: String,
    pub color: Option<String>,
    pub parent_id: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateGroupRequest {
    pub name: Option<String>,
    pub color: Option<String>,
    pub parent_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct GroupDto {
    pub id: String,
    pub owner_id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub color: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
