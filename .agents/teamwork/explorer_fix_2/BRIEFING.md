# BRIEFING — 2026-11-10T15:51:00Z

## Mission
Formulate an exact fix strategy for the backend, security, and persistence issues identified by challenger_2 in drawit.

## 🔒 My Identity
- Archetype: explorer
- Roles: Backend & Persistence Specialist Explorer
- Working directory: c:\Users\luis.felipe\Desktop\Developer\drawit
- State folder: c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\explorer_fix_2\
- Original parent: 97b8bf7f-6b39-4c16-a483-572049e88b03
- Milestone: Fix strategy for backend, security, and persistence

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in source code
- Produce concrete fix specifications with exact code snippets, models, queries, and file locations for the plan
- Adhere to RNF-SEC03, RFC 7807 / RFC 9457, Tokio non-blocking best practices, and MongoDB consistency/cleanup rules

## Current Parent
- Conversation ID: 97b8bf7f-6b39-4c16-a483-572049e88b03
- Updated: 2026-11-10T15:51:00Z

## Investigation State
- **Explored paths**:
  - `plano_de_implementacao.md` (Tarefas 0.2, 0.4, 0.5, 3.1, 3.3, 3.5, 3.6)
  - `challenger_2/handoff.md` (Observations 1.1–1.3, Logic chains 2.1–2.8)
  - `Spec — Whiteboard de System Design.md` (Sections 4.3, 4.4, 5, 6.1)
- **Key findings**:
  1. `board_scenes` lacked `ownerId`, leaving OCC updates vulnerable to cross-tenant IDOR overwrite.
  2. `ProblemDetails` lacked `#[serde(flatten)] extensions`, preventing `"serverRevision"` serialization on HTTP 409.
  3. Argon2id on Tokio worker threads would starve async runtime; requires `tokio::task::spawn_blocking`.
  4. Purge worker had TOCTOU race condition against `restore` and caused storage leak by omitting `board_versions`.
- **Unexplored areas**: None within backend fix scope.

## Key Decisions Made
- Specified exact atomic OCC filter `doc! { "_id": board_id, "ownerId": current_user_id, "revision": payload.revision }` with 404 for tenant mismatch and 409 for revision conflict.
- Formulated `ProblemDetails` with `#[serde(flatten, default, skip_serializing_if = "HashMap::is_empty")] pub extensions: HashMap<String, Value>`.
- Wrapped Argon2id operations inside `tokio::task::spawn_blocking` and specified 30s refresh token grace window.
- Designed anti-TOCTOU conditional deletion `boards_col.delete_one(doc! { "_id": id, "isDeleted": true, "deletedAt": { "$lte": cutoff } })` with cascading cleanup of `board_scenes` and `board_versions`.

## Artifact Index
- `DISPATCH.md` — Incoming dispatch instructions
- `BRIEFING.md` — Context, constraints, decisions & index
- `progress.md` — Liveness & progress heartbeat
- `handoff.md` — Comprehensive fix strategy report
