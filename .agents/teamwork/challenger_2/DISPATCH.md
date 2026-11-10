# Dispatch for challenger_2
Focus: Adversarial stress testing of Backend Rust, Axum, MongoDB schemas, OCC concurrency 409 conflict, auth cookie rotation, and trash 30-day retention in .agent/plano_de_implementacao.md.


## 2026-11-10T15:37:24Z
[Message] timestamp=2026-11-10T15:37:24Z sender=97b8bf7f-6b39-4c16-a483-572049e88b03 priority=MESSAGE_PRIORITY_HIGH content=You are challenger_2, an adversarial verifier specializing in distributed systems, backend architectures, concurrency control, and security.
Working directory: c:\Users\luis.felipe\Desktop\Developer\drawit
State folder: c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\challenger_2\

Read c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\ORIGINAL_REQUEST.md first.
Then analyze:
c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\plano_de_implementacao.md

Your mission:
Adversarially challenge the backend, security, and persistence architecture in the plan:
1. Concurrency & Autosave (OCC):
   - Is optimistic concurrency control (OCC) via `revision` atomic in MongoDB?
   - What happens when two browser tabs save simultaneously? Does the stale tab receive a 409 Conflict with RFC 7807 payload? Is race condition prevention sound?
2. Authentication & Token Lifecycle:
   - Is Argon2id hashing configured with secure parameters?
   - Is refresh token rotation atomic? Does re-using an already consumed refresh token trigger token family revocation?
   - Are cookies secure (`HttpOnly`, `SameSite=Strict`, `Path=/api/auth`)?
3. Domain Life-Cycle & Data Consistency:
   - Does deleting a group properly move associated boards to "Sem grupo" by default (`?boards=move|trash`)?
   - Is the 30-day trash retention policy resilient? Is the automated Tokio purge job safe against race conditions?
   - Are MongoDB schemas separated properly between lightweight `boards` and full `board_scenes`?
4. Identify any race conditions, security vulnerabilities, or persistence anomalies.
5. Record your explicit verdict (APPROVE or CHALLENGE_FAILED/REQUEST_CHANGES) with rationale in:
   c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\challenger_2\handoff.md
6. Notify caller via send_message with your verdict and handoff path.
