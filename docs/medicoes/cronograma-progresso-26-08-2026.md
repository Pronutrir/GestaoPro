# Cronograma: a quarta fórmula de progresso — medido em 26/08/2026

> Medido **antes** de trocar. Diferente do caso do `derived_progress`, aqui a medição
> **autorizou** a mudança: o número muda em 42 pais, e nos 42 muda porque estava errado.

---

## O defeito

`ProjectCronogramaPanel` tinha rollup próprio (`descendantProgressById`) — uma **quarta**
fórmula de progresso, divergente das outras em dois pontos.

**1. Achatava a árvore.** Somava todo descendente no mesmo saco, sem hierarquia: um neto
pesava igual a um filho.

O caso mais claro é **"Execução"** — 8 filhas, **129 netos**. A média era sobre 137 itens,
então as 8 filhas valiam 6% do resultado e os netos, 94%. Uma filha inteira concluída mal
movia a barra; um ramo fundo e parado a dominava.

O Kanban sempre mediu pelas **filhas diretas**, cada uma respondendo pela própria
subárvore. Mesmo pai, dois percentuais, e nenhuma tela "errada" — réguas diferentes.

**2. Não passava as subatividades.** Chamava `computeActivityProgress(stage, stages,
last)` sem o 4º argumento, então cada filha era pontuada só pela coluna dela, ignorando o
próprio avanço interno — exatamente o que esse parâmetro existe para corrigir (medido em
03/08: 703 de 1.317 atividades são filhas, e o cálculo as ignorava).

Os dois defeitos juntos produziam o caso **"Diagnóstico"**: 1 filha em *Backlog*, com
**3 netos todos concluídos**. A régua antiga dava 75%. A nova dá **100%** — o trabalho
está pronto; só a filha ficou numa coluna que ninguém moveu.

---

## O que muda

**42 dos 582 pais mudam de número. 16 sobem, 26 caem. Todos os 42 têm netos** — o que
confirma a causa: sem netos, achatar não muda nada.

| pai | antes | depois | delta | filhas | netos |
|---|---|---|---|---|---|
| Cargas | 17% | 50% | **+33pp** | 1 | 14 |
| Projeto formalmente iniciado | 35% | 10% | **−25pp** | 4 | 16 |
| Documentos | 25% | 50% | **+25pp** | 2 | 18 |
| Documentos | 25% | 0% | **−25pp** | 1 | 3 |
| Diagnóstico | 75% | 100% | **+25pp** | 1 | 3 |
| Cadastro de convênios preços e… | 26% | 50% | **+24pp** | 1 | 20 |
| **Execução** | 42% | 19% | **−23pp** | **8** | **129** |
| Cadastro de operações da nota… | 20% | 0% | **−20pp** | 1 | 4 |
| Como gerar protocolo novamente | 43% | 60% | **+17pp** | 5 | 2 |
| Fluxograma de entrada de notas | 33% | 50% | **+17pp** | 1 | 2 |
| Treinamento quimioterapia | 36% | 20% | **−16pp** | 5 | 39 |
| Ajuste de prescrição | 66% | 50% | **−16pp** | 1 | 21 |

Os 540 restantes não mudam — são os pais sem netos, onde as duas fórmulas coincidem.

### As quedas são corretas

"Execução" cair de 42% para 19% parece piora, e é **correção**. 42% vinha de 129 netos
diluindo 8 filhas. 19% é a média das 8 frentes reais — e é o número que responde "quanto
da Execução está pronto?".

Vale avisar quem acompanha esses pais: **o número muda sem o trabalho ter mudado.**

---

## Por que não usar `derived_progress` aqui

Foi considerado e **descartado na medição**: a régua do banco é binária
(`completed ? 100 : 0`) e derrubaria 74 das 581 barras em até 66pp. Ver
`progresso-tela-x-servidor-26-08-2026.md`.

O Cronograma agora chama `computeActivityProgress` com as filhas diretas — **a mesma
chamada do Kanban**. Não é fonte nova: é a mesma, que já existia, finalmente usada igual
nos dois lugares.

---

## Ressalva do método

`scripts/medicoes/comparar-progresso-cronograma.cjs` reimplementa `subAvanco` e
`percentualAutomaticoDaColuna` fora do React, e a reimplementação **errou na primeira
tentativa**: pontuava a filha só pela coluna, sem os filhos dela, e por isso "Diagnóstico"
aparecia caindo para 0%. O código real faz melhor — passa `subActivities`. Corrigido, o
mesmo caso sobe para 100%.

Fica registrado porque é o risco de reimplementar: **a primeira medição acusava uma queda
que não existia**. A conferência de um caso concreto, no banco, foi o que pegou.
