# Handoff Report — challenger_2: Adversarial Backend Architecture Verification

## Verdict: REQUEST_CHANGES

---

## 1. Observation

Direct observations from `c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\plano_de_implementacao.md` and `Spec — Whiteboard de System Design.md`:

### 1.1 Concurrency & OCC
- **Tarefa 3.6 (lines 707–714)**:
  ```rust
  let filter = doc! { "_id": board_id, "revision": payload.revision };
  let update = doc! {
      "$set": { "viewport": to_bson(&payload.viewport)?, "elements": to_bson(&payload.elements)?, "updatedAt": BsonDateTime::now() },
      "$inc": { "revision": 1 }
  };
  let result = scene_collection.update_one(filter, update, None).await?;
  ```
- **Tarefa 0.4 (line 169)**:
  "`board_scenes`: `{ "_id": 1 }` (chave primária correspondente ao `boardId`)."
  Notice: `board_scenes` does not store `ownerId`.
- **Tarefa 0.2 (lines 109–120)**:
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
  Notice: `ProblemDetails` has fixed struct fields and lacks `serverRevision` or `#[serde(flatten)] pub extensions: HashMap<String, Value>`. Yet Tarefa 3.6 (line 716) claims:
  "responde HTTP 409 Conflict no padrão RFC 7807 contendo `{ "code": "CONCURRENCY_CONFLICT", "serverRevision": R_servidor }`".
- **Tarefa 3.6 (lines 699–701)**:
  "Disparadores imediatos (sem debounce): ao perder o foco da janela (`window.onblur`) e antes de fechar a aba (`window.addEventListener('beforeunload', ...)`)."

### 1.2 Authentication & Token Lifecycle
- **Tarefa 0.5 (lines 183–186)**:
  - "Hashing seguro de senhas com `argon2` (Argon2id: m=65536, t=3, p=4) com salt CSPRNG de 16 bytes."
  - "transmitido ao navegador em cookie `HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=604800`." (Missing `Secure` flag definition).
  - "Se um token já revogado for apresentado em uma requisição subsequente, o backend detecta um ataque de repetição, revoga instantaneamente todos os tokens ativos pertencentes àquele `familyId` no banco, limpa o cookie do cliente e responde HTTP 401 Unauthorized (`TOKEN_REUSE_DETECTED`)."
  Notice: No rotation grace period (window), no atomic CAS (`find_one_and_update`), and no frontend tab locking is specified.
- **Tarefa 0.5 (lines 182–186)**:
  Argon2id hashing is described without specifying asynchronous offloading via `tokio::task::spawn_blocking`.

### 1.3 Domain Lifecycle & Persistence
- **Tarefa 3.3 (lines 637–640)**:
  - `DELETE /api/groups/:id?boards=move|trash`:
    - `boards=move`: "Executa `updateMany` desvinculando todos os quadros associados àquele grupo (`groupId = null`)"
    - `boards=trash`: "Move todos os quadros ativos daquele grupo para a lixeira (`isDeleted = true`, `deletedAt = now()`)"
- **Tarefa 3.5 (lines 677–685)**:
  - Worker Tokio de Purga:
    ```rust
    let cutoff = Utc::now() - Duration::days(30);
    let query = doc! { "isDeleted": true, "deletedAt": { "$lte": cutoff } };
    // Remove em lote documentos de boards e board_scenes
    ```
  - Spec §6.1 defines `board_versions` (`_id, boardId, revision, elements[], createdAt`). Purge task omits `board_versions`.

---

## 2. Logic Chain

### 2.1 OCC Atomicity & Multi-Tenancy Vulnerability
1. In MongoDB, single-document updates (`update_one`) with an exact filter `{ "_id": board_id, "revision": R }` and `$inc: { "revision": 1 }` are atomic. If two requests race with revision $R$, exactly one will increment the revision to $R+1$, and the losing request will observe `matched_count == 0`.
2. However, `board_scenes` collection does NOT have an `ownerId` field (Tarefa 0.4: line 169).
3. The query in Tarefa 3.6 filters strictly on `{ "_id": board_id, "revision": payload.revision }`.
4. Therefore, an authenticated user $U_1$ who discovers or guesses a UUID of a board belonging to user $U_2$ can send `PUT /api/boards/:id/scene` and overwrite $U_2$'s canvas without encountering any tenant isolation barrier!
5. This directly violates requirement **RNF-SEC03** ("Isolamento estrito por `ownerId` em todas as consultas e operações do banco sem confiar no cliente").
6. **Remedy**: `board_scenes` must store `ownerId`, and the filter in Tarefa 3.6 must be:
   `doc! { "_id": board_id, "ownerId": current_user_id, "revision": payload.revision }`.

### 2.2 RFC 7807 Serialization Mismatch
1. Tarefa 0.2 defines `ProblemDetails` as a statically typed Rust struct with 7 specific fields.
2. Tarefa 3.6 asserts that on OCC conflict, the endpoint returns HTTP 409 ProblemDetails containing `"serverRevision": R_servidor`.
3. Because `ProblemDetails` lacks an extension map (`#[serde(flatten)] pub extensions: HashMap<String, serde_json::Value>`), the Rust compiler/serializer cannot include `serverRevision` in the JSON output unless custom fields are explicitly accommodated.
4. **Remedy**: Add `#[serde(flatten)] pub extensions: std::collections::HashMap<String, serde_json::Value>` to `ProblemDetails` or add `pub server_revision: Option<u64>`.

### 2.3 Autosave on `beforeunload` Unreliability
1. Tarefa 3.6 specifies an immediate autosave flush on `window.addEventListener('beforeunload', ...)`.
2. In all modern web engines (Blink, Gecko, WebKit), asynchronous `fetch` or `axios` promises initiated inside `beforeunload` are terminated before completion when the navigation/tab unload proceeds.
3. `fetch(url, { keepalive: true })` can survive tab close, but has a strict browser-enforced buffer limit of 64 KB across all pending keepalive requests.
4. A scene with 2,000 elements serialized as JSON easily reaches hundreds of kilobytes or megabytes, causing `keepalive: true` requests to throw `TypeError: Failed to execute 'fetch' on 'Window': keepalive payload exceeds 64KB`.
5. **Remedy**: The frontend must maintain an immediate write-ahead log in `IndexedDB` or `localStorage` on each canvas change before the debounced server flush. On next launch or tab recovery, the editor checks local storage for newer revisions.

### 2.4 Refresh Token Rotation Race Condition & False-Positive Revocation
1. Tarefa 0.5 establishes that any presentation of an already revoked refresh token triggers immediate **family revocation** (all active sessions revoked).
2. In real-world browsers, multiple tabs often wake up simultaneously, or multiple concurrent API calls get a 401 response and attempt refresh.
3. If Tab 1 and Tab 2 send `/api/auth/refresh` concurrently with the same cookie:
   - Request 1 rotates `tokenHash_1` into `tokenHash_2` and marks `tokenHash_1` revoked.
   - Request 2 arrives milliseconds later with `tokenHash_1`.
   - The backend detects that `tokenHash_1` is already revoked and triggers a **Token Reuse Incident**.
   - Result: All sessions for `familyId` are instantly destroyed, forcibly logging out the user from all tabs!
4. Furthermore, rotation in the backend must be atomic: `find_one_and_update` with `{ tokenHash, revokedAt: null }`.
5. **Remedy**:
   - Backend: Implement a **grace period window** (e.g., 15–30 seconds) where presentation of the immediately preceding token returns the already-issued new token rather than declaring an attack, OR
   - Frontend: Use `navigator.locks.request('drawit_auth_refresh', ...)` / `BroadcastChannel` to ensure only one tab executes refresh while other tabs await the refreshed token.

### 2.5 CPU Starvation: Argon2id on Tokio Worker Threads
1. Tarefa 0.5 sets Argon2id parameters to `m=65536` (64 MB), `t=3`, `p=4`.
2. Calculating or verifying an Argon2id hash with these parameters takes ~50–150ms of intense CPU time.
3. If executed on Tokio's async worker threads, this blocks the Tokio thread pool.
4. A burst of concurrent login/register requests will exhaust Tokio threads, causing health probes (`/health`), readiness checks, and autosave requests to experience latency spikes or timeouts.
5. **Remedy**: Must explicitly mandate `tokio::task::spawn_blocking(move || argon2.verify(...))` in Tarefa 0.5.

### 2.6 Domain Lifecycle: TOCTOU Race Condition in Trash Purge Job
1. Tarefa 3.5 schedules a 24-hour Tokio worker that queries:
   `let query = doc! { "isDeleted": true, "deletedAt": { "$lte": cutoff } };`
   and then deletes `boards` and `board_scenes`.
2. Consider this sequence:
   - Purge worker finds Board $B_1$ with `deletedAt` at 30 days and 1 second.
   - User opens Trash in the frontend and clicks "Restaurar" (`POST /api/boards/B1/restore`).
   - The restore endpoint sets `isDeleted = false` and `deletedAt = null`.
   - Purge worker then executes bulk deletion of scenes and boards for the ID list it gathered in step 1.
   - Board $B_1$ is deleted from the database right after the user received a 200 OK restore confirmation!
3. **Remedy**: Permanent deletion in the purge worker must be conditional at the moment of deletion:
   `board_collection.delete_one(doc! { "_id": board_id, "isDeleted": true, "deletedAt": { "$lte": cutoff } })`. Only if a document was actually deleted should the corresponding `board_scenes` and `board_versions` documents be purged.

### 2.7 Storage Leak: Orphaned `board_versions`
1. Spec §6.1 defines the collection `board_versions` for version snapshots.
2. The purge worker in Tarefa 3.5 only deletes from `boards` and `board_scenes`.
3. Snapshots in `board_versions` are left orphaned in MongoDB forever, creating an unbounded disk storage leak.
4. **Remedy**: Include `board_versions.delete_many(doc! { "boardId": board_id })` in both the purge worker and the manual empty-trash endpoint (`POST /api/trash/empty`).

### 2.8 Inconsistency between `boards.updatedAt` and Canvas Saves
1. Tarefa 3.6 updates `board_scenes.updatedAt` on `PUT /api/boards/:id/scene`.
2. The dashboard board list (`GET /api/boards`) sorts by `boards.updatedAt` (Tarefa 0.4 & 3.1).
3. If saving a canvas scene does not also update `boards.updatedAt`, the board will not move to the top of the "Recently edited" list on the dashboard.
4. **Remedy**: `PUT /api/boards/:id/scene` must update both `board_scenes` and `boards.updatedAt` (or trigger an asynchronous touch on `boards`).

---

## 3. Caveats

1. The project is currently in the strict planning phase (`/plan` mode per `ORIGINAL_REQUEST.md`). Production code in `api/` and `web/` has not yet been authored. Therefore, these defects were identified through formal architectural review and concurrency trace simulation.
2. If single-node MongoDB in Docker is run without `--replSet rs0`, multi-document transactions cannot be used. Compensating actions and atomic CAS queries (`update_one`, `find_one_and_update`) must be designed accordingly.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

The backend architecture outlined in `.agent/plano_de_implementacao.md` is technically solid in its foundational choices (Axum, Tokio, MongoDB schema separation, OCC revision increment, Argon2id parameters), but contains **8 critical architectural gaps** that must be resolved in the plan before code implementation begins:

1. **[CRITICAL] Tenant Isolation in OCC**: Add `ownerId` to the `board_scenes` schema and filter by `{ "_id": board_id, "ownerId": current_user_id, "revision": payload.revision }` on `PUT /api/boards/:id/scene`.
2. **[CRITICAL] Refresh Token Multi-Tab Concurrency**: Introduce a 15–30s grace window or Web Locks / atomic CAS to prevent false-positive token family revocations when multiple tabs refresh simultaneously.
3. **[HIGH] Trash Purge vs Restore Race Condition**: Make deletion in the Tokio purge worker conditional (`isDeleted: true, deletedAt: { $lte: cutoff }`) to prevent obliterating newly restored boards.
4. **[HIGH] Storage Leak in Purge**: Explicitly delete associated documents in `board_versions` during purge and empty trash.
5. **[HIGH] Tokio Thread Pool Blocking**: Mandate `tokio::task::spawn_blocking` for Argon2id hashing and verification.
6. **[MEDIUM] RFC 7807 Extensibility**: Add `extensions: HashMap<String, Value>` to `ProblemDetails` to legally accommodate `serverRevision`.
7. **[MEDIUM] Autosave on Unload Quota**: Supplement `beforeunload` with client-side persistence (IndexedDB write-ahead buffer) to prevent data loss when closing large boards.
8. **[MEDIUM] Dashboard Sort Consistency**: Ensure `boards.updatedAt` is updated in sync with scene saves.

---

## 5. Verification Method

Once the implementation plan is amended, verify the fixes through the following concrete checks:

1. **Tenant Isolation Verification**:
   - Construct integration test: User A creates a board; User B attempts `PUT /api/boards/{UserA_Board_Id}/scene` with valid JSON and `revision = 1`.
   - Expected Result: HTTP 404 Not Found (or 403 Forbidden). Must NOT update User A's scene.
2. **Double-Refresh Concurrency Test**:
   - Construct concurrent test: Issue two simultaneous HTTP POST requests to `/api/auth/refresh` presenting the identical valid refresh token cookie.
   - Expected Result: Both requests succeed (or one succeeds and the other receives the new token via grace window). Neither request triggers `TOKEN_REUSE_DETECTED`.
3. **Purge Race Condition Test**:
   - Mock test: Mark board with `deletedAt = now - 31 days`. Trigger restore endpoint concurrently with the purge worker execution.
   - Expected Result: Restored board remains intact in MongoDB; worker reports 0 deleted boards.
4. **Argon2id Thread Isolation Test**:
   - Benchmark test: Fire 20 concurrent requests to `/api/auth/login` while simultaneously pinging `/health`.
   - Expected Result: `/health` latency remains $< 5\text{ms}$ while worker threads process password verification on the blocking pool.
