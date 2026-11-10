use drawit_api::error::{AppError, InvalidParam, ProblemDetails};
use serde_json::Value;

#[test]
fn test_problem_details_concurrency_conflict_flattening() {
    let err = AppError::ConcurrencyConflict {
        server_revision: 42,
        instance: "/api/boards/b123/scene".to_string(),
    };

    let response = axum::response::IntoResponse::into_response(err);
    assert_eq!(response.status(), axum::http::StatusCode::CONFLICT);

    // Valida headers
    let content_type = response.headers().get("content-type").unwrap();
    assert_eq!(content_type, "application/problem+json");
}

#[test]
fn test_problem_details_json_structure() {
    let problem = ProblemDetails::new(
        409,
        "CONCURRENCY_CONFLICT",
        "Conflito de Concorrência",
        "A cena foi modificada em outra sessão.",
        "/api/boards/1/scene",
    )
    .with_extension("serverRevision", serde_json::json!(15));

    let json_str = serde_json::to_string(&problem).unwrap();
    let json_val: Value = serde_json::from_str(&json_str).unwrap();

    // serverRevision deve estar achatado no nó raiz
    assert_eq!(json_val["serverRevision"], 15);
    assert_eq!(json_val["status"], 409);
    assert_eq!(json_val["code"], "CONCURRENCY_CONFLICT");
    assert_eq!(
        json_val["type"],
        "https://drawit.app/errors/concurrency-conflict"
    );
}

#[test]
fn test_validation_error_with_invalid_params() {
    let params = vec![
        InvalidParam {
            name: "username".to_string(),
            reason: "Username deve ter no mínimo 3 caracteres".to_string(),
        },
    ];

    let problem = ProblemDetails::new(
        422,
        "VALIDATION_FAILED",
        "Falha de validação",
        "Os parâmetros informados são inválidos.",
        "",
    )
    .with_invalid_params(params.clone());

    let json_str = serde_json::to_string(&problem).unwrap();
    let json_val: Value = serde_json::from_str(&json_str).unwrap();

    assert_eq!(json_val["status"], 422);
    assert_eq!(json_val["code"], "VALIDATION_FAILED");
    assert_eq!(json_val["invalid_params"][0]["name"], "username");
}

