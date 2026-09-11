# Campos de data — resultado do teste

**Data:** 11/09/2026 · **Base:** produção (`gestaopro.pronutrir.com.br`) ·
**Fixture:** `[TESTE E2E] Acesso v2`, Subatividade A · **Usuário:** `e2e-del`

Método: navegador com fuso `America/Sao_Paulo` e relógio fixado em **11/09 22:30
local** (= 12/09 01:30 UTC), dentro da janela em que o dia em UTC já virou. Cada
campo conferido em três lugares — o que a tela mostra, o que a API enviou, o que
o banco guardou — mais F5. Toda medição tem controle positivo ao meio-dia.

---

## 1. Concluir entre 21:00 e a meia-noite grava o dia seguinte — CONFIRMADO

A mesma ação, o mesmo botão, dois horários:

| Hora local do clique | O que a API enviou | O que a tela mostra |
|---|---|---|
| 11/09 **12:19** | `actual_end_date: "2026-09-11"` | `— → 11/09/2026`  ✅ |
| 11/09 **22:30** | `actual_end_date: "2026-09-12"` | `— → 12/09/2026`  ❌ |

Causa: `new Date().toISOString().slice(0, 10)` devolve o dia em **UTC**. Em São
Paulo (UTC−3), das 21:00 à meia-noite isso já é amanhã.

O detalhe que fecha o diagnóstico: no **mesmo clique**, `completed_at` foi
gravado com `toISOString()` inteiro — `2026-09-12T01:30:00Z`, que é 11/09 22:30
em São Paulo, **correto**. Os dois campos nascem juntos e discordam em um dia.

E no banco o valor gravado é `2026-09-12 00:00:00+00`. Convertido para São Paulo
isso é **11/09 21:00** — ou seja, um `SELECT` com fuso lê 11/09 e a tela lê
12/09, na mesma linha. Relatório SQL e interface não batem.

**Alcance:** a expressão aparece em ~10 pontos que gravam campo de data de
negócio (`ActivityKanban` ×2, `EditActivityDialog` ×2, tela da atividade,
`BacklogSection`, defaults de projeto, `meeting_date`, `effective_from`) e em
~19 que calculam "hoje" para comparar ou filtrar — nesses, das 21:00 à
meia-noite "hoje" é amanhã, e um item que vence hoje aparece como atrasado.
Outros 3 usos são inofensivos (nome de arquivo baixado).

## 2. Realizado é um par que só tem metade — CONFIRMADO

Concluir grava `actual_end_date` e nunca `actual_start_date`. A tela mostra
`Realizado — → 12/09/2026`. Reabrir devolve `status: in_progress` sem preencher
o início, e a tela passa a dizer **"não começou"** para uma atividade em
andamento.

O campo é gravável por outros caminhos (diálogo da atividade, Cronograma,
importação — 437 atividades têm início real em produção). Quem não preenche é
o caminho de conclusão.

## 3. Intervalo invertido aceito na tela da atividade — CONFIRMADO

Digitei início **14/09** com término **10/09**. Gravou, recarregou e continuou
lá: `Previsto 14/09/2026 → 10/09/2026`, sem nenhum aviso na tela.

A regra existe — mas em cópias inline, e não em todo lugar:

- `EditActivityDialog` valida (3 cópias próprias: linhas 1248, 3391, 3417) ✅
- `ProjectCronogramaPanel` valida (cópia própria, linha 1731) ✅
- `TelaDaAtividade` / `EditorDeJanela` **não valida** ❌
- `src/lib/dateValidation.ts` — o módulo que deveria concentrar a regra — é
  **código morto: zero importações no repositório inteiro**

## 4. Datas reais do PROJETO não existem no banco — CONFIRMADO

`EditProjectDialog` e `AddProjectDialog` mostram os campos **"Data de Início
Real"** e **"Data de Término Real"**. A tabela `projects` não tem essas colunas.
O save tenta, o PostgREST recusa, o código descarta a coluna e segue com um
aviso genérico. O valor digitado some e o campo reabre vazio, sempre.

Pelo mesmo motivo, `BaselineBlock` (dentro do TAP) lê cinco colunas
inexistentes — `actual_start_date`, `actual_end_date`, `baseline_start_date`,
`baseline_end_date`, `baseline_frozen_at`. `projects` não tem **nenhuma** coluna
de baseline. O bloco "Previsto × Real × Desvio" só consegue renderizar
"Previsto"; Real e Desvio são estruturalmente impossíveis.

Isso confirma o que o CLAUDE.md já registra: *"o Financeiro tem linha de base e
o Cronograma não. Enquanto for assim, atraso é opinião."*

## 5. O que está CERTO (controle positivo)

- **Previsto** (`start_date`/`end_date`, colunas `date`): digitei 14/09 e 20/09
  às 22:30 e o caminho inteiro ficou correto — API `{"start_date":"2026-09-14"}`,
  banco `2026-09-14`, tela `14/09/2026`, estável após F5.
- **`DateField`** (o campo pt-BR com máscara dd/mm/aaaa) monta a data por
  componentes locais com hora 12 — imune a fuso. Sólido.
- **`lib/dataLocal.ts`** trata corretamente coluna `date`.
- **`estaAtrasado`** usa `hojeLocal()`; o atraso no Backlog está certo.

---

## Causa raiz comum

Dois tipos para a mesma ideia. `start_date`/`end_date` são `date`;
`actual_start_date`/`actual_end_date` são `timestamptz` — campos irmãos na tela,
mesmo significado (um dia), tipos diferentes. O código trata os dois como texto
`YYYY-MM-DD`: grava dia-UTC no `timestamptz` e lê de volta com `.slice(0, 10)`,
que devolve o dia em UTC. Escrita e leitura erram na mesma direção, então a tela
parece coerente consigo mesma — e discorda do banco.

## O QUE FOI CORRIGIDO (11/09/2026, commit 217b169)

### Já no código — basta publicar

1. **Dia local em vez de dia UTC.** Três helpers novos em `lib/dataLocal.ts`
   (`diaLocalISO`, `hojeLocalISO`, `diaLocalDe`) e as **32 ocorrências**
   trocadas em **18 arquivos**. Nenhum `toISOString().slice(0, 10)` restou no
   `src/`.
   Conferido nas bordas da janela: 20:59 → 11/09, 21:00 → 11/09, 23:59 → 11/09.
   Antes, os dois últimos davam 12/09.
2. **Feed da atividade.** `agruparPorDia` passou a usar o dia local. O efeito
   era pior do que perder o rótulo "Hoje": às 22:30 tudo que acontecera mais
   cedo no mesmo dia virava "Ontem".
3. **Validação de intervalo centralizada.** `dateValidation.ts` deixou de ser
   código morto; as 4 cópias inline (3 no `EditActivityDialog`, 1 no
   Cronograma) foram apagadas; o `EditorDeJanela` da tela v2 passou a validar
   o par. Os dois campos viraram controlados, com a gravação **represada**
   enquanto o par está inconsistente — sem isso, corrigir o término gravaria
   só o término e o início digitado antes se perderia em silêncio.
   O módulo agora recorta o dia antes de comparar, porque
   `"2026-09-14T00:00:00+00:00" > "2026-09-14"` acusaria inversão no mesmo dia.
4. **`BaselineBlock`.** O comentário dizia que o bloco permite congelar a linha
   de base. Não permite e nunca permitiu — não há botão, e `canManage` chega
   sem ser lido.

`tsc` limpo, `next build` passa, zero problemas novos de lint.

### Escrito, mas AINDA NÃO APLICADO no banco

As duas migrations estão no repositório e prontas. Aplicá-las mexe no schema de
produção, e isso precisa de aprovação explícita.

- **`20260911160000_datas_reais_viram_date.sql`**
  `actual_start_date`, `actual_end_date`, `baseline_start_date`,
  `baseline_end_date` passam de `timestamptz` para `date`.
  Conversão por `AT TIME ZONE 'UTC'` **de propósito**: preserva o dia que a tela
  já mostra hoje, em vez de "consertar" o passado e deslocar as linhas um dia.
  Verificado antes de escrever: **0 linhas** com hora diferente de 00:00, e
  **nenhuma** view, função, índice ou default depende dessas colunas — a
  conversão é exata. Há uma guarda que recusa a migration se outro ambiente
  tiver hora de verdade guardada ali.
  Traz também `trg_marcar_inicio_real`, que carimba o início real **no banco** —
  são seis telas que concluem, e repetir a regra nas seis é o que o CLAUDE.md
  proíbe. Só marca na transição para `in_progress`/`completed`, e o `LEAST`
  impede que a correção crie a janela invertida que a outra metade arrumou.

- **`20260911160100_projeto_ganha_datas_reais.sql`**
  `projects` ganha `actual_start_date` e `actual_end_date` como `date`.
  As três colunas de baseline **não** entram: congelar linha de base é decisão
  de produto da segunda onda e hoje não há botão — criá-las agora só produziria
  colunas permanentemente nulas. Sem elas, `endVariance()` usa o previsto como
  referência, que é o ramo já escrito para este caso.

Como aplicar (os arquivos já estão em `/tmp/m1.sql` e `/tmp/m2.sql` no
container do banco):

```
docker exec -e PGPASSWORD="$SENHA" supabase-db-1 \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /tmp/m1.sql
docker exec -e PGPASSWORD="$SENHA" supabase-db-1 \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /tmp/m2.sql
```

Ordem importa: publicar o código **antes** das migrations é seguro (o código
novo manda `"2026-09-11"`, que o `timestamptz` aceita e passa a guardar o dia
certo). Aplicar as migrations antes de publicar também é seguro (todo leitor
faz `.slice(0, 10)`, que funciona nos dois formatos). Não há janela ruim.

## Estado da fixture

Subatividade A restaurada: `Previsto 01/09 → 10/09`, datas reais nulas,
`completed_at` nulo. Só o `status` ficou `in_progress` em vez de `pending` —
efeito do próprio botão Reabrir, que não devolve para `pending`.

---

# Validação das correções (11/09/2026)

Ambiente: **build de produção rodando local** (`next start`, porta 3123) contra
o **banco real**, projeto-fixture `[TESTE E2E] Acesso v2`, Subatividade A,
usuário `e2e-del`. Relógio do navegador em **11/09 22:30** local — a página
confirmou `dia-UTC = 2026-09-12` antes de cada ação.

Nota de método: o relógio fixo tem que ser aplicado **depois** de a tela
carregar. Aplicado antes, o carregamento não conclui no build local (5 botões
na tela em vez de 22) — `Date.now()` congelado trava algo no caminho de
carga. Em produção isso não aparecia porque os chunks chegam antes.

| O que | Antes | Depois |
|---|---|---|
| Concluir às 22:30 → API | `actual_end_date: "2026-09-12"` | `"2026-09-11"` ✅ |
| Concluir às 22:30 → tela | `Realizado — → 12/09/2026` | `— → 11/09/2026` ✅ |
| `completed_at` no mesmo clique | `2026-09-12T01:30:00Z` | inalterado, correto |
| Janela invertida `14/09 → 10/09` | grava, sobrevive ao F5, sem aviso | **recusada**: erro inline, "ok" desabilitado, **zero PATCH** ✅ |
| Corrigir o término depois da recusa | — | **um** PATCH `{"start_date":"2026-09-14","end_date":"2026-09-20"}` ✅ |

## Um defeito novo, encontrado pela validação

A primeira versão da correção gravava campo a campo e encadeava dois `await`
quando as duas pontas mudavam. Como cada gravação termina com `await
carregar()` — um refetch que remonta a tela —, a promessa do primeiro `await`
não resolvia e a segunda gravação nunca saía. Partindo de `14/09 → 20/09`,
corrigir para `25/09 → 30/09` gravava só o início e deixava o banco em
`25/09 → 20/09`: a janela invertida que a validação existe para impedir.

Não havia erro no console nem promessa rejeitada — a chamada ficava pendurada,
que é por que nada disso aparecia. Corrigido em `474c36f`: a janela grava as
duas colunas num PATCH só (`gravarJanela`), e não há o que encadear.

## O que a validação NÃO cobriu

As migrations continuam **não aplicadas**, então seguem sem verificação:

- O tipo das colunas. O valor gravado agora é o dia certo (`"2026-09-11"`), mas
  a coluna ainda é `timestamptz` e guarda `2026-09-11 00:00:00+00` — que lido
  no fuso de São Paulo é **10/09**. A tela e o SQL ainda discordam; o que mudou
  é que agora a tela está certa. Só a migration fecha isso.
- O carimbo do início real: `actual_start_date` continua nulo depois de
  concluir, e o "Realizado" segue sendo `— → 11/09/2026`.
- As datas reais do projeto.

Também não medi o **overlap** do editor aberto com a coluna "Realizado" ao
lado — a linha de edição é mais larga que a coluna fechada. É anterior a este
trabalho (os dois campos e o "ok" já eram assim) e ficou de fora de propósito.

---

# Migrations aplicadas (11/09/2026)

Aplicadas em produção, nesta ordem, com `ON_ERROR_STOP=1`.

## Conferência da conversão

Antes de aplicar, gravei uma **assinatura dos dias** — o md5 de todos os pares
`(id, dia de actual_start_date, dia de actual_end_date)` lidos como a tela os lê
hoje. Depois da conversão, recalculei a mesma assinatura sobre as colunas já
convertidas:

```
antes:  e62332e84228935b58f31f54afacb744
depois: e62332e84228935b58f31f54afacb744
```

Idênticas — **nenhuma linha mudou de dia**. Contagens preservadas: 487 com
início real, 590 com fim real. A guarda da migration confirmou 0 linhas com
hora antes de converter.

| Coluna | Antes | Depois |
|---|---|---|
| `activities.actual_start_date` | `timestamptz` | `date` |
| `activities.actual_end_date` | `timestamptz` | `date` |
| `activities.baseline_start_date` | `timestamptz` | `date` |
| `activities.baseline_end_date` | `timestamptz` | `date` |
| `projects.actual_start_date` | *não existia* | `date` |
| `projects.actual_end_date` | *não existia* | `date` |

## O gatilho, medido

Concluir às 22:30 com as migrations aplicadas:

```
API      {"status":"completed","actual_end_date":"2026-09-11",
          "completed_at":"2026-09-12T01:30:00.000Z"}
banco    status=completed
         actual_start_date = 2026-09-11   <- carimbado pelo gatilho (era nulo)
         actual_end_date   = 2026-09-11   <- data pura, sem fuso
```

O que fecha o caso do relatório original: `actual_end_date` não é mais
`2026-09-11 00:00:00+00` — que lido no fuso de São Paulo dava **10/09**. Agora
é uma data, e SQL e tela dizem a mesma coisa.

## Um defeito a mais, achado ao testar o `LEAST` do gatilho

Para exercitar a trava que impede o gatilho de criar janela invertida, tentei
gravar um término real retroativo pelo diálogo da atividade. O diálogo aceitou
**início real 11/09 com término real 03/09** e gravou.

`dateRangeInvalid` sempre olhou só o par PREVISTO. Os dois chips do bloco
"Real" não tinham validação nenhuma — e o gatilho não alcança este caso de
propósito, porque ele só age quando o início está vazio; aqui o início existe e
quem o inverteu foi a digitação.

Corrigido: `realRangeInvalid` usando o mesmo `isDateRangeInvalid`, com os chips
marcados e o salvar bloqueado. Medido depois da correção: erro inline visível e
**nenhum PATCH** ao tentar salvar.

## Produção continua funcionando

Produção ainda roda o código ANTIGO sobre o schema novo. Conferido depois de
aplicar: a atividade abre, as datas aparecem certas, zero erro de página e zero
resposta HTTP ≥ 400. O código antigo manda `"2026-09-12"` numa coluna `date`
(aceito) e lê com `.slice(0, 10)` (funciona nos dois formatos). O que continua
faltando lá é só a correção do dia local, que entra na próxima publicação.
