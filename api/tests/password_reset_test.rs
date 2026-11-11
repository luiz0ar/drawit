use axum::http::StatusCode;
use axum::response::IntoResponse;
use drawit_api::{
    dto::{ForgotPasswordRequest, ResetPasswordRequest},
    error::AppError,
    services::{
        mailer::{Mailer, MockMailer},
        verification_service::VerificationService,
    },
};

#[test]
fn test_bad_request_problem_details_response() {
    let err = AppError::BadRequest("Invalid or expired password reset link.".to_string());
    let response = err.into_response();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    let content_type = response.headers().get("content-type").unwrap();
    assert_eq!(content_type, "application/problem+json");
}

#[test]
fn test_forgot_password_request_deserialization() {
    let json_data = r#"{"email": "user@example.com"}"#;
    let req: ForgotPasswordRequest = serde_json::from_str(json_data).unwrap();
    assert_eq!(req.email, "user@example.com");
}

#[test]
fn test_reset_password_request_deserialization_camel_case() {
    let json_data = r#"{
        "token": "secret_reset_token_12345",
        "new_password": "NewStrongP@ssw0rd123!",
        "confirmPassword": "NewStrongP@ssw0rd123!"
    }"#;
    let req: ResetPasswordRequest = serde_json::from_str(json_data).unwrap();
    assert_eq!(req.token, "secret_reset_token_12345");
    assert_eq!(req.new_password, "NewStrongP@ssw0rd123!");
    assert_eq!(req.confirm_password, "NewStrongP@ssw0rd123!");
}

#[tokio::test]
async fn test_mock_mailer_send_password_reset() {
    let mailer = MockMailer::default();
    let res = mailer
        .send_password_reset_email(
            "alice@example.com",
            "http://localhost:3000/reset-password?token=mocktoken123",
        )
        .await;

    assert!(res.is_ok());
    let sent = mailer.sent_reset_emails.lock().await;
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].0, "alice@example.com");
    assert!(sent[0].1.contains("token=mocktoken123"));
}

#[test]
fn test_password_reset_token_hash() {
    let raw = "abcdef1234567890abcdef1234567890";
    let hash = VerificationService::hash_token(raw);
    assert_eq!(hash.len(), 64);
    assert_eq!(hash, VerificationService::hash_token(raw));
}
