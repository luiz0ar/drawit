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

DrawIt is architected as a high-performance decoupled distributed system:

```mermaid
flowchart TD
    subgraph Client ["Client Browser (Single Page App)"]
        UI["React 18 + Tailwind CSS / shadcn/ui"]
        Engine["Custom Canvas 2D Engine\n(RBush Spatial R-Tree)"]
        Cache[("IndexedDB Local Store\n(Offline Sync)")]
        UI <--> Engine
        Engine <--> Cache
    end

    subgraph Backend ["Backend Services (Rust / Tokio)"]
        API["Axum REST Gateway\n[Port 8080]"]
        Worker["Async Email & Task Daemon\n(Tokio + Lapin)"]
        Scalar["Utoipa OpenAPI & Scalar UI\n[/scalar]"]
        API --> Scalar
    end

    subgraph Data ["Data & Messaging Infrastructure"]
        Mongo[("MongoDB 7.0\n[Port 27017]")]
        RMQ[("RabbitMQ 3.x\n[Port 5672 / 15672]")]
        MailHog["MailHog SMTP Sandbox\n[Port 1025 / 8025]"]
    end

    UI -- "REST + JWT (Axum)" --> API
    API -- "MongoDB BSON Driver" --> Mongo
    API -- "AMQP Event Publishing" --> RMQ
    RMQ -- "Consume Queues" --> Worker
    Worker -- "SMTP Mail Delivery" --> MailHog
```

---

## 💻 Tech Stack Overview

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend** | React, TypeScript, Vite | 18.x / 5.x | Modern reactive SPA, Zustand stores, Tailwind UI |
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
- **Node.js** 18+ & **npm** 9+
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

#### 4. Run Frontend (React + Vite)
```bash
cd web

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

---

### Option B: Full Docker Compose Environment

To run the entire application ecosystem fully containerized:

```bash
# Build and run all services
docker compose up --build

# Run in background
docker compose up -d
```

### Service Map & Ports

| Service | Port | URL | Description |
| :--- | :--- | :--- | :--- |
| **Frontend Web App** | `3000` | [http://localhost:3000](http://localhost:3000) | Main user application |
| **Backend REST API** | `8080` | [http://localhost:8080](http://localhost:8080) | Axum backend server |
| **Scalar API Reference** | `8080` | [http://localhost:8080/scalar](http://localhost:8080/scalar) | Interactive API docs (Dev mode) |
| **MailHog UI** | `8025` | [http://localhost:8025](http://localhost:8025) | Local inbox for magic links |
| **RabbitMQ Management**| `15672`| [http://localhost:15672](http://localhost:15672)| AMQP dashboard (`guest`/`guest`) |
| **MongoDB** | `27017`| `mongodb://localhost:27017` | Database port |

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
Before submitting frontend changes:
```bash
cd web

# Linting check
npm run lint

# Unit & Integration tests
npm run test

# Production build verification
npm run build
```

---

## 📖 Interactive API Reference (Scalar)

DrawIt uses [Scalar](https://scalar.com/) integrated with [Utoipa](https://github.com/juhaku/utoipa) for API specifications.

- Route: `/scalar` (e.g., `http://localhost:8080/scalar`)
- Environment gating: Strictly active when `APP_ENV=development`. In production, the route is not mounted and responds with `404 Not Found`.
- When adding or modifying endpoints:
  1. Add `#[utoipa::path(...)]` attributes to your handler in `api/src/routes/`.
  2. Implement `utoipa::ToSchema` on any new request/response DTOs in `api/src/dto/`.
  3. Register the handler in `ApiDoc` inside `api/src/docs.rs`.

---

## 📐 Code Quality & Architectural Standards

1. **RFC 7807 Error Responses**: All API errors must return structured `ProblemDetails` format (`application/problem+json`).
2. **Explicit Type Safety**: Strict TypeScript on frontend (`noImplicitAny`), comprehensive typing on Rust structs.
3. **Optimistic Concurrency**: Boards and scene updates must respect revision increments to prevent lost updates.
4. **Decoupled Architecture**: Background tasks (such as verification emails) must always be published to RabbitMQ and consumed by the async worker.
5. **Security First**: Passwords must be hashed using Argon2id. Tokens must use HMAC-SHA256 with key rotation.

---

## 🧪 Testing & Quality Assurance

- **Backend**: Run `cargo test` to execute unit tests, security suites, and integration tests.
- **Frontend**: Run `npm run test` to execute Vitest suites.
- **Continuous Integration (CI)**: GitHub Actions enforces `cargo fmt`, `cargo clippy`, `cargo test`, `npm run lint`, and `npm run test` on every PR.

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

