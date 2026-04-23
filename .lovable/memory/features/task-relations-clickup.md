---
name: Relacionamentos de tarefas estilo ClickUp
description: Painel TaskRelations com 3 tipos (related/blocking/waiting_on) no diálogo de edição, bloqueio de conclusão quando há blockers pendentes
type: feature
---
- Tabela `task_relations` (campos: source_activity_id, target_activity_id, relation_type ∈ {related, blocking, waiting_on}, note). Realtime habilitado. Trigger preenche `created_by`/`created_by_email`.
- Componente `src/components/TaskRelations.tsx`: 3 botões grandes (Vincular tarefa / Bloqueio / Em espera), chips resumo no topo, diálogo de busca com seletor de sentido (outgoing/incoming) para blocking e waiting_on. Lista por categoria com remoção inline.
- Hook `src/hooks/useTaskBlockers.ts`: retorna `{ blockers, isBlocked }` para uma atividade — quem a bloqueia e ainda não está concluído.
- `EditActivityDialog`: mostra `<TaskRelations />` abaixo de `ActivityDependencies`. Banner vermelho quando `isBlocked`. Botão "Concluir Atividade" e transição para etapa final ficam **disabled** com toast explicativo enquanto há bloqueios pendentes.
- Mantida a estrutura existente de FS/SS/FF/SF (`task_dependencies`) — os dois sistemas coexistem: dependências temporais para Gantt/cronograma; relacionamentos para fluxo operacional.
