use axum::{
    extract::{Extension, State},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};

use crate::{
    dto::{ChangePasswordRequest, LoginRequest, RegisterRequest},
    error::AppError,
    services::{AuthService, Claims},
    AppState,
};

fn extract_refresh_token_from_cookies(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|cookie| {
            let (name, value) = cookie.trim().split_once('=')?;
            if name == "refresh_token" {
                Some(value.to_string())
            } else {
                None
            }
        })
}

fn build_refresh_cookie(raw_token: &str, max_age_days: i64) -> String {
    format!(
        "refresh_token={}; HttpOnly; SameSite=Lax; Path=/auth; Max-Age={}",
        raw_token,
        max_age_days * 24 * 3600
    )
}

fn build_clear_refresh_cookie() -> String {
    "refresh_token=; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=0".to_string()
}

pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<RegisterRequest>,
) -> Result<impl IntoResponse, AppError> {
    let auth_service = AuthService::new(&state.db, &state.config);
    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok().map(|s| s.to_string()));

    let (response, raw_refresh_token) = auth_service.register(req, user_agent).await?;
    let cookie_header = build_refresh_cookie(
        &raw_refresh_token,
        state.config.refresh_token_expiration_days,
    );

    Ok((
        StatusCode::CREATED,
        [(header::SET_COOKIE, cookie_header)],
        Json(response),
    ))
}

pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<LoginRequest>,
) -> Result<impl IntoResponse, AppError> {
    let auth_service = AuthService::new(&state.db, &state.config);
    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok().map(|s| s.to_string()));

    let login_result = auth_service.login(req, user_agent).await;

    // Security: fixed delay to mitigate automated brute-force attacks and timing analysis
    if state.config.login_delay_ms > 0 {
        tokio::time::sleep(tokio::time::Duration::from_millis(
            state.config.login_delay_ms,
        ))
        .await;
    }

    let (response, raw_refresh_token) = login_result?;
    let cookie_header = build_refresh_cookie(
        &raw_refresh_token,
        state.config.refresh_token_expiration_days,
    );

    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, cookie_header)],
        Json(response),
    ))
}

pub async fn refresh(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let raw_token = extract_refresh_token_from_cookies(&headers)
        .ok_or_else(|| AppError::Unauthorized("Missing refresh token cookie.".to_string()))?;

    let auth_service = AuthService::new(&state.db, &state.config);
    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok().map(|s| s.to_string()));

    let (response, new_raw_token) = auth_service.refresh(raw_token, user_agent).await?;
    let cookie_header =
        build_refresh_cookie(&new_raw_token, state.config.refresh_token_expiration_days);

    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, cookie_header)],
        Json(response),
    ))
}

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    if let Some(raw_token) = extract_refresh_token_from_cookies(&headers) {
        let auth_service = AuthService::new(&state.db, &state.config);
        let _ = auth_service.logout(raw_token).await;
    }

    let cookie_header = build_clear_refresh_cookie();
    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, cookie_header)],
        Json(serde_json::json!({ "message": "Logged out successfully." })),
    ))
}

pub async fn logout_all(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<impl IntoResponse, AppError> {
    let auth_service = AuthService::new(&state.db, &state.config);
    auth_service.logout_all(&claims.sub).await?;

    let cookie_header = build_clear_refresh_cookie();
    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, cookie_header)],
        Json(serde_json::json!({ "message": "All sessions logged out successfully." })),
    ))
}

pub async fn change_password(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<ChangePasswordRequest>,
) -> Result<impl IntoResponse, AppError> {
    let auth_service = AuthService::new(&state.db, &state.config);
    auth_service.change_password(&claims.sub, req).await?;

    let cookie_header = build_clear_refresh_cookie();
    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, cookie_header)],
        Json(serde_json::json!({ "message": "Password updated successfully." })),
    ))
}
