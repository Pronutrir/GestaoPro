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

**Decisores designados** (tabela `change_request_approvers`): múltiplos usuários podem ser escolhidos ao criar/editar a solicitação. Quem pode designar: Admin, Gestor ou Líder do projeto. Se houver decisores designados, **somente eles** podem aprovar/rejeitar (basta um); sem designados, fallback para Admin/Gestor/Líder. Ao designar usuários novos, é criada notificação `change_request_decision` no sino e o card mostra badge âmbar "Aguardando sua decisão" para o usuário-alvo.

**Pontos de gate**: `handleToggleActivity`, `handleDeleteActivity` e helper `openEditActivity` em ProjectDetails toastam e bloqueiam quando o item está travado. Banner âmbar diferencia "projeto inteiro" vs "X fases / Y atividades bloqueadas".
