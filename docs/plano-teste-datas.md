# Plano de teste — campos de data

Relato: "todos os campos de data não estão funcionando direito".

Antes de testar, levantei o que o código e o banco fazem hoje. O que segue não é
suposição: são quatro convenções coexistindo e uma inconsistência de tipo.

---

## O que a análise encontrou

### 1. O tipo no banco não é o mesmo para campos irmãos

```
start_date          date          ← previsto
end_date            date          ← previsto
actual_start_date   timestamptz   ← realizado
actual_end_date     timestamptz   ← realizado
baseline_start_date timestamptz
baseline_end_date   timestamptz
derived_start       date
derived_end         date
```

Previsto e Realizado aparecem lado a lado na tela, guardam a mesma coisa — um DIA —
e têm tipos diferentes. `date` não tem fuso; `timestamptz` é um instante. Guardar
um dia como instante é o erro que gera diferença de um dia.

### 2. `new Date().toISOString().slice(0,10)` grava o dia em UTC

Aparece em cinco lugares, todos gravando `actual_end_date` ao concluir:

```
ActivityKanban.tsx:1716 · ActivityKanban.tsx:1761 · EditActivityDialog.tsx:1201
EditActivityDialog.tsx:3750 · atividade/[activityId]/page.tsx:348
```

`toISOString()` devolve UTC. Em São Paulo (UTC−3), **das 21h à meia-noite já é o dia
seguinte em UTC**. Concluir uma tarefa às 22h de 11/09 grava 12/09.

### 3. Quatro jeitos de ler a mesma data

```
parseDataLocal(v)                 o helper correto (lib/dataLocal.ts)
new Date(v + 'T00:00:00')         meia-noite local — funciona, mas avulso
new Date(v + 'T12:00:00')         truque do meio-dia — funciona, mas avulso
new Date(v)                       ERRADO em coluna `date`: vira meia-noite UTC
```

O `dataLocal.ts` documenta o problema e foi escrito em 11/08 justamente por causa de
um prazo que aparecia um dia antes. Mas convive com três alternativas espalhadas.

### 4. A validação compara texto, não data

`isDateRangeInvalid` faz `start > end` com strings. Funciona para `YYYY-MM-DD`, e
silenciosamente erra se um dos lados chegar como timestamp (`2026-09-11T00:00:00Z`),
porque a comparação passa a incluir a parte da hora.

---

## Hipótese a testar

O sintoma "não funciona direito" deve ser, na maioria dos casos, **diferença de um
dia**, aparecendo em três situações:

- **na escrita**, quando a ação acontece depois das 21h (grava amanhã);
- **na leitura**, quando um `timestamptz` é exibido como dia (mostra ontem);
- **na ida e volta**, quando os dois erros se cancelam em uma tela e não na outra —
  o que faz o mesmo campo aparecer com dias diferentes em lugares diferentes.

---

## Método

**Fuso fixo e relógio controlado.** O navegador de teste roda com
`timezoneId: "America/Sao_Paulo"`. Onde o horário importa, o relógio é fixado em
**22:30 local** — dentro da janela em que UTC já virou o dia. Sem isso o defeito não
aparece: às 10h da manhã tudo funciona.

**Conferir os três lugares.** Para cada campo: o que a tela mostra, o que a API
enviou, e o que a linha tem no banco. Um defeito de fuso pode estar em qualquer um
dos três e os outros dois parecerem certos.

**F5 depois de cada gravação.** É onde a ida e volta se revela.

---

## Bloco 1 — Previsto (colunas `date`)

**1.1** Digitar início 14/09 e término 20/09 na tela da atividade. Conferir tela,
API e banco. Recarregar e reler.
**1.2** O mesmo às 22:30. A data gravada tem de ser a digitada, não a seguinte.
**1.3** Mesma atividade vista no Backlog, no Kanban, na tela da atividade e no
Cronograma. As quatro têm de mostrar o mesmo dia.
**1.4** Limpar a data e reler.

## Bloco 2 — Realizado (colunas `timestamptz`)

**2.1** Preencher início e término reais pela tela. Tela × API × banco.
**2.2** Às 22:30: o dia gravado é o local ou o de UTC?
**2.3** Concluir a atividade pelos **cinco caminhos** que gravam `actual_end_date` —
Kanban (arrastar para coluna final), Kanban (menu do card), Backlog (menu ⋯), tela
da atividade, rodapé do modal. Comparar o que cada um grava. Devem coincidir.

## Bloco 3 — a mesma data em telas diferentes

**3.1** Uma atividade com previsto e realizado preenchidos, vista nas quatro telas.
Registrar o dia exibido em cada uma. Divergência aqui é o sintoma mais visível.
**3.2** No Cronograma: a barra começa e termina nos dias certos?

## Bloco 4 — validação e limites

**4.1** Início depois do término: a mensagem aparece?
**4.2** O mesmo com um dos lados vindo como timestamp — a comparação de texto ainda
acerta?
**4.3** Datas iguais nos dois campos.
**4.4** Ano bissexto (29/02) e virada de ano (31/12 → 01/01).

## Bloco 5 — datas derivadas do pai

**5.1** Pai com duas filhas de janelas diferentes: `derived_start` e `derived_end`
batem com o menor início e o maior término?
**5.2** Mudar a data de uma filha e conferir se o pai acompanha.

## Bloco 6 — outros campos de data

**6.1** Prazo do projeto (`due_date`).
**6.2** `trashed_at` na Lixeira — a data de arquivamento exibida.
**6.3** `completed_at` × `actual_end_date`: os dois caminhos de concluir já
divergiam em 09/09; conferir se ainda.

---

## Relatório

Por teste: **o que foi digitado · o que a tela mostrou · o que a API enviou · o que o
banco guardou · o que apareceu após F5**. Um defeito de fuso só se descreve com os
cinco.

Depois: **confirmado**, **ainda falha** e **engano de medição**.

---

## O que já dá para dizer sem testar

O `new Date().toISOString().slice(0,10)` dos cinco pontos de conclusão está errado
por construção — grava o dia de UTC. Não depende de teste para saber; o teste serve
para medir o tamanho do estrago e se algum outro erro o compensa.
