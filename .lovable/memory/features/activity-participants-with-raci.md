---
name: activity-participants-with-raci
description: Atividades aceitam participantes ilimitados, cada um com seu próprio papel RACI individual, persistido em activities.participant_roles (JSONB nome→R/A/C/I).
type: feature
---
Cada atividade segue o modelo "Líder + Participantes":
- O Líder principal é gravado em `activities.assigned_to` e tem seu próprio papel RACI em `activities.raci_role` (rotulado "Papel RACI (Líder)" na UI).
- Os Participantes são gravados em `activities.participants` (text[]), sem limite de quantidade, podendo ser qualquer usuário ativo (não precisa ser membro do projeto).
- O papel RACI individual de cada Participante é gravado em `activities.participant_roles` (JSONB), com formato `{ "Nome": "R" | "A" | "C" | "I" | "" }`.
- Os diálogos `CreateTaskDialog` e `EditActivityDialog` exibem cada participante em uma linha com seletor RACI próprio + botão de remover.
