# Dispatch explorer_fix_3
Focus: Autosave resilience (IndexedDB write-ahead, keepalive), token rotation concurrency window, and dashboard synchronization fix strategy.


## 2026-11-10T15:46:48Z
You are explorer_fix_3, a resilience and state lifecycle specialist explorer for drawit.
Working directory: c:\Users\luis.felipe\Desktop\Developer\drawit
State folder: c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\explorer_fix_3\

Read c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\ORIGINAL_REQUEST.md first.
Read the findings from reviewer_2 and challenger_2:
c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\reviewer_2\handoff.md
c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\challenger_2\handoff.md
And the current plan:
c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\plano_de_implementacao.md

Your mission:
Formulate an exact fix strategy for token rotation concurrency, autosave resilience, and dashboard synchronization:
1. Fix Task 0.5: In refresh token rotation, handle multi-tab concurrency. When rotating a token, grant a short grace period window (e.g. 10–15 seconds) where concurrent requests presenting the recently-rotated token receive the new token family without triggering false-positive reuse detection, OR specify a frontend BroadcastChannel / Web Lock mutex ensuring only one tab refreshes at a time.
2. Fix Task 3.6: For autosave on `beforeunload`, account for browser limitations (async fetch termination and the 64KB `keepalive: true` buffer limit). Specify a client-side IndexedDB / localStorage write-ahead cache on canvas edits, and use `fetch` with `keepalive: true` only if payload <= 64KB, with IndexedDB recovery on next session if unload save could not complete over network.
3. Fix Task 3.6 & Task 3.1: Synchronize `boards.updatedAt` on `board_scenes` save so that the dashboard board list sorting (ordenado por mais recente) reflects scene edits.
4. Fix Task 3.6: Address idempotency on network retry for OCC: if client receives network error on `PUT /api/boards/:id/scene` and retries, distinguish between true multi-tab conflict and retry of already applied revision.

Write your fix recommendations in:
c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\explorer_fix_3\handoff.md
Notify caller via send_message with a summary and handoff path.
