pub mod config;
pub mod db;
pub mod dto;
pub mod error;
pub mod middleware;
pub mod models;
pub mod routes;
pub mod services;

use axum::{
    http::{header, HeaderValue, Method},
    middleware::from_fn_with_state,
    routing::{get, post},
    Router,
};
use mongodb::Database;
use std::sync::Arc;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    limit::RequestBodyLimitLayer,
    trace::TraceLayer,
};

pub use config::AppConfig;

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub config: Arc<AppConfig>,
}

pub fn create_router(state: AppState) -> Router {
    let allowed_origin = state
        .config
        .frontend_origin
        .parse::<HeaderValue>()
        .unwrap_or_else(|_| HeaderValue::from_static("http://localhost:3000"));

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::exact(allowed_origin))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::AUTHORIZATION,
            header::ACCEPT,
            header::CONTENT_TYPE,
            header::HeaderName::from_static("x-request-id"),
        ])
        .allow_credentials(true);

    // Rotas protegidas por JWT
    let protected_routes = Router::new()
        .route("/auth/me", get(routes::users::me))
        .layer(from_fn_with_state(state.clone(), middleware::require_auth));

    // Rotas públicas
    let public_routes = Router::new()
        .route("/health", get(routes::health::health))
        .route("/ready", get(routes::health::ready))
        .route("/auth/register", post(routes::auth::register))
        .route("/auth/login", post(routes::auth::login))
        .route("/auth/refresh", post(routes::auth::refresh))
        .route("/auth/logout", post(routes::auth::logout));

    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .layer(RequestBodyLimitLayer::new(16 * 1024 * 1024))
        .with_state(state)
}
