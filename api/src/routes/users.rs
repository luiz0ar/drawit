use axum::{
    extract::{Extension, State},
    response::IntoResponse,
    Json,
};
use mongodb::bson::doc;

use crate::{
    dto::UserDto,
    error::AppError,
    models::User,
    services::Claims,
    AppState,
};

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
        preferences: serde_json::to_value(user.preferences).unwrap(),
    }))
}
