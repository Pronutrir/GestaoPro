# O tipo gravado é confiável? — medido em 27/08/2026

> Medição pedida no item 2 da Fase 1, **antes** de mudar qualquer coisa.
> **Nada foi alterado.** 741 itens mudam de aparência para todo mundo dependendo
> da resposta, e a decisão não é minha.

---

## A pergunta

A Fase 1 manda `resolveEapKind` parar de deduzir e passar a **ler `item_type`**.
Isso só é seguro se o valor gravado for confiável. Então: das **818 linhas** onde
o gravado discorda do exibido, **qual dos dois lados bate com a posição real do
item na árvore?**

"Posição na árvore" aqui é a regra da própria seção 07 do desenho:

```
raiz              → Fase (se agrupa) · Atividade (se não)
dentro de Fase    → Entrega (se agrupa) · Atividade (se não)
dentro de Entrega → Atividade
dentro de Atividade → Atividade
```

---

## A resposta — e ela não favorece o gravado

Das 818, **57 são marco** (`is_milestone` vence, por desenho). Sobram **761**:

| | linhas | |
|---|---|---|
| o **gravado** está certo | **84** | 11% |
| o **deduzido** está certo | **319** | 42% |
| **nenhum dos dois** | **358** | 47% |

**Ler `item_type` cegamente pioraria 319 linhas e continuaria errado em 358.**

### Os grupos, do maior para o menor

| linhas | gravado | exibido | a posição diz |
|---|---|---|---|
| **358** | fase | entrega | **atividade** |
| **319** | fase | entrega | **entrega** |
| 64 | fase | entrega | fase |
| 13 | atividade | fase | atividade |
| 5 | fase | projeto | fase |
| 2 | atividade | projeto | atividade |

Um único par domina: **741 linhas gravadas como `fase` e exibidas como
`entrega`** — e a posição na árvore concorda com o gravado em apenas 64 delas.

### A causa

**232 dos 848 itens gravados como `fase` não têm filha nenhuma.**

```
2.1.5   Treinamento com Juliana Palacio (Posto de Enfermagem)
1.2.9   Pesquisa com Albertina Proença (RH)
4.4.2   Atribuir R, A, C e I por atividade
5.4.1   Registrar presença e conclusão por participante
3.5.1   Redigir o relatório da instituição
```

Nenhum desses é uma fase. São **atividades** — trabalho que alguém executa — que
receberam `item_type = 'fase'` na importação da EAP, provavelmente porque
`fase`/`atividade` eram os únicos dois valores disponíveis e "fase" virou o
rótulo de qualquer coisa que tivesse código EAP.

O `item_type` nunca foi um campo de decisão: era um efeito colateral da
importação.

---

## O que isto significa para a Fase 1

A instrução era `resolveEapKind` **ler** `item_type`. Como está, ler significa:

- **319 itens** que hoje aparecem certos (Entrega) passariam a aparecer como
  **Fase** — errado;
- **358 itens** continuariam errados, só que de outro jeito;
- **64 itens** melhorariam.

O campo precisa ser **corrigido antes de virar fonte**, e a correção não é
óbvia — daí a pergunta.

---

## As três saídas, e o que cada uma custa

### A · Backfill pela posição, depois ler

Uma migration grava `item_type` a partir da posição na árvore, e só então
`resolveEapKind` passa a ler.

- **Reescreve 761 linhas** de uma vez. Reversível: coluna sombra, como na
  conversão de identificador.
- **Depois disso o campo é confiável** e a regra da seção 07 passa a valer.
- **O risco:** a posição é uma heurística. Um item hoje sem filhas pode ser uma
  fase que ainda não foi preenchida, e viraria "atividade". São **232 candidatos**
  a esse engano.

### B · Backfill só do que é seguro; o resto fica pendente

Converte as **383** linhas onde gravado e posição concordam ou onde a posição é
inequívoca, e deixa as **358** ambíguas marcadas para decisão humana — o mesmo
padrão dos homônimos.

- Não inventa tipo para ninguém.
- **Custo:** 358 itens seguem divergindo até alguém olhar. E `resolveEapKind`
  precisa de um caminho para "não sei", que hoje não existe.

### C · Ler o gravado agora, corrigir depois

Cumpre a instrução literal e aceita que 319 itens piorem de aparência hoje.

- **Não recomendo**, e o número é o motivo: a Fase 1 existe para acabar com a
  divergência, e esta saída aumenta a quantidade de item exibido errado.

---

## O que eu faria, se a decisão fosse minha

**A**, com duas condições:

1. **os 232 "fase sem filhas" saem da conversão automática** e entram na lista
   de pendentes da saída B — são exatamente os que a heurística erra;
2. **coluna sombra** com o `item_type` original, para reverter.

Isso converte ~529 linhas com segurança e deixa 232 marcadas, em vez de chutar
761 ou não mexer em nenhuma.

**Mas é decisão sua.** O que muda de aparência para toda a equipe é diferente em
cada saída, e o número que importa é este: **741 itens hoje aparecem como
"Entrega" e podem passar a aparecer como "Fase" ou "Atividade"**.

---

**Método:** `activities` inteira (8.199 linhas, 2.996 vivas). O tipo deduzido foi
recomputado a partir de `lib/eapModel.ts`; a posição, a partir da regra da seção
07 do desenho. Só `SELECT` — nada foi alterado.
