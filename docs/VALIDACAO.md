# Guia de validação — o que foi construído, e como conferir

Sessão de **25–26/08/2026**, branch `fix/correcoes_2`. **31 commits**, todos enviados.

Este documento existe porque a pergunta *"as fases foram implantadas?"* tem duas respostas
diferentes, e confundi-las custou tempo:

| | Estado |
|---|---|
| **Código no repositório** | completo — 31 commits, 8 suítes de verificação |
| **Banco de produção** | **intocado** — 5 de 6 migrations pendentes |

Um `✓` num conferidor de arquivos significa *"o código existe"*. Nunca *"está funcionando"*.

---

## Parte 1 — o que JÁ funciona no próximo deploy

Estas correções são só de código. Assim que a aplicação subir, valem.

### 1.1 A lixeira parou de mentir

**Antes:** "Excluir permanentemente" não checava permissão e não lia a resposta do banco. A RLS
recusava e a tela dizia *"Atividade excluída permanentemente!"*.

**Como validar:** entre com alguém que **não** gerencia o projeto, abra a lixeira do backlog e
tente excluir permanentemente. Deve aparecer *"Sem permissão"*, não uma falsa confirmação.

Commit `6aa5436` · `BacklogSection.tsx`, `ProjectFlatList.tsx`

### 1.2 O marco não volta ao Kanban

**Antes:** marcos apareciam recuados sob a fase, travados, com o selo de uma coluna — sem poder
ser arrastados nem editados. Era o defeito que abriu esta sessão.

**Como validar:** abra um projeto com marcos (ex.: as NF-e de prefeitura). No quadro, nenhum
marco deve aparecer — nem como card, nem aninhado sob a fase. Eles seguem no Backlog e no
Cronograma.

Commit `0c96834` · `ActivityKanban.tsx`

### 1.3 O histórico parou de mostrar UUID

**Antes:** `Etapa: 4533f517-… → 983f39d9-…` e `Status: pending → completed`.

**Como validar:** mova uma atividade de coluna, abra a aba **Histórico** dela. Deve dizer
`Etapa: Não iniciado → Em Andamento`. UUID desconhecido vira `—`, nunca o identificador.

Commit `07bb759` · `ActivityRegistro.tsx`, `AuditLogPanel.tsx`

### 1.4 O campo de participantes diz o que concede

**Antes:** a aba se chamava "Equipe" e o campo "Equipe do Projeto" — três nomes para a mesma
coisa, e nenhum dizia que participante **edita** a atividade.

**Como validar:** abra uma atividade → aba **Participantes**. O campo diz *"Participantes da
atividade"*, com a linha *"Trabalham junto nesta atividade e também podem editá-la"*.
Quem não está na equipe do projeto aparece **desabilitado, com o motivo** — não some da lista.

Commits `81494c1`, `e0b267c`, `1a78187`

### 1.5 O GUT mostra o número, e só colore a partir de 60

**Antes:** o selo mostrava só o rótulo ("Alta"), colorido em toda faixa — o score, que é o
diferencial do produto, ficava invisível.

**Como validar:** no Kanban, o selo de prioridade mostra o número (1–125). Abaixo de 60 fica
cinza; 60–99 âmbar; 100+ vermelho. Onde não há avaliação, o texto é *"Prioridade não
avaliada"*.

Commit `e0126f3` · `KanbanCard.tsx`

### 1.6 Quem criou a atividade consegue movê-la

**Antes:** o front recusava mover atividade que a própria pessoa criou — enquanto o banco
aceitava. Front mais restritivo que o banco.

**Como validar:** crie uma atividade sem se pôr como responsável, e tente movê-la em lote no
backlog. Deve funcionar.

Commit `84ca29c`

### 1.7 O sino no Registro

**Como validar:** peça a alguém para comentar numa atividade sua. Ao abrir, a aba **Conversa**
mostra um contador. Ele **não** conta o que você mesmo escreveu, e uma atividade aberta pela
primeira vez não mostra número.

Commit `28b3a11`

### 1.8 A rota da atividade

**Como validar:** abra `/project/<id>/atividade/<id-da-atividade>`. Deve abrir a atividade
sobre a visão do projeto. O F5 mantém; o voltar do navegador fecha.

Commit `b8a41c5`

---

## Parte 2 — o que depende das migrations

**Nada disto funciona hoje.** Rodar na VM, **nesta ordem** — cada script recusa se o anterior
faltar:

```bash
export PGPASSWORD=...

./scripts/apply-visualizar-nao-edita.sh      # 1º
./scripts/apply-fase02-assignees.sh          # 2º
./scripts/apply-p00-escopo-de-leitura.sh     # 3º  ← LEIA A SONDA
./scripts/apply-fase09-derivacao.sh          # 4º
./scripts/apply-fase04-estagio.sh            # 5º
```

Cada um mostra números **antes** de mudar qualquer coisa e pede confirmação.

### O que cada uma muda, e como validar

| # | Migration | Muda | Como validar |
|---|---|---|---|
| 1 | `…150000` Visualizar não edita | "Visualizar e comentar" passa a barrar de verdade | Ponha alguém como "Visualizar e comentar" **e** responsável por uma atividade. Ele não deve conseguir editá-la. **Medido: 0 pessoas afetadas hoje.** |
| 2 | `…120000` fase 02 | Cria `activity_assignees`, `activity_watchers` e as duas views | A sonda mostra quantas linhas o backfill criou. Nada muda na tela — as colunas antigas seguem sendo a fonte. |
| 3 | `…150000` P00 | **Fecha o furo de visibilidade** | Ver abaixo — é a única que pode tirar leitura de alguém. |
| 4 | `…130000` fase 09 | Derivação de horas/custo/datas no servidor | Depois de aplicada, o total do pai passa a vir do banco. A sonda mostra quantos marcos perderão horas. |
| 5 | `…140000` fase 04 | Campo `estagio` como espelho | Nada muda na tela — nenhum código o lê ainda. **Guarde a saída do critério de abandono.** |

### A P00 merece atenção

É a **única mudança desta sessão que pode tirar leitura de quem trabalha**, e o sintoma é
imediato: a pessoa abre a tela e o item sumiu.

O furo: quem entra num projeto só por atribuição enxerga **todas** as atividades dele — as dos
outros inclusive. Não é defeito de tela; é a policy.

A sonda faz cinco perguntas. **A que decide é a (e):** das atividades que a pessoa deixa de
ver, quantas ela **mexeu nos últimos 90 dias**.

- Tudo **zero** → sinal verde, aplique.
- Qualquer número acima de zero → leia **quem** é, e converse antes.

Rollback pronto: `supabase/migrations/20260826150001_p00_rollback.sql`.

---

## Parte 3 — as verificações automáticas

Rodam sem banco e sem navegador. **273 no total:**

```bash
node scripts/verificar-matriz-acesso.cjs           # 108 — a matriz inteira
node scripts/verificar-acesso-atividade.cjs        #  30 — a regra de acesso
node scripts/verificar-mesa-de-planejamento.cjs    #  42 — as sete decisões visuais
node scripts/verificar-tela-da-atividade.cjs       #  37 — quem edita o quê
node scripts/verificar-agregado-do-pai.cjs         #  24 — o rollup
node scripts/verificar-rotulos-do-historico.cjs    #  13 — sem UUID
node scripts/verificar-sino-do-feed.cjs            #  11 — o sino
node scripts/verificar-rollup-nao-persiste.cjs     #   8 — guarda de regressão
```

Todas verificam o **código real** (compilado na hora), não uma reimplementação — reimplementar
a regra no teste é como as duas metades de `canMutateActivity` divergiram por meses.

---

## Parte 4 — o que NÃO foi feito, e por quê

### As telas das fases 06 e 07

A **regra** está pronta e testada (79 verificações): quando o GUT colore, o que distingue "a
definir" de "não se aplica", qual campo vira texto, o que "salvo" significa.

A **pintura** não: a tabela em árvore com faixas de grupo, a barra de seleção flutuante, a
navegação por teclado, a unificação painel+modal.

`BacklogSection.tsx` tem 3.500 linhas. Reescrever a renderização sem poder abrir o navegador
produz código que passa no `tsc` e pode estar quebrado de dez maneiras que nenhuma ferramenta
detecta. Com a aplicação de pé, isso se faz em uma sessão.

### A Onda B (Projeto v2)

Documentada em `docs/projeto-v2/`, 14 fases. Nada começou — e várias dependem das migrations
acima (P05 e P06 precisam da fase 09; P11 precisa da P00).

---

## Parte 5 — divergências registradas

Onde o repositório contradisse os planos, o código venceu e ficou registrado:

- **`lider_id` nunca existiu** — o que existe é `assigned_to` + `participants`, com 284
  leituras. Ver `docs/atividade-v2/DIVERGENCIAS.md` item 1.
- **Marco não tem `wbs_code`** — decisão de 11/08, com o custo registrado (buracos na
  numeração, renumeração de vizinhos). Item 6.
- **"Agrupador nunca vira card" contradiz a decisão de 13/08**, que corrigiu um defeito
  relatado: *"você move uma fase inteira, as tarefas vão e a fase fica para trás"*.
  `docs/projeto-v2/DIVERGENCIAS.md` item 7.
- **O campo `estagio` é a terceira tentativa** de levar a separação backlog/quadro ao banco. As
  duas anteriores falharam igual. Por isso nasce como espelho, e o script imprime o critério de
  abandono.

---

## Achado colateral, não investigado

Existem **dois perfis ativos com o nome "Williame Correia de Lima"**, ids diferentes, ambos
membros do mesmo projeto.

Importa porque `assigned_to` é **texto livre com o nome**, e toda a comparação da RLS é por
nome. Com nome duplicado, "quem é o responsável" fica ambíguo. Vale olhar antes da P00, que
depende dessa comparação.

---

## Resumo

| | |
|---|---|
| Commits | 31, todos enviados |
| Verificações | 273, todas passando |
| Typecheck | limpo (só o `replaceAll` pré-existente de `indicadores-lab`) |
| Lint | em paridade com o baseline em todos os arquivos tocados |
| Migrations aplicadas | **1 de 6** |
| Testado em execução | **nada** |
