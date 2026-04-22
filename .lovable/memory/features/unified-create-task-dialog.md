---
name: Unified Create Task Dialog
description: Modal único de criação de tarefas estilo ClickUp usado em Kanban, Backlog e Phase Manager
type: feature
---
O sistema utiliza o componente `CreateTaskDialog` (src/components/CreateTaskDialog.tsx) como modal unificado de criação de tarefas em todos os pontos (Backlog, Kanban e demais visualizações). Layout estilo ClickUp: título grande sem borda, descrição expansível, e todos os campos opcionais como chips clicáveis com Popover (Status, Fase, Líder, Participantes, Prazo, Início, Prioridade, Etiquetas, Horas, Custo, Story Points). Suporta anexo único via Storage (bucket csc-attachments), pré-preenchimento de stage via `defaultStageId` (quando aberto pelo "+" de coluna do Kanban) e botão "Criar" com dropdown de 3 ações: Criar e fechar / Criar e abrir detalhes / Criar e adicionar outra. Atalho Ctrl+Enter cria. O ActivityKanban expõe a prop `onOpenCreateTask(stageId)` para delegar a criação ao dialog central no ProjectDetails.
