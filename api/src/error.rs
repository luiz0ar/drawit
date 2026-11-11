use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;
use utoipa::ToSchema;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ProblemDetails {
    pub r#type: String,
    pub title: String,
    pub status: u16,
    pub detail: String,
    pub instance: String,
    pub code: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub invalid_params: Option<Vec<InvalidParam>>,

    /// Flattened RFC 7807 / RFC 9457 extensions serialized directly into the root JSON object.
    /// Allows custom domain metadata such as `serverRevision` in 409 OCC conflicts.
    #[serde(flatten, default, skip_serializing_if = "HashMap::is_empty")]
    pub extensions: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, PartialEq, Eq)]
pub struct InvalidParam {
    pub name: String,
    pub reason: String,
}

impl ProblemDetails {
    pub fn new(
        status: u16,
        code: impl Into<String>,
        title: impl Into<String>,
        detail: impl Into<String>,
        instance: impl Into<String>,
    ) -> Self {
        let code_str = code.into();
        Self {
            r#type: format!(
                "https://drawit.app/errors/{}",
                code_str.to_lowercase().replace('_', "-")
            ),
            title: title.into(),
            status,
            detail: detail.into(),
            instance: instance.into(),
            code: code_str,
            invalid_params: None,
            extensions: HashMap::new(),
        }
    }

    pub fn with_extension(
        mut self,
        key: impl Into<String>,
        value: impl Into<serde_json::Value>,
    ) -> Self {
        self.extensions.insert(key.into(), value.into());
        self
    }

    pub fn with_invalid_params(mut self, params: Vec<InvalidParam>) -> Self {
        self.invalid_params = Some(params);
        self
    }
}

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Resource not found: {0}")]
    NotFound(String),

    #[error("Validation failed")]
    Validation(Vec<InvalidParam>),

    #[error("Concurrency conflict: server revision is {server_revision}")]
    ConcurrencyConflict {
        server_revision: u64,
        instance: String,
    },

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Email not verified for {email}")]
    EmailNotVerified { email: String },

    #[error("Bad Request: {0}")]
    BadRequest(String),

    #[error("Too many requests, retry after {retry_after_seconds}s")]
    TooManyRequests { retry_after_seconds: u64 },

    #[error("Internal server error: {0}")]
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, problem) = match self {
            AppError::ConcurrencyConflict {
                server_revision,
                instance,
            } => (
                StatusCode::CONFLICT,
                ProblemDetails::new(
                    409,
                    "CONCURRENCY_CONFLICT",
                    "Concurrency Conflict",
                    "The scene was updated in another session. Please reload the latest revision.",
                    instance,
                )
                .with_extension("serverRevision", serde_json::json!(server_revision)),
            ),
            AppError::NotFound(detail) => (
                StatusCode::NOT_FOUND,
                ProblemDetails::new(404, "NOT_FOUND", "Resource Not Found", detail, ""),
            ),
            AppError::Validation(params) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                ProblemDetails::new(
                    422,
                    "VALIDATION_FAILED",
                    "Validation Failed",
                    "Invalid input parameters provided.",
                    "",
                )
                .with_invalid_params(params),
            ),
            AppError::Unauthorized(detail) => (
                StatusCode::UNAUTHORIZED,
                ProblemDetails::new(401, "UNAUTHORIZED", "Unauthorized", detail, ""),
            ),
            AppError::Forbidden(detail) => (
                StatusCode::FORBIDDEN,
                ProblemDetails::new(403, "FORBIDDEN", "Forbidden", detail, ""),
            ),
            AppError::BadRequest(detail) => (
                StatusCode::BAD_REQUEST,
                ProblemDetails::new(400, "BAD_REQUEST", "Bad Request", detail, ""),
            ),
            AppError::EmailNotVerified { email } => (
                StatusCode::FORBIDDEN,
                ProblemDetails::new(
                    403,
                    "EMAIL_NOT_VERIFIED",
                    "Email Not Verified",
                    "Please verify your email address before logging in.",
                    "",
                )
                .with_extension("email", serde_json::json!(email)),
            ),
            AppError::TooManyRequests {
                retry_after_seconds,
            } => {
                let problem = ProblemDetails::new(
                    429,
                    "TOO_MANY_REQUESTS",
                    "Too Many Requests",
                    format!(
                        "Please wait {} seconds before retrying.",
                        retry_after_seconds
                    ),
                    "",
                )
                .with_extension("retryAfter", serde_json::json!(retry_after_seconds));

                return (
                    StatusCode::TOO_MANY_REQUESTS,
                    [
                        ("content-type", "application/problem+json".to_string()),
                        ("retry-after", retry_after_seconds.to_string()),
                    ],
                    Json(problem),
                )
                    .into_response();
            }
            AppError::Internal(err) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                ProblemDetails::new(500, "INTERNAL_ERROR", "Internal Server Error", err, ""),
            ),
        };

        (
            status,
            [("content-type", "application/problem+json")],
            Json(problem),
        )
            .into_response()
    }
}
