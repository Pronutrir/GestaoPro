---
name: TAP em três pilares
description: Ficha de Abertura (TAP) reestruturada em POR QUÊ / O QUÊ / PARA QUÊ com sincronização real
type: feature
---
A Ficha de Abertura do Projeto (TAP) é organizada em 3 pilares visuais: POR QUÊ (Tipo do Projeto, Objetivo, Problema/Necessidade, Causa Raiz), O QUÊ (Escopo, Fora do Escopo, Restrições, Requisitos Regulamentares + Premissas, Riscos e Dependências sincronizados) e PARA QUÊ (Benefícios Esperados, Problema que soluciona).

Os campos textuais ficam em `projects` (project_type, objective, problem_statement, root_cause, scope, out_of_scope, restrictions, regulatory_requirements, expected_benefits, solved_problem). Premissas e Riscos no TAP **gravam direto** nas tabelas `assumptions` e `risks` (mesma fonte dos módulos dedicados). Dependências usam tabela `project_dependencies` com vínculo opcional a outro projeto via `linked_project_id` e status (pendente/em_andamento/resolvida/bloqueada).

Tipos de projeto: estrategico, operacional, novos_negocios, parceria, melhoria_processo, inovacao. Tipo + Objetivo também aparecem no AddProjectDialog para captura desde a criação.
