# P06 · Linha de base de prazo

**Onda 2** · copiar o rigor que o Financeiro já tem

O Financeiro exige aprovar uma linha de base antes de falar em estouro, e avisa:
*"sem linha de base, não há desvio: qualquer edição do orçamento apaga o estouro junto"*.
O Cronograma não tem nada disso — então atraso é opinião.

## Prompt

```
Antes de escrever, mostre como o Financeiro implementa a linha de base:
tabela, versionamento, o que congela e como calcula o desvio. O prazo vai
copiar esse padrão, não inventar outro.

Depois:

1. Linha de base de PRAZO por projeto, versionada, congelando início e
   término previstos de cada item da EAP.
2. Desvio de prazo = previsto atual menos previsto da base vigente, por
   item e agregado no projeto.
3. Sem base aprovada, toda tela que fala de atraso mostra "sem base" com o
   convite para aprovar — nunca um zero. É a mesma regra da P03.
4. Projetos que já existem nascem SEM base. Não aprove retroativamente.
5. Prazo e custo compartilham a mesma versão: aprovar cria a v1 dos dois
   juntos, e é um ato só.

O previsto do PAI é derivado (fase 09: derived_start/derived_end). Congele o
que está gravado, mas saiba que para pai com filhas o valor vem da derivação
— não congele um número que a próxima derivação vai contradizer. Se a base
precisa ser imutável, congele as FOLHAS e derive a base do pai a partir
delas, com a mesma regra.

Datas são coluna `date`: compare como texto YYYY-MM-DD, nunca por
`new Date()` (o fuso desloca o dia). Ver lib/dataLocal.

Teste: aprovar a base, mover uma atividade, e o desvio aparecer. Mover de
volta e o desvio zerar. Editar sem base e nada de desvio ser calculado.
```

## Pronto quando

Mover uma atividade depois da base aprovada produz desvio visível no projeto e na carteira.

## Não faça

- Não deixe editar a base aprovada. Mudança de base é a P08.
- Não congele agregado de pai como se fosse dado próprio. Ver a nota acima.
