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

#[utoipa::path(
    get,
    path = "/groups",
    responses(
        (status = 200, description = "List all user groups", body = Vec<GroupDto>),
        (status = 401, description = "Unauthorized", body = ProblemDetails)
    ),
    security(
        ("bearer_auth" = [])
    ),
    tag = "Groups"
)]
pub async fn list_groups(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<impl IntoResponse, AppError> {
    let service = GroupService::new(&state.db);
    let groups = service.list_groups(&claims.sub).await?;
    Ok(Json(groups))
}

#[utoipa::path(
    post,
    path = "/groups",
    request_body = CreateGroupRequest,
    responses(
        (status = 201, description = "Group created", body = GroupDto),
        (status = 400, description = "Bad Request", body = ProblemDetails),
        (status = 401, description = "Unauthorized", body = ProblemDetails),
        (status = 422, description = "Validation error", body = ProblemDetails)
    ),
    security(
        ("bearer_auth" = [])
    ),
    tag = "Groups"
)]
pub async fn create_group(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<CreateGroupRequest>,
) -> Result<impl IntoResponse, AppError> {
    let service = GroupService::new(&state.db);
    let group = service.create_group(&claims.sub, req).await?;
    Ok((StatusCode::CREATED, Json(group)))
}

#[utoipa::path(
    patch,
    path = "/groups/{id}",
    params(
        ("id" = String, Path, description = "Group ID")
    ),
    request_body = UpdateGroupRequest,
    responses(
        (status = 200, description = "Group updated", body = GroupDto),
        (status = 401, description = "Unauthorized", body = ProblemDetails),
        (status = 404, description = "Group not found", body = ProblemDetails),
        (status = 422, description = "Validation error", body = ProblemDetails)
    ),
    security(
        ("bearer_auth" = [])
    ),
    tag = "Groups"
)]
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

#[utoipa::path(
    delete,
    path = "/groups/{id}",
    params(
        ("id" = String, Path, description = "Group ID"),
        ("boards" = Option<String>, Query, description = "Behavior for boards in group: 'move' (default, remove group tag) or 'trash'")
    ),
    responses(
        (status = 204, description = "Group deleted successfully"),
        (status = 401, description = "Unauthorized", body = ProblemDetails),
        (status = 404, description = "Group not found", body = ProblemDetails)
    ),
    security(
        ("bearer_auth" = [])
    ),
    tag = "Groups"
)]
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
