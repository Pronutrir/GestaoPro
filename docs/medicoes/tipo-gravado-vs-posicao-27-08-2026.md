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

## ⚠ Contra o que foi medido o "certo" — leia antes da tabela

**A referência foi a própria posição na árvore.** Isso não é uma verdade
externa: é uma terceira regra, escrita por mim a partir da seção 07 do desenho.

Então a linha *"o deduzido está certo em 42%"* significa, com precisão:

> **duas heurísticas concordam em 42% dos casos** — a que a tela usa hoje
> (`hasChildren` + nível do código) e a que eu derivei da seção 07 (posição do
> pai na árvore).

Não significa que o deduzido seja verdade, nem que os 358 "nenhum dos dois"
estejam errados. Significa que **não há árbitro**: o sistema não guarda em lugar
nenhum o que cada item *deveria* ser, porque nunca houve um momento em que
alguém tenha decidido item a item.

O que a tabela mede de verdade é **o quanto o campo gravado se afastou de
qualquer leitura defensável** — e isso basta para a conclusão que importa:
`item_type` não pode virar fonte sem ser corrigido antes. Não basta para
escolher *qual* correção, e é por isso que a decisão foi pedida em vez de
tomada.

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

## A decisão: nenhuma das três — a quarta

**Congelar o que a tela já mostra.** Gravar em `item_type`, para todas as
linhas, o valor que `resolveEapKind` produz com o `hasChildren` **real**.

Não é heurística nova: é a **foto do estado atual**. E resolve o que as outras
três não resolviam:

- **ninguém vê nada mudar** no dia seguinte; nenhum relatório muda de número;
- os **232 "fase sem filhas"** se resolvem sozinhos — sem filha, a dedução já os
  classifica como atividade, que é o que eles são;
- os **319** em que o deduzido acerta continuam certos;
- os **2.076** que mudavam conforme a tela param de mudar;
- e o defeito fatal morre: **criar uma subatividade deixa de mudar o tipo de
  alguém**.

O que a medição acima faz por esta decisão não é escolher o valor certo — é
provar que **ler o campo como está não era opção**. A escolha do valor veio de
outro critério: não mexer no que as pessoas já enxergam.

### As 84 linhas que ficam erradas de propósito

São aquelas em que o gravado original batia com a posição e o congelamento vai
por cima. Elas **não são corrigidas** — viram lista de revisão humana em
`docs/medicoes/tipos-a-revisar-27-08-2026.md`, para depois que a tela permitir
trocar o tipo.

Congelar erra em 84 linhas conhecidas e listadas. Qualquer outra saída erra em
centenas, sem lista.

---

**Método:** `activities` inteira (8.199 linhas, 2.996 vivas). O tipo deduzido foi
recomputado a partir de `lib/eapModel.ts`; a posição, a partir da regra da seção
07 do desenho. Só `SELECT` — nada foi alterado.
