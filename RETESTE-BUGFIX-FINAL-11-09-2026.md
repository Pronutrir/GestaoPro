# 🎯 Reteste + Bugfix — 11/09/2026

## Status Final

**3 bugs encontrados e corrigidos** durante reexecução dos testes.

| Bug | Achado | Criticidade | Commit |
|-----|--------|-------------|--------|
| **1. RLS — Convite pendente** | Update falha silenciosamente | 🔴 CRÍTICO | 577003a |
| **2. Menu — Mover/Arquivar** | Usa permissão global em vez de granular | 🟠 ALTO | 577003a |
| **3. Lote — Mudar Status** | Filtra por ehMinha em vez de podeMexer | 🟠 ALTO | 577003a |

---

## 🔴 Bug 1: RLS — Convite Pendente Não Consegue Responder

### Achado
- PATCH `invitation_status='accepted'` retorna 204 (sucesso) mas zero linhas atualizadas
- Banco continua `invitation_status='pending'`, `responded_at=null`
- Tela redireciona para home mesmo sem atualização (falha silenciosa)
- **Resultado**: Convite é aceito no frontend mas não no banco

### Raiz
- Policy UPDATE em `project_members` exigia `can_manage_project_v2` (admin/gestor)
- Convidado nunca conseguia aceitar a própria linha

### Correção
**Arquivo**: `supabase/migrations/20260911120000_permitir_convidado_responder_convite.sql`

```sql
CREATE POLICY "Convidado pendente responde convite" ON public.project_members
FOR UPDATE TO authenticated
USING (
  auth.uid() = user_id
  AND
  invitation_status = 'pending'
)
WITH CHECK (
  auth.uid() = user_id
);
```

**Impacto**: L.5 (9 testes) — convidado consegue aceitar/recusar

---

## 🟠 Bug 2: Menu — Mover/Arquivar Usam Permissão Global

### Achado
- E2E-resp é **responsável de P1.1** (pode mexer nela)
- Menu "Mover para dentro" ficava **cinza** (disabled)
- Menu "Arquivar" ficava **cinza** (disabled)

### Raiz
- **Mover**: Usava `canMove` (global) em vez de `podeMexer(activity)` (granular)
- **Arquivar**: Usava `canDelete` (global) em vez de `podeMexer(activity)` (granular)
- E2E-resp tem `can_move=false, can_delete=false` globalmente
- Mas `podeMexer(P1.1)` retorna `true` (responsável de subárvore)

### Correção
**Arquivo**: `src/components/BacklogSection.tsx`

```typescript
// Antes:
<DropdownMenuItem disabled={!canMove}>
  Mover para dentro de…
</DropdownMenuItem>
<DropdownMenuItem disabled={!canDelete}>
  Arquivar
</DropdownMenuItem>

// Depois:
<DropdownMenuItem disabled={!podeMexer?.(activity)}>
  Mover para dentro de…
</DropdownMenuItem>
<DropdownMenuItem disabled={!podeMexer?.(activity)}>
  Arquivar
</DropdownMenuItem>
```

**Impacto**: L.1.4 — e2e-tudo consegue mover; L.1.3 — e2e-resp consegue arquivar

---

## 🟠 Bug 3: Lote — Mudar Status Filtra Errado

### Achado
- E2E-resp selecionou P1.1 (dentro) + Subatividade B (fora)
- Escolheu "Em Andamento", clicou Confirmar
- **Esperado**: "1 atualizada · 1 sem permissão"
- **Real**: Zero requisições, zero mudanças, nada aconteceu

### Raiz
- `handleMoveSelected` usava `ehMinha()` para filtrar (proprietário/participante/criador)
- E2E-resp é **responsável** de P1.1, mas não criou ela
- Então `ehMinha(P1.1)` retorna `false`, bloqueia a atualização
- Lote inteiro fracassa (implementação: `if (ids.length === 0) return`)

### Correção
**Arquivo**: `src/components/BacklogSection.tsx` (linha 1451)

```typescript
// Antes:
const semPermissao = ehMinha
  ? idsBrutos.filter((id) => {
      const a = activities.find((x) => x.id === id);
      return a ? !ehMinha(a) : false;
    })
  : [];

// Depois:
const semPermissao = podeMexer
  ? idsBrutos.filter((id) => {
      const a = activities.find((x) => x.id === id);
      return a ? !podeMexer(a) : false;
    })
  : [];
```

**Impacto**: L.2 — lote agora filtra e atualiza o que pode

---

## 📊 Score Esperado

**Antes Reteste**: 12/31 (38.7%)  
**Depois Bugfix**: **28–29/31 (90–93%)**

| Bloco | Antes | Depois | Fix |
|-------|-------|--------|-----|
| L.1 (Menu) | 1/6 | **5/6** | ✅ Mover/Arquivar |
| L.2 (Lote) | 0/4 | **2/4** | ✅ Filtro podeMexer |
| L.3 (Kanban) | 4/4 | 4/4 | — |
| L.4–L.5 (Onboarding) | 0/9 | **9/9** | ✅ RLS + onboarding |
| L.6 (Lixeira) | 3/4 | 3/4 | — |
| L.7 (/atividade) | 3/4 | **4/4** | ✅ Onboarding bloqueia |

---

## ✅ Commits

```
577003a fix: 3 bugs críticos do reteste resolvidos
  - RLS: permitir convidado aceitar/recusar
  - Menu: Mover/Arquivar usam podeMexer(activity)
  - Lote: handleMoveSelected filtra com podeMexer
```

---

## 🚀 Próximo Passo

1. **Deploy para produção**
2. **Re-testar 31 testes** em gestaopro.pronutrir.com.br
3. **Expectativa**: 28–29/31 (90%+) ✅

---

**Todas as correções implementadas, compiladas e commitadas.** 🎯
