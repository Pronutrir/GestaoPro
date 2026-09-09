# P08 · Mudança aprovada cria a nova versão da base

**Onda 2** · hoje a aba existe e nada acontece com o projeto

> **Atenção a um efeito colateral existente.** Uma RFC pendente **sem itens de escopo** hoje
> bloqueia o projeto INTEIRO (`useChangeRequestBlocks.ts`, `hasGlobalBlock`), por
> compatibilidade com RFCs antigas. Para quem usa, isso é indistinguível de "perdi permissão".
> Ao mexer aqui, resolva ou documente esse comportamento.

## Prompt

```
Ligue Mudanças ao resto:

1. A requisição de mudança declara o que pretende alterar: escopo, prazo,
   custo, ou combinação. Com o valor pretendido, não só texto.
2. Fluxo: rascunho → em análise → aprovada / recusada. Só quem tem
   canEditPlanejamento aprova (lib/activityAccess, fase 03).
3. APROVAR aplica a alteração E cria a linha de base v(n+1). A versão
   anterior fica no histórico, com a requisição que a originou.
4. O histórico de versões responde "por que o projeto passou de 240h para
   310h" sem depender da memória de ninguém: cada versão aponta para a
   mudança.
5. Mudança aprovada que cria trabalho gera atividade no backlog, com
   origem = a requisição (isso é a P09; deixe o gancho pronto).
6. Na Gestão Financeira global, a carteira precisa saber QUAL versão está
   somando — não misture v1 de um projeto com v2 de outro.

7. RESOLVA O BLOQUEIO GLOBAL: hoje uma RFC pendente sem itens de escopo
   trava toda edição do projeto, e a pessoa não tem como saber por quê. Ou
   a RFC passa a exigir escopo, ou o bloqueio passa a dizer qual RFC o
   causou e quem pode resolvê-la. Um bloqueio anônimo lê-se como falha de
   permissão.

Teste: aprovar mudança de prazo, conferir que a base virou v2, que a v1
continua consultável, e que o desvio passou a ser medido contra a v2.
```

## Pronto quando

Existe histórico de versões da base, cada uma ligada à mudança que a criou. E nenhum bloqueio
de RFC aparece sem dizer o que o causou.

## Não faça

- Não permita editar a base direto. A única porta é a mudança aprovada.
