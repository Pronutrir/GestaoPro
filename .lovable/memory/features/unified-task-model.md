---
name: Unified Task Model
description: Tudo é tarefa. item_type só tem 'fase' ou 'tarefa'. Hierarquia via parent_id (subtarefas). Sem conceito separado de subatividade.
type: feature
---
A estrutura foi simplificada: tudo na tabela `activities` é tarefa. O campo `item_type` aceita apenas `fase` ou `tarefa` (default `tarefa`). Não existe mais subatividade como classificação — qualquer tarefa com `parent_id` é naturalmente uma subtarefa. No EditActivityDialog há apenas um toggle "É uma fase" (sem dropdown de Tipo nem campo Fase legado). A quebra de trabalho é feita exclusivamente pela aba Subtarefas (parent_id).
