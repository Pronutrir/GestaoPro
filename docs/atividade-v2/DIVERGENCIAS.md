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
| V1 · medir quem perde acesso | **FEITO** — 95 membros, 7 só-leitura, **0** com `can_edit_own=false`: ninguém perde acesso |
| V2 · rótulos do diálogo | **feito** — commit `81494c1` |
| V3 · front respeita `can_edit_own` | **feito** — commit `acb5307` |
| V4 · RLS respeita `can_edit_own` | **escrito, não aplicado** (conferido: não consta em `schema_migrations`) — `20260825150000`, roda por `scripts/apply-visualizar-nao-edita.sh` |

A migration `20260825140000` (Gestor do Projeto na via da equipe) **JÁ FOI APLICADA** — consta
em `schema_migrations` e `can_member_action` responde. Não há prova empírica isolada do
caminho do gestor: os 7 projetos com `manager` têm o gestor também como admin ou membro.

---

## 6. A especificação do Marco  ·  três acertos e duas contradições

A terceira versão do kit trouxe uma spec detalhada de Marco. **A maior parte é ganho real e
foi incorporada às fases 04, 06 e 09.** Dois pontos, porém, contradizem decisões documentadas.

### O que foi incorporado (não existe hoje, e vale)

| Regra | Estado |
|---|---|
| Marco **estende o término previsto do pai** (a fase vai até o marco) | não existe — fase 09 |
| Marco **conta como filha aberta** (pai não conclui com marco pendente) | não existe — fase 09 |
| Marco **recusa** gravação de horas, em vez de aceitar e somar | não existe — fase 09 |
| GUT **ausente, não vazio** — e os chips *Sem responsável* / *Sem prioridade* **excluem** marcos | não existe — fase 06 |
| Fechamento **por confirmação** de quem tem `canEditPlanejamento`, com volta a *proposto* se a predecessora reabrir | não existe — fases 04 e 09 |

O achado do GUT é fino: hoje um marco sem GUT ficaria listado para sempre num filtro
"Sem prioridade" como pendência que nunca fecha. Vazio num Atividade quer dizer "ainda não
avaliado"; num Marco quer dizer "não se aplica".

### Contradição A — "Marco tem código EAP próprio"

**O código diz o contrário**, e com justificativa datada de 11/08/2026 em `lib/eapModel.ts`:

> *"MARCO NÃO TEM CÓDIGO EAP. Marco é elemento do CRONOGRAMA, não da EAP: um ponto no tempo,
> sem duração, sem horas e sem custo. A EAP decompõe TRABALHO, e a regra dos 100% diz que os
> filhos somam 100% do trabalho do pai — somar um marco nessa conta é ruído."*

Dois custos concretos estão registrados: a numeração do trabalho ganhava **buracos** (apagar
"1.1.1.3 Marco" deixava um vão entre 1.1.1.2 e 1.1.1.4), e mover o marco obrigava a
**renumerar vizinhos** por uma posição que não representa entrega nenhuma.

`eapCodeAllowed()` e `wbsCodeParaBanco()` são a fonte única disso — todo caminho que grava
código passa por lá, e devolve `null` para marco.

O kit também diz que o marco é "filho de Fase ou Entrega". O código permite mais: o marco
**pode ficar na raiz, sem pai** — *"Go-live é do projeto inteiro, não de uma fase específica"*.

**Resolução:** mantido o que o código faz. O marco continua **ancorado** por `parent_id` (é o
que lhe dá contexto e propaga datas) e **sem** `wbs_code`. As regras de derivação do kit
funcionam iguais com essa ancoragem — nenhuma delas depende do código EAP.

### Contradição B — "peso zero, sempre" no progresso

O kit diz que o marco não entra no peso do progresso. **Hoje ele entra como 0 ou 100**
(`activityProgress.ts:168`), com o comentário: *"marco entra na média como 0 ou 100, nunca
pelo meio — arrastá-lo para 'Em Revisão' não realiza meio marco."*

As duas leituras são defensáveis:

- **Peso zero** (kit): o progresso mede trabalho, e marco não é trabalho.
- **0 ou 100** (hoje): o marco é um compromisso de calendário, e uma fase com o marco pendente
  não está 100%.

**Não resolvi.** É decisão de produto, e as duas são coerentes. Está anotada na fase 09 como
pendência explícita — o importante é que **as duas regras que o kit acrescenta**
(marco estende o término do pai, e marco conta como filha aberta) valem **nas duas leituras**.

---

## 7. "Agrupador nunca vira card" contradiz a decisão de 13/08  ·  fase 04

O `CLAUDE.md` do kit diz: *"Fase, Entrega e Pacote **nunca** viram card no Kanban — viram chip
na filha e, opcionalmente, raia. Só itens do tipo Atividade viram card."*

**O repositório decidiu o contrário, e registrou o porquê** (`BacklogSection.tsx:1102-1114`):

> *"O AGRUPADOR VAI JUNTO (13/08/2026). Era `idsFolhaSelecionados()`: a fase/entrega ficava de
> fora, sob o argumento de que 'agrupador não vive numa coluna do Kanban'. Só que a decisão de
> produto mudou — o que é mandado para o quadro aparece no quadro, agrupador inclusive — e o
> efeito era o relatado: você move uma fase inteira, as tarefas vão e a fase fica para trás no
> Backlog."*

O medo que sustentava a regra antiga já foi endereçado: o percentual do agrupador é a média
dos filhos e **ignora a própria coluna** (`isGrouper` em `activityProgress`). Mover a caixa não
move o conteúdo, e o número não mente.

**Resolução: mantido o que o código faz.** Agrupador continua indo ao quadro quando alguém o
manda. Reverter isso traria de volta um defeito relatado por usuário — a fase que fica para
trás — para satisfazer uma regra escrita antes daquela decisão.

**O que da fase 04 continua valendo, e foi feito:**

- **Marco nunca vira card** — já era regra e já está implementado (dois filtros, commit `0c96834`).
- **Promover move só a atividade escolhida**, nunca ancestrais nem subárvore.
- O campo `estagio` como espelho (migration `20260826140000`).

**O que NÃO foi feito, e por quê:** o item 3 do prompt (chip da fase no card, "Agrupar por"
com raia) é reescrita de interface no `ActivityKanban.tsx`, que tem 4.000+ linhas. Sem poder
executar a aplicação, uma mudança dessa natureza é escrita às cegas — e o agrupamento por
responsável já existe hoje (`ActivityKanban.tsx:831-836`). Fica para quando houver como testar
as duas pontas.
