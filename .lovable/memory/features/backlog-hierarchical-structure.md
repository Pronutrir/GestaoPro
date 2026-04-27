---
name: Backlog Hierárquico
description: Backlog moderno (estilo Jira/Linear). Tudo é tarefa. Hierarquia livre via parent_id. Quick-add inline em fases e em qualquer tarefa-pai. Edição inline de título por duplo-clique.
type: feature
---

Princípios:
- **Tudo é tarefa.** Não existe mais o conceito visual de "Pacote de Atividades". Qualquer tarefa que tenha filhas via `parent_id` é tratada como tarefa-pai (mostra contador, é colapsável). O gestor decide a hierarquia livremente, sem rótulos especiais.
- **Lista hierárquica única**: Fase → Tarefas (com filhas indentadas 24px por nível). Fases sempre visíveis, mesmo vazias. Grupo "Sem fase" só aparece se houver órfãs.
- **Quick-add inline**: o botão "+ Tarefa" no cabeçalho da fase abre um Input inline (sem dialog) que cria a tarefa direto no Enter. Hover de qualquer tarefa expõe um "+" que abre input inline para criar subtarefa filha. Esc fecha; blur sem texto fecha; com texto submete.
- **Edição inline de título**: duplo-clique no título converte para Input; Enter/blur salvam, Esc cancela. Edição completa continua via `EditActivityDialog` ao clicar no card.
- **Multi-seleção** com checkboxes para mover lote ao Kanban (workflow_stage_id).
- **Lixeira** (soft-delete) ao final do Backlog com restaurar/esvaziar.

O dialog "Novo Pacote" foi removido. A criação completa via `CreateTaskDialog` (com todos os campos) ainda é acessível via prop `onCreateActivityInPhase` do consumidor, mas o fluxo padrão dentro do Backlog é o quick-add inline.