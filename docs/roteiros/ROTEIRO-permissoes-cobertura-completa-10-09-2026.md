# Roteiro — Validação Completa de Permissões
## Cobertura: Backlog + Kanban + Estado Convite Pendente

**Data**: 10/09/2026  
**Executor**: Agent E2E (Williame)  
**Ambiente**: localhost:3123 (dev) + real setup com DB  
**Fixture**: Estendido com usuário em estado `invitation_status = 'pending'`  
**Accounts**:
- `e2e-del@e2e.local` (admin, pode_tudo)
- `e2e-resp@e2e.local` (editar apenas as minhas — responsável por P1, P2.1, Subatividade A)
- `e2e-tudo@e2e.local` (editar tudo — responsável por Atividade Solta)
- `e2e-ver@e2e.local` (visualizar e comentar)
- `e2e-pendente@e2e.local` (NOVO — recém convidado, `invitation_status = 'pending'`)

Senha: `E2eTeste!2026#Acesso`

---

## Bloco L.1 — Backlog: Menu ⋯ (Controle de Permissão)

**Objetivo**: Validar que o menu oferece ações apenas permissionadas.

| # | Usuário | Atividade | Menu Esperado | Ações Esperadas |
|---|---------|-----------|---------------|-----------------|
| L.1.1 | e2e-resp | P1.1 (sob P1, é responsável) | Menu completo, nada cinza | Concluir ✅, Adicionar ✅, Editar ✅, Mover ✅, Arquivar ✅ |
| L.1.2 | e2e-resp | P2 (fora escopo, resp=e2e-del) | Menu reduzido/cinzento | Concluir ❌, Adicionar ❌, Editar ❌, Mover ❌, Arquivar ❌ |
| L.1.3 | e2e-tudo | Qualquer atividade | Menu completo | Todas as ações habilitadas |
| L.1.4 | e2e-ver | Qualquer atividade | Menu vazio ou "Comentar" | Sem Concluir, Adicionar, Editar, Mover, Arquivar |
| L.1.5 | e2e-pendente | Qualquer atividade | ❓ TBD | Estado pendente deve bloquear ou avisar (ver L.4) |

---

## Bloco L.2 — Backlog: Ações em Lote (Permissão + Contagem)

**Objetivo**: Validar que lote filtra por permissão e conta corretamente.

**Cenário**: e2e-resp seleciona P1 + P1.1 (seu ramo) + P2.1 (também seu ramo, ainda que pai seja de outro) — espera-se:
- Ação habilitada
- Feedback "2 atualizadas" (não 3)
- P2 e Atividade Solta rejeitadas silenciosamente

| # | Usuário | Seleção | Ação | Resultado Esperado |
|---|---------|---------|------|-------------------|
| L.2.1 | e2e-resp | [P1, P1.1, P2] | Mudar status | "1 atualizada · 1 ficou de fora — sem permissão" |
| L.2.2 | e2e-resp | [Atividade Solta] (resp=e2e-tudo) | Arquivar | Bloqueado (sem botão) ou "Sem permissão sobre seleção" |
| L.2.3 | e2e-tudo | [todos] | Arquivar | "5 atualizadas" |
| L.2.4 | e2e-ver | [qualquer] | Qualquer lote | Bloqueado (sem checkboxes) ou "Sem permissão" |

---

## Bloco L.3 — Kanban: Arrasto + Reordenação (Permissão)

**Objetivo**: Validar que Kanban respeita permissão ao mover cards entre colunas.

| # | Usuário | Card | Ação | Resultado Esperado |
|---|---------|------|------|-------------------|
| L.3.1 | e2e-resp | P1.1 (seu ramo) | Arrastar entre colunas | Move sem cadeado; P1 (pai) acompanha coluna |
| L.3.2 | e2e-resp | P2 (fora escopo) | Arrastar entre colunas | Bloqueado ou move volta (animação de rejeição) |
| L.3.3 | e2e-tudo | P1 ou qualquer | Arrastar entre colunas | Move livremente |
| L.3.4 | e2e-ver | Qualquer | Arrastar | Bloqueado (cards não são draggable) |

---

## Bloco L.4 — Usuário em Estado "Convite Pendente"

**Objetivo**: Validar comportamento de quem foi convidado mas não aceitou.

**Pré-requisito**: `e2e-pendente@e2e.local` criado no banco com `invitation_status = 'pending'` (não 'accepted').

| # | Ação | Resultado Esperado |
|---|------|-------------------|
| L.4.1 | Login com e2e-pendente | Redirecionado para tela de aceitar convite ou mensagem "Convite pendente — clique aqui para aceitar" |
| L.4.2 | Se aceitar convite na tela | Session atualiza, redireciona para dashboard |
| L.4.3 | Se não aceitar, tentar acessar projeto | Bloqueado com mensagem clara ou botão "Aceitar convite" |
| L.4.4 | Menu ⋯ em Backlog | Sem ações (ou aviso "Convite pendente") |
| L.4.5 | Kanban | Sem cards visíveis ou aviso "Convite pendente" |

---

## Bloco L.5 — Tela de Onboarding/Convite

**Objetivo**: Validar que convite pendente aparece e oferece caminho de aceitar.

| # | Ação | Resultado Esperado |
|---|------|-------------------|
| L.5.1 | Login com e2e-pendente | Tela de boas-vindas ou aviso "Você foi convidado para Projeto X — [Aceitar] [Recusar]" |
| L.5.2 | Clique em "Aceitar" | Modal de confirmação ou confirmação direto; `invitation_status` muda para 'accepted'; redirect para dashboard/projeto |
| L.5.3 | Clique em "Recusar" | Modal de confirmação; `invitation_status` muda para 'declined' ou 'rejected'; usuário removed da equipe ou bloqueado |
| L.5.4 | Tentar acessar diretamente `/project/[id]` sem aceitar | Bloqueado com 403 ou redirecionado para convite |

---

## Bloco L.6 — Lixeira: Excluir Permanente (Permissão)

**Objetivo**: Validar que botão "Excluir permanente" respeita `can_delete`.

| # | Usuário | Atividade | Ação | Resultado Esperado |
|---|---------|-----------|------|-------------------|
| L.6.1 | e2e-del | Qualquer | Excluir permanente | Sucesso; item removido do banco |
| L.6.2 | e2e-resp | P1.1 (seu ramo) | Excluir permanente | Bloqueado (botão cinza ou ausente); se clicar, 403 |
| L.6.3 | e2e-ver | Qualquer | Excluir permanente | Botão ausente |
| L.6.4 | e2e-tudo | Qualquer | Excluir permanente | Sucesso (tem can_delete no projeto) |

---

## Bloco L.7 — Tela da Atividade (/atividade/:id) — Validação de Cobertura Anterior

**Objetivo**: Confirmar que tela /atividade/:id continua protegida corretamente (validação prévia).

| # | Usuário | Atividade | Resultado Esperado |
|---|---------|-----------|-------------------|
| L.7.1 | e2e-resp | P1.1 (seu ramo) | Botões Editar, Concluir, Mover, Arquivar visíveis e habilitados |
| L.7.2 | e2e-resp | P2 (fora escopo) | Botões Editar, Concluir, Mover, Arquivar **ausentes** (diferente do Backlog) |
| L.7.3 | e2e-ver | Qualquer | Botões ausentes; apenas "Comentar" visível |
| L.7.4 | e2e-pendente | Qualquer | Botões ausentes ou aviso "Convite pendente" |

---

## Checklist de Execução

- [ ] Fixture estendido com `e2e-pendente@e2e.local` criado (invitation_status='pending')
- [ ] Dev server rodando (`localhost:3123`)
- [ ] Bloco L.1 — Menu ⋯ Backlog (7 testes)
- [ ] Bloco L.2 — Lote Backlog (4 testes)
- [ ] Bloco L.3 — Kanban Arrasto (4 testes)
- [ ] Bloco L.4 — Estado Convite Pendente (5 testes)
- [ ] Bloco L.5 — Tela Onboarding (4 testes)
- [ ] Bloco L.6 — Lixeira Excluir (4 testes)
- [ ] Bloco L.7 — Validação Anterior /atividade/:id (4 testes)

**Total**: 32 testes

---

## Interpretação de Resultados

### Passar (Esperado Após Correções)
- L.1.1–L.1.4: Menu oferece ações corretas por escopo
- L.2.1–L.2.4: Lote filtra, conta e avisa corretamente
- L.3.1–L.3.4: Kanban respeita permissão em arrasto
- L.4.1–L.4.5: Convite pendente bloqueia ou avisa
- L.5.1–L.5.4: Onboarding funciona
- L.6.1–L.6.4: Excluir permanente gateado por can_delete
- L.7.1–L.7.4: /atividade/:id continua protegido

### Falhar (Bug Real)
- Menu ⋯ oferece ações mesmo fora do escopo → REAL (menu estático)
- Lote não filtra ou conta errado → REAL (se L.2.1 disser "3 atualizadas")
- Kanban move bloqueado mesmo com permissão → Possível bug
- Convite pendente não redireciona → Falha de onboarding
- Excluir permanente executa sem can_delete → Falha de segurança (raro, pois policy DELETE é consultada)

---

## Prioridades de Correção

1. **CRÍTICO**: Menu ⋯ Backlog consultar permissão (L.1)
2. **CRÍTICO**: Convite pendente avisar/bloquear (L.4, L.5)
3. **ALTO**: Lote contar corretamente (L.2)
4. **ALTO**: Kanban respeitar permissão (L.3)
5. **MÉDIO**: Excluir permanente (já gateado, apenas L.6)
6. **VALIDAÇÃO**: /atividade/:id confirmação (L.7)

---

## Notas Técnicas

- **Menu ⋯ estático**: Provavelmente renderizado sem consulta a `podeMexer` ou similar. Precisa de `canXXX` props passadas do page.tsx.
- **Convite pendente**: Deve ser verificado no `page.tsx` ou middleware de auth; se `invitation_status='pending'`, redirecionar para onboarding ou mostrar modal.
- **Lote**: Já corrigido no commit `d2401ef` (filtro `podeMexer`, contagem real). Revalidar após merge.
- **Kanban**: Verificar se `onActivityDrop` consulta `canMutateActivity` antes de chamar API.
- **Excluir permanente**: Policy DELETE já consulta `can_member_action(project_id, uid, 'delete')`, mas arquivar (UPDATE) não — correção proposta: `can_delete OR souResponsavelDoRamo`.
