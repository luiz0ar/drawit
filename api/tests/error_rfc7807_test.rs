use chrono::Utc;
use drawit_api::{
    error::{AppError, InvalidParam, ProblemDetails},
    models::Board,
};
use mongodb::bson::{from_document, to_document, DateTime as BsonDateTime};
use serde_json::Value;

#[test]
fn test_problem_details_concurrency_conflict_flattening() {
    let err = AppError::ConcurrencyConflict {
        server_revision: 42,
        instance: "/api/boards/b123/scene".to_string(),
    };

    let response = axum::response::IntoResponse::into_response(err);
    assert_eq!(response.status(), axum::http::StatusCode::CONFLICT);

    let content_type = response.headers().get("content-type").unwrap();
    assert_eq!(content_type, "application/problem+json");
}

#[test]
fn test_problem_details_json_structure() {
    let problem = ProblemDetails::new(
        409,
        "CONCURRENCY_CONFLICT",
        "Concurrency Conflict",
        "The scene was modified in another session.",
        "/api/boards/1/scene",
    )
    .with_extension("serverRevision", serde_json::json!(15));

    let json_str = serde_json::to_string(&problem).unwrap();
    let json_val: Value = serde_json::from_str(&json_str).unwrap();

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
    let params = vec![InvalidParam {
        name: "username".to_string(),
        reason: "Username must have at least 3 characters".to_string(),
    }];

    let problem = ProblemDetails::new(
        422,
        "VALIDATION_FAILED",
        "Validation failed",
        "The provided parameters are invalid.",
        "",
    )
    .with_invalid_params(params.clone());

    let json_str = serde_json::to_string(&problem).unwrap();
    let json_val: Value = serde_json::from_str(&json_str).unwrap();

    assert_eq!(json_val["status"], 422);
    assert_eq!(json_val["code"], "VALIDATION_FAILED");
    assert_eq!(json_val["invalid_params"][0]["name"], "username");
}

#[test]
fn test_board_bson_datetime_roundtrip() {
    let now = Utc::now();
    let board = Board {
        id: "b1".to_string(),
        owner_id: "u1".to_string(),
        group_id: None,
        title: "Quadro-1".to_string(),
        tags: vec!["system-design".to_string()],
        is_favorite: true,
        thumbnail: None,
        is_deleted: false,
        deleted_at: None,
        last_opened_at: Some(now),
        created_at: now,
        updated_at: now,
    };

    let mut bson_doc = to_document(&board).expect("Should serialize Board to BSON Document");
    // Simulate $set update with native BsonDateTime
    let later = BsonDateTime::from_millis(now.timestamp_millis() + 5000);
    bson_doc.insert("updated_at", later);
    bson_doc.insert("deleted_at", later);

    let decoded: Board = from_document(bson_doc)
        .expect("Should deserialize Board from BSON Document with BsonDateTime");
    assert_eq!(decoded.id, "b1");
    assert!(decoded.deleted_at.is_some());
}
