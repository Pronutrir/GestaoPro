# Auditoria da tipagem e hierarquia da EAP · 27/08/2026

> **Auditoria — nada foi alterado.** As três escritas de teste que aparecem aqui
> foram todas **recusadas pelo banco**, e é justamente o que elas provam.
>
> Base completa: **8.199 atividades**, sendo **2.996 vivas**. Os números abaixo
> são das vivas, salvo indicação.

---

## Resumo em cinco linhas

1. O tipo **não é coluna** — é derivado, e depende de um argumento que **cada
   tela calcula por conta própria**.
2. **2.076 itens mudam de tipo** conforme quem pergunta. É a causa do "Entrega
   no Cronograma, Atividade no Kanban".
3. O `item_type` gravado **discorda do tipo exibido em 818 linhas**.
4. O código EAP é **gravado**, e **não é recalculado ao trocar de pai** — daí
   13 códigos que não derivam do pai e 9 duplicados.
5. O banco **tem** regras de hierarquia, e elas funcionam — mas validam o
   `item_type` gravado, que é justamente o campo que as telas ignoram.

---

## 1 · Onde o TIPO é decidido

**Fonte declarada:** `lib/eapModel.ts` → `resolveEapKind(item, hasChildren)`.
Não existe coluna "tipo do papel EAP": o que existe é `item_type` (texto livre,
com valores `atividade`/`fase`) e `is_milestone` (booleano).

A função decide por três entradas, nesta ordem:

| entrada | efeito |
|---|---|
| `is_milestone` | vence tudo → `marco` |
| `wbs_code` (nível = nº de segmentos) | 1 → `projeto`, 2 → `fase`, 3 → `entrega` |
| `hasChildren` **(argumento de quem chama)** | decide `entrega` × `atividade` no nível 4+ e nos itens sem código |

### O problema: `hasChildren` é responsabilidade de quem chama

São **15 pontos de chamada**, e cada um monta o argumento do seu jeito:

| arquivo | como calcula `hasChildren` |
|---|---|
| `ActivityKanban.tsx:715, 721` | `parentIdsWithChildren.has(a.id)` |
| `BacklogSection.tsx:1016, 2977, 3189` | `childrenByParent.get(id).length > 0` |
| `EapVisual.tsx:253` | `filhos.length > 0` |
| `ProjectCronogramaPanel.tsx:913, 1008` | `childrenByParent…length > 0` |
| `ProjectCronogramaPanel.tsx:1834` | `isGroupRow(a)` — outro critério |
| **`ProjectCronogramaPanel.tsx:3156`** | **`true` fixo** |
| **`ActivityDetailPanel.tsx:77`** | **`false` fixo** |
| `LinkParentDialog.tsx:321` | `all.some(a => a.parent_id === node.id)` |
| `ProjectCharter.tsx:506` | `comFilho.has(it.id)` |
| `EditActivityDialog.tsx:1970` | (calcula no local) |

**Dois deles passam constante**, e são a divergência que você viu:

```
ActivityDetailPanel.tsx:77      resolveEapKind(activity, false)   // sempre folha
ProjectCronogramaPanel.tsx:3156 resolveEapKind(a, true)           // sempre agrupador
```

### Onde divergem, medido

**2.076 itens** recebem um tipo diferente conforme o `hasChildren` passado:

| item | código | painel (`false`) | cronograma (`true`) | real |
|---|---|---|---|---|
| Módulo de autenticação (login…) | — | atividade | **entrega** | atividade |
| Gerenciador de Relatórios | 1.2.3.1 | atividade | **entrega** | atividade |
| Validar modelo de participação | 1.3.1.3 | atividade | **entrega** | atividade |
| Instalar equipamento | 1.5.1.9 | atividade | **entrega** | atividade |

### E o `item_type` gravado discorda do exibido

| `item_type` gravado | tipo derivado | linhas | |
|---|---|---|---|
| `atividade` | atividade | 2.076 | ok |
| `fase` | **entrega** | **741** | ⚠ divergem |
| `fase` | fase | 102 | ok |
| `atividade` | **marco** | 57 | esperado (`is_milestone` vence) |
| `atividade` | **fase** | 13 | ⚠ divergem |
| `fase` | **projeto** | 5 | ⚠ divergem |
| `atividade` | **projeto** | 2 | ⚠ divergem |

**818 linhas divergem** (741 + 13 + 5 + 2 + 57). As 57 de marco são por desenho;
as outras **761 não**.

Isto importa além da tela: a **trigger do banco valida pelo `item_type`
gravado** (ver §6), então a regra que o banco aplica não é a que a tela mostra.

---

## 2 · Combinações pai→filha que existem hoje

| ocorrências | pai | filha | |
|---|---|---|---|
| **1.891** | entrega | atividade | o caso normal |
| **547** | fase | entrega | normal |
| **127** | entrega | entrega | aninhamento profundo |
| **39** | fase | marco | normal |
| **33** | projeto | fase | normal |
| **11** | fase | **fase** | ⚠ ver abaixo |
| **1** | entrega | **fase** | ⚠ |
| **1** | entrega | **projeto** | ⚠ |

### As 11 de `fase → fase`

Não são erro de dados — são a **convenção `.0`** que o `eapLevel` não entende:

```
2.0  SIMULAÇÕES              ->  2.1  Simulação do Ambiente em base teste
4.0  ENTRADA EM PRODUÇÃO     ->  4.4  Encerramento do Projeto
1.0  ESTUDO DA FERRAMENTA    ->  1.1  Instalação do GLPI (novo)
```

`2.0` e `2.1` têm ambos **dois segmentos**, então os dois viram "fase". São
**7 códigos** terminados em `.0`, em **3 projetos**. Quem escreveu usou `.0`
como "cabeçalho do capítulo"; o código lê como "irmão".

### As 2 restantes

- `entrega → projeto`: pai *"Fase 01 - Diagnóstico"* (sem código) com filha de
  código **`1`** — um segmento, logo "projeto". É a atividade *"teste 02"*.
- `entrega → fase`: `1.3.13 Treinamento: Enfermagem` → `1.4 Adm. Eletrônica…` —
  o código da filha **não deriva do pai**.

---

## 3 · O código EAP

**É gravado**, coluna `wbs_code` (text). Não é calculado na exibição.

**Quem escreve:** só dois lugares — a criação rápida no Backlog
(`BacklogSection.tsx:1833`) e o diálogo `RenumerarEapDialog`, que é **manual**
(botão no menu do Backlog).

### Trocar de pai NÃO recalcula nada

`LinkParentDialog` grava exatamente:

```ts
const payload = { parent_id: …, phase_id: … };
```

Nem `wbs_code` do item, nem dos irmãos — nem do antigo pai, nem do novo. A
renumeração existe, mas é **um gesto separado que alguém precisa lembrar de
fazer**.

### O estado hoje

| | |
|---|---|
| Códigos **duplicados** no mesmo projeto | **9 linhas** |
| Códigos que **não derivam do pai** | **13** |
| Grupos de irmãos **com buraco** na numeração | **2** de 514 |
| Itens **sem código** (fora marcos) | **721** de 2.939 |

Duplicados encontrados: `1.4` ×2, `1.2.1.8` ×3, `1.2.1.9` ×2, `1` ×2.

Os 721 sem código são o esperado: item criado no Kanban/Backlog nasce sem
código, e `resolveEapKind` trata esse caso (cai em `agrupa ? entrega : atividade`).

**Os buracos quase não existem — 2 em 514.** O problema real não é buraco: é
prefixo quebrado depois de mover.

---

## 4 · Marco

**57 marcos vivos.**

| | | |
|---|---|---|
| com código EAP | **0** | ✓ a CHECK do banco impede |
| com filhas | **0** | ✓ a trigger impede |
| com horas | **0** | ✓ |
| com custo | **0** | ✓ |
| **com responsável** | **11** | ⚠ o modelo diz que não tem |
| **com GUT** | **2** | ⚠ idem |
| na raiz (sem pai) | 18 | permitido pelo modelo |

Os campos que o **banco** protege estão limpos. Os que só a **tela** protege —
responsável e GUT — têm 13 registros preenchidos. A tela parou de oferecê-los
(commit `6ace54d`, ontem), mas **o dado antigo continua lá**: nada apaga.

---

## 5 · Profundidade da árvore

| nível | itens |
|---|---|
| 0 (raiz) | 346 |
| 1 | 776 |
| 2 | **1.442** |
| 3 | 202 |
| 4 | 62 |
| 5 | 105 |
| 6 | 36 |
| 7 | 27 |

**Profundidade máxima: 7.** Sem órfãos (pai ausente) e sem ciclos.

> O recuo do Backlog tem **teto de 4 níveis** (`recuoDaLinha`, comentado como
> "além disso o título perde a tela"). Os **168 itens** nos níveis 5–7 são
> desenhados no mesmo recuo do nível 4 — legíveis, mas indistinguíveis entre si
> pela indentação. O código EAP continua dizendo a profundidade real.

---

## 6 · O banco impede alguma combinação?

**Sim** — e as regras estão **vivas**, conferido por escrita de teste (as três
foram recusadas):

| regra | migration | teste |
|---|---|---|
| Marco não pode ter `wbs_code` | `20260811140000` | `23514` — recusado |
| Item não pode ser pai de si mesmo | `20260722160000` | `23514` — recusado |
| Marco não pode conter subitens | `20260722160000` | `23514` — recusado |
| Pai precisa ser agrupador (Fase/Pacote) | `20260722160000` | idem |
| Pai de outro projeto | `20260722160000` | — |
| Ciclo em `parent_id` | `20260722160000` | — |
| Item com subitens não vira marco | `20260722140000` | — |

Mensagens reais devolvidas pelo banco:

```
"Uma atividade não pode ser pai de si mesma."
"Aninhamento EAP inválido: uma marco (atividade) não pode conter subitens.
 Só Pacote ou Fase agrupam."
```

### O furo: a trigger valida o campo que a tela ignora

```sql
IF NOT public.eap_is_group(parent_row.item_type, parent_row.is_milestone) THEN
```

Ela lê **`item_type`** — o campo gravado. As telas decidem por
`resolveEapKind`, que usa `wbs_code` + `hasChildren` e **pode discordar em 761
linhas** (§1).

Consequência prática: um item exibido como "Atividade" pode aceitar filhas
(porque tem `item_type = 'fase'` gravado), e um exibido como "Entrega" pode
recusá-las. A tela não erra o desenho — ela e o banco respondem a perguntas
diferentes.

---

## O que eu recomendaria olhar primeiro

1. **`hasChildren` fixo em dois lugares** (`ActivityDetailPanel.tsx:77`,
   `ProjectCronogramaPanel.tsx:3156`) — é a correção mais barata, e mata a
   divergência visível.
2. **Uma fonte só para o tipo.** Enquanto `item_type` e `resolveEapKind`
   coexistirem, banco e tela seguem discordando em 761 linhas.
3. **Renumerar ao mover**, ou aceitar que o código é histórico e parar de
   derivar hierarquia dele. Hoje é o pior dos dois: derivamos, mas não mantemos.
4. Os **13 registros de marco** com responsável/GUT — decidir se limpa ou se
   fica como legado.
5. A convenção **`.0`** — 7 códigos que o `eapLevel` lê errado.

---

**Método:** leitura completa de `activities` (8.199 linhas, paginada). O tipo
derivado foi recomputado a partir de `lib/eapModel.ts`. As três escritas de
teste do §6 foram feitas contra registros reais e **todas recusadas** pelo
banco — nenhum dado foi alterado.
