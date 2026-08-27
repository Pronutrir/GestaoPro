# Itens no quadro que não geram cartão — 27/08/2026

> Medição em **todos os projetos**, não só no de teste. Feita antes de escrever
> qualquer coisa, para separar o que está errado do que só parece.

---

## ⚠ A correção que muda o número: 183 → 68

A primeira leitura desta medição chamou os **183** de "presos". **Estava
errado**, e o erro era meu: eu tratei "agrupador ocupando coluna sem gerar
cartão" como defeito, quando para 115 deles **é exatamente assim que o
agrupamento funciona**.

### Os 115 do grupo A NÃO estão presos. São FAIXAS.

Um agrupador no quadro, com filhas no quadro, **desenha a faixa sobre os
cartões delas**. Ele não gera cartão próprio *por desenho* — a regra é a do
CLAUDE.md: *"Fase, Entrega e Pacote nunca viram card no Kanban — viram chip no
card da filha e, opcionalmente, raia."*

Os números confirmam que é o caso normal, não a exceção:

| | |
|---|---|
| grupo A | **115** |
| destes, com filhas **também no quadro** | **115** — todos |
| filhas que eles agrupam | **456** |

**Não mexer neles.** Devolvê-los ao backlog deixaria 456 cartões soltos:
`faixaDoCartao` só devolve agrupador **que esteja no quadro**, então pai na fila
significa filha sem faixa. O "conserto" quebraria o agrupamento de 456 cartões
para resolver um problema que não existe.

> **Se alguém no futuro olhar esta lista e quiser "consertar" os 115: não é
> defeito. É o agrupamento funcionando.** Foi por isso que o CSV passou a
> classificá-los como `FAIXA-correto` em vez de deixá-los na mesma coluna dos
> outros.

---

## O alvo real: 68

Itens no quadro, sem filhas, exibidos como agrupador. **Folhas com rótulo
errado** — são trabalho, e o trabalho não aparece.

| | | |
|---|---|---|
| vivos no quadro (todos) | 990 | |
| marcos | 30 | nunca foram cartão; fora do alvo |
| **faixas legítimas** (grupo A) | **115** | correto, não tocar |
| **ALVO** (grupo B) | **68** | folha exibida como caixa |

### A composição dos 68

Todos estão gravados como `item_type='fase'` hoje. A sombra separa dois casos:

| sombra | quantos | o que significa |
|---|---|---|
| `atividade` | **11** | o `pacote_e_posicao` os converteu em 24/08. **Voltam ao que eram.** |
| `fase` | **57** | sempre foram `fase`. **Mudam de verdade** — e é justificado: são folhas, são trabalho, e nunca deveriam ter sido fase. |

Papel exibido hoje: 57 como Entrega (nível 3 decide por posição), 11 como Fase.

### Onde estão

| itens | projeto |
|---|---|
| 38 | Estruturação do Gerenciamento de Projetos |
| 35 | Guia Jornada do Paciente — Pronutrir Onboard — Desenvolvimento |
| 34 | Gestão de Processos Tasy — Oficial |
| 27 | Gestão de Processos Tasy — excluir |
| 11 | Revitalização do GLPI |
| 9 | Projeto Escritório de Processos |
| 9 | Guia Jornada do Paciente — Pronutrir Onboard |
| ≤4 | e mais 10 projetos |

*(A contagem por projeto acima é dos 183; a lista item a item, já separada por
classificação, está no CSV ao lado.)*

---

## O que a correção destes 68 deve provar

Esta é a prova que **fecha o incidente** — e ela vale mais que a correção em si:

1. **os 68 passam a gerar cartão** — o trabalho reaparece no quadro;
2. **as faixas dos pais deles passam a desenhar** — porque faixa precisa de
   cartão embaixo, e não havia;
3. **o sintoma (a) do Raphael** — *"o quadro não agrupa"* — **desaparece sem
   nenhum conserto próprio.**

> Se as faixas **não** aparecerem com os cartões presentes, aí sim há defeito em
> `faixaDoCartao`, e aí a varredura do sintoma (a) tem sentido. Antes disso, ela
> investigaria uma consequência achando que é causa.

---

**Método:** as 8.199 linhas de `activities`, 314 colunas e 55 projetos.
O estágio deriva da coluna (`estagioDoItem`), não do campo espelho `estagio`.
"Tem filhas" conta só filhas **vivas**. `resolveEapKind` compilado de
`src/lib/eapModel.ts` e chamado de verdade. Só `SELECT`.
