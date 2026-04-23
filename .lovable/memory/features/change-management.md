---
name: Change Management (RFC)
description: Módulo de Gestão da Mudança com RFC por projeto, aprovação por Admin/Gestor/Líder e bloqueio total de edição quando há RFC pendente
type: feature
---
Cada projeto possui aba "Mudanças" (ícone GitPullRequest, laranja) com Requisições de Mudança (RFC).

Campos da RFC: título, descrição, justificativa, benefícios esperados, impacto em escopo/prazo/custo/qualidade, status (pending/approved/rejected/cancelled), solicitante, aprovador, data e parecer da decisão.

Tabela: `change_requests` (project_id, status default 'pending', is_trashed soft-delete). Realtime habilitado.

**Bloqueio total**: enquanto houver RFC com status='pending' (e is_trashed=false) no projeto, `canCreate/canEdit/canDelete/canMove` ficam false — todas as ações operacionais (Kanban, Backlog, EditActivity, etc.) são travadas. Banner âmbar no topo do projeto avisa e leva à aba.

**Aprovação**: Admin, Gestor (`canManage`) ou Líder do projeto (`project.owner == profile.full_name`, case-insensitive) podem aprovar/rejeitar com parecer. Demais usuários veem aviso "aguardando decisão".

Arquivar (soft-delete) somente para `canManage`.