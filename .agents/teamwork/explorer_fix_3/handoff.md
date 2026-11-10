# Handoff Report — explorer_fix_3: Resilience, State Lifecycle & Dashboard Synchronization

**Author**: `explorer_fix_3` (Resilience & State Lifecycle Specialist Explorer)  
**Target Artifact**: `c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\plano_de_implementacao.md`  
**Reference Docs**:
- Original Request: `c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\ORIGINAL_REQUEST.md`
- Reviewer 2 Report: `c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\reviewer_2\handoff.md`
- Challenger 2 Report: `c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\challenger_2\handoff.md`
- Spec v0.2: `c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\Spec — Whiteboard de System Design.md`  
**Date**: 2026-11-10  
**Scope**: Task 0.5 (Refresh Token Multi-Tab Concurrency), Task 3.6 (Autosave Unload Resilience & IndexedDB Write-Ahead Cache, OCC Retry Idempotency), Task 3.1 & 3.6 (Dashboard Sort Synchronization)

---

## 1. Observation

Direct observations from rigorous examination of `.agent/plano_de_implementacao.md`, `reviewer_2/handoff.md`, and `challenger_2/handoff.md`:

### 1.1 Refresh Token Rotation & Multi-Tab Concurrency (Task 0.5)
- **Plano lines 185–186**:
  > "Emissão de Refresh Token opaco de 256 bits gerado via `rand::rngs::OsRng`, armazenado no MongoDB estritamente como hash SHA-256 e transmitido ao navegador em cookie `HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=604800`."
  > "**Mecanismo de Detecção de Reuso Malicioso**: Cada sessão possui um `familyId` (UUID). Ao chamar `/refresh`, o token usado é marcado como revogado (`revokedAt = now()`, `replacedBy = novoHash`). Se um token já revogado for apresentado em uma requisição subsequente, o backend detecta um ataque de repetição, revoga instantaneamente todos os tokens ativos pertencentes àquele `familyId` no banco, limpa o cookie do cliente e responde HTTP 401 Unauthorized (`TOKEN_REUSE_DETECTED`)."
- **Challenger 2 Observation (§1.2 & §2.4)**:
  > "Notice: No rotation grace period (window), no atomic CAS (`find_one_and_update`), and no frontend tab locking is specified."
  > "If Tab 1 and Tab 2 send `/api/auth/refresh` concurrently with the same cookie: Request 1 rotates `tokenHash_1` into `tokenHash_2` and marks `tokenHash_1` revoked. Request 2 arrives milliseconds later with `tokenHash_1`. The backend detects that `tokenHash_1` is already revoked and triggers a Token Reuse Incident. Result: All sessions for `familyId` are instantly destroyed, forcibly logging out the user from all tabs!"

### 1.2 Autosave on `beforeunload` & Browser Limitations (Task 3.6)
- **Plano lines 698–701**:
  > "**Mecanismo de Autosave no Frontend**:
  > Disparador debounced com intervalo entre **1 e 2 segundos** após qualquer mutação na cena.
  > Disparadores imediatos (sem debounce): ao perder o foco da janela (`window.onblur`) e antes de fechar a aba (`window.addEventListener('beforeunload', ...)`)."
- **Reviewer 2 Challenge 1 & Challenger 2 Observation §2.3**:
  > "Modern Chromium and WebKit browsers cancel active asynchronous HTTP connections once a tab is closed or navigated away, unless the request is explicitly flagged... `keepalive: true` instructs the browser to keep the connection alive after document teardown."
  > "However: `fetch(url, { keepalive: true })` has a strict browser-enforced buffer limit of 64 KB across all pending keepalive requests (W3C Fetch Spec §5.4). A scene with 100+ elements serialized as JSON easily reaches hundreds of kilobytes or megabytes, causing `keepalive: true` requests to throw `TypeError: Failed to execute 'fetch' on 'Window': keepalive payload exceeds 64KB`."

### 1.3 Dashboard Sorting Stale Timestamp (Task 3.6 & Task 3.1)
- **Plano lines 707–714 (Task 3.6)**:
  ```rust
  let filter = doc! { "_id": board_id, "revision": payload.revision };
  let update = doc! {
      "$set": { "viewport": to_bson(&payload.viewport)?, "elements": to_bson(&payload.elements)?, "updatedAt": BsonDateTime::now() },
      "$inc": { "revision": 1 }
  };
  let result = scene_collection.update_one(filter, update, None).await?;
  ```
- **Plano lines 589–591 & line 168 (Task 3.1 & Task 0.4)**:
  > "`GET /api/boards`: Listagem paginada por cursor (`cursor`, `limit`), com filtros por `groupId`, `tags`, busca textual `q`, status `favorite` e ordenação (`updatedAt`, `createdAt`, `title`)."
  > "Índice: `boards`: `{ "ownerId": 1, "isDeleted": 1, "updatedAt": -1 }`."
- **Challenger 2 Observation §2.8 & Reviewer 2 Challenge 2**:
  > "Updating `board_scenes` is sufficient for saving canvas elements, but does not update `boards.updatedAt` in the metadata collection `boards`. As a result, when the user navigates back to the Dashboard (`GET /api/boards` sorted by `updatedAt: -1`), their most recently edited board will retain its old creation timestamp and appear out of order."

### 1.4 Network Retry vs OCC Concurrency Conflict (Task 3.6)
- **Plano lines 715–717 (Task 3.6)**:
  > "Se `result.matched_count == 0`: Conflito de concorrência detectado (outra aba salvou primeiro). O backend busca a revisão corrente no banco e responde **HTTP 409 Conflict** no padrão RFC 7807 contendo `{ "code": "CONCURRENCY_CONFLICT", "serverRevision": R_servidor }`."
- **Reviewer 2 Challenge 3**:
  > "Client sends `PUT /api/boards/:id/scene` with `revision = 5`. The backend updates the database, advancing `revision` to 6, and sends HTTP 200. Due to a momentary Wi-Fi drop, the client does not receive the response. The client's HTTP retry mechanism re-sends the same payload with `revision = 5`. The backend checks the database, finds `revision = 6`, and returns HTTP 409 Conflict. The client displays a false-positive conflict toast ('Outra aba modificou o quadro'), confusing the user."

---

## 2. Logic Chain

### 2.1 Fix Strategy for Token Rotation Concurrency (Task 0.5)

#### The Problem
In an application with multi-tab support, background timers, or simultaneous API calls waking up, multiple HTTP requests can receive 401 Unauthorized simultaneously. If both tabs send `POST /api/auth/refresh` using the identical refresh token cookie:
1. Request 1 matches `{ token_hash: H1, revoked_at: null }`, generates `H2`, marks `H1` revoked (`revoked_at = now()`), and issues `H2`.
2. Request 2 arrives 20ms later with `H1`. The server finds `revoked_at != null` and instantly concludes a replay attack has occurred, triggering full family revocation (`UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = ...`).
3. Both tabs are forcibly logged out, ruining user experience.

#### The Comprehensive Solution: Defense-in-Depth (Frontend Mutex + Backend Grace Window)

##### 1. Backend: Atomic CAS Rotation + Grace Period Window (15 seconds)
- When `POST /api/auth/refresh` is received:
  1. Extract `raw_token` from cookie and compute `hash = sha256(raw_token)`.
  2. Perform an atomic CAS via `find_one_and_update`:
     ```rust
     let now = Utc::now();
     let filter = doc! {
         "token_hash": &hash,
         "revoked_at": null,
         "expires_at": { "$gt": now }
     };
     let update = doc! {
         "$set": {
             "revoked_at": now,
             "replaced_by_hash": &new_hash
         }
     };
     let matched_doc = refresh_tokens_col.find_one_and_update(filter, update, None).await?;
     ```
  3. **Branch A (Primary Winner)**: If `matched_doc.is_some()`:
     - Insert newly minted token document with `family_id = matched_doc.family_id`.
     - Generate fresh JWT access token (15m) and set new HttpOnly cookie.
     - Return HTTP 200 OK.
  4. **Branch B (Secondary Concurrent Request or Malicious Replay)**: If `matched_doc.is_none()`:
     - Query existing token: `refresh_tokens_col.find_one(doc! { "token_hash": &hash })`.
     - If not found: return HTTP 401 `INVALID_REFRESH_TOKEN`.
     - If found and `revoked_at.is_some()`:
       ```rust
       let elapsed = (now - revoked_at).num_seconds();
       const GRACE_PERIOD_SECONDS: i64 = 15;

       if elapsed >= 0 && elapsed <= GRACE_PERIOD_SECONDS {
           // CONCURRENT REQUEST WITHIN GRACE PERIOD:
           // This is a legitimate sibling tab racing during rotation.
           // Generate a fresh access token for the authenticated user and return 200 OK.
           // DO NOT revoke the family!
           let user = users_col.find_one(doc! { "_id": doc.user_id }, None).await?
               .ok_or(AppError::Unauthorized("USER_NOT_FOUND"))?;
           let access_token = generate_access_token(&user)?;
           
           // Return 200 OK with the new access token.
           // The browser will receive/already received the active cookie from the primary request.
           return Ok((StatusCode::OK, Json(AuthResponseDto {
               accessToken: access_token,
               user: user.into(),
           })));
       } else {
           // MALICIOUS TOKEN REUSE OUTSIDE GRACE PERIOD:
           // True replay attack! Revoke all tokens in family.
           refresh_tokens_col.update_many(
               doc! { "family_id": doc.family_id },
               doc! { "$set": { "revoked_at": now } },
               None
           ).await?;
           clear_auth_cookie(&mut headers);
           return Err(AppError::ProblemDetails(ProblemDetails {
               r#type: "https://drawit.app/errors/token-reuse".to_string(),
               title: "Token Reuse Detected".to_string(),
               status: 401,
               detail: "Tentativa de reutilização de refresh token revogado detectada. Todas as sessões foram encerradas por segurança.".to_string(),
               instance: "/api/auth/refresh".to_string(),
               code: "TOKEN_REUSE_DETECTED".to_string(),
               invalid_params: None,
               extensions: HashMap::new(),
           }));
       }
       ```

##### 2. Frontend: Web Locks API Mutex (`navigator.locks.request`) + `BroadcastChannel`
- In the client HTTP client (Axios/fetch interceptor in Task 0.3):
  - When an API call receives 401 Unauthorized, do not immediately fire `/api/auth/refresh`.
  - Coordinate via Web Locks API (`navigator.locks.request('drawit_auth_refresh', ...)`):
    ```typescript
    // web/src/lib/auth-sync.ts
    const authChannel = new BroadcastChannel('drawit_auth');

    export async function acquireRefreshedToken(): Promise<string> {
      // 1. If current token in memory was refreshed < 10s ago, return it immediately
      if (isTokenStillFresh()) {
        return getInMemoryAccessToken()!;
      }

      // 2. Use Web Locks API if supported (Chrome 69+, Firefox 96+, Safari 15.4+)
      if ('locks' in navigator) {
        return await navigator.locks.request('drawit_auth_refresh', async () => {
          // Double-check: another tab might have refreshed while waiting for lock
          if (isTokenStillFresh()) {
            return getInMemoryAccessToken()!;
          }
          const { accessToken } = await api.post('/api/auth/refresh');
          setInMemoryAccessToken(accessToken);
          authChannel.postMessage({ type: 'TOKEN_REFRESHED', accessToken });
          return accessToken;
        });
      }

      // 3. Fallback: single in-flight promise deduplication
      return await deduplicatedRefreshPromise();
    }
    ```
  - Listen to `authChannel.onmessage`: when another tab broadcasts `TOKEN_REFRESHED`, update the local memory access token immediately.

---

### 2.2 Fix Strategy for Autosave Resilience & Browser Limits on Unload (Task 3.6)

#### The Problem
1. When closing a tab or navigating, browsers terminate standard asynchronous `fetch()` requests mid-flight.
2. `fetch(url, { keepalive: true })` allows requests to outlive the document, but the W3C Fetch specification strictly caps the total size of pending `keepalive` requests at **64 KB**.
3. Diagrams with 100+ components, connectors, and rich metadata serialize to JSON payloads between 80 KB and 5 MB. Calling `fetch(..., { keepalive: true })` with payload > 64 KB synchronously throws `TypeError: Failed to execute 'fetch' on 'Window': keepalive payload exceeds 64KB` in Chromium/WebKit.
4. Hence, relying on `beforeunload` network requests alone is guaranteed to lose user work on medium-to-large diagrams.

#### The Comprehensive Solution: 3-Tier Resilience Architecture

```
User Edits Canvas
       │
       ▼
[Tier 1: Continuous IndexedDB Write-Ahead Cache]
(Committed on canvas edits / 200ms throttle, syncStatus: 'dirty')
       │
       ├─────────────────────────────────┬────────────────────────────────┐
       ▼                                 ▼                                ▼
[Debounced Server Autosave]       [Tab Unload: Payload <= 64KB]    [Tab Unload: Payload > 64KB]
(1-2s debounce over HTTP PUT)     (fetch keepalive: true)          (Skip network, remain in IDB)
       │                                 │                                │
       ▼                                 ▼                                │
Mark IDB syncStatus: 'synced'      Mark IDB syncStatus: 'synced'          │
                                                                          ▼
                                                            [Tier 3: Next Session Recovery]
                                                            (On mount, detect dirty IDB scene,
                                                             prompt non-intrusive restore)
```

##### Tier 1: Client-Side Write-Ahead Storage (IndexedDB)
- Use IndexedDB database `drawit_offline_db` with store `scene_write_ahead` keyed by `boardId`.
- Schema:
  ```typescript
  interface WriteAheadScene {
    boardId: string;
    revision: number;
    clientSaveId: string;
    viewport: { x: number; y: number; zoom: number };
    elements: CanvasElement[];
    updatedAt: number; // Unix ms
    syncStatus: 'synced' | 'dirty';
  }
  ```
- **Execution**: On every canvas change (or throttled at 200ms during active pointer interaction), write the snapshot immediately to IndexedDB with `syncStatus: 'dirty'`. IndexedDB writes take <5ms and do not block the 60fps canvas render loop.
- When the debounced HTTP PUT (1–2s) succeeds, update IndexedDB record to `syncStatus: 'synced'`.

##### Tier 2: `beforeunload` and `pagehide` Handlers
- Listen to `pagehide` (preferred by W3C) and `beforeunload`:
  ```typescript
  function handleWindowUnload() {
    const state = useCanvasStore.getState();
    if (!state.isDirty) return;

    const payload = {
      revision: state.revision,
      clientSaveId: state.currentSaveId,
      viewport: state.viewport,
      elements: state.elements,
    };
    const jsonString = JSON.stringify(payload);
    const byteSize = new TextEncoder().encode(jsonString).length;

    // 1. Flush latest state to IndexedDB synchronously/transactionally
    idbSaveDirtySnapshot(state.boardId, payload);

    // 2. Conditionally dispatch keepalive fetch ONLY if within browser quota
    const BROWSER_KEEPALIVE_MAX_BYTES = 64 * 1024; // 64 KB
    if (byteSize <= BROWSER_KEEPALIVE_MAX_BYTES) {
      try {
        fetch(`/api/boards/${state.boardId}/scene`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getInMemoryAccessToken()}`,
          },
          body: jsonString,
          keepalive: true,
        });
      } catch (err) {
        console.warn('Keepalive fetch could not be enqueued; recovered from IndexedDB on next launch.', err);
      }
    } else {
      // Exceeds quota: Do NOT call keepalive fetch to prevent browser TypeError.
      // The dirty state in IndexedDB will be recovered on next session mount.
      console.info(`Scene (${(byteSize / 1024).toFixed(1)} KB) exceeds 64KB keepalive buffer. Cached in IndexedDB for recovery.`);
    }
  }
  ```

##### Tier 3: Next Session Mount & Automatic Recovery
- When opening `BoardEditor.tsx` (`GET /api/boards/:id/scene`):
  1. Fetch server scene (`serverRevision`, `serverElements`, `serverUpdatedAt`).
  2. Concurrently read local IndexedDB snapshot for this `boardId`.
  3. If local snapshot exists, has `syncStatus === 'dirty'`, and `localSnapshot.updatedAt > serverScene.updatedAt`:
     - Display a non-intrusive recovery notification / banner at the top of the canvas:
       *"Restauramos alterações locais salvas antes do fechamento da aba. Deseja manter ou reverter para a versão do servidor?"*
     - If kept (default): apply local snapshot, advance `revision: serverScene.revision`, and trigger immediate background save to backend.
     - If reverted: load server scene and update IndexedDB cache to `syncStatus: 'synced'`.

---

### 2.3 Fix Strategy for Dashboard Sorting Synchronization (Task 3.6 & Task 3.1)

#### The Problem
- The dashboard list `GET /api/boards` sorts boards by `updatedAt: -1`.
- Currently, `PUT /api/boards/:id/scene` updates only `board_scenes.updatedAt`.
- The `boards` document retains its old `updatedAt` timestamp (from board creation or metadata edit).
- Therefore, after editing a canvas for hours, the user returns to the Dashboard and finds the board has not moved to the top of "Mais recentes".

#### The Solution: Atomic / Chained Timestamp Touch
In backend handler `PUT /api/boards/:id/scene`:
```rust
let now = BsonDateTime::now();

// 1. Update scene collection with OCC & tenant isolation
let scene_filter = doc! {
    "_id": board_id,
    "ownerId": current_user_id,
    "revision": payload.revision
};
let scene_update = doc! {
    "$set": {
        "viewport": to_bson(&payload.viewport)?,
        "elements": to_bson(&payload.elements)?,
        "contentHash": &content_hash,
        "lastClientSaveId": &payload.client_save_id,
        "updatedAt": now
    },
    "$inc": { "revision": 1 }
};
let scene_result = scene_collection.update_one(scene_filter, scene_update, None).await?;

if scene_result.matched_count == 0 {
    // Process OCC Conflict or Idempotent Retry (see 2.4)
    ...
}

// 2. Synchronize boards.updatedAt in metadata collection
let board_filter = doc! {
    "_id": board_id,
    "ownerId": current_user_id
};
let board_update = doc! {
    "$set": { "updatedAt": now }
};
board_collection.update_one(board_filter, board_update, None).await?;
```
- **Performance & Query Optimization**:
  - The query in `GET /api/boards` filters by `{ "ownerId": current_user_id, "isDeleted": false }` and sorts by `{ "updatedAt": -1 }`.
  - This is completely satisfied with index scan efficiency by the existing Task 0.4 compound index:
    `{ "ownerId": 1, "isDeleted": 1, "updatedAt": -1 }`.
  - Zero memory sorting overhead in MongoDB.

---

### 2.4 Fix Strategy for Network Retry vs OCC Concurrency Conflict (Task 3.6)

#### The Problem
- If client sends `PUT /api/boards/:id/scene` with `revision = 5`, server increments revision to 6, writes to DB, but the connection drops before HTTP 200 reaches the client.
- The client network stack retries `PUT` with `revision = 5`.
- Database now has `revision = 6`. Filter `{ revision: 5 }` matches 0 documents.
- Without idempotency handling, server returns HTTP 409 Conflict.
- The client erroneously warns the user that "another tab modified the board", when in fact it was the client's own write!

#### The Solution: Idempotency Identification via `clientSaveId` and `contentHash`

##### 1. Tracking Fields in `board_scenes` Schema
In Task 0.4 and Task 3.6, add to `board_scenes`:
- `lastClientSaveId`: `Option<String>` (UUID generated by client for each modification batch).
- `contentHash`: `String` (SHA-256 hash of canonical elements + viewport representation).

##### 2. Client Save DTO
```rust
#[derive(Deserialize, ToSchema)]
pub struct UpdateBoardSceneDto {
    pub revision: u64,
    pub client_save_id: Option<String>, // UUIDv4 generated per edit batch
    pub viewport: ViewportDto,
    pub elements: Vec<CanvasElementDto>,
}
```

##### 3. Backend Handler Idempotency Logic
```rust
let content_hash = compute_sha256(&payload.viewport, &payload.elements);

// 1. Attempt primary update with revision match
let scene_filter = doc! {
    "_id": board_id,
    "ownerId": current_user_id,
    "revision": payload.revision
};
let scene_update = doc! {
    "$set": {
        "viewport": to_bson(&payload.viewport)?,
        "elements": to_bson(&payload.elements)?,
        "contentHash": &content_hash,
        "lastClientSaveId": &payload.client_save_id,
        "updatedAt": now
    },
    "$inc": { "revision": 1 }
};
let result = scene_collection.update_one(scene_filter, scene_update, None).await?;

if result.matched_count == 1 {
    // Normal successful progression
    touch_board_updated_at(&board_collection, board_id, current_user_id, now).await?;
    return Ok((StatusCode::OK, Json(SceneSaveResponseDto {
        revision: payload.revision + 1,
        updatedAt: now.to_chrono(),
        idempotentReplay: false,
    })));
}

// 2. matched_count == 0: Distinguish between Idempotent Retry vs True OCC Conflict
let current_doc = scene_collection.find_one(
    doc! { "_id": board_id, "ownerId": current_user_id },
    None
).await?.ok_or(AppError::NotFound("BOARD_NOT_FOUND"))?;

let is_idempotent_retry = current_doc.revision == payload.revision + 1
    && (
        (payload.client_save_id.is_some() && current_doc.last_client_save_id == payload.client_save_id)
        || current_doc.content_hash == content_hash
    );

if is_idempotent_retry {
    // IDEMPOTENT HIT: The prior request succeeded before network failure.
    // Return HTTP 200 with the already committed revision.
    return Ok((StatusCode::OK, Json(SceneSaveResponseDto {
        revision: current_doc.revision,
        updatedAt: current_doc.updated_at.to_chrono(),
        idempotentReplay: true,
    })));
}

// 3. GENUINE CONCURRENCY CONFLICT: Another session actually committed differing state
let mut extensions = HashMap::new();
extensions.insert("serverRevision".to_string(), json!(current_doc.revision));

return Err(AppError::ProblemDetails(ProblemDetails {
    r#type: "https://drawit.app/errors/concurrency-conflict".to_string(),
    title: "Concurrency Conflict".to_string(),
    status: 409,
    detail: format!(
        "Conflito de edição concorrente detectado. Revisão enviada: {}, revisão atual do servidor: {}.",
        payload.revision, current_doc.revision
    ),
    instance: format!("/api/boards/{}/scene", board_id),
    code: "CONCURRENCY_CONFLICT".to_string(),
    invalid_params: None,
    extensions,
}));
```

---

## 3. Caveats

1. **Browser Support for Web Locks API**: Supported in 96%+ of browsers (Chromium 69+, Firefox 96+, Safari 15.4+). In legacy environments or automated unit tests where `navigator.locks` is undefined, fallback to the 15-second backend grace window + in-memory promise deduplication guarantees correct behavior.
2. **IndexedDB in Private/Incognito Mode**: In modern browsers (Chromium, Firefox, Safari), IndexedDB is supported in incognito mode but uses an ephemeral in-memory/temporary quota that is discarded on closing the private window. The resilience model still provides write-ahead caching within the session and size-gated `keepalive: true` on unload.
3. **MongoDB Multi-Document Consistency**: If MongoDB runs standalone in Docker without replica set initialization (`rs.initiate()`), multi-document transactions cannot be executed. The sequential update of `board_scenes` followed by `boards.updatedAt` ensures the scene write is verified first; if the subsequent timestamp update fails, canvas data remains completely safe.
4. **Boundary Capping of Elements**: As noted in Challenger 2 / Reviewer 2, the scene payload must enforce a maximum element count (e.g. 10,000 elements) and finite coordinate checks (`is_finite()`) to prevent JSON bomb attacks before computing SHA-256 hashes.

---

## 4. Conclusion

The architecture plan `.agent/plano_de_implementacao.md` must be updated with the following 4 concrete task enhancements:

| Task | Target Topic | Precise Update |
|---|---|---|
| **Tarefa 0.5** | Multi-Tab Token Rotation Concurrency | Add 15-second grace window to `refresh_tokens` rotation with atomic CAS (`find_one_and_update`), plus frontend Web Locks API (`navigator.locks.request('drawit_auth_refresh')`) and `BroadcastChannel` synchronization. |
| **Tarefa 3.6** | Autosave Unload Resilience & Limits | Add IndexedDB write-ahead cache (`syncStatus: 'dirty'`), check payload size before `fetch(..., { keepalive: true })` ($\le 64\text{KB}$ threshold), and implement next-session automatic recovery for larger scenes. |
| **Tarefa 3.6 & 3.1** | Dashboard Sort Synchronization | Touch `boards.updatedAt = now()` in `boards` collection upon successful `board_scenes` save in `PUT /api/boards/:id/scene`, maintaining alignment with `GET /api/boards` sorting. |
| **Tarefa 3.6** | OCC Network Retry Idempotency | Add `clientSaveId` (UUID) and `contentHash` (SHA-256) to `board_scenes`. If revision check yields `matched_count == 0` but current revision is $R+1$ with matching save ID/content hash, return HTTP 200 OK (`idempotentReplay: true`) instead of false-positive HTTP 409 Conflict. |

---

## 5. Verification Method

Once incorporated into the implementation plan, the fixes can be validated through the following deterministic automated tests:

### 5.1 Multi-Tab Concurrent Token Refresh Test (Task 0.5)
- **Integration Test Setup**:
  1. Insert user and initial refresh token `T1` in MongoDB.
  2. Spawn two concurrent Tokio tasks sending `POST /api/auth/refresh` simultaneously with Cookie `T1`.
  3. **Assert**: Both requests return HTTP 200 OK.
  4. One request acts as primary winner (issues new token `T2`); the sibling request receives a valid access token within the 15-second grace window without triggering `TOKEN_REUSE_DETECTED`.
  5. Wait 16 seconds. Send `T1` again. **Assert**: Returns HTTP 401 `TOKEN_REUSE_DETECTED` and all family tokens are revoked.

### 5.2 Unload 64KB Quota & IndexedDB Recovery Test (Task 3.6)
- **Vitest / Playwright Scenario**:
  1. Generate canvas with 300 elements (payload size $\approx 120\text{KB}$).
  2. Trigger `window.dispatchEvent(new Event('beforeunload'))`.
  3. **Assert**: No `TypeError: Failed to execute 'fetch' on 'Window': keepalive payload exceeds 64KB` is thrown.
  4. Inspect IndexedDB `drawit_offline_db`: record exists with `syncStatus: 'dirty'` and 300 elements.
  5. Reload page (simulate new session).
  6. **Assert**: Editor detects uncommitted local changes, renders recovery banner, and synchronizes to server upon confirmation.

### 5.3 Dashboard Sort Synchronization Test (Task 3.6 & 3.1)
- **Integration Test Setup**:
  1. Create Board A at $t_0$. Create Board B at $t_1$.
  2. `GET /api/boards`: Board B is first, Board A is second.
  3. At $t_2$, send `PUT /api/boards/A/scene` with new elements.
  4. Query `GET /api/boards`.
  5. **Assert**: Board A is now the FIRST element in the response, and `boards.updatedAt` equals `board_scenes.updatedAt`.

### 5.4 OCC Network Retry Idempotency Test (Task 3.6)
- **Integration Test Setup**:
  1. Board scene is at `revision = 5`.
  2. Send `PUT /api/boards/:id/scene` with `{ revision: 5, clientSaveId: "uuid-1234", elements: [...] }`.
  3. Backend updates DB to `revision = 6`.
  4. Re-send identical request with `{ revision: 5, clientSaveId: "uuid-1234", elements: [...] }`.
  5. **Assert**: Backend returns HTTP 200 OK `{ "revision": 6, "idempotentReplay": true }` instead of HTTP 409 Conflict.
  6. Send request with `{ revision: 5, clientSaveId: "uuid-5678", elements: [other elements] }`.
  7. **Assert**: Backend returns HTTP 409 Conflict with RFC 7807 and `"serverRevision": 6`.
