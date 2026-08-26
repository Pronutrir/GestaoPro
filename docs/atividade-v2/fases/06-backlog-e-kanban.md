# 06 - Backlog e Kanban enxutos  (era Fase 9)

**Objetivo:** menos filtro, menos coluna, mais decisao.

**Depende de:** 04 (fecha a limpeza que ela comeca).

## Prompt

```
Refaca as paginas de Backlog e Kanban seguindo a regra dos tres: no maximo
tres controles visiveis no topo; todo o resto atras de um botao "Filtrar"
que abre fechado.

Backlog: tabela em arvore da EAP agrupada por fase, grupos recolhiveis,
linha de 34px, colunas codigo, tipo, nome, responsavel, previsto, esforco
e GUT. Selecao multipla com barra de acao flutuante contendo Promover,
Atribuir e Definir datas, mostrando o total de horas e custo selecionados.
Topo: busca e os chips Minhas, Sem responsavel, Sem data.

Kanban: card com codigo curto, titulo, avatares dos responsaveis, GUT com
numero e cor, prazo que muda de cor ao atrasar, e contador de subatividades
apenas quando houver. Coluna com contador e limite de WIP. Topo: busca,
alternancia Minhas / Todas, e Agrupar por.

Padrao de abertura por papel: quem tem "Editar apenas as minhas" abre em
Minhas; dono, gestor e quem edita tudo abrem em Todas.

Antes de remover qualquer filtro existente, liste todos os que existem hoje
nas duas paginas e proponha para cada um: manter a vista, mover para o menu,
ou remover - com uma linha justificando qual decisao ele apoia. Use o item 7
do inventario, que ja separa os filtros que algum codigo consome dos que
sao decorativos.

O filtro "Minhas" ja existe e usa `ehAtividadeDaPessoa` (lib/activityAccess).
Consuma dela - nao reimplemente "e minha", que ja foi escrita seis vezes
nesta base.

As preferencias de exibicao do Kanban ja vivem no banco por usuario
(useKanbanPrefs, commit ad4d3c2). O filtro ficou local DE PROPOSITO. Nao
mova um para o outro sem decidir explicitamente.
```


## Marco nas listas  *(acrescentado da v3 do kit)*

No Backlog, marcos aparecem como **linha na arvore, com data e sem responsavel, esforco ou
GUT** — esses campos nao sao renderizados para eles, e **nao ficam com "—"**.

Os chips **Sem responsavel** e **Sem prioridade** EXCLUEM marcos: senao ficam listados para
sempre como pendencia que nunca fecha. O chip **Sem data** continua valendo, porque marco sem
data e lacuna de verdade.

Marco nao tem `wbs_code` — na coluna de codigo, mostre a ancora (o codigo do pai) ou deixe
vazio, nunca um codigo inventado.

## Pronto quando

As duas paginas abrem sem barra de filtros, e qualquer coluna que sobrou responde
"que decisao eu tomo olhando para isso?".

## Nao faca

- Nao reimplemente "e minha atividade". Ha uma fonte unica desde o commit `dd045f1`.
- Nao remova filtro que o item 7 do inventario mostrou ser consumido, sem antes perguntar.
