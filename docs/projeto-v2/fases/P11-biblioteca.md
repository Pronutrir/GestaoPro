# P11 · Biblioteca entre projetos

**Onda 3** · estender o que Lições já faz

Lições é o único módulo com **Busca Global**. Risco recorrente, documento padrão e ata têm o
mesmo valor de reuso, e ficam presos no projeto onde nasceram.

> **DEPENDE DA P00.** Busca entre projetos lê a mesma tabela que Pendências. Com a policy
> atual, ela nasceria com o mesmo furo — e um furo de busca é pior, porque a pessoa procura
> de propósito.

## Prompt

```
1. Estenda a busca entre projetos, hoje só em Lições, para Riscos,
   Documentos e Reuniões. Uma busca só, com filtro por tipo.

2. Cada resultado mostra de que projeto e cliente veio, e permite COPIAR
   para o projeto atual — risco com a resposta junto, documento com o
   conteúdo, lição como referência.

3. A busca respeita a camada de acesso: ninguém encontra por aqui o que não
   poderia ver no projeto de origem. Consuma `capacidadesNaAtividade` e o
   `escopoDeLeitura` (lib/activityAccess) — não escreva um filtro próprio.

   ATENÇÃO: documentos e TAP seguem `can_view_project_v2`, que é MAIS
   restrito que `can_view_project_work_v2` (atividades). Quem entra por
   atribuição vê o trabalho e NÃO vê os documentos. A busca tem de respeitar
   a diferença, não unificar por conveniência.

4. Marque como "de biblioteca" o que vier de outro projeto, para não
   confundir com o que nasceu aqui.

5. Risco e documento que aparecem em três projetos ou mais viram sugestão
   no modelo (P10).

6. O proxy corta a URL em ~3,7 KB — uma lista longa em `.in(...)` vira 502
   (memória do projeto, auditado em 07/08). Se a busca montar lista de ids,
   use `chunkedIn`, que já existe em lib/chunkedIn.
```

## Pronto quando

Buscar por um termo traz risco, documento e lição de outros projetos, e dá para copiar para o
atual. E quem não tem acesso ao projeto de origem não vê o resultado.

## Não faça

- Não deixe a busca global furar a visibilidade. É o mesmo furo da P00, em outro lugar.
- Não unifique a visibilidade de trabalho com a de documento. São duas funções diferentes de
  propósito, e o comentário de `can_view_project_work_v2` diz isso explicitamente.
