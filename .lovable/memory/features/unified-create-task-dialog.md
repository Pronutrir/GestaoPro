---
name: Unified Create/Edit Activity Dialog
description: O EditActivityDialog atende criar e editar com paridade total de campos via createMode
type: feature
---
A criação e edição de atividades usam o **mesmo componente** `EditActivityDialog` (src/components/EditActivityDialog.tsx). Quando aberto com a prop `createMode`, o componente:
1. Insere uma atividade rascunho (status pending, prioridade medium, título "Nova atividade") na tabela `activities` ao abrir, usando `defaultStageId`/`defaultPhaseId`/`defaultParentId`.
2. Limpa o título no formulário e habilita imediatamente todos os blocos do Editar: sub-atividades, mover entre colunas (workflow_stages), anexos, dependências, comentários, flag de prazo (qualidade), data de atualização (qualidade), Recursos (horas/custo/story points), etiquetas, RACI, participantes.
3. Ao cancelar SEM digitar título, o rascunho é deletado automaticamente. Ao salvar, faz UPDATE no rascunho.
4. Oculta o cabeçalho de metadados (ID, criada em, criada por), o histórico de alterações (AuditLogPanel) e os botões "Concluir Atividade"/"Encerrar" durante a criação.
5. Botão final muda para "Criar Atividade".

O `CreateTaskDialog` legado (src/components/CreateTaskDialog.tsx) ainda existe no projeto, mas o `ProjectDetails.tsx` usa apenas o `EditActivityDialog` em createMode para garantir 100% de paridade visual e funcional entre criar e editar.
