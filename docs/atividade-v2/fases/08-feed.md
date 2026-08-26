# 08 - Feed de atividade com sino  (era Fase 5)

**Objetivo:** um fluxo unico no lugar de um chat.

**Depende de:** 07 (o feed vive na tela unica).

## Prompt

```
Transforme o painel lateral num feed unico, ordenado por tempo, com abas
Tudo / Conversa / Historico e um sino com o numero de eventos novos desde a
ultima visita do usuario aquela atividade.

O feed agrega quatro origens:
1. Comentarios e mencoes da propria atividade.
2. Mudancas de campo da propria atividade, com nome legivel do campo e os
   valores de origem e destino - nunca UUID, nunca enum em ingles, e o autor
   pelo nome com avatar.
3. Eventos das subatividades, prefixados com o codigo EAP da filha e
   clicaveis para abrir a filha.
4. Eventos de dependencia: predecessora concluida, predecessora atrasada,
   bloqueio criado ou liberado.

Persista a ultima leitura por usuario e atividade. Filtro por tipo de evento
e busca no texto. Agrupe eventos do mesmo autor no mesmo minuto.

Comece corrigindo o rendering do historico existente: hoje ele mostra
"Etapa: <uuid> -> <uuid>" e "Status: pending -> completed". Resolva os
rotulos na ORIGEM (quem grava o evento), nao com um de-para no componente -
o de-para so conserta a tela que o tem, e o proximo consumidor volta a
mostrar UUID.

RESPEITE A VISIBILIDADE. O feed agrega eventos de subatividades, e quem
chega por atribuicao nao enxerga as irmas. O feed nao pode ser a porta dos
fundos: filtre os eventos pelo mesmo escopoDeLeitura da fase 03, no BANCO,
nao no cliente. Um evento de irma invisivel nao pode aparecer nem como
"alguem alterou algo".

Ao paginar, cuidado com o teto: o filtro de permissao tem de vir ANTES do
limite, senao o contador conta o que a pessoa nao ve. Este projeto ja teve
esse defeito nas notificacoes (commit bd00832).
```

## Pronto quando

Concluir uma subatividade gera uma linha legivel no feed da atividade pai, o sino zera ao
abrir, e um usuario restrito nao ve no feed nenhuma linha de atividade que ele nao enxerga.

## Atencao

Uma fase com 30 filhas gera muito evento. O agrupamento por autor/minuto nao e enfeite -
sem ele o feed vira ruido no primeiro projeto grande.
