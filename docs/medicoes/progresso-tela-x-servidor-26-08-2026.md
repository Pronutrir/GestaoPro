# Progresso: a tela e o servidor não medem a mesma coisa — medido em 26/08/2026

> Medição feita **antes** de trocar `computeActivityProgress` por
> `derived_progress`, como manda a regra. O resultado **impediu a troca**, e é por isso que
> ela está registrada aqui em vez de ter virado commit.

---

## O resultado

**82 dos 581 pais mudariam de número. Em 74 deles a barra CAI** — até **66 pontos
percentuais**, várias de 50% para 0%.

| pai | tela hoje | `derived_progress` | delta |
|---|---|---|---|
| Diagnóstico | 0% | 100% | **+100pp** |
| Fase 01 - Diagnóstico | 66,7% | 0% | **−66,7pp** |
| teste teste | 66,7% | 0% | **−66,7pp** |
| Documentos | 50% | 0% | **−50pp** |
| IT – CADASTRO E IMPORTACAO DE VA… | 50% | 0% | **−50pp** |
| Função cargas | 50% | 0% | **−50pp** |
| IT - CADASTRO DE VERSAO DA CBHPM | 50% | 0% | **−50pp** |
| Instrução de trabalho | 50% | 0% | **−50pp** |
| Agenda de quimioterapia | 50% | 0% | **−50pp** |
| Pré-produção | 50% | 0% | **−50pp** |
| Documento enviado para correções | 50% | 0% | **−50pp** |

Isso não é troca de fonte. É **troca de régua**, e para pior.

---

## Por que caem

As duas fórmulas respondem a perguntas diferentes.

**A tela dá crédito parcial pela posição na coluna.** `subAvanco` pontua cada filha pela
posição no fluxo — a j-ésima de K colunas de trabalho vale `j/(K+1)`. Uma filha em "Em
Revisão" contribui com 75, não com 0. A divisão é por `K+1` justamente para nunca dar 100%
antes da coluna final.

**O servidor é binário.** `derivar_do_pai` pontua cada filha como
`status = 'completed' ? 100 : COALESCE(derived_progress, 0)`. Uma filha em "Em Revisão" —
que não é folha derivada e não está `completed` — contribui com **zero**.

Daí o padrão de 50% → 0%: um pai com filhas em andamento, nenhuma concluída. A tela diz
"metade do caminho"; o servidor diz "nada pronto". **As duas afirmações são verdadeiras** —
sobre perguntas diferentes.

E a linha invertida ("Diagnóstico", 0% → 100%) é o mesmo desencontro pelo avesso: filha
`completed` numa coluna que a tela não classifica como final.

## A parte que já concordava

Nos **485 pais sem horas**, o servidor cai na média simples — o mesmo critério da tela —
e o número não muda. Só os **96 com horas** entram na ponderação. A divergência real vem
da régua por filha, não da ponderação.

---

## O que foi feito, e o que não

**Trocado:** horas do pai (commit `0c020e3`). Medido em 581 pais, **zero divergências**.

**Não trocado:** o progresso. Trocar hoje derrubaria a barra de 74 pais sem que nada
tivesse acontecido no trabalho — o usuário veria números piores da noite para o dia e
concluiria, com razão, que o sistema quebrou.

`computeActivityProgress` também faz coisas que `derived_progress` não faz, e que se
perderiam junto:

- **Pausada/bloqueada** devolve `percent: null` e rótulo "Pausada" — o servidor não tem
  esse estado.
- **Filha cancelada** é excluída da média; se TODAS forem canceladas, o pai volta a
  responder pela própria coluna em vez de cair para 0%.
- **Divergência** rende o rótulo *"concluída com 3 em aberto"* — coluna final com filha
  aberta.
- **Marco** é binário: "Atingido" / "Não atingido", nunca 33%.

Trocar a fonte perderia os quatro.

### `descendantSummaryById` — não tem para onde ir

`KanbanColumn.tsx:497` conta **concluídas x pendentes na subárvore**. O servidor tem
`derived_children` (contagem de filhas diretas vivas), que não é a mesma coisa: nem separa
concluída de pendente, nem desce na árvore. **Não existe coluna equivalente para ler.**
Trocar exigiria derivar `derived_completed` / `derived_pending` no banco — trabalho novo,
não fiação.

---

## Para destravar

Uma decisão de produto, não de código: **o progresso do pai deve dar crédito parcial a
filha em andamento?**

- **Sim** (o que a tela faz hoje) → `derived_progress` precisa aprender a régua por posição
  de coluna, e aí a troca fica segura.
- **Não** (o que o servidor faz) → a queda de 74 barras é intencional e precisa ser
  avisada antes, não descoberta.

Enquanto isso não se decide, `computeActivityProgress` continua sendo a fonte — e continua
sendo **uma só**, que era o objetivo original. Ele já é fonte única das três telas; não há
três fórmulas divergentes aqui.

**Método:** `scripts/medicoes/comparar-progresso-fase09.cjs`, sobre 2.854 atividades vivas
e 309 colunas de produção. Reimplementa `subAvanco` + `percentualAutomaticoDaColuna` a
partir do código real. Reimplementar tem risco — fica registrado como ressalva. Para a
conclusão aqui ("a troca derruba dezenas de barras") a margem é larga: os deltas são de
dezenas de pontos, não de arredondamento.
