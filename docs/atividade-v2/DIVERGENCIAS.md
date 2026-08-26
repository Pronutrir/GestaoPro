# Divergências entre o kit e o repositório

O `CLAUDE.md` do kit diz: *"o repositório é a verdade; quando divergir, o código ganha — e me
avise da divergência em vez de corrigir o código para bater com o documento."*

Este arquivo é esse aviso. Levantado em **25/08/2026**, antes de instalar o kit.

Cada item aqui foi **conferido no código**, não inferido.

---

## 1. `lider_id` NÃO EXISTE  ·  bloqueia as fases 02, 03 e 05

```
grep -rn "lider_id\|leader_id" src supabase/migrations   →  0 ocorrências
```

O kit assume que a atividade tem uma coluna `lider_id` a ser migrada para
`activity_assignees`. Ela nunca existiu neste repositório.

**O que existe de verdade:**

| Coluna | Tipo | Desde | Papel |
|---|---|---|---|
| `activities.assigned_to` | `TEXT` — **uma pessoa** | 27/11/2025 | responsável |
| `activities.participants` | `text[]` — **N pessoas** | 18/03/2026 | participantes |

São **284 leituras** de `assigned_to` no código e **13 migrations** que o consultam dentro
de funções da RLS (`is_activity_actor_v2`, `tem_atividade_no_projeto_v2`,
`can_view_project_v2`).

**Consequência prática:** o modelo-alvo do kit (um responsável + N participantes) **já está
implementado**, com outros nomes. A fase 02 não é uma migração de dado ausente — é uma
troca de forma de armazenamento, de duas colunas para uma tabela.

**O que fazer:** decidir se a tabela `activity_assignees` vale o custo, sabendo que o
comportamento resultante é o mesmo. Ver `06-responsaveis-mercado.md`, que compara com sete
produtos e recomenda **manter duas colunas**.

Onde o kit disser `lider_id`, leia `assigned_to` + `participants`.

---

## 2. O campo `estagio` refaz uma decisão já tomada  ·  fase 04

O kit propõe criar `activities.estagio ∈ ('backlog','quadro')`.

**O repositório já resolve isso**, por coluna de workflow — e a decisão de NÃO levar isso
para o banco foi tomada em 20/08/2026, depois de **duas tentativas falhas**:

- `ehBacklog` e `colunasDoQuadro` em `components/kanban/shared.ts` são a fonte única.
- A regra é de produto, no código, **não** preferência por projeto no banco.
- Motivo registrado: *"já se tentou duas vezes delegar a decisão ao banco, e as duas falharam
  igual — a regra só valia onde a migration tivesse rodado, e nos projetos antigos o Backlog
  voltava ao quadro sem ninguém pedir."*
- Projetos novos nascem **sem** coluna Backlog (decisão de 12/08).

**O que fazer:** a fase 04 tem um objetivo legítimo — *promover uma atividade não deve trazer
a hierarquia junto*. Mas o mecanismo proposto é a terceira tentativa de algo que falhou duas
vezes. Reescrever a fase 04 para atacar o sintoma pela consulta do Kanban (item 2 da própria
fase), sem criar `estagio`.

---

## 3. `activity_breadcrumb` e a subárvore  ·  fase 02  ·  **conceito aprovado**

Esta não é divergência — é registro de que o kit está **certo** e o repositório ainda não tem.

As duas views (`activity_breadcrumb`, `activity_dependency_card`) e a regra da subárvore
não existem hoje. O acesso por atribuição hoje é binário: ou a pessoa vê o projeto todo, ou
recebe `isActivityScoped` com as quatro permissões zeradas (`project/[id]/page.tsx`).

O alerta do kit sobre **não colocar contador na trilha** é preciso e vale manter: um
"3 subatividades" entrega a existência das irmãs.

---

## 4. `gerar-matriz.py` não roda aqui  ·  resolvido

Não há Python nesta máquina (`python3` e `python` caem no alias da Microsoft Store).

**Resolvido:** portado para `gerar-matriz.cjs`, que roda com o Node que o projeto já usa.
O `.py` fica no repositório como referência. As duas versões produzem os mesmos 108 casos.

---

## 5. Onde o kit acerta e deve ser seguido

Registrado para não se perder no meio das correções:

- **A regra inviolável** — *atribuir alguém nunca dá acesso que a pessoa não tinha* — é o
  eixo certo, e é exatamente o que a revisão de acesso de 25/08 já vinha aplicando.
- **A ordem de decisão em 6 passos** bate com `lib/activityAccess.ts`, com uma diferença:
  o passo 2 (perfil Visualizador encerra) **não está implementado** dentro de
  `podeMutarAtividade` — hoje o `canWrite` é aplicado por fora, na página
  (`canEdit = canWrite && ...`). Vale unificar na fase 03.
- **A fase 09 e a derivação no servidor** é o melhor achado do kit. Se o pai for recalculado
  no cliente por um usuário que enxerga uma filha só, o pai encolhe e ninguém percebe até o
  relatório do mês. Isso **não está protegido** hoje.
- **A fase 00** descreve corretamente a entrega já feita (commits `81494c1` e `acb5307`) e
  o risco de a fase 02 apagar a leitura de `can_edit_own` ao reescrever a via do ator.

---

## Estado das entregas que o kit chama de fase 00

| Passo | Estado |
|---|---|
| V1 · medir quem perde acesso | **pendente** — a API do banco não respondeu em 25/08 |
| V2 · rótulos do diálogo | **feito** — commit `81494c1` |
| V3 · front respeita `can_edit_own` | **feito** — commit `acb5307` |
| V4 · RLS respeita `can_edit_own` | **escrito, não aplicado** — `20260825150000`, roda por `scripts/apply-visualizar-nao-edita.sh` |

Há ainda uma migration anterior pendente na VM: `20260825140000` (o Gestor do Projeto passa a
ser reconhecido pela via da equipe), por `scripts/apply-gestor-do-projeto-na-via-da-equipe.sh`.
