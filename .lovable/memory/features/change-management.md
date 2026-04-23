---
name: Change Management (RFC) com escopo
description: Módulo RFC com bloqueio escopado por atividade/fase, IA em todos os campos, liberação assimétrica (aprovada libera; rejeitada só após arquivar)
type: feature
---
Cada projeto tem aba "Mudanças" (ícone GitPullRequest, laranja). Tabela `change_requests` + `change_request_scope_items` (item_type 'activity'|'phase').

**Escopo do bloqueio (manual ao criar a RFC)**:
- Sem itens selecionados = bloqueio amplo (projeto inteiro, comportamento legado).
- Com itens = bloqueia apenas as atividades/fases listadas. Hook `useChangeRequestBlocks(projectId)` expõe `isActivityBlocked(id, phaseId)`, `isPhaseBlocked(id)`, `hasGlobalBlock`.

**Liberação**:
- Aprovada → deleta itens de escopo, libera imediatamente.
- Rejeitada → mantém itens travados; só destrava quando alguém com `canManage` arquiva a RFC (soft-delete).

**IA**: Todos os textos da RFC (título, descrição, justificativa, benefícios, 4 impactos, parecer da decisão) têm `AIAssistButton`.

**Aprovação**: Admin, Gestor (`canManage`) ou Líder do projeto (`project.owner` case-insensitive).

**Pontos de gate**: `handleToggleActivity`, `handleDeleteActivity` e helper `openEditActivity` em ProjectDetails toastam e bloqueiam quando o item está travado. Banner âmbar diferencia "projeto inteiro" vs "X fases / Y atividades bloqueadas".
