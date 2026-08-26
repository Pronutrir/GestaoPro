# Inventário — fase 01

Levantado em **25/08/2026**, sobre o código em `src/` e `supabase/migrations/`.
**Nenhum arquivo foi alterado nesta fase.**

Este documento responde os 8 itens da fase 01 e substitui as suposições do kit pelo que o
repositório realmente faz. Onde o kit divergir daqui, ver `DIVERGENCIAS.md`.

---

## O achado que muda a prioridade das fases

**`EditActivityDialog.tsx:593-618` grava o total do pai a partir da lista que o cliente
carregou** — dois `useEffect` que persistem `hours` e `cost` no banco sem interação do usuário,
ao abrir o diálogo.

A lista vem de `fetchSubActivities` (`:905-911`), que é um `select` comum e **passa pela RLS**.
Um usuário restrito recebe menos filhas do que existem.

> Alguém que enxerga 1 de 8 subatividades abre a atividade pai, e o sistema **grava no banco**
> o total de horas e de custo daquela única filha. As outras 7 somem da conta. Ninguém clicou
> em nada; aparece no relatório do mês e não há rastro de quem causou.

É exatamente o cenário que a fase 09 descreve como motivo para a derivação rodar no servidor —
com a agravante de que aqui a distorção é **persistida**, não só exibida.

**Consequência para o plano:** a fase 09 deixa de ser "consolidação" e passa a ser correção de
defeito. Os dois `useEffect` são o primeiro alvo.

---

## 1. Ordem de decisão de acesso

### `podeMutarAtividade` — `src/lib/activityAccess.ts:92-139`

| # | teste | linha |
|---|---|---|
| 0 | `!atividade` → false | :97 |
| 1 | `isAdmin` → true | :98 |
| 2 | `canEdit \|\| canMove` → true | :102 |
| 3 | monta candidatos; vazio e sem `id` → false | :104-110 |
| 4 | `owner` ou `manager` casa → true | :114-116 |
| 5 | **`canEditOwn === false` → false** | :130 |
| 6 | `created_by === id` → true | :133 |
| 7 | `assigned_to` casa → true | :136 |
| 8 | `participants` casa → true | :137-138 |

### `can_update_activity_v2` — migration `20260825150000:38-70`

Um único `EXISTS` com `OR` (avaliação não sequencial): `is_admin_user_v2` → `is_project_leader_v2`
→ `can_member_action('edit')` → `can_member_action('move')` → `is_activity_actor_v2 AND NOT EXISTS(can_edit_own = false)`.

### Divergências

- **Ordem de líder vs. equipe invertida.** No TS a equipe vem antes (`:102` vs `:114`), por
  custo; no SQL o líder vem antes. **Sem efeito no resultado** — ambos são `OR` para `true`.
- **Fonte do líder difere.** No SQL é resolvido pelo banco; no TS é comparação de texto. E no
  Kanban `owner` e `manager` recebem o **mesmo valor** (`ActivityKanban.tsx:999`).
- **DELETE não é coberto** por nenhuma das duas — documentado em `activityAccess.ts:86-90`.

### Onde o Visualizador é aplicado — **fora da função**

- Origem: `AuthContext.tsx:229` — `canWrite = !isViewer`
- Aplicação: `page.tsx:244-247` — multiplica em `canCreate/canEdit/canDelete/canMove`
- `podeMutarAtividade` **não** recebe `canWrite` (decisão explícita, `page.tsx:302-304`)

**Consequência:** um Visualizador que seja responsável passa por `podeMutarAtividade` pela via
do ator. O bloqueio depende de o call-site checar `canEdit` separadamente. **A fase 03 deve
trazer o passo 2 para dentro da função.**

---

## 2. `assigned_to` e `participants`

`assigned_to`: **284 ocorrências / 40 arquivos**. `participants`: **186 / 30**.

### O que quebra se o responsável virar lista

| Categoria | Exemplos |
|---|---|
| Agrupamento | `ActivityKanban.tsx:831-836` (raia), `:851-863` (setor), `:905-919`; `ProjectListView.tsx:81-82`; `BacklogSection.tsx:859-870` |
| Colunas de tabela | `BacklogSection.tsx:1898-1902`; `EditActivityDialog.tsx:3132-3176`; `ProjectFlatList.tsx:363-364`; `KanbanColumn.tsx:600` (sort) |
| Relatórios | `reports/page.tsx:269,286` (CSV — uma atividade conta para **um** membro); `indicadores-lab` (11 pontos); `team/page.tsx` (9 pontos); `csc/page.tsx:540-542` |
| Escrita | `BacklogSection.tsx:1207,1252,3036-3045`; `EditActivityDialog.tsx:1283`; `page.tsx:1116,1970` |
| Filtros `Set.has(string)` | `ActivityKanban.tsx:685,750,711,753,739,928-933` |
| Avatares | ~15 pontos com `useAssigneeAvatarLookup` / `resolveAvatarFromLookup` |

Reforça `DIVERGENCIAS.md` item 1: migrar para lista é caro e o mercado não recomenda.

---

## 3. "Editar apenas as minhas" — **quatro** implementações

1. `ehAtividadeDaPessoa` (`activityAccess.ts:149-164`) — **código morto**, nenhum chamador.
2. `isMineActivity` (`ActivityKanban.tsx:924-939`) — resolve UUID→nome via `profilesMap`.
3. `ehMinha` (closure em `page.tsx:2103-2117`) — só definida quando **não** é gestor/admin.
4. A via do ator dentro de `podeMutarAtividade` (`:133-138`) — **não** resolve UUID→nome.

A unificação do commit `dd045f1` resolveu `canMutateActivity`; **a pergunta "é minha" continua
com quatro respostas**. É trabalho para a fase 03.

---

## 4. Rollup de horas e custo — **21 pontos, 19 no cliente**

**Nenhuma trigger de banco faz rollup de horas, custo, progresso ou datas.** O banco só propaga
`workflow_stage_id` + `status` + `completed_at` (`20260820150000:99-203`).

### Os mais graves

| # | Onde | O quê | Risco |
|---|---|---|---|
| 11 | `EditActivityDialog.tsx:582-603` | horas do pai = soma dos filhos diretos, **PERSISTE** | **grava distorção** |
| 12 | `EditActivityDialog.tsx:607-618` | custo do pai, **PERSISTE** | **grava distorção** |
| 13 | `ProjectCronogramaPanel.tsx:908-949` | progresso — **segunda fórmula** | número divergente |
| 4 | `ActivityKanban.tsx:1728-1774` | horas da subárvore | discorda de #11 |

### Três problemas estruturais

1. **Progresso tem três fórmulas vivas**: `activityProgress.ts:215-426` (média, 1 nível),
   `ProjectCronogramaPanel.tsx:908-949` (soma recursiva) e a do banco (decide coluna, não %).
2. **Profundidade inconsistente**: progresso usa **1 nível**; contagem, custo e datas usam a
   **subárvore inteira**. Um pai com netos mostra os dois números no mesmo card.
3. **O que é persistido são filhos diretos** (#11/#12); o que é exibido é a subárvore (#4).
   Discordam sempre que houver netos.

Também: `hoursStatsByActivity` **ignora `is_milestone`** (`:1742-1770`), apesar de o modelo
dizer que marco não tem horas.

---

## 5. Comentários e histórico

- `activity_comments` — `attachments`, `reply_to_id`, `reactions`, `edited_at` (migration `20260802120000`)
- `audit_log` — `old_data`/`new_data` são `row_to_json` cru, então `workflow_stage_id` é **UUID**
- `activity_stage_transitions` — guarda `from_stage_id`/`to_stage_id`; **nenhuma leitura no front**

**Por que aparece UUID:** `ActivityRegistro.tsx:71-76` traduz a **chave** (`workflow_stage_id`
→ "Etapa"), mas `fmtVal` (`:77-82`) faz `String(v)` — **não traduz o valor**. Mesmo defeito em
`AuditLogPanel.tsx:76-78`.

`activity_stage_transitions` seria a fonte natural com JOIN, e já existe sem ser usada.

---

## 6. Consulta do Kanban

- **Filtro de marco em dois lugares**: `ActivityKanban.tsx:1818` (`semMarcos`) e `:1792-1795`
  (`activitiesSemMarcos`, do commit `0c96834`).
- **Não há filtro que exclua agrupador** — é decisão de produto que ele vá ao quadro
  (`BacklogSection.tsx:1102-1114`).
- `colunasDoQuadro` (`shared.ts:305-308`) — Backlog nunca entra, por regra de código.

### O que a promoção toca no banco

A atividade movida **e os ancestrais**, subindo um nível por disparo do trigger
`trg_filho_recalcula_pai` → `recalcular_coluna_do_pai` (só filhos **diretos**, `:139`). A
recursão vem do próprio UPDATE re-disparando o trigger; o `WHERE` de `:169-171` corta a cascata.

**Não toca a subárvore descendente** — descer é sempre código do cliente
(`BacklogSection.tsx:1241-1257`, `page.tsx:1163-1175`).

> **Correção ao kit e à memória do projeto:** `sincroniza_coluna_do_pai` **nunca existiu como
> objeto**. É um nome errado num comentário (`20260820150000:9`). A função real é
> `recalcular_coluna_do_pai`.

---

## 7. Filtros — **nenhum declarado-e-ignorado**

Kanban: 13 filtros + `onlyMine` + filtro por coluna. Todos consumidos.
Backlog: 8 filtros. Todos consumidos.

**Mas** `soMinhas` é **silenciosamente inerte** para gestores e admins: `ehMinha` chega
`undefined` (`page.tsx:2103-2105`) e o botão nem renderiza.

**Estado morto confirmado:** `useProjectAccess.ts:23` — `projetosSoPorAtividade` é montado
(`:100-113`), retornado (`:216`) e **o setter nunca é chamado**. O hook sempre devolve `Set` vazio.

---

## 8. As cinco colunas → os quatro papéis

| id | create | edit | delete | move | edit_own |
|---|---|---|---|---|---|
| `editar_excluir` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `editar_tudo` | ✅ | ✅ | ❌ | ✅ | ✅ |
| `editar_minhas` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `visualizar` | ❌ | ❌ | ❌ | ❌ | ❌ |

`papelDePermissoes` (`:169-183`) testa `can_delete` → `edit|move|create` → `can_edit_own`.

**28 das 32 combinações são aproximadas:**

- **15** com `can_delete=true` viram `editar_excluir` — **promoção silenciosa** se salvo
- **6** com alguma de edit/move/create viram `editar_tudo` — idem
- **2** (as quatro colunas `false`) são exatas
- Linhas antigas sem `can_edit_own` contam como `editar_minhas` (deliberado, `:178-182`)

A salvaguarda existe (`:153-167`): comparar com `papelOriginal` antes de gravar.

---

## Arquivos para as fases seguintes

**Fase 03 (acesso):** `activityAccess.ts`, `projectRoles.ts`, `page.tsx:244-247,293-307,2103-2117`,
`ActivityKanban.tsx:924-939,998-1009`, `AuthContext.tsx:229`

**Fase 09 (rollup) — prioridade elevada:** `EditActivityDialog.tsx:582-618` **(as duas escritas
implícitas — primeiro alvo)**, `activityProgress.ts:157-173,215-426`, `projectCosts.ts:143-181`,
`ActivityKanban.tsx:658-669,1696-1774`, `KanbanColumn.tsx:497-530,666-696`,
`ProjectCronogramaPanel.tsx:908-981,1027-1037`, `BacklogSection.tsx:1272-1343,1726-1735`

**Fase 08 (feed):** `ActivityRegistro.tsx:71-82,868-889`, `AuditLogPanel.tsx:76-78`

**Bug isolado, pode ser corrigido a qualquer momento:** `useProjectAccess.ts:23,100-113,216`
