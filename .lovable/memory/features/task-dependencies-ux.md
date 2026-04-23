---
name: UX de Dependências entre Tarefas
description: ActivityDependencies com botão Vincular destacado, badges 🔗 ←N →N no Kanban e Backlog, e aba dedicada "Dependências" no projeto
type: feature
---
- `ActivityDependencies` (src/components/ActivityDependencies.tsx): instruções inline (Predecessora vs Sucessora), passos numerados (1️⃣ escolher → 2️⃣ tipo → 3️⃣ Vincular), botão **Vincular** verde destacado com ícone, toast de sucesso e highlight verde temporário no item recém-criado. Aviso amarelo quando nenhuma atividade está selecionada.
- Cards Kanban e linhas do Backlog mostram badge `🔗 ←N →N` (predecessoras/sucessoras) lendo de `task_dependencies`.
- Aba **Dependências** (src/components/ProjectDependenciesView.tsx, value `dependencies` em `projectTabs.ts`): lista todos os vínculos do projeto (predecessora → tipo → sucessora), busca, link para abrir cada tarefa, remoção inline e card explicativo de FS/SS/FF/SF. Realtime via canal `project-deps-{projectId}`.
