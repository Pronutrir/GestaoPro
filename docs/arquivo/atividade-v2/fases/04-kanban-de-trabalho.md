# 04 - O Kanban volta a ser de trabalho  (era Fase 8)

**Objetivo:** consertar o problema que mais doi - promover uma atividade traz a hierarquia junto.

**Depende de:** 01 (o item 6 do inventario responde a causa) e 03.

> **MECANISMO EM CONFLITO - LEIA ANTES.**
>
> O item 1 do prompt original cria `activities.estagio IN ('backlog','quadro')`.
> **Isso refaz uma decisao ja tomada, contra evidencia.**
>
> Em 20/08/2026 ficou decidido que a separacao backlog/quadro e **regra de produto no
> codigo** (`ehBacklog`, `colunasDoQuadro` em `components/kanban/shared.ts`), e **nao**
> estado no banco. O motivo esta registrado: *"ja se tentou duas vezes delegar a decisao ao
> banco, e as duas falharam igual - a regra so valia onde a migration tivesse rodado, e nos
> projetos antigos o Backlog voltava ao quadro sem ninguem pedir."*
>
> Criar `estagio` seria a **terceira** tentativa do que falhou duas vezes.
>
> **O objetivo da fase continua valido** - promover nao deve arrastar a hierarquia. Mas o
> alvo e a CONSULTA do Kanban (item 2), nao um campo novo. O item 6 do inventario diz
> exatamente o que a promocao altera hoje; se ela toca ancestrais ou subarvore, e ali que
> esta o defeito.
>
> Ha precedente recente disto funcionando: o commit `0c96834` corrigiu marco aparecendo no
> quadro **sem** tocar no banco - a causa era a coluna receber a lista inteira e remontar a
> hierarquia a partir dela.
>
> Ver `DIVERGENCIAS.md` item 2.

## Prompt (sem o campo `estagio`)

```
Antes de alterar, responda: como a consulta do Kanban seleciona o que vira
card hoje, e o que exatamente a acao de mover do backlog para o Kanban
altera no banco? Quero saber se ela toca a atividade, os ancestrais ou a
subarvore. Use o item 6 do inventario.

Depois implemente:

2. A consulta do Kanban retorna somente itens que sao TRABALHO: nao
   agrupador (Fase, Entrega, Pacote) e nao marco. Fase, Entrega, Pacote e
   Marco nunca viram card. A fonte de verdade do papel do item e
   lib/eapModel.ts (resolveEapKind / eapCanGroup) - nao reimplemente.
   `activitiesByStage` ja filtra marco; conferir se o filtro alcanca todos
   os caminhos que desenham card, inclusive a hierarquia dentro da coluna.

3. O card exibe a fase pai como chip, e o quadro ganha "Agrupar por" com
   status, fase e responsavel - fase vira raia, nao card.

4. Marco aparece como marcador no topo da coluna correspondente a sua data,
   e no calendario. Nunca como card.

5. Promover exige pelo menos um responsavel. Sem responsavel, a acao abre o
   seletor no lugar de falhar.

6. Promocao e despromocao em lote, a partir de selecao multipla no backlog,
   com atribuicao no mesmo gesto.

7. Separe as permissoes: promover exige canEditPlanejamento; assumir uma
   atividade sem responsavel ja no quadro basta ter papel de escrita na
   equipe, inclusive "Editar apenas as minhas". Promover nao atribui
   automaticamente.

8. Registre promover, despromover e assumir como eventos no feed.

A promocao deve mover APENAS a atividade escolhida entre colunas. Nunca os
ancestrais, nunca a subarvore. A posicao na EAP (parent_id, wbs_code) nao
muda ao promover - promover e mudanca de COLUNA, nao de lugar na arvore.

Atencao a trigger sincroniza_coluna_do_pai: ela ja devolveu agrupador ao
quadro sozinha uma vez (corrigido em 20260819110000, que mandou 'inicio'
preferir a fila). Confira que a mudanca nao a reativa.

Adicione um limite de WIP por coluna que bloqueia em vez de avisar - hoje
so bloqueia se wip_strict=true, e e so no front.
```


## Marco no quadro  *(acrescentado da v3 do kit)*

Marco **nunca vira card** e **nunca e promovivel** — ele nao tem estagio de trabalho.

Aparece como **marcador no topo da coluna** correspondente a sua data, e no calendario.
Quando todas as predecessoras concluirem, o marcador mostra **"proposto para conclusao"** com
um botao de confirmar, visivel so para quem tem `canEditPlanejamento`.

Nao depende de codigo EAP: marco nao tem `wbs_code` (ver `DIVERGENCIAS.md` item 6). Use
`parent_id` e a data para posiciona-lo.

## Pronto quando

- Promover `1.1.2` coloca **exatamente um** card no quadro, com o chip da fase, e nenhum
  outro item aparece.
- Um colaborador com "editar so as minhas" **assume** uma atividade sem responsavel e
  **nao** consegue promover.

## Nao faca

- **Nao crie o campo `estagio`** sem antes reler `DIVERGENCIAS.md` item 2 e decidir
  explicitamente contrariar a decisao de 20/08. Se decidir criar, registre o porque no PR -
  a terceira tentativa precisa dizer o que mudou desde as duas primeiras.
- Promover **nao** atribui automaticamente. E por ai que a escalada de acesso entra.
- A promocao em lote precisa de confirmacao com o numero de itens e o total de horas entrando
  no quadro. "Selecionar tudo e promover" e facil demais.
