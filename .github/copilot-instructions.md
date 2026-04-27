# Copilot Instructions — insight-finder-pal

## O que é este projeto

Plataforma de gestão de projetos em português (PT-BR) com módulos de roadmap, OKRs, kanban, timeline Gantt, CSC, qualidade, investimentos e gestão de equipe.

## Estratégia de branches

Este repositório tem duas branches com propósitos distintos:

- **`lovable`** — gerada pelo Lovable (Vite + React Router v6). Nunca editar manualmente. É onde usuários prototipam novas funcionalidades.
- **`main`** — refatoração em Next.js 15 App Router. É o código de produção.

Quando sugerir código, identifique em qual branch o arquivo está e siga a stack correspondente.

## Stack por branch

### Branch `lovable` (Vite)
- Vite + React 18 + React Router v6
- TypeScript (loose — strict desativado)
- Supabase client-side direto nos componentes
- Variáveis de ambiente com prefixo `VITE_`
- Roteamento via `<Link to="...">` do react-router-dom
- Entry point: `src/main.tsx` + `src/App.tsx`

### Branch `main` (Next.js)
- Next.js 15 App Router + React 19
- TypeScript strict
- Supabase SSR via `@supabase/ssr` (auth por cookies)
- Variáveis: `NEXT_PUBLIC_*` para cliente, sem prefixo para server-only
- Roteamento via `<Link href="...">` do next/link
- Entry point: `src/app/layout.tsx`
- Diretiva `'use client'` obrigatória em componentes com hooks/estado

## Convenções comuns (ambas as branches)

- UI: Shadcn/UI + Tailwind CSS + lucide-react
- Componentes em `src/components/` — funcionais com hooks
- Utilitários em `src/lib/`
- Hooks customizados em `src/hooks/`
- Tipos do Supabase em `src/integrations/supabase/types.ts` (gerado automaticamente — não editar)
- Gerenciamento de estado assíncrono: TanStack Query (React Query v5)
- Formulários: React Hook Form + Zod
- Drag and drop: dnd-kit
- Gráficos: recharts
- Notificações: sonner (toast)
- Datas: date-fns

## Supabase

- URL do projeto: `https://hkspigazfiuzzooervvh.supabase.co`
- Autenticação: email/password via Supabase Auth
- 42 tabelas principais (projects, activities, phases, workflow_stages, profiles, user_roles, roadmap_items, okr_objectives, csc_tickets, etc.)
- Soft delete com `is_trashed: boolean` + `trashed_at: timestamp`
- Roles: `admin`, `gestor`, `user`
- Real-time via `supabase.channel().on('postgres_changes', ...)` — manter no cliente mesmo na branch `main`

### Clientes Supabase na branch `main`

```typescript
// Cliente browser (para realtime, auth client-side)
// src/integrations/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

// Cliente server (para Server Components e API Routes)
// src/integrations/supabase/server.ts
import { createServerClient } from '@supabase/ssr'

// NUNCA usar service role key no cliente browser
// NUNCA usar NEXT_PUBLIC_ em variáveis server-only
```

## Estrutura de pastas na branch `main`

```
src/
├── app/
│   ├── layout.tsx                  ← Root layout com providers
│   ├── (auth)/login/page.tsx       ← Rota pública
│   ├── (dashboard)/
│   │   ├── layout.tsx              ← Layout protegido (AppLayout + AppSidebar)
│   │   ├── page.tsx                ← Overview
│   │   ├── projects/page.tsx
│   │   ├── projects/[id]/page.tsx
│   │   └── [demais páginas]/
│   └── api/                        ← Route Handlers (server-side)
├── components/                     ← Componentes React (maioria com 'use client')
├── hooks/
├── lib/
└── integrations/supabase/
```

## Regras de segurança (branch `main`)

- `SUPABASE_SERVICE_ROLE_KEY` — somente em API Routes e Server Components, nunca em componentes cliente
- Validar sessão do usuário em toda API Route antes de executar operações
- Operações admin (criar usuário, alterar roles) somente via `src/app/api/` com service role server-side

## Padrão de migração Lovable → Next.js

Ao migrar um componente da branch `lovable` para `main`:

1. Copiar o arquivo para o mesmo caminho em `src/components/`
2. Adicionar `'use client'` no topo se o componente usa hooks, estado ou eventos
3. Trocar `import { Link } from 'react-router-dom'` por `import { Link } from '@/components/ui/link'`
4. Para páginas: criar `src/app/(dashboard)/[rota]/page.tsx` em vez de `src/pages/[Rota].tsx`
5. Se o componente só busca dados (sem realtime), mover o fetch para um Server Component pai e passar como prop `initialData` para o TanStack Query

## O que NÃO fazer

- Não importar `next/link` ou `next/navigation` diretamente em `src/components/` — usar o wrapper `@/components/ui/link`
- Não importar `react-router-dom` na branch `main`
- Não usar `import.meta.env` na branch `main` (usar `process.env`)
- Não editar `src/integrations/supabase/types.ts` — é gerado pelo Supabase CLI
- Não fazer merge automático entre as branches `lovable` e `main` — a migração é sempre manual e seletiva
