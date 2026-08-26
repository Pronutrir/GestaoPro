# P10 · Modelo de projeto

**Onda 3** · o maior ganho de escala da lista

Implantação de Tasy é trabalho repetível — mesma estrutura de fases, mesmos riscos, mesmos
documentos. Hoje cada projeto é digitado do zero, atividade por atividade.

## Prompt

```
1. Um projeto existente pode ser salvo como MODELO. O modelo guarda:
   - a EAP inteira: fases, entregas, atividades, marcos, com códigos
   - durações e esforço previsto, sem datas absolutas
   - dependências entre os itens
   - riscos conhecidos, com resposta sugerida
   - documentos padrão
   - papéis esperados na equipe (não pessoas)

2. Criar projeto a partir do modelo pede só: nome, cliente, data de início
   e a equipe. O sistema calcula as datas a partir da duração e das
   dependências, respeitando feriados — o reagendamento em cascata já faz
   isso, reaproveite.

3. Nada de pessoa vem no modelo. Papel vem; nome, não. Isso não é só
   privacidade: `assigned_to` é texto livre com o NOME, e copiar nome de
   outro projeto criaria vínculo com quem não está na equipe deste — o que
   a trigger da fase 02 recusa, com razão.

4. O modelo tem versão. Projeto criado registra de qual versão nasceu, para
   saber o que mudou desde então.

5. Um modelo pode ser marcado como padrão da organização.

MARCO no modelo: guarda o OFFSET em dias a partir do início do projeto, não
a data. E não guarda horas nem custo — marco não tem esforço, e a trigger
`trg_marco_sem_esforco` (fase 09) recusa.

O código EAP: marco NÃO tem wbs_code. Ao instanciar, não gere um para ele —
ver `codigoParaExibir` em lib/mesaDePlanejamento.

Datas calculadas são coluna `date`: monte como texto YYYY-MM-DD, nunca por
`new Date()` (o fuso desloca o dia). Ver lib/dataLocal.

Teste: criar projeto de um modelo com 29 itens e conferir que a EAP, as
dependências e as durações vieram inteiras, e que as datas foram calculadas
a partir da data de início informada.
```

## Pronto quando

Um projeto de implantação completo nasce em menos de um minuto, com EAP, dependências e
riscos conhecidos no lugar.

## Não faça

- Não copie pessoas nem datas absolutas. Modelo é estrutura, não instância.
- Não gere código EAP para marco.
