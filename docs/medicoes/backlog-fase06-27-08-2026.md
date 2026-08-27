# Fase 06 no projeto de teste — antes e depois · 27/08/2026

Projeto **`6d01b1b3-4ac6-45ad-b255-0818877cd54c`** — *Teste - Revitalização Tasy*.

---

## O "antes" — a composição real

| | |
|---|---|
| itens vivos | **141** |
| agrupadores (fase/entrega/pacote) | **34** |
| atividades | **103** |
| marcos | **4** |
| **todos** na coluna | Backlog |

Colunas do projeto: `Backlog` · `Não iniciado` · `Em Andamento` · `Pendências` ·
`Concluída`.

### O que falta — e por que os dois números da tela são diferentes

| falta | atividades | marcos | agrupadores | **total** |
|---|---|---|---|---|
| prazo | 103 | 4 | 34 | 141 |
| responsável | 103 | — | — | — |

O contador **"falta prazo em 107 · falta responsável em 103"** que aparece hoje
fecha exatamente:

- **107** = 103 atividades + **4 marcos** — marco *tem* data, e sem ela é
  lacuna de verdade;
- **103** = só as atividades — marco **não tem** responsável, e agrupador
  também não conta, porque as datas e o esforço dele são rollup das filhas.

Os 34 agrupadores ficam fora dos dois números de propósito. É a decisão 5
funcionando: *vazio diz o que falta*, e no agrupador "sem prazo" não é falta —
é derivação.

### O que os marcos não têm (e a regra diz que não devem ter)

| | |
|---|---|
| com responsável | **0** |
| com horas | **0** |
| com GUT | **0** |
| sem data | 4 — é a única coisa que se cobra deles |

Nenhum marco carrega campo que não lhe pertence. A base está limpa nesse ponto.

### O agregado que o rodapé vai somar

| | |
|---|---|
| itens de 1º nível | **6** |
| pais com `derived_children` | 34 |
| pais com `derived_hours` | 34 |

Os 34 agrupadores já têm valor derivado **pelo servidor** — o rodapé consome,
não recalcula.

---

## O "depois" — o que muda na tela

As sete decisões já estavam implementadas (commit `94e1ee7`); esta rodada
fechou o que faltava.

| decisão | estado |
|---|---|
| 1 · sem etiqueta de tipo em atividade | ✓ (marco mantém o losango) |
| 2 · status é ponto de 7px | ✓ |
| 3 · GUT só colore de 60 | ✓ (abaixo, número cinza) |
| 4 · números à direita, `tabular-nums` | ✓ |
| 5 · vazio diz o que falta | ✓ ("a definir"; no marco, célula **vazia**) |
| 6 · sem zebra, faixa de grupo | ✓ |
| 7 · subtotal por grupo | ✓ |
| 7b · **total fixo no rodapé** | ✓ novo |
| densidade em dois níveis | ✓ novo (30px / 36px, por usuário) |

**Quatro cores no total**, contando tudo: o ponto de status, o âmbar do GUT
alto, o vermelho do atraso, e o azul da seleção.

---

## Promover ≠ assumir — a pergunta que não pode ser automática

Era automática das **duas** formas erradas, em momentos diferentes:

- a seleção puxava a subárvore inteira **sem pedir**;
- o arrasto no quadro **cascateava** para os descendentes.

As duas somadas produziam o vaivém relatado (ver
`quadro-agrupador-26-08-2026.md`).

Agora a pergunta existe, **nasce desmarcada**, e diz o que vai levar.

### Simulado sobre a "Fase de Planejamento e Lançamento" deste projeto

| | escritas |
|---|---|
| promover **sem** levar junto | **1** — só a fase |
| promover **com** levar junto | **4** — a fase + 3 atividades |
| marcos no lote | **0** |

A pergunta mostra *"3 atividades dentro"* — conta só o que **viraria cartão**.
Marco fora; agrupador intermediário contado à parte, para não dizer "levar 20"
quando são 12 atividades e 8 caixas.

---

## O que **não** foi feito nesta rodada, e por quê

**Navegação por teclado** (setas, `P` promover, `A` atribuir, `D` datas, `N`
nova) e os **presets de coluna por papel**. As duas são interação pura: dependem
de foco, de rolagem e de ordem de tabulação, e a única forma de saber se
funcionam é abrir a tela e usar. Escrevê-las sem navegador produz código que
passa no `tsc` e pode estar quebrado de dez maneiras que nenhuma verificação
detecta — o mesmo risco já registrado para as telas 06/07 na `VALIDACAO.md`.

Ficam para a sessão em que houver a aplicação de pé. **26 verificações**
travam o que foi entregue.

---

**Método:** leitura da base com `SELECT`; a simulação de promoção roda
`lib/quadroDeExecucao`, que devolve a **lista de escritas** em vez de
executá-las — nada foi gravado no projeto de teste.
