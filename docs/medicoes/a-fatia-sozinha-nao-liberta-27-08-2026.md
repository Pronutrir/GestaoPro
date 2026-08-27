# A fatia cirúrgica sozinha liberta 1 dos 68 — 27/08/2026

> Medido **depois** de escrever a migration do passo 1 e **antes** de aplicá-la.
> O resultado invalida o passo 1 como está.

## O que a medição diz

Trocando `item_type` para `'atividade'` nos 68, e nada mais:

| | |
|---|---|
| viram cartão | **1** |
| **continuam presos** | **67** |

Por nível do `wbs_code`:

```
nível 2 → 11 itens → exibidos como Fase
nível 3 → 56 itens → exibidos como Entrega
```

## Por que

`resolveEapKind` decide **por posição antes de olhar o campo**:

```ts
if (level !== null) {
  if (eapIsFaseLevel(level)) return "fase";       // nível 2
  if (eapIsProjectLevel(level)) return "projeto"; // nível 1
  if (eapIsPacoteLevel(level)) return "entrega";  // nível 3
}
return agrupa ? "entrega" : "atividade";          // só aqui o campo entra
```

Um item com `wbs_code = '2.1.5'` exibe **Entrega** mesmo gravado como
`atividade`. O campo nunca é consultado.

**Isto já estava medido e registrado hoje**, em
[o-congelamento-conserta-o-incidente-27-08-2026.md](o-congelamento-conserta-o-incidente-27-08-2026.md):
*"São duas condições, e as duas precisam cair."* Ao escrever o passo 1 eu tratei
só uma delas. O erro é meu, e foi pego pela conferência do efeito — não pelo
`tsc`, não pelas 222 asserções.

## O que isso significa para o plano

O passo 1 **não pode ser aplicado sozinho**. Ele não é errado — é insuficiente:
corrige o campo, e o campo não é quem decide para 67 dos 68.

As saídas, e todas passam por decisão que ficou fora do escopo desta leva:

1. **Tirar a dedução por nível** — a segunda cirurgia, medida hoje: 392 itens
   mudam de rótulo, 0 deixam de ser agrupador *sozinha*. Combinada com a fatia,
   liberta os 68.
2. **Limpar o `wbs_code` dos 68** — sem código, o campo passa a decidir. Mas
   apaga a posição na EAP, que é informação legítima.
3. **Adiar o passo 1** e tratar os 68 junto com a dedução por nível, numa leva
   que assume as duas mudanças.

Nenhuma cabe em "conserto para a frente, fechado, sem tocar na dedução por
nível" — que era a restrição desta leva.

## O que continua válido

Os passos **2, 3 e 4** não dependem disto e estão prontos:

- promover agrupador é recusado, com a mensagem;
- o contador saiu das preferências;
- a coluna Situação, o chip "No quadro" e a faixa "4 de 6".

Eles são melhoria de tela e de porta, e valem por si — inclusive porque o passo
2 impede que a lista dos 68 volte a crescer.
