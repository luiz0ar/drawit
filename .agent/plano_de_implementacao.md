# Plano de Implementação — Whiteboard de System Design ("drawit")
**Versão**: 1.1 (Refinado com Garantias Matemáticas, de Segurança e Resiliência Concorrente)  
**Data**: 10/11/2026  
**Status**: Planejamento Aprovado para Execução Técnica  
**Diretrizes de Engenharia**: Metodologia `senior-dev` (Make it Work, Make it Right, Follow Practice)  
**Modo de Operação**: `/plan` (Planejamento Arquitetural Estrito)

---

## 1. Document Header & Executive Summary

### 1.1 Resumo Executivo
O **drawit** é uma aplicação web especializada para modelagem visual de arquiteturas de software e system design. Inspirado na simplicidade do Excalidraw, o projeto resolve dois gargalos crônicos das ferramentas de whiteboard genéricas:
1. **Falta de componentes especializados**: Engenheiros perdem tempo desenhando retângulos e cilindros do zero para representar bancos de dados, microsserviços e filas. O drawit entrega uma **biblioteca nativa de componentes de TI estilizáveis** com renderização SVG vetorial direta no canvas.
2. **Organização deficiente de diagramas**: Whiteboards tradicionais deixam arquivos dispersos. O drawit estabelece uma **gestão de quadros de primeira classe**, com grupos em nível único, tags livres, lixeira com retenção de 30 dias, autosave com controle de concorrência otimista (OCC) e pesquisa textual integrada.

### 1.2 Objetivos e Restrições de Engenharia
- **Premissa Local-First & Containerizada**: Execução completa via Docker Compose (`frontend`, `backend`, `mongo`) sem dependência de serviços externos pagos ou em nuvem.
- **Desempenho Estrito**: Garantia de **60 FPS constantes** em operações de pan e zoom com 2.000 elementos renderizados em um notebook convencional (RNF-P01).
- **Integridade Concorrente**: Bloqueio de sobrescrita acidental em múltiplas abas via controle de concorrência otimista (OCC) baseado no atributo `revision` sequencial, emitindo HTTP 409 Conflict padronizado pelo RFC 7807 / RFC 9457 com campo `serverRevision` estendido (RNF-R02).
- **Resiliência de Estado e Autosave**: Arquitetura em 3 níveis (IndexedDB write-ahead cache contínuo, salvamento de descarregamento via `fetch(keepalive)` condicionado à cota de 64KB do navegador e recuperação automática em caso de descarregamento abrupto), eliminando perda de trabalho e falsos conflitos de rede via identificadores de salvamento idempotente (`clientSaveId` e `contentHash`).
- **Segurança Sênior & Isolamento de Runtime**: Criptografia de senhas com Argon2id isolada em thread pool bloqueante (`tokio::task::spawn_blocking`) para evitar inanição do executor assíncrono Tokio; tokens JWT de 15 minutos; refresh tokens opacos (256 bits) com rotação atômica CAS, janela de tolerância de 15 segundos para concorrência multi-abas coordenada por Web Locks API e detecção de reuso com revogação da família completa; isolamento absoluto de inquilino via `ownerId` em todas as consultas e mutações (RNF-SEC01 a SEC04).
- **Precisão Geométrica e Interativa**: Matemática afim exata para rotação de âncoras magnéticas, hit-testing de duas fases com testes geométricos finos específicos por forma (Losango via norma $L_1$, Triângulo via proporção de meia-largura e Cilindro via particionamento em 3 regiões), captura determinística de ponteiro (`setPointerCapture`), supressão do autoscroll nativo do Windows em cliques com botão do meio (`auxclick`), array completo de vértices de mundo em conectores desanexados (`points: [WorldPoint, WorldPoint, ...]`) e reidratação reativa do índice invertido de vínculos em tempo $O(N)$ em eventos de carga, histórico e clipboard.

---

## 2. Decisões Arquiteturais e Baseline Técnico (Spec v0.2 + Seção 14)

### 2.1 Stack Tecnológica Consolidada
- **Frontend**: **React 18 + Vite (TypeScript)** com **motor gráfico Canvas 2D próprio** (`HTMLCanvasElement`, context 2D imperativo). O framework React é restrito à casca periférica (barras de navegação, painéis de propriedades flutuantes, modais e listagens), isolando o loop de renderização de 60fps das re-renderizações do React Fiber (ADR-001). A interface adota **shadcn/ui** (Tailwind CSS + Radix UI) para um visual minimalista e funcional. O gerenciamento de estado do editor utiliza **Zustand**. O traço livre utiliza `perfect-freehand` e o índice espacial de culling/hit-test utiliza a R-tree `rbush`. O armazenamento local resiliente adota IndexedDB (`drawit_offline_db`) como write-ahead log.
- **Backend**: **Rust 1.80+ com Axum e Tokio**. Driver assíncrono oficial `mongodb`, middlewares `tower-http` (CORS, limite de corpo de requisições de 16MB, tracing estruturado, rate limiting), validação de entrada declarativa via `validator`, logs estruturados via `tracing` com correlação por `x-request-id`, erros no padrão RFC 7807 / RFC 9457 com mapa extensível via `#[serde(flatten)]` e documentação OpenAPI via `utoipa`.
- **Banco de Dados**: **MongoDB 7.0** em container Docker dedicado, separando metadados leves (`boards`), documentos densos de tela (`board_scenes`) com isolamento estrito de inquilino (`ownerId`) e histórico de versões (`board_versions`).

### 2.2 Resolução Definitiva dos Pontos da Seção 14 da Spec
1. **Frontend (Canvas próprio vs Konva; Vite vs Next.js)**: Decidido e homologado pela ADR-001: Vite + React + Canvas 2D imperativo próprio. React fica restrito à casca ao redor. Next.js descartado por ausência de benefício de SSR em aplicação restrita a usuários autenticados.
2. **Deleção de Grupo e Destino dos Quadros**: Padrão do sistema: ao deletar um grupo, os quadros associados são automaticamente preservados e movidos para "Sem grupo" (`groupId = null`). A API aceita o parâmetro opcional `?boards=trash` caso o usuário escolha explicitamente descartar os quadros na lixeira.
3. **Lixeira e Política de Retenção com Prevenção de TOCTOU e Zero Storage Leak**: Retenção automática de 30 dias contados a partir de `deletedAt`. Um worker Tokio assíncrono em background realiza purga periódica diária aplicando deleção condicional atômica (`isDeleted: true, deletedAt <= now - 30 dias`) para prevenir corridas TOCTOU contra restaurações simultâneas, cascateando a exclusão física sobre `boards`, `board_scenes` e `board_versions` para eliminar snapshots históricos órfãos. Permite esvaziamento imediato via `POST /api/trash/empty`.
4. **Modelo de Tags**: Tags livres atribuídas diretamente no quadro (array de strings livres normalizadas em caixa baixa). Agregação dinâmica sob demanda no backend (`GET /api/tags`) para prover autocomplete e contagem sem custos de tabela relacional intermediária.
5. **Hierarquia de Grupos**: Nível único de pastas no MVP (`parentId = null`). O campo `parentId` é mantido no schema MongoDB para viabilizar subpastas na Fase 5 sem refatoração de banco de dados.
6. **Internacionalização**: Interface construída nativamente em Português do Brasil (pt-BR) com dicionário de chaves estruturado para internacionalização (i18n).
7. **Algoritmo de Assinatura JWT**: HS256 para o ambiente de desenvolvimento local com validação simétrica via variável de ambiente `JWT_SECRET`. Arquitetura desacoplada em trait para suportar RS256/EdDSA em produção.

---

## 3. Metodologia de Engenharia `senior-dev`

Cada tarefa técnica descrita nas Fases 0 a 3 é executada sob o fluxo de 3 estágios obrigatórios:

```
+---------------------------------------------------------------------------------------+
|                                    SENIOR-DEV PIPELINE                                |
+---------------------------------------------------------------------------------------+
| 1. MAKE IT WORK                                                                       |
|   - Modelagem de dados e tipagem forte primeiro (estados ilegais impossíveis).        |
|   - Fronteiras estritas com DTOs e validação de schema.                               |
|   - TDD Estrito: Escrever teste vermelho honesto -> Fazer passar -> Garantir verde.  |
|   - Idempotência obrigatória em escritas críticas (clientSaveId, contentHash).        |
+---------------------------------------------------------------------------------------+
| 2. MAKE IT RIGHT                                                                      |
|   - Refatoração cirúrgica sem alteração de comportamento externo comprovada por testes.|
|   - Quality Gate CRAP < 10 (complexidade ciclomática dividida por cobertura).         |
|   - Quality Gate DRY < 0.8 (eliminação de duplicações via jscpd).                     |
|   - Testes de mutação com cargo-mutants e Stryker (eliminação de mutantes sobreviventes)|
|   - Conformidade estrita com RFC 7807 / RFC 9457 (Problem Details extensível).        |
|   - Controle de Concorrência Otimista (OCC via revision com isolamento multi-tenant). |
|   - Isolamento de CPU com spawn_blocking para criptografia Argon2id.                  |
+---------------------------------------------------------------------------------------+
| 3. FOLLOW PRACTICE                                                                    |
|   - Observabilidade shift-left com logs estruturados correlacionados por x-request-id.|
|   - Commits atômicos no padrão Conventional Commits (feat, fix, refactor, test).      |
|   - DevSecOps CI (Trivy, cargo-audit, npm audit).                                    |
+---------------------------------------------------------------------------------------+
```

---

## 4. Detalhamento das Fases do MVP (Fases 0 a 3)

---

### 4.1 Fase 0: Fundação, Infraestrutura & Autenticação

#### Tarefa 0.1: Orquestração Docker & Ambiente Local de Desenvolvimento
- **Requisitos Cobertos**: RF-S01, RNF-M01, RNF-M02, Spec §8.4.
- **Descrição Técnica**:
  - Configuração do `docker-compose.yml` orquestrando três containers: `mongo` (MongoDB 7.0), `backend` (Rust com `cargo-watch` para hot-reload e volumes de cache `cargo_cache` e `target_cache`), e `frontend` (Vite dev server rodando na porta 3000 com polling montado).
  - Configuração de rede bridge isolada `drawit_network` e healthchecks determinísticos no serviço Mongo via `mongosh --eval "db.adminCommand('ping')"`.
  - Criação de arquivo `.env.example` versionado com segredos padrão de desenvolvimento.
- **Contratos & Schemas**:
  - `docker-compose.yml`:
    - Portas expostas: `3000:3000` (frontend), `8080:8080` (backend), `27017:27017` (mongo).
    - Variáveis obrigatórias: `MONGO_URL`, `APP_PORT`, `JWT_SECRET`, `JWT_EXPIRATION_MINUTES`, `REFRESH_TOKEN_EXPIRATION_DAYS`, `FRONTEND_ORIGIN`.
- **Estratégia de Testes (TDD)**:
  - *Teste de Healthcheck*: `curl -f http://localhost:8080/health` deve retornar status HTTP 200 `{ "status": "ok" }`.
  - *Teste de Conexão Mongo*: `curl -f http://localhost:8080/ready` deve responder HTTP 200 `{ "status": "ready", "database": "connected" }`. Se o Mongo for pausado (`docker stop drawit_mongo`), a resposta deve transicionar para HTTP 503 Service Unavailable.
- **Critérios de Aceite**:
  - [ ] Comando `docker-compose up -d` sobe os 3 serviços sem falhas de montagem.
  - [ ] O backend aguarda a condição de saúde do Mongo antes de iniciar o listener Tokio.
  - [ ] Nenhuma credencial real versionada no git; `.env.example` documentado.

---

#### Tarefa 0.2: Esqueleto do Backend Rust com Axum, Tracing & Erros RFC 7807 / RFC 9457 Extensíveis
- **Requisitos Cobertos**: RNF-M01, RNF-M04, RNF-P04, RFC 7807, RFC 9457, RFC 9110.
- **Descrição Técnica**:
  - Criação da aplicação base em Rust utilizando `axum` e `tokio`.
  - Configuração de pipeline de middlewares Tower: `TraceLayer` gerando logs estruturados via `tracing_subscriber` com injeção de header `x-request-id`, `CorsLayer` restrito à origem do frontend com suporte a credenciais (`allow_credentials = true`), `RateLimitLayer` / `GovernorLayer` limitando tentativas abusivas em rotas sensíveis e `RequestBodyLimitLayer` fixado em 16MB.
  - Implementação do manipulador centralizado de erros em `src/error.rs` implementando `IntoResponse` para converter enums de domínio em respostas HTTP JSON no formato RFC 7807 / RFC 9457 (`application/problem+json`).
  - **Extensibilidade RFC 7807 / RFC 9457**: Para viabilizar a injeção tipada de metadados de domínio (como `serverRevision: u64` no caso de conflitos de concorrência OCC sem quebrar a tipagem de outros erros), a estrutura `ProblemDetails` incorpora um mapa de extensões serializado de forma achatada no corpo JSON raiz via `#[serde(flatten)]`.
- **Contratos & Schemas**:
  - Estrutura RFC 7807 / RFC 9457 Extensível (`src/error.rs`):
    ```rust
    use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
    use serde::{Deserialize, Serialize};
    use std::collections::HashMap;
    use utoipa::ToSchema;

    #[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
    pub struct ProblemDetails {
        pub r#type: String,
        pub title: String,
        pub status: u16,
        pub detail: String,
        pub instance: String,
        pub code: String,

        #[serde(skip_serializing_if = "Option::is_none")]
        pub invalid_params: Option<Vec<InvalidParam>>,

        /// Extensões do RFC 7807 / RFC 9457 serializadas diretamente no nó raiz do JSON.
        /// Permite serializar metadados customizados como `serverRevision` em conflitos OCC 409.
        #[serde(flatten, default, skip_serializing_if = "HashMap::is_empty")]
        pub extensions: HashMap<String, serde_json::Value>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
    pub struct InvalidParam {
        pub name: String,
        pub reason: String,
    }

    impl ProblemDetails {
        pub fn new(
            status: u16,
            code: impl Into<String>,
            title: impl Into<String>,
            detail: impl Into<String>,
            instance: impl Into<String>,
        ) -> Self {
            let code_str = code.into();
            Self {
                r#type: format!("https://drawit.app/errors/{}", code_str.to_lowercase().replace('_', "-")),
                title: title.into(),
                status,
                detail: detail.into(),
                instance: instance.into(),
                code: code_str,
                invalid_params: None,
                extensions: HashMap::new(),
            }
        }

        pub fn with_extension(mut self, key: impl Into<String>, value: impl Into<serde_json::Value>) -> Self {
            self.extensions.insert(key.into(), value.into());
            self
        }

        pub fn with_invalid_params(mut self, params: Vec<InvalidParam>) -> Self {
            self.invalid_params = Some(params);
            self
        }
    }

    impl IntoResponse for AppError {
        fn into_response(self) -> Response {
            let (status, problem) = match self {
                AppError::ConcurrencyConflict { server_revision, instance } => (
                    StatusCode::CONFLICT,
                    ProblemDetails::new(
                        409,
                        "CONCURRENCY_CONFLICT",
                        "Conflito de Concorrência",
                        "A cena foi modificada em outra sessão. Recarregue a versão mais recente do servidor.",
                        instance,
                    ).with_extension("serverRevision", serde_json::json!(server_revision)),
                ),
                AppError::NotFound(detail) => (
                    StatusCode::NOT_FOUND,
                    ProblemDetails::new(404, "NOT_FOUND", "Recurso não encontrado", detail, ""),
                ),
                AppError::Validation(params) => (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    ProblemDetails::new(422, "VALIDATION_FAILED", "Falha de validação", "Dados inválidos", "")
                        .with_invalid_params(params),
                ),
                AppError::Internal(err) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    ProblemDetails::new(500, "INTERNAL_ERROR", "Erro interno", err, ""),
                ),
            };

            (
                status,
                [("content-type", "application/problem+json")],
                Json(problem),
            ).into_response()
        }
    }
    ```
- **Estratégia de Testes (TDD)**:
  - *Given* uma rota que dispara um erro de validação de dados, *When* o cliente executa a requisição, *Then* o cabeçalho `Content-Type` é estritamente `application/problem+json` e o corpo contém `code: "VALIDATION_FAILED"`, `status: 422` e o array `invalid_params`.
  - *Given* um erro `AppError::ConcurrencyConflict { server_revision: 5, instance: "/api/boards/b1/scene" }`, *When* serializado em resposta HTTP, *Then* o corpo JSON contém `"serverRevision": 5` diretamente no nó raiz sem subchaves aninhadas, com `status: 409` e `Content-Type: application/problem+json`.
  - *Given* uma requisição HTTP, *When* processada pela API, *Then* o log emitido no stdout possui campos `request_id`, `method`, `path`, `latency_ms` e `status_code`.
- **Critérios de Aceite**:
  - [ ] Respostas de erro nunca retornam JSON desestruturado ou texto plano.
  - [ ] Campo `serverRevision` presente no nível raiz de respostas 409 Conflict.
  - [ ] Middleware propaga e injeta `x-request-id` tanto no contexto do tracing quanto no cabeçalho de resposta.
  - [ ] Compilação em Rust com `cargo clippy -- -D warnings` sem nenhum alerta ativo.

---

#### Tarefa 0.3: Esqueleto do Frontend React com Vite, TypeScript, Tailwind & shadcn/ui
- **Requisitos Cobertos**: RNF-S00, RNF-S01, RNF-U01, RNF-U03.
- **Descrição Técnica**:
  - Setup do projeto frontend com Vite, TypeScript, Tailwind CSS e configuração de componentes fundamentais do `shadcn/ui` (Button, Input, Dialog, DropdownMenu, Toast, Tooltip, Sheet).
  - Implementação do provedor de tema (`ThemeProvider`) suportando modos `light`, `dark` e sincronização automática com o sistema operacional sem "flash" visual de renderização.
  - Configuração do cliente HTTP com interceptores automáticos para anexar o token de acesso (`Authorization: Bearer <token>`) e recuperar a sessão de forma transparente caso ocorra HTTP 401 via Web Locks API (`navigator.locks.request`).
  - Dicionário básico de internacionalização com chaves estruturadas em Português do Brasil (pt-BR).
- **Contratos & Assinaturas**:
  - `ThemeContext`:
    ```typescript
    export type Theme = 'light' | 'dark' | 'system';
    export interface ThemeContextType {
      theme: Theme;
      resolvedTheme: 'light' | 'dark';
      setTheme: (theme: Theme) => void;
    }
    ```
- **Estratégia de Testes (TDD)**:
  - *Teste de Alternância de Tema*: O componente `ThemeToggle` alterna a classe `.dark` no elemento `<html>` e persiste a preferência no localStorage sob a chave `drawit_theme`.
  - *Teste de Interceptor de Autenticação*: Quando uma requisição falha com 401, o cliente HTTP coordena a chamada única para `/api/auth/refresh` via mutex em memória e Web Locks, atualiza o token em memória e re-executa a requisição original com o novo token sem deslogar o usuário.
- **Critérios de Aceite**:
  - [ ] Componentes visuais minimalistas e livres de poluição estética, seguindo padrões shadcn/ui.
  - [ ] Troca de temas claro/escuro instantânea sem recarregar a página.
  - [ ] Testes unitários com Vitest cobrindo 100% dos fluxos do interceptor HTTP.

---

#### Tarefa 0.4: Modelagem MongoDB, Migrações e Índices de Performance, Isolamento Multi-Tenant e TTL
- **Requisitos Cobertos**: RNF-SEC03, RNF-P02, RNF-P04, Spec §6.1.
- **Descrição Técnica**:
  - Modelagem das coleções do MongoDB: `users`, `refresh_tokens`, `groups`, `boards`, `board_scenes`, `board_versions` e `component_library`.
  - **Isolamento Estrito de Tenant em `board_scenes` (RNF-SEC03)**: A coleção de cenas armazena explicitamente o atributo `ownerId` (UUID do usuário proprietário), garantindo que operações OCC atômicas validem tanto a posse quanto a revisão.
  - **Campos de Idempotência em `board_scenes`**: Inclusão de `lastClientSaveId: Option<String>` e `contentHash: String` (SHA-256) para desambiguar retentativas de rede de verdadeiros conflitos concorrentes.
  - Script assíncrono de inicialização e migração em Rust que executa no startup do backend garantindo a criação de índices compostos e índices com tempo de vida (TTL).
- **Modelagem de Dados e Contratos de Índices MongoDB**:
  - `users`: `{ "username": 1 }` (único, collation case-insensitive).
  - `refresh_tokens`: `{ "tokenHash": 1 }` (único), `{ "userId": 1 }`, `{ "familyId": 1 }`, `{ "expiresAt": 1 }` (`expireAfterSeconds: 0`).
  - `groups`: `{ "ownerId": 1, "name": 1 }` (único por usuário).
  - `boards`: `{ "ownerId": 1, "isDeleted": 1, "updatedAt": -1 }`, `{ "ownerId": 1, "groupId": 1, "isDeleted": 1 }`, `{ "ownerId": 1, "tags": 1, "isDeleted": 1 }`, `{ "ownerId": 1, "deletedAt": 1 }`, índice de texto em `{ "title": "text", "tags": "text" }`.
  - `board_scenes`:
    - Schema: `{ _id: String, ownerId: String, schemaVersion: u32, revision: u64, lastClientSaveId: Option<String>, contentHash: String, elements: Vec<ElementDto>, viewport: ViewportDto, updatedAt: BsonDateTime }`.
    - Índices: `{ "_id": 1 }` (único, correspondente ao `boardId`), `{ "ownerId": 1 }` (secundário, para expurgo por usuário e queries tenant-scoped).
  - `board_versions`:
    - Schema: `{ _id: ObjectId, boardId: String, revision: u64, title: String, elements: Vec<ElementDto>, viewport: ViewportDto, createdAt: BsonDateTime }`.
    - Índices: `{ "boardId": 1, "createdAt": -1 }`.
- **Estratégia de Testes (TDD)**:
  - *Teste de Unicidade*: Tentar inserir dois registros em `users` com o username `usuario_teste` e `USUARIO_TESTE` deve resultar em violação do índice único do Mongo (código de erro 11000).
  - *Teste de TTL*: Documentos inseridos em `refresh_tokens` com `expiresAt` no passado devem ser elegíveis para remoção automática pelo processo do MongoDB.
  - *Teste de Índice em `board_scenes`*: Validar que consultas filtradas por `{ "ownerId": user_id }` utilizam o índice secundário especificado.
- **Critérios de Aceite**:
  - [ ] Índices criados e verificados de forma idempotente na subida da aplicação.
  - [ ] Campo `ownerId` presente obrigatoriamente no schema de `board_scenes`.
  - [ ] Separação física mantida entre a coleção de metadados `boards`, a cena densa `board_scenes` e as versões `board_versions`.

---

#### Tarefa 0.5: Subsistema de Autenticação Completo (Argon2id em `spawn_blocking`, JWT HS256, Refresh Token Rotativo com Grace Window de 15s & Web Locks)
- **Requisitos Cobertos**: RF-A01, RF-A02, RF-A03, RF-A04, RNF-SEC01, RNF-SEC04.
- **Descrição Técnica**:
  - Implementação das rotas `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout` e `/api/auth/me`.
  - **Isolamento de CPU via `tokio::task::spawn_blocking` (RNF-SEC01)**:
    - O algoritmo Argon2id (`m=65536` [64 MiB RAM], `t=3`, `p=4`) com salt CSPRNG de 16 bytes é uma operação criptográfica puramente síncrona e custosa em termos de processamento de CPU.
    - É terminantemente proibido executar `hash_password` ou `verify_password` diretamente nas threads assíncronas do Tokio. Toda invocação deve ser encapsulada em `tokio::task::spawn_blocking(move || ...)` para transferir a carga ao pool dedicado de threads bloqueantes do Tokio (até 512 threads), preservando a responsividade imediata das threads assíncronas do event loop para requisições de `/health`, `/ready` e autosaves concorrentes.
    - Proteção adicional contra esgotamento de memória por ataques de negação de serviço (DoS) via `RateLimitLayer` (máximo de 5 tentativas por minuto por IP em `/auth/login` e `/auth/register`).
  - **Emissão de Tokens**:
    - Access Token JWT (HS256, expiração de 15 minutos) contendo claims mínimas (`sub`, `username`, `iat`, `exp`, `jti`).
    - Refresh Token opaco de 256 bits gerado via `rand::rngs::OsRng`, armazenado no MongoDB estritamente como hash SHA-256 e transmitido ao navegador em cookie `HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=604800` (com flag `; Secure` em produção).
  - **Concorrência Multi-Abas e Detecção de Reuso com Janela de Tolerância (Grace Window de 15s)**:
    - Emissão com atomicidade CAS via `refresh_tokens_col.find_one_and_update(doc! { "tokenHash": &hash, "revokedAt": null, "expiresAt": { "$gt": now } }, doc! { "$set": { "revokedAt": now, "replacedBy": &new_hash } })`.
    - **Tratamento de Concorrência Multi-Abas (Grace Window)**:
      - Quando duas ou mais abas do mesmo navegador disparam `/api/auth/refresh` concorrentemente com o mesmo cookie:
      - A primeira requisição ganha a CAS, gera o novo par e define `revokedAt = now()`.
      - A requisição concorrente (segunda aba) encontra `revokedAt != null`. O backend calcula o intervalo `elapsed = now - revokedAt`.
      - Se `elapsed <= 15 segundos` e `replacedBy != null`: o backend reconhece a requisição como legítima de uma aba irmã em corrida, gera um novo access token para o usuário autenticado e responde HTTP 200 OK **sem revogar a família de tokens**.
      - Se `elapsed > 15 segundos`: trata-se de um verdadeiro ataque de repetição maliciosa (replay attack). O backend dispara a revogação instantânea de todos os tokens associados àquele `familyId` no banco, limpa o cookie do cliente e responde HTTP 401 Unauthorized (`TOKEN_REUSE_DETECTED`).
  - **Coordenação no Frontend via Web Locks API & BroadcastChannel**:
    - No cliente HTTP, interceptores que recebem 401 utilizam `navigator.locks.request('drawit_auth_refresh', async () => ...)` para serializar a renovação entre abas.
    - Comunicação entre abas via `new BroadcastChannel('drawit_auth')` transmitindo evento `TOKEN_REFRESHED` com o novo token de acesso, atualizando a memória de todas as abas abertas sem disparar requisições de rede duplicadas.
- **Contratos & DTOs**:
  - `RegisterDto` & `LoginDto`: `{ username: string (3 a 30 caracteres, ^[a-zA-Z0-9_-]+$), password: string (8 a 128 caracteres) }`.
  - `AuthResponseDto`: `{ user: { id: string, username: string, preferences: { theme, language } }, accessToken: string }`.
- **Estratégia de Testes (TDD)**:
  - *Teste de Isolamento de Threads com Argon2id*: Disparar 10 requisições simultâneas de login com senhas complexas e verificar que um probe concorrente em `GET /health` responde em menos de 5ms, provando que o Tokio executor não sofreu thread starvation.
  - *Teste de Rotação com Grace Window de 15s*: Disparar duas requisições simultâneas para `/api/auth/refresh` com o mesmo cookie. Ambas devem retornar HTTP 200 OK. Aguardar 16 segundos e reenviar o cookie antigo; a resposta deve ser obrigatoriamente HTTP 401 `TOKEN_REUSE_DETECTED` com a família inteira revogada.
- **Critérios de Aceite**:
  - [ ] Criptografia Argon2id executada estritamente dentro de `task::spawn_blocking`.
  - [ ] Usuário não é deslogado ao navegar simultaneamente em múltiplas abas abertas que realizam refresh de token em paralelo.
  - [ ] Cookie com `HttpOnly`, `SameSite=Strict` e flag `Secure` em ambiente de produção.

---

#### Tarefa 0.6: Pipeline de Integração Contínua (CI) e DevSecOps
- **Requisitos Cobertos**: RNF-M03, RNF-SEC07.
- **Descrição Técnica**:
  - Configuração de workflow do GitHub Actions (`.github/workflows/ci.yml`) executando em cada Push e Pull Request:
    1. Lint e formatação: `cargo clippy -- -D warnings`, `cargo fmt --check`, `npm run lint`, `npx prettier --check .`.
    2. Auditoria de segurança de dependências: `cargo audit`, `npm audit --audit-level=high`.
    3. Varredura de vulnerabilidades em containers: `trivy image`.
    4. Testes automatizados: `cargo test`, `npm run test:unit`.
- **Critérios de Aceite**:
  - [ ] Pipeline falha caso ocorra qualquer aviso no linter ou vulnerabilidade crítica de dependências.
  - [ ] Pipeline de testes executada de ponta a ponta com status verde.

---

### 4.2 Fase 1: Núcleo do Canvas 2D

#### Tarefa 1.1: Motor de Coordenadas, Câmera e Viewport Infinito
- **Requisitos Cobertos**: RF-C01, RNF-P01, RNF-P02, Spec §8.3.
- **Descrição Técnica**:
  - Implementação da classe `CanvasEngine` desacoplada do ciclo de renderização do React.
  - Gestão de três espaços de coordenadas distintos:
    1. **Espaço de Tela ($P_s$)**: Posição em pixels do mouse relativa ao canto superior esquerdo do `<canvas>` HTML.
    2. **Espaço de Mundo ($P_w$)**: Plano cartesiano virtual bidimensional infinito onde residem as coordenadas de todos os elementos.
    3. **Espaço de Buffer Físico ($P_b$)**: Pixels físicos reais da placa de vídeo escalados por `window.devicePixelRatio` (HiDPI / Retina display) para eliminar desfoque.
  - Matrizes de transformação afim 2D:
    $$x_s = x_w \cdot \text{zoom} + \text{panX}, \quad y_s = y_w \cdot \text{zoom} + \text{panY}$$
    $$x_w = \frac{x_s - \text{panX}}{\text{zoom}}, \quad y_w = \frac{y_s - \text{panY}}{\text{zoom}}$$
  - Ajuste dinâmico de redimensionamento de janela via `ResizeObserver` sincronizando o buffer do canvas com as dimensões CSS.
- **Contratos & Tipos**:
  ```typescript
  export interface WorldPoint { x: number; y: number; }
  export interface ScreenPoint { x: number; y: number; }
  export interface ViewportTransform { panX: number; panY: number; zoom: number; }
  ```
- **Estratégia de Testes (TDD)**:
  - *Teste de Invariância Euclidiana*: Para qualquer ponto $(x_w, y_w)$ com zoom de $0.1$ a $8.0$ e pans arbitrários, a conversão `screenToWorld(worldToScreen(p))` deve retornar o ponto original com erro menor que $10^{-6}$.
  - *Teste de HiDPI Scaling*: Em tela com `devicePixelRatio = 2`, o buffer interno do canvas (`canvas.width`) deve ser exatamente o dobro do tamanho CSS (`canvas.clientWidth`), e o contexto 2D deve aplicar escala `scale(2, 2)` na raiz do desenho.
- **Critérios de Aceite**:
  - [ ] Transformações de coordenadas matemáticas puras e cobertas por testes unitários determinísticos.
  - [ ] Nitidez cristalina em telas de alta densidade de pixels (Retina).

---

#### Tarefa 1.2: Motor de Navegação: Zoom Ancorado com Normalização de Delta, Pan Multi-modal, Pointer Capture e Supressão de Autoscroll
- **Requisitos Cobertos**: RF-C02, RF-C03, RF-C04, Spec §8.3.
- **Descrição Técnica**:
  - **Zoom Ancorado com Escalonamento Exponencial e Normalização de Delta**:
    - O evento `wheel` é registrado no elemento do canvas com `{ passive: false }` e invoca `e.preventDefault()`. A roda do mouse executa **zoom sem necessidade de pressionar a tecla Ctrl** e **nunca realiza pan**.
    - Limites estritos de zoom: fixados entre **10% (0.1)** e **800% (8.0)**.
    - Normalização do delta para uniformidade entre navegadores (Firefox `deltaMode === 1` por linhas vs Chrome `deltaMode === 0` por pixels):
      $$\text{normalizedDeltaY} = e.deltaY \cdot (e.deltaMode === 1 \; ? \; 20 : e.deltaMode === 2 \; ? \; 500 : 1)$$
      $$\text{zoom}_{novo} = \text{clamp}\left(\text{zoom} \cdot (0.999)^{\text{normalizedDeltaY}}, 0.1, 8.0\right)$$
    - Invariância do ponto sob o cursor durante zoom:
      $$\text{panX}_{novo} = cx - x_w \cdot \text{zoom}_{novo}, \quad \text{panY}_{novo} = cy - y_w \cdot \text{zoom}_{novo}$$
  - **Captura Determinística de Ponteiro (`PointerCapture`)**:
    - Em `pointerdown`: invoca obrigatoriamente `canvas.setPointerCapture(e.pointerId)` para assegurar que eventos continuem sendo recebidos mesmo quando o ponteiro se desloca além dos limites do canvas ou fora da janela.
    - Em `pointerup`: invoca `canvas.releasePointerCapture(e.pointerId)` se ativa.
    - Em `pointercancel` e `lostpointercapture`: libera a captura e executa `canvasEngine.abortActiveInteraction()` para restaurar o estado de repouso limpamente.
  - **Navegação Pan Multi-modal e Supressão de Autoscroll no Windows**:
    1. Ferramenta Mão ativada (tecla de atalho `H`).
    2. Tecla `Espaço` pressionada enquanto arrasta com o botão esquerdo.
       - **Guarda de Foco em Campos de Texto**: O manipulador global de teclado inspeciona se `e.target` é um `HTMLInputElement`, `HTMLTextAreaElement` ou possui `isContentEditable`. Em caso positivo, a barra de espaço insere caracteres de texto normalmente e não ativa a ferramenta pan.
    3. Clique e arraste direto com o **botão do meio do mouse** (botão 1 / flag `buttons = 4`), independente da ferramenta ativa.
       - **Supressão do Autoscroll Nativo do Windows**: Registrar manipulador de captura `window.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); }, { capture: true })` e `e.preventDefault()` em `pointerdown` com `e.button === 1`, suprimindo a bússola de autoscroll nativa do sistema operacional.
       - Prevenção do menu de contexto nativo no canvas via `canvas.addEventListener('contextmenu', e => e.preventDefault())`.
  - **Declarações CSS Obrigatórias no Canvas**:
    ```css
    canvas.drawit-engine {
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      outline: none;
    }
    ```
- **Estratégia de Testes (TDD)**:
  - *Teste de Invariância do Ponto sob o Cursor*: Com cursor em $(300, 200)$ na tela projetando em $P_w(100, 50)$, aplicar zoom de $1.0$ para $1.5$; a projeção de $P_w(100, 50)$ deve continuar no pixel $(300, 200)$.
  - *Teste de Supressão do Auxclick*: Disparar evento de clique com `button = 1` no canvas; verificar que `auxclick` é interceptado com `defaultPrevented === true`.
  - *Teste de Guarda da Barra de Espaço*: Disparar evento `keydown` com `code: 'Space'` tendo um `<textarea>` em foco; verificar que o modo de pan permanece inativo.
- **Critérios de Aceite**:
  - [ ] Zoom por roda do mouse sem `Ctrl` fluido e com zoom exponencial normalizado.
  - [ ] Ponto do cursor não desliza visualmente durante aproximação e afastamento da câmera.
  - [ ] Arraste com botão do meio não abre a bússola de autoscroll nativa no Windows.
  - [ ] Eventos de arraste continuam respondendo fora da área visível do canvas via `setPointerCapture`.

---

#### Tarefa 1.3: Loop de Renderização 60 FPS com Dirty Flag e Renderizadores de Formas Básicas
- **Requisitos Cobertos**: RF-E01, RNF-P01, RNF-S02, RNF-S03, RNF-S06.
- **Descrição Técnica**:
  - Implementação de render loop baseado em `requestAnimationFrame` governado por uma flag de sujeira (`isDirty`). Quando a cena ou o viewport estão estáticos, o loop suspende novos redesenhos, poupando CPU e bateria.
  - Pipeline de renderização em camadas isoladas:
    1. Limpeza do quadro com `ctx.clearRect`.
    2. Aplicação do HiDPI scaling e da matriz de câmera (`translate` e `scale`).
    3. Renderização da grade infinita de pontos (espaçamento de 20px no mundo com opacidade dinâmica adaptada ao nível de zoom).
    4. Culling de viewport (eliminação de elementos fora do frustum visual via R-tree).
    5. Renderização sequencial de elementos por `zIndex`.
    6. Renderização da camada de interação ativa (bounding boxes, alças de transformação e caixas de seleção marquee).
  - Renderizadores puros para formas geométricas básicas:
    - **Retângulo**: Caminho com `rect` ou `roundRect` (raio de 8px).
    - **Elipse**: `ctx.ellipse` parametrizado por raio X e raio Y.
    - **Losango**: Caminho fechado ligando os 4 vértices medianos.
    - **Triângulo**: Triângulo isósceles direcionado.
    - **Linha**: Segmento de reta com espessura e estilo de contorno.
- **Contratos & Schemas**:
  - Estrutura base de elemento do canvas:
    ```typescript
    export interface CanvasElementBase {
      id: string; // UUID v4
      type: 'rectangle' | 'ellipse' | 'diamond' | 'triangle' | 'cylinder' | 'line' | 'arrow' | 'text' | 'freehand' | 'component';
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number; // radianos
      zIndex: number;
      groupIds: string[];
      locked: boolean;
      style: {
        strokeColor: string;
        fillColor: string;
        strokeWidth: number;
        strokeStyle: 'solid' | 'dashed' | 'dotted';
        opacity: number; // 0 a 100
        effect: {
          type: 'none' | 'neon' | 'blur' | 'shadow';
          intensity: number;
          color?: string;
        };
      };
      version: number;
    }
    ```
- **Estratégia de Testes (TDD)**:
  - *Teste do Scheduler com Dirty Flag*: Chamar `requestRender()` cinco vezes no mesmo microtask deve agendar apenas uma chamada ao `requestAnimationFrame`.
  - *Teste de Aplicação de Estilos no Contexto 2D*: Validar que para `strokeStyle: 'dashed'` o renderizador aplica `setLineDash([8, 8])` e para `opacity: 50` aplica `globalAlpha = 0.5`.
- **Critérios de Aceite**:
  - [ ] Renderizadores geométricos implementados sem alocação desnecessária de objetos dentro do frame loop.
  - [ ] Ausência de redesenhos contínuos enquanto o usuário não interage com o canvas.

---

#### Tarefa 1.4: Índice Espacial com R-tree (`rbush`), Inflação de Efeitos e Hit-Testing Fino Exato por Geometria (Losango, Triângulo, Cilindro, Elipse)
- **Requisitos Cobertos**: RF-E08, RNF-P01, RNF-P02.
- **Descrição Técnica**:
  - Integração da biblioteca de árvore R bidimensional `rbush` para indexação espacial contínua de todos os elementos da cena.
  - **Cálculo de AABB com Inflação de Efeitos (Neon Glow / Shadow)**:
    - Elementos com contorno e efeitos visuais extrapolam os limites $(x, y, W, H)$. Ao indexar no `rbush`:
      $$\text{glowMargin} = \text{style.effect.type === 'neon' ? (style.effect.intensity || 20) : 0}$$
      $$\text{margin} = \frac{\text{strokeWidth}}{2} + \text{glowMargin}$$
      $$AABB_{rbush} = \left[ x_{min} - \text{margin}, \; y_{min} - \text{margin}, \; x_{max} + \text{margin}, \; y_{max} + \text{margin} \right]$$
  - **Hit-Testing em 2 Fases (Two-Phase Collision Architecture)**:
    - *Fase 1 (Coarse Filter)*: Consulta na R-tree os candidatos cuja AABB contenha o retângulo de busca do clique $AABB_{query} = [P_{wx} - \tau, P_{wy} - \tau, P_{wx} + \tau, P_{wy} + \tau]$ com tolerância $\tau = 4\text{px}$.
    - *Fase 2 (Fine Narrowphase Geometry)*:
      - Para cada candidato retornado (ordenado de forma decrescente por `zIndex`), projeta o ponto do mundo $P_w(x_w, y_w)$ no espaço de coordenadas locais $(x', y')$ centrado no elemento e com rotação inversa $(-\theta)$:
        $$dx = x_w - cx, \quad dy = y_w - cy \quad (cx = x + W/2, \; cy = y + H/2)$$
        $$x' = dx \cos\theta + dy \sin\theta, \quad y' = -dx \sin\theta + dy \cos\theta$$
        onde os semi-eixos são $a = W/2$ e $b = H/2$.
  - **Fórmulas Finais de Hit-Test por Geometria**:
    1. **Losango (Diamond / Rhombus)**:
       - *Preenchimento Sólido (`fillColor !== 'transparent'`)*: Norma $L_1$ (distância Manhattan):
         $$\frac{|x'|}{a} + \frac{|y'|}{b} \le 1.0 \iff b \cdot |x'| + a \cdot |y'| \le a \cdot b$$
       - *Preenchimento Transparente (`fillColor === 'transparent'`)*: Distância perpendicular às 4 arestas:
         $$\text{dist}_{edge} = \frac{|b \cdot |x'| + a \cdot |y'| - a \cdot b|}{\sqrt{a^2 + b^2}} \le \tau \quad \text{com} \quad |x'| \le a + \tau, \; |y'| \le b + \tau$$
    2. **Triângulo Isósceles (Triangle)**:
       - Vértices locais: Ápice $(0, -b)$, Base-Direita $(a, b)$, Base-Esquerda $(-a, b)$.
       - *Preenchimento Sólido*: Ponto contido nos limites verticais e sob a reta delimitadora da largura:
         $$-b \le y' \le b \quad \text{e} \quad |x'| \le a \cdot \left( \frac{y' + b}{2b} \right)$$
         (ou validação de sinal idêntico no produto vetorial 2D contra as 3 arestas).
       - *Preenchimento Transparente*: Distância ortogonal à base $|y' - b| \le \tau$ (com $|x'| \le a + \tau$) ou distância aos dois segmentos oblíquos $\le \tau$.
    3. **Cilindro (Cylinder / Símbolo de Banco de Dados)**:
       - Geometria dividida em 3 zonas com raio vertical da calota $b_{cap} = \min(b \cdot 0.25, a \cdot 0.5, 30)$:
         1. Calota Superior: Elipse completa com centro $(0, -b + b_{cap})$.
         2. Corpo Central: Retângulo com $|x'| \le a$ e $-b + b_{cap} \le y' \le b - b_{cap}$.
         3. Base Inferior: Metade inferior da elipse com centro $(0, b - b_{cap})$ e $y' \ge b - b_{cap}$.
       - *Preenchimento Sólido*: Teste positivo se o ponto incidir em qualquer uma das três zonas acima.
       - *Preenchimento Transparente*: Distância $\le \tau$ ao perímetro da elipse superior, aos segmentos verticais laterais ($x' = \pm a$) ou ao arco inferior da base elíptica.
    4. **Elipse (Ellipse)**:
       - *Preenchimento Sólido*: $\frac{x'^2}{a^2} + \frac{y'^2}{b^2} \le 1.0$.
       - *Preenchimento Transparente*: $\left| \frac{x'^2}{a^2} + \frac{y'^2}{b^2} - 1.0 \right| \le \frac{2\tau}{\min(a, b)}$.
    5. **Linha e Segmentos de Reta**:
       - Distância euclidiana ortogonal do ponto ao segmento $\le \max(4, \text{strokeWidth}/2)$.
- **Estratégia de Testes (TDD)**:
  - *Teste de Losango*: Para um losango $100 \times 100$ centrado em $(100, 100)$, o ponto $(100, 100)$ deve retornar positivo; o ponto $(55, 55)$ (canto da AABB fora da área do losango) deve retornar negativo.
  - *Teste de Triângulo*: Clicar no ápice superior $(100, 50)$ acusa colisão; clicar nos cantos superiores externos da AABB $(55, 55)$ retorna nulo.
  - *Teste de Cilindro*: Clicar no corpo central $(60, 100)$ e no centro da calota superior $(100, 50)$ acusa colisão positiva; clicar fora das calotas e corpo retorna falso.
- **Critérios de Aceite**:
  - [ ] 60 FPS garantidos com 2.000 elementos sob pan e zoom ativos.
  - [ ] Hit-test matematicamente exato para Losango, Triângulo, Cilindro e Elipse sem falsos positivos nos cantos da AABB.
  - [ ] Margem de efeito neon incluída na R-tree sem clipping visual indevido.

---

#### Tarefa 1.5: Seleção Simples, Seleção Marquee (Lasso) e Multi-seleção com Shift
- **Requisitos Cobertos**: RF-E08, Spec §3.5.
- **Descrição Técnica**:
  - Implementação da máquina de estados de seleção no canvas:
    1. **Seleção Simples**: Clique do mouse executa hit-test no topo da pilha (`zIndex` mais alto). Se interceptar um elemento, `selectedIds` torna-se `[element.id]`. Se clicar em área livre, a seleção é esvaziada.
    2. **Multi-seleção com Shift**: Clicar com a tecla `Shift` pressionada alterna (toggle) a pertinência do elemento no conjunto de seleção sem desselecionar os demais.
    3. **Seleção Marquee (Caixa de Seleção / Lasso)**: Clicar e arrastar com a ferramenta de seleção sobre uma área vazia desenha um retângulo semi-transparente pontilhado. Todos os elementos cujas caixas delimitadoras interceptarem a caixa marquee são adicionados ao conjunto de seleção.
- **Estratégia de Testes (TDD)**:
  - *Teste de Toggle com Shift*: Tendo o elemento A selecionado, clicar com Shift no elemento B deve resultar em `selectedIds = [A, B]`. Clicar novamente com Shift no elemento A deve resultar em `selectedIds = [B]`.
  - *Teste de Marquee Box*: Arrastar uma caixa marquee abrangendo as coordenadas de três retângulos deve incluir os três elementos no array de seleção.
- **Critérios de Aceite**:
  - [ ] Interação de seleção idêntica ao comportamento do Figma/Excalidraw.
  - [ ] Feedback visual imediato com contorno azul (#3b82f6) nos elementos selecionados.

---

#### Tarefa 1.6: Caixa de Transformação (Bounding Box com 8 Alças, Redimensionamento Proporcional e Rotação)
- **Requisitos Cobertos**: RF-E09, Spec §3.5.
- **Descrição Técnica**:
  - Quando um ou mais elementos estão selecionados, calcula-se a Bounding Box unificada.
  - Desenho de 8 alças quadradas de redimensionamento nos vértices e centros das arestas: NW, N, NE, E, SE, S, SW, W.
  - Desenho de haste vertical saliente (25px acima do topo central) com o **manipulador circular de rotação**.
  - **Algoritmo de Redimensionamento**:
    - Ao arrastar uma alça, recalcula-se $(x, y, width, height)$ ancorado no ponto oposto da caixa.
    - Se a tecla `Shift` estiver pressionada durante o arraste de uma alça de vértice, a proporção original de aspecto ($W / H$) é travada rigidamente.
    - Suporte a inversão (flip horizontal e vertical) caso o usuário arraste além da alça oposta.
  - **Algoritmo de Rotação**:
    - O ângulo de rotação $\theta$ é calculado via $\text{atan2}(P_{my} - C_y, P_{mx} - C_x) - \pi/2$, onde $C$ é o baricentro da caixa de seleção e $P_m$ é a posição atual do ponteiro.
    - Se a tecla `Shift` for mantida durante a rotação, o ângulo sofre snap magnético a incrementos de 15 graus ($15^\circ, 30^\circ, 45^\circ, 90^\circ$).
- **Estratégia de Testes (TDD)**:
  - *Teste de Redimensionamento com Proporção Travada*: Dado um elemento $100 \times 50$ (aspect ratio 2.0), redimensionar o vértice inferior direito com Shift pressionado para largura de 200px deve forçar a altura exatamente para 100px.
  - *Teste de Snap de Rotação*: Rotacionar para um ângulo de $43^\circ$ com Shift pressionado deve quantizar a rotação para $45^\circ$ ($0.7853$ radianos).
- **Critérios de Aceite**:
  - [ ] Transformação interativa sem defasagem visual ou perda de precisão flutuante.
  - [ ] Cursores nativos do navegador (`nwse-resize`, `nesw-resize`, etc.) adaptados dinamicamente ao ângulo de rotação.

---

#### Tarefa 1.7: Ferramenta de Desenho Livre com `perfect-freehand`
- **Requisitos Cobertos**: RF-E05, Spec §8.3.
- **Descrição Técnica**:
  - Captura contínua de eventos de ponteiro com extração de posição e pressão (`e.pressure`).
  - Utilização da biblioteca `perfect-freehand` (`getStroke`) para calcular polígonos de contorno com simulação de caneta esferográfica e ponta caligráfica.
  - Geração de elemento do tipo `freehand` armazenando o array de pontos relativos `[x, y, pressure]`.
  - Renderização via Canvas 2D preenchendo o caminho fechado resultante com `ctx.fill()`.
- **Estratégia de Testes (TDD)**:
  - *Teste de Suavização*: Submeter uma série de 10 pontos em zigue-zague com ruído; o gerador `getStroke` deve produzir um polígono contínuo sem quebras de continuidade matemática.
- **Critérios de Aceite**:
  - [ ] Traço natural e suave sem sensação de linha serrilhada ou atraso de entrada.
  - [ ] Cores de contorno e opacidade integradas ao elemento de desenho livre.

---

#### Tarefa 1.8: Motor de Histórico Undo/Redo Baseado em Comandos e Patches com Reidratação de Vínculos
- **Requisitos Cobertos**: RF-P01, Spec §8.3.
- **Descrição Técnica**:
  - Implementação de gerenciador de histórico baseado no padrão **Command / Inverse Patch**.
  - **Coalescência de Interações Contínuas**:
    - Operações de arrasto, rotação, redimensionamento ou desenho livre emitem dezenas de mutações durante o movimento (`pointermove`).
    - Para não saturar a pilha de Undo, o estado inicial dos elementos afetados é capturado no `pointerdown`.
    - Ao soltar o mouse (`pointerup`), caso haja diferença entre o estado inicial e o final, cria-se um único comando atômico contendo os deltas `{ before, after }` empilhado no Undo.
  - A pilha de Redo é limpa imediatamente após qualquer nova ação do usuário.
  - Capacidade máxima configurada para **50 comandos** por sessão com descarte FIFO de comandos antigos para proteger a memória RAM.
  - **Reidratação Reativa do Índice de Vínculos**: Ao executar Undo (`Ctrl+Z`) ou Redo (`Ctrl+Y`), a pilha reidrata o mapa bidirecional do `BindingIndexManager` (`rebuild(elements)`) para garantir que movimentações pós-restauração continuem atualizando os conectores vinculados em $O(1)$.
- **Estratégia de Testes (TDD)**:
  - *Teste de Coalescência*: Simular um arrasto de elemento emitindo 50 eventos `pointermove` consecutivos e um `pointerup`. A pilha de Undo deve conter exatamente 1 novo comando.
  - *Teste de Undo/Redo com Vínculo de Seta*: Conectar Retângulo 1 à Seta A. Deletar Retângulo 1. Pressionar `Ctrl+Z`. O Retângulo 1 e o conector devem ser restaurados com seu vínculo reidratado no índice, permitindo que novas movimentações do Retângulo 1 arrastem a ponta da Seta A.
- **Critérios de Aceite**:
  - [ ] Desfazer e refazer restauram precisamente todas as posições, rotações, estilos, elementos e vínculos.
  - [ ] Consumo de memória estável após centenas de manipulações contínuas.

---

### 4.3 Fase 2: Diagramas, Conectores Magnéticos & Componentes de TI

#### Tarefa 2.1: Sistema de Âncoras Magnéticas Cardinais e Colaterais com Rotação Matemática Exata
- **Requisitos Cobertos**: RF-E02, RF-E06, Spec §7.2.
- **Descrição Técnica**:
  - Cada elemento define **8 âncoras magnéticas normalizadas** $(u, v) \in [0, 1] \times [0, 1]$:
    - 4 Cardinais: Topo `(0.5, 0.0)`, Direita `(1.0, 0.5)`, Fundo `(0.5, 1.0)`, Esquerda `(0.0, 0.5)`.
    - 4 Colaterais: Topo-Esquerda `(0.0, 0.0)`, Topo-Direita `(1.0, 0.0)`, Fundo-Direita `(1.0, 1.0)`, Fundo-Esquerda `(0.0, 1.0)`.
  - **Derivação Matemática Exata para Formas Rotacionadas**:
    - Seja uma forma com caixa delimitadora em $(x, y)$, dimensões $W \times H$, centro $C(cx, cy) = (x + W/2, y + H/2)$ e rotação $\theta$ no sentido horário.
    - O offset local não-rotacionado em relação ao centro da forma é:
      $$\Delta x_{local} = (u - 0.5) \cdot W, \quad \Delta y_{local} = (v - 0.5) \cdot H$$
    - Sob rotação horária $\theta$, as coordenadas globais de mundo $(x_w, y_w)$ de qualquer âncora são dadas por:
      $$x_w = cx + \Delta x_{local} \cos\theta - \Delta y_{local} \sin\theta$$
      $$y_w = cy + \Delta x_{local} \sin\theta + \Delta y_{local} \cos\theta$$
    - Para uma rotação de $+90^\circ$ ($\theta = \pi/2$, onde $\cos(\pi/2) = 0, \sin(\pi/2) = 1$):
      $$x_w = cx - \Delta y_{local} = cx - (v - 0.5) \cdot H$$
      $$y_w = cy + \Delta x_{local} = cy + (u - 0.5) \cdot W$$
    - *Correção Crítica de Rigor*: Em um retângulo com $W \neq H$ (ex: $200 \times 100$), a distância do centro até a âncora `right` é $W/2 = 100$, enquanto a distância do centro até a âncora `top` é $H/2 = 50$. Portanto, a âncora `top` rotacionada em $90^\circ$ **nunca coincide** com a âncora `right` original. Essa coincidência só ocorre em quadrados ($W = H$).
  - **Snap Magnético**: Projeção de atração quando o conector se aproxima a menos de **15 pixels** de raio da âncora calculada no mundo.
- **Estratégia de Testes (TDD)**:
  - *Caso de Teste A (Quadrado $100 \times 100$ centrado em $(150, 150)$ sob $\theta = +90^\circ$)*:
    - Estado original: `top` $(150, 100)$, `right` $(200, 150)$, `bottom` $(150, 200)$, `left` $(100, 150)$.
    - Após $+90^\circ$: `top` translada para $(200, 150)$ (coincide com `right` original); `right` translada para $(150, 200)$ (coincide com `bottom` original).
  - *Caso de Teste B (Retângulo $200 \times 100$ centrado em $(150, 150)$ sob $\theta = +90^\circ$)*:
    - Estado original: `top` $(150, 100)$, `right` $(250, 150)$, `bottom` $(150, 200)$, `left` $(50, 150)$.
    - Após $+90^\circ$:
      - `top`: $x_w = 150 - (-50) = \mathbf{200}, \; y_w = 150 + 0 = \mathbf{150} \implies (200, 150)$ (diferente de $(250, 150)$!).
      - `right`: $x_w = 150 - 0 = \mathbf{150}, \; y_w = 150 + 100 = \mathbf{250} \implies (150, 250)$.
      - `bottom`: $x_w = 150 - 50 = \mathbf{100}, \; y_w = 150 + 0 = \mathbf{150} \implies (100, 150)$.
      - `left`: $x_w = 150 - 0 = \mathbf{150}, \; y_w = 150 - 100 = \mathbf{50} \implies (150, 50)$.
- **Critérios de Aceite**:
  - [ ] 8 pontos magnéticos responsivos em todas as formas geométricas e componentes de TI.
  - [ ] Transformação afim matematicamente perfeita comprovada por testes unitários determinísticos para quadrados e retângulos arbitrários.

---

#### Tarefa 2.2: Motor de Conectores com Snap, Pontas de Seta, Reidratação de Índice e Roteamento Manhattan
- **Requisitos Cobertos**: RF-E02, RF-E06, Spec §3.5, §7.2.
- **Descrição Técnica**:
  - **Schema de Conector com Armazenamento Integral de Vértices de Mundo (`points`)**:
    - Para assegurar que desconexões limpas (Clean Detachment) e trajetos ortogonais complexos nunca sofram perda de coordenadas, `ArrowElement.points` armazena a sequência completa de vértices em coordenadas absolutas de mundo:
    ```typescript
    export interface WorldPoint {
      x: number;
      y: number;
    }

    export type AnchorPosition =
      | 'top' | 'right' | 'bottom' | 'left'
      | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

    export interface AnchorBinding {
      elementId: string;
      anchor: AnchorPosition;
    }

    export interface ArrowElement extends CanvasElementBase {
      type: 'arrow';
      startBinding: AnchorBinding | null;
      endBinding: AnchorBinding | null;
      routing: 'straight' | 'curved' | 'orthogonal';
      startArrowhead: 'none' | 'arrow' | 'triangle' | 'circle' | 'diamond';
      endArrowhead: 'none' | 'arrow' | 'triangle' | 'circle' | 'diamond';
      /**
       * Vertices do trajeto em coordenadas globais de mundo.
       * Invariantes estruturais:
       * 1. points.length >= 2 (sempre possui ponto inicial e final).
       * 2. points[0] (Start Point): atualizado com a âncora se startBinding !== null;
       *    armazena a coordenada fixa de mundo se startBinding === null.
       * 3. points[points.length - 1] (End Point): atualizado com a âncora se endBinding !== null;
       *    armazena a coordenada fixa de mundo se endBinding === null.
       * 4. points.slice(1, -1): pontos intermediários / cotovelos (ex.: 2 dobras de 90° em Manhattan).
       */
      points: [WorldPoint, WorldPoint, ...WorldPoint[]];
    }
    ```
  - **Índice Invertido Bidirecional de Vínculos (`BindingIndexManager`)**:
    - Gerencia `shapeToArrows: Map<string, Set<string>>` e `arrowToShapes: Map<string, Set<string>>`.
    - Ao transladar ou redimensionar uma forma, todas as setas conectadas são identificadas em tempo $O(1)$ e seus pontos terminais recalculados instantaneamente.
    - **Ciclo de Vida de Reidratação Obrigatório (`rebuild`)**:
      - A reidratação do índice em tempo $O(N)$ (benchmark comprovado: 1.05ms para 2.000 elementos) é disparada deterministicamente em 4 momentos vitais:
        1. Carga de Cena (`GET /api/boards/:id/scene` e Importação JSON `.drawit`).
        2. Execução de comandos de Undo e Redo (`Ctrl+Z` / `Ctrl+Y`).
        3. Operações de Clipboard (Colar `Ctrl+V` e Duplicar `Ctrl+D`).
        4. Troca de quadro ativo no editor.
  - **Algoritmos de Roteamento de Trajeto**:
    1. **Reto (`straight`)**: Segmento linear direto de `points[0]` a `points[points.length - 1]`.
    2. **Curvo (`curved`)**: Curva cúbica de Bézier com vetores tangentes normais projetados a partir das âncoras.
    3. **Ortogonal Manhattan (`orthogonal`)**:
       - No MVP, adota roteamento heurístico em 3 a 5 segmentos ortogonais: projeta um stub perpendicular de saída (20px de clearance box em torno da forma de origem), executa as dobras de $90^\circ$ e adentra perpendicularmente pelo stub de entrada na âncora de destino, evitando sobreposição com o par conectado. O algoritmo de pathfinding dinâmico A* contornando múltiplos obstáculos arbitrários pelo canvas é reservado estrategicamente para a Fase 4.
- **Estratégia de Testes (TDD)**:
  - *Teste de Reidratação do Índice em Carga de Cena*: Serializar uma cena com Retângulo 1, Retângulo 2 e Seta A vinculada a eles. Hidratar o `CanvasEngine`. `bindingIndex.getConnectedArrows(Retangulo1.id)` deve conter `SetaA.id`.
  - *Teste de Preservação de Coordenadas de Mundo*: Conectar seta entre dois elementos; desanexar manualmente um terminal; verificar que `points[0]` retém exatamente a posição global onde a âncora se localizava.
- **Critérios de Aceite**:
  - [ ] Setas permanecem magneticamente vinculadas durante translação e redimensionamento.
  - [ ] Reconstituição total do índice de vínculos após carga de cena e operações de desfazer/refazer.
  - [ ] Array `points` armazena todos os vértices de mundo sem dependência de propriedades transitórias.

---

#### Tarefa 2.3: Desconexão Limpa de Conectores na Exclusão de Elementos (Clean Detachment com Preservação de `points`)
- **Requisitos Cobertos**: RF-E07, Spec §3.5.
- **Descrição Técnica**:
  - Ao deletar qualquer elemento do canvas, **nenhum conector conectado a ele é deletado**.
  - O algoritmo de desconexão limpa (`detachConnectedArrows`) congela a extremidade vinculada nas coordenadas absolutas de mundo onde a âncora se encontrava no instante da remoção:
    ```typescript
    function detachConnectedArrows(
      deletedShape: CanvasElement,
      arrows: ArrowElement[]
    ): ArrowElement[] {
      return arrows.map(arrow => {
        let updatedPoints = [...arrow.points] as [WorldPoint, WorldPoint, ...WorldPoint[]];
        let newStartBinding = arrow.startBinding;
        let newEndBinding = arrow.endBinding;

        // Congela terminal inicial caso conectado ao elemento deletado
        if (arrow.startBinding?.elementId === deletedShape.id) {
          const anchorWorldPos = computeAnchorWorldPosition(deletedShape, arrow.startBinding.anchor);
          updatedPoints[0] = { x: anchorWorldPos.x, y: anchorWorldPos.y };
          newStartBinding = null;
        }

        // Congela terminal final caso conectado ao elemento deletado
        if (arrow.endBinding?.elementId === deletedShape.id) {
          const anchorWorldPos = computeAnchorWorldPosition(deletedShape, arrow.endBinding.anchor);
          updatedPoints[updatedPoints.length - 1] = { x: anchorWorldPos.x, y: anchorWorldPos.y };
          newEndBinding = null;
        }

        return {
          ...arrow,
          startBinding: newStartBinding,
          endBinding: newEndBinding,
          points: updatedPoints
        };
      });
    }
    ```
  - Remove as referências do elemento excluído de `BindingIndexManager`.
- **Estratégia de Testes (TDD)**:
  - *Teste de Desconexão Limpa*: Criar Retângulo A em $(100, 100)$ e Retângulo B em $(400, 100)$ conectados por Seta S. Deletar Retângulo A. Validar que:
    1. Retângulo A é removido da lista de elementos.
    2. Seta S permanece na cena.
    3. `S.startBinding` é estritamente `null`.
    4. `S.points[0]` armazena exatamente a coordenada de mundo da âncora correspondente no Retângulo A.
    5. `S.endBinding` permanece apontando para o Retângulo B.
- **Critérios de Aceite**:
  - [ ] Nenhuma seta é excluída acidentalmente ao deletar nós do diagrama.
  - [ ] Posição visual das setas desconectadas é 100% preservada no canvas.

---

#### Tarefa 2.4: Catálogo Nativo de Componentes de TI com Cache SVG e Renderização Dinâmica
- **Requisitos Cobertos**: RF-E03, RNF-SEC06, Spec §7.1, §7.2.
- **Descrição Técnica**:
  - Criação do catálogo nativo composto por 20 componentes essenciais de arquitetura:
    - **Clientes**: Navegador Web, Celular/Mobile, Desktop/Laptop, Usuário/Ator.
    - **Backend**: Servidor, Microsserviço, Worker/Fila, API Gateway, Load Balancer.
    - **Dados**: Banco de Dados SQL, Banco de Dados NoSQL, Cache em Memória (Redis), Armazenamento de Objetos (S3).
    - **Mensageria**: Fila de Mensagens (RabbitMQ/SQS), Fluxo de Eventos (Kafka).
    - **Infra/Nuvem**: Provedor Cloud, CDN, Firewall, Container Docker, Cluster Kubernetes.
  - **Arquitetura de Renderização e Caching**:
    - Ícones modelados em vetores SVG limpos com `viewBox="0 0 64 64"`.
    - O SVG utiliza `currentColor`, permitindo herdar dinamicamente as cores de contorno configuradas pelo usuário.
    - Cache em memória de `ImageBitmap` ou offscreen canvases para evitar parse repetido de strings XML no meio do loop de renderização a 60fps.
    - Rótulo de texto editável renderizado centralizado sob o ícone do componente.
- **Estratégia de Testes (TDD)**:
  - *Teste de Sanitização*: Garantir que strings SVG que contenham tags `<script>` ou manipuladores de eventos (`onload=`) sejam categoricamente rejeitadas e sanitizadas.
  - *Teste de Renderização Dinâmica*: Mudar o `strokeColor` do componente de TI para `#ef4444` deve alterar a cor de traçado do ícone SVG sem recriar o elemento no canvas.
- **Critérios de Aceite**:
  - [ ] 20 componentes de TI nativos disponíveis na barra de ferramentas e no menu de inserção.
  - [ ] Rótulo de texto abaixo do componente com suporte a edição por duplo clique.

---

#### Tarefa 2.5: Submódulo de Tipografia e Edição In-Place via Overlay HTML Textarea com Guarda de Teclado
- **Requisitos Cobertos**: RF-E04, RNF-S04, Spec §3.5.
- **Descrição Técnica**:
  - Ao dar duplo clique em um elemento de texto ou forma:
    1. Calcula os limites de tela ($x_s, y_s, W_s, H_s$) e a rotação.
    2. Monta um elemento HTML `<textarea>` transparente diretamente sobre a área de texto no DOM.
    3. A textarea herda dinamicamente a tipografia (sans-serif, monoespaçada, manuscrita), alinhamento, tamanho e escala de zoom corrente do canvas.
    4. O usuário digita com suporte total a acentuação (IME), seleção e quebras de linha.
    5. A guarda da barra de espaço (Tarefa 1.2) garante que o caractere de espaço seja inserido no texto em vez de acionar a ferramenta Pan.
    6. No evento `blur`, `Esc` ou `Cmd+Enter`, comita o texto no elemento, desmonta a textarea e retorna à renderização por Canvas 2D com auto-wrap via `ctx.measureText`.
- **Estratégia de Testes (TDD)**:
  - *Teste de Montagem da Textarea*: O duplo clique sobre o elemento de texto nas coordenadas de mundo $(500, 400)$ com zoom de $2.0$ deve posicionar a textarea na tela exatamente sobre o bounding box correspondente com fonte escalada por 2.
  - *Teste de Digitação com Barra de Espaço*: Garantir que digitar frases com múltiplos espaços no textarea não altere as coordenadas de pan do canvas.
- **Critérios de Aceite**:
  - [ ] Edição natural de textos com fidelidade tipográfica entre a textarea de edição e a renderização final no canvas.
  - [ ] Suporte a três famílias tipográficas: Manuscrita, Sans-serif e Monoespaçada.

---

#### Tarefa 2.6: Painel Inspetor de Estilos, Paleta Arquitetural e Efeitos Visuais
- **Requisitos Cobertos**: RNF-S02, RNF-S03, RNF-S05, RNF-S06.
- **Descrição Técnica**:
  - Painel flutuante em `shadcn/ui` montado na lateral direita quando há elementos selecionados.
  - Controles de configuração:
    - **Cor de Contorno e Preenchimento**: Paleta selecionada com temas arquiteturais sóbrios e seletor hexadecimal livre.
    - **Espessura do Traço**: Botões para 1px, 2px, 4px e 8px.
    - **Estilo de Linha**: Sólido (`[]`), Tracejado (`[8, 8]`) e Pontilhado (`[2, 4]`).
    - **Opacidade**: Slider de 0% a 100% mapeado para `ctx.globalAlpha`.
    - **Efeitos Visuais**: Suporte a Neon Glow (`shadowBlur` + `shadowColor`), Sombra e Blur com controle de intensidade.
  - Para evitar degradação de performance por uso intensivo de `ctx.shadowBlur`, o efeito neon é simplificado durante operações ativas de pan/zoom e restaurado quando o canvas entra em repouso.
- **Estratégia de Testes (TDD)**:
  - *Teste de Mutação em Lote*: Tendo 5 elementos selecionados, alterar a cor de contorno no painel de estilos deve atualizar atomicamente a propriedade `style.strokeColor` dos 5 elementos em um único comando de Undo.
- **Critérios de Aceite**:
  - [ ] Aplicação em tempo real de estilos sem travamento na interface.
  - [ ] Suporte a efeito Neon vibrante configurável por elemento.

---

#### Tarefa 2.7: Operações de Clipboard com Remapeamento Profundo de UUIDs, Bindings e Reidratação de Índice
- **Requisitos Cobertos**: RF-E10, Spec §3.5.
- **Descrição Técnica**:
  - Implementação de Copiar (`Ctrl+C`), Recortar (`Ctrl+X`), Colar (`Ctrl+V`) e Duplicar (`Ctrl+D`).
  - Serialização JSON com identificador proprietário `{ "app": "drawit", "version": 1, "elements": [...] }` gravado na API `navigator.clipboard`.
  - **Algoritmo de Remapeamento de Bindings**:
    - Ao colar ou duplicar, novos UUIDs v4 são gerados para cada entidade.
    - Criação de uma tabela de substituição `Map<oldId, newId>`.
    - Para qualquer seta colada:
      - Se a forma conectada também fizer parte do conjunto copiado, o binding é remapeado para o novo ID clonado da forma.
      - Se a forma conectada não estiver no clipboard, o binding é anulado (`null`), congelando a ponta da seta nas coordenadas de mundo deslocadas em $+20\text{px}$.
    - Reidratação imediata do `BindingIndexManager` com os novos nós e setas duplicados.
- **Estratégia de Testes (TDD)**:
  - *Teste de Clonagem de Bindings*: Copiar um par (Retângulo A + Seta S conectada a A). Colar no canvas. Validar que Retângulo A' e Seta S' possuem novos UUIDs, `S'.startBinding` aponta para o ID de A' e o `BindingIndexManager` indexa o novo par.
- **Critérios de Aceite**:
  - [ ] Copiar e colar preserva integralmente as relações topológicas internas sem corromper os elementos originais.
  - [ ] Compatibilidade de colar entre diferentes quadros e sessões de navegador.

---

### 4.4 Fase 3: Quadros, Organização, Persistência & Resiliência

#### Tarefa 3.1: API REST e Repositório de Quadros com Isolamento de Usuário e Inicialização de Cena
- **Requisitos Cobertos**: RF-Q01, RF-Q02, RF-Q04, RF-Q08, RNF-SEC03, RNF-P04.
- **Descrição Técnica**:
  - Implementação das rotas REST de gerenciamento de quadros:
    - `GET /api/boards`: Listagem paginada por cursor (`cursor`, `limit`), com filtros por `groupId`, `tags`, busca textual `q`, status `favorite` e ordenação (`updatedAt`, `createdAt`, `title`).
    - `POST /api/boards`: Criação de novo quadro. O backend valida estritamente a presença do campo `title` (obrigatório, 1 a 120 caracteres).
    - **Inicialização Atômica da Cena com `ownerId`**: Ao criar o quadro na coleção `boards`, insere simultaneamente o documento inicial correspondente em `board_scenes` com isolamento estrito de inquilino:
      ```rust
      let initial_scene = doc! {
          "_id": &board_id,
          "ownerId": &current_user_id,
          "schemaVersion": 1_i32,
          "revision": 1_i64,
          "lastClientSaveId": Bson::Null,
          "contentHash": compute_initial_empty_hash(),
          "elements": bson::Bson::Array(vec![]),
          "viewport": doc! { "panX": 0.0, "panY": 0.0, "zoom": 1.0 },
          "updatedAt": BsonDateTime::now()
      };
      scene_collection.insert_one(initial_scene, None).await?;
      ```
    - `GET /api/boards/:id`: Metadados do quadro.
    - `PATCH /api/boards/:id`: Atualização parcial de metadados (`title`, `groupId`, `tags`, `isFavorite`).
  - **Garantia de Isolamento de Recursos (Multi-Tenancy - RNF-SEC03)**:
    - Todas as consultas MongoDB sem exceção contêm a cláusula `{ "_id": board_id, "ownerId": current_user_id }`.
    - Tentativa de acesso a quadro pertencente a outro usuário retorna HTTP 404 Not Found (prevenindo enumeração de IDs existentes).
- **Contratos & DTOs**:
  - `CreateBoardDto`: `{ title: string (1-120 chars), groupId?: string | null, tags?: string[] }`.
  - `BoardSummaryDto`: `{ id, title, groupId, groupName, tags, isFavorite, thumbnail, lastOpenedAt, createdAt, updatedAt }`.
- **Estratégia de Testes (TDD)**:
  - *Teste de Obrigatoriedade de Título*: Chamar `POST /api/boards` com payload `{ "title": "" }` deve retornar HTTP 422 Unprocessable Content no padrão RFC 7807.
  - *Teste de Isolamento de Usuário*: Autenticar como Usuário A e criar um quadro. Autenticar como Usuário B e tentar executar `GET /api/boards/:id` daquele quadro. A resposta deve ser obrigatoriamente HTTP 404.
- **Critérios de Aceite**:
  - [ ] Endpoints implementados com semântica HTTP RFC 9110 e respostas em camelCase.
  - [ ] Cena correspondente em `board_scenes` criada com `ownerId` e `revision = 1`.

---

#### Tarefa 3.2: Gerador de Título Sequencial Padrão (`Quadro-N`) no Frontend e Validação Backend
- **Requisitos Cobertos**: RF-Q01, RF-Q01a, Spec §3.2, §8.3.
- **Descrição Técnica**:
  - Regra de negócio mandatória: **O backend exige título; o frontend gera o nome sequencial amigável**.
  - **Algoritmo de Geração Sequencial**:
    - Ao disparar a criação de um novo quadro, o frontend analisa a lista completa de quadros do usuário (incluindo quadros presentes na lixeira).
    - Executa regex sobre os títulos: `/^Quadro-(\d+)$/i`.
    - Identifica o maior número inteiro $N$ encontrado.
    - O novo título gerado automaticamente é `Quadro-${N + 1}` (se nenhum existir, gera `Quadro-1`).
    - O valor gerado é enviado no payload de `POST /api/boards`.
    - O usuário pode renomear o quadro a qualquer momento no cabeçalho do editor através de edição inline ou diálogo de renomeação (RF-Q01a).
- **Estratégia de Testes (TDD)**:
  - *Teste do Gerador Sequencial*:
    - Dados os quadros com títulos `Quadro-1`, `Arquitetura`, `Quadro-4` e `Quadro-2` (na lixeira).
    - O cálculo do próximo nome padrão deve retornar deterministicamente `Quadro-5`.
- **Critérios de Aceite**:
  - [ ] Criação rápida de novos quadros sem interrupção por caixas modais pedindo nome.
  - [ ] Título editável a qualquer momento na interface do editor.

---

#### Tarefa 3.3: API REST e Repositório de Grupos com Política de Deleção de Fallback ("Sem grupo")
- **Requisitos Cobertos**: RF-O01, RF-O02, Spec §3.3, §14.2.
- **Descrição Técnica**:
  - Implementação dos endpoints para organização de pastas de quadros:
    - `GET /api/groups`: Lista todos os grupos do usuário com contagem agregada de quadros ativos em cada grupo via pipeline de agregação do MongoDB.
    - `POST /api/groups`: Cria grupo (nome de 1 a 60 caracteres, cor opcional, ícone opcional). Unicidade de nome por usuário garantida por índice no MongoDB.
    - `PATCH /api/groups/:id`: Renomeia ou altera cor/ícone do grupo.
    - `DELETE /api/groups/:id?boards=move|trash`: Exclusão do grupo aplicando a política resolvida na Seção 14:
      - **Comportamento Padrão (`boards=move` ou parâmetro omitido)**: Executa `updateMany` desvinculando todos os quadros associados àquele grupo (`groupId = null`), preservando-os intactos na visão "Sem grupo".
      - **Comportamento Destrutivo Explícito (`boards=trash`)**: Move todos os quadros ativos daquele grupo para a lixeira (`isDeleted = true`, `deletedAt = now()`).
- **Estratégia de Testes (TDD)**:
  - *Teste de Deleção Padrão de Grupo*: Criar Grupo G com 3 quadros vinculados. Executar `DELETE /api/groups/:id` sem parâmetros. Validar que o Grupo G foi removido e os 3 quadros permanecem ativos com `groupId == null`.
  - *Teste de Deleção com Envio à Lixeira*: Criar Grupo H com 2 quadros vinculados. Executar `DELETE /api/groups/:id?boards=trash`. Validar que os 2 quadros foram marcados como deletados e aparecem na consulta da lixeira.
- **Critérios de Aceite**:
  - [ ] Nenhum quadro é perdido acidentalmente na deleção de pastas.
  - [ ] Contagem agregada de quadros por grupo sempre consistente.

---

#### Tarefa 3.4: Sistema de Tags Livres por Quadro com Agregação e Filtro Dinâmico
- **Requisitos Cobertos**: RF-O03, RF-O04, RF-O05, Spec §3.3, §14.4.
- **Descrição Técnica**:
  - Conforme resolução da Seção 14, as tags são livres por quadro (strings sem pré-cadastro relacional rígido).
  - Normalização no backend: strings sanitizadas com trim, convertidas para caixa baixa e deduplicadas no array do documento `boards`. Limite de 20 tags por quadro, máximo de 30 caracteres por tag.
  - Endpoint `GET /api/tags`: Utiliza pipeline de agregação `$unwind` e `$group` no MongoDB para listar todas as tags em uso pelo usuário com suas respectivas contagens de quadros, alimentando o autocomplete da interface.
  - Filtro em `GET /api/boards?tags=tag1,tag2`: Utiliza operador `$all` do MongoDB, retornando apenas quadros que contenham simultaneamente todas as tags solicitadas.
- **Estratégia de Testes (TDD)**:
  - *Teste de Filtro por Múltiplas Tags*: Cadastrar Quadro 1 (`tags: ["auth", "api"]`) e Quadro 2 (`tags: ["auth", "db"]`). Consultar `GET /api/boards?tags=auth,api` deve retornar unicamente o Quadro 1.
- **Critérios de Aceite**:
  - [ ] Autocomplete ágil de tags existentes no momento da digitação.
  - [ ] Filtragem multi-tag precisa e indexada.

---

#### Tarefa 3.5: Gestão da Lixeira com Retenção de 30 Dias, Prevenção de TOCTOU e Worker Tokio de Purga sem Vazamento de Storage
- **Requisitos Cobertos**: RF-Q05, RF-Q06, Spec §3.2, §14.3.
- **Descrição Técnica**:
  - **Soft Delete**: `DELETE /api/boards/:id` atualiza `isDeleted = true` e `deletedAt = BsonDateTime::now()`. O quadro é imediatamente omitido das listagens ativas normais.
  - `GET /api/trash`: Lista os quadros na lixeira pertencentes ao usuário com cálculo do campo computado `retentionDaysLeft` ($30 - \lfloor(\text{now} - \text{deletedAt}) / 86400\rfloor$).
  - `POST /api/boards/:id/restore`: Restaura o quadro da lixeira (`isDeleted = false`, `deletedAt = null`). Se o grupo original do quadro tiver sido excluído durante o período na lixeira, o quadro é restaurado com `groupId = null` sem disparar erro.
  - **Esvaziamento Manual da Lixeira sem Vazamento de Versões (`POST /api/trash/empty`)**:
    - Realiza exclusão física de todos os quadros na lixeira do usuário atual (`ownerId: current_user_id`).
    - Deleta simultaneamente das coleções `boards`, `board_scenes` e `board_versions`, garantindo a remoção de todos os snapshots de histórico órfãos.
  - **Worker Tokio de Purga Automática com Prevenção de TOCTOU**:
    - Tarefa assíncrona agendada no runtime Tokio (`tokio::time::interval` de 24 horas).
    - **Solução Anti-TOCTOU (Time-of-Check to Time-of-Use)**:
      - O worker não realiza exclusões cegas baseadas em listas antigas de IDs.
      - Para cada quadro candidato (`isDeleted: true, deletedAt <= now - 30 dias`), executa uma **deleção condicional atômica** no documento raiz:
        ```rust
        let delete_result = boards_col.delete_one(doc! {
            "_id": board_id,
            "isDeleted": true,
            "deletedAt": { "$lte": cutoff_bson }
        }, None).await?;
        ```
      - Se `delete_result.deleted_count == 1`: o quadro foi confirmado como deletado exatamente no instante da execução. O worker então remove a cena em `board_scenes` (`delete_one({ "_id": board_id })`) e os snapshots em `board_versions` (`delete_many({ "boardId": board_id })`).
      - Se `delete_result.deleted_count == 0`: o usuário restaurou o quadro milissegundos antes da purga. O worker aborta a remoção da cena e das versões, evitando corromper dados restaurados.
- **Estratégia de Testes (TDD)**:
  - *Teste Anti-TOCTOU no Purge Worker*: Inserir quadro com `deletedAt = now - 31 dias`. Simular chamada concorrente de restauração (`isDeleted = false`). Rodar o ciclo de purga. O quadro e sua cena devem permanecer intactos no banco.
  - *Teste de Limpeza de Versões Órfãs*: Criar versões históricas para um quadro na lixeira. Executar `POST /api/trash/empty`. O número de documentos remanescentes em `board_versions` para aquele quadro deve ser estritamente zero.
- **Critérios de Aceite**:
  - [ ] Retenção automática de 30 dias com expurgo silencioso e seguro.
  - [ ] Zero vazamento de armazenamento em `board_versions`.
  - [ ] Proteção atômica contra corridas TOCTOU na purga diária.

---

#### Tarefa 3.6: Autosave Resiliente em 3 Níveis (IndexedDB Write-Ahead + Cota 64KB Keepalive + Recuperação), Concorrência Otimista (OCC Multi-Tenant) e Idempotência de Retentativa
- **Requisitos Cobertos**: RF-Q10, RNF-R01, RNF-R02, RNF-R03, Spec §4.3, §9.2.
- **Descrição Técnica**:
  - **Arquitetura de Resiliência de Autosave em 3 Níveis**:
    ```
    Edição no Canvas pelo Usuário
           │
           ▼
    [Nível 1: Continuous Write-Ahead Cache em IndexedDB]
    (Commit local em IndexedDB drawit_offline_db a cada edição / throttle 200ms, syncStatus: 'dirty')
           │
           ├─────────────────────────────────┬────────────────────────────────┐
           ▼                                 ▼                                ▼
    [Debounced Server Autosave]       [Tab Unload: Payload <= 64KB]    [Tab Unload: Payload > 64KB]
    (1-2s debounce over HTTP PUT)     (fetch keepalive: true)          (Ignora fetch, preserva IDB)
           │                                 │                                │
           ▼                                 ▼                                │
    Atualiza IDB syncStatus: 'synced'  Atualiza IDB syncStatus: 'synced'      │
                                                                              ▼
                                                                [Nível 3: Recuperação na Próxima Sessão]
                                                                (Detecta dirty no mount do editor e
                                                                 oferece restauração transparente)
    ```
    - **Nível 1 (Client-Side Write-Ahead Cache em IndexedDB)**:
      - Banco de dados IndexedDB local `drawit_offline_db` com a store `scene_write_ahead` indexada por `boardId`.
      - A cada alteração na cena (com throttle de 200ms durante arrastes), grava o snapshot com `syncStatus: 'dirty'` (<5ms de execução, fora do frame loop de 60fps).
      - Ao receber HTTP 200 do backend, atualiza para `syncStatus: 'synced'`.
    - **Nível 2 (`beforeunload` e `pagehide` com Limite de 64KB)**:
      - O W3C Fetch Specification impõe um limite estrito de **64 KB** no buffer total de requisições pendentes com `keepalive: true`. Cenas ricas com mais de 100 elementos ultrapassam rotineiramente essa cota, causando `TypeError: keepalive payload exceeds 64KB`.
      - **Condicionamento de Envio**:
        - Mede o tamanho em bytes do payload via `new TextEncoder().encode(json).length`.
        - Se $\le 64\text{KB}$: despacha `fetch(`/api/boards/${boardId}/scene`, { method: 'PUT', keepalive: true, body: json })`.
        - Se $> 64\text{KB}$: **omite a chamada de rede keepalive**, evitando o TypeError no navegador e confiando no snapshot gravado com segurança no IndexedDB (Nível 1).
    - **Nível 3 (Recuperação Automática na Próxima Sessão)**:
      - Ao abrir o quadro (`GET /api/boards/:id/scene`), o editor lê o cache local no IndexedDB. Se houver registro com `syncStatus === 'dirty'` e `updatedAt` superior ao do servidor, exibe banner discreto de recuperação: *"Detectamos alterações locais não salvas antes do fechamento da aba. Deseja recuperá-las?"*, sincronizando com o backend após confirmação.
  - **Controle de Concorrência Otimista (OCC) com Isolamento Multi-Tenant (RNF-SEC03)**:
    - O filtro de atualização valida atomicamente a posse e a revisão:
      ```rust
      let scene_filter = doc! {
          "_id": &board_id,
          "ownerId": &current_user_id,
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
          "$inc": { "revision": 1_i64 }
      };
      let result = scene_collection.update_one(scene_filter, scene_update, None).await?;
      ```
    - **Sincronização do Timestamp do Dashboard (`boards.updatedAt`)**:
      - Quando a atualização de `board_scenes` obtém sucesso (`result.matched_count == 1`), o manipulador executa imediatamente o toque no timestamp do quadro principal:
        ```rust
        board_collection.update_one(
            doc! { "_id": &board_id, "ownerId": &current_user_id },
            doc! { "$set": { "updatedAt": now } },
            None
        ).await?;
        ```
      - Isso garante que a listagem do dashboard (`GET /api/boards`, indexada por `{ "ownerId": 1, "isDeleted": 1, "updatedAt": -1 }`) ordene o quadro recentemente editado no topo absoluto de "Mais recentes".
    - **Desambiguação e Idempotência de Retentativas de Rede (`clientSaveId` e `contentHash`)**:
      - Se `result.matched_count == 0`:
        - 1. Consulta o documento atual: `scene_collection.find_one(doc! { "_id": &board_id, "ownerId": &current_user_id }, None).await?`.
        - Se `None`: o quadro não existe ou pertence a outro usuário $\implies$ responde **HTTP 404 Not Found** (`BOARD_NOT_FOUND`), impedindo vazamento de metadados.
        - Se `Some(current_scene)`: verifica se a requisição é uma retentativa idêntica provocada por queda de conexão no momento do envio da resposta anterior:
          $$\text{is\_idempotent} = (\text{current\_scene.revision} == \text{payload.revision} + 1) \land (\text{lastClientSaveId} == \text{payload.clientSaveId} \lor \text{contentHash} == \text{hash})$$
        - Se `is_idempotent == true`: a mutação já foi persistida com sucesso. Responde **HTTP 200 OK** `{ "revision": current_scene.revision, "idempotentReplay": true }`, evitando falsos alertas de conflito ao usuário.
        - Se `is_idempotent == false`: trata-se de um verdadeiro conflito de concorrência entre abas. Responde **HTTP 409 Conflict** no padrão RFC 7807 contendo `"serverRevision": current_scene.revision` serializado via mapa `extensions`.
- **Estratégia de Testes (TDD)**:
  - *Teste de Isolamento Multi-Tenant no OCC*: Usuário B tenta atualizar cena de Usuário A; a resposta deve ser obrigatoriamente HTTP 404, sem alterar a revisão de A.
  - *Teste de Idempotência em Retentativa de Rede*: Enviar PUT com `revision = 5` e `clientSaveId = "uuid-123"`. O servidor atualiza para `revision = 6`. Reenviar a mesma requisição com `revision = 5` e `clientSaveId = "uuid-123"`. O servidor deve retornar HTTP 200 OK com `idempotentReplay: true` e `revision = 6`.
  - *Teste de Conflito Concorrente Real*: Enviar PUT com `revision = 5` e payload modificado. O servidor deve responder HTTP 409 Conflict com `serverRevision = 6`.
  - *Teste de Sincronização do Dashboard*: Salvar cena de um quadro antigo; consultar `GET /api/boards`; validar que o quadro salvo figura no topo da listagem e que `boards.updatedAt` equivale ao da cena.
  - *Teste de Cota de 64KB no Unload*: Simular cena com 300 elementos (>100KB); disparar evento `beforeunload`; verificar que `fetch(keepalive)` não é invocado, mantendo o snapshot íntegro no IndexedDB.
- **Critérios de Aceite**:
  - [ ] Nenhuma alteração sobrescreve trabalho de abas concorrentes.
  - [ ] Retentativas de rede após perda de conexão não disparam falsos alertas 409.
  - [ ] Quadros modificados sobem para o topo do dashboard instantaneamente.
  - [ ] Cota de 64KB respeitada sem lançar exceções não tratadas no navegador.

---

#### Tarefa 3.7: Dashboard da Biblioteca de Quadros (Navegação, Grupos, Lixeira, Modos Grade/Lista)
- **Requisitos Cobertos**: RF-Q02, RF-O02, RF-O06, RNF-S00, RNF-U01.
- **Descrição Técnica**:
  - Interface principal construída com `shadcn/ui`:
    - **Barra Lateral Esquerda**: Lista de navegação com "Todos os Quadros", "Favoritos", grupos com badges de contagem de quadros, nuvem de tags ativas e atalho para "Lixeira".
    - **Barra Superior**: Campo de busca textual unificada (título e tags com debounce de 300ms), filtro de ordenação e alternador de visualização (**Grade** com cards visuais vs **Lista** tabular densa).
    - **Área Central**: Grid responsivo de quadros com cards contendo título, grupo associado, tags em badges, data da última edição e menu contextual de ações (Renomear, Mover de Grupo, Duplicar, Deletar).
    - **Modal de Lixeira**: Visualização com indicador de dias restantes e botão "Esvaziar Lixeira Agora".
- **Estratégia de Testes (TDD)**:
  - *Teste de Busca no Dashboard*: Digitar "micro" no input de busca; os cards na tela devem ser filtrados instantaneamente, ocultando quadros cujos títulos ou tags não correspondam ao termo.
- **Critérios de Aceite**:
  - [ ] Navegação intuitiva, rápida e 100% responsiva para desktop e tablets.
  - [ ] Suporte a navegação por teclado com foco visível acessível (WCAG AA).

---

#### Tarefa 3.8: Motor de Exportação do Canvas (PNG HiDPI, SVG Vetorial e JSON Versionado)
- **Requisitos Cobertos**: RF-P03, RF-P04, Spec §3.6.
- **Descrição Técnica**:
  - Diálogo de exportação com opções configuráveis:
    1. **Exportação PNG**:
       - Calcula o Bounding Box envolvendo todos os elementos (ou apenas os selecionados) com 40px de margem externa.
       - Renderiza em um elemento `<canvas>` offscreen em memória com escalas $1\times$, $2\times$ ou $3\times$ para geração de imagens HiDPI nítidas.
       - Opção de exportar com fundo colorido (tema atual) ou fundo transparente (`alpha`).
       - Dispara download via `toBlob` como imagem PNG.
    2. **Exportação SVG**:
       - Gera string XML SVG contendo `<svg viewBox="..." xmlns="...">`.
       - Converte cada elemento da cena em nós vetoriais equivalentes (`<rect>`, `<ellipse>`, `<path>`, `<text>`).
       - Insere definições de marcadores (`<defs><marker ...>`) para as pontas de seta.
    3. **Exportação / Importação JSON (`.drawit`)**:
       - Exporta arquivo JSON versionado contendo `{ "schemaVersion": 1, "app": "drawit", "board": { "title", "elements", "viewport" } }`.
       - Importador valida a integridade do JSON via schema Zod, realiza migrações de campos legados se necessário, reidrata o `BindingIndexManager` e restaura o diagrama com novos UUIDs.
- **Estratégia de Testes (TDD)**:
  - *Teste de Roundtrip JSON*: Exportar uma cena com 10 elementos variados para JSON. Limpar o canvas. Importar o JSON gerado. A quantidade de elementos, posições, cores e bindings deve ser matematicamente idêntica à cena original, com o índice de vínculos reidratado.
- **Critérios de Aceite**:
  - [ ] Exportação de PNG e SVG nítidos e recortados sobre o conteúdo real.
  - [ ] Arquivo `.drawit` portável e imune a corrupção de schema.

---

## 5. Visão Estratégica das Fases Futuras (Fases 4 e 5)

---

### 5.1 Fase 4: Qualidade de Vida (Visão Estratégica)
*Objetivo: Elevar a ergonomia diária de uso após a entrega do núcleo funcional do MVP.*

1. **Atalhos de Teclado Avançados e Command Palette (RF-P02, RF-P05)**:
   - Cheat Sheet acessível via atalho `?` detalhando todos os comandos.
   - Command Palette (`Ctrl+K` ou `Cmd+K`) permitindo busca e inserção rápida de qualquer componente de TI, forma geométrica ou comando do sistema.
2. **Snapping Inteligente, Guias Visuais e Roteamento A* Dinâmico (RF-C05, RF-E02)**:
   - Projeção de linhas guias dinâmicas (vermelhas/azuis) ao alinhar centros e arestas com outros elementos adjacentes.
   - Distribuição equidistante automática com indicadores de espaçamento em pixels.
   - Pathfinding ortogonal avançado com algoritmo A* para desviar dinamicamente de caixas de colisão de elementos arbitrários intermediários na tela.
3. **Agrupamento e Ordenação de Camadas (RF-E11, RF-E12)**:
   - Agrupar múltiplos elementos em contêineres lógicos (`Ctrl+G`) e desagrupar (`Ctrl+Shift+G`).
   - Comandos de camada: "Trazer para a Frente" (`Ctrl+]`), "Enviar para Trás" (`Ctrl+[`), avançar e recuar um nível de zIndex.
4. **Miniaturas de Quadros e Snapshots Históricos (RF-Q09, RF-Q11)**:
   - Geração assíncrona de thumbnails leves salvos em WebP no banco para renderização nos cards do dashboard.
   - Snapshots automáticos salvos na coleção `board_versions` a cada 5 minutos de edição contínua, permitindo visualizar e restaurar pontos de restauração anteriores no tempo.

---

### 5.2 Fase 5: Futuro & Colaboração em Tempo Real (Visão Estratégica)
*Objetivo: Evolução do sistema de ferramenta local e individual para plataforma de colaboração em tempo real para times de engenharia.*

1. **Colaboração em Tempo Real Multi-Usuário (Spec §10 - Fase 5)**:
   - Protocolo de sincronização bidirecional via WebSockets (módulo Axum WebSocket).
   - Adoção de Tipos de Dados Replicados sem Conflito (**CRDTs** via **Yjs** ou **Automerge**) operando sobre o modelo de dados do canvas.
   - Detecção e resolução automática de conflitos concorrentes sem bloqueios ou telas de erro 409.
2. **Presença Visual e Cursores Remotos**:
   - Transmissão contínua da posição do mouse dos colaboradores na sala virtual com interpolação suave e avatares identificadores.
3. **Compartilhamento por Links e Permissões de Acesso (RF-Q12)**:
   - Geração de links compartilháveis com permissões granulares: Apenas Leitura (Read-Only) ou Edição (Editor).
   - Proteção de quadros compartilhados por senha opcional ou expiração de token de acesso público.
4. **Hierarquia Completa de Pastas (Subgrupos - RF-O10)**:
   - Ativação do campo `parentId` na coleção `groups`, permitindo árvore de pastas com níveis ilimitados de aninhamento e navegação breadcrumb.
5. **Busca Textual Profunda no Conteúdo das Cenas (RF-O11)**:
   - Indexação textual de todos os textos internos de nós, rótulos de componentes de TI e anotações, viabilizando encontrar quadros a partir de termos contidos dentro dos desenhos.

---

## 6. Estratégia Global de Testes & Pirâmide de Qualidade

A estratégia de testes assegura estabilidade matemática, integridade de dados e ausência de regressões:

```
                       /\
                      /  \
                     / E2E\           Playwright (4 Jornadas Críticas no Browser)
                    /------\
                   /  INT   \         Axum + MongoDB (Docker / Testcontainers)
                  /----------\
                 /    UNIT    \       Zustand Stores, Serviços Rust, JWT, Argon2id em spawn_blocking
                /--------------\
               /   MATH & GEOM  \     Canvas 2D: Rotação de Âncoras, Hit-Tests Finos, R-Tree, Manhattan
              /------------------\
```

---

### 6.1 Testes Unitários de Geometria e Transformações Matemáticas
- **Escopo**: Conversão de coordenadas (Tela $\leftrightarrow$ Mundo), zoom centrado no cursor com deltaMode, culling com `rbush` inflacionado para neon glow, cálculo de AABB com rotação, testes finos de colisão (Losango $L_1$, Triângulo, Cilindro 3 zonas, Elipse), âncoras rotacionadas para quadrados e retângulos e suavização `perfect-freehand`.
- **Ferramenta**: Vitest rodando em modo puramente computacional.
- **Cenários Mandatórios**:
  - Conversão bidirecional de coordenadas em zoom extremo ($0.1$ e $8.0$).
  - Estabilidade do ponto sob o cursor durante scroll contínuo.
  - Âncoras em quadrado $100 \times 100$ sob rotação $90^\circ$: `top` $(150, 100) \rightarrow (200, 150)$ coincidindo com `right`.
  - Âncoras em retângulo $200 \times 100$ sob rotação $90^\circ$: `top` $(150, 100) \rightarrow (200, 150)$ divergindo da posição original de `right` $(250, 150)$.
  - Hit-test em Losango: ponto interno positivo, canto da AABB negativo.
  - Hit-test em Triângulo: ápice e centro da base positivos, cantos externos negativos.
  - Hit-test em Cilindro: calota superior e corpo central positivos, cantos externos negativos.
  - Culling de 2.000 elementos executando em $< 1\text{ms}$.
  - Reidratação do `BindingIndexManager` em $< 5\text{ms}$ para 2.000 nós.

---

### 6.2 Testes Unitários de Estado, Resiliência e Histórico (Frontend Zustand & IndexedDB)
- **Escopo**: Operações imutáveis de elementos na cena, comandos de Undo e Redo, reidratação do índice de vínculos, write-ahead cache em IndexedDB, guarda de 64KB no `beforeunload`, geração de nome sequencial `Quadro-N`.
- **Ferramenta**: Vitest com React Testing Library e fake-indexeddb.
- **Cenários Mandatórios**:
  - Desfazer mutação restaura o estado anterior exato e o vínculo no índice.
  - Refazer após novo comando é categoricamente descartado.
  - Alterações no canvas geram snapshot com `syncStatus: 'dirty'` no IndexedDB.
  - Disparo de `beforeunload` com payload $> 64\text{KB}$ não executa `fetch(keepalive: true)` e evita `TypeError`.
  - Algoritmo `Quadro-N` calcula corretamente o maior valor numérico em títulos existentes.

---

### 6.3 Testes Unitários de Domínio Backend (Rust)
- **Escopo**: Entidades de domínio, hashing de senhas Argon2id em `spawn_blocking`, isolamento do executor Tokio, emissão e validação de claims JWT, rotação de refresh token com grace window de 15s e serialização de erros RFC 7807 com extensões achatadas.
- **Ferramenta**: `cargo test` com mocks de repositório via `mockall`.
- **Cenários Mandatórios**:
  - Hashing seguro e verificação de senha com parâmetros OWASP sem bloquear requisições HTTP paralelas.
  - Rejeição de tokens JWT vencidos ou assinados com chave divergente.
  - Detecção de tentativa de reuso de refresh token rotacionado fora da janela de 15s revogando a família inteira.
  - Serialização de `ProblemDetails` com extensão `serverRevision` no nível raiz.

---

### 6.4 Testes de Integração Backend HTTP & MongoDB (Testcontainers/Docker)
- **Escopo**: Rotas HTTP Axum, cookies HttpOnly de sessão, isolamento estrito de inquilino (`ownerId`) em `board_scenes`, OCC atômico, retentativas idempotentes via `clientSaveId` e `contentHash`, worker de purga sem TOCTOU e sem vazamento de `board_versions`.
- **Ferramenta**: `cargo test --test integration_tests` rodando contra banco MongoDB real containerizado.
- **Cenários Mandatórios**:
  - `PUT /api/boards/:id/scene` com `revision` divergente responde HTTP 409 Conflict no formato RFC 7807 contendo `"serverRevision": R`.
  - `PUT /api/boards/:id/scene` repetido com mesmo `clientSaveId` responde HTTP 200 OK com `idempotentReplay: true`.
  - Usuário sem autorização não consegue visualizar ou alterar recursos alheios (retorna HTTP 404).
  - Atualização de cena atualiza `boards.updatedAt` na coleção de metadados.
  - Worker de purga não deleta quadro restaurado no último milissegundo (Anti-TOCTOU).
  - Esvaziamento de lixeira expurga documentos associados em `boards`, `board_scenes` e `board_versions`.

---

### 6.5 Testes End-to-End com Playwright (4 Jornadas Críticas Completas)

As quatro suítes E2E rodam em navegadores Chromium reais contra a aplicação totalmente montada em Docker:

#### Jornada 1: Ciclo Completo de Autenticação, Multi-Abas e Persistência de Sessão
1. Acessa `/register`, preenche username `dev_tester` e senha segura; clica em "Registrar".
2. Verifica redirecionamento imediato para a biblioteca de quadros vazia com mensagem de boas-vindas.
3. Inspeciona a resposta da rede: o token de acesso reside estritamente na memória da aplicação; o cookie `refresh_token` está configurado com flag `HttpOnly`.
4. Abre duas abas paralelas; verifica que a renovação simultânea de sessão via Web Locks e BroadcastChannel atualiza ambas as abas sem forçar logout.
5. Atualiza a página (`F5`); verifica que a chamada silenciosa para `/api/auth/refresh` restaura a sessão perfeitamente sem exigir novo login.
6. Clica em "Sair da Conta" (Logout); verifica limpeza do estado em memória e redirecionamento para a tela de login.

#### Jornada 2: Gestão Organizacional de Quadros, Grupos e Dashboard
1. Faz login com o usuário criado.
2. Clica em "Novo Grupo", define o nome "Serviços Distribuídos" e a cor azul.
3. Clica em "Criar Quadro". Verifica que o nome inicial atribuído automaticamente foi `Quadro-1`.
4. Abre os detalhes do quadro, associa-o ao grupo "Serviços Distribuídos" e adiciona as tags `backend` e `v1`.
5. Renomeia o quadro para "Topologia da Mensageria".
6. Clica na barra lateral para filtrar pela tag `backend`; verifica que apenas o quadro criado permanece visível na listagem.
7. Deleta o grupo "Serviços Distribuídos" com a opção padrão de mover; valida que o quadro não é excluído e transiciona para a visualização "Sem grupo".

#### Jornada 3: Criação de Diagrama com Componentes de TI, Bindings, Rotação e Histórico
1. Abre o quadro "Topologia da Mensageria" no editor de Canvas 2D.
2. Seleciona a ferramenta Retângulo na barra de ferramentas e clica-arrasta no canvas para desenhar a forma.
3. Abre o catálogo de componentes de TI, escolhe o componente "Database (SQL)" e o posiciona no canvas 200 pixels à direita do retângulo.
4. Seleciona a ferramenta Seta e arrasta do ponto magnético direito do Retângulo até a âncora esquerda do Banco de Dados (estabelecendo o vínculo persistente).
5. Rotaciona o Retângulo em $90^\circ$; verifica que o conector recalculou seu ponto de ancoragem perfeitamente pela transformação afim exata.
6. Seleciona o Retângulo e arrasta 150 pixels para o lado; verifica que a seta estica e acompanha o movimento perfeitamente em tempo real.
7. Pressiona `Ctrl+Z` (Undo); valida que o retângulo retorna à posição original mantendo a seta vinculada e o índice reidratado.
8. Pressiona `Ctrl+Y` (Redo); valida o avanço da posição do retângulo.
9. Deleta o Retângulo; valida que a seta permanece desenhada no canvas com a extremidade solta na posição original de mundo (Clean Detachment com `points` íntegros).

#### Jornada 4: Autosave Resiliente, Sincronização do Dashboard e Concorrência Otimista entre Abas
1. No editor do quadro, insere uma nova forma elíptica.
2. Observa o indicador no cabeçalho transicionar de "Salvando..." para "Salvo".
3. Retorna ao Dashboard em outra aba; verifica que o quadro acabou de subir para a primeira posição da ordenação por `updatedAt`.
4. Abre uma segunda aba no navegador apontando para o mesmo quadro (`/boards/:id`).
5. Na Aba 2, move a elipse para outra posição; o autosave da Aba 2 comita a `revision = 2`.
6. Retorna à Aba 1 (que permaneceu defasada na `revision = 1`) e tenta arrastar um elemento.
7. O autosave da Aba 1 tenta salvar com `revision = 1`; o backend rejeita com HTTP 409 Conflict contendo `"serverRevision": 2`.
8. A Aba 1 exibe o toast de alerta informando conflito de concorrência e trava o salvamento destrutivo cego, preservando a integridade dos dados do usuário.

---

## 7. Matriz Completa de Rastreabilidade de Requisitos

A matriz abaixo mapeia todos os Requisitos Funcionais (RFs) e Não-Funcionais (RNFs) da especificação para suas respectivas fases, tarefas técnicas, arquivos implementados, suítes de teste e critérios de validação:

| ID Requisito | Categoria | Fase | Tarefa | Arquivos Principais Envolvidos | Estratégia de Teste (TDD) | Critério Objetivo de Aceite |
|---|---|---|---|---|---|---|
| **RF-A01** | Auth | Fase 0 | Tarefa 0.5 | `api/src/routes/auth.rs`<br>`api/src/services/auth_service.rs`<br>`web/src/features/auth/RegisterForm.tsx` | `test_register_user_success`<br>`test_register_duplicate_username` | Cadastro com username único e senha; resposta 201 com cookie HttpOnly e JWT; duplicação retorna 409. |
| **RF-A02** | Auth | Fase 0 | Tarefa 0.5 | `api/src/routes/auth.rs`<br>`web/src/features/auth/LoginForm.tsx` | `test_login_valid_credentials`<br>`test_login_invalid_password` | Login com verificação Argon2id em `spawn_blocking`; senha correta gera sessão; senha incorreta retorna 401; logout limpa cookie. |
| **RF-A03** | Auth | Fase 0 | Tarefa 0.5 | `api/src/services/token_service.rs`<br>`web/src/lib/api-client.ts`<br>`web/src/lib/auth-sync.ts` | `test_refresh_token_rotation`<br>`test_refresh_token_grace_window`<br>`test_refresh_token_reuse_detection` | Rotação atômica CAS; tolerância de 15s para abas concorrentes com Web Locks; reuso fora do prazo revoga a família inteira. |
| **RF-A04** | Auth | Fase 0 / 3 | Tarefas 0.2, 3.1 | `api/src/middleware/auth.rs`<br>`api/src/repositories/board_repo.rs` | `test_tenant_isolation_board_get`<br>`test_tenant_isolation_group_delete` | Cláusulas de busca sempre filtram por `ownerId`; acesso a recurso de outro usuário retorna 404 sem vazar IDs. |
| **RF-C01** | Canvas | Fase 1 | Tarefa 1.1 | `web/src/canvas/camera.ts`<br>`web/src/canvas/engine.ts` | `test_world_to_screen_identity`<br>`test_hidpi_canvas_scaling` | Espaço virtual 2D infinito; transformações afins precisas entre coordenadas de tela e mundo em qualquer escala. |
| **RF-C02** | Canvas | Fase 1 | Tarefa 1.2 | `web/src/canvas/events/wheel.ts`<br>`web/src/canvas/camera.ts` | `test_zoom_cursor_anchored_invariance`<br>`test_zoom_bounds_limits`<br>`test_zoom_delta_mode_normalization` | Zoom de 10% a 800% acionado pela roda do mouse sem Ctrl, com escalonamento exponencial e invariância sob o cursor. |
| **RF-C03** | Canvas | Fase 1 | Tarefa 1.2 | `web/src/canvas/events/pan.ts`<br>`web/src/canvas/tools/handTool.ts` | `test_pan_delta_update`<br>`test_wheel_never_pans`<br>`test_auxclick_autoscroll_prevented` | Pan livre via mão, espaço+arrastar e botão do meio; `auxclick` interceptado; guarda de espaço ativa em textareas. |
| **RF-E01** | Elements | Fase 1 | Tarefa 1.3 | `web/src/canvas/shapes/*`<br>`web/src/canvas/renderer.ts` | `test_render_rectangle_paths`<br>`test_render_ellipse_diamond` | Renderização por Canvas 2D de retângulos normais/arredondados, elipses, losangos, triângulos, cilindros e linhas. |
| **RF-E02** | Elements | Fase 2 | Tarefas 2.1, 2.2 | `web/src/canvas/routing/*`<br>`web/src/canvas/shapes/arrow.ts`<br>`web/src/canvas/bindings/*` | `test_straight_curved_orthogonal_routing`<br>`test_anchor_rotation_square_and_rect` | Roteamento reto, curvo e ortogonal Manhattan com tolerância de 20px; rotação afim exata de âncoras em $90^\circ$. |
| **RF-E03** | Elements | Fase 2 | Tarefa 2.4 | `web/src/canvas/shapes/tiComponent.ts`<br>`api/src/routes/components.rs` | `test_ti_components_catalog_svg`<br>`test_svg_sanitization` | 20 componentes de TI nativos (bancos, servidores, nuvem) renderizados dinamicamente via vetor SVG. |
| **RF-E04** | Elements | Fase 2 | Tarefa 2.5 | `web/src/canvas/text/textOverlay.ts`<br>`web/src/canvas/shapes/text.ts` | `test_text_editor_overlay_mount`<br>`test_canvas_text_wrapping` | Duplo clique monta overlay HTML `<textarea>` mantendo escala/rotação; commit ao desfocar com auto-wrap. |
| **RF-E05** | Elements | Fase 1 | Tarefa 1.7 | `web/src/canvas/tools/freehandTool.ts`<br>`web/src/canvas/shapes/freehand.ts` | `test_perfect_freehand_stroke_smoothing` | Traço livre natural e contínuo calculado via `perfect-freehand` a partir de pontos de ponteiro e pressão. |
| **RF-E06** | Elements | Fase 2 | Tarefa 2.2 | `web/src/canvas/bindings/bindingIndex.ts`<br>`web/src/canvas/shapes/arrow.ts` | `test_arrow_binding_move_recalculation`<br>`test_binding_index_rehydration_lifecycle` | Vínculos persistentes de setas a âncoras com recálculo em tempo real e reidratação em $O(N)$ no load/undo/redo. |
| **RF-E07** | Elements | Fase 2 | Tarefa 2.3 | `web/src/canvas/actions/deleteElement.ts`<br>`web/src/canvas/bindings/bindingIndex.ts` | `test_clean_detachment_on_shape_delete`<br>`test_points_array_world_preservation` | Ao deletar elemento conectado, as setas desconectam sua ponta sem exclusão, preservando coordenadas em `points`. |
| **RF-E08** | Elements | Fase 1 | Tarefas 1.4, 1.5 | `web/src/canvas/selection/selectionManager.ts`<br>`web/src/canvas/spatialIndex.ts` | `test_single_click_hit_test`<br>`test_fine_hit_test_diamond_triangle_cylinder` | Hit-test em 2 fases: coarse na R-tree e fine por geometria ($L_1$ para losango, linear para triângulo, 3 regiões para cilindro). |
| **RF-E09** | Elements | Fase 1 | Tarefa 1.6 | `web/src/canvas/transform/transformBox.ts`<br>`web/src/canvas/transform/rotateStem.ts` | `test_eight_handle_resize_aspect_ratio`<br>`test_rotation_angle_snap` | Bounding box com 8 alças para redimensionamento (com Shift proporcional) e haste superior para rotação. |
| **RF-E10** | Elements | Fase 2 | Tarefa 2.7 | `web/src/canvas/clipboard/clipboardManager.ts` | `test_clipboard_uuid_and_binding_remapping` | Copiar, recortar e colar com regeneração de UUIDs e remapeamento íntegro dos bindings internos copiados. |
| **RF-P01** | Prod | Fase 1 | Tarefas 1.4, 1.8 | `web/src/canvas/history/historyManager.ts`<br>`web/src/store/canvasStore.ts` | `test_undo_redo_command_stack`<br>`test_interaction_coalescence` | Undo e Redo baseados em comandos/patches imutáveis com limite de 50 ações, coalescência e reidratação de vínculos. |
| **RF-P03** | Prod | Fase 3 | Tarefa 3.8 | `web/src/canvas/export/imageExporter.ts` | `test_export_png_hidpi_blob`<br>`test_export_svg_xml_string` | Exportação de cena ou seleção em PNG HiDPI (1x, 2x, 3x) com fundo opcional e SVG vetorial estruturado. |
| **RF-P04** | Prod | Fase 3 | Tarefa 3.8 | `web/src/canvas/export/jsonExporter.ts` | `test_json_roundtrip_schema_validation` | Exportação e importação completa de arquivos `.drawit` em formato JSON versionado com validação. |
| **RF-Q01** | Boards | Fase 3 | Tarefas 3.1, 3.2 | `api/src/routes/boards.rs`<br>`web/src/features/boards/titleGenerator.ts` | `test_create_board_backend_requires_title`<br>`test_sequential_title_generator` | Backend exige `title`; frontend calcula maior N existente (+1) e cria automaticamente como `Quadro-N`. |
| **RF-Q01a**| Boards | Fase 3 | Tarefa 3.1 | `web/src/features/editor/BoardTitleHeader.tsx` | `test_patch_board_title_update` | Título editável a qualquer momento com persistência imediata via PATCH `/api/boards/:id`. |
| **RF-Q02** | Boards | Fase 3 | Tarefas 3.1, 3.7 | `api/src/routes/boards.rs`<br>`web/src/features/boards/BoardGrid.tsx` | `test_list_boards_pagination_cursor`<br>`test_list_boards_filtering` | Listagem ordenada e paginada por cursor com filtros dinâmicos por grupo, tags e termo de busca. |
| **RF-Q03** | Boards | Fase 3 | Tarefas 3.1, 3.6 | `api/src/routes/boards.rs`<br>`web/src/features/editor/EditorPage.tsx` | `test_get_board_scene_restore_viewport` | Restauração fiel e completa do estado da cena e das coordenadas da câmera (x, y, zoom) ao abrir o quadro. |
| **RF-Q04** | Boards | Fase 3 | Tarefa 3.1 | `api/src/routes/boards.rs`<br>`web/src/features/boards/RenameDialog.tsx` | `test_rename_board_length_validation` | Renomeação com validação de tamanho (1 a 120 caracteres) e atualização no banco MongoDB. |
| **RF-Q05** | Boards | Fase 3 | Tarefas 3.1, 3.5 | `api/src/routes/boards.rs`<br>`web/src/features/boards/BoardActions.tsx` | `test_soft_delete_moves_to_trash` | Exclusão lógica com envio para a lixeira (`isDeleted = true`, `deletedAt = now`); oculta das listagens. |
| **RF-Q06** | Boards | Fase 3 | Tarefa 3.5 | `api/src/routes/trash.rs`<br>`web/src/features/trash/TrashModal.tsx` | `test_restore_board_fallback_group`<br>`test_empty_trash_purges_board_versions` | Restauração de quadros excluídos e esvaziamento permanente imediato da lixeira expurgando `board_versions`. |
| **RF-Q08** | Boards | Fase 3 | Tarefa 3.1 | `api/src/routes/boards.rs`<br>`web/src/features/boards/MoveGroupDialog.tsx` | `test_move_board_between_groups` | Associação e transferência de quadro entre grupos ou para a raiz "Sem grupo" (`groupId = null`). |
| **RF-Q10** | Boards | Fase 3 | Tarefa 3.6 | `api/src/routes/boards.rs`<br>`web/src/features/editor/useAutosave.ts`<br>`web/src/lib/offline-db.ts` | `test_autosave_debounce_trigger`<br>`test_occ_revision_conflict_409`<br>`test_occ_network_retry_idempotency` | Autosave em 3 níveis (IndexedDB write-ahead, keepalive condicionado a 64KB); OCC com isolamento de tenant e retentativa idempotente. |
| **RF-O01** | Org | Fase 3 | Tarefa 3.3 | `api/src/routes/groups.rs`<br>`web/src/features/groups/GroupSidebar.tsx` | `test_group_crud_lifecycle`<br>`test_group_name_unique_per_user` | Criação, renomeação e exclusão de grupos de quadros com unicidade de nome por usuário no MongoDB. |
| **RF-O02** | Org | Fase 3 | Tarefas 3.3, 3.7 | `api/src/routes/boards.rs`<br>`web/src/features/boards/BoardListView.tsx` | `test_list_boards_by_group_and_no_group` | Agrupamento visual dos quadros e contagem agregada; visualização dedicada da pasta "Sem grupo". |
| **RF-O03** | Org | Fase 3 | Tarefa 3.4 | `api/src/routes/boards.rs`<br>`web/src/features/boards/TagInput.tsx` | `test_add_remove_tags_normalization` | Associação e remoção de tags livres por quadro, persistidas em array normalizado em minúsculas. |
| **RF-O04** | Org | Fase 3 | Tarefa 3.4 | `api/src/routes/boards.rs`<br>`web/src/features/boards/TagFilterBar.tsx` | `test_filter_boards_multiple_tags_all` | Filtragem combinada por múltiplas tags utilizando operador `$all` do MongoDB. |
| **RF-O05** | Org | Fase 3 | Tarefas 3.4, 3.7 | `api/src/routes/boards.rs`<br>`web/src/features/boards/SearchBar.tsx` | `test_text_search_title_and_tags` | Pesquisa textual com índice de texto no MongoDB varrendo simultaneamente títulos e tags. |
| **RF-O06** | Org | Fase 3 | Tarefas 3.1, 3.6, 3.7 | `api/src/routes/boards.rs`<br>`web/src/features/boards/SortSelect.tsx` | `test_sort_boards_criteria`<br>`test_board_touch_updated_at_on_scene_save` | Ordenação por títulos, datas; `boards.updatedAt` sincronizado no salvamento da cena para ordenação correta. |
| **RNF-S00**| Style | Fase 0 / 1 | Tarefas 0.3, 1.3 | `web/src/components/ui/*`<br>`web/src/styles/globals.css` | Inspeção de design e componentes Radix | Visual minimalista, limpo e padronizado construído estritamente com primitivos do `shadcn/ui`. |
| **RNF-S01**| Style | Fase 0 / 1 | Tarefas 0.3, 1.8 | `web/src/context/ThemeContext.tsx`<br>`web/src/canvas/renderer.ts` | `test_theme_toggle_storage`<br>`test_canvas_background_theme_sync` | Modos claro e escuro sincronizados com o sistema e persistidos no navegador sem flash visual. |
| **RNF-S02**| Style | Fase 2 | Tarefa 2.6 | `web/src/canvas/shapes/*`<br>`web/src/features/editor/StylePanel.tsx` | `test_stroke_color_canvas_application` | Cor de contorno totalmente customizável para todos os elementos geométricos, conectores e ícones. |
| **RNF-S03**| Style | Fase 2 | Tarefa 2.6 | `web/src/canvas/renderer.ts`<br>`web/src/features/editor/StrokeStylePicker.tsx` | `test_stroke_styles_dash_arrays` | Preenchimento, espessuras de 1, 2, 4 e 8px e estilos de traço sólido, tracejado e pontilhado. |
| **RNF-S04**| Style | Fase 2 | Tarefa 2.5 | `web/src/canvas/shapes/text.ts`<br>`web/src/features/editor/FontPicker.tsx` | `test_font_family_and_metrics` | Três famílias tipográficas suportadas (Sans, Mono, Manuscrita), alinhamentos e auto-wrap limpo. |
| **RNF-S05**| Style | Fase 2 | Tarefas 1.4, 2.6 | `web/src/canvas/renderer.ts`<br>`web/src/features/editor/EffectSliders.tsx` | `test_neon_glow_shadow_blur`<br>`test_neon_glow_culling_inflation` | Efeitos visuais por elemento (Neon Glow, Sombra, Blur) com inflação da AABB na R-tree sem clipping. |
| **RNF-S06**| Style | Fase 2 | Tarefa 2.6 | `web/src/canvas/renderer.ts`<br>`web/src/features/editor/OpacitySlider.tsx` | `test_global_alpha_opacity_slider` | Opacidade contínua configurável de 0% a 100% via atributo `globalAlpha` do contexto Canvas 2D. |
| **RNF-P01**| Perf | Fase 1 | Tarefas 1.3, 1.4 | `web/src/canvas/spatialIndex.ts`<br>`web/src/canvas/engine.ts` | `test_benchmark_2000_elements_60fps` | Desempenho garantido de 60 fps sob pan e zoom com 2.000 elementos através de R-tree e culling. |
| **RNF-P02**| Perf | Fase 0 / 3 | Tarefas 0.4, 3.1 | `api/src/repositories/board_repo.rs` | `test_api_crud_latency_p95_under_100ms` | Latência da API em operações de CRUD inferior a 100ms (p95) em ambiente Docker local indexado. |
| **RNF-R01**| Reliab | Fase 3 | Tarefa 3.6 | `web/src/features/editor/useAutosave.ts`<br>`web/src/lib/offline-db.ts` | `test_autosave_window_events`<br>`test_keepalive_64kb_limit_handling` | Autosave contínuo com debounce de 1-2s, IndexedDB write-ahead e cota de 64KB no `beforeunload`. |
| **RNF-R02**| Reliab | Fase 0 / 3 | Tarefas 0.2, 3.6 | `api/src/routes/boards.rs`<br>`api/src/error.rs` | `test_revision_concurrency_lock_409`<br>`test_rfc7807_server_revision_extension` | Controle de concorrência otimista (OCC) retornando HTTP 409 com `serverRevision` estendido via RFC 7807 / 9457. |
| **RNF-SEC01**| Sec | Fase 0 | Tarefa 0.5 | `api/src/services/auth_service.rs` | `test_argon2id_hashing_spawn_blocking` | Senhas criptografadas com Argon2id isoladas em `tokio::task::spawn_blocking` sem travar o runtime. |
| **RNF-SEC02**| Sec | Fase 0 / 3 | Tarefas 0.2, 3.6 | `api/src/middleware/limits.rs`<br>`api/src/routes/boards.rs` | `test_payload_limit_16mb_rejected` | Validação estrita de entrada em todas as rotas e limite de payload fixado em 16MB via Tower-HTTP. |
| **RNF-SEC03**| Sec | Fase 0 / 3 | Tarefas 0.4, 3.1, 3.6 | `api/src/repositories/mongo_repo.rs`<br>`api/src/routes/boards.rs` | `test_owner_id_tenant_isolation_occ` | Isolamento estrito por `ownerId` em todas as consultas e na cláusula de OCC atômica em `board_scenes`. |
| **RNF-SEC04**| Sec | Fase 0 | Tarefa 0.5 | `api/src/services/token_service.rs` | `test_refresh_token_family_revocation` | Rotação atômica CAS em cookie HttpOnly com janela de 15s e revogação total da família em reuso real. |
| **RNF-SEC06**| Sec | Fase 2 | Tarefa 2.4 | `api/src/routes/components.rs`<br>`web/src/canvas/shapes/tiComponent.ts` | `test_svg_sanitization_xss` | Sanitização estrita de SVGs de componentes de TI; proibição total de `innerHTML` desprotegido. |
| **RNF-U01**| UX | Fase 0 / 3 | Tarefas 0.3, 3.7 | `web/src/components/*`<br>`web/src/features/boards/*` | Auditoria de acessibilidade axe-core | Navegação por teclado nas telas de listagem, foco visível e conformidade de contraste WCAG AA. |
| **RNF-U03**| UX | Fase 0 | Tarefa 0.3 | `web/src/locales/pt-BR.json`<br>`web/src/context/I18nContext.tsx` | `test_pt_br_dictionary_keys_complete` | Idioma padrão da interface em Português do Brasil (pt-BR) com estrutura em chaves para i18n. |
| **RNF-M01**| Ops | Fase 0 | Tarefa 0.2 | `api/src/main.rs`<br>`api/src/middleware/tracing.rs` | `test_structured_json_logging_request_id` | Logs estruturados via `tracing` com correlação unificada através do cabeçalho `x-request-id`. |
| **RNF-M02**| Ops | Fase 0 | Tarefas 0.1, 0.2 | `api/src/routes/health.rs` | `test_health_and_ready_probes` | Probes HTTP `/health` (liveness) e `/ready` (readiness com ping no MongoDB) para orquestração Docker. |
| **RNF-M03**| Ops | Fase 0 | Tarefa 0.6 | `.github/workflows/ci.yml` | `test_ci_pipeline_automated_validation` | Pipeline automatizada no GitHub Actions com Clippy, Rustfmt, Prettier, testes e varredura de segurança. |
| **RNF-M04**| Ops | Fase 0 | Tarefa 0.2 | `api/src/routes/docs.rs` | `test_openapi_schema_generation` | Documentação viva dos contratos REST em formato OpenAPI 3.0 gerada automaticamente via `utoipa`. |

---

## 8. Governança de Execução, Quality Gates e Critérios de Conclusão do MVP

### 8.1 Portões de Qualidade (Quality Gates Obrigatórios por Tarefa)
Para que uma tarefa técnica seja considerada concluída durante a implementação, ela deve ser auditada contra os 3 portões do método `senior-dev`:
1. **Gate Crapper (Complexidade Ciclomática & Cobertura)**:
   - Funções no backend e no motor gráfico devem apresentar métrica CRAP $< 10$.
   - Verificação contínua via `cargo clippy -- -D warnings` no Rust e regras de complexidade do ESLint no TypeScript.
2. **Gate Dryer (Duplicação de Código)**:
   - Análise estática com `jscpd` para eliminar código duplicado acima de $80\%$ de similaridade.
   - Cálculos de matriz de transformação afim e hit-test consolidados em módulos únicos reutilizáveis.
3. **Gate Mutator (Testes de Mutação)**:
   - Validação da robustez dos testes com `cargo-mutants` (Rust) e `Stryker` (TypeScript). Nenhum teste vazio ou que passe sem asserções genuínas é aceito.

### 8.2 Critérios de Aceitação Global do MVP (Fases 0 a 3 Concluídas)
- [ ] Ambiente de desenvolvimento sobe via `docker-compose up` e todos os serviços reportam estado saudável nos probes `/health` e `/ready`.
- [ ] O fluxo completo de autenticação (registro, login, rotação de refresh token com grace window de 15s em cookie HttpOnly e logout) funciona sem erros em abas concorrentes coordenadas por Web Locks e BroadcastChannel.
- [ ] O hashing de senhas Argon2id é executado estritamente em `tokio::task::spawn_blocking`, mantendo os probes `/health` com latência $< 5\text{ms}$ mesmo sob múltiplos logins simultâneos.
- [ ] O Canvas 2D imperativo renderiza uma cena de benchmark contendo 2.000 retângulos com taxa de 60 FPS contínua em pan e zoom.
- [ ] O zoom por roda do mouse funciona de 10% a 800% sem necessidade da tecla `Ctrl`, com escalonamento exponencial normalizado por `deltaMode`, mantendo invariante o ponto de mundo sob o cursor.
- [ ] O pan multimodal funciona deterministicamente via ferramenta mão, espaço+arraste e botão do meio do mouse, com supressão do autoscroll nativo do Windows (`auxclick`) e guarda de foco em campos de texto.
- [ ] Eventos de arraste utilizam `setPointerCapture` e `releasePointerCapture`, garantindo integridade de movimento mesmo fora da viewport do navegador.
- [ ] O hit-testing executa em duas fases com detecção precisa para Losangos (norma $L_1$), Triângulos (proporção linear de meia-largura), Cilindros (particionamento em 3 regiões) e Elipses, tanto para preenchimentos sólidos quanto transparentes.
- [ ] Os 20 componentes de TI nativos são inseríveis no canvas, aceitam cor de contorno e possuem rótulos de texto editáveis.
- [ ] Setas suportam trajetos retos, curvos (Bézier) e ortogonais (Manhattan com clearance de 20px) com snap magnético a 8 âncoras por forma com rotação afim exata comprovada para quadrados e retângulos.
- [ ] Ao deletar qualquer forma ligada, as setas desconectam sua ponta de forma limpa sem serem excluídas, preservando todas as coordenadas absolutas no array `points: [WorldPoint, WorldPoint, ...]`.
- [ ] O índice invertido de vínculos `BindingIndexManager` reidrata em tempo $O(N)$ $(< 5\text{ms})$ em operações de carga de cena, desfazer/refazer e área de transferência.
- [ ] A criação de quadros gera automaticamente o nome sequencial amigável `Quadro-N`.
- [ ] A exclusão de um grupo move os quadros associados para "Sem grupo" por padrão (`?boards=move`).
- [ ] A lixeira retém quadros excluídos por 30 dias com job assíncrono de purga atômica anti-TOCTOU e expurgo completo de `board_versions`, garantindo zero vazamento de storage.
- [ ] O autosave opera em 3 níveis (write-ahead cache em IndexedDB, keepalive condicionado a $\le 64\text{KB}$ e recuperação transparente na inicialização), eliminando perdas de dados e exceções de estouro de cota do navegador.
- [ ] O controle de concorrência otimista (OCC) valida estritamente o `ownerId` em `board_scenes`, toca `boards.updatedAt` para sincronizar o topo do dashboard, trata retentativas de rede de forma idempotente via `clientSaveId` e `contentHash` e emite HTTP 409 Conflict no padrão RFC 7807 / RFC 9457 com campo `serverRevision` estendido.
- [ ] O canvas exporta imagens recortadas em PNG HiDPI, SVG vetorial e JSON versionado (`.drawit`).
- [ ] As 4 suítes de testes End-to-End no Playwright passam com 100% de sucesso.
