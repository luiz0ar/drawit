# Relatório de Handoff — worker_plan

**Agente**: `worker_plan` (Senior Engineering Implementation Planner & Author)  
**Parent / Caller**: `97b8bf7f-6b39-4c16-a483-572049e88b03`  
**Milestone**: Milestone 0 — Implementation Planning Phase (`/plan`)  
**Data**: 2026-11-10T15:35:00Z  
**Artefato Produzido**: `c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\plano_de_implementacao.md`

---

## 1. Observation

1. **Estado do Workspace e Diretrizes do Dispatch**:
   - `c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\ORIGINAL_REQUEST.md`: Exige a elaboração de plano de implementação detalhado e completo em `.agent/plano_de_implementacao.md`, cobrindo em profundidade as Fases 0 a 3 (MVP) e alto nível para Fases 4 e 5, aderindo estritamente à Spec v0.2, às resoluções da Seção 14 e à metodologia `senior-dev`.
   - Restrição mandatória de modo `/plan`: Proibição estrita de criar ou modificar qualquer código de aplicação, testes ou scripts em `api/`, `web/`, `.docker/` ou raiz do projeto antes da aprovação do usuário.
   - `git status --short`: Executado após a escrita do plano; confirmou que nenhum arquivo foi criado ou modificado em `api/`, `web/` ou `.docker/`. O único arquivo criado na pasta do projeto foi `.agent/plano_de_implementacao.md`.
2. **Documentos de Entrada Processados**:
   - `.agent/Spec — Whiteboard de System Design.md` (v0.2).
   - `senior-dev/SKILL.md` (Workflow em 3 fases: Make it Work, Make it Right, Follow Practice).
   - `.agents/teamwork/PROJECT.md` (Layout do código e inventário de features).
   - Relatórios dos mineradores e explorador:
     - `spec_miner_1/handoff.md` (Frontend & Canvas 2D).
     - `spec_miner_2/handoff.md` (Backend, Auth, MongoDB & Contratos).
     - `explorer_1/handoff.md` (Metodologia, Estratégia de Testes & Blueprint).

---

## 2. Logic Chain

1. **Estruturação da Metodologia `senior-dev`**:
   - O plano decompõe todas as tarefas técnicas das Fases 0 a 3 sob os 3 pilares obrigatórios:
     - *Make it Work*: Modelagem de dados e contratos de fronteira primeiro, desenvolvimento estritamente orientado a testes (TDD Red-Green-Refactor), regras puras de domínio isoladas de framework/DOM e garantia de idempotência em mutações críticas.
     - *Make it Right*: Portões de qualidade com complexidade ciclomática CRAP $< 10$, duplicação DRY $< 0.8$ via `jscpd`, testes de mutação com `cargo-mutants` e `Stryker`, conformidade com RFC 7807 (Problem Details), RFC 9110 (Semântica HTTP) e controle de concorrência otimista (OCC via `revision`).
     - *Follow Practice*: Observabilidade shift-left com logs estruturados correlacionados por `x-request-id` (`tracing`), commits semânticos atômicos (Conventional Commits) e DevSecOps CI (Trivy, cargo-audit, npm audit).
2. **Decomposição Granular do MVP (Fases 0 a 3)**:
   - **Fase 0 (Fundação & Setup)**: 6 tarefas técnicas (Docker Compose orquestrando 3 serviços, esqueleto Axum com tracing e erros RFC 7807, esqueleto Vite+React+shadcn/ui, modelagem MongoDB com índices únicos e TTL, autenticação completa com Argon2id, JWT HS256 e cookie HttpOnly com refresh token opaco rotativo e detecção de reuso, pipeline de CI no GitHub Actions).
   - **Fase 1 (Núcleo do Canvas 2D)**: 8 tarefas técnicas (Câmera com matriz afim mundo <-> tela e HiDPI scaling, zoom 10%-800% na roda sem Ctrl centrado no cursor, pan multi-modal via mão, espaço+arraste e botão do meio, render loop 60fps com dirty flag, formas geométricas básicas, índice espacial R-tree `rbush` com culling e hit-testing em 2 fases, seleção individual/marquee/shift, caixa de transformação com 8 alças e rotação quantizada com Shift, desenho livre com `perfect-freehand`, histórico Undo/Redo com limite de 50 ações e coalescência).
   - **Fase 2 (Diagramas & Modelagem)**: 7 tarefas técnicas (8 âncoras magnéticas cardinais e colaterais por forma com raio de atração de 15px, conectores com bindings persistentes e roteamento reto, curvo Bézier e ortogonal Manhattan, Clean Detachment das setas ao deletar elemento vinculado, catálogo nativo de 20 componentes de TI com cache SVG dinâmico, edição de texto in-place via overlay HTML `<textarea>` com auto-wrap no canvas, painel de estilos com paleta arquitetural e efeito Neon Glow, operações de clipboard com remapeamento profundo de UUIDs e bindings).
   - **Fase 3 (Quadros, Organização & Persistência)**: 8 tarefas técnicas (CRUD de quadros com isolamento estrito por `ownerId`, gerador frontend de nome sequencial padrão `Quadro-N`, CRUD de grupos com deleção de fallback para "Sem grupo" por padrão, tags livres por quadro com agregação dinâmica no Mongo, gestão da lixeira com retenção de 30 dias e worker Tokio de purga automática, autosave debounced 1-2s com OCC via `revision` retornando HTTP 409 Conflict, dashboard da biblioteca com filtros e modos grade/lista, motor de exportação PNG HiDPI, SVG vetorial e JSON versionado `.drawit`).
3. **Visão Estratégica das Fases Futuras (Fases 4 e 5)**:
   - Delineamento em alto nível da Fase 4 (Qualidade de Vida: atalhos avançados, Command Palette Ctrl+K, guias magnéticos inteligentes, agrupamento de elementos, miniaturas e snapshots históricos) e da Fase 5 (Colaboração em tempo real, WebSockets, CRDTs Yjs/Automerge, presença com cursores remotos, compartilhamento por link e busca textual profunda no canvas).
4. **Pirâmide de Testes e Matriz de Rastreabilidade**:
   - Detalhamento de cada camada de teste (unitários de geometria com matrizes determinísticas, unitários de estado Zustand, unitários de domínio Rust, integração HTTP Axum + MongoDB em container e 4 jornadas E2E completas em Playwright).
   - Matriz exaustiva mapeando todos os 53 RFs e 28 RNFs para Fases, Tarefas, Arquivos Afetados, Tipo de Teste e Critérios Objetivos de Aceite.

---

## 3. Caveats

1. **Restrição de Modo `/plan` Respeitada**: Nenhum arquivo em `api/`, `web/` ou `.docker/` foi criado ou modificado. A implementação prática terá início somente após a revisão e aprovação deste plano de implementação pelo usuário.
2. **Ambiente Local Containerizado**: O plano assume como premissa a execução local completa via Docker Compose, com alocação recomendada de no mínimo 4GB de memória no host para viabilizar compilação concorrente do Cargo e execução dos testes com MongoDB.
3. **No caveats adicionais**: Todos os requisitos e diretrizes foram integralmente atendidos.

---

## 4. Conclusion

O plano de implementação definitivo foi concluído e gravado com sucesso no arquivo `c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\plano_de_implementacao.md`.
O documento é exaustivo, rigorosamente estruturado sob a metodologia `senior-dev`, incorpora todas as decisões da Spec v0.2 e as resoluções da Seção 14, e fornece à equipe de engenharia o roteiro técnico completo para a execução do projeto drawit.

---

## 5. Verification Method

Para verificar de forma independente e reproduzível o trabalho realizado:
1. **Verificação do Artefato Produzido**:
   - Inspecione a existência e conteúdo de `c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\plano_de_implementacao.md`.
2. **Verificação da Integridade do Modo `/plan`**:
   - Execute no terminal PowerShell:
     ```powershell
     git status --short
     ```
   - Confirme que nenhum arquivo em `api/`, `web/`, `.docker/` ou na raiz do projeto foi criado.
3. **Validação Cruzada de Cobertura de Requisitos**:
   - Verifique que as Fases 0 a 3 contêm 29 tarefas técnicas granulares, todas mapeadas na Matriz de Rastreabilidade cobrindo 100% dos RFs e RNFs da especificação.
