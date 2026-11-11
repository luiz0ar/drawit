use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
};
use mongodb::bson::doc;
use serde_json::json;

use crate::{error::AppError, AppState};

/// Healthcheck endpoint
#[utoipa::path(
    get,
    path = "/health",
    responses(
        (status = 200, description = "Service is alive and healthy")
    ),
    tag = "Health"
)]
pub async fn health() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({ "status": "ok" })))
}

/// Readiness check endpoint (verifies MongoDB connectivity)
#[utoipa::path(
    get,
    path = "/ready",
    responses(
        (status = 200, description = "Service dependencies are healthy and ready to accept traffic"),
        (status = 500, description = "Service dependency unavailable")
    ),
    tag = "Health"
)]
pub async fn ready(State(state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    match state.db.run_command(doc! { "ping": 1 }).await {
        Ok(_) => Ok((
            StatusCode::OK,
            Json(json!({
                "status": "ready",
                "database": "connected"
            })),
        )),
        Err(err) => Err(AppError::Internal(format!(
            "Failed to connect to MongoDB: {}",
            err
        ))),
    }
}
