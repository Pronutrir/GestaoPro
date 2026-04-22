---
name: Calendar Filters and Holiday/Vacation Management
description: Filtros completos no calendário (global e projeto) + CRUD de feriados (admin/gestor) e férias (admin gerencia qualquer usuário)
type: feature
---
O Calendário (página global /calendario e aba Calendário do projeto) possui um painel de filtros (`CalendarFilters.tsx`) com: Projeto (só global), Fase, Líder, Participantes, Status, Prioridade, Tags, Coluna do Workflow, Intervalo de datas (de/até) e busca por título. Contador de filtros ativos + botão Limpar.

Gestão de Feriados (`HolidaysManager.tsx`) em Configurações: Admin e Gestor podem criar/editar/excluir feriados (RLS atualizada). Gestão de Férias (`UserVacationsManager.tsx`) em Configurações: Admin pode gerenciar períodos de férias de qualquer usuário; usuário comum só os próprios. RLS configurada em `user_work_schedules`.
