# 07 - Tela unica da atividade  (era Fase 4)

**Objetivo:** acabar com as duas telas (painel que so le, modal que so edita). A maior das fases.

**Depende de:** 03 (as capacidades decidem cada campo).

## Prompt

```
Unifique o painel de leitura e o modal de edicao numa unica tela de
atividade, na rota /project/:projectId/atividade/:activityId, apresentada
como modal sobre a visao do projeto e fechavel pelo voltar do navegador.

Estrutura da coluna principal, nesta ordem: cabecalho (codigo EAP, tipo,
titulo editavel no lugar, status como pill), barra de resumo com todos os
campos a vista, descricao, subatividades, dependencias, anexos, licao
aprendida.

A barra de resumo tem oito campos: responsaveis, previsto, real, GUT (com
os fatores G.U.T visiveis), esforco previsto e real, custo, dentro de,
etiquetas.

Sem modo "Editar": cada campo e editavel no lugar conforme as capacidades da
fase 03 e salva sozinho, com indicador discreto de salvo. Campo sem
permissao vira TEXTO, nao controle desabilitado.

Toda escrita tem de LER O RESULTADO do banco antes de dizer "salvo". Um
UPDATE que nao casa nenhuma linha volta SEM erro no PostgREST - e assim que
a recusa da RLS vira silencio. Use `count: "exact"` e trate zero linha como
recusa. Este projeto ja teve esse defeito em quatro caminhos da lixeira
(commit 6aa5436) e no mover do backlog (commit 9e9e29e).

Datas: colunas `date` NAO podem passar por `new Date()` - use lib/dataLocal.
O fuso desloca o dia e o bug so aparece para quem esta a oeste de UTC.

Na criacao, esconda o painel lateral e use a largura inteira. Iguale os
campos de criacao e de edicao, com "Dentro de" pre-preenchido pelo contexto
de onde o usuario clicou.

Mantenha Duplicar, Arquivar e Transformar em licao aprendida num menu de
acoes no cabecalho.

Edicao simultanea: ultima escrita vence, e a sobrescrita vira evento no
feed dizendo quem sobrescreveu o que.
```

## Pronto quando

O link da atividade abre a atividade direto, o F5 mantem, e nao existe mais nenhum caminho
que abra o modal antigo.

## Nao faca

- Nao anuncie "salvo" sem ler o retorno. Ver a memoria do projeto: *erro do banco chega como
  silencio*.
- Nao passe coluna `date` por `new Date()`.
