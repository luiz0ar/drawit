use axum::http::StatusCode;
use axum::response::IntoResponse;
use drawit_api::{
    dto::{LoginRequest, RegisterRequest},
    error::AppError,
    services::{
        mailer::{Mailer, MockMailer},
        mq::{MessagePublisher, MockPublisher},
        verification_service::VerificationService,
    },
};

#[test]
fn test_email_not_verified_error_response() {
    let err = AppError::EmailNotVerified {
        email: "alice@example.com".to_string(),
    };

    let response = err.into_response();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let content_type = response.headers().get("content-type").unwrap();
    assert_eq!(content_type, "application/problem+json");
}

#[test]
fn test_too_many_requests_retry_after_header() {
    let err = AppError::TooManyRequests {
        retry_after_seconds: 90,
    };

    let response = err.into_response();
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);

    let retry_after = response.headers().get("retry-after").unwrap();
    assert_eq!(retry_after, "90");
}

#[test]
fn test_verification_token_hash_deterministic() {
    let token = "test_token_1234567890_abcdef";
    let hash1 = VerificationService::hash_token(token);
    let hash2 = VerificationService::hash_token(token);

    assert_eq!(hash1, hash2);
    assert_eq!(hash1.len(), 64); // 256 bits = 64 hex chars
}

#[test]
fn test_register_request_deserialization_camel_case() {
    let json_data = r#"{
        "username": "johndoe",
        "email": "john@example.com",
        "password": "Password123!",
        "confirmPassword": "Password123!"
    }"#;

    let req: RegisterRequest = serde_json::from_str(json_data).expect("Should deserialize");
    assert_eq!(req.username, "johndoe");
    assert_eq!(req.email, "john@example.com");
    assert_eq!(req.confirm_password, "Password123!");
}

#[test]
fn test_login_request_deserialization_with_email() {
    let json_data = r#"{
        "email": "john@example.com",
        "password": "Password123!"
    }"#;

    let req: LoginRequest = serde_json::from_str(json_data).expect("Should deserialize");
    assert_eq!(req.email, "john@example.com");
    assert_eq!(req.password, "Password123!");
}

#[tokio::test]
async fn test_mock_publisher_and_mailer() {
    let publisher = MockPublisher::default();
    publisher
        .publish_verification_requested("v123", "u123", "user@domain.com")
        .await
        .expect("Mock publish should succeed");

    let events = publisher.published_events.lock().await;
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].verification_id, "v123");
    assert_eq!(events[0].email, "user@domain.com");

    let mailer = MockMailer::default();
    mailer
        .send_verification_email("user@domain.com", "https://drawit.app/verify?token=xyz")
        .await
        .expect("Mock mailer should succeed");

    let sent = mailer.sent_emails.lock().await;
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].0, "user@domain.com");
    assert!(sent[0].1.contains("token=xyz"));
}
