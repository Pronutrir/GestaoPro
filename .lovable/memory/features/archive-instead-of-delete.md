---
name: Arquivamento substitui Exclusão
description: Toda exclusão de Projetos, Fases, Atividades e Subatividades é soft-delete (arquivamento). Apenas Admin pode excluir definitivamente via /trash.
type: feature
---

A plataforma usa **arquivamento** em vez de exclusão. Botões "Excluir" foram renomeados para "Arquivar" em PhaseManager e ProjectDetails. A página `/trash` foi renomeada para "Arquivo" no sidebar.

**Mecânica:**
- Arquivar = `update({ is_trashed: true, trashed_at: now() })` na tabela
- Restaurar = `update({ is_trashed: false, trashed_at: null })` (qualquer usuário com acesso)
- Excluir definitivamente = `delete()` real, **somente Admin** (gating via `useAuth().isAdmin`)

**Tabelas com is_trashed/trashed_at:** projects, activities, phases (adicionado), risks, assumptions, meetings, project_documents, lessons_learned, user_stories, delivery_packages, activity_comments.

**Filtros importantes:** queries de phases em `ProjectDetails.tsx`, `Timeline.tsx` e `UserStoriesBoard.tsx` aplicam `.eq("is_trashed", false)` para ocultar fases arquivadas da operação.

A página `/trash` (componente `src/pages/Trash.tsx`) lista por aba (Projetos, Fases, Atividades, etc.) com contador. Botões "Esvaziar arquivo" e "Excluir definitivamente" são restritos a `isAdmin` (não mais `canManage`).
