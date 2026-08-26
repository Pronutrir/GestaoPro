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


### O MARCO, em detalhe

> **Duas correcoes ao que o kit propos** — ver `DIVERGENCIAS.md` item 6:
>
> - **Marco NAO tem codigo EAP.** Decisao de 11/08/2026 em `lib/eapModel.ts`: marco e
>   elemento do CRONOGRAMA, nao da EAP. Dar codigo a ele abria buracos na numeracao do
>   trabalho e obrigava a renumerar vizinhos. Ele fica **ancorado** por `parent_id` (que lhe
>   da contexto e propaga datas) e **sem** `wbs_code`. E pode ficar na **raiz, sem pai** —
>   "Go-live" e do projeto inteiro, nao de uma fase. Nenhuma regra abaixo depende do codigo.
> - **"Peso zero no progresso" NAO esta decidido.** Hoje o marco entra na media do pai como
>   0 ou 100 (`activityProgress.ts:168`), com o comentario *"arrasta-lo para Em Revisao nao
>   realiza meio marco"*. As duas leituras sao defensaveis — decida antes de implementar.
>   As duas regras novas abaixo valem nas duas leituras.

Marco e irmao das Atividades, mas **nao e trabalho**: nao tem filhas, duracao, horas, custo,
GUT nem responsavel de execucao.

- **ENTRA no termino previsto do pai**: a fase termina no marco, nao na ultima atividade.
  Marco em 12/09 com a ultima atividade fechando em 09/09 leva a fase ate 12/09. *(novo)*
- **CONTA como filha aberta**: a fase nao conclui com marco pendente. *(novo)*
- **NAO entra** na soma de horas nem na de custo. Recuse gravacao de horas num marco em vez
  de aceitar e somar. *(novo)*
- **Peso no progresso**: ver a ressalva acima. Hoje e 0 ou 100.
- **GUT ausente, nao vazio**: no Marco o campo nao e renderizado e a API nao o aceita. Vazio
  num Atividade quer dizer "ainda nao avaliado"; num Marco quer dizer "nao se aplica". *(novo)*
- **Fecha por confirmacao**: quando todas as predecessoras concluem, marque-o como "proposto
  para conclusao" e notifique quem tem `canEditPlanejamento`. Concluir exige o clique dessa
  pessoa e vira evento no feed com autor e horario. Se uma predecessora for reaberta depois,
  o marco volta para "proposto" e avisa quem o havia fechado. *(novo)*

Testes: marco com data posterior a ultima atividade estende o termino da fase; marco pendente
impede a conclusao da fase; horas lancadas num marco sao recusadas; marco sem `wbs_code` nao
quebra a numeracao dos irmaos.

## Pronto quando

Kanban, Gantt, tela de atividade e relatorios mostram **o mesmo numero** para o mesmo pai.

E o teste que fecha a fase: um usuario que enxerga **uma unica filha** edita as horas dela,
e o total do pai continua batendo com a soma de **todas** as filhas.

## Nao faca

- Nao recalcule agregado do pai no cliente, em nenhuma tela, nem "so para o preview".
- Nao use a arvore carregada na tela como fonte da derivacao. Ela e uma fatia, nao a arvore.
- Nao remova as protecoes de ciclo em `parent_id`.
