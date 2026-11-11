use axum::{
    extract::{Extension, State},
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use mongodb::bson::{doc, DateTime as BsonDateTime};

use crate::{
    dto::{UpdatePreferencesRequest, UserDto},
    error::AppError,
    models::User,
    services::Claims,
    AppState,
};

#[utoipa::path(
    get,
    path = "/users/me",
    responses(
        (status = 200, description = "Current authenticated user profile", body = UserDto),
        (status = 401, description = "Unauthorized", body = ProblemDetails),
        (status = 404, description = "User not found", body = ProblemDetails)
    ),
    security(
        ("bearer_auth" = [])
    ),
    tag = "Users"
)]
pub async fn me(
    Extension(claims): Extension<Claims>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let users_col = state.db.collection::<User>("users");
    let user = users_col
        .find_one(doc! { "_id": &claims.sub })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("User not found.".to_string()))?;

    Ok(Json(UserDto {
        id: user.id,
        username: user.username,
        email: user.email,
        email_verified: user.email_verified,
        preferences: serde_json::to_value(user.preferences).unwrap(),
    }))
}

#[utoipa::path(
    patch,
    path = "/users/preferences",
    request_body = UpdatePreferencesRequest,
    responses(
        (status = 200, description = "User preferences updated", body = UserDto),
        (status = 401, description = "Unauthorized", body = ProblemDetails),
        (status = 404, description = "User not found", body = ProblemDetails),
        (status = 422, description = "Validation error", body = ProblemDetails)
    ),
    security(
        ("bearer_auth" = [])
    ),
    tag = "Users"
)]
pub async fn update_preferences(
    Extension(claims): Extension<Claims>,
    State(state): State<AppState>,
    Json(req): Json<UpdatePreferencesRequest>,
) -> Result<impl IntoResponse, AppError> {
    let users_col = state.db.collection::<User>("users");
    let mut set_doc = doc! {
        "updated_at": BsonDateTime::from_millis(Utc::now().timestamp_millis())
    };

    if let Some(theme) = req.theme {
        set_doc.insert("preferences.theme", theme);
    }
    if let Some(language) = req.language {
        set_doc.insert("preferences.language", language);
    }

    users_col
        .update_one(doc! { "_id": &claims.sub }, doc! { "$set": set_doc })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let user = users_col
        .find_one(doc! { "_id": &claims.sub })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("User not found.".to_string()))?;

    Ok(Json(UserDto {
        id: user.id,
        username: user.username,
        email: user.email,
        email_verified: user.email_verified,
        preferences: serde_json::to_value(user.preferences).unwrap(),
    }))
}
