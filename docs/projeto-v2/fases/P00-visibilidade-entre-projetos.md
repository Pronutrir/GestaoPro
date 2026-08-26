# P00 · A visibilidade entre projetos  (não estava no kit — é furo confirmado)

**Onda 1 · antes de tudo** · exige migration · **a única desta onda que pode tirar leitura de
alguém se sair errada**

> **JÁ ESCRITA.** A migration é `20260826150000`, o rollback é `20260826150001`, e o script
> é `scripts/apply-p00-escopo-de-leitura.sh` — com a sonda de cinco perguntas, incluindo a
> que decide (quantas dessas atividades a pessoa mexeu nos últimos 90 dias).
>
> **Pendente de aplicar na VM**, depois de `apply-fase02-assignees.sh`.

## O que foi confirmado no código

O kit acrescentou à fase 03 do Atividade v2 um item sobre as listas globais. Ao conferir,
o furo é **maior** do que o texto sugere — e a causa não está na consulta.

**A consulta de Pendências** (`app/(dashboard)/pendencias/page.tsx:95`) seleciona `activities`
sem filtro de visibilidade, confiando na RLS. Isso seria correto, se a RLS recortasse.

**A policy não recorta:**

```sql
-- 20260818150000_convidado_da_atividade.sql:151
CREATE POLICY ... ON public.activities
FOR SELECT TO authenticated
USING (public.can_view_project_work_v2(project_id, auth.uid()));
```

E `can_view_project_work_v2` devolve `true` para quem tem **qualquer** atividade no projeto:

```sql
SELECT can_view_project_v2(...) OR tem_atividade_no_projeto_v2(...)
```

**Consequência:** quem entra só por atribuição recebe **todas as atividades do projeto**. As
irmãs inclusive. Dentro do projeto isso ficava disfarçado porque `isActivityScoped` zera as
permissões de escrita — a pessoa vê e não edita. Pela lista global, vê sem disfarce.

## Por que isto não é "melhoria de tela"

Consertar em Pendências resolveria uma tela. Cronograma global, Visão Geral e qualquer
relatório novo continuariam abertos — e a P11 (biblioteca entre projetos) nasceria com o
mesmo furo, porque busca entre projetos lê a mesma tabela.

A correção é **uma**, e é na policy.

## O que já existe pronto

A fase 02 do Atividade v2 (migration `20260826120000`, **ainda não aplicada**) escreveu:

- `eh_descendente_de_atividade_do_ator(activity_id, user_id)` — a atividade é dela ou
  descendente de alguma em que ela atua
- `activity_breadcrumb` — a trilha de ancestrais, sem contador, sem soma, sem pessoa
- `activity_dependency_card` — a dependência que bloqueia, mesmo sendo irmã invisível

Falta a policy consumir isso.

## Prompt

```
Aperte a policy de SELECT de `activities` para respeitar o escopo de leitura:

  - equipe, líder, gestor, admin  -> o projeto inteiro (como hoje)
  - quem entra SÓ por atribuição  -> a própria atividade e a SUBÁRVORE dela
  - a trilha de ancestrais         -> pela view activity_breadcrumb
  - a dependência que bloqueia     -> pela view activity_dependency_card

Use `eh_descendente_de_atividade_do_ator`, já escrita na migration
20260826120000. NÃO escreva uma segunda função com a mesma pergunta.

ANTES de escrever a migration, sonde a base e responda:
  a) quantas pessoas hoje entram em algum projeto SÓ por atribuição;
  b) para cada uma, quantas atividades ela enxerga hoje e quantas passaria a
     enxergar;
  c) alguma delas tem atividade cujo pai está em outro ramo — ou seja,
     perderia contexto que hoje usa?
  d) DAS ATIVIDADES QUE CADA UMA DEIXARIA DE VER, quantas ela abriu nos
     últimos noventa dias? Esta é a pergunta que decide. "Deixa de ver 40"
     assusta e trava a decisão; "deixa de ver 40, e abriu zero em noventa
     dias" é sinal verde. Sem (d), a sonda produz um número grande e nenhuma
     conclusão.

Se (a) for zero, a mudança não afeta ninguém hoje e passa a valer daqui pra
frente. Se não for, a lista de (b) precisa ser lida antes de aplicar.

Escreva a migration de rollback junto, e um script de apply com sonda antes,
confirmação e sonda depois — o padrão dos outros scripts do repositório.

Depois, e só depois, faça Pendências, Cronograma global e Visão Geral
consumirem a camada de acesso explicitamente. Um teste por consulta: um
usuário que no projeto só enxerga a própria atividade não vê as irmãs por
nenhuma dessas telas.
```

## Pronto quando

- A sonda (a) foi lida e registrada no PR.
- Um usuário que entra por atribuição não vê as irmãs em **nenhuma** das quatro telas.
- Ele continua vendo a trilha do pai e as próprias subatividades.

## Descendente não é ancestral

`eh_descendente_de_atividade_do_ator` cobre a atividade e a **subárvore** dela. O caminho
**para cima** é outra pergunta — e é a view `activity_breadcrumb` que a responde.

Se a troca do braço do `OR` não preservar essa via, a pessoa perde a trilha junto com as
irmãs, e o sintoma deixa de ser "sumiu um item da lista": vira **"a tela da atividade abriu
sem cabeçalho"**, que ninguém relaciona a uma mudança de policy.

As duas views já nascem com `security_invoker = false` justamente para sobreviver a este
aperto (corrigido na migration `20260826120000` — ver `DIVERGENCIAS.md` item 5), e a
verificação de lá **falha alto** se alguém as devolver a `invoker`. **Confirme na sonda:**
depois de apertar a policy, a breadcrumb ainda responde para quem entra por atribuição?

E ela **não carrega feed**. A fase 08 faz o feed do pai agregar eventos das filhas — um feed
na trilha reabriria o mesmo vazamento por outra porta.

## Não faça

- **Não aplique sem a sonda.** Esta é a única mudança da onda que pode tirar leitura de quem
  trabalha, e o sintoma é imediato e silencioso: a pessoa abre a tela e o item sumiu.
- Não conserte só em Pendências. A porta é a policy; a tela é a maçaneta.
- Não escreva uma segunda função de "é descendente". Já existe uma.
