# Relatório de Handoff — explorer_1
**Missão**: Levantamento do Workspace, Síntese da Metodologia de Engenharia (`senior-dev`), Estratégia de Testes por Componente e Blueprint Estrutural do Plano de Implementação (`drawit`).

---

## 1. Observation

### 1.1 Estado do Workspace
- **Diretório raiz inspecionado**: `c:\Users\luis.felipe\Desktop\Developer\drawit`
- **Conteúdo do workspace**:
  - `.agent/Spec — Whiteboard de System Design.md`: Documento de especificação v0.2 completo (24.569 bytes, 439 linhas, datado de 10/11/2026, status "rascunho para revisão").
  - `.docker/`: Diretório existente com arquivos vazios `.docker/Dockerfile` (0 bytes) e `.docker/.dockerignore` (0 bytes). Nenhum arquivo `docker-compose.yml` presente na raiz.
  - `api/`: Diretório existente no sistema de arquivos, porém **completamente vazio** (sem `Cargo.toml`, sem código Rust, sem testes).
  - `web/`: Diretório existente no sistema de arquivos, porém **completamente vazio** (sem `package.json`, sem configuração do Vite, sem código React).
  - `.gitignore`: Arquivo com 39 bytes contendo:
    ```gitignore
    .env
    .env.development
    */node_modules/
    ```
  - `.git/`: Repositório Git inicializado.
  - `.agents/teamwork/`: Diretório de metadados dos agentes (contendo `ORIGINAL_REQUEST.md`, `PROJECT.md`, subpastas `orchestrator/`, `spec_miner_1/`, `spec_miner_2/`, `interviewer/`, `sentinel/` e `explorer_1/`).
- **Modo de Execução**: Modo `/plan` estrito. Restrição mandatória: **Nenhum arquivo de código da aplicação ou dependência em `api/` ou `web/` pode ser criado ou modificado nesta fase.** Apenas o documento `.agent/plano_de_implementacao.md` deve ser produzido pela equipe.

### 1.2 Documentos Autoritativos Analisados
1. **`ORIGINAL_REQUEST.md`**:
   - Exige estruturação do plano detalhado para Fases 0 a 3 (MVP) e alto nível para Fases 4 e 5.
   - Exige estrita aderência à Spec v0.2, às recomendações da Seção 14 (decisões em aberto) e aos preceitos da skill `senior-dev`.
2. **`Spec — Whiteboard de System Design.md` (v0.2)**:
   - **Frontend**: React + Vite com motor Canvas 2D próprio (`HTMLCanvasElement`, contexto 2D). React restrito à interface de suporte (barras de ferramentas, painéis, modais). Componentes visuais com `shadcn/ui` (Tailwind + Radix). Gerenciamento de estado com `Zustand`. Traço livre via `perfect-freehand`. Índice espacial via `rbush`.
   - **Backend**: Rust com `Axum` e `Tokio`, driver oficial `mongodb`.
   - **Autenticação**: Username único e senha, hash via `Argon2id`. Access token JWT (15 min de validade, HS256 em dev). Refresh token opaco (256 bits, hash SHA-256 no Mongo), persistido em cookie `HttpOnly`, `SameSite=Strict`, `Path=/auth`, com rotação a cada uso e detecção de reuso (revogação da família inteira).
   - **Quadros**: Título obrigatório no backend (1 a 120 caracteres). Frontend gera nome sequencial padrão `Quadro-N` (onde N = maior N existente de `Quadro-<n>`, incluindo deletados, + 1).
   - **Canvas**: Zoom de 10% a 800% na roda do mouse sem `Ctrl`, gesto de pinça, botões e atalhos (`+`/`-`), centrado no cursor. Pan via ferramenta mão, espaço+arrastar ou botão do meio. A roda não faz pan.
   - **Decisões em aberto da Seção 14 consolidadas**:
     - *Deleção de grupo*: Por padrão, quadros são movidos para "Sem grupo" (com opção `?boards=trash` para enviá-los à lixeira).
     - *Lixeira*: Retenção de 30 dias com expiração/filtro automático.
     - *Tags*: Tags livres (strings normalizadas) por quadro.
     - *Grupos*: Nível único de grupos no MVP (hierarquia aninhada reservada para P2).
     - *Idiomas*: Interface nativa em pt-BR com arquitetura preparada para i18n.
     - *Algoritmo JWT*: HS256 para ambiente de desenvolvimento local.
3. **`senior-dev/SKILL.md`**:
   - Estrutura de três fases obrigatórias: **Make it Work** (menor mudança correta orientada a TDD, types/model first, boundaries isoladas, idempotência), **Make it Right** (reprodução e causa raiz, unidades verificáveis, qualidade de código, gates de duplicação `jscpd`/`dryer`, complexidade CRAP < 10, testes de mutação `cargo-mutants`/`Stryker`, padrões RFC 7807 e RFC 9110, atributos ISO/IEC 25010), e **Follow Practice** (log de execução, observabilidade shift-left, context guard, commits atômicos convencionais `feat:`, `fix:`, etc.).

---

## 2. Logic Chain

### 2.1 Mapeamento da Metodologia `senior-dev` por Fase do Projeto

```
               +-------------------------------------------------------+
               |                    SENIOR-DEV ENGINE                  |
               +-------------------------------------------------------+
                                           |
       +-----------------------------------+-----------------------------------+
       |                                   |                                   |
       v                                   v                                   v
+------------------+             +-------------------+               +--------------------+
| 1. MAKE IT WORK  |             | 2. MAKE IT RIGHT  |               | 3. FOLLOW PRACTICE |
| - Data shape 1st |             | - Clean Code      |               | - Tracing / Logs   |
| - Boundary DTOs  |  =======>   | - CRAP < 10 Gate  |   ========>   | - Git Atomic Commits|
| - Pure Domain    |             | - DRY < 0.8 Gate  |               | - RFC 7807 Errors  |
| - Strict Red TDD |             | - Mutation Tests  |               | - DevSecOps CI     |
+------------------+             +-------------------+               +--------------------+
```

Para cada fase de implementação (Fases 0, 1, 2, 3) e cada tarefa técnica constituinte, o plano deve desdobrar o ciclo de vida rigorosamente sob os 3 pilares:

#### A. Pilar 1: Make it Work
- **Modelagem de Dados e Tipos Primeiro**: Antes de escrever regras de processamento ou renderização, definir os contratos estruturais:
  - No Backend (Rust): Criar structs de domínio com invariantes que tornem estados ilegais impossíveis (`enum ElementType`, `struct BoardId(Uuid)`, `struct Revision(u64)`).
  - No Frontend (TypeScript): Interfaces discriminadas para elementos do canvas (`RectangleElement`, `ArrowElement`, `TIComponentElement`), tipos para coordenadas (`WorldPoint`, `ScreenPoint`) e estado do viewport (`ViewportTransform`).
- **Disciplina de Fronteira (Boundary Discipline)**:
  - Todo dado que entra pelo HTTP é validado estritamente em DTOs com `validator` (Rust) ou `zod` (TypeScript) antes de atingir o domínio.
  - O motor de canvas 2D é isolado em funções matemáticas puras sem efeitos colaterais de DOM ou React.
- **TDD Estrito**:
  - 1º: Escrever o teste unitário que define o comportamento esperado e observar a falha pelo motivo correto.
  - 2º: Implementar o código mínimo necessário para fazer o teste passar.
  - 3º: Garantir idempotência operacional (ex.: salvar a mesma revisão duas vezes gera resultado determinístico; re-executar rotações de token cancela tentativas duplicadas).

#### B. Pilar 2: Make it Right
- **Refatoração sem Alteração de Comportamento**:
  - Eliminar duplicações de lógica geométrica (ex.: transformações de matriz de tela para mundo e vice-versa consolidadas em módulo único `geometry/transform.ts`).
  - Isolar cálculos de colisão e hit-testing de renderização visual.
- **Portões de Qualidade (Quality Gates)**:
  - **Gate Crapper (Complexidade & Cobertura)**: Cada função deve manter métrica CRAP < 10. Funções complexas de roteamento de setas ou de hit-test são decompostas em sub-funções puras. Ferramentas: `cargo clippy -- -D warnings` e `eslint-plugin-sonarjs` / `complexity`.
  - **Gate Dryer (Duplicação)**: Análise contínua com `jscpd` para eliminar código duplicado acima de 80% de similaridade.
  - **Gate Mutator (Testes de Mutação)**: Verificação de sobrevivência de mutantes com `cargo-mutants` (backend) e `Stryker` (frontend).
- **Conformidade com Padrões de Qualidade**:
  - **APIs RFC 7807 (Problem Details)**: Toda resposta de erro da API segue o formato padronizado com campos `type`, `title`, `status`, `detail`, `instance` e `code`.
  - **Semântica HTTP RFC 9110**:
    - `GET` e `HEAD`: Seguros e idempotentes, sem efeitos colaterais.
    - `PUT`: Idempotente, substituição integral de recursos (ex.: `PUT /boards/:id/scene` com proteção otimista via `revision`).
    - `DELETE`: Idempotente, remoção ou envio para lixeira.
    - `POST`: Operações não-idempotentes (login, registro, restauração de versões) protegidas contra reuso.
  - **ISO/IEC 25010**:
    - *Eficiência de Desempenho*: Loop de renderização Canvas 2D garantindo 60 fps com 2.000 elementos através de culling no viewport e índice espacial `rbush`.
    - *Confiabilidade*: Autosave debounced com controle de concorrência otimista (retorno 409 em caso de colisão de versão).
    - *Segurança*: Senhas com Argon2id, tokens com claims mínimas, cookies HttpOnly SameSite=Strict, isolamento multi-inquilino estrito via `ownerId` em todas as queries Mongo.

#### C. Pilar 3: Follow Practice
- **Observabilidade Integrada (Shift-Left)**:
  - Backend instrumentado com `tracing` e `tracing-subscriber`, gerando logs estruturados em JSON correlacionados por `x-request-id`.
  - Frontend com telemetria de performance no loop do canvas (monitoramento de taxa de quadros e tempo de frame).
- **Disciplina de Versionamento**:
  - Commits semânticos no padrão Conventional Commits (`feat(canvas):`, `fix(auth):`, `test(board):`, `refactor(routing):`).
  - CI no GitHub Actions executando verificação de formatação (`rustfmt`, `prettier`), linter (`clippy`, `eslint`), testes unitários/integração e auditoria de vulnerabilidades (`cargo audit`, `npm audit`, `trivy`).

---

### 2.2 Estratégia de Testes por Camada e Componente

A pirâmide de testes para o `drawit` é estruturada com base nas características de cada subsistema:

```
                  /\
                 /  \
                / E2E\            Playwright (4 Jornadas Críticas de Usuário)
               /------\
              /  INT   \          Axum HTTP + MongoDB (Testcontainers / Docker)
             /----------\
            /    UNIT    \        Zustand Stores, Serviços Rust, Argon2id, JWT
           /--------------\
          /   MATH & GEOM  \      Motor Canvas 2D: Matrizes, AABB, Rotas, Snaps
         /------------------\
```

#### 1. Motor Matemático e Geométrico (Canvas 2D Engine)
- **Escopo**: Conversões de coordenadas (Tela $\leftrightarrow$ Mundo), frustum culling, hit-test em AABB e polígonos rotacionados (OBB), ancoragem cardinal de conexões, roteamento ortogonal de setas, suavização de traço livre.
- **Abordagem**: Testes unitários puros com Vitest, isolados de DOM, utilizando matrizes determinísticas de teste.
- **Cenários Mandatórios**:
  - *Invariância de Transformação*: Para qualquer ponto $P(x, y)$, zoom $s \in [0.1, 8.0]$ e translação $T(tx, ty)$, verificar que $\text{screenToWorld}(\text{worldToScreen}(P)) = P \pm 10^{-6}$.
  - *Zoom Ancorado no Cursor*: Ao aplicar zoom centrado no ponto do cursor $C$, o ponto correspondente no mundo $W_C$ não deve alterar sua posição após a aplicação da escala.
  - *Hit-Test Espacial (`rbush`)*: Com uma base de 2.000 retângulos distribuídos no plano virtual, verificar que a busca por elementos no viewport executa em tempo logarítmico e retorna exatamente os elementos interceptados pelo frustum.
  - *Detecção de Clique em Linhas/Setas*: Avaliar ponto a até 5px de distância de segmento reto ou curvo, confirmando seleção positiva dentro da margem de tolerância.
  - *Snap de Âncoras Cardinais*: Cálculo euclidiano de proximidade de terminal de seta aos 4 pontos de ancoragem (N, S, L, O) e centroide do elemento com raio de atração de 10px.
  - *Roteamento Ortogonal*: Cálculo de caminho em polyline ortogonal evitando caixas delimitadoras de obstáculos, garantindo número mínimo de inflexões (cotovelos).
  - *Suavização de Traço (`perfect-freehand`)*: Geração de contorno poligonal contínuo a partir de array determinístico de pontos com pressão.

#### 2. Gerenciamento de Estado e Histórico (Undo/Redo & Serialização)
- **Escopo**: Store Zustand do editor, mutações imutáveis de elementos, pilha de comandos/patches de Undo/Redo, serialização e migração de schema.
- **Abordagem**: Testes unitários com Vitest, simulando ações de usuário via dispatchers de store.
- **Cenários Mandatórios**:
  - *Ciclo Básico de Undo/Redo*: Ação (Adicionar Retângulo) $\rightarrow$ Undo (Elemento removido) $\rightarrow$ Redo (Elemento restaurado).
  - *Invalidação do Redo*: Executar Ação 1 $\rightarrow$ Ação 2 $\rightarrow$ Undo (volta para Ação 1) $\rightarrow$ Executar Ação 3 $\rightarrow$ Pilha de Redo deve ser zerada imediatamente.
  - *Limite de Capacidade de Memória*: Configurar pilha com limite de 50 ações. Executar 55 mutações consecutivas e validar que as 5 primeiras foram descartadas por eviction FIFO sem vazamento de memória.
  - *Roundtrip de Serialização JSON*: Validar que `deserialize(serialize(scene)) === scene` com fidelidade total de estilos, IDs, posições e bindings.
  - *Migração de Esquema*: Leitura de payload com `schemaVersion: 1` em runtime de versão 2 preenche novos atributos com valores padrão sem corromper dados existentes.

#### 3. Domínio e Regras de Negócio do Backend (Rust)
- **Escopo**: Entidades de domínio, serviços de autenticação, lógica de quadros e grupos, regras de lixeira e tokens.
- **Abordagem**: Testes unitários com `cargo test`, desacoplados de banco via mocks de traits de repositório (`mockall`).
- **Cenários Mandatórios**:
  - *Hashing de Senha com Argon2id*: Validação de salt aleatório, parâmetros de custo de memória/tempo e rejeição segura de senhas incorretas com mitigação contra timing attacks.
  - *Ciclo de Vida do JWT*: Validação de claims obrigatórias (`sub`, `exp`, `iat`, `jti`), rejeição de tokens expirados (>15 min) e de tokens com assinaturas violadas.
  - *Família de Refresh Tokens e Detecção de Reuso*: Rotação bem-sucedida invalida o token anterior e emite novo par. Apresentar um token já rotacionado dispara a revogação de todos os tokens associados àquele `familyId` (defesa contra ataque replay).
  - *Controle de Concorrência Otimista*: `BoardService::save_scene` recebe `revision` esperada. Se a revisão no repositório divergir, retorna explicitamente `Err(ServiceError::RevisionConflict)`.
  - *Deleção em Cascata de Grupos*: Operação com modo `Move` atualiza todos os quadros associados para `groupId = None`. Operação com modo `Trash` atualiza os quadros para `deletedAt = Some(now)`.
  - *Gerador de Título Padrão*: Validação da regra sequencial `Quadro-N`.

#### 4. Integração HTTP (Axum) e Banco de Dados (MongoDB)
- **Escopo**: Middleware de autenticação, cookies de sessão, serialização BSON/JSON, persistência real no MongoDB e índices de unicidade/TTL.
- **Abordagem**: Testes de integração em Rust utilizando instâncias de MongoDB via Docker/Testcontainers ou serviço local containerizado.
- **Cenários Mandatórios**:
  - *Middleware de Autenticação*: Requisição sem header `Authorization` ou com token expirado retorna HTTP 401 com corpo em formato RFC 7807. Requisição válida injeta struct `AuthenticatedUser` nas extensões da rota.
  - *Rotação de Cookie via Endpoint*: Requisição a `POST /auth/refresh` com cookie de sessão válido retorna HTTP 200, emite novo JWT no corpo e atualiza o cookie `HttpOnly` com flag `SameSite=Strict`.
  - *Isolamento Estrito entre Usuários*: Usuário A autenticado tenta acessar `GET /boards/:id` ou `DELETE /boards/:id` pertencente ao Usuário B; a API responde HTTP 404 (evitando vazamento de existência) garantindo que toda cláusula de consulta MongoDB contenha `{ _id: boardId, ownerId: userA.id }`.
  - *Concorrência Otimista no Banco*: Duas requisições paralelas executando `PUT /boards/:id/scene` com a mesma versão $V$; exatamente uma obtém sucesso (versão incrementada para $V+1$), e a outra falha com HTTP 409 Conflict.
  - *Índices de Banco*: Inserção de dois usuários com mesmo `username` viola índice único gerando erro Mongo 11000; documentos na coleção `refresh_tokens` possuem índice TTL ativo no campo `expiresAt`.

#### 5. Testes End-to-End (E2E) com Playwright
- **Escopo**: Validação dos fluxos completos de ponta a ponta no navegador contra a aplicação real rodando em containers Docker.
- **Abordagem**: Testes de aceitação automatizados em `@playwright/test` cobrindo 4 jornadas fundamentais:
  - **Jornada 1: Ciclo Completo de Autenticação e Sessão**:
    1. Acessar `/register`, preencher username único e senha, submeter.
    2. Verificar redirecionamento automático para a biblioteca de quadros.
    3. Inspecionar estado da sessão: access token mantido estritamente em memória no cliente; refresh token configurado em cookie `HttpOnly`.
    4. Atualizar a página (`F5`) e validar que a chamada silenciosa para `/auth/refresh` restaura a sessão perfeitamente sem solicitar credenciais.
    5. Clicar em "Logout", verificar limpeza dos dados de sessão e redirecionamento para `/login`.
  - **Jornada 2: Organização de Quadros e Grupos**:
    1. Criar novo grupo "Microsserviços".
    2. Criar novo quadro; verificar que o título inicial gerado automaticamente é `Quadro-1`.
    3. Associar o quadro ao grupo "Microsserviços" e adicionar tags `backend` e `v1`.
    4. Renomear o quadro para "Arquitetura do Gateway".
    5. Filtrar a listagem pela tag `backend` e validar a presença exclusiva do quadro criado.
  - **Jornada 3: Edição no Canvas, Bindings e Histórico**:
    1. Abrir o quadro "Arquitetura do Gateway".
    2. Selecionar ferramenta Retângulo, desenhar forma no canvas.
    3. Selecionar componente nativo "Database (SQL)" na biblioteca de componentes de TI e posicionar no canvas.
    4. Selecionar ferramenta Seta, conectar o ponto de ancoragem direito do Retângulo ao ponto de ancoragem esquerdo do Banco de Dados (criação de binding).
    5. Arrastar o Retângulo 200px para o lado; verificar que os pontos terminais da seta recalculam e acompanham a forma em tempo real.
    6. Executar Undo (`Ctrl+Z`); verificar retorno à posição anterior mantendo o binding intacto.
    7. Executar Redo (`Ctrl+Y`); verificar restabelecimento da posição.
  - **Jornada 4: Autosave e Resiliência contra Conflito**:
    1. Realizar edição no canvas; verificar transição do indicador de status: "Salvando..." $\rightarrow$ "Salvo".
    2. Recarregar o navegador (`Ctrl+F5`); verificar que todos os elementos, bindings e coordenadas de viewport são restaurados fielmente do MongoDB.
    3. Simular salvamento concorrente desatualizado; verificar disparo do toast de aviso de conflito de revisão (HTTP 409).

---

### 2.3 Blueprint Estrutural para `.agent/plano_de_implementacao.md`

O plano final a ser produzido pela equipe deve ser organizado na seguinte estrutura hierárquica e modular:

```markdown
# Plano de Implementação — Whiteboard de System Design ("drawit")
Versão: 1.0 · Data: 10/11/2026 · Base: Spec v0.2 · Metodologia: senior-dev

## 1. Visão Geral e Arquitetura de Referência
- 1.1 Resumo Executivo e Objetivos do Sistema
- 1.2 Stack Tecnológica Consolidada (React + Vite + Canvas 2D / Rust Axum / MongoDB)
- 1.3 Decisões de Arquitetura Consolidadas (ADR-001 e Resoluções da Seção 14 da Spec)
- 1.4 Padrões de Qualidade e Governança (Make it Work -> Make it Right -> Follow Practice)

## 2. Fase 0: Fundação & Infraestrutura (Semana 1)
- Tarefa 0.1: Orquestração de Containers Docker (Frontend, Backend, Mongo, redes e healthchecks)
- Tarefa 0.2: Esqueleto do Backend Rust com Axum (Tokio, Tracing, RFC 7807, /health, /ready)
- Tarefa 0.3: Esqueleto do Frontend React + Vite + Tailwind + shadcn/ui (Tema, Layout base)
- Tarefa 0.4: Modelagem BSON/MongoDB, Migrações e Índices (users, refresh_tokens, groups, boards, board_scenes, component_library)
- Tarefa 0.5: Subsistema de Autenticação Completo (Argon2id, JWT HS256, Refresh Cookie rotativo e detecção de reuso)
- Tarefa 0.6: Pipeline de Integração Contínua (GitHub Actions: clippy, rustfmt, cargo-test, vitest, cargo-audit, trivy)

## 3. Fase 1: Núcleo do Canvas (Semana 2)
- Tarefa 1.1: Motor de Coordenadas e Viewport Infinito (World <-> Screen, HiDPI, transform matrix)
- Tarefa 1.2: Navegação de Viewport: Zoom e Pan (Roda sem Ctrl 10%-800% ancorado no cursor, mão, espaço+drag, botão do meio)
- Tarefa 1.3: Render Loop Canvas 2D e Formas Geométricas (Retângulo, elipse, losango, triângulo, linha)
- Tarefa 1.4: Seleção, Bounding Box e Índice Espacial (rbush, seleção única e por retângulo de seleção)
- Tarefa 1.5: Manipulação Direta (8 handles de redimensionamento, handle de rotação, arrasto)
- Tarefa 1.6: Exclusão de Elementos e Teclas de Atalho (Delete/Backspace, ESC)
- Tarefa 1.7: Motor de Histórico Undo/Redo (Pilha Zustand de comandos/patches, limite de 50 ações)
- Tarefa 1.8: Suporte a Temas Claro e Escuro no Canvas (Adaptação dinâmica de fundo e cores automáticas)

## 4. Fase 2: Diagramas & Componentes de TI (Semana 3)
- Tarefa 2.1: Sistema de Âncoras de Conexão Cardinais (4 pontos cardinais por elemento + centro)
- Tarefa 2.2: Motor de Conectores/Setas com Bindings Persistentes (Setas retas, recálculo dinâmico, soltura de pontas ao deletar elemento)
- Tarefa 2.3: Catálogo Nativo de Componentes de TI (P0) (20 componentes SVG: Clientes, Backend, Dados, Mensageria, Infra; seed inicial e rota /components)
- Tarefa 2.4: Motor de Tipografia e Edição de Texto (Texto independente e duplo clique para edição)
- Tarefa 2.5: Desenho à Mão Livre com Suavização (perfect-freehand com sensibilidade a pressão)
- Tarefa 2.6: Painel Inspetor de Estilos (Cores de traço/preenchimento, espessura, estilo tracejado/pontilhado, opacidade 0-100%)

## 5. Fase 3: Quadros, Organização & Persistência (Semana 4)
- Tarefa 3.1: API REST de Quadros e Grupos (CRUD /groups, /boards, /boards/:id/scene com paginação por cursor)
- Tarefa 3.2: Controle de Concorrência Otimista (Campo revision na cena, verificação atômica no Mongo, retorno HTTP 409)
- Tarefa 3.3: Nomenclatura Sequencial Padrão e Deleção em Cascata (Frontend gerando Quadro-N, exclusão de grupo movendo para "Sem grupo")
- Tarefa 3.4: Interface da Biblioteca de Quadros (Dashboard, barra lateral com grupos, tags e lixeira, visualização grade/lista)
- Tarefa 3.5: Mecanismo de Autosave Resiliente (Debounce de 1-2s, salvamento ao perder foco/fechar aba, indicador de status salvo/salvando/erro)
- Tarefa 3.6: Sistema de Busca, Tags e Ordenação (Tags livres normalizadas, filtro por tags, busca textual por título)
- Tarefa 3.7: Gerenciamento da Lixeira com Retenção de 30 Dias (Soft delete via deletedAt, restauração, expiração após 30 dias)

## 6. Fases Futuras e Qualidade de Vida (Visão de Alto Nível)
- 6.1 Fase 4: Qualidade de Vida (Efeitos visuais neon/blur/sombra, snap à grade/guias, clipboard avançado copiar/colar, agrupamento, camadas z-index, exportações PNG/SVG/JSON, favoritos e recentes, miniaturas, histórico de versões)
- 6.2 Fase 5: Futuro & Escalabilidade (Colaboração em tempo real via WebSockets + CRDTs Yjs/Automerge, compartilhamento por link, busca no conteúdo do canvas, subgrupos aninhados, infraestrutura de deploy em nuvem)

## 7. Matriz Completa de Rastreabilidade (Requisitos -> Fases -> Tarefas -> Arquivos -> Testes -> Critérios de Aceite)
## 8. Governança de Execução e Critérios de Conclusão do MVP
```

---

### 2.4 Matriz Detalhada de Rastreabilidade

| ID Requisito | Descrição Resumida | Fase | Tarefa do Plano | Arquivos Principais de Implementação | Suítes de Testes Associadas | Critério Objetivo de Aceite |
|---|---|---|---|---|---|---|
| **RF-A01** | Cadastro de usuário com username único | Fase 0 | Tarefa 0.5 | `api/src/routes/auth.rs`<br>`api/src/services/auth_service.rs`<br>`web/src/features/auth/RegisterForm.tsx` | `test_register_user_success`<br>`test_register_duplicate_username_fails`<br>`journey_1_auth_lifecycle.spec.ts` | Retorna HTTP 201 com JWT e cookie HttpOnly; username duplicado retorna 409 Conflict. |
| **RF-A02** | Login e logout com sessão | Fase 0 | Tarefa 0.5 | `api/src/routes/auth.rs`<br>`api/src/services/auth_service.rs`<br>`web/src/features/auth/LoginForm.tsx` | `test_login_valid_credentials`<br>`test_login_invalid_password`<br>`test_logout_clears_cookie` | Senha correta emite token e cookie; senha incorreta retorna 401; logout revoga refresh token. |
| **RF-A03** | Renovação automática via refresh token rotativo | Fase 0 | Tarefa 0.5 | `api/src/services/token_service.rs`<br>`api/src/routes/auth.rs`<br>`web/src/lib/api-client.ts` | `test_refresh_token_rotation`<br>`test_refresh_token_reuse_detection`<br>`journey_1_auth_lifecycle.spec.ts` | Token antigo rotacionado é invalidado; reuso do mesmo token invalida toda a família. |
| **RF-A04** | Isolamento por usuário nas consultas | Fase 0 / 3 | Tarefas 0.2, 3.1 | `api/src/middleware/auth.rs`<br>`api/src/repositories/board_repo.rs` | `test_user_isolation_board_get`<br>`test_user_isolation_group_delete` | Usuário A não enxerga nem altera recursos do Usuário B (retorna 404 em ID alheio). |
| **RF-C01** | Canvas infinito com espaço virtual 2D | Fase 1 | Tarefa 1.1 | `web/src/engine/viewport/transform.ts`<br>`web/src/engine/canvas/CanvasView.tsx` | `test_viewport_transform_matrix`<br>`test_hidpi_canvas_scaling` | Coordenadas do mundo arbitrárias mapeadas com precisão para coordenadas de tela. |
| **RF-C02** | Zoom 10% a 800% na roda (sem Ctrl), pinça, ancorado no cursor | Fase 1 | Tarefa 1.2 | `web/src/engine/events/wheel.ts`<br>`web/src/engine/viewport/zoom.ts` | `test_zoom_bounds_limits`<br>`test_zoom_anchored_to_cursor_position` | Roda sem Ctrl escala de 0.1 a 8.0 mantendo o ponto sob o cursor estável. |
| **RF-C03** | Pan via ferramenta mão, espaço+drag ou botão do meio | Fase 1 | Tarefa 1.2 | `web/src/engine/events/pan.ts`<br>`web/src/engine/tools/handTool.ts` | `test_pan_delta_calculation`<br>`test_space_key_pan_toggle` | Roda do mouse não faz pan; espaço+arrastar e botão do meio transladam o viewport livremente. |
| **RF-E01** | Adição de formas geométricas básicas | Fase 1 | Tarefa 1.3 | `web/src/engine/renderers/shapes.ts`<br>`web/src/engine/models/element.ts` | `test_render_rectangle`<br>`test_render_ellipse`<br>`test_render_diamond`<br>`test_render_triangle` | Formas são inseridas com dimensões padrão, renderizadas e armazenadas na store da cena. |
| **RF-E02** | Setas retas com pontas configuráveis | Fase 2 | Tarefa 2.2 | `web/src/engine/renderers/arrow.ts`<br>`web/src/engine/geometry/arrowhead.ts` | `test_arrow_render_straight`<br>`test_arrowhead_geometry_calculation` | Seta renderizada de ponto A a ponto B com ponta em formato de triângulo preenchido. |
| **RF-E03** | Componentes de TI da biblioteca nativa (P0) | Fase 2 | Tarefa 2.3 | `api/src/routes/components.rs`<br>`web/src/engine/components/catalog.ts`<br>`web/src/engine/renderers/component.ts` | `test_components_catalog_endpoint`<br>`test_ti_component_svg_rendering` | 20 componentes de TI renderizados com `currentColor`, aceitando estilos de contorno. |
| **RF-E04** | Edição e inserção de textos | Fase 2 | Tarefa 2.4 | `web/src/engine/text/textEditor.ts`<br>`web/src/engine/renderers/text.ts` | `test_text_element_bounding_box`<br>`test_inline_text_editing_commit` | Duplo clique abre input de edição inline; ao desfocar ou teclar Enter, o texto é persistido. |
| **RF-E05** | Desenho à mão livre com suavização | Fase 2 | Tarefa 2.5 | `web/src/engine/tools/freehandTool.ts`<br>`web/src/engine/renderers/freehand.ts` | `test_freehand_stroke_smoothing`<br>`test_pressure_point_generation` | Traço suave e contínuo gerado via `perfect-freehand` sem arestas pontiagudas. |
| **RF-E06** | Bindings de setas a elementos | Fase 2 | Tarefa 2.2 | `web/src/engine/bindings/bindingManager.ts`<br>`web/src/engine/bindings/anchors.ts` | `test_binding_attachment_to_cardinal_anchor`<br>`test_arrow_endpoint_recalculation_on_move` | Mover um elemento conectado recalcula automaticamente o ponto de fixação da seta. |
| **RF-E07** | Deletar elementos (setas ligadas ficam soltas) | Fase 1 / 2 | Tarefas 1.6, 2.2 | `web/src/engine/actions/deleteElement.ts`<br>`web/src/engine/bindings/bindingManager.ts` | `test_delete_shape_unbinds_arrow_endpoints`<br>`test_delete_element_via_backspace_key` | Deletar elemento ligado desvincula a seta (`binding = null`), mantendo a seta desenhada. |
| **RF-E08** | Seleção individual e múltipla por caixa de seleção | Fase 1 | Tarefa 1.4 | `web/src/engine/selection/selectionManager.ts`<br>`web/src/engine/spatial/rbushIndex.ts` | `test_single_element_selection`<br>`test_marquee_box_multi_selection` | Clique seleciona elemento único; arrastar retângulo de seleção engloba múltiplos elementos. |
| **RF-E09** | Mover, redimensionar e rotacionar elementos | Fase 1 | Tarefa 1.5 | `web/src/engine/transform/resizeHandler.ts`<br>`web/src/engine/transform/rotateHandler.ts` | `test_element_translation`<br>`test_element_corner_resize`<br>`test_element_rotation_angle` | 8 caixas de manipulação redimensionam elemento; manipulador superior gira o elemento. |
| **RF-P01** | Undo/redo ilimitado na sessão | Fase 1 | Tarefa 1.7 | `web/src/engine/history/historyManager.ts`<br>`web/src/engine/store/sceneStore.ts` | `test_undo_redo_element_mutations`<br>`test_redo_stack_cleared_on_new_action` | Ctrl+Z desfaz a última alteração com precisão; Ctrl+Y / Ctrl+Shift+Z refaz a ação. |
| **RF-Q01** | Criar quadro com nome padrão sequencial (`Quadro-N`) | Fase 3 | Tarefas 3.1, 3.3 | `api/src/routes/boards.rs`<br>`web/src/features/boards/useCreateBoard.ts` | `test_create_board_backend_requires_title`<br>`test_frontend_sequential_name_generation` | Backend valida obrigatoriedade de `title`; frontend calcula maior N + 1 e envia `Quadro-N`. |
| **RF-Q02** | Listar quadros com filtros e paginação | Fase 3 | Tarefa 3.1 | `api/src/routes/boards.rs`<br>`web/src/features/boards/BoardGrid.tsx` | `test_list_boards_pagination_cursor`<br>`test_list_boards_filtered_by_group` | Retorna lista ordenada de metadados de quadros com paginação e suporte a filtros. |
| **RF-Q03** | Abrir quadro e restaurar cena e viewport | Fase 3 | Tarefas 3.1, 3.4 | `api/src/routes/boards.rs`<br>`web/src/features/editor/EditorPage.tsx` | `test_get_board_scene_endpoint`<br>`journey_4_autosave_and_persistence.spec.ts` | Cena e coordenadas de viewport (x, y, zoom) restauradas fielmente ao abrir o quadro. |
| **RF-Q04** | Renomear quadro | Fase 3 | Tarefa 3.1 | `api/src/routes/boards.rs`<br>`web/src/features/boards/RenameBoardDialog.tsx` | `test_rename_board_patch_endpoint`<br>`test_rename_board_length_validation` | `PATCH /boards/:id` atualiza `title` validando tamanho entre 1 e 120 caracteres. |
| **RF-Q05** | Deletar quadro (envio para a lixeira) | Fase 3 | Tarefas 3.1, 3.7 | `api/src/routes/boards.rs`<br>`web/src/features/boards/BoardCardActions.tsx` | `test_soft_delete_board_moves_to_trash`<br>`test_trash_listing_shows_deleted_boards` | `DELETE /boards/:id` preenche `deletedAt = now()`; quadro sai da listagem ativa. |
| **RF-Q08** | Mover quadro entre grupos | Fase 3 | Tarefa 3.1 | `api/src/routes/boards.rs`<br>`web/src/features/boards/MoveBoardDialog.tsx` | `test_move_board_to_group`<br>`test_move_board_to_no_group` | `PATCH /boards/:id` com `{ groupId: id }` move o quadro; `{ groupId: null }` move para Sem Grupo. |
| **RF-Q10** | Autosave com indicador de estado e controle de revisão | Fase 3 | Tarefas 3.2, 3.5 | `api/src/routes/boards.rs`<br>`web/src/features/editor/useAutosave.ts`<br>`web/src/features/editor/SaveIndicator.tsx` | `test_optimistic_concurrency_conflict_409`<br>`journey_4_autosave_and_persistence.spec.ts` | Edição dispara autosave debounced; revisão divergente retorna 409; UI exibe Salvo/Salvando/Erro. |
| **RF-O01** | Criar, renomear e deletar grupos de quadros | Fase 3 | Tarefas 3.1, 3.3 | `api/src/routes/groups.rs`<br>`web/src/features/groups/GroupSidebar.tsx` | `test_group_crud_lifecycle`<br>`test_delete_group_default_move_boards_to_no_group` | CRUD completo de grupos; deleção de grupo move quadros para "Sem grupo" por padrão. |
| **RF-O02** | Listar quadros por grupo e visão "Sem grupo" | Fase 3 | Tarefa 3.4 | `api/src/routes/boards.rs`<br>`web/src/features/boards/BoardListView.tsx` | `test_list_boards_in_group`<br>`test_list_boards_no_group` | Filtragem precisa por `groupId` ou `groupId = null` com contagem dinâmica de quadros. |
| **RF-O03** | Adicionar e remover tags em um quadro | Fase 3 | Tarefa 3.6 | `api/src/routes/boards.rs`<br>`web/src/features/boards/TagInput.tsx` | `test_add_and_remove_tags_on_board`<br>`test_tags_normalized_lowercase` | Tags livres associadas ao quadro via array de strings normalizadas em caixa baixa. |
| **RF-O04** | Filtrar quadros por uma ou mais tags | Fase 3 | Tarefa 3.6 | `api/src/routes/boards.rs`<br>`web/src/features/boards/TagFilterBar.tsx` | `test_filter_boards_by_multiple_tags`<br>`journey_2_board_crud_and_organization.spec.ts` | `GET /boards?tags=a,b` retorna apenas quadros que contêm as tags solicitadas. |
| **RF-O05** | Buscar quadros por título e tags | Fase 3 | Tarefa 3.6 | `api/src/routes/boards.rs`<br>`web/src/features/boards/SearchBar.tsx` | `test_search_boards_by_title_and_tags` | Consulta por texto localiza ocorrências no título e nas tags simultaneamente. |
| **RF-O06** | Ordenar quadros por nome, criação e última edição | Fase 3 | Tarefa 3.4 | `api/src/routes/boards.rs`<br>`web/src/features/boards/SortDropdown.tsx` | `test_sort_boards_by_updated_at`<br>`test_sort_boards_by_title_alphabetical` | Parâmetro `sort=updatedAt:desc` ou `sort=title:asc` respeitado nas consultas MongoDB. |
| **RNF-S00** | Visual minimalista usando shadcn/ui | Fase 0 / 1 | Tarefas 0.3, 1.3 | `web/src/components/ui/*`<br>`web/src/styles/globals.css` | Inspeção visual e testes de renderização de componentes Radix/Tailwind | Interface consistente e padronizada utilizando primitivos Radix UI estilizados com Tailwind CSS. |
| **RNF-S01** | Tema claro e escuro persistido | Fase 1 | Tarefa 1.8 | `web/src/context/ThemeContext.tsx`<br>`web/src/features/editor/CanvasTheme.ts` | `test_theme_toggle_persistence`<br>`test_canvas_background_adapts_to_theme` | Alternância instantânea de classes CSS (`dark`) e ajuste da paleta do Canvas 2D. |
| **RNF-S02** | Cor de contorno configurável | Fase 2 | Tarefa 2.6 | `web/src/engine/style/styleManager.ts`<br>`web/src/features/editor/StrokeColorPicker.tsx` | `test_element_stroke_color_update` | Contorno de qualquer elemento ou componente de TI aceita paleta hexadecimal customizável. |
| **RNF-S03** | Estilo de traço (sólido, tracejado, pontilhado) e preenchimento | Fase 2 | Tarefa 2.6 | `web/src/engine/renderers/strokeStyles.ts`<br>`web/src/features/editor/StrokeStylePicker.tsx` | `test_canvas_dash_array_mapping` | Contexto 2D aplica `setLineDash([6, 6])` para tracejado e `[2, 4]` para pontilhado. |
| **RNF-S04** | Tipografia: família, tamanho e alinhamento | Fase 2 | Tarefa 2.4 | `web/src/engine/renderers/text.ts`<br>`web/src/features/editor/TypographyPicker.tsx` | `test_text_style_metrics_calculation` | Renderização com sans-serif, monoespaçada e manuscrita, com alinhamento esq/centro/dir. |
| **RNF-S06** | Opacidade configurável de 0 a 100% | Fase 2 | Tarefa 2.6 | `web/src/engine/renderers/elementRenderer.ts`<br>`web/src/features/editor/OpacitySlider.tsx` | `test_canvas_global_alpha_mapping` | Contexto 2D define `ctx.globalAlpha = opacity / 100` determinando transparência. |
| **RNF-P01** | Desempenho: 60 fps com 2.000 elementos | Fase 1 | Tarefa 1.4 | `web/src/engine/spatial/rbushIndex.ts`<br>`web/src/engine/renderers/culling.ts` | `test_benchmark_canvas_2000_elements_fps` | Apenas elementos interceptados pelo viewport são desenhados; tempo de frame $\le 16.6\text{ ms}$. |
| **RNF-P02** | Latência de API p95 < 100ms em ambiente local | Fase 0 / 3 | Tarefas 0.2, 3.1 | `api/src/repositories/mongo_repo.rs` | `test_api_crud_latency_p95_under_100ms` | Consultas indexadas MongoDB respondem em menos de 100ms em testes de carga locais. |
| **RNF-P03** | Segurança: Argon2id, JWT HS256, isolamento multi-inquilino | Fase 0 | Tarefas 0.4, 0.5 | `api/src/services/auth_service.rs`<br>`api/src/middleware/auth.rs` | `test_argon2id_verification`<br>`test_jwt_claims_tampering_rejected` | Senhas protegidas com Argon2id; todas as rotas validam `ownerId` do token assinado. |
| **RNF-P04** | Confiabilidade: Autosave debounced com revisão otimista | Fase 3 | Tarefas 3.2, 3.5 | `api/src/routes/boards.rs`<br>`web/src/features/editor/useAutosave.ts` | `test_autosave_debounce_trigger`<br>`test_revision_concurrency_lock` | Gravações com revisão defasada são bloqueadas com HTTP 409, impedindo sobrescrita silenciosa. |

---

## 3. Caveats

1. **Restrição de Modo `/plan`**:
   - Este relatório é exclusivamente investigativo e arquitetural. Nenhum código de produção ou teste foi gerado nos diretórios `api/` ou `web/`. Toda a codificação efetiva ocorrerá apenas na fase subsequente após aprovação explícita do plano pelo usuário.
2. **Dependência de Recursos do Host Docker**:
   - A especificação prevê execução totalmente local via containers Docker. O desempenho do backend Rust e do MongoDB depende de alocação razoável de memória (mínimo de 4 GB recomendados no Docker Desktop / WSL2) para garantir testes de concorrência e compilação do `cargo` sem gargalos.
3. **Escopo das Fases 4 e 5**:
   - As Fases 4 (Qualidade de Vida: efeitos neon/blur com offscreen canvas, snap à grade, exportações completas, histórico de snapshots) e 5 (Futuro: WebSockets, CRDTs Yjs, colaboração em tempo real, busca interna no canvas) estão estruturadas em nível estratégico de alto nível, devendo receber detalhamento de tarefas apenas quando o MVP (Fases 0 a 3) atingir seus critérios de aceitação.
4. **Resoluções da Seção 14 Adotadas como Padrão**:
   - Adotou-se integralmente a proposta recomendada na Spec v0.2: lixeira com retenção de 30 dias (baseada em `deletedAt` com limpeza periódica); deleção de grupo movendo quadros para "Sem grupo" como default; grupos de nível único no MVP; tags livres normalizadas em strings; interface em pt-BR com estrutura i18n; e JWT com HS256 no ambiente de desenvolvimento local.

---

## 4. Conclusion

1. **Diagnóstico do Workspace**: O ambiente encontra-se em estado inicial limpo, ideal para uma implementação disciplinada do zero. Os diretórios `api/` e `web/` estão vazios, `.docker/` contém esqueletos, e a especificação técnica `.agent/Spec — Whiteboard de System Design.md` v0.2 é sólida, consistente e detalhada.
2. **Aderência Metodológica (`senior-dev`)**: A síntese demonstra que cada fase (0 a 3) e cada tarefa técnica constituinte podem ser rigorosamente particionadas sob os três pilares de engenharia:
   - *Make it Work*: Contratos de dados e tipos primeiro, TDD estrito com testes vermelhos honestos, funções puras de domínio isoladas de framework/DOM.
   - *Make it Right*: Portões de qualidade automatizados (CRAP < 10, jscpd < 0.8, mutação), padrões RFC 7807 para erros, RFC 9110 para semântica HTTP, e concorrência otimista via `revision`.
   - *Follow Practice*: Observabilidade com `tracing` estruturado correlacionado por request ID, commits convencionais atômicos e auditoria de segurança no CI.
3. **Estratégia de Testes Pronta para Produção**: A estratégia cobre os 5 pilares críticos:
   - Motor matemático e geométrico com testes unitários puros e matrizes determinísticas.
   - Gerenciamento de estado e histórico com validação de invariantes e limites de memória.
   - Domínio Rust isolado com mocks para o repositório.
   - Integração HTTP Axum + MongoDB em containers para validação de concorrência, rotação de cookies e isolamento multi-inquilino.
   - Testes E2E com Playwright cobrindo as 4 jornadas fundamentais do usuário.
4. **Prontidão do Blueprint**: O esqueleto estrutural e a matriz de rastreabilidade com 34 requisitos funcionais e não-funcionais estão 100% mapeados para tarefas, arquivos, testes e critérios de aceite, fornecendo a base definitiva para a redação do arquivo `c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\plano_de_implementacao.md`.

---

## 5. Verification Method

Para verificar e validar as conclusões e artefatos deste relatório de forma independente:

1. **Verificação de Inalterabilidade do Código no Modo `/plan`**:
   ```powershell
   Get-ChildItem -Path api, web -Recurse
   ```
   *Condição de sucesso*: Nenhum arquivo retornado em `api` ou `web` (diretórios permanecem intactos e vazios).

2. **Verificação da Rastreabilidade e Cobertura da Spec v0.2**:
   - Abrir `.agent/Spec — Whiteboard de System Design.md` e cruzar cada código de requisito das Seções 3 e 4 (RF-A01 a A06, RF-Q01 a Q12, RF-O01 a O12, RF-C01 a C07, RF-E01 a E14, RF-P01 a P05, RNF-S00 a S07, RNF-P01 a P04) com a Matriz de Rastreabilidade na Seção 2.4 deste documento.
   *Condição de sucesso*: 100% dos requisitos P0 do MVP estão mapeados para uma tarefa específica, arquivos correspondentes, suítes de teste e critérios de aceite.

3. **Verificação da Estrutura Metodológica `senior-dev`**:
   - Validar que as tarefas propostas para as Fases 0 a 3 estabelecem a sequência de testes antes da implementação (TDD Red-Green-Refactor), tipagem forte com estados ilegais impossíveis, e critérios de aceitação objetivos.
