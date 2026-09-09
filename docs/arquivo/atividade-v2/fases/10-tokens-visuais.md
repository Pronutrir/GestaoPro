# 10 - Tokens visuais  (era Fase 7)

**Objetivo:** parar de reinventar tamanho e cor a cada componente.

**Pode correr em paralelo desde o comeco.**

> **CONFERIR ANTES DE ADOTAR.** O projeto **ja tem** tokens em `src/index.css`, e o Kanban
> tem os seus em `src/lib/kanbanTokens.ts`. O `tokens.css` do kit **ainda nao e consumido**.
>
> Varios nomes coincidem (`--primary`, `--border`, `--kanban-col-bg`). Copiar o arquivo por
> cima **muda a aplicacao inteira em silencio**. O primeiro passo desta fase e o diff.

## Prompt

```
ANTES de adotar tokens.css, produza um diff entre ele e o que ja existe em
src/index.css e src/lib/kanbanTokens.ts:

- que nomes existem nos dois com o MESMO valor (adotar e seguro)
- que nomes existem nos dois com valor DIFERENTE (decidir um a um)
- que nomes so existem no arquivo novo (acrescentar)
- que nomes so existem no atual e o novo nao cobre (nao perder)

Só depois disso, adote tokens.css como fonte unica de tipografia, cor,
espacamento e raio, e aplique na tela de atividade, no Kanban, no backlog
e nas tabelas.

Os valores marcados [atual] no arquivo vieram da aplicacao em producao:
nao os altere, apenas passe a consumi-los pelos nomes.

Escala: rotulo 11px caixa alta com letter-spacing 0.06em em cor secundaria;
valor 13px; celula 12.5px; texto 13.5px; titulo da atividade 22px.
Numeros sempre com font-variant-numeric: tabular-nums.
Linha de tabela 34px. Raio 8px em card e painel, 6px em botao e chip.
Borda de 1px para separar blocos; sombra apenas no que flutua.

De ao GUT faixa de cor propria com o numero visivel no card do Kanban,
usando as faixas --gut-* do arquivo, e troque "Sem avaliacao GUT" por
"Prioridade nao avaliada".

O tema ESCURO tem de continuar funcionando: os tokens atuais tem variante
dark. Todo token novo precisa da dele, senao a tela quebra em quem usa o
tema escuro - e isso nao aparece para quem desenvolve no claro.

Ao final, liste todo componente destas telas que ainda declara um hex ou um
tamanho de fonte fora dos tokens.
```

## Pronto quando

A lista final volta vazia, **e** as duas variantes de tema continuam legiveis.

## Nao faca

- Nao sobreponha `src/index.css` sem o diff. Nomes iguais com valores diferentes mudam
  telas que nao fazem parte desta entrega.
- Nao esqueca a variante escura de cada token novo.
