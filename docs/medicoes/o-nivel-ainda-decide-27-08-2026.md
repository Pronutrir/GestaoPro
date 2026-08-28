# O nível ainda decide, e é ele que trava o quadro — 27/08/2026

> Medido **depois** do deploy das 15:55 e da correção dos 68, com o relato de
> produção em mãos.

---

## O relato dizia uma coisa, o banco diz outra

O teste em produção reportou: *"1.1.1, 1.1.2 e 1.1.3 seguem com item_type
'fase'/'entrega'. Aplique a correção dos 68."*

**A correção dos 68 já foi aplicada.** Conferido linha a linha: os 68 estão
gravados como `atividade`, e os três itens citados também.

```
1.1     item_type=fase       coluna=Backlog
1.1.1   item_type=atividade  coluna=Backlog
1.1.2   item_type=atividade  coluna=Backlog
1.1.3   item_type=atividade  coluna=Backlog
```

**Mas o sintoma está certo:** o quadro segue vazio. A causa é outra.

---

## A causa: `resolveEapKind` decide por POSIÇÃO antes de olhar o campo

```ts
const level = eapLevel(item.wbs_code);
if (level !== null) {
  if (eapIsFaseLevel(level)) return "fase";       // nível 2
  if (eapIsProjectLevel(level)) return "projeto"; // nível 1
  if (eapIsPacoteLevel(level)) return "entrega";  // nível 3
}
return agrupa ? "entrega" : "atividade";          // só aqui o campo entra
```

Para `1.1.1` — nível 3, gravado como `atividade`:

| | |
|---|---|
| `item_type` no banco | `atividade` ✓ |
| papel exibido | **`entrega`** |
| é agrupador? | **sim → faixa, não cartão** |

O campo está certo e a tela não o consulta.

## O alcance

**67 folhas** gravadas como `atividade` que a tela ainda exibe como agrupador:

```
nível 2 → 11 itens (exibidos como Fase)
nível 3 → 56 itens (exibidos como Entrega)
```

São exatamente os 67 que a fatia cirúrgica não conseguia libertar — e agora se
sabe por quê: **a fatia consertou o campo, e o campo não é quem decide.**

---

## Por que o chip e a faixa também não aparecem

Mesma causa, e é o que fecha o diagnóstico dos três itens do relato:

- o **chip "No quadro"** conta folhas promovidas. No projeto de teste há **zero**
  — os únicos itens que estiveram no quadro eram agrupadores, e agora nem esses;
- a **faixa "4 de 6"** só mostra os dois números quando parte foi promovida.
  Com ninguém promovido, ela diz "4 no backlog" — que é o comportamento
  correto, não um defeito.

O chip e a faixa **estão no código publicado** (commit `097d46d`, ancestral do
que subiu). Eles não aparecem porque não há o que mostrar.

---

## O que destrava, de verdade

Uma das duas, e ambas são **código**, não migration:

### A · Tirar a dedução por nível (a segunda cirurgia)

`resolveEapKind` passa a ler só o campo. Medido antes: 392 itens mudam de
rótulo (`fase → entrega` 370, `projeto → entrega` 16, `projeto → atividade` 6).
Combinada com a fatia já aplicada, **liberta os 67**.

O custo: muda a regra de tipo do sistema inteiro, e era o que a leva anterior
excluiu do escopo de propósito.

### B · O aviso âmbar, um a um

O seletor de tipo já mostra *"Pela estrutura, este item seria Atividade"* com
conserto em um clique. Quem conhece o item decide.

**Vale manter mesmo depois da correção em massa** — decisão registrada em
27/08. É o que impede o problema de voltar: a correção em massa resolve o
passado, o aviso resolve o futuro.

---

**Método:** `activities` inteira, `resolveEapKind` compilado de
`src/lib/eapModel.ts` e chamado de verdade. Só `SELECT`.
