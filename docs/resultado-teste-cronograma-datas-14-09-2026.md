# Cronograma — teste de todas as datas

**Data:** 14/09/2026 · **Base:** produção · **Projeto:** fixture `[TESTE E2E] Acesso v2`
(não o projeto real do print, para não gravar datas de teste nele) · **Usuário:** `e2e-del`

Escopo: só datas e o que se calcula a partir delas — Duração, selo de atraso, Desvio,
Folga Total/Livre, caminho crítico e Gantt. Método: tela + requisição + banco, relógio
do navegador em 14/09 22:30 (UTC já no dia 15) onde o "hoje" do cliente importa.
Nenhum código alterado; fixture restaurada ao final.

---

## Defeitos, do mais grave ao menor

### 1. Editar data no Cronograma salva no banco, mas a tela volta ao valor antigo

Vale para as quatro células de data **e** para o arrasto de barra no Gantt.

| Instante | Célula Térm. Previsto | Banco |
|---|---|---|
| +600ms depois de digitar 11/09 | 11/09 | — |
| +1.500ms | **10/09** (voltou) | **11/09** |

No Gantt, a barra andou 132px (3 dias) e em 1,5s voltou ao lugar; o banco ficou com
11/09 → 12/09. Depois de F5 a tela mostra o banco.

**Causa:** a página do projeto passa `activitiesExternas`. `gravarCampo` e
`saveBarDates` atualizam o estado local e chamam `fetchData()`, que reaproveita o
retrato antigo das atividades da página e sobrescreve a atualização.

**Consequência pior que a visual:** a validação passa a comparar contra o valor velho.
- Recusou com base num início que já não existia ("início (08/09/2026)" quando já era 07/09).
- **Aceitou uma janela invertida:** início real 05/09 contra fim real 03/09 foi gravado,
  porque a tela ainda achava o fim real vazio.

### 2. Folga e caminho crítico com um dia de erro

Os dois cálculos de caminho crítico (o local, da tabela, e o de `lib/criticalPath`, do
Gantt) medem duração como `max(differenceInDays(fim, início), 1)` — exclusivo. Uma
atividade de 01/09 a 30/09 ocupa 30 dias e o cálculo conta 29, o que deixa a sucessora
FS começar no último dia da predecessora.

Cadeia medida: A (01/09–30/09) → B (01/10–15/10) → Atividade Solta, FS com lag 0.

| | Tela | Correto |
|---|---|---|
| Subatividade A — Folga Total | **1d** | 0d |
| Subatividade A — caminho crítico no Gantt | **fora** | dentro |
| P2 (sem dependência) — Folga Total | **36d** | 37d |

Os quatro valores da tela batem exatamente com a conta do algoritmo. A atividade que,
atrasada, atrasa o projeto não aparece como crítica.

### 3. Folga calculada sem dependências nos primeiros ~12–17 segundos

A tabela aparece em ~9s, mas as dependências chegam em +11s a +17s. Nesse intervalo:

| | Antes das dependências | Depois |
|---|---|---|
| Atividade Solta — Folga Total | **20d** | 0d |
| Predecessoras de B e Solta | **—** | 1.1 / 1.2 |

Sem indicação de carregamento — a sucessora crítica aparece com 20 dias de folga.
A RPC `get_task_dependencies` espera `useProjectAccess`, que varre **todas** as
atividades visíveis sem filtro de projeto (7,7s medidos).

### 4. Linha com filhas mostra datas próprias, não a janela derivada

O servidor calcula `derived_start`/`derived_end`, mas o Cronograma lê
`start_date`/`end_date`.

| Item | Tela | Servidor (derivado das filhas) |
|---|---|---|
| Fase de Teste | "Definir" | 02/09 → 15/10 |
| P1 | 04/09 → 01/09 | 02/09 → 08/09 |
| Subatividade A | 01/09 → 30/09 | 09/09 → 30/09 |

É o caso do print: "Fase 01 - Diagnóstico" com 67% e todas as datas em "Definir".

### 5. Janela invertida não é sinalizada

P1 (04/09 → 01/09) aparece com **Duração 1** — o número esconde a inversão. A janela
real invertida do defeito 1 também apareceu sem nenhuma marca.

### 6. "Dependência desrespeitada" só avisa no Gantt

Atividade Solta está planejada para 20/09, mas B só termina 15/10. O Gantt avisa
"1 dependência desrespeitada"; a Tabela detalhada — modo padrão da página — não mostra nada.

### 7. Gravação sem `count: "exact"`

`gravarCampo` e `saveBarDates` não conferem quantas linhas o banco alterou. Uma recusa
por RLS volta 204 sem erro e pareceria sucesso. Hoje o defeito 1 mascara isso (a tela
reverte de qualquer jeito); **corrigir o 1 sem este deixaria uma recusa na tela como salva**.
Os dois precisam sair juntos.

---

## O que está certo

| Teste | Resultado |
|---|---|
| Digitar nas 4 colunas → requisição e banco | `YYYY-MM-DD` exato |
| Término antes do início (estado fresco) | "Data recusada", sem PATCH |
| Limpar data | grava `null` |
| Fim real retroativo com início vazio (gatilho) | início real = fim real (`LEAST`) |
| Duração em dias úteis | 9 de 9 corretas |
| Selo de atraso às 22:30 (UTC já dia 15) | P2, que vence hoje, **não** atrasada |
| Desvio (real 03/09 × previsto 10/09) | −7d |
| Marca de hoje no Gantt às 22:30 | dia 14 |
| "76d atrasado" do cabeçalho (print) | 30/06 → 14/09 = 76 |
| F5 | mostra o banco |

## Não testado

- **Linha de base** — nenhuma atividade da base tem baseline.
- **Feriados** — nenhum cadastrado em set/out. A Duração ignora feriados e o Gantt
  não; a divergência existe no código, mas não aparece com estes dados.
- **Exportação.**

## Registro

`CronogramaFilters.tsx` (filtro "De/Até") não é importado por ninguém — terceiro módulo
morto da leva. A tela não oferece o filtro, então não é defeito visível.

## Ordem sugerida de correção

1. Defeitos **1 + 7** juntos (tela revertendo e contagem de linhas).
2. Defeito **2** — duração inclusiva, num helper único usado pelos dois cálculos.
3. Defeito **3** — não exibir folga/predecessoras antes de as dependências chegarem.
4. Defeito **4** — linha com filhas consome `derived_start`/`derived_end`.
5. Defeitos **5 e 6** — sinalizar janela invertida; aviso de dependência também na Tabela.
