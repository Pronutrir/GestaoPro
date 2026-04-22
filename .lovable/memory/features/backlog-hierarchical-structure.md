---
name: Backlog Hierárquico
description: Backlog organizado em árvore Fase → Pacote (atividade-pai) → Subatividades. Fases sempre visíveis, mesmo vazias.
type: feature
---

O Backlog do projeto exibe a estrutura hierárquica:
- **Fase**: cabeçalho colapsável, sempre visível (mesmo vazia), com botões "+ Pacote" e "+ Atividade".
- **Pacote de Atividades**: é uma activity com `parent_id = null` que tem subatividades (filhas). Renderizado com ícone Package e contador de filhas. Colapsável.
- **Subatividades**: activities com `parent_id` apontando para o pacote. Indentadas (margin-left 24px por nível).
- **Atividades soltas**: activities com phase_id mas sem parent_id e sem filhas — aparecem direto na fase.
- **Sem fase**: grupo "Sem fase" para atividades órfãs (phase_id null).

O conceito antigo de "Pacote de Entregas" (tabela `delivery_packages`) foi inibido — removido das abas (`projectTabs.ts`), mas a tabela permanece no banco. Toda criação de pacote agora cria uma activity-pai.

No `CreateTaskDialog`, `defaultParentId` permite pré-selecionar a atividade-pai ao criar subatividade.

Botão "+ Pacote" abre dialog simples (só título) que cria uma activity com `parent_id=null`, `phase_id` da fase clicada e `workflow_stage_id=Backlog`.

Lixeira mantida ao final do Backlog.