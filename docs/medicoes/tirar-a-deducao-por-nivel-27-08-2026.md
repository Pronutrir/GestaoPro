# Tirar a dedução por nível — a medição antes de aplicar

> Fase E, item 2. O comando manda **PARAR com os números antes de aplicar**.
> Medido em 27/08/2026, sobre as 8.199 linhas, com `resolveEapKind` compilado e
> chamado de verdade. Nada foi alterado.

---

## Por que esta cirurgia virou urgente

Ela deixou de ser um item da Fase E e passou a ser **o que destrava a Fase A**.

A migration dos 68 **já foi aplicada** — os 68 estão gravados como `atividade`.
Mas a prova da Fase A falha:

```
os 68 viram cartão ..... 1
seguem agrupador ....... 67
```

`resolveEapKind` decide **por posição antes de olhar o campo**:

```ts
if (level !== null) {
  if (eapIsFaseLevel(level)) return "fase";       // nível 2
  if (eapIsProjectLevel(level)) return "projeto"; // nível 1
  if (eapIsPacoteLevel(level)) return "entrega";  // nível 3
}
return agrupa ? "entrega" : "atividade";          // só aqui o campo entra
```

Um item de nível 3 gravado como `atividade` exibe **Entrega**. O campo está
certo e a tela não o consulta. **A Fase A não fecha sem a Fase E item 2.**

---

## Os números

### Quantos mudam de papel

| | |
|---|---|
| itens que mudam | **448** de 8.199 |
| destes, no quadro | **111** |

```
fase → entrega          359
entrega → atividade      56
projeto → entrega        16
fase → atividade         11
projeto → atividade       6
```

### O que importa: quantos passam a ser CARTÃO

| | |
|---|---|
| deixam de ser agrupador | **67** |
| destes, no quadro | **64** |
| vivos | **67** (nenhum na lixeira) |

**São exatamente os 67 que a Fase A não conseguiu libertar.** A cirurgia não
acerta por acaso: ela remove a segunda das duas condições que prendiam os itens.

### O risco estrutural: zero

A pergunta que decide se isto é seguro é *"algum item que TEM filhas viraria
folha?"*:

| | |
|---|---|
| pais que virariam `atividade` | **0** |

E mesmo que houvesse, não quebraria a árvore: desde 27/08, `eap_is_group` só
barra **marco**. Atividade pode ter filhas — foi a decisão que destravou o
"+ Subatividade".

---

## O que muda para quem olha a tela

**Os 359 `fase → entrega`** trocam de rótulo, não de natureza: as duas agrupam,
as duas viram faixa. Ninguém perde nem ganha cartão.

**Os 16 `projeto → entrega`** idem.

**Os 67 que viram cartão** são o ganho: trabalho promovido que estava invisível
no quadro passa a aparecer. 64 deles estão no quadro agora mesmo.

**Os 6 `projeto → atividade`** são o único caso a olhar com atenção: itens de
nível 1 que passam a ser trabalho em vez de raiz da EAP. Todos estão entre os 67
que viram cartão.

---

## O custo, declarado

A regra de tipo do sistema muda: **o nível deixa de significar papel**. Um
`wbs_code` de nível 2 não implica mais "Fase"; quem decide é `item_type`.

Isso é o que o desenho já pedia — *"o tipo é gravado, nunca deduzido"*, seção 07
— e é a mesma cirurgia do `OR hasChildren`, agora no nível. Mas é mudança larga,
e por isso o comando manda parar aqui.

**A alternativa medida:** não fazer, e os 67 seguem invisíveis no quadro.

---

**Método:** `activities` inteira (8.199 linhas), `resolveEapKind` compilado de
`src/lib/eapModel.ts`. O estágio deriva da coluna, nunca do campo `estagio`.
Só `SELECT`.
