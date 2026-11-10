# Handoff Report — explorer_fix_2: Backend, Security & Persistence Fix Strategy

## Executive Summary
This report defines the exact technical specification and concrete implementation fixes for the 4 critical backend, security, and persistence issues identified by `challenger_2`. These recommendations provide full drop-in technical replacements for the corresponding tasks in `.agent/plano_de_implementacao.md`, ensuring compliance with **RNF-SEC03** (Strict Multi-Tenant Isolation), **RFC 7807 / RFC 9457** (Problem Details Extensibility), **Tokio Non-Blocking Asynchronous Runtime Best Practices**, and **MongoDB Lifecycle Consistency** (Zero TOCTOU and Zero Storage Leak).

---

## 1. Observation

Direct observations from `.agent/plano_de_implementacao.md` and `.agents/teamwork/challenger_2/handoff.md`:

### 1.1 Multi-Tenant Isolation & OCC Query Defect
- **Tarefa 0.4 (Line 169)**:
  ```markdown
  - `board_scenes`: `{ "_id": 1 }` (chave primária correspondente ao `boardId`).
  ```
  `board_scenes` does not declare `ownerId` in its schema or secondary indexes.
- **Tarefa 3.6 (Lines 707–714)**:
  ```rust
  let filter = doc! { "_id": board_id, "revision": payload.revision };
  let update = doc! {
      "$set": { "viewport": to_bson(&payload.viewport)?, "elements": to_bson(&payload.elements)?, "updatedAt": BsonDateTime::now() },
      "$inc": { "revision": 1 }
  };
  let result = scene_collection.update_one(filter, update, None).await?;
  ```
  The OCC filter only validates `_id` and `revision`. If user A knows or guesses user B's `board_id`, user A can overwrite user B's canvas scene with valid JSON and matching revision.

### 1.2 RFC 7807 Extensibility Serialization Defect
- **Tarefa 0.2 (Lines 109–120)**:
  ```rust
  #[derive(Serialize, ToSchema)]
  pub struct ProblemDetails {
      pub r#type: String,
      pub title: String,
      pub status: u16,
      pub detail: String,
      pub instance: String,
      pub code: String,
      #[serde(skip_serializing_if = "Option::is_none")]
      pub invalid_params: Option<Vec<InvalidParam>>,
  }
  ```
- **Tarefa 3.6 (Line 716)**:
  Claims the endpoint returns HTTP 409 Conflict containing `{ "code": "CONCURRENCY_CONFLICT", "serverRevision": R_servidor }`. Because `ProblemDetails` has a rigid struct definition without dynamic extension fields, serde cannot serialize `"serverRevision"` at the root of the JSON payload.

### 1.3 CPU Starvation via Argon2id on Tokio Worker Threads
- **Tarefa 0.5 (Lines 183–186)**:
  ```markdown
  - Hashing seguro de senhas com `argon2` (Argon2id: m=65536, t=3, p=4) com salt CSPRNG de 16 bytes.
  ```
  Argon2id hashing and verification are executed synchronously inside async handlers without specifying offloading to `tokio::task::spawn_blocking`. Computing Argon2id with 64 MiB RAM and 3 iterations consumes 100% CPU on 4 cores for 50–150ms per request, directly blocking Tokio's worker threads and starving async tasks (`/health`, `/ready`, autosaves).

### 1.4 Purge Worker TOCTOU Race Condition & Storage Leak
- **Tarefa 3.5 (Lines 677–685)**:
  ```rust
  let cutoff = Utc::now() - Duration::days(30);
  let query = doc! { "isDeleted": true, "deletedAt": { "$lte": cutoff } };
  // Remove em lote documentos de boards e board_scenes
  ```
  1. **Storage Leak**: `board_versions` (Spec §6.1) is omitted from deletion, leaving snapshots orphaned indefinitely.
  2. **TOCTOU Race Condition**: Querying candidate documents and performing separate batch deletions creates a race condition against `POST /api/boards/:id/restore`. If a user restores a board between the query and deletion, the board and scene are permanently wiped after the user received a 200 OK confirmation.

---

## 2. Logic Chain

### 2.1 Multi-Tenant Isolation & Concurrency Disambiguation (Tasks 0.4 & 3.6)
1. Per **RNF-SEC03**, every database read and write must be isolated by `ownerId` extracted from the authenticated JWT session (`sub`), never trusting client-supplied IDs.
2. In MongoDB, documents in `board_scenes` have `_id == boardId`. Adding `ownerId: String` to `board_scenes` allows querying `{ "_id": board_id, "ownerId": current_user_id, "revision": payload.revision }`.
3. In `PUT /api/boards/:id/scene`, if `result.matched_count == 1`, the update is atomic, secure, and authenticated. In addition, `boards.updatedAt` must be touched (`update_one({ "_id": board_id, "ownerId": current_user_id }, { "$set": { "updatedAt": now } })`) so the board moves to the top of the dashboard.
4. If `result.matched_count == 0`, the server must distinguish between two different conditions to prevent security enumeration and misleading error codes:
   - **Condition A (Tenant / Existence Mismatch)**: Query `scene_collection.find_one({ "_id": board_id, "ownerId": current_user_id })`. If `None`, return **HTTP 404 Not Found** (`BOARD_NOT_FOUND`). This prevents user A from knowing whether user B's `board_id` exists.
   - **Condition B (Revision Mismatch)**: If `Some(current_scene)`, the document belongs to the user, but `revision` was outdated. Return **HTTP 409 Conflict** (`CONCURRENCY_CONFLICT`) with `"serverRevision": current_scene.revision`.

### 2.2 RFC 7807 / RFC 9457 Flattened Extension Fields (Task 0.2)
1. RFC 7807 Section 3.2 and RFC 9457 Section 3.2 define "Extension Members" as custom JSON members directly in the problem details object.
2. Serde supports open key-value maps at the root level via `#[serde(flatten)]`.
3. Adding `#[serde(flatten, default, skip_serializing_if = "HashMap::is_empty")] pub extensions: HashMap<String, serde_json::Value>` guarantees:
   - Zero overhead for standard RFC 7807 responses (empty map is skipped).
   - Arbitrary typed extensions like `"serverRevision": current_scene.revision` serialize at the top-level of the JSON response.
   - Compile-time safety and automatic serialization via `axum::Json(problem)`.

### 2.3 CPU Thread Pool Isolation via `spawn_blocking` (Task 0.5)
1. Tokio runtime default worker threads = number of CPU cores.
2. Password hashing with `Argon2id (m=65536, t=3, p=4)` is a CPU-bound, blocking cryptographic operation.
3. Running blocking operations on Tokio worker threads causes thread starvation: a burst of 5–10 concurrent requests blocks all async threads, spiking latency on high-frequency async endpoints.
4. Offloading to `tokio::task::spawn_blocking(move || ...)` shifts execution to Tokio's dedicated blocking pool (up to 512 threads by default), keeping async event loop threads free.
5. In addition, multi-tab refresh token rotation requires:
   - Atomic CAS via `find_one_and_update` with `{ "tokenHash": hash, "revokedAt": null }`.
   - A **30-second Grace Window**: If a token revoked within the last 30 seconds is presented with `replacedBy`, return the active token instead of falsely triggering `TOKEN_REUSE_DETECTED`.

### 2.4 Cascade Cleanup & Anti-TOCTOU Purge Worker (Task 3.5)
1. In MongoDB without replica sets (`standalone`), multi-document transactions are not available.
2. To prevent TOCTOU race conditions with `POST /api/boards/:id/restore`, the deletion must be conditional at the moment of execution:
   `boards_col.delete_one(doc! { "_id": board_id, "isDeleted": true, "deletedAt": { "$lte": cutoff } })`.
3. If `delete_one.deleted_count == 1`:
   - The board was guaranteed to be in trash with `deletedAt <= cutoff` at the moment of deletion.
   - Now safely delete associated documents from `board_scenes` (`delete_one({ "_id": board_id })`) and `board_versions` (`delete_many({ "boardId": board_id })`).
4. If `delete_one.deleted_count == 0`:
   - The user restored the board (or it was already purged). The worker aborts deletion of scenes and versions for that board.
5. In `POST /api/trash/empty`, cascade delete across `boards`, `board_scenes`, and `board_versions` filtered by `ownerId: current_user_id`, eliminating all orphaned version snapshots.

---

## 3. Caveats

1. **Planning Phase Invariance**: Drawing code or application files in `api/` or `web/` must not be authored until the user approves the amended plan.
2. **MongoDB Replica Set Considerations**: Standalone MongoDB in Docker cannot use `ClientSession::start_transaction`. The proposed atomic CAS operations (`update_one`, `delete_one` with conditional filter, `find_one_and_update`) are single-document atomic and work on standalone MongoDB and replica sets alike.
3. **Argon2id Memory Bounds**: Each `spawn_blocking` thread running Argon2id consumes 64 MiB RAM. A concurrent rate limit (e.g. Tower `GovernorLayer` or `RateLimitLayer` with 5 req/min per IP) on `/auth/login` and `/auth/register` is essential to prevent memory exhaustion under DDoS.

---

## 4. Conclusion & Concrete Implementation Specifications

### 4.1 Fix 1: Tarefa 0.4 & Tarefa 3.6 — Isolamento Multi-Tenant em `board_scenes` & OCC Atômico

#### Modelagem e Índices em `src/models/board.rs` (Tarefa 0.4):
```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct BoardSceneDocument {
    #[serde(rename = "_id")]
    pub id: String, // boardId (UUID v4)
    pub owner_id: String, // userId (UUID v4) — Isolamento estrito RNF-SEC03
    pub schema_version: u32, // Versão do schema (1)
    pub revision: u64, // Contador sequencial para OCC (inicia em 1)
    pub elements: Vec<ElementDto>,
    pub viewport: ViewportDto,
    pub updated_at: bson::DateTime,
}
```
**Índices no MongoDB para `board_scenes`**:
- `{ "_id": 1 }` (único, chave primária).
- `{ "ownerId": 1 }` (secundário, para expurgo por usuário e queries tenant-scoped).

#### Inicialização da Cena ao Criar Quadro (Tarefa 3.1):
```rust
// Ao executar POST /api/boards
let initial_scene = doc! {
    "_id": &board_id,
    "ownerId": &current_user_id,
    "schemaVersion": 1_i32,
    "revision": 1_i64,
    "elements": bson::Bson::Array(vec![]),
    "viewport": doc! { "panX": 0.0, "panY": 0.0, "zoom": 1.0 },
    "updatedAt": BsonDateTime::now()
};
scene_collection.insert_one(initial_scene, None).await?;
```

#### Execução de `PUT /api/boards/:id/scene` com OCC e Verificação de 404 vs 409 (Tarefa 3.6):
```rust
pub async fn update_board_scene(
    State(state): State<AppState>,
    Extension(current_user): Extension<CurrentUser>,
    Path(board_id): Path<String>,
    Json(payload): Json<UpdateSceneDto>,
) -> Result<Json<SceneResponseDto>, AppError> {
    let current_user_id = current_user.id;

    // 1. Query atômica com isolamento obrigatório de tenant (RNF-SEC03) e OCC
    let filter = doc! {
        "_id": &board_id,
        "ownerId": &current_user_id,
        "revision": payload.revision
    };
    let update = doc! {
        "$set": {
            "viewport": to_bson(&payload.viewport)?,
            "elements": to_bson(&payload.elements)?,
            "updatedAt": BsonDateTime::now()
        },
        "$inc": { "revision": 1_i64 }
    };

    let result = state.db.collection::<BoardSceneDocument>("board_scenes")
        .update_one(filter, update, None)
        .await?;

    if result.matched_count == 1 {
        // Atualiza também boards.updatedAt para manter consistência de ordenação no dashboard
        state.db.collection::<BoardDocument>("boards")
            .update_one(
                doc! { "_id": &board_id, "ownerId": &current_user_id },
                doc! { "$set": { "updatedAt": BsonDateTime::now() } },
                None
            )
            .await?;

        return Ok(Json(SceneResponseDto {
            revision: payload.revision + 1,
            updated_at: chrono::Utc::now(),
        }));
    }

    // 2. matched_count == 0: Desambiguação segura contra vazamento de metadados
    let scene_doc = state.db.collection::<BoardSceneDocument>("board_scenes")
        .find_one(doc! { "_id": &board_id, "ownerId": &current_user_id }, None)
        .await?;

    match scene_doc {
        None => {
            // Quadro inexistente ou não pertence a este usuário: Retorna 404
            Err(AppError::NotFound("Quadro não encontrado.".into()))
        }
        Some(scene) => {
            // Quadro existe e pertence ao usuário, mas revision divergiu: Retorna 409 Conflict
            Err(AppError::ConcurrencyConflict {
                server_revision: scene.revision,
                instance: format!("/api/boards/{}/scene", board_id),
            })
        }
    }
}
```

---

### 4.2 Fix 2: Tarefa 0.2 — Extensibilidade RFC 7807 via `#[serde(flatten)]`

#### Definição da Estrutura em `src/error.rs`:
```rust
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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

    #[serde(flatten, default, skip_serializing_if = "HashMap::is_empty")]
    pub extensions: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
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
            r#type: format!("https://drawit.app/errors/{}", code_str.to_lowercase().replace('_', "-")),
            title: title.into(),
            status,
            detail: detail.into(),
            instance: instance.into(),
            code: code_str,
            invalid_params: None,
            extensions: HashMap::new(),
        }
    }

    pub fn with_extension(mut self, key: impl Into<String>, value: impl Into<serde_json::Value>) -> Self {
        self.extensions.insert(key.into(), value.into());
        self
    }

    pub fn with_invalid_params(mut self, params: Vec<InvalidParam>) -> Self {
        self.invalid_params = Some(params);
        self
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, problem) = match self {
            AppError::ConcurrencyConflict { server_revision, instance } => (
                StatusCode::CONFLICT,
                ProblemDetails::new(
                    409,
                    "CONCURRENCY_CONFLICT",
                    "Conflito de Concorrência",
                    "A cena foi modificada em outra sessão. Recarregue a versão mais recente do servidor.",
                    instance,
                ).with_extension("serverRevision", serde_json::json!(server_revision)),
            ),
            AppError::NotFound(detail) => (
                StatusCode::NOT_FOUND,
                ProblemDetails::new(404, "NOT_FOUND", "Recurso não encontrado", detail, ""),
            ),
            AppError::Validation(params) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                ProblemDetails::new(422, "VALIDATION_FAILED", "Falha de validação", "Dados inválidos", "")
                    .with_invalid_params(params),
            ),
            AppError::Internal(err) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                ProblemDetails::new(500, "INTERNAL_ERROR", "Erro interno", err, ""),
            ),
            // Outros erros de domínio...
        };

        (
            status,
            [("content-type", "application/problem+json")],
            Json(problem),
        ).into_response()
    }
}
```

---

### 4.3 Fix 3: Tarefa 0.5 — Isolamento de CPU para Argon2id via `tokio::task::spawn_blocking`

#### Implementação de Criptografia em `src/services/auth.rs`:
```rust
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2, Params, Version, Algorithm
};
use tokio::task;
use crate::error::AppError;

pub async fn hash_password(password: String) -> Result<String, AppError> {
    task::spawn_blocking(move || {
        let salt = SaltString::generate(&mut OsRng);
        // Argon2id com m=65536 (64 MiB), t=3, p=4 conforme RNF-SEC01
        let params = Params::new(65536, 3, 4, None)
            .map_err(|e| AppError::Internal(format!("Argon2 params configuration error: {}", e)))?;
        let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

        let password_hash = argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| AppError::Internal(format!("Argon2 hashing error: {}", e)))?
            .to_string();

        Ok(password_hash)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Tokio join error during password hashing: {}", e)))?
}

pub async fn verify_password(password: String, hash: String) -> Result<bool, AppError> {
    task::spawn_blocking(move || {
        let parsed_hash = match PasswordHash::new(&hash) {
            Ok(h) => h,
            Err(_) => return Ok(false),
        };
        let argon2 = Argon2::default();
        match argon2.verify_password(password.as_bytes(), &parsed_hash) {
            Ok(()) => Ok(true),
            Err(argon2::password_hash::Error::Password) => Ok(false),
            Err(e) => Err(AppError::Internal(format!("Argon2 verification error: {}", e))),
        }
    })
    .await
    .map_err(|e| AppError::Internal(format!("Tokio join error during password verification: {}", e)))?
}
```

#### Defesas Adicionais no Subsistema de Autenticação:
1. **Rate Limiting em `/api/auth/login` e `/api/auth/register`**: Limite de 5 tentativas por minuto por IP para resguardar a capacidade do pool `spawn_blocking`.
2. **Cookie de Refresh Token com Flag `Secure`**:
   `format!("drawit_refresh={}; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=604800{}", token, if is_prod { "; Secure" } else { "" })`.
3. **Grace Window de 30s no Refresh Token**:
   - `find_one_and_update` atômico com `{ "tokenHash": token_hash, "revokedAt": null }`.
   - Se o token já estiver com `revokedAt != null`, verifica se `now - revokedAt < 30s` e `replacedBy != null`. Se verdadeiro, retorna o novo token sem revogar a família. Se `now - revokedAt >= 30s`, detecta violação de segurança e revoga todos os tokens com o mesmo `familyId`.

---

### 4.4 Fix 4: Tarefa 3.5 — Worker Tokio de Purga de 30 Dias sem TOCTOU e sem Storage Leak

#### Implementação do Worker em `src/workers/purge.rs`:
```rust
use chrono::Utc;
use mongodb::{bson::{doc, DateTime as BsonDateTime}, Collection};
use tokio::time::{interval, Duration};
use futures::stream::TryStreamExt;
use crate::models::{BoardDocument, BoardSceneDocument, BoardVersionDocument};

pub async fn start_purge_worker(
    boards_col: Collection<BoardDocument>,
    scenes_col: Collection<BoardSceneDocument>,
    versions_col: Collection<BoardVersionDocument>,
) {
    let mut ticker = interval(Duration::from_secs(86400)); // Executa a cada 24 horas

    loop {
        ticker.tick().await;
        if let Err(err) = execute_purge_cycle(&boards_col, &scenes_col, &versions_col).await {
            tracing::error!(error = %err, "Falha durante o ciclo do worker de purga da lixeira");
        }
    }
}

pub async fn execute_purge_cycle(
    boards_col: &Collection<BoardDocument>,
    scenes_col: &Collection<BoardSceneDocument>,
    versions_col: &Collection<BoardVersionDocument>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let cutoff = Utc::now() - chrono::Duration::days(30);
    let cutoff_bson = BsonDateTime::from_millis(cutoff.timestamp_millis());

    let candidate_filter = doc! {
        "isDeleted": true,
        "deletedAt": { "$lte": cutoff_bson }
    };

    let mut cursor = boards_col.find(candidate_filter, None).await?;
    let mut total_purged_boards = 0;
    let mut total_purged_versions = 0;

    while let Some(board) = cursor.try_next().await? {
        let board_id = &board.id;

        // 1. Deleção condicional atômica no quadro principal
        // Se o usuário clicou em 'Restaurar' milissegundos antes, isDeleted será false e deleted_count será 0
        let delete_result = boards_col.delete_one(doc! {
            "_id": board_id,
            "isDeleted": true,
            "deletedAt": { "$lte": cutoff_bson }
        }, None).await?;

        if delete_result.deleted_count == 1 {
            // 2. Quadro confirmado como deletado: remove cena correspondente
            scenes_col.delete_one(doc! { "_id": board_id }, None).await?;

            // 3. Remove todos os snapshots de histórico de versão (elimina o vazamento de storage!)
            let versions_result = versions_col.delete_many(doc! { "boardId": board_id }, None).await?;

            total_purged_boards += 1;
            total_purged_versions += versions_result.deleted_count;
        }
    }

    tracing::info!(
        purged_boards = total_purged_boards,
        purged_versions = total_purged_versions,
        "Ciclo de purga de 30 dias finalizado com sucesso."
    );

    Ok(())
}
```

#### Esvaziamento Manual da Lixeira (`POST /api/trash/empty`):
```rust
pub async fn empty_trash(
    State(state): State<AppState>,
    Extension(current_user): Extension<CurrentUser>,
) -> Result<StatusCode, AppError> {
    let user_id = &current_user.id;

    // 1. Obter IDs dos quadros deletados do usuário
    let filter = doc! { "ownerId": user_id, "isDeleted": true };
    let mut cursor = state.db.collection::<BoardDocument>("boards").find(filter, None).await?;
    let mut board_ids: Vec<String> = Vec::new();
    while let Some(board) = cursor.try_next().await? {
        board_ids.push(board.id);
    }

    if !board_ids.is_empty() {
        // 2. Deleta quadros
        state.db.collection::<BoardDocument>("boards")
            .delete_many(doc! { "ownerId": user_id, "isDeleted": true }, None).await?;

        // 3. Deleta cenas
        state.db.collection::<BoardSceneDocument>("board_scenes")
            .delete_many(doc! { "_id": { "$in": &board_ids }, "ownerId": user_id }, None).await?;

        // 4. Deleta versões históricas (previne vazamento de storage)
        state.db.collection::<BoardVersionDocument>("board_versions")
            .delete_many(doc! { "boardId": { "$in": &board_ids } }, None).await?;
    }

    Ok(StatusCode::NO_CONTENT)
}
```

---

## 5. Verification Method

To independently verify these fixes once updated in `.agent/plano_de_implementacao.md` and subsequent implementation:

### 5.1 Verification Checklist for `plano_de_implementacao.md`
1. **Tarefa 0.4**: Contains `ownerId` in `board_scenes` model and index `{ "ownerId": 1 }`.
2. **Tarefa 3.6**: Contains filter `doc! { "_id": board_id, "ownerId": current_user_id, "revision": payload.revision }`, updates `boards.updatedAt`, and tests 404 for non-owner vs 409 for outdated revision.
3. **Tarefa 0.2**: Contains `#[serde(flatten, default, skip_serializing_if = "HashMap::is_empty")] pub extensions: HashMap<String, Value>` in `ProblemDetails` and demonstrates `"serverRevision"` serialization.
4. **Tarefa 0.5**: Contains `tokio::task::spawn_blocking` for Argon2id hashing and verification, rate limiting, and 30s refresh token grace window.
5. **Tarefa 3.5**: Contains conditional `delete_one` with `{ "isDeleted": true, "deletedAt": { "$lte": cutoff } }` and explicit deletion of `board_versions` in both purge worker and `empty_trash`.

### 5.2 Test Scenarios (TDD Test Suite)
- **OCC Multi-Tenant Security Test**:
  ```bash
  cargo test test_update_scene_cross_tenant_forbidden_returns_404
  ```
  *Assertions*: User B calling `PUT /api/boards/:id_user_a/scene` returns HTTP 404, never updates User A's scene, and does not leak `serverRevision`.
- **OCC Concurrency Conflict Test**:
  ```bash
  cargo test test_update_scene_occ_conflict_returns_409_with_server_revision
  ```
  *Assertions*: Returns HTTP 409, Content-Type is `application/problem+json`, JSON body has `"code": "CONCURRENCY_CONFLICT"` and `"serverRevision": 2`.
- **Argon2id Thread Isolation Test**:
  ```bash
  cargo test test_argon2id_does_not_block_tokio_executor
  ```
  *Assertions*: Firing 10 concurrent logins does not delay a concurrent `GET /health` request past 5ms.
- **Purge TOCTOU Race Condition Test**:
  ```bash
  cargo test test_purge_worker_skips_concurrently_restored_board
  ```
  *Assertions*: Board restored immediately before conditional deletion is skipped by the worker; scenes and versions remain untouched.
- **Orphan Version Cleanup Test**:
  ```bash
  cargo test test_empty_trash_purges_board_versions
  ```
  *Assertions*: `board_versions` count for emptied boards is strictly 0.

### 5.3 Invalidation Conditions
- Any removal of `ownerId` from `board_scenes` or omission from the OCC filter.
- Any direct execution of `Argon2::hash_password` or `Argon2::verify_password` on an async thread without `spawn_blocking`.
- Any unconditional batch deletion in the purge worker based on stale ID collections.
