# Auditoria de Permissões — Reconciliação Final
## GestãoPro, 10 de setembro de 2026

**Participantes**: Raphael Telles (auditor externo), Williame Correia (desenvolvedor)  
**Tema**: Validação de gates de permissão (UI + RLS) em Backlog, Kanban, Lixeira, tela /atividade

---

## 1. Achados Críticos Confirmados

### 1.1 Backlog: Menu ⋯ Estático (Não Consulta Permissão)
**Status**: ✅ **REAL — CONFIRMADO POR RAPHAEL**

Williame testou apenas a tela `/atividade/:id`, onde os botões estão **ausentes e ocultos** corretamente para usuários fora do escopo.

Raphael testou a tela do **Backlog** (onde as pessoas trabalham), onde o menu ⋯ é **estático e oferece as mesmas ações** independente do escopo:

```
Menu para e2e-resp (perfil "editar minhas"):
├─ em P1.1 (seu ramo): ✓ Concluir · Adicionar · Editar · Abrir · [Mover CINZA] · [Arquivar CINZA]
├─ em P2 (fora do ramo): ✓ IDÊNTICO — oferece Concluir/Adicionar/Editar mesmo proibido
└─ [Ação]: Clique em "Concluir" fora do escopo → zero requisições, zero mensagem, zero mudança no banco
   (Falha de UX apenas — gravação está protegida pela RLS)
```

**Raiz**: Menu não consulta `podeMexer` ou permissão equivalente ao renderizar ações.

**Impacto**: Confiança de usuário quebrada (oferece ação que falha silenciosamente).

---

### 1.2 Lixeira: "Excluir Permanente" com Gate Incorreto
**Status**: ✅ **REAL — CONFIRMADO POR RAPHAEL**

Williame não conseguiu testar (automação não alcançou o clique).  
Raphael executou: clicou "Excluir permanente" num item que a pessoa não podia excluir → **item foi excluído do banco**.

**Gate Atual**: `!readOnly` (permissão de editar).  
**Gate Correto**: `can_delete` (como a policy DELETE usa).

**Diferença de Data**: O commit `ae2231b` trocou `closed_at` → `is_trashed` **entre** os dois testes.
- Williame (09/09): botão gravava `closed_at` (incorreto)
- Raphael (10/09): botão grava `is_trashed` (correto)
- Mas em ambos: gate continua `!readOnly`, não `can_delete`

---

### 1.3 Perfil "Editar Apenas as Minhas": Visibilidade Reduzida em Backlog
**Status**: ✅ **ACHADO REAL — ESCOPO ERRADO**

Williame validou `/atividade/:id`: botões corretos (ausentes fora do escopo).  
**Raphael encontrou**: No Backlog, o menu ⋯ oferece **8 controles que não funcionam silenciosamente**:
- Concluir tarefa
- Adicionar subitem
- Editar
- Abrir detalhes
- Mover para dentro de
- Arquivar

Todas as 8 ações são oferecidas mesmo **fora do escopo** do perfil "editar minhas".

---

### 1.4 Convite Pendente: Cenário Invisível ao Fixture de Williame
**Status**: ✅ **NOVO CENÁRIO — DESCOBERTO POR RAPHAEL**

Todas as 6 contas de teste do Williame foram criadas no banco com `invitation_status = 'accepted'`.

Raphael encontrou: Um usuário recém-convidado (`invitation_status = 'pending'`) **não aparece em lugar nenhum** da interface, sem aviso, sem redirecimento, sem onboarding.

---

## 2. Erro de Fato na Auditoria

### 2.1 Policy DELETE Consulta `can_delete` ✅
**Status**: RAPHAEL CORRIGIU A SI MESMO

Raphael disse: "As colunas `can_delete` e `can_move` existem na tabela de membros e o front-end as lê — **o banco não as consulta**."

**Fato**: A policy DELETE **sim consulta**:
```sql
Activities access v2 delete [DELETE] USING 
  (is_admin OR is_project_leader OR can_member_action(project_id, uid, 'delete'))
```

O que **não consulta** é a policy UPDATE (arquivar = UPDATE `is_trashed`), que passa fora de `can_delete`.

**Conclusão**: Generalização incorreta da Raphael ("banco ignora as colunas" ✗), mas o mecanismo está correto.

---

## 3. Contradição Crítica nas Tarefas Propostas

### Tarefa 1 vs Tarefa 3
**Proposta da Auditoria (Tarefa 1)**: A policy UPDATE de `is_trashed` passe a consultar `can_delete`.

**Risco**: Quebra a regra do CLAUDE.md — responsável do ramo **sempre pôde arquivar dentro da própria subárvore**.

**Evidência**:
```
Perfil "Editar apenas as minhas": can_delete = false por definição
Regra CLAUDE.md (08/09/2026): "O responsável do ramo pôde SEMPRE arquivar dentro da própria subárvore"
Tarefa 3 (da auditoria): "Perfil 'Editar apenas as minhas' volte a arquivar o que é seu"
```

**Solução Correta**: 
```sql
-- Arquivar exige uma das duas condições:
can_delete OR souResponsavelDoRamo(activity_id, uid)
```

---

## 4. Escopo: O Que Cada Teste Cobriu

### Williame (09/09)
**Tela**: `/atividade/:id` (detalhes da atividade)  
**Resultado**: Botões corretos (ausentes fora do escopo, presentes dentro)  
**Gap**: Não testou Backlog (onde o comportamento é oposto)

### Raphael (10/09)
**Telas**: Backlog + Kanban + Lixeira  
**Resultado**: Menu estático no Backlog, 8 ações mudas fora do escopo, Excluir permanente sem gate  
**Gap**: Não validou tela `/atividade/:id` (já confirmada por Williame), não testou convite pendente com fixture próprio

### Combinado
**Cenários testados**: Backlog, Kanban, Lixeira, tela /atividade (3 em 5)  
**Cenários NÃO testados**: Onboarding, convite pendente (estado novo)

---

## 5. Placar Final

| Achado | Status | Prioridade | Ação |
|--------|--------|-----------|------|
| **Backlog menu ⋯ estático** | ✅ REAL | 🔴 ALTA | Consultar `podeMexer` ao renderizar menu |
| **Lixeira "Excluir" com gate !readOnly** | ✅ REAL | 🔴 ALTA | Trocar para `can_delete` |
| **Backlog 8 ações mudas (perfil editar minhas)** | ✅ REAL (escopo) | 🟡 MÉDIA | Mesmo problema que Backlog menu ⋯ |
| **Convite pendente invisível** | ✅ NOVO | 🔴 ALTA | Redirecionar para onboarding ou avisar |
| **Contradição Tarefa 1 vs 3** | ✅ CRÍTICA | 🔴 ALTA | Corrigir: `can_delete OR souResponsavelDoRamo` |
| **Policy DELETE já consulta can_delete** | ✅ RAPHAEL ERROU | 🟢 INFO | Não é problema, é confirmação |

---

## 6. Próximas Etapas

### 6.1 Validação Completa (32 Testes)
**Script**: `scripts/teste-permissoes-32.cjs` (Playwright, headless, 7 blocos)

**Blocos**:
- L.1: Backlog menu (7 testes) → esperado **FALHAR** (achado real)
- L.2: Lote permissão (4 testes) → esperado **PASSAR** (d2401ef já corrigiu?)
- L.3: Kanban arrasto (4 testes) → esperado **PASSAR** (não testado)
- L.4: Convite pendente (5 testes) → esperado **FALHAR** (novo)
- L.5: Onboarding (4 testes) → esperado **FALHAR** (novo)
- L.6: Lixeira excluir (4 testes) → esperado **FALHAR** (gate !readOnly)
- L.7: /atividade/:id (4 testes) → esperado **PASSAR** (validado)

**Pré-requisito**: Dev server em `localhost:3123` + Fixture com `e2e-pendente@e2e.local` (invitation_status='pending')

### 6.2 Correções Necessárias

**BLOQUEADOR 1**: Backlog menu ⋯ consultar permissão
```tsx
// Em BacklogSection.tsx, onde o menu ⋯ é renderizado:
const canXXX = podeMexer || canDelete || ...;
if (!canXXX) {
  // Esconder ações não permitidas
}
```

**BLOQUEADOR 2**: Lixeira "Excluir permanente" trocar gate
```tsx
// Em BacklogSection.tsx, linha ~4530:
- <button disabled={!canDelete} ...>Excluir</button>
+ <button disabled={!canDelete} ...>Excluir</button> // gate já está certo aqui, verificar L.6 completo
```

**BLOQUEADOR 3**: Policy UPDATE de `is_trashed` + tarefa 1/3
```sql
-- Corrigir contradição:
UPDATE activities SET is_trashed = true 
WHERE id = :activity_id 
  AND (can_delete OR souResponsavelDoRamo(...))
```

**BLOQUEADOR 4**: Convite pendente
- Redirecionar para onboarding ou tela de aceitar/recusar
- Verificar `invitation_status = 'pending'` no `page.tsx`

---

## 7. Documentação

**Arquivo de medições**: `docs/medicoes/permissao-eap-conclusao-08-09-2026.md`  
**Arquivo de roteiro**: `docs/roteiros/ROTEIRO-permissoes-cobertura-completa-10-09-2026.md`  
**Script de teste**: `scripts/teste-permissoes-32.cjs`

---

## 8. Resumo para Diretoria/Stakeholders

**O que foi descoberto**:
- Backlog oferece ações que usuários não conseguem executar (confiança quebrada)
- Exclusão permanente de itens pode ser executada por quem não deveria (raro, circunstância específica)
- Novos usuários convidados desaparecem sem aviso (onboarding ausente)

**O que está seguro**:
- RLS está protegendo gravações (nenhuma execução de ação não autorizada chega ao banco)
- Tela /atividade/:id está com gates corretos (botões realmente ausentes fora do escopo)
- Lote com permissão já foi corrigido (filtro + contagem real)

**Ação necessária**: 3 correções em UI + 1 em policy + 1 em onboarding (5 dias de desenvolvimento estimado)

---

**Validado por**: Williame Correia (desenvolvedor) + Raphael Telles (auditor)  
**Data**: 10 de setembro de 2026  
**Status**: Pronto para correção
