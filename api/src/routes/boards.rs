use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;

use crate::{
    dto::{CreateBoardRequest, CreateVersionRequest, SaveSceneRequest, UpdateBoardRequest},
    error::AppError,
    services::{BoardService, Claims, ListBoardsFilter},
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct ListBoardsQuery {
    pub trash: Option<bool>,
    pub group_id: Option<String>,
    pub tags: Option<String>,
    pub q: Option<String>,
    pub favorite: Option<bool>,
    pub sort: Option<String>,
}

pub async fn list_boards(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Query(query): Query<ListBoardsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let board_service = BoardService::new(&state.db);
    let boards = board_service
        .list_boards(
            &claims.sub,
            ListBoardsFilter {
                trash: query.trash.unwrap_or(false),
                group_id: query.group_id,
                tags: query.tags,
                q: query.q,
                favorite: query.favorite,
                sort: query.sort,
            },
        )
        .await?;

    Ok(Json(boards))
}

pub async fn create_board(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<CreateBoardRequest>,
) -> Result<impl IntoResponse, AppError> {
    let board_service = BoardService::new(&state.db);
    let board = board_service.create_board(&claims.sub, req).await?;

    Ok((StatusCode::CREATED, Json(board)))
}

pub async fn get_board(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(board_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let board_service = BoardService::new(&state.db);
    let board = board_service.get_board(&claims.sub, &board_id).await?;

    Ok(Json(board))
}

pub async fn update_board(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(board_id): Path<String>,
    Json(req): Json<UpdateBoardRequest>,
) -> Result<impl IntoResponse, AppError> {
    let board_service = BoardService::new(&state.db);
    let board = board_service
        .update_board(&claims.sub, &board_id, req)
        .await?;

    Ok(Json(board))
}

pub async fn duplicate_board(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(board_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let board_service = BoardService::new(&state.db);
    let board = board_service
        .duplicate_board(&claims.sub, &board_id)
        .await?;

    Ok((StatusCode::CREATED, Json(board)))
}

pub async fn delete_board(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(board_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let board_service = BoardService::new(&state.db);
    board_service.soft_delete(&claims.sub, &board_id).await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn permanent_delete_board(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(board_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let board_service = BoardService::new(&state.db);
    board_service
        .permanent_delete(&claims.sub, &board_id)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn restore_board(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(board_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let board_service = BoardService::new(&state.db);
    board_service.restore_board(&claims.sub, &board_id).await?;

    Ok(StatusCode::OK)
}

pub async fn empty_trash(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<impl IntoResponse, AppError> {
    let board_service = BoardService::new(&state.db);
    let deleted_count = board_service.empty_trash(&claims.sub).await?;

    Ok(Json(serde_json::json!({
        "deleted_count": deleted_count
    })))
}

pub async fn list_tags(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<impl IntoResponse, AppError> {
    let board_service = BoardService::new(&state.db);
    let tags = board_service.list_tags(&claims.sub).await?;

    Ok(Json(tags))
}

pub async fn get_scene(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(board_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let board_service = BoardService::new(&state.db);
    let scene = board_service.get_scene(&claims.sub, &board_id).await?;

    Ok(Json(scene))
}

pub async fn save_scene(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(board_id): Path<String>,
    Json(req): Json<SaveSceneRequest>,
) -> Result<impl IntoResponse, AppError> {
    let board_service = BoardService::new(&state.db);
    let new_revision = board_service
        .save_scene(&claims.sub, &board_id, req)
        .await?;

    Ok(Json(serde_json::json!({
        "status": "saved",
        "revision": new_revision
    })))
}

pub async fn list_versions(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(board_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let board_service = BoardService::new(&state.db);
    let versions = board_service.list_versions(&claims.sub, &board_id).await?;

    Ok(Json(versions))
}

pub async fn create_version(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(board_id): Path<String>,
    Json(req): Json<CreateVersionRequest>,
) -> Result<impl IntoResponse, AppError> {
    let board_service = BoardService::new(&state.db);
    let version = board_service
        .create_version(&claims.sub, &board_id, req)
        .await?;

    Ok((StatusCode::CREATED, Json(version)))
}

pub async fn restore_version(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path((board_id, version_id)): Path<(String, String)>,
) -> Result<impl IntoResponse, AppError> {
    let board_service = BoardService::new(&state.db);
    let scene = board_service
        .restore_version(&claims.sub, &board_id, &version_id)
        .await?;

    Ok(Json(scene))
}

pub async fn list_components() -> Result<impl IntoResponse, AppError> {
    let catalog = serde_json::json!([
        { "key": "browser", "name": "Web Browser", "category": "clients", "defaultWidth": 100, "defaultHeight": 80 },
        { "key": "mobile", "name": "Mobile Device", "category": "clients", "defaultWidth": 70, "defaultHeight": 110 },
        { "key": "laptop", "name": "Desktop / Laptop", "category": "clients", "defaultWidth": 110, "defaultHeight": 80 },
        { "key": "user", "name": "User / Actor", "category": "clients", "defaultWidth": 70, "defaultHeight": 90 },
        { "key": "server", "name": "Server", "category": "backend", "defaultWidth": 90, "defaultHeight": 80 },
        { "key": "microservice", "name": "Microservice", "category": "backend", "defaultWidth": 100, "defaultHeight": 90 },
        { "key": "worker", "name": "Worker / Job", "category": "backend", "defaultWidth": 90, "defaultHeight": 80 },
        { "key": "api_gateway", "name": "API Gateway", "category": "backend", "defaultWidth": 100, "defaultHeight": 85 },
        { "key": "load_balancer", "name": "Load Balancer", "category": "backend", "defaultWidth": 100, "defaultHeight": 85 },
        { "key": "database", "name": "Database", "category": "data", "defaultWidth": 80, "defaultHeight": 90 },
        { "key": "cache", "name": "In-Memory Cache", "category": "data", "defaultWidth": 90, "defaultHeight": 80 },
        { "key": "object_storage", "name": "Object Storage", "category": "data", "defaultWidth": 90, "defaultHeight": 85 },
        { "key": "queue", "name": "Message Queue", "category": "messaging", "defaultWidth": 110, "defaultHeight": 60 },
        { "key": "event_stream", "name": "Event Stream / Bus", "category": "messaging", "defaultWidth": 120, "defaultHeight": 65 },
        { "key": "cloud", "name": "Cloud", "category": "infra", "defaultWidth": 120, "defaultHeight": 80 },
        { "key": "cdn", "name": "CDN", "category": "infra", "defaultWidth": 100, "defaultHeight": 80 },
        { "key": "firewall", "name": "Firewall / WAF", "category": "infra", "defaultWidth": 90, "defaultHeight": 85 },
        { "key": "container", "name": "Container", "category": "infra", "defaultWidth": 95, "defaultHeight": 80 },
        { "key": "kubernetes", "name": "Kubernetes Cluster", "category": "infra", "defaultWidth": 100, "defaultHeight": 90 }
    ]);

    Ok(Json(catalog))
}
