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

## Correção sugerida, em ordem

1. Um helper `hojeLocalISO()` (`YYYY-MM-DD` do dia **local**) e trocar as ~10
   gravações e ~19 comparações que usam `toISOString().slice(0,10)`.
2. Decidir o tipo de `actual_start_date`/`actual_end_date`: ou migram para
   `date` (acompanham os irmãos), ou passam a receber instante de verdade. Hoje
   são `timestamptz` recebendo dia — o pior dos dois.
3. Ligar `dateValidation.ts` nas três superfícies e apagar as 4 cópias inline.
4. Decidir sobre as datas reais do projeto: criar as colunas ou tirar os campos
   e o BaselineBlock da tela. Hoje prometem e não entregam.
5. Conclusão preencher `actual_start_date` quando estiver vazio.

## Estado da fixture

Subatividade A restaurada: `Previsto 01/09 → 10/09`, datas reais nulas,
`completed_at` nulo. Só o `status` ficou `in_progress` em vez de `pending` —
efeito do próprio botão Reabrir, que não devolve para `pending`.
