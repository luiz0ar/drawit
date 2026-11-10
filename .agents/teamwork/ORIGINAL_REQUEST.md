# Original User Request

## Initial Request — 2026-11-10T15:18:58Z

Criar um plano de implementação detalhado para o Whiteboard de System Design ("drawit") com base na especificação técnica v0.2 (`.agent/Spec — Whiteboard de System Design.md`), seguindo a metodologia de engenharia sênior (`senior-dev`) e o modo de planejamento (`/plan`) sem alterar código da aplicação antes da aprovação do usuário.

Working directory: c:\Users\luis.felipe\Desktop\Developer\drawit
Integrity mode: development

## Reference Material
- Especificação do projeto: `c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\Spec — Whiteboard de System Design.md`
- Guia de engenharia: `C:\Users\luis.felipe\.gemini\config\skills\senior-dev\SKILL.md`

## Requirements

### R1. Documento do Plano de Implementação
Elaborar um plano de implementação detalhado e salvá-lo no arquivo `c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\plano_de_implementacao.md`. O plano deve cobrir em profundidade as fases do MVP (Fases 0 a 3 do roadmap da Spec: Fundação, Núcleo do canvas, Diagramas, Quadros e organização), mantendo as Fases 4 (Qualidade de vida) e 5 (Futuro) descritas em alto nível.

### R2. Aderência às Decisões da Spec v0.2 e Resolução de Pontos Abertos
Incorporar estritamente todas as decisões de arquitetura consolidadas na Spec v0.2:
- Frontend: React + Vite com motor Canvas 2D próprio (React restrito à UI ao redor) e shadcn/ui.
- Backend: Rust com Axum e MongoDB em containers Docker.
- Autenticação: username único e senha, JWT com refresh token gerenciado no backend.
- Quadros: título obrigatório apenas no backend, com frontend gerando título sequencial padrão (`Quadro-1`, `Quadro-2`).
- Canvas: zoom in/out na roda do mouse sem Ctrl, pinça e atalhos (10% a 800%); pan arrastando com ferramenta mão, espaço+arrastar ou botão do meio.
- Decisões em aberto (Seção 14 da Spec): adotar como padrão as propostas recomendadas no próprio documento da Spec (deleção de grupo movendo quadros para "Sem grupo" por padrão; retenção de lixeira de 30 dias; tags livres por quadro; grupos de nível único no MVP; idioma pt-BR com estrutura para i18n; JWT HS256 em desenvolvimento).

### R3. Estruturação Conforme a Metodologia `senior-dev`
Cada fase e tarefa de implementação detalhada no plano deve seguir os princípios da skill `senior-dev`:
- Divisão em fases: "Make it Work" (menor implementação correta orientada a testes), "Make it Right" (qualidade, refatoração, gates de duplicação e complexidade) e "Follow Practice" (observabilidade, rastreabilidade e commits semânticos).
- Estratégia de testes por tarefa: definição prévia de testes de comportamento (TDD) — unitários para regras de domínio e motor matemático do canvas, integração para rotas HTTP/MongoDB, e testes E2E com Playwright para fluxos críticos de usuário.
- Modelagem de dados e contratos de API com validação estrita nas fronteiras (DTOs/schemas), tratamento de erros contextualizado e garantia de idempotência.

### R4. Modo de Planejamento (`/plan`)
Durante a execução desta tarefa, nenhum código de produção ou de testes da aplicação (ex.: em `api/`, `web/`, etc.) deve ser criado ou modificado. Apenas o artefato de documentação do plano de implementação deve ser produzido.

## Acceptance Criteria

### Entrega do Artefato
- [ ] O arquivo `c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\plano_de_implementacao.md` existe e contém o plano estruturado completo.
- [ ] Nenhum arquivo de código da aplicação ou de dependências em `api/` ou `web/` foi criado ou modificado.

### Conteúdo e Cobertura do Plano
- [ ] As Fases 0 (Fundação), 1 (Núcleo do canvas), 2 (Diagramas) e 3 (Quadros e organização) estão detalhadas com tarefas concretas, mapeadas para os IDs de requisitos da Spec (RFs e RNFs correspondentes).
- [ ] As Fases 4 e 5 estão delineadas em nível estratégico/alto nível no roadmap.
- [ ] Todas as decisões de arquitetura v0.2 estão contempladas em suas respectivas fases no plano.
- [ ] As propostas da Seção 14 da Spec estão integradas como decisões padrão do projeto.
- [ ] Cada tarefa técnica das fases 0 a 3 contém: descrição do que construir, contratos ou estruturas de dados envolvidos, estratégia de testes prévios (TDD) e critérios objetivos de aceite.
