# P13 · Lixeira em pacote

**Onda 3** · pequena, e pedida

Com arquivamento em cascata (regra do Atividade v2), arquivar uma fase joga trinta itens
soltos na lixeira e restaurar vira garimpo.

> **A lixeira foi corrigida em 26/08** (commit `6aa5436`): os quatro caminhos passaram a ler o
> resultado do banco, e os dois destrutivos ganharam checagem de permissão — antes disso a
> tela dizia "excluída permanentemente" mesmo quando a RLS recusava. Ao mexer aqui, **não
> desfaça isso**.

## Prompt

```
A lixeira passa a mostrar PACOTES, não itens soltos.

1. Arquivar uma fase cria uma entrada única: "Fase 1.2 Execução e 3
   subatividades", com quem arquivou e quando.
2. Restaurar devolve o pacote inteiro, na posição original da EAP. Se o pai
   original já não existir, avise antes e pergunte onde colocar.
3. Item arquivado sozinho continua sendo entrada própria.
4. Mostre o que o pacote leva junto: horas, custo e dependências que serão
   restauradas. Consuma `agregadoDoPai` — não some as filhas aqui.
5. Retenção: diga há quanto tempo cada pacote está lá, e destaque o que
   passou do prazo de retenção da organização.

TODA escrita continua lendo o resultado: `count: "exact"`, e zero linha
afetada é RECUSA, não sucesso. No PostgREST um UPDATE que não casa nenhuma
linha volta SEM erro, e é assim que a recusa da RLS vira silêncio. Foi o
defeito que o commit 6aa5436 fechou.

A restauração de fase já tem regra própria: `restaurarFaseDe` desarquiva a
fase do item restaurado, senão ele volta para uma fase arquivada e some da
tela — "o pior dos dois mundos", como diz o comentário. Preserve isso no
pacote.

Exclusão permanente e esvaziar lixeira exigem permissão de gerenciar o
projeto. Isso foi acrescentado em 26/08; não relaxe ao reescrever.
```

## Pronto quando

Arquivar uma fase com três filhas cria uma entrada, e restaurar devolve as quatro na posição
certa. E nenhuma escrita anuncia sucesso sem ler o retorno.

## Não faça

- Não anuncie "excluído" sem ler `count`. É o defeito que já custou uma correção.
- Não some horas nem custo do pacote no cliente. Consuma o derivado.
