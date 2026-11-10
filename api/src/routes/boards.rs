use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;

use crate::{
    dto::{CreateBoardRequest, SaveSceneRequest, UpdateBoardRequest},
    error::AppError,
    services::{BoardService, Claims},
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct ListBoardsQuery {
    pub trash: Option<bool>,
}

pub async fn list_boards(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Query(query): Query<ListBoardsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let board_service = BoardService::new(&state.db);
    let boards = board_service
        .list_boards(&claims.sub, query.trash.unwrap_or(false))
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

pub async fn delete_board(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(board_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let board_service = BoardService::new(&state.db);
    board_service.soft_delete(&claims.sub, &board_id).await?;

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
        .save_scene(
            &claims.sub,
            &board_id,
            req.revision,
            req.elements,
            req.viewport,
            req.content_hash,
            req.last_client_save_id,
        )
        .await?;

    Ok(Json(serde_json::json!({
        "status": "saved",
        "revision": new_revision
    })))
}

