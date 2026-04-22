---
name: Detalhamento da Atividade (ID, anexos, dependências, histórico)
description: EditActivityDialog mostra ID curto copiável, datas-chave, anexos múltiplos via project_documents, predecessoras/sucessoras via task_dependencies e timeline de auditoria
type: feature
---

O `EditActivityDialog` exibe abaixo do título:
- **ID curto**: primeiros 8 caracteres do UUID, clicável para copiar o UUID completo (ícone Hash + Copy).
- **Datas-chave**: "Criada em DD/MM/AAAA" e "Concluída em DD/MM/AAAA" (quando aplicável).

Seções extras renderizadas abaixo dos campos do formulário (na ordem):
1. **Sub-atividades** (já existente, via parent_id).
2. **Mover para Coluna** (já existente).
3. **Anexos** — componente `ActivityAttachments` (src/components/ActivityAttachments.tsx). Upload múltiplo no bucket `csc-attachments` em `activities/{activityId}/{ts}.{ext}`, registro em `project_documents.activity_id`. Lista com download e excluir.
4. **Tarefas vinculadas** — componente `ActivityDependencies` (src/components/ActivityDependencies.tsx). Mostra **Predecessoras** (esta depende de) e **Sucessoras** (dependem desta) usando `task_dependencies`. Suporta tipos FS/SS/FF/SF.
5. **Histórico de alterações** (Collapsible) — `AuditLogPanel` lendo `audit_log` da tabela `activities`.

Fluxo de pai/filho continua via campo `parent_id` (subatividades). Dependências entre tarefas independentes ficam em `task_dependencies` e disparam `cascadeDates` ao mover prazo (já existia no submit).