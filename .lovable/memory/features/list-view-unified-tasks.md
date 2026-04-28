---
name: Lista (visão unificada de tarefas)
description: Aba "Lista" (antiga Backlog) mostra TODAS as tarefas do projeto. Status é atributo (badge), não filtro. Kanban e Lista são visualizações da mesma coleção.
type: feature
---
Modelo "uma coleção, várias visões" estilo ClickUp/Linear:

- A aba **Lista** (anteriormente "Backlog") exibe **todas as tarefas** do projeto agrupadas por fase, em hierarquia (parent_id). Não filtra por workflow_stage.
- O **status** (workflow_stage) é exibido como **badge colorido** na linha, junto da prioridade. Mover de status no Kanban NÃO remove a tarefa da Lista.
- Botão "Mover para Kanban" virou **"Mudar status"**: abre dropdown com TODOS os stages (incluindo o "Backlog" como display_order=0).
- O **Kanban** continua sendo a visão por status — mostra as mesmas tarefas, agrupadas por workflow_stage.
- Toda tarefa nova nasce com `workflow_stage_id` = stage de display_order=0 (estado inicial), e aparece tanto na Lista quanto na coluna inicial do Kanban.

Identificadores no código:
- Aba ainda usa `value="backlog"` para preservar persistência de ordem/visibilidade já gravada nos perfis dos usuários.
- Componente `BacklogSection.tsx`: removeu `isBacklogActivity` filter; agora `backlogActs = activities`.
