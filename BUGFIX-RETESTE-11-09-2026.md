# 🔧 Correções de Bugs — Reteste 11/09/2026

## Resumo

**2 bugs críticos encontrados e corrigidos** após reteste com dev server local.

| Bug | Criticidade | Status | Commit |
|-----|-------------|--------|--------|
| **1. Onboarding — FK quebrada** | 🔴 CRÍTICO | ✅ Corrigido | 4fdf4e8 |
| **2. Menu — can_move/can_delete** | 🟠 ALTO | ✅ Corrigido | 4fdf4e8 |

---

## 🔴 Bug 1: Onboarding — Embed FK Inexistente

### Achado
- Tela `/onboarding` fazia embed: `inviter:profiles!project_members_invited_by_fkey(...)`
- FK `project_members_invited_by_fkey` não existe no banco
- API retornava HTTP 400: `PGRST200 — Could not find a relationship`
- Usuário recebia "Nenhum convite pendente" e ficava preso

### Raiz
Correção 2 criou a tela assumindo que a FK existia, mas o banco só tem:
- `project_members.project_id` → `projects(id)`
- `project_members.user_id` → `auth.users(id)`

Não há FK para `invited_by`.

### Correção

**Arquivo**: `src/app/(auth)/onboarding/page.tsx`

**Mudança**:
```typescript
// ANTES (quebrado):
.select(`
  id,
  project_id,
  invitation_status,
  invited_at,
  invited_by,
  projects (id, title),
  inviter:profiles!project_members_invited_by_fkey (full_name)  // ← NÃO EXISTE
`)

// DEPOIS (funciona):
.select(`
  id,
  project_id,
  invitation_status,
  invited_at,
  invited_by,
  projects (id, title)
`)

// + segunda query para buscar nomes:
const invitedByIds = invites
  .map(inv => inv.invited_by)
  .filter(id => id !== null);

if (invitedByIds.length > 0) {
  const { data: inviters } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', invitedByIds);
  
  // Mapear IDs → nomes
}
```

**Impacto**: L.5 (9 testes de onboarding) devem passar agora.

---

## 🟠 Bug 2: Menu — Mover usa can_delete em vez de can_move

### Achado
- E2E-resp é **responsável de P1.1** (dentro do seu ramo) — `can_move=true`
- Menu de P1.1 oferecia "Mover para dentro" cinza (disabled)
- Deveria estar verde porque `can_move=true`

- E2E-tudo é **"Editar tudo"** — `can_move=true`
- Mesmo problema: "Mover para dentro" cinza

### Raiz
Ambos os itens usavam `!canDelete`:
```typescript
<DropdownMenuItem disabled={!canDelete}>  // ← ERRADO
  Mover para dentro...
</DropdownMenuItem>
```

Mas o permissionamento é:
- `can_move` = pode reorganizar EAP (Mover)
- `can_delete` = pode arquivar (Arquivar)

Estavam acoplados.

### Correção

**Arquivo**: `src/components/BacklogSection.tsx` + `src/app/(dashboard)/project/[id]/page.tsx`

**Mudanças**:
1. Adicionado prop `canMove?: boolean` ao BacklogSection
2. Menu "Mover para dentro" usa `canMove` (não `canDelete`)
3. Menu "Arquivar" continua com `canDelete` (correto)
4. Page.tsx passa ambas as permissões separadamente

```typescript
// BacklogSection prop (linha 160):
canMove?: boolean;

// Destructuring (linha 216):
{ canDelete = false, canMove = false, ... }

// Menu (linha 3014):
<DropdownMenuItem disabled={!canMove}>  // ← CORRETO AGORA
  Mover para dentro de…
</DropdownMenuItem>

// Page.tsx:
<BacklogSection
  canDelete={canDelete}
  canMove={canMove}
  podeMexer={canMutateActivity}
  ...
/>
```

**Impacto**: L.1.4 deve passar (e2e-tudo consegue mover).

---

## 📊 Score Esperado Pós-Bugfix

| Bloco | Antes | Depois | Motivo |
|-------|-------|--------|--------|
| **L.1** (Menu) | 1/6 | 5/6 | ✅ Mover agora funciona |
| **L.2** (Lote) | 0/4 | 2/4 | ✅ Feedback (já fixo, retest confirma) |
| **L.3** (Kanban) | 4/4 | 4/4 | ✅ Sem mudança |
| **L.4–L.5** (Onboarding) | 0/9 | 9/9 | ✅ FK corrigida, tela carrega |
| **L.6** (Lixeira) | 3/4 | 3/4 | ✅ Sem mudança |
| **L.7** (/atividade) | 3/4 | 4/4 | ✅ Onboarding bloqueia, sem acesso |

**Total**: **12/31 → 28/31** ✅

---

## ✅ Checklist

- [x] Bug 1 identificado (FK inexistente)
- [x] Bug 1 corrigido (segunda query)
- [x] Bug 2 identificado (can_delete em mover)
- [x] Bug 2 corrigido (prop canMove separada)
- [x] Build passou (`npm run build`)
- [x] Commit feito (4fdf4e8)
- [x] Documentação criada

---

## 🚀 Próximo Passo

**Re-executar 31 testes em produção** (após deploy).

Esperado:
- ✅ Score: 28/31 (90.3%)
- ✅ Todos os blockers LGPD (Correção 2) resolvidos
- ✅ Menu gateia corretamente (Correções 1 + 2)

Deploy necessário para confirmar em produção.
