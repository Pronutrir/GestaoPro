# O quadro: agrupador virou faixa — medido em 26/08/2026

> Reprodução do bug relatado, feita **antes** de mudar qualquer linha, e a
> medição do efeito depois.

---

## O relato

1. Promover um pacote do backlog para "Não iniciado" → só o pacote aparece.
2. Mover esse pacote para "Em andamento" → **a fase inteira vai junto**.
3. Mover de volta → **parte dos itens fica, parte volta**, e o agrupamento se perde.

## A reprodução, na base

| | |
|---|---|
| Agrupadores no quadro **como cartão** | **142** |
| Famílias com filhas em **colunas diferentes** | **39** |
| Pai no Backlog **com filha no quadro** | **97** |
| Pai no quadro **com filha no Backlog** | **39** |

Exemplos das famílias partidas — é o "parte fica, parte volta" do passo 3:

| pacote | filhas | espalhadas entre |
|---|---|---|
| Cadastros e funções gerais | **16** | Em Andamento / **Backlog** |
| Fase de Cadastros e Funções Essenciais | 7 | Backlog / Em Andamento |
| Instrução de trabalho | 5 | Em Andamento / Pendências |
| IT - Cadastro de novo medicamento - CAF | 6 | Concluída / Em Andamento |

## A causa: dois caminhos de escrita

Confirmada lendo os dois, como pedido.

**`subirPaisCompletos`** (`ActivityKanban`) — ao mover um cartão, **subia o
ancestral** quando todos os irmãos chegavam à mesma coluna. Escrevia em quem
ninguém moveu. O próprio comentário dela descrevia o mecanismo:

> *"mover um pacote de 10 subatividades chama esta função uma vez por filho…
> `todosLa` dava falso em todas as dez, e o pacote ficava para trás"*

**O diálogo "Levar os N junto"** — ao arrastar um agrupador, **cascateava** coluna
e status para os descendentes, em bloco (`.in("id", emLote)`).

Juntos produzem o vaivém: a ida leva os filhos (cascata), a volta traz o pai
atrás deles (subida), e quem estava em outra coluna fica onde estava.

---

## A regra implementada

`lib/quadroDeExecucao.ts`, com 32 verificações em
`scripts/verificar-quadro-de-execucao.cjs`.

- **Estágio** (backlog | quadro) muda **somente por promoção explícita**, item a
  item. "Levar as subatividades junto" é **perguntado**, nunca automático.
- **Mudar de coluna** escreve **uma linha só**: o cartão movido. Nunca estágio,
  nunca descendente, nunca ancestral.
- **Status de agrupador é derivado** das filhas. Ele não é cartão arrastável —
  é **faixa**.
- **Só Atividade vira cartão.**

### Os cinco testes do relato

| teste | resultado |
|---|---|
| promover pacote → as atividades aparecem sob a faixa dele | ✓ |
| mover 1 atividade → nenhuma outra linha muda de estágio ou status | ✓ |
| mover ida e volta **7×** → o conjunto do quadro é idêntico ao do início | ✓ |
| pacote com filhas em colunas diferentes → faixa inteira, percentual das filhas | ✓ |
| nenhuma tela grava status em agrupador | ✓ |

---

## O efeito, na base real

| | antes | depois |
|---|---|---|
| Itens desenhados no quadro | 992 | **850** |
| — agrupadores que deixam de ser cartão | — | **142** |
| Cartões que ganham **faixa** (pacote promovido) | — | **448** |
| Cartões com pai ainda na fila (sem faixa) | — | 266 |

Os 142 **não somem do quadro**: deixam de ser cartão e passam a ser a faixa
sobre os cartões das filhas. Os 266 sem faixa são atividades cujo pacote
continua no backlog — e não desenhar faixa ali é proposital: anunciar no quadro
uma caixa que ninguém promoveu seria inventar contexto.

## O que muda para quem usa

**Fase, entrega e pacote deixam de ser arrastáveis no quadro.** Ao tentar, o
sistema explica: *"Eles aparecem como faixa sobre as atividades. Mova as
atividades — a faixa acompanha, e o percentual da caixa vem delas."*

O gesto que a cascata oferecia mudou de lugar, não desapareceu: quem quer pôr o
conteúdo de um pacote no quadro **promove**, no backlog, e ali a pergunta
"levar as subatividades junto?" é feita uma vez, por quem decide.

**Método:** a reprodução e a medição do efeito rodam contra a base com
`SELECT` apenas. `lib/quadroDeExecucao` devolve a *lista de escritas* em vez de
executá-las — é o que permite o teste do vaivém comparar conjuntos sem tocar no
banco.
