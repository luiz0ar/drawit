use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;

use crate::{
    dto::{CreateGroupRequest, UpdateGroupRequest},
    error::AppError,
    services::{Claims, GroupDeleteAction, GroupService},
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct DeleteGroupQuery {
    pub boards: Option<String>,
}

pub async fn list_groups(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<impl IntoResponse, AppError> {
    let service = GroupService::new(&state.db);
    let groups = service.list_groups(&claims.sub).await?;
    Ok(Json(groups))
}

pub async fn create_group(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<CreateGroupRequest>,
) -> Result<impl IntoResponse, AppError> {
    let service = GroupService::new(&state.db);
    let group = service.create_group(&claims.sub, req).await?;
    Ok((StatusCode::CREATED, Json(group)))
}

pub async fn update_group(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(group_id): Path<String>,
    Json(req): Json<UpdateGroupRequest>,
) -> Result<impl IntoResponse, AppError> {
    let service = GroupService::new(&state.db);
    let group = service.update_group(&claims.sub, &group_id, req).await?;
    Ok(Json(group))
}

pub async fn delete_group(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(group_id): Path<String>,
    Query(query): Query<DeleteGroupQuery>,
) -> Result<impl IntoResponse, AppError> {
    let service = GroupService::new(&state.db);
    let action = match query.boards.as_deref() {
        Some("trash") => GroupDeleteAction::Trash,
        _ => GroupDeleteAction::Move,
    };

    service.delete_group(&claims.sub, &group_id, action).await?;
    Ok(StatusCode::NO_CONTENT)
}
