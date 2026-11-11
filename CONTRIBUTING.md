# 🛠️ DrawIt — Contributing & Development Guide

Thank you for your interest in contributing to **DrawIt**! This document provides complete technical specifications, architectural guidelines, and setup instructions for engineers developing, testing, and submitting contributions to the project.

---

## 📑 Table of Contents

- [System Architecture](#-system-architecture)
- [Tech Stack Overview](#-tech-stack-overview)
- [Prerequisites](#-prerequisites)
- [Local Development Setup](#-local-development-setup)
  - [Option A: Hybrid Local Development (Recommended)](#option-a-hybrid-local-development-recommended)
  - [Option B: Full Docker Compose Environment](#option-b-full-docker-compose-environment)
- [Backend Specifications (Rust / Axum)](#-backend-specifications-rust--axum)
- [Frontend Specifications (React / TypeScript)](#-frontend-specifications-react--typescript)
- [Interactive API Reference (Scalar)](#-interactive-api-reference-scalar)
- [Code Quality & Architectural Standards](#-code-quality--architectural-standards)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Git Workflow & Pull Requests](#-git-workflow--pull-requests)

---

## 🏗️ System Architecture

DrawIt is architected as a high-performance decoupled distributed system fronted by an Nginx reverse proxy:

```mermaid
flowchart TD
    Browser["User Browser / Client"]

    subgraph Gateway ["Reverse Proxy Gateway"]
        Nginx["Nginx Reverse Proxy\n[Port 80]"]
    end

    subgraph FrontendApp ["Frontend (React 18 + Vite)"]
        UI["React SPA + Tailwind CSS / shadcn/ui\n[Port 3000]"]
        Engine["Custom Canvas 2D Engine\n(RBush Spatial R-Tree)"]
        Cache[("IndexedDB Local Store\n(Offline Sync)")]
        UI <--> Engine
        Engine <--> Cache
    end

    subgraph BackendApp ["Backend Services (Rust / Tokio)"]
        API["Axum REST Gateway\n[Port 8080]"]
        Worker["Async Email Worker Daemon\n(Tokio + Lapin)"]
        Scalar["Utoipa OpenAPI & Scalar UI\n[/scalar]"]
        API --> Scalar
    end

    subgraph Infra ["Data & Messaging Infrastructure"]
        Mongo[("MongoDB 7.0\n[Port 27017]")]
        RMQ[("RabbitMQ 3.x\n[Port 5672 / 15672]")]
        MailHog["MailHog SMTP Sandbox\n[Port 1025 / 8025]"]
    end

    Browser --> Nginx
    Nginx -- "HTTP / WebSocket (HMR)" --> UI
    Nginx -- "REST API /ws /scalar" --> API
    Nginx -- "/mailhog/" --> MailHog
    API -- "MongoDB BSON Driver" --> Mongo
    API -- "AMQP Event Publishing" --> RMQ
    RMQ -- "Consume Queues" --> Worker
    Worker -- "SMTP Mail Delivery" --> MailHog
```

---

## 💻 Tech Stack Overview

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Reverse Proxy** | Nginx | Alpine | Unified entry point on port 80, reverse proxying frontend, API, WebSockets, and MailHog |
| **Frontend** | React, TypeScript, Vite | 18.x / 5.x | Modern reactive SPA, Zustand stores, Tailwind UI |
| **Frontend Runtime**| Bun | 1.x | Ultra-fast JavaScript runtime for scripts and testing |
| **Package Manager** | pnpm | 9.x+ / 11.x | Fast, disk space efficient package manager (`pnpm-lock.yaml`) |
| **Frontend Linter** | oxlint | Latest | High-performance Rust-based linter with strict zero-warning policy |
| **Canvas Engine** | HTML5 Canvas 2D | Native | Spatial indexing (`rbush`), smooth pen (`perfect-freehand`) |
| **Backend API** | Rust (Axum, Tokio, Tower) | 2021 edition | High-throughput, memory-safe asynchronous REST API |
| **Database** | MongoDB | 7.0 | Document store for users, boards, scenes, and groups |
| **Message Broker** | RabbitMQ | 3.x | AMQP event broker for asynchronous task decoupling |
| **Email Sandbox** | MailHog | Latest | Local SMTP server and Web UI for email verification testing |
| **API Docs** | Scalar + Utoipa | OpenAPI 3.0 | Modern interactive API reference active in development mode |

---

## 📋 Prerequisites

Ensure the following tools are installed on your workstation:

- **Docker Desktop** (or Docker Engine 24+ & Docker Compose v2)
- **Rust Toolchain** 1.78+ (`rustup`, `cargo`, `clippy`, `rustfmt`)
- **Bun** 1.1+ (JavaScript/TypeScript runtime)
- **pnpm** 9+ (Node package manager)
- **Git**

---

## 🚀 Local Development Setup

### Option A: Hybrid Local Development (Recommended)

Run infrastructure services in lightweight Docker containers while running the frontend and backend locally with instant hot reload:

#### 1. Start Support Infrastructure
```bash
docker compose up -d mongo rabbitmq mailhog
```

#### 2. Configure Environment Variables
Copy the template configuration files:
```bash
cp .env.example .env
```

Key environment defaults:
- `APP_ENV=development`
- `APP_PORT=8080`
- `MONGO_URL=mongodb://localhost:27017/drawit`
- `AMQP_URL=amqp://guest:guest@localhost:5672`
- `SMTP_HOST=localhost`
- `SMTP_PORT=1025`

#### 3. Run Backend (Rust)
```bash
cd api

# Run tests
cargo test

# Start API server with live recompile
cargo run
```

#### 4. Run Frontend (React + Vite with Bun & pnpm)
```bash
cd web

# Install dependencies using pnpm
pnpm install

# Start Vite dev server via Bun
bun run dev
```

---

### Option B: Full Docker Compose Environment

To run the entire application ecosystem fully containerized behind the Nginx reverse proxy:

```bash
# Build and run all services
docker compose up --build

# Run in background
docker compose up -d
```

### Service Map & Ports

| Service | Port | URL | Description |
| :--- | :--- | :--- | :--- |
| **DrawIt Web Application (Nginx)** | `80` | [http://localhost](http://localhost) | Unified reverse proxy serving frontend and API |
| **Frontend Web App (Direct Dev)** | `3000` | [http://localhost:3000](http://localhost:3000) | Vite dev server with WebSocket hot reload |
| **Backend REST API (Direct Dev)** | `8080` | [http://localhost:8080](http://localhost:8080) | Axum backend server |
| **Scalar API Reference** | `80` / `8080` | [http://localhost/scalar](http://localhost/scalar) | Interactive API docs (Dev mode) |
| **MailHog Web UI** | `80` / `8025` | [http://localhost/mailhog/](http://localhost/mailhog/) or `:8025` | Local inbox for verification & reset emails |
| **RabbitMQ Management** | `15672` | [http://localhost:15672](http://localhost:15672) | AMQP dashboard (`guest`/`guest`) |
| **MongoDB** | `27017` | `mongodb://localhost:27017` | Database port |

---

## 🦀 Backend Specifications (Rust / Axum)

### Project Layout (`/api`)
```
api/
├── src/
│   ├── config.rs              # Application configuration & env parsing
│   ├── db.rs                  # MongoDB connection & index orchestration
│   ├── docs.rs                # OpenAPI 3.0 definitions & Scalar wiring
│   ├── dto/                   # Data Transfer Objects (with utoipa::ToSchema)
│   ├── error.rs               # RFC 7807 ProblemDetails error handling
│   ├── middleware/            # JWT authentication & request tracing
│   ├── models/                # MongoDB document schemas
│   ├── routes/                # Axum route handlers & utoipa annotations
│   ├── services/              # Domain logic (Auth, Board, Group, Mailer, MQ)
│   ├── worker.rs              # Background consumer daemon for AMQP events
│   ├── lib.rs                 # Router composition & middleware pipeline
│   └── main.rs                # Server bootstrap entry point
└── tests/                     # Integration test suites
```

### Quality & Linting Commands
Before submitting backend changes:
```bash
cd api

# Format check
cargo fmt -- --check

# Auto-format
cargo fmt

# Strict Clippy analysis (zero warnings allowed)
cargo clippy -- -D warnings

# Execute test suite
cargo test
```

---

## ⚛️ Frontend Specifications (React / TypeScript)

### Project Layout (`/web`)
```
web/
├── src/
│   ├── canvas/                # Canvas 2D engine, rendering loop & spatial index
│   ├── components/            # Reusable UI primitives & shadcn/ui components
│   ├── features/              # Feature modules (boards, auth, groups, trash)
│   ├── hooks/                 # Custom React hooks (canvas, keyboard, viewport)
│   ├── services/              # Axios API client & offline sync layer
│   ├── stores/                # Zustand global state slices
│   └── types/                 # Shared TypeScript interfaces & stencil specs
└── package.json
```

### Quality & Linting Commands
Before submitting frontend changes, ensure all checks pass with zero warnings:
```bash
cd web

# 1. Lint and auto-fix with oxlint
pnpm exec oxlint --fix

# 2. Strict lint gate (zero warnings allowed)
pnpm exec oxlint --deny-warnings --format=agent

# 3. Unit & Integration test suite (Vitest via Bun)
bun run test

# 4. Production build & TypeScript type-check
bun --bun run build
```

---

## 📖 Interactive API Reference (Scalar)

DrawIt uses [Scalar](https://scalar.com/) integrated with [Utoipa](https://github.com/juhaku/utoipa) for API specifications.

- Route: `/scalar` (accessible via Nginx at `http://localhost/scalar` or directly at `http://localhost:8080/scalar`)
- Environment gating: Strictly active when `APP_ENV=development`. In production, the route is not mounted and responds with `404 Not Found`.
- When adding or modifying endpoints:
  1. Add `#[utoipa::path(...)]` attributes to your handler in `api/src/routes/`.
  2. Implement `utoipa::ToSchema` on any new request/response DTOs in `api/src/dto/`.
  3. Register the handler in `ApiDoc` inside `api/src/docs.rs`.

---

## 📐 Code Quality & Architectural Standards

1. **RFC 7807 Error Responses**: All API errors must return structured `ProblemDetails` format (`application/problem+json`).
2. **Explicit Type Safety**: Strict TypeScript on frontend (`noImplicitAny`), comprehensive typing on Rust structs.
3. **Node/TypeScript Tooling Standard**:
   - **Runtime: Bun.** Run scripts and TS/JS files via `bun run <script>`, `bun --bun run <script>`, or `bun <file.ts>`.
   - **Package Manager: pnpm.** Manage dependencies strictly with `pnpm install`, `pnpm add`, `pnpm remove`, and `pnpm exec`.
   - Never commit `package-lock.json` or `yarn.lock`; the single canonical lockfile is `pnpm-lock.yaml`.
   - Run tests with `bun run test` (Vitest script), never bare `bun test`.
4. **Optimistic Concurrency**: Boards and scene updates must respect revision increments to prevent lost updates.
5. **Decoupled Architecture**: Background tasks (such as email verification and password reset dispatch) must always be published to RabbitMQ and consumed by the async worker.
6. **Authentication & Password Security**:
   - Passwords must be hashed using Argon2id.
   - Enforce the 5-point password complexity policy (min. 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special character) across both backend and frontend.
   - Email verification and password reset tokens must be cryptographically random and stored as SHA-256 hashes with TTL indexes in MongoDB.
   - Enforce 90-second resend cooldowns returning RFC 7807 Problem Details (HTTP 429) accompanied by a `Retry-After` header.

---

## 🧪 Testing & Quality Assurance

Every pull request is automatically validated by our CI DevSecOps pipeline (`.github/workflows/ci.yml`):

- **Backend**:
  ```bash
  cargo fmt --manifest-path api/Cargo.toml -- --check
  cargo clippy --manifest-path api/Cargo.toml -- -D warnings
  cargo test --manifest-path api/Cargo.toml
  ```
- **Frontend**:
  ```bash
  cd web
  pnpm exec oxlint --deny-warnings --format=agent
  bun --bun run build
  bun run test
  ```
- **Continuous Integration (CI)**: GitHub Actions enforces these exact checks on every push and PR to `main`.

---

## 🤝 Git Workflow & Pull Requests

1. **Fork the Repository**: Create your personal fork on GitHub.
2. **Create a Feature Branch**:
   ```bash
   git checkout -b feat/stencil-cloud-vpc
   ```
   *Branch naming conventions:*
   - `feat/<description>` for new capabilities
   - `fix/<description>` for bug repairs
   - `refactor/<description>` for non-breaking code improvements
   - `docs/<description>` for documentation updates
3. **Commit Messages**: Follow standard Conventional Commits:
   ```bash
   git commit -m "feat(stencils): add cloud vpc and firewall stencils"
   ```
4. **Push & Open Pull Request**: Push to your branch and open a PR against `main`. Provide a clear description of the problem solved and test results.

---

Thank you for building the future of system architecture diagramming with DrawIt! 🚀

