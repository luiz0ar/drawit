# AGENT.md

Instructions for AI agents working in this repository.

## Project layout

- `api/` — Backend (Rust / Axum)
- `web/` — Frontend (React / Vite / TypeScript)

## Node / JavaScript / TypeScript tooling

For every project in the Node/JavaScript/TypeScript ecosystem:

- **Runtime: Bun.** Use Bun to run scripts and TypeScript/JavaScript files (`bun run <script>`, `bun --bun run <script>`, `bun <file.ts>`).
- **Package manager: pnpm.** Use pnpm for everything related to dependencies (`pnpm install`, `pnpm add`, `pnpm remove`, `pnpm update`, `pnpm exec`, `pnpm dlx`).
- Do not use `npm`, `npx`, `yarn`, or `bun install` / `bun add`. Do not create or commit `package-lock.json`, `yarn.lock`, or `bun.lock`; the only lockfile is `pnpm-lock.yaml`.
- Run package.json scripts with `bun run <script>`. Never use bare `bun test`: it invokes Bun's built-in test runner instead of the project's `test` script (Vitest). Use `bun run test`.
- Run locally installed CLIs (oxlint, oxfmt, etc.) with `pnpm exec <tool>`. Use `pnpm dlx <tool>` only for one-off tools that are not project dependencies.

## Required workflow after any code change

After making code changes, you MUST run the checks below and fix every failure before considering the task done. These mirror the CI pipeline (`CI DevSecOps`), so passing locally means CI should pass.

Run only the sections that match the files you changed (backend, frontend, or both). When in doubt, run everything.

### 1. Lint and format (frontend / JS / TS)

Run from the `web/` directory:

```bash
cd web
pnpm exec oxlint --fix
pnpm exec oxfmt
```

### 2. Backend checks (Rust / Axum)

Run from the repository root. Same steps as the `backend-checks` CI job:

```bash
cargo fmt --manifest-path api/Cargo.toml -- --check
cargo clippy --manifest-path api/Cargo.toml -- -D warnings
cargo test --manifest-path api/Cargo.toml
```

If `cargo fmt --check` fails, run `cargo fmt --manifest-path api/Cargo.toml` to fix formatting, then re-run the check.

### 3. Frontend checks (React / Vite)

Run from the repository root. Equivalent to the `frontend-checks` CI job, using the project's Bun + pnpm tooling:

```bash
pnpm --dir web install --frozen-lockfile   # only if dependencies changed or node_modules is missing
cd web
bun --bun run build                        # TypeScript type-check + build
bun --bun run test                         # Vitest unit tests
```

### 4. Final lint gate (before finishing)

Run from the `web/` directory. This must pass with zero warnings:

```bash
cd web
pnpm exec oxlint --deny-warnings --format=agent
```

## Rules

- Do not finish a task while any command above is failing.
- Fix the root cause. Do not silence warnings, disable lint rules, skip tests, or add `#[allow(...)]` / `eslint-disable`-style suppressions just to get a green result, unless the user explicitly approves.
- Do not modify CI workflow files to make checks pass.
- Keep changes scoped to the task. Do not reformat or refactor unrelated files.
- In your final message, report which checks you ran and their results. If you could not run a check, say so explicitly and explain why.

## CI reference

The pipeline runs on every push and pull request to `main` / `master`:

| Job | Runs | Commands |
| --- | --- | --- |
| `backend-checks` | Rust (stable) | `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` |
| `frontend-checks` | Node.js 20 | `npm ci`, `npm run build`, `npm test` |

> Note: the CI workflow still uses Node.js 20 and npm. Local agent commands above use Bun + pnpm; the workflow should be migrated to match (`oven-sh/setup-bun`, `pnpm/action-setup`, `pnpm install --frozen-lockfile`).