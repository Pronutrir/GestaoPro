---
name: Painel unificado de relacionamentos de tarefas
description: TaskRelations consolida 5 tipos (predecessor/successor + related/blocking/waiting_on) em um único painel harmonioso com busca por título ou ID
type: feature
---
- Componente único `src/components/TaskRelations.tsx` agrupa **5 tipos** de vínculo num só painel:
  - **Predecessora** / **Sucessora** (vindas de `task_dependencies`, sempre `finish_to_start`)
  - **Vinculada** (`related`), **Bloqueio** (`blocking`), **Em espera** (`waiting_on`) — todas em `task_relations`
- Layout: 5 botões "+ adicionar" no mesmo grid (2 cols mobile, 5 cols desktop) e lista única agrupada por tipo. ActivityDependencies foi DESCONTINUADO no `EditActivityDialog`.
- Diálogo de criação único: campo de busca aceita **título OU ID** (full ou prefixo do UUID), exibe contagem de resultados e mostra `#abc12345` em fonte mono ao lado de cada item.
- Para `blocking` e `waiting_on` há seletor de **sentido** (esta bloqueia/é bloqueada). Para `predecessor`/`successor` o sentido é fixo.
- Hook `useTaskBlockers` continua bloqueando conclusão da tarefa enquanto houver bloqueios pendentes (botão "Concluir Atividade" e transição para etapa final ficam desabilitados com toast).
- Realtime nas duas tabelas (`task_dependencies` e `task_relations`).
