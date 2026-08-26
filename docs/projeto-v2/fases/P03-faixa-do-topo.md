# P03 · A faixa do topo: zero vazio vira o que falta

**Onda 1** · sem risco · vale para o projeto e para a Visão Geral

## O problema

Num projeto com 29 atividades e nenhuma data, a faixa mostra: Atrasadas **0**,
Prazos Próximos **0**, Alta Prioridade **0**, Horas **0.0h de 0.0h**. O painel diz
"tudo em ordem" quando deveria dizer "falta preencher". E o ícone vermelho de
Atrasadas fica aceso com valor zero — a cor está decorando, não dizendo estado.

## Prompt

```
Refaça a faixa de indicadores do topo do projeto. Cinco cards, cada um
respondendo uma pergunta:

1. Onde estamos? — "5 / 29 concluídas · 17%"
2. Está no prazo? — desvio contra a linha de base. Sem linha de base,
   mostra "sem base" com o convite para aprovar o TAP.
3. Está no orçamento? — mesma lógica, mesma frase.
4. O que está travado? — atrasadas + em pendência, somados.
5. O que falta preencher? — sem responsável + sem data.

REGRA CENTRAL: um zero só aparece quando ele é verdadeiro. "0 atrasadas" só
pode aparecer se existirem datas. Sem datas, o card mostra "5 sem data".
O sistema tem que distinguir "está tudo certo" de "ninguém preencheu".

Consuma `agregadoDoPai` (lib/agregadoDoPai) para horas e custo — NÃO some
as filhas aqui. Somar no cliente é o defeito que a fase 09 corrigiu, e para
quem enxerga uma fatia o número sairia menor que a realidade.

MARCO não entra na contagem de "sem responsável" nem de "sem prioridade" —
ele não tem esses campos. Mas ENTRA em "sem data", porque data é o campo
dele. `comoMostrarVazio` em lib/mesaDePlanejamento já faz essa distinção.

Todo card é clicável e abre o Backlog já filtrado — o mesmo filtro dos chips
do topo da tabela.

Sem ícone decorativo. O card fica neutro quando está tudo bem e ganha cor e
borda quando há o que olhar.

Aplique a mesma regra na Visão Geral, onde o problema se multiplica por
projeto.
```

## Pronto quando

Num projeto sem datas nenhum card mostra zero — todos mostram o que falta. E clicar em
"12 sem responsável" abre o backlog filtrado.

## Não faça

- Não acenda cor num card em estado normal.
- Não some horas nem custo no cliente. Consuma o derivado.
