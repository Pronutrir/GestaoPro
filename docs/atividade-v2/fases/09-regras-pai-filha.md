# 09 - Regras entre pai e filha  (era Fase 6)

**Objetivo:** um modulo so, consumido por todas as telas.

> **O MELHOR ACHADO DO KIT.** A regra da derivacao no servidor nao e detalhe de
> implementacao - e a diferenca entre um numero certo e um numero silenciosamente errado.
> **Nao esta protegido hoje.**

## Prompt

```
Centralize as regras entre atividade pai e subatividades num unico modulo.

REGRA QUE MANDA EM TODAS AS OUTRAS: a derivacao do pai a partir das filhas
roda no SERVIDOR, sobre a arvore inteira, independente do que o usuario que
disparou a edicao consegue enxergar. Trigger no banco ou funcao com escopo
elevado. Nenhuma tela recalcula o pai a partir da arvore que ela carregou.

Um usuario restrito enxerga uma filha so. Se a derivacao for feita no
cliente, a edicao dele recalcula o pai com uma filha e o pai encolhe - some
horas, some custo, a janela de datas fecha. Ninguem ve no dia; aparece no
relatorio do mes e nao da para rastrear.

Antes de implementar, aponte todo lugar que hoje calcula agregado do pai no
cliente. O item 4 do inventario ja levantou isso. Candidatos conhecidos:
computeActivityProgress (lib/activityProgress.ts), hoursStatsByActivity e
descendantSummaryById (ActivityKanban / KanbanColumn), subActivityCounts.

As regras, todas consumidas do mesmo modulo:

- Pai vira "Em andamento" quando a primeira filha sai de "Nao iniciado".
- Pai nao conclui com filha aberta: bloqueie e informe quantas faltam,
  com link para a lista.
- Previsto e real do pai derivam de minimo e maximo das filhas; so leitura
  quando ha filhas, com dica dizendo de onde vem o valor.
- Filha fora da janela do pai expande o pai e registra no feed.
- Tempo e custo continuam somando as filhas; estenda para os valores reais.
- Progresso do pai ponderado por horas previstas das filhas.
- GUT nao herda; o pai exibe o maior GUT entre as filhas como indicador
  secundario.
- Filha nasce com o responsavel do pai, e pode ser trocada.
- Arquivar em cascata, com confirmacao dizendo quantas filhas serao
  afetadas.
- Marco nao tem filhas nem duracao e nao entra no Kanban - reafirme.
  Marco entra na media do pai como 0 ou 100, nunca pelo meio.

Cuidado com ciclo em parent_id: ha dado corrompido na base e varias funcoes
ja carregam protecao (`visto`, `ancestors`). Mantenha.

Escreva testes para cada regra.
```

## Pronto quando

Kanban, Gantt, tela de atividade e relatorios mostram **o mesmo numero** para o mesmo pai.

E o teste que fecha a fase: um usuario que enxerga **uma unica filha** edita as horas dela,
e o total do pai continua batendo com a soma de **todas** as filhas.

## Nao faca

- Nao recalcule agregado do pai no cliente, em nenhuma tela, nem "so para o preview".
- Nao use a arvore carregada na tela como fonte da derivacao. Ela e uma fatia, nao a arvore.
- Nao remova as protecoes de ciclo em `parent_id`.
