# Handoff Report: Specification Mining for Backend, Database, Auth, Quadros, Grupos e Lixeira

**Agent**: `spec_miner_2`  
**Date**: 2026-11-10T15:25:00Z  
**Target Project**: drawit (Whiteboard de System Design)  
**State Folder**: `c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\spec_miner_2\`  
**Assigned Scope**: Backend stack (Rust/Axum/Tokio/MongoDB), Containerization, Database Schemas, Authentication/JWT/Refresh Token Family, Quadros (Boards), Grupos (Groups), Lixeira (Trash/Retention), REST Contracts, DTOs, and RFC 7807 Error standard.

---

## 1. Observation

Direct observations extracted from authoritative project documentation:
- **`c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\ORIGINAL_REQUEST.md`**:
  - Line 22: *"Backend: Rust com Axum e MongoDB em containers Docker."*
  - Line 23: *"Autenticação: username único e senha, JWT com refresh token gerenciado no backend."*
  - Line 24: *"Quadros: título obrigatório apenas no backend, com frontend gerando título sequencial padrão (`Quadro-1`, `Quadro-2`)."*
  - Line 26: *"Decisões em aberto (Seção 14 da Spec): adotar como padrão as propostas recomendadas no próprio documento da Spec (deleção de grupo movendo quadros para "Sem grupo" por padrão; retenção de lixeira de 30 dias; tags livres por quadro; grupos de nível único no MVP; idioma pt-BR com estrutura para i18n; JWT HS256 em desenvolvimento)."*
  - Lines 31-32: *"Estratégia de testes por tarefa: definição prévia de testes de comportamento (TDD) — unitários para regras de domínio e motor matemático do canvas, integração para rotas HTTP/MongoDB... Modelagem de dados e contratos de API com validação estrita nas fronteiras (DTOs/schemas), tratamento de erros contextualizado e garantia de idempotência."*

- **`c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\Spec — Whiteboard de System Design.md`**:
  - Lines 29-36: Premissas do projeto: local-first via Docker, Rust + Axum + MongoDB, autenticação JWT com refresh token no backend, baixa concorrência de usuários mas estrito isolamento por `ownerId`.
  - Lines 54-62: RF-A01 a RF-A06 (Username único, login/logout, renovação automática via refresh token, isolamento de recursos, logout-all em P1).
  - Lines 65-79: RF-Q01 a RF-Q12 (Criar quadro com título obrigatório no backend e default `Quadro-N` no frontend, listar, abrir cena/viewport, renomear, mover para lixeira, restaurar, excluir definitivo, autosave com estado, histórico de versões em P1).
  - Lines 82-97: RF-O01 a RF-O06 (Grupos CRUD, visão 'Sem grupo', tags livres por quadro, filtros por tags e busca por título, ordenação por nome, data de criação e atualização). Regra de deleção de grupo movendo quadros para 'Sem grupo' por padrão (`?boards=move|trash`).
  - Lines 162-168: Persistência e concorrência: *"Autosave com debounce de 1 a 2 s... Controle de concorrência otimista: cada cena tem um revision; salvar com revisão desatualizada retorna conflito (409), evitando sobrescrever edições feitas em outra aba... Formato da cena com schemaVersion e migrações."*
  - Lines 170-178: Segurança: Senhas com Argon2id, validação de entrada em todas as rotas, isolamento por `ownerId`, rate limiting em login/refresh, cookies `HttpOnly`, `SameSite=Strict`, `Path=/api/auth`.
  - Lines 192-225: Mecanismos de autenticação: Access token JWT HS256 (15 min), refresh token opaco (256 bits, hash SHA-256 em banco, rotação a cada uso, detecção de reuso com revogação da família completa, TTL de 7 dias no Mongo).
  - Lines 228-243: Coleções MongoDB: separação explícita entre `boards` (metadados leves para listagens rápidas) e `board_scenes` (documento 1:1 contendo array de elementos e viewport com versionamento otimista).
  - Lines 307-313: Arquitetura Rust: Axum, Tokio, Tower-HTTP, Serde, MongoDB official driver, Tracing, Utoipa, Validator.
  - Lines 334-349: Docker Compose: 3 serviços (`frontend`, `backend`, `mongo`) com redes internas, volumes persistentes e healthchecks.
  - Lines 350-394: Endpoints REST e convenções (JSON camelCase, ISO 8601 UTC, formato de erro padronizado).
  - Lines 432-439: Resolução definitiva dos 7 pontos em aberto da Seção 14.

---

## 2. Logic Chain

A partir das especificações e requisitos levantados, desdobramos toda a arquitetura de backend, persistência, contratos de API e regras de negócio.

### 2.1 Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Auth | User Registration | Criação de conta com username único e senha | `POST /api/auth/register` `{ username, password }` | `201 Created` `{ user: { id, username, createdAt }, accessToken }` + Cookie `refresh_token` | `400` se regex/tamanho inválido, `409` se username já existe | Spec §3.1, §5.4 |
| 2 | Auth | User Login | Autenticação com verificação Argon2id e geração de par de tokens | `POST /api/auth/login` `{ username, password }` | `200 OK` `{ user: { id, username }, accessToken }` + Cookie `refresh_token` | `401` se credenciais inválidas, `429` se rate limit excedido | Spec §3.1, §5.1, §5.4 |
| 3 | Auth | Token Refresh & Family Rotation | Rotação atômica de refresh token e emissão de novo JWT access token | `POST /api/auth/refresh` (cookie `refresh_token`) | `200 OK` `{ accessToken }` + novo Cookie `refresh_token` | `401` se token inválido/expirado; revoga família se reuso for detectado | Spec §5.3, §5.4 |
| 4 | Auth | Logout | Revogação do refresh token atual e invalidação de cookie | `POST /api/auth/logout` (cookie `refresh_token`) | `204 No Content` + clear cookie | `401` se não autenticado / sem cookie | Spec §5.1, §5.4 |
| 5 | Auth | Logout All Sessions | Revogação em massa de todos os refresh tokens do usuário autenticado (P1) | `POST /api/auth/logout-all` (Bearer JWT) | `204 No Content` + clear cookie | `401` se token inválido | Spec §3.1, §5.4 |
| 6 | Auth | Current User Profile | Consulta dos dados e preferências do usuário autenticado | `GET /api/auth/me` (Bearer JWT) | `200 OK` `{ id, username, preferences, createdAt }` | `401` se token inválido ou expirado | Spec §5.4 |
| 7 | Quadros | Create Board | Criação de quadro com metadados e inicialização de cena vazia (rev=1) | `POST /api/boards` `{ title, groupId?, tags? }` | `201 Created` `{ id, title, groupId, tags, isFavorite, createdAt, updatedAt }` | `422` se title ausente/inválido (>120 chars), `404` se groupId não pertencer ao usuário | Spec §3.2, §9.2 |
| 8 | Quadros | List Boards | Listagem paginada (cursor) com filtros por grupo, tag, busca e favorito | `GET /api/boards?groupId=&tags=&q=&favorite=&sort=&cursor=&limit=` | `200 OK` `{ items: BoardSummary[], nextCursor, totalCount }` | `400` se parâmetros inválidos; sempre isolado por `ownerId` | Spec §3.2, §3.3, §9.2 |
| 9 | Quadros | Get Board Metadata | Recuperação de metadados de um quadro específico | `GET /api/boards/:id` | `200 OK` `BoardDetailDto` | `404` se não existir ou pertencer a outro usuário | Spec §9.2 |
| 10 | Quadros | Update Board Metadata | Alteração de título, grupo associado, tags ou status de favorito | `PATCH /api/boards/:id` `{ title?, groupId?, tags?, isFavorite? }` | `200 OK` `BoardDetailDto` | `404` se quadro ou groupId não existir; `422` se título inválido | Spec §3.2, §9.2 |
| 11 | Quadros | Soft Delete (Move to Trash) | Envio de quadro para a lixeira marcando `is_deleted = true` e `deleted_at = now` | `DELETE /api/boards/:id` | `200 OK` `{ id, isDeleted: true, deletedAt }` | `404` se quadro não existir ou pertencer a outro usuário | Spec §3.2, §9.2 |
| 12 | Quadros | Restore Board from Trash | Restauração de quadro da lixeira para a listagem ativa | `POST /api/boards/:id/restore` | `200 OK` `BoardDetailDto` | `404` se não estiver na lixeira; redefine grupo para null se grupo original foi deletado | Spec §3.2, §9.2 |
| 13 | Quadros | Permanent Delete Board | Exclusão física irreversível do quadro, sua cena e versões | `DELETE /api/boards/:id/permanent` | `204 No Content` | `404` se quadro não existir ou pertencer a outro usuário | Spec §3.2, §9.2 |
| 14 | Quadros | Duplicate Board | Duplicação de metadados e clonagem da cena atual com nova revisão | `POST /api/boards/:id/duplicate` `{ title? }` | `201 Created` `BoardDetailDto` | `404` se quadro original não existir | Spec §3.2, §9.2 |
| 15 | Cena | Get Board Scene | Obtenção do conteúdo completo da cena (elementos e viewport) | `GET /api/boards/:id/scene` | `200 OK` `{ boardId, schemaVersion, revision, viewport, elements, updatedAt }` | `404` se quadro não existir ou estiver deletado | Spec §6.1, §9.2 |
| 16 | Cena | Update Scene (Autosave OCC) | Salvamento atômico da cena com controle de concorrência otimista | `PUT /api/boards/:id/scene` `{ revision, viewport, elements }` | `200 OK` `{ revision: rev + 1, updatedAt }` | `409 Conflict` se `revision` fornecido != `revision` atual do banco | Spec §4.3, §9.2 |
| 17 | Cena | Version History (P1) | Listagem e restauração de snapshots versionados da cena | `GET /api/boards/:id/versions` / `POST .../restore` | `200 OK` lista de versões / snapshot restaurado | `404` se versão ou quadro não existir | Spec §6.1, §9.2 |
| 18 | Grupos | List Groups | Listagem dos grupos do usuário com contagem agregada de quadros ativos | `GET /api/groups` | `200 OK` `GroupSummaryDto[]` (inclui `boardCount`) | `401` se não autenticado | Spec §3.3, §9.1 |
| 19 | Grupos | Create Group | Criação de novo grupo (nome único por usuário no MVP) | `POST /api/groups` `{ name, color?, icon? }` | `201 Created` `GroupDto` | `409` se nome do grupo já existir para o usuário; `422` se nome vazio | Spec §3.3, §9.1 |
| 20 | Grupos | Update Group | Renomeação e atualização visual (cor/ícone) do grupo | `PATCH /api/groups/:id` `{ name?, color?, icon? }` | `200 OK` `GroupDto` | `404` se não existir; `409` se novo nome colidir com grupo existente | Spec §3.3, §9.1 |
| 21 | Grupos | Delete Group & Board Cascade | Exclusão de grupo com política: mover quadros para "Sem grupo" ou enviar à lixeira | `DELETE /api/groups/:id?boards=move\|trash` | `200 OK` `{ deletedGroupId, affectedBoardsCount, policyApplied }` | `404` se grupo não existir; `400` se parâmetro `boards` for inválido | Spec §3.3, §9.1, §14.2 |
| 22 | Lixeira | List Trashed Boards | Listagem de quadros na lixeira com dias restantes de retenção (30 dias) | `GET /api/trash` | `200 OK` `TrashItemDto[]` (contém `retentionDaysLeft`) | `401` se não autenticado | Spec §3.2, §14.3 |
| 23 | Lixeira | Empty Trash | Exclusão física definitiva de todos os quadros da lixeira do usuário | `POST /api/trash/empty` | `200 OK` `{ purgedCount }` | `401` se não autenticado | Spec §3.2, §14.3 |
| 24 | Lixeira | Automated 30-Day Purge | Job em background (Tokio) para remoção de quadros com `deleted_at <= now - 30d` | Background Cron / Tokio Interval | Execução silenciosa com log estruturado `tracing` | Não falha a API principal | Spec §14.3 |
| 25 | Tags | List Tags with Usage | Obtenção das tags do usuário com contagem agregada para autocomplete e filtro | `GET /api/tags` | `200 OK` `{ tag: string, count: number }[]` | `401` se não autenticado | Spec §3.3, §9.3 |
| 26 | Componentes | List IT Components | Catálogo estático/versionado de componentes nativos de TI com SVG e metadados | `GET /api/components` | `200 OK` `ComponentDto[]` | `200` com lista vazia caso não haja seed | Spec §7.1, §9.3 |
| 27 | Preferências | User Preferences | Consulta e atualização de preferências de tema ("light", "dark", "system") e idioma | `GET /api/me/preferences`, `PATCH /api/me/preferences` | `200 OK` `{ theme, language }` | `422` se valores de tema/idioma não forem suportados | Spec §4.1, §9.3 |
| 28 | Observabilidade | Health & Ready Endpoints | Health check de liveness e readiness com ping no MongoDB | `GET /health`, `GET /ready` | `200 OK` `{ status: "ok" }` / `{ status: "ready", mongo: "connected" }` | `503 Service Unavailable` se MongoDB estiver inacessível | Spec §4.6 |

---

### 2.2 Edge Cases

| # | Feature | Input / Condition | Expected & Observed Behavior |
|---|---------|-------------------|-----------------------------|
| 1 | Register | Username com espaços ou caracteres especiais (ex: `user @!`) | Rejeição imediata com `422 Unprocessable Content`, RFC 7807 detail especificando padrão `^[a-zA-Z0-9_-]{3,30}$`. |
| 2 | Register | Colisão de username com caixa diferente (ex: `Luiz` vs `luiz`) | Rejeição com `409 Conflict`. O backend normaliza username para minúsculas antes da persistência ou usa índice collation case-insensitive. |
| 3 | Login | Credenciais incorretas repetidas mais de 5 vezes em 5 minutos | Rate limiter do Axum bloqueia chamadas com `429 Too Many Requests` informando header `Retry-After`. |
| 4 | Token Refresh | Refresh token opaco enviado duas vezes (replay / race condition) | Detecção de reuso de token: a família inteira (`family_id`) é revogada na base, cookie é limpo e retorna `401 Unauthorized` com código `TOKEN_REUSE_DETECTED`. |
| 5 | Token Refresh | Refresh token expirado pelo TTL do MongoDB | Retorna `401 Unauthorized`, limpando cookie no frontend para redirecionamento ao login. |
| 6 | Board Creation | Frontend não envia título ou envia string vazia / espaços | Se enviado em branco, o backend rejeita com `422 Validation Error` (título é obrigatório no backend). O frontend deve sempre enviar o nome calculado sequencial `Quadro-N`. |
| 7 | Board Creation | Título com mais de 120 caracteres ou contendo tags HTML maliciosas | Backend sanitiza strings (trim) e rejeita strings > 120 caracteres com `422`. |
| 8 | Board Listing | Paginação de quadros quando documentos são inseridos durante navegação | Uso de paginação estável por cursor (Base64 codificando `updatedAt` e `_id`), impedindo itens duplicados ou pulados. |
| 9 | Scene Autosave | Edição simultânea em duas abas (Aba A com rev 2 salva rev 3; Aba B tenta salvar rev 2) | Aba B recebe `409 Conflict` contendo a revisão atual do servidor. O frontend da Aba B pausa o autosave e alerta o usuário para recarregar ou mesclar. |
| 10 | Scene Autosave | Envio de cena com payload excessivo (> 10 MB de JSON ou > 10.000 elementos) | Middleware `tower_http::limit::RequestBodyLimitLayer` corta requisição com `413 Payload Too Large` protegendo memória e limite BSON de 16MB. |
| 11 | Board Deletion | Quadro enviado para a lixeira enquanto a aba do canvas ainda está aberta | Ao tentar autosave posterior na cena, o backend retorna `404 Not Found` ou `410 Gone` pois o quadro está com `is_deleted = true`. |
| 12 | Group Deletion | Deleção de grupo com parâmetro padrão omitido (`DELETE /api/groups/:id`) | Aplica política padrão da Seção 14: executa `updateMany` nos quadros daquele grupo desvinculando-os (`groupId: null`, tornando-os "Sem grupo"). |
| 13 | Group Deletion | Deleção de grupo com parâmetro explícito `?boards=trash` | Envia todos os quadros ativos daquele grupo para a lixeira (`is_deleted: true`, `deleted_at: now()`). |
| 14 | Board Restore | Restauração de quadro cujo grupo original foi deletado no intervalo | O backend detecta que o `groupId` original não existe mais e restaura o quadro com `groupId = null` ("Sem grupo") sem falhar. |
| 15 | Trash Empty | Execução de esvaziamento de lixeira com lixeira já vazia | Operação idempotente: retorna `200 OK` com `purgedCount: 0`. |
| 16 | Trash 30-Day Purge | Job em background encontra quadros com mais de 30 dias na lixeira | Remove documentos em lote de `boards`, `board_scenes` e `board_versions`, registrando métrica em log estruturado. |
| 17 | Tags Filtering | Busca por múltiplas tags (ex.: `?tags=arquitetura&tags=backend`) | Operador `$all` do MongoDB: retorna apenas quadros que possuem todas as tags especificadas. |
| 18 | Resource Isolation | Usuário A tenta ler, alterar ou deletar quadro ou grupo pertencente ao Usuário B | A consulta MongoDB inclui sempre `{ _id: id, owner_id: current_user_id }`. Se não encontrar, retorna `404 Not Found` (não `403` para evitar vazamento de existência de IDs). |

---

### 2.3 Backend Tech Stack & Architectural Layers

O backend deve ser implementado em **Rust** utilizando o ecossistema assíncrono padrão da indústria:
- **Web Framework**: `axum` (v0.7+) montado sobre `tokio` (multi-threaded runtime) e `tower` / `tower-http` (camadas de middleware para CORS, tracing, timeout e limites de payload).
- **Driver de Banco de Dados**: `mongodb` (v2.8+ / v3) com suporte assíncrono nativo para Tokio e serialização direta via `serde` e `bson`.
- **Criptografia & Segurança**:
  - `argon2`: Argon2id para hash e verificação de senhas (configuração OWASP: m=65536, t=3, p=4).
  - `jsonwebtoken`: Emissão e validação de tokens JWT (HS256 com chave simétrica via variável de ambiente `JWT_SECRET`; estrutura pronta para chave assimétrica RS256/EdDSA).
  - `sha2`: SHA-256 para computar hashes dos tokens de atualização opacos antes de armazenar no MongoDB.
  - `rand`: Gerador criptográfico seguro de números aleatórios (`OsRng`) para gerar tokens opacos de 256 bits.
- **Serialização & Validação**:
  - `serde`, `serde_json`, `bson`: Serialização/deserialização robusta com atributos `#[serde(rename_all = "camelCase")]`.
  - `validator`: Validação declarativa de entrada de dados em DTOs.
- **Observabilidade**:
  - `tracing` e `tracing-subscriber`: Logs estruturados em formato JSON (em containers) com span contextualizado por requisição HTTP (`request_id` propagado por `tower_http::trace::TraceLayer`).
  - Endpoints de probe: `/health` (liveness) e `/ready` (readiness verificando conexão ativa com o MongoDB).

#### Camadas Arquiteturais (Clean Architecture / Hexagonal)
```
src/
├── domain/             # Entidades de domínio puras, Value Objects e Erros de Negócio
│   ├── auth/           # User, RefreshToken, PasswordHash, Claims
│   ├── board/          # Board, BoardMetadata, Viewport, CanvasElement
│   ├── group/          # Group, GroupName
│   └── errors.rs       # DomainError enum
├── repositories/       # Portas e adaptadores de persistência (MongoDB)
│   ├── traits.rs       # Interfaces (UserRepository, BoardRepository, etc.)
│   └── mongo/          # Implementações concretas com BSON queries e índices
├── services/           # Casos de uso e orquestração de regras de negócio
│   ├── auth_service.rs
│   ├── board_service.rs
│   ├── group_service.rs
│   └── trash_service.rs
├── routes/             # Handlers HTTP Axum, extração de DTOs e roteamento
│   ├── auth_routes.rs
│   ├── board_routes.rs
│   ├── group_routes.rs
│   ├── trash_routes.rs
│   └── health_routes.rs
├── middleware/         # Middlewares customizados
│   ├── auth_guard.rs   # Extrator AuthUser a partir do Bearer JWT
│   └── rate_limit.rs   # Limitador de requisições sensíveis
├── config/             # Carregamento de variáveis de ambiente com validação
└── main.rs             # Bootstrap do servidor Tokio, pooling Mongo e shutdown graceful
```

---

### 2.4 Containerization (Docker & docker-compose)

O ambiente de desenvolvimento opera estritamente via Docker, composto por 3 serviços orquestrados via `docker-compose.yml`:

```yaml
version: '3.8'

services:
  mongo:
    image: mongo:7.0
    container_name: drawit_mongo
    restart: unless-stopped
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_DATABASE: drawit
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - drawit_network

  backend:
    build:
      context: ./api
      dockerfile: Dockerfile.dev
    container_name: drawit_backend
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      APP_PORT: 8080
      MONGO_URL: mongodb://mongo:27017/drawit
      JWT_SECRET: "drawit_dev_secret_key_minimum_32_bytes_super_secure!"
      JWT_EXPIRATION_MINUTES: 15
      REFRESH_TOKEN_EXPIRATION_DAYS: 7
      FRONTEND_ORIGIN: http://localhost:3000
      RUST_LOG: info,drawit_backend=debug
    volumes:
      - ./api:/app
      - cargo_cache:/usr/local/cargo
      - target_cache:/app/target
    depends_on:
      mongo:
        condition: service_healthy
    networks:
      - drawit_network

  frontend:
    build:
      context: ./web
      dockerfile: Dockerfile.dev
    container_name: drawit_frontend
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      VITE_API_URL: http://localhost:8080/api
    volumes:
      - ./web:/app
      - /app/node_modules
    networks:
      - drawit_network

volumes:
  mongo_data:
  cargo_cache:
  target_cache:

networks:
  drawit_network:
    driver: bridge
```

---

### 2.5 Data Models & Schemas (MongoDB Collections)

#### 1. Collection: `users`
Armazena a identidade do usuário, credenciais com hash seguro e preferências.
```json
{
  "_id": "ObjectId",
  "username": "luiz_dev",
  "passwordHash": "$argon2id$v=19$m=65536,t=3,p=4$...",
  "preferences": {
    "theme": "system",
    "language": "pt-BR"
  },
  "createdAt": "2026-11-10T15:00:00.000Z",
  "updatedAt": "2026-11-10T15:00:00.000Z"
}
```
- **Índices**:
  - `{ "username": 1 }`: `unique: true`, com `collation: { locale: "en", strength: 2 }` para unicidade case-insensitive.

#### 2. Collection: `refresh_tokens`
Garante a renovação segura da sessão, controle de família de tokens e detecção de reuso.
```json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "familyId": "uuid-v4-string",
  "tokenHash": "sha256-hex-digest-of-opaque-token",
  "expiresAt": "2026-11-17T15:00:00.000Z",
  "revokedAt": null,
  "replacedBy": null,
  "userAgent": "Mozilla/5.0 ...",
  "createdAt": "2026-11-10T15:00:00.000Z"
}
```
- **Índices**:
  - `{ "tokenHash": 1 }`: `unique: true`.
  - `{ "userId": 1 }`: busca rápida de sessões do usuário.
  - `{ "familyId": 1 }`: revogação em cadeia da família caso ocorra reuso detectado.
  - `{ "expiresAt": 1 }`: TTL index (`expireAfterSeconds: 0`) para limpeza automática pelo próprio MongoDB.

#### 3. Collection: `groups`
Coleções/pastas para organização dos quadros (nível único no MVP).
```json
{
  "_id": "ObjectId",
  "ownerId": "ObjectId",
  "name": "Backend Architecture",
  "color": "#3b82f6",
  "icon": "server",
  "parentId": null,
  "createdAt": "2026-11-10T15:00:00.000Z",
  "updatedAt": "2026-11-10T15:00:00.000Z"
}
```
- **Índices**:
  - `{ "ownerId": 1, "name": 1 }`: `unique: true` (nomes de grupos únicos por usuário).
  - `{ "ownerId": 1 }`: consulta de todos os grupos do usuário.

#### 4. Collection: `boards` (Metadados Leves)
Separado da cena pesada para permitir listagens rápidas e leves com filtros complexos.
```json
{
  "_id": "ObjectId",
  "ownerId": "ObjectId",
  "groupId": "ObjectId | null",
  "title": "Quadro-1",
  "tags": ["auth", "microservices"],
  "isFavorite": false,
  "thumbnail": null,
  "isDeleted": false,
  "deletedAt": null,
  "lastOpenedAt": "2026-11-10T15:10:00.000Z",
  "createdAt": "2026-11-10T15:00:00.000Z",
  "updatedAt": "2026-11-10T15:10:00.000Z"
}
```
- **Índices**:
  - `{ "ownerId": 1, "isDeleted": 1, "updatedAt": -1 }`: listagem principal ordenada.
  - `{ "ownerId": 1, "groupId": 1, "isDeleted": 1 }`: filtro por grupo ativo.
  - `{ "ownerId": 1, "tags": 1, "isDeleted": 1 }`: filtro por tags ativas.
  - `{ "ownerId": 1, "isFavorite": 1, "isDeleted": 1 }`: filtro de favoritos.
  - `{ "ownerId": 1, "deletedAt": 1 }`: listagem da lixeira e retenção de 30 dias.
  - Text Index `{ "title": "text", "tags": "text" }` para pesquisa textual rápida.

#### 5. Collection: `board_scenes` (Canvas State & Concorrência Otimista)
Armazena os elementos visuais, estado da câmera (viewport) e número sequencial de revisão.
```json
{
  "_id": "ObjectId (mesmo id do board)",
  "schemaVersion": 1,
  "revision": 3,
  "viewport": {
    "x": 100.0,
    "y": 50.0,
    "zoom": 1.25
  },
  "elements": [
    {
      "id": "c1f7b882-945f-4a0b-8d65-4f32e987c123",
      "type": "component",
      "x": 200,
      "y": 150,
      "width": 80,
      "height": 80,
      "rotation": 0,
      "zIndex": 1,
      "groupIds": [],
      "locked": false,
      "style": {
        "strokeColor": "#3b82f6",
        "fillColor": "transparent",
        "strokeWidth": 2,
        "strokeStyle": "solid",
        "opacity": 100,
        "effect": {
          "type": "none",
          "intensity": 0,
          "color": "#000000"
        }
      },
      "componentKey": "database-sql",
      "label": "PostgreSQL Main",
      "version": 1
    }
  ],
  "updatedAt": "2026-11-10T15:15:00.000Z"
}
```
- **Índices**:
  - `_id: 1` (Primary Key, 1:1 com `boards`).

#### 6. Collection: `component_library` (Catálogo IT)
```json
{
  "_id": "ObjectId",
  "key": "database-sql",
  "name": "Database (SQL)",
  "category": "data",
  "svg": "<svg viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"currentColor\">...</svg>",
  "defaultSize": { "width": 80, "height": 80 },
  "anchorPoints": [
    { "id": "top", "x": 0.5, "y": 0.0 },
    { "id": "right", "x": 1.0, "y": 0.5 },
    { "id": "bottom", "x": 0.5, "y": 1.0 },
    { "id": "left", "x": 0.0, "y": 0.5 }
  ],
  "version": 1
}
```
- **Índices**: `{ "key": 1 }` com `unique: true`.

---

### 2.6 Authentication & Cryptographic Security

1. **Password Hashing (Argon2id)**:
   - Utiliza a implementação segura em Rust `argon2`.
   - Salt criptográfico gerado por `OsRng` (16 bytes).
   - Saída serializada em formato PHC string padronizado (`$argon2id$...`).
2. **Access Token (JWT)**:
   - Algoritmo: `HS256` para ambiente de desenvolvimento local (configurado via `JWT_SECRET`). Arquitetura desacoplada via trait para suportar chave assimétrica `RS256`/`EdDSA` em produção.
   - Tempo de expiração: 15 minutos (`exp = iat + 900`).
   - Claims:
     ```json
     {
       "sub": "65f1a2b3c4d5e6f7a8b9c0d1",
       "username": "luiz_dev",
       "iat": 1794322800,
       "exp": 1794323700,
       "jti": "550e8400-e29b-41d4-a716-446655440000"
     }
     ```
3. **Refresh Token & Family Rotation**:
   - Token opaco: gerado via 32 bytes randômicos seguros (CSPRNG), convertidos para Base64 URL-safe (sem padding).
   - Armazenamento: apenas o hash SHA-256 do token é gravado na coleção `refresh_tokens`.
   - Cookie seguro:
     `Set-Cookie: refresh_token=<token>; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=604800; [Secure]` (Secure desligado apenas quando `FRONTEND_ORIGIN` for HTTP local).
   - **Fluxo de Rotação e Detecção de Reuso**:
     - Cada login gera um novo `family_id` (UUID).
     - Quando `POST /api/auth/refresh` é chamado:
       1. Se o token não for encontrado: retorna `401 Unauthorized`.
       2. Se o token for encontrado e já estiver com `revoked_at != null`: **Reuso Malicioso Detectado!** O backend revoga imediatamente todos os tokens com o mesmo `family_id` no MongoDB, limpa o cookie e retorna `401 Unauthorized` com erro `TOKEN_REUSE_DETECTED`.
       3. Se for válido: marca o token atual como revogado (`revoked_at = now()`, `replaced_by = new_token_hash`), emite um novo token opaco mantendo o mesmo `family_id`, insere o novo hash no banco, emite novo JWT e atualiza o cookie.
4. **Axum Auth Guard Middleware**:
   - Extrai o cabeçalho `Authorization: Bearer <token>`.
   - Decodifica e valida assinatura e expiração do JWT.
   - Injeta a struct `AuthUser { pub id: ObjectId, pub username: String }` no request via `Extension(AuthUser)`.
   - Se inválido ou ausente: retorna `401 Unauthorized` imediatamente no padrão RFC 7807.

---

### 2.7 Optimistic Concurrency Control (OCC) Architecture

Para autosave contínuo sem locks em banco de dados:
1. Ao carregar a tela de edição (`GET /api/boards/:id/scene`), o frontend recebe o número atual de `revision` (ex.: `revision = 4`).
2. A cada salvamento (`PUT /api/boards/:id/scene` com debounce de 1 a 2s), o frontend envia o payload contendo o `revision` que ele tinha conhecimento.
3. O repositório executa a query atômica no MongoDB:
   ```rust
   let filter = doc! {
       "_id": board_id,
       "revision": payload.revision
   };
   let update = doc! {
       "$set": {
           "viewport": to_bson(&payload.viewport)?,
           "elements": to_bson(&payload.elements)?,
           "updatedAt": BsonDateTime::now()
       },
       "$inc": {
           "revision": 1
       }
   };
   let result = scene_collection.update_one(filter, update, None).await?;
   ```
4. **Tratamento do Resultado**:
   - Se `result.matched_count == 1`: Sucesso. Retorna `200 OK` com `{ "revision": payload.revision + 1, "updatedAt": now }`.
   - Se `result.matched_count == 0`: Conflito de concorrência detectado (ou documento inexistente).
     - O backend faz um `find_one` no ID:
       - Se não existir: retorna `404 Not Found`.
       - Se existir com `revision > payload.revision`: retorna `409 Conflict` (RFC 7807) contendo a revisão atual do servidor.
       - O frontend exibe estado de conflito no indicador de salvamento e impede sobreposição cega.

---

### 2.8 Standard Error Model: RFC 7807 Problem Details

Todas as falhas da API retornam `Content-Type: application/problem+json` com campos padronizados:

#### Estrutura RFC 7807
```json
{
  "type": "https://drawit.local/errors/concurrency-conflict",
  "title": "Conflict",
  "status": 409,
  "detail": "A revisão da cena enviada (3) está desatualizada em relação ao servidor (4).",
  "instance": "/api/boards/65f1a2b3c4d5e6f7a8b9c0d1/scene",
  "code": "CONCURRENCY_CONFLICT",
  "invalid_params": []
}
```

#### Erro de Validação de Campos (HTTP 422)
```json
{
  "type": "https://drawit.local/errors/validation-error",
  "title": "Unprocessable Content",
  "status": 422,
  "detail": "Falha na validação dos campos da requisição.",
  "instance": "/api/boards",
  "code": "VALIDATION_FAILED",
  "invalid_params": [
    {
      "name": "title",
      "reason": "O título do quadro é obrigatório e deve ter entre 1 e 120 caracteres."
    }
  ]
}
```

*Nota de compatibilidade*: O campo de extensão `code` e a estrutura mantêm compatibilidade total tanto com o RFC 7807 quanto com o esquema simplificado da Spec v0.2 (`{ error: { code, message, details } }`).

---

### 2.9 Complete REST API Contracts & DTOs

#### Autenticação (`/api/auth`)

##### 1. `POST /api/auth/register`
- **Request DTO**:
  ```json
  {
    "username": "luiz_dev",
    "password": "SecurePassword123!"
  }
  ```
  - `username`: String, regex `^[a-zA-Z0-9_-]{3,30}$`.
  - `password`: String, 8 a 128 caracteres.
- **Response `201 Created`**:
  ```json
  {
    "user": {
      "id": "65f1a2b3c4d5e6f7a8b9c0d1",
      "username": "luiz_dev",
      "preferences": {
        "theme": "system",
        "language": "pt-BR"
      },
      "createdAt": "2026-11-10T15:00:00Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsIn..."
  }
  ```
  - Headers: `Set-Cookie: refresh_token=...; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=604800`

##### 2. `POST /api/auth/login`
- **Request DTO**:
  ```json
  {
    "username": "luiz_dev",
    "password": "SecurePassword123!"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "user": {
      "id": "65f1a2b3c4d5e6f7a8b9c0d1",
      "username": "luiz_dev",
      "preferences": {
        "theme": "system",
        "language": "pt-BR"
      }
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsIn..."
  }
  ```
  - Headers: `Set-Cookie: refresh_token=...; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=604800`

##### 3. `POST /api/auth/refresh`
- **Request**: Sem body. Lê cookie `refresh_token`.
- **Response `200 OK`**:
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsIn..."
  }
  ```
  - Headers: `Set-Cookie: refresh_token=<new_token>; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=604800`

##### 4. `POST /api/auth/logout`
- **Request**: Sem body. Lê cookie `refresh_token`.
- **Response `204 No Content`**:
  - Headers: `Set-Cookie: refresh_token=; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=0`

##### 5. `GET /api/auth/me`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response `200 OK`**:
  ```json
  {
    "id": "65f1a2b3c4d5e6f7a8b9c0d1",
    "username": "luiz_dev",
    "preferences": {
      "theme": "system",
      "language": "pt-BR"
    },
    "createdAt": "2026-11-10T15:00:00Z"
  }
  ```

---

#### Grupos (`/api/groups`)

##### 1. `GET /api/groups`
- **Response `200 OK`**:
  ```json
  [
    {
      "id": "65f1a2b3c4d5e6f7a8b9c0a1",
      "name": "Microsserviços",
      "color": "#3b82f6",
      "icon": "server",
      "boardCount": 5,
      "createdAt": "2026-11-10T15:00:00Z",
      "updatedAt": "2026-11-10T15:00:00Z"
    }
  ]
  ```

##### 2. `POST /api/groups`
- **Request DTO**:
  ```json
  {
    "name": "Microsserviços",
    "color": "#3b82f6",
    "icon": "server"
  }
  ```
  - `name`: String, 1 a 60 caracteres, único por usuário.
  - `color`: String opcional (hex color).
  - `icon`: String opcional (identificador de ícone).
- **Response `201 Created`**: Retorna `GroupDto`.

##### 3. `PATCH /api/groups/:id`
- **Request DTO**:
  ```json
  {
    "name": "Arquitetura Distribuída",
    "color": "#10b981",
    "icon": "network"
  }
  ```
- **Response `200 OK`**: Retorna `GroupDto` atualizado.

##### 4. `DELETE /api/groups/:id?boards=move|trash`
- **Query Params**:
  - `boards`: enum `"move"` | `"trash"`. Default da Seção 14: `"move"`.
- **Response `200 OK`**:
  ```json
  {
    "deletedGroupId": "65f1a2b3c4d5e6f7a8b9c0a1",
    "affectedBoardsCount": 5,
    "policyApplied": "move"
  }
  ```

---

#### Quadros (`/api/boards`)

##### 1. `GET /api/boards`
- **Query Params**:
  - `groupId`: ObjectId string ou `"none"` para buscar sem grupo.
  - `tags`: Array de strings (ex.: `?tags=auth&tags=api`).
  - `q`: String para busca textual.
  - `favorite`: Booleano (`true` | `false`).
  - `sort`: `"name" | "createdAt" | "updatedAt" | "-name" | "-createdAt" | "-updatedAt"`. Default: `"-updatedAt"`.
  - `limit`: Integer (1 a 100, default 20).
  - `cursor`: String opcional base64 para paginação.
- **Response `200 OK`**:
  ```json
  {
    "items": [
      {
        "id": "65f1a2b3c4d5e6f7a8b9c0d1",
        "title": "Quadro-1",
        "groupId": "65f1a2b3c4d5e6f7a8b9c0a1",
        "groupName": "Microsserviços",
        "tags": ["auth", "redis"],
        "isFavorite": false,
        "thumbnail": null,
        "lastOpenedAt": "2026-11-10T15:10:00Z",
        "createdAt": "2026-11-10T15:00:00Z",
        "updatedAt": "2026-11-10T15:10:00Z"
      }
    ],
    "nextCursor": "ZXlKaGJHY2lPaUpJVXpVek5pSXNJbi4uLg==",
    "totalCount": 1
  }
  ```

##### 2. `POST /api/boards`
- **Request DTO**:
  ```json
  {
    "title": "Quadro-1",
    "groupId": "65f1a2b3c4d5e6f7a8b9c0a1",
    "tags": ["auth"]
  }
  ```
  - `title`: String obrigatória no backend (1 a 120 caracteres, trimmed). Frontend gera sequencial (`Quadro-N`).
  - `groupId`: ObjectId opcional (pode ser null).
  - `tags`: Array opcional de strings (máx 20 tags, 1 a 30 caracteres cada).
- **Response `201 Created`**: Retorna `BoardDetailDto`.

##### 3. `GET /api/boards/:id`
- **Response `200 OK`**: Retorna `BoardDetailDto`.

##### 4. `PATCH /api/boards/:id`
- **Request DTO**:
  ```json
  {
    "title": "Arquitetura do Fluxo de Autenticação",
    "groupId": null,
    "tags": ["auth", "security", "jwt"],
    "isFavorite": true
  }
  ```
- **Response `200 OK`**: Retorna `BoardDetailDto` atualizado.

##### 5. `DELETE /api/boards/:id`
- Envia o quadro para a lixeira (`isDeleted = true`, `deletedAt = now()`).
- **Response `200 OK`**:
  ```json
  {
    "id": "65f1a2b3c4d5e6f7a8b9c0d1",
    "isDeleted": true,
    "deletedAt": "2026-11-10T15:20:00Z"
  }
  ```

##### 6. `POST /api/boards/:id/restore`
- Restaura quadro da lixeira (`isDeleted = false`, `deletedAt = null`).
- Se o grupo original não existir mais, desvincula automaticamente (`groupId = null`).
- **Response `200 OK`**: Retorna `BoardDetailDto`.

##### 7. `DELETE /api/boards/:id/permanent`
- Exclusão física definitiva do quadro, da cena e das versões.
- **Response `204 No Content`**.

##### 8. `POST /api/boards/:id/duplicate`
- Duplica metadados com sufixo `" (Cópia)"` e clona o estado da cena com `revision = 1`.
- **Response `201 Created`**: Retorna `BoardDetailDto` do novo quadro criado.

---

#### Conteúdo da Cena (`/api/boards/:id/scene`)

##### 1. `GET /api/boards/:id/scene`
- Retorna o estado completo da cena e atualiza `lastOpenedAt` do quadro.
- **Response `200 OK`**:
  ```json
  {
    "boardId": "65f1a2b3c4d5e6f7a8b9c0d1",
    "schemaVersion": 1,
    "revision": 3,
    "viewport": {
      "x": 0.0,
      "y": 0.0,
      "zoom": 1.0
    },
    "elements": [
      {
        "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "type": "rectangle",
        "x": 100,
        "y": 100,
        "width": 150,
        "height": 80,
        "rotation": 0,
        "zIndex": 1,
        "groupIds": [],
        "locked": false,
        "style": {
          "strokeColor": "#1e1e1e",
          "fillColor": "transparent",
          "strokeWidth": 2,
          "strokeStyle": "solid",
          "opacity": 100,
          "effect": {
            "type": "none",
            "intensity": 0,
            "color": "#000000"
          }
        },
        "version": 1
      }
    ],
    "updatedAt": "2026-11-10T15:15:00Z"
  }
  ```

##### 2. `PUT /api/boards/:id/scene` (Autosave com OCC)
- **Request DTO**:
  ```json
  {
    "revision": 3,
    "viewport": {
      "x": 50.0,
      "y": 80.0,
      "zoom": 1.1
    },
    "elements": [...]
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "revision": 4,
    "updatedAt": "2026-11-10T15:16:02Z"
  }
  ```
- **Error Response `409 Conflict` (se revision != revision no banco)**:
  ```json
  {
    "type": "https://drawit.local/errors/concurrency-conflict",
    "title": "Conflict",
    "status": 409,
    "detail": "A revisão da cena enviada (3) não corresponde à versão mais recente do servidor (4).",
    "instance": "/api/boards/65f1a2b3c4d5e6f7a8b9c0d1/scene",
    "code": "CONCURRENCY_CONFLICT",
    "serverRevision": 4
  }
  ```

---

#### Lixeira (`/api/trash`)

##### 1. `GET /api/trash`
- Lista todos os quadros excluídos logicamente pertencentes ao usuário autenticado, com cálculo dos dias restantes até a purga automática de 30 dias.
- **Response `200 OK`**:
  ```json
  [
    {
      "id": "65f1a2b3c4d5e6f7a8b9c0d1",
      "title": "Diagrama de Teste Antigo",
      "deletedAt": "2026-11-01T10:00:00Z",
      "retentionDaysLeft": 21,
      "tags": ["antigo"]
    }
  ]
  ```

##### 2. `POST /api/trash/empty`
- Esvazia permanentemente a lixeira do usuário atual.
- **Response `200 OK`**:
  ```json
  {
    "purgedCount": 3
  }
  ```

---

#### Tags & Componentes (`/api/tags`, `/api/components`, `/api/me/preferences`)

##### 1. `GET /api/tags`
- Agregação das tags dos quadros ativos do usuário com contadores de utilização.
- **Response `200 OK`**:
  ```json
  [
    { "tag": "arquitetura", "count": 8 },
    { "tag": "database", "count": 5 },
    { "tag": "auth", "count": 3 }
  ]
  ```

##### 2. `GET /api/components`
- Catálogo de componentes nativos de TI (banco de dados, servidor, nuvem, mensageria, etc.).
- **Response `200 OK`**:
  ```json
  [
    {
      "key": "database-sql",
      "name": "Database (SQL)",
      "category": "data",
      "svg": "<svg viewBox=\"0 0 64 64\" fill=\"none\" stroke=\"currentColor\">...</svg>",
      "defaultSize": { "width": 80, "height": 80 },
      "anchorPoints": [
        { "id": "top", "x": 0.5, "y": 0.0 },
        { "id": "right", "x": 1.0, "y": 0.5 },
        { "id": "bottom", "x": 0.5, "y": 1.0 },
        { "id": "left", "x": 0.0, "y": 0.5 }
      ],
      "version": 1
    }
  ]
  ```

##### 3. `GET /api/me/preferences` & `PATCH /api/me/preferences`
- **Request DTO (PATCH)**:
  ```json
  {
    "theme": "dark",
    "language": "pt-BR"
  }
  ```
- **Response `200 OK`**: Retorna preferências atualizadas.

---

### 2.10 Section 14 Open Questions Final Resolution Mapping

| Item | Ponto em Aberto (Seção 14 da Spec) | Decisão Padrão Consolidada | Justificativa Arquitetural & Regra |
|---|---|---|---|
| 1 | Frontend: Canvas próprio vs Konva; Vite vs Next.js | **Canvas 2D próprio + Vite + React + shadcn/ui** | Decidido na ADR-001. React restrito à UI periférica; motor gráfico puro para atingir 60 fps e total controle de zoom/pan/bindings. |
| 2 | Deleção de grupo: Destino dos quadros associados | **Mover para "Sem grupo" por padrão (`?boards=move`)** | Previne perda acidental de documentos do usuário. Permite explicitamente `?boards=trash` caso o usuário confirme o envio dos quadros à lixeira no diálogo da UI. |
| 3 | Lixeira: Retenção e política de limpeza | **Retenção de 30 dias com purga automática** | Background task assíncrona periódica (Tokio interval) executa exclusão permanente de documentos com `deleted_at <= now - 30d`. Permite também esvaziamento manual imediato (`POST /api/trash/empty`). |
| 4 | Tags: Livres por quadro vs Centralizadas | **Tags livres por quadro (Strings livres)** | MVP sem atrito: usuário digita qualquer tag no quadro. Endpoint `/api/tags` agrupa dinamicamente via MongoDB Aggregation Pipeline para busca e autocomplete. |
| 5 | Grupos: Nível único vs Pastas Aninhadas | **Nível único no MVP (campo `parentId: null`)** | Reduz complexidade de queries e recursão no frontend/backend no MVP. O schema MongoDB já inclui `parentId` reservado para permitir subgrupos na Fase 5 sem migrações de dados. |
| 6 | Idiomas: pt-BR vs Multilíngue | **pt-BR como padrão com estrutura para i18n** | Todo texto do backend e schema suporta pt-BR nativamente, com DTOs em inglês/camelCase e preferências de idioma prontas para carregar arquivos de tradução. |
| 7 | Algoritmo do JWT: Simétrico vs Assimétrico | **HS256 em ambiente de desenvolvimento local** | Simplicidade operacional local (única variável `JWT_SECRET`). Arquitetura do backend modular para alternar para RS256/EdDSA via configuração de ambiente. |

---

## 3. Caveats

1. **Colaboração em Tempo Real**: Conforme RF e Seção 1.5, colaboração simultânea (WebSockets/CRDT) está categoricamente fora de escopo no MVP. O sistema garante integridade através de concorrência otimista (OCC) com HTTP 409.
2. **Histórico de Versões da Cena (`board_versions`)**: O schema e o design estão completamente definidos, porém sua ativação pertence à Fase 4 (P1), garantindo que a base inicial (Fase 0 a 3) não sofra com overhead prematuro.
3. **Escala de Usuários**: A premissa do sistema é mono-usuário ou pequenos grupos em ambiente local (`docker-compose`). As decisões privilegiam isolamento estrito por `ownerId` em todas as consultas, sem necessidade de sharding ou microserviços.
4. **Armazenamento de Thumbnails**: Miniaturas visuais dos quadros estão previstas como P1. O campo `thumbnail` no schema `boards` aceita string nula inicialmente.
5. **No caveats adicionais**: Todos os requisitos funcionais P0/P1 para backend, banco de dados, autenticação, quadros, grupos e lixeira foram cobertos.

---

## 4. Conclusion

A especificação técnica e a modelagem do backend para o projeto **drawit** estão rigorosamente detalhadas, mapeadas e prontas para a estruturação do plano de implementação:
1. **Stack Consolidada**: Rust (Axum, Tokio, Tower, Serde, MongoDB official driver, Tracing) empacotado em Docker e Docker Compose com hot reload (`cargo-watch`).
2. **Schemas MongoDB Delimitados**: Separação precisa entre metadados leves (`boards`) e documentos densos de canvas (`board_scenes`), garantindo tempo de resposta < 100ms e escalabilidade.
3. **Segurança de Nível Sênior**: Senhas com Argon2id, Access Token JWT de 15 minutos, Refresh Token opaco com hash SHA-256 no banco, rotação obrigatória a cada renovação e revogação em cascata da família em caso de reuso malicioso.
4. **Contratos REST e RFC 7807**: Endpoints completos com DTOs tipados, validações de fronteira estritas, respostas de erro estruturadas e concorrência otimista via número sequencial de revisão (`revision`).
5. **Todas as Resoluções da Seção 14 Integradas**: Deleção de grupo preservando quadros em "Sem grupo", lixeira com purga de 30 dias, tags livres, grupos de nível único, pt-BR e JWT HS256.

---

## 5. Verification Method

Para verificar de forma independente e reproduzível os modelos e contratos estabelecidos neste relatório:
1. **Inspeção de Arquivos de Origem**:
   - Verificar correspondência das linhas citadas em `c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\Spec — Whiteboard de System Design.md` e `.agents\teamwork\ORIGINAL_REQUEST.md`.
2. **Verificação de Schemas e DTOs no Backend (quando implementado)**:
   - Rodar validação de tipos e testes unitários: `cargo test --package api`
   - Teste de integração de rotas com MongoDB em container: `cargo test --test integration_tests`
   - Teste de rotação e reuso de refresh tokens: `cargo test test_refresh_token_reuse_detection`
   - Teste de concorrência otimista (OCC): `cargo test test_scene_autosave_conflict_409`
3. **Condições de Invalidação**:
   - Este relatório será considerado inválido se:
     - Algum endpoint for implementado sem isolamento estrito por `owner_id`.
     - O salvamento de cena sobrescrever edições sem checagem de `revision`.
     - Senhas forem armazenadas em formato diferente de Argon2id.
     - A deleção de grupo destruir quadros por padrão sem a flag explícita `?boards=trash`.
