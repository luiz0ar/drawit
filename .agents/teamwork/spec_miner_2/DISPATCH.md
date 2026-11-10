## 2026-11-10T15:20:57Z

You are spec_miner_2, an authoritative specification miner for the drawit project.
Working directory: c:\Users\luis.felipe\Desktop\Developer\drawit
State folder: c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\spec_miner_2\

Read c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\ORIGINAL_REQUEST.md first.
Then thoroughly read and analyze the project specification:
c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\Spec — Whiteboard de System Design.md

Your mission:
1. Extract and enumerate all requirements, models, and contracts related to Backend, Database, Auth, Quadros, Grupos, and Lixeira:
   - Backend tech stack: Rust with Axum, Tokio, Tower, Serde, MongoDB official driver, tracing.
   - Containerization: Docker and docker-compose for MongoDB and backend dev environment.
   - Data models & Schemas (MongoDB collections: users, boards/quadros, groups, trash/lixeira):
     - User schema: id, username (unique, indexed, validated regex/min length), password_hash (Argon2id), created_at, updated_at.
     - Board schema: id, user_id, title (mandatory on backend, max length, sanitized), group_id (nullable), tags (array of strings, free tags per board), content (JSON canvas state: elements, viewport, metadata), is_deleted, deleted_at, created_at, updated_at, version/etag for optimistic locking.
     - Group schema: id, user_id, name (unique per user), color/icon, created_at, updated_at.
     - Trash schema or soft-delete mechanics: deleted_at timestamp, automatic purge after 30 days retention.
   - Authentication & Security:
     - Username + password authentication.
     - Password hashing with Argon2id.
     - JWT with HS256 for dev (RS256 ready via config), short-lived access token + refresh token in secure HTTP-only cookie.
     - Auth middleware in Axum, token extraction, claims validation, user context injection.
   - API Endpoints & REST Contracts:
     - /api/auth/register, /api/auth/login, /api/auth/refresh, /api/auth/logout, /api/auth/me
     - /api/boards (GET list with filters by group/tag/search, POST create with default/given title)
     - /api/boards/:id (GET full board data, PUT update board metadata, PATCH update board content / autosave with optimistic concurrency, DELETE move to trash)
     - /api/boards/:id/restore (restore from trash)
     - /api/boards/:id/permanent (hard delete)
     - /api/groups (CRUD for groups; deletion policy: moves boards to "Sem grupo" by default)
     - /api/trash (GET list trashed boards, POST empty trash, automated cron/task for 30-day retention cleanup)
   - Incorporate all Section 14 open questions resolutions as default:
     - Group deletion moves boards to "Sem grupo" by default.
     - Trash retention is 30 days with automated purge.
     - Free tags per board (not centralized taxonomy in MVP).
     - Single-level groups for MVP (no nested folders).
     - pt-BR default language with i18n key structure.
     - HS256 for dev JWT.
2. Define API DTOs, request/response payloads, HTTP status codes, error response standard (RFC 7807 Problem Details or custom structured JSON).
3. Write your comprehensive analysis and findings in c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\spec_miner_2\handoff.md.
4. Notify caller with send_message with a summary and the handoff path.
