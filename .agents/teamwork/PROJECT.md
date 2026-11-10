# Project: drawit — Whiteboard de System Design (Implementation Plan)

## Architecture
- **Frontend Architecture**: React 18 + Vite (TypeScript) com motor Canvas 2D próprio (`HTMLCanvasElement`, context 2D imperativo). React restrito à interface de suporte (barras, painéis laterais, diálogos modais). Componentes UI com `shadcn/ui` (Tailwind CSS + Radix UI). Gerenciamento de estado com `Zustand`. Traço livre via `perfect-freehand`. Índice espacial via `rbush`.
- **Backend Architecture**: Rust 1.80+ com `Axum`, `Tokio` runtime, `Tower-HTTP`, `Serde`, driver oficial `mongodb`, telemetria com `tracing` e documentação OpenAPI com `utoipa`.
- **Containerization**: Docker e docker-compose orquestrando serviços `mongo`, `backend` (Rust), e `frontend` (Vite dev server / Nginx).
- **Authentication & Security**: Username único e senha com hash `Argon2id`. Access token JWT HS256 em desenvolvimento local (15 min TTL). Refresh token opaco criptográfico (256 bits, hash SHA-256 no MongoDB, 7 dias TTL) armazenado em cookie `HttpOnly`, `SameSite=Strict`, `Path=/api/auth`. Rotação obrigatória de refresh token a cada uso e detecção de reuso com revogação da família completa de tokens.
- **Canvas Math & Performance**: Plano cartesiano infinito com matriz de transformação afim 2D (x, y, zoom de 10% a 800%). Zoom ancorado no cursor do mouse pela roda (sem Ctrl), pinça ou atalhos. Pan via ferramenta mão, espaço+arrastar ou botão do meio. Renderização a 60 FPS com culling de viewport via R-tree (`rbush`), dirty-rect/flag scheduler e hit-testing em 2 fases (AABB coarse + geometria fina).
- **Diagramming Engine**: Formas básicas (retângulo, retângulo arredondado, elipse, losango, cilindro, nuvem), conectores com snap a âncoras (8 pontos cardeais/colaterais), roteamento ortogonal (Manhattan com desvio), reto ou curvo (Bézier), setas ponta única/dupla e binding persistente que recalcula posições ao mover ou redimensionar formas conectadas. Detach automático ao deletar forma conectada.
- **Persistence & Optimistic Concurrency**: Debounce de autosave (1 a 2s), salvamento ao perder foco e fechar aba. Controle de concorrência otimista (OCC) via `revision` sequencial atômico com retorno de `409 Conflict` (RFC 7807) para prevenir sobrescrita acidental em múltiplas abas.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Docker & Dev Environment | Setup docker-compose (mongo, backend, frontend) com healthchecks e volumes | M0 | Spec §8.4, RF-S01 |
| 2 | Rust Backend Foundation | Setup Cargo workspace, Axum server, Tracing, RFC 7807 Error handling, config | M0 | Spec §8.2, RNF-M01 |
| 3 | Frontend Foundation | Setup Vite, React, TypeScript, Tailwind, shadcn/ui, Zustand, shell layout | M0 | Spec §8.3, RNF-M01 |
| 4 | User Auth (Register, Login, Me) | Username único, Argon2id, JWT access token, cookie refresh token rotativo | M0 | Spec §3.1, §5.1-5.4, RF-A01..A06 |
| 5 | Canvas 2D Engine Core | Loop de renderização 60fps, requestAnimationFrame, dirty flag, HiDPI scaling | M1 | Spec §3.4, §8.3, RF-C01, RNF-P01 |
| 6 | Coordinate System & Navigation | Transformações mundo <-> tela, zoom 10%-800% no cursor, pan (mão/espaço/meio) | M1 | Spec §3.4, RF-C02, RF-C03 |
| 7 | Viewport Helpers & Grid | Ajustar à tela, reset 100%, grade de pontos/linhas, snap à grade | M1 | Spec §3.4, RF-C04, RF-C05 |
| 8 | Selection & Hit Testing | Seleção clique, caixa de seleção (marquee), multi-seleção Shift, spatial index rbush | M1 | Spec §3.5, §8.3, RF-E08, RF-E09 |
| 9 | Transform Box & Manipulation | Bounding box 8 alças, redimensionamento com Shift proporcional, arrastar elementos | M1 | Spec §3.5, RF-E08, RF-E10 |
| 10 | Freehand Drawing | Ferramenta caneta/lápis com traço suave via perfect-freehand | M1 | Spec §3.5, §8.3, RF-E01 |
| 11 | Basic Shapes | Retângulo, retângulo arredondado, elipse, losango, nuvem, cilindro | M2 | Spec §3.5, §7.1, RF-E01 |
| 12 | Connection Anchors & Snap | 8 âncoras magnéticas por forma, cálculo de snap visual ao aproximar cursor | M2 | Spec §3.5, §7.2, RF-E02 |
| 13 | Connectors & Routing | Conectores reto, curvo e ortogonal (Manhattan), pontas de seta, binding persistente | M2 | Spec §3.5, §7.2, RF-E02, RF-E06 |
| 14 | Connector Detach on Delete | Ao deletar elemento ligado, setas soltam a ponta sem exclusão da linha | M2 | Spec §3.5, RF-E07 |
| 15 | Text Editing on Shapes & Canvas | Edição in-place com overlay HTML textarea, text-wrapping, alinhamento, fontes | M2 | Spec §3.5, RF-E03 |
| 16 | Element Styling | Cores de traço/preenchimento, espessura, tracejado, opacidade | M2 | Spec §3.5, RF-E05 |
| 17 | Clipboard & Duplicate | Copiar, recortar, colar com remapeamento de UUIDs e bindings, duplicar com offset | M2 | Spec §3.5, RF-E11 |
| 18 | Undo/Redo Engine | Pilha de histórico baseada em comandos/patches imutáveis com limite de ações | M2 | Spec §3.5, RF-E12 |
| 19 | IT Components Library | Biblioteca nativa de componentes (servidor, DB, API, gateway, fila) com SVG caching | M2 | Spec §7.1, RF-E01 |
| 20 | Board CRUD & Metadata API | Endpoints /api/boards (criar com título obrigatório no backend, listar, editar) | M3 | Spec §3.2, §9.2, RF-Q01..Q04 |
| 21 | Board Sequential Name Generator | Frontend calcula título padrão `Quadro-N` baseado no maior N existente (+1) | M3 | Spec §3.2, §8.3, RF-Q01 |
| 22 | Groups CRUD & Hierarchy | Endpoints /api/groups, nível único no MVP, contagem agregada de quadros | M3 | Spec §3.3, §9.1, RF-O01..O03 |
| 23 | Group Deletion Policy | Deleção de grupo move quadros para "Sem grupo" por padrão (?boards=move\|trash) | M3 | Spec §3.3, §14.2, RF-O04 |
| 24 | Free Tags per Board | Adição livre de tags por quadro, autocomplete e filtro por tags ativas | M3 | Spec §3.3, §14.4, RF-O05 |
| 25 | Trash & Retention Engine | /api/trash, mover para lixeira, restauração, retenção 30 dias com purge Tokio | M3 | Spec §3.2, §14.3, RF-Q05, RF-Q06 |
| 26 | Scene Autosave & OCC API | /api/boards/:id/scene com revision sequencial e 409 Conflict se revision defasado | M3 | Spec §4.3, §9.2, RF-Q07, RF-Q08 |
| 27 | Export Engine (PNG, SVG, JSON) | Exportação de cena recortada para PNG HiDPI, SVG vetorial e JSON com schema | M3 | Spec §3.6, RF-P01..P05 |
| 28 | Workspace & Board Management UI | Painel de navegação, barra lateral de grupos, listagem em grid/lista, modal lixeira | M3 | Spec §3.2, §3.3, §8.3 |
| 29 | Quality of Life (Fase 4 - Roadmap) | Atalhos avançados, exportações completas, temas claros/escuros, snapping guiado | M4 | Spec §10 (Fase 4) |
| 30 | Future & Real-Time (Fase 5 - Roadmap) | Colaboração em tempo real via WebSockets / CRDTs, cursores múltiplos, comentários | M5 | Spec §10 (Fase 5) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M-PLAN | Plano de Implementação Técnico | Elaboração do master plan em .agent/plano_de_implementacao.md em modo /plan com senior-dev | none | DONE |
| M0 | Fase 0: Fundação & Setup | Docker compose, Rust Axum backend base, React/Vite/shadcn frontend base, Auth JWT/Argon2id | M-PLAN | PLANNED |
| M1 | Fase 1: Núcleo do Canvas 2D | Motor 2D imperativo, coordenadas mundo/tela, zoom no cursor, pan, viewport, seleção e desenho livre | M0 | PLANNED |
| M2 | Fase 2: Diagramas & Modelagem | Formas geométricas, componentes de TI, conectores magnéticos, roteamento ortogonal, texto, undo/redo | M1 | PLANNED |
| M3 | Fase 3: Quadros, Organização & Persistência | CRUD quadros e grupos, lixeira 30 dias, autosave com concorrência otimista (OCC), exportação, dashboard UI | M2 | PLANNED |
| M4 | Fase 4: Qualidade de Vida (Alto Nível) | Refinamentos de UX, atalhos, exportação avançada, temas | M3 | PLANNED |
| M5 | Fase 5: Futuro & Colaboração (Alto Nível) | Colaboração multiusuário, WebSockets, CRDTs, presença | M4 | PLANNED |

## Interface Contracts

### 1. Backend REST API Standard
- Formato de dados: JSON com chaves em `camelCase`.
- Datas: Strings ISO 8601 em UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`).
- Erros: RFC 7807 Problem Details:
  ```json
  {
    "type": "https://drawit.local/errors/conflict",
    "title": "Conflito de Concorrência",
    "status": 409,
    "detail": "A revisão fornecida (3) está desatualizada em relação à versão do servidor (4).",
    "instance": "/api/boards/60c72b2f9b1d8b2bad000001/scene",
    "code": "CONCURRENT_MODIFICATION"
  }
  ```
- Autenticação:
  - Header: `Authorization: Bearer <accessToken>` (JWT HS256, expira em 15 min).
  - Cookie: `refresh_token=<token>` (`HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=604800`).

### 2. Canvas 2D Engine ↔ React Outer UI
- Event bus / Subscrições Zustand desacopladas:
  - Canvas Engine não emite re-render do React em `pointermove` ou `wheel`.
  - Notifica Zustand apenas em: `onToolChange`, `onSelectionChange(selectedIds)`, `onViewportChange(x, y, zoom)`, `onHistoryChange(canUndo, canRedo)`, `onSaveRequired(scene)`.
- Input Event Boundary:
  - Eventos de mouse/ponteiro no `<canvas>` usam `PointerEvents` nativos.
  - O listener de `wheel` é configurado com `{ passive: false }` e chama `e.preventDefault()` para interceptar o zoom do navegador e aplicar o zoom próprio centrado no cursor.

## Code Layout
```
c:\Users\luis.felipe\Desktop\Developer\drawit\
├── .agent\
│   ├── Spec — Whiteboard de System Design.md
│   └── plano_de_implementacao.md               # [TARGET ARTIFACT]
├── .agents\
│   └── teamwork\
│       ├── ORIGINAL_REQUEST.md
│       ├── PROJECT.md
│       └── orchestrator\
├── .docker\
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── mongo-init.js
├── docker-compose.yml
├── api\                                       # Rust Axum Backend
│   ├── Cargo.toml
│   └── src\
│       ├── main.rs
│       ├── config.rs
│       ├── error.rs                          # RFC 7807
│       ├── domain\                           # Entidades puras e regras de negócio
│       ├── repository\                       # Acesso ao MongoDB
│       ├── routes\                           # Handlers HTTP Axum
│       ├── middleware\                       # Auth JWT & rate limit
│       └── jobs\                             # Worker Tokio para expiração de lixeira
└── web\                                       # React 18 + Vite Frontend
    ├── package.json
    ├── vite.config.ts
    └── src\
        ├── main.tsx
        ├── App.tsx
        ├── components\                       # shadcn/ui e componentes React
        │   ├── ui\
        │   ├── toolbar\
        │   ├── sidebar\
        │   └── dialogs\
        ├── canvas\                           # Motor Canvas 2D puro imperativo
        │   ├── engine.ts
        │   ├── camera.ts                     # Transformações afins tela <-> mundo
        │   ├── renderer.ts
        │   ├── spatialIndex.ts               # rbush R-tree
        │   ├── routing\                      # Roteamento ortogonal Manhattan
        │   └── shapes\                       # Renderizadores de formas
        ├── store\                            # Zustand stores
        └── services\                         # Clientes HTTP API
```
