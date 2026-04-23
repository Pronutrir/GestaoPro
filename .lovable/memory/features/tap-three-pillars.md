name: TAP padrão PMBOK 7
description: Termo de Abertura do Projeto seguindo PMBOK 7ª ed. com 13 cards numerados e sincronização com módulos
type: feature
---
TAP em 13 cards numerados conforme PMBOK 7ª edição: 1.Título · 2.Gerente · 3.Patrocinador · 4.Datas (início/término) · 5.Justificativa · 6.Objetivos · 7.Escopo (em/fora) · 8.Entregáveis (+ lista de fases) · 9.Premissas · 10.Restrições · 11.Stakeholders (membros do projeto) · 12.Requisitos de Aprovação · 13.Riscos Iniciais.

Persistência: campos nativos em `projects` (objective, problem_statement, scope, out_of_scope, restrictions, expected_benefits). Campos extras (sponsor, start_date, justification, deliverables, assumptions textuais, approval_requirements) ficam serializados como JSON dentro de `projects.description` com flag `__charter:true`. Stakeholders vêm de `project_members`+profiles. Riscos vêm da tabela `risks`. Fases listadas a partir da tabela `phases`. Apenas Admin/Gestor edita via botão "Editar TAP".
