---
name: Unified Task Model
description: Modelo unificado onde Fase/Atividade/Subatividade são tipos (item_type) de uma única entidade activities, hierarquizadas via parent_id
type: feature
---
A estrutura de Fase → Atividade → Subatividade foi unificada. Tudo é "tarefa" (tabela `activities`) com o campo `item_type` ('fase' | 'atividade' | 'subatividade') definindo a classificação. A hierarquia é determinada por `parent_id` (não mais por `phase_id`). A tabela `phases` foi descontinuada (mantida para histórico) e suas linhas foram migradas para `activities` com `item_type='fase'`. O EditActivityDialog possui um seletor "Tipo" para classificação manual.
