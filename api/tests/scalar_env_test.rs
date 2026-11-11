use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use drawit_api::{
    config::AppConfig,
    create_router,
    services::{mailer::MockMailer, mq::MockPublisher, verification_service::VerificationService},
    AppState,
};
use mongodb::Client;
use tower::ServiceExt;

async fn build_test_state(env_name: &str) -> AppState {
    let mut config = AppConfig::from_env();
    config.env = env_name.to_string();

    let client = Client::with_uri_str("mongodb://127.0.0.1:27017")
        .await
        .expect("mongodb client");
    let db = client.database("drawit_test");
    let config_arc = Arc::new(config);
    let publisher = Arc::new(MockPublisher::default());
    let mailer = Arc::new(MockMailer::default());
    let verification_service = Arc::new(VerificationService::new(&db, publisher.clone(), 24, 60));

    AppState {
        db,
        config: config_arc,
        publisher,
        verification_service,
        mailer,
    }
}

#[tokio::test]
async fn test_scalar_route_active_in_development() {
    let state = build_test_state("development").await;
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/scalar")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_scalar_route_not_found_in_production() {
    let state = build_test_state("production").await;
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/scalar")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    assert_eq!(status, StatusCode::NOT_FOUND);
}
