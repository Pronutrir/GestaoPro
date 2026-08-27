# O congelamento conserta 1.1.1, 1.1.2 e 1.1.3? — 27/08/2026

> Pergunta feita **antes** de aplicar. A leitura do Raphael era que **não**, e
> ele está certo. Mas a alternativa que ele propôs — tirar a dedução por nível —
> também não conserta, e a causa está num terceiro lugar.

---

## 1 · O congelamento não conserta. Confirmado.

Rodando o ciclo com o código real, para `1.1.1` (`item_type='fase'`, nível 3,
sem filhas):

```
1. tela exibe hoje ....... entrega (Entrega)
2. eapToPersisted grava .. { item_type: 'fase', is_milestone: false }
3. tela exibe depois ..... entrega (Entrega)

item_type mudou?  fase -> fase       NÃO MUDOU
papel mudou?      entrega -> entrega NÃO MUDOU
```

A leitura do Raphael estava exata: `eapToPersisted` grava `'fase'` para
qualquer papel agrupador, o nível 3 devolve `entrega` por posição, e o ciclo
fecha em si mesmo. **A foto perpetua a dedução em vez de encerrá-la.**

## 2 · Tirar a dedução por nível também não conserta

Medido nas 8.199 linhas, com a regra "papel vem do campo, o nível não decide
nada":

| | |
|---|---|
| itens que mudam de papel | **392** |
| destes, hoje no quadro | 25 |
| **itens que deixam de ser agrupador** | **0** |

Os 392 mudam de **rótulo**, não de natureza:

```
fase → entrega        370
projeto → entrega      16
projeto → atividade     6
```

`fase` e `entrega` **agrupam os dois**. Trocar um pelo outro não devolve cartão
a ninguém. Para os quatro itens do projeto de teste, o resultado é literalmente
o mesmo: `entrega → entrega`, faixa antes e faixa depois.

## 3 · A causa está no campo, e o campo sempre disse 'fase'

Isolando cada condição:

| situação | papel | |
|---|---|---|
| hoje (campo `fase`, nível 3) | entrega | faixa |
| sem dedução por nível (campo ainda `fase`) | entrega | faixa |
| campo `atividade`, nível 3 | entrega | faixa |
| campo `atividade`, **sem** nível | atividade | **cartão** |

São **duas** condições, e as duas precisam cair. Enquanto o campo disser `fase`,
o item agrupa por causa do campo; enquanto o nível for 3, agrupa por causa da
posição. Tirar uma só deixa a outra em pé.

### E aqui a investigação desmente o que eu vinha supondo

Eu tratava esses quatro como vítimas do `pacote_e_posicao` — a migration de
24/08 que fez `atividade → fase` em 767 itens de nível 3. **Não são.** A sombra
mostra a história completa:

```
1.1    sombra=fase   hoje=fase   já nasceu fase
1.1.1  sombra=fase   hoje=fase   já nasceu fase
1.1.2  sombra=fase   hoje=fase   já nasceu fase
1.1.3  sombra=fase   hoje=fase   já nasceu fase
```

Eles **sempre** foram `'fase'`. Não há estado anterior para o qual voltar, e
nenhuma reversão de migration os liberta — a sombra, que existe justamente para
responder "o que havia antes?", responde: *isto mesmo*.

Isso muda o que o incidente é. Estes quatro **nunca tiveram cartão**, em
nenhuma versão do sistema. O que o build de hoje quebrou foram os **outros**
itens — os de nível 3 gravados como `atividade` que passaram a ser lidos como
Entrega. Os quatro do projeto de teste estavam presos desde antes, e o
incidente apenas os tornou visíveis.

> É por isso que `scripts/incidente-2708-devolver-ao-backlog.sql` existe e
> continua sendo a saída para eles: escrita direta, devolvendo ao backlog. Não
> há conserto de regra que os alcance, porque eles não estão errados pela regra
> — o campo diz que são fase, e sempre disse.

## 4 · Se as duas cirurgias forem feitas juntas

Nível sai **e** o campo volta ao que a sombra registra:

| | |
|---|---|
| itens que deixam de ser agrupador | **771** |

Os 771 são, em essência, os 767 do `pacote_e_posicao` — os que **de fato**
foram convertidos e cujo original a sombra preserva. Para eles a combinação
funciona.

**Mas isso não é uma decisão a tomar durante um incidente.** São 771 itens
mudando de natureza no quadro inteiro, e a base do raciocínio é uma coluna que
foi preenchida por acidente de sequência, não de propósito. Fica registrado
como opção medida, para decisão com o sistema estável.

---

## O que isto significa para o plano

1. **O congelamento não resolve o incidente** — confirmado, e não deve ser
   aplicado com essa expectativa.
2. **Tirar a dedução por nível também não** — a alternativa proposta não
   alcança o problema, embora mude 392 rótulos.
3. **Os quatro do projeto de teste não têm conserto por regra.** A saída é o
   `UPDATE` já preparado.
4. **A reversão do build continua sendo o conserto do incidente**, para os
   demais itens do sistema.

**Método:** as 8.199 linhas de `activities`, com `resolveEapKind` compilado de
`src/lib/eapModel.ts` e chamado de verdade. Só `SELECT`.
