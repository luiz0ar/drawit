pub mod config;
pub mod db;
pub mod docs;
pub mod dto;
pub mod error;
pub mod middleware;
pub mod models;
pub mod routes;
pub mod services;
pub mod worker;

use axum::{
    http::{header, HeaderValue, Method},
    middleware::from_fn_with_state,
    routing::{delete, get, patch, post, put},
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
    pub publisher: Arc<dyn services::mq::MessagePublisher>,
    pub verification_service: Arc<services::verification_service::VerificationService>,
    pub mailer: Arc<dyn services::mailer::Mailer>,
}

pub fn create_router(state: AppState) -> Router {
    let allowed_origins: Vec<HeaderValue> = state
        .config
        .frontend_origin
        .split(',')
        .filter_map(|s| s.trim().parse::<HeaderValue>().ok())
        .collect();

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(if allowed_origins.is_empty() {
            vec![HeaderValue::from_static("http://localhost:3000")]
        } else {
            allowed_origins
        }))
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

    // Protected routes requiring valid Bearer JWT
    let protected_routes = Router::new()
        .route("/auth/me", get(routes::users::me))
        .route("/auth/logout-all", post(routes::auth::logout_all))
        .route("/auth/password", patch(routes::auth::change_password))
        .route(
            "/users/me/preferences",
            patch(routes::users::update_preferences),
        )
        .route("/boards", get(routes::boards::list_boards))
        .route("/boards", post(routes::boards::create_board))
        .route("/boards/:id", get(routes::boards::get_board))
        .route("/boards/:id", patch(routes::boards::update_board))
        .route("/boards/:id", delete(routes::boards::delete_board))
        .route(
            "/boards/:id/permanent",
            delete(routes::boards::permanent_delete_board),
        )
        .route("/boards/:id/restore", post(routes::boards::restore_board))
        .route(
            "/boards/:id/duplicate",
            post(routes::boards::duplicate_board),
        )
        .route("/boards/:id/scene", get(routes::boards::get_scene))
        .route("/boards/:id/scene", put(routes::boards::save_scene))
        .route("/boards/:id/versions", get(routes::boards::list_versions))
        .route("/boards/:id/versions", post(routes::boards::create_version))
        .route(
            "/boards/:id/versions/:version_id/restore",
            post(routes::boards::restore_version),
        )
        .route("/trash/empty", post(routes::boards::empty_trash))
        .route("/trash", delete(routes::boards::empty_trash))
        .route("/tags", get(routes::boards::list_tags))
        .route("/groups", get(routes::groups::list_groups))
        .route("/groups", post(routes::groups::create_group))
        .route("/groups/:id", patch(routes::groups::update_group))
        .route("/groups/:id", delete(routes::groups::delete_group))
        .route_layer(from_fn_with_state(state.clone(), middleware::require_auth));

    // Public routes
    let public_routes = Router::new()
        .route("/health", get(routes::health::health))
        .route("/ready", get(routes::health::ready))
        .route("/components", get(routes::boards::list_components))
        .route("/auth/register", post(routes::auth::register))
        .route("/auth/login", post(routes::auth::login))
        .route("/auth/verify-email", post(routes::auth::verify_email))
        .route(
            "/auth/resend-verification",
            post(routes::auth::resend_verification),
        )
        .route("/auth/refresh", post(routes::auth::refresh))
        .route("/auth/logout", post(routes::auth::logout));

    let mut app = Router::new().merge(public_routes).merge(protected_routes);

    if state.config.env == "development" {
        use utoipa::OpenApi;
        use utoipa_scalar::{Scalar, Servable};
        app = app.merge(Scalar::with_url("/scalar", docs::ApiDoc::openapi()));
    }

    app.layer(TraceLayer::new_for_http())
        .layer(cors)
        .layer(RequestBodyLimitLayer::new(16 * 1024 * 1024))
        .with_state(state)
}
