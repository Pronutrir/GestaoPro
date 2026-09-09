# P05 · Taxa por pessoa e custo real

**Onda 2** · o ganho mais direto de toda a proposta

O próprio Financeiro admite o problema: *"sem taxa cadastrada — horas não viram custo"*.
Enquanto isso valer, o custo real de **todos** os projetos fica em R$ 0,00 e não existe
margem por projeto.

> **Depende da fase 09 do Atividade v2 estar APLICADA na VM.** É ela que faz o custo subir na
> EAP pela derivação no servidor. Sem ela, o custo da atividade existe e o do projeto não —
> ou pior, alguém soma no cliente e o número sai errado para quem enxerga uma fatia.

## Prompt

```
Faça horas apontadas virarem custo real.

1. Taxa hora por pessoa, com vigência (a taxa muda com o tempo, e o custo
   de uma hora apontada usa a taxa vigente NA DATA do apontamento — não a
   atual).
2. Sobrescrita opcional por projeto, para contrato com taxa negociada.
3. Custo de mão de obra da atividade = soma das horas reais × taxa vigente.
   Sobe para a fase e para o projeto pela derivação que JÁ EXISTE —
   `derivar_do_pai` na migration 20260826130000, no servidor, sobre a
   árvore inteira. Acrescente a coluna à derivação existente; não escreva
   um segundo mecanismo de rollup.
4. O custo real do projeto passa a ser mão de obra + custos lançados. O
   Financeiro já tem o segundo.
5. Margem: valor contratado do projeto menos custo real. Se não houver
   campo de valor contratado, crie-o no Plano.
6. Na Gestão Financeira global, a carteira passa a somar custo real de
   verdade. AVISE no PR que o valor da carteira vai mudar no deploy — é
   esperado, não é regressão.

MARCO não recebe custo: a trigger `trg_marco_sem_esforco` (fase 09) já
recusa horas e custo em marco. Não contorne — se um marco tem esforço, ele
é uma Atividade.

Escreva teste: taxa com duas vigências, apontamento em cada período, e o
custo tem que usar a taxa da data certa.
```

## Pronto quando

Um apontamento de 2h numa atividade muda o custo real do projeto e da carteira. E o teste de
vigência passa.

## Não faça

- Não use a taxa atual para recalcular apontamento antigo. Isso reescreve o passado.
- Não some no cliente. A derivação é do servidor — ver `lib/agregadoDoPai`.

## Decisão sua

Taxa por pessoa, por papel, ou por projeto? O prompt assume **por pessoa, com sobrescrita por
projeto**. Se for por papel, mude antes de rodar.
