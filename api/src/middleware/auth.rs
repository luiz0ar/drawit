use axum::{extract::State, http::header, middleware::Next, response::Response};

use crate::{error::AppError, services::TokenService, AppState};

pub async fn require_auth(
    State(state): State<AppState>,
    mut req: axum::extract::Request,
    next: Next,
) -> Result<Response, AppError> {
    let auth_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing Authorization header.".to_string()))?;

    if !auth_header.starts_with("Bearer ") {
        return Err(AppError::Unauthorized(
            "Invalid authorization token format. Expected 'Bearer <token>'.".to_string(),
        ));
    }

    let token = &auth_header[7..];
    let token_service = TokenService::new(
        state.config.jwt_secret.clone(),
        state.config.jwt_expiration_minutes,
    );

    let claims = token_service.verify_access_token(token)?;
    req.extensions_mut().insert(claims);

    Ok(next.run(req).await)
}
