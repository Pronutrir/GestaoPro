# P04 · Desligar quatro módulos

**Onda 1** · decisão já tomada

Saem do menu: **Agente de IA**, **CSC**, **Gestão da Qualidade**, **Calendário**.

> **Dois já estão desligados por flag.** `SHOW_CALENDAR = false` e `SHOW_USER_STORIES = false`
> em `lib/featureFlags.ts` — o Calendário já não aparece. Confira o estado real antes de
> "remover" o que já saiu.

## Prompt

```
Remova do menu e das rotas: /agent (Agente de IA), /csc, /qualidade e o
Calendário.

ANTES: leia lib/featureFlags.ts. O Calendário já está desligado por flag
(SHOW_CALENDAR = false), com o motivo escrito. Diga o que ainda está no ar de
verdade e o que já saiu — não "remova" o que já não aparece.

Para cada um dos que ainda estão no ar:
1. Diga se alguma outra tela importa código dele. Se importar, mostre onde.
2. Diga se ele grava em tabela própria e se há dado gravado. NÃO apague
   dado — só o acesso.
3. Proponha o que fazer com a tabela: manter intacta, ou marcar como
   histórica com data de revisão.

Siga o padrão que já existe: desligar por flag em lib/featureFlags.ts, com
o motivo escrito no comentário — é assim que Calendário e Histórias saíram, e
é o que permite voltar em uma linha se alguém reclamar na primeira semana.

Ao final, liste o que ficou órfão: componentes, hooks, rotas de API e itens
de tradução que agora ninguém usa.
```

## Pronto quando

Os quatro somem do menu, nenhum dado foi apagado, e existe a lista do que ficou órfão.

## Não faça

- Não apague tabela nem registro. Acesso sai; dado fica.
- Não remova **Relatórios** nem **Indicadores Lab** — ficaram sem decisão. Se saírem, volte aqui.
- Não invente um segundo mecanismo de desligamento. `featureFlags.ts` já é o lugar.
