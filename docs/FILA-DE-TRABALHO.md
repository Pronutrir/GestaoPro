# Fila de trabalho — o que está esperando, e esperando o quê

> Um item por bloco. Cada um diz **o que fazer**, **por que**, e sobretudo
> **o que precisa acontecer antes** — porque a ordem aqui não é preferência,
> é dependência.
>
> Atualizado em **27/08/2026**, durante o incidente das 12:08.

---

## 🔴 BLOQUEIO ATIVO — o incidente de 27/08 12:08

**Nada abaixo começa antes disto fechar.**

O build com a leitura pura de `item_type` está no ar com o backfill do
congelamento incompleto. Itens de nível 3 gravados como `'fase'` são lidos como
Entrega, somem do Kanban e recusam arrasto em silêncio.

O relato completo, a causa real e o conserto da barreira estão em
[deploys.md](deploys.md). O que falta, e não depende de código:

1. **Reverter o build** para a versão de 26/08 18:01 — travado porque ninguém
   anotou a `APP_VERSION` daquele dia. Precisa ser lida da VM.
2. **Confirmar na tela** que os cartões voltaram e que mover funciona.
3. **Descobrir quem publicou** — a pergunta continua aberta desde 26/08.

---

## 1 · Coluna "Situação" no backlog

**Origem:** correção de desenho do Raphael, 27/08/2026.
**Depende de:** o incidente fechado. Não entra antes.

### O erro que originou

O desenho tirou a coluna **Status** do backlog partindo de que a tela lista
apenas itens da fila. **Ela lista todos.** Sem status, ninguém sabe o que já foi
promovido nem em que pé está.

Confirmado no projeto de teste `6d01b1b3`: **141 itens vivos**, dos quais
**5 já estão no quadro** e aparecem misturados aos 136 da fila, sem nada que os
distinga.

> *(O comando falava em 107 itens; não consegui reproduzir esse número por
> nenhum recorte — 141 vivos, 137 sem marcos. Provavelmente havia um filtro
> ativo na tela. Não muda a conclusão: promovido e não-promovido aparecem
> juntos e indistinguíveis.)*

### O que fazer

**a) Coluna estreita `SITUAÇÃO`, entre `PREVISTO` e `ESFORÇO`.**

| o item está | a coluna mostra |
|---|---|
| ainda no backlog | **vazia** — sem traço, sem palavra, sem placeholder |
| já no quadro | ponto de **7px** com a cor do status **+ a palavra** |

As palavras são os títulos reais das colunas do projeto: *Não iniciado*,
*Em Andamento*, *Pendências*, *Concluída*.

> **A coluna só fala quando tem o que dizer.** Um traço para "está no backlog"
> seria ruído em 136 das 141 linhas — e o vazio já significa "na fila", porque
> é o estado normal desta tela.

O ponto de 7px é o mesmo do status no resto do backlog, e segue a regra de cor:
cor só onde significa.

**b) Chip `No quadro` no topo,** junto de *Sem responsável* e *Sem data*,
filtrando os promovidos.

**c) A faixa de grupo passa a dizer `4 de 6 no backlog`** em vez de `4 no
backlog`. A diferença entre os dois números já revela quantos foram promovidos,
sem precisar de outra coluna.

### O que conferir ao implementar

- A regra dos três controles no topo continua valendo — o chip novo entra no
  grupo que já existe, não cria uma quarta fileira.
- "Está no quadro" **deriva da coluna**, via `estagioDoItem` — não de um campo
  próprio. A coluna `estagio` existe no banco mas nasceu como espelho e ninguém
  a lê; ler dois lugares recria a divergência.
- A contagem da faixa não pode ser recalculada na tela a partir do que foi
  carregado. É o defeito do agregado, e a lista passa pela RLS.

---

## 2 · Fase 1, item 5 — recálculo da EAP ao mover

**Depende de:** o incidente fechado **e** 24 horas de uso real sem incidente
após a publicação das três entregas.

Ao mover um item, os códigos EAP da subárvore precisam ser recalculados, com
aviso *"os códigos de N itens vão mudar"* e confirmação antes de gravar.

A condição das 24 horas é do Raphael e não é a mesma coisa que "as sete
conferências passaram": as conferências provam o caminho feliz; as 24 horas
provam que o resto do sistema não tropeçou no que ninguém pensou em conferir.

---

## 3 · A reescrita da migration de congelamento

**Depende de:** o incidente fechado.

### 3.0 · ANTES DE QUALQUER OUTRA COISA: a migration tem de ser RETOMÁVEL

Não "idempotente por omissão" — **retomável**. A diferença não é vocabulário.

Idempotente por omissão é o que ela é hoje: cada passo tem um `IF NOT EXISTS`
ou um `WHERE ... IS NULL` que faz o passo *não acontecer* se já aconteceu. Isso
parece seguro e não é, porque **os passos podem ter acontecido em momentos
diferentes**, e o passo que não acontece pode ser justamente o que protegia o
outro.

Foi o que ocorreu: a sombra foi preenchida, o backfill não, e o banco continuou
sendo escrito por outras migrations no meio. Rodar a migration hoje, do jeito
que está, faria:

```
sombra:   WHERE item_type_antes_congelar IS NULL  →  não casa com nada  →  PULA
backfill: roda a partir do estado de HOJE
```

E o estado de hoje **não é** o original.

> **785 linhas perderiam o valor original para sempre**, e o rollback da entrega
> 3 as devolveria a `'fase'` em vez de `'atividade'` — consolidando um estado que
> nunca existiu. É a única forma de reverter a entrega 3, e ela seria destruída
> em silêncio.

### Os três estados, e o que fazer em cada

| estado | a migration faz |
|---|---|
| **A** · sombra ausente | cria, preenche, faz o backfill |
| **B** · sombra preenchida, backfill **não** feito | **não toca na sombra**, só faz o backfill |
| **C** · sombra preenchida, backfill feito | **nada** — e diz isso, alto |

### Como distinguir B de C sem depender de ninguém lembrar

Este é o ponto difícil, e a resposta **não** pode ser "comparar a sombra com o
`item_type` atual". Foi o que eu ia propor, e está errado: as duas colunas
divergem hoje em 785 linhas, e a causa **não é** o congelamento — é a migration
`20260824130000_pacote_e_posicao`, que rodou depois da sombra e fez
`atividade → fase` em itens de nível 3. Diferença entre as colunas prova apenas
que *alguma coisa* escreveu, não que **o backfill** escreveu.

A distinção tem de vir de algo que **só o backfill produz**:

> **O vocabulário.** O congelamento é a única coisa no sistema que grava
> `'entrega'` e `'projeto'` em `item_type`. Nenhuma outra migration, nenhuma
> tela, nenhuma importação escreve esses valores — `eapToPersisted` grava
> `'fase'` para os dois papéis agrupadores.

Então:

```sql
-- C (backfill feito) se, e somente se, existe item_type que só ele produz.
SELECT EXISTS (SELECT 1 FROM public.activities
                WHERE item_type IN ('entrega', 'projeto'))
```

Hoje isso é **zero**, o que prova o estado **B** — e prova, junto, que o backfill
nunca rodou, ao contrário do que o registro inicial do incidente supôs.

**Uma segunda checagem, independente da primeira**, porque uma só é frágil:
o backfill leva `item_type` ao **ponto fixo** de `eap_tipo_exibido`. Se ele
rodou, nenhuma linha diverge do que a função devolve. Se as duas checagens
discordarem entre si, a migration deve **parar e mostrar** em vez de escolher —
discordância ali significa um quarto estado que ninguém previu.

### O que NÃO fazer

- **Não regravar a sombra**, em nenhum dos três estados, se ela já tem valor. A
  sombra é o registro do que havia **antes da primeira tentativa**, e uma
  segunda tentativa não muda isso.
- **Não usar `schema_migrations` como fonte.** Ela diz o que alguém registrou,
  não o que aconteceu — e neste incidente ela e o esquema divergiram.
- **Não confiar na existência da coluna** como prova de execução. Foi
  exatamente essa a armadilha: a coluna existia, toda conferência dizia
  "APLICADA", e o backfill não tinha escrito uma linha.

### O resto da reescrita

Gravar via `eapToPersisted` em vez do valor cru, clone-teste com duas passadas,
e só então aplicar — migration primeiro, build na mesma janela.

### E a barreira confere os três estados também

`barreira-de-acoplamento.cjs` hoje pergunta só *"existe linha com
`item_type='entrega'`?"*. Isso distingue **C** de **não-C**, e trata A e B como
a mesma coisa — o que é suficiente para barrar o build, mas não para explicar o
que fazer.

Ela passa a reportar qual dos três estados o banco está, porque o conserto é
diferente em cada um: em **A** roda a migration inteira; em **B** roda só o
backfill, e há 785 linhas cujo original está preservado e precisa continuar
assim; em **C** o build pode subir.

---

## 4 · O marco promovido no projeto de teste

**Achado durante o incidente de 27/08, e não causado por ele.**

`904fbbf3` — *Milestone 1 - Lançamento do Projeto* — está com
`estagio='quadro'`, na coluna "Em Andamento", **mas marco nunca vira cartão**.
Alguém o promoveu em algum momento e o quadro simplesmente nunca o desenhou.

Provavelmente deve voltar para a fila, mas é decisão de quem cuida do projeto.
Ficou **de fora** do script de incidente de propósito: consertar de passagem o
que o incidente não causou é como se perde a fronteira do que foi mexido e por
quê.

---

## 5 · Dois sintomas relatados no incidente — conferir DEPOIS da reversão

Relatados pelo Raphael em 27/08, com o build quebrado no ar. **Não foram
investigados de propósito**: sintoma observado durante um incidente não é
diagnóstico, e conferir com o sistema instável produz conclusão errada com
aparência de certeza.

Voltar a eles **com o sistema estável**, na ordem abaixo.

### a) O quadro não agrupa — nenhuma faixa aparece

**Hipótese (do Raphael, plausível e não verificada):** a faixa agrupa cartões;
sem cartão embaixo, ela não existe.

Isso é coerente com o que já se sabe: os quatro itens promovidos no projeto de
teste são todos `item_type='fase'` e portanto faixa, e as filhas deles nunca
foram promovidas. Uma faixa sem nenhum cartão sob ela não tem o que desenhar.

**Como confirmar:** depois da reversão e do UPDATE, promover uma atividade
comum para o quadro e ver se a faixa do pai dela aparece.

> **Se houver cartão e ainda assim não houver faixa, aí é defeito** — e o lugar
> de olhar é `faixaDoCartao`, que sobe por `parent_id` até achar um agrupador
> **que esteja no quadro**. Um pacote ainda na fila não desenha faixa, e isso é
> intencional.

### b) Subatividades não permanecem no quadro

**Hipótese (do Raphael):** é o desenho — subatividade não vira cartão sozinha,
aparece no contador do cartão do pai.

**A hipótese está certa na primeira metade e precisa de uma correção na
segunda.** Fui conferir antes de registrar:

> **O contador existe.** `KanbanCard.tsx:1054` renderiza *"N subatividades"*, e
> `ActivityKanban.tsx:3421` alimenta o valor. Não é peça faltando.

O problema é a condição que o mostra:

```js
(isPhase || cardFields.subCount) && subActivityCount > 0
```

Ele aparece se o item for **agrupador** (`isPhase`) — **ou** se o usuário tiver
ligado o campo `subCount` nas preferências de exibição do quadro. E
`subCount: false` é o padrão (`kanban/shared.ts:127`).

Até 27/08 isso funcionava por acidente: uma atividade com filhas **era**
`isPhase`, pela regra estrutural, então o contador aparecia. O item 4 tirou
essa regra — e com ela, sem querer, tirou o contador do caso mais importante.

**A consequência, que é o que o Raphael descreve:**

> Promover uma atividade que tem filhas **esconde as filhas sem dizer nada**. As
> filhas não viram cartão (correto, por desenho), e o cartão do pai não anuncia
> que elas existem (defeito, porque depende de uma preferência desligada).

**A varredura pelos outros caronas foi feita** (27/08): 13 leitores da regra,
**12 perguntavam mesmo "é uma caixa?" e continuam certos**; o contador é o único
quebrado. Ver [caronas-da-regra-removida-27-08-2026.md](medicoes/caronas-da-regra-removida-27-08-2026.md)
— existe para ninguém refazer a busca.

**O conserto** é tirar o contador de trás da preferência quando o item tem
filhas: um cartão com subatividades sempre diz quantas. A preferência
`subCount` continua fazendo sentido para quem quer escondê-la deliberadamente,
mas não pode ser a razão de o dado sumir por padrão.

Isso encaixa com o item 1 desta fila (a coluna "Situação" no backlog): os dois
são a mesma família — **o sistema deixou de mostrar onde as coisas estão**.

---

## 6 · A tela da atividade — CONSTRUÍDA (parcial)

**Feita em 27/08.** A rota `/project/:id/atividade/:activityId` deixou de
redirecionar e passou a abrir a tela nova.

### Correção do que este documento dizia antes

Registrei aqui que a seção 02 tinha 23 caracteres e estava cortada, e por isso
não construí. **Eu media errado** — extraía do `<h2>` até o `<h2>` seguinte, e
o conteúdo vive num `<div class="palco">` depois do cabeçalho. Medida pelos ids
das seções: **02 tem 2.236 caracteres, completa**, com layout, blocos e feed.

### O que está pronto

| | |
|---|---|
| rota própria | `/project/[id]/atividade/[activityId]`, no build (12,5 kB) |
| uma tela, três estados | `editar` · `visualizar` · `criar` no mesmo componente |
| trilha | lê `activity_breadcrumb`, que nenhuma tela usava |
| resumo | responsáveis no plural, participantes, previsto, realizado, esforço, GUT, fase, pacote, origem, custo |
| subatividades | com total vindo de `derived_*` |
| o sino | feed com evento e comentário, marcando "na subatividade" |
| edição no lugar | sem modo Editar; campo sem permissão vira **texto** |
| botões | sem permissão **não aparecem** — nunca apagados |

Travado por 23 asserções em `verificar-tela-da-atividade-v2.cjs`, incluindo uma
que conta as colunas da trilha e falha se alguma proibida entrar.

### O que falta nela

- **descrição rica** — hoje é texto multilinha; falta lista de conferência,
  link e @menção (o desenho mostra as três);
- **o feed ligado ao banco** — a coluna existe e desenha, mas recebe `[]`:
  falta consumir `feed_da_subarvore`;
- **estado "criar" ligado** — o componente aceita `estado="criar"` e tem
  "Criar e continuar criando", mas nenhuma rota o aciona ainda;
- **lição aprendida** — o formulário de 4 campos não foi feito;
- **seções 05, 06 e 08** do desenho continuam ausentes, e são o que descreve
  os quatro estados de um campo e de onde se cria.

---

## 7 · Cor por data — vermelho no que já acabou

**Origem:** conferência de tela do Raphael, 28/08/2026.

### O defeito

Item **concluído** continua vermelho. Item **parado no backlog** também. A cor
sai de *"a data passou"* sem perguntar se ainda há o que fazer.

Confirmado no código: `estaAtrasado` (`lib/dataLocal.ts:88`) é

```ts
return parseDataLocal(valor).getTime() < hojeLocal().getTime();
```

Só compara datas. Não olha status, não olha estágio. E **44 pontos** do código
decidem "atrasado" a partir dela ou de `isOverdue` — cada um livre para pintar
como quiser.

### A regra

| situação | cor | texto |
|---|---|---|
| **concluída** | verde, sempre | — |
| **em execução** e vencida | vermelho | com contagem de dias |
| **no backlog** e vencida | âmbar | "vencida", **sem** contagem de dias |
| **sem data** | sem cor | — |

O âmbar sem contagem é a parte que importa: um item na fila com prazo velho não
está atrasado — **está por começar**. Contar dias ali transforma planejamento
antigo em dívida, e a tela passa a gritar sobre coisa que ninguém prometeu.

### Como fazer

**Uma função só decide**, e todas as telas leem dela. Hoje são 44 lugares — a
mesma família das duas listas de "quem agrupa" e das três fórmulas de progresso,
que já custaram caro aqui.

A função precisa dos três: **data**, **status** e **estágio**. Uma que receba só
a data não consegue responder — e é por isso que `estaAtrasado` não serve como
base: ela responde a pergunta errada com precisão.

`estaAtrasado` **continua existindo** para quem pergunta literalmente "esta data
já passou?" (a coluna Previsto do backlog, por exemplo). O que muda é quem
decide **cor**.

---

## 8 · O evento de texto rico no feed — `incluir_e_atribuir` perdeu o passo 3

**Origem:** 28/08/2026. A migration `20260827160000_incluir_e_atribuir` gravava a
frase inteira ("Fulano incluiu Beltrano na equipe e atribuiu") em
`public.activity_feed_eventos`. Essa tabela **não existe**: foi descartada no
commit `ad38feb`. A função aplicava (plpgsql adia a resolução de nomes) mas
**abortava em runtime a cada chamada**, revertendo o incluir+atribuir e devolvendo
erro cru do Postgres. O passo 3 foi **removido** para o crítico (vínculo +
atribuição na mesma transação, recusa em português) voltar a funcionar.

**O que se perdeu, medido:** a ação some do feed. `activity_assignees` **não tem
gatilho de auditoria** (`audit_log` tem 0 linhas dela) e a view `activity_feed_events`
só mostra audit de `table_name='activities'`. Não há fallback de texto seco.

### A pergunta que vem ANTES de restaurar qualquer coisa

**Por que `activity_feed_eventos` foi descartada em `ad38feb`?** O commit seguinte
(`a4c2b8de`) diz "a tabela que eu ia criar JÁ EXISTIA — consome a fase 08". Mas a
fase 08 entregou uma **view** (`activity_feed_events`, une `activity_comments` +
`audit_log`) — nenhum dos dois tem campo de **texto livre** para um evento como
"X incluiu Y". Então ou o descarte foi correto e a frase rica precisa de outro
desenho, ou foi engano e a tabela deve voltar. **Responder isso primeiro** —
restaurar por reversão uma tabela apagada de propósito, sem saber o motivo, arrisca
duas tabelas fazendo o mesmo trabalho (já aconteceu nesta semana).

### Só então decidir o sink

Candidatos, quando a pergunta acima tiver resposta: (a) restaurar
`activity_feed_eventos` com coluna de texto e ligá-la como 3º ramo da view; (b) um
gatilho de auditoria em `activity_assignees` (texto seco, mas aparece); (c) outro
desenho. Nenhum deve entrar no mesmo lote de uma publicação — muda a view que o
sino e o feed leem.

---

## Esperando gente, não código

- **Quem publicou** em 26/08 18:01 e em 27/08 12:08 — e qual `APP_VERSION`.
- **Qual perfil do Williame** é o correto: ~450 atividades aguardam.
- **A conversa sobre a P00**, que já está valendo e concede o projeto inteiro a
  quem entra por atribuição.
- **As seções 05, 06, 08, 09, 10 e 11** do desenho, que nunca chegaram.
