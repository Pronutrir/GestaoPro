# Como publicar o Gestão Pro

> Escrito em **27/08/2026**, depois de um deploy que funcionou (26/08, ~18:01).
> Este arquivo existe para ninguém mais depender de memória.

---

## O resumo em cinco linhas

1. `git push` — **não publica nada**, só guarda o código.
2. `./scripts/build-prod.sh <versão>` — **numa máquina com Docker**.
3. `docker push pronutrir/gestaopro:<versão>`
4. Na VM: `docker compose -f docker-compose.prod.yml pull app && up -d app`
5. Migrations: `./scripts/apply-*.sh`, **antes** do passo 4 quando o código novo
   lê coluna nova.

Não existe automação. `.github/` tem só `copilot-instructions.md` — nenhum
workflow. Sem `.gitlab-ci.yml`, `Jenkinsfile`, `vercel.json`, `fly.toml`.

---

## O que é preciso ter na máquina que publica

| | |
|---|---|
| **Docker** | obrigatório. A máquina de desenvolvimento **não tem** — conferido |
| **`.env.prod`** | com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Fora do git |
| **Credencial do registry** | `docker login`, para `pronutrir/gestaopro` |
| **Acesso à VM** | SSH em `20.65.208.119` |
| **`PGPASSWORD`** | só para as migrations |

O build roda em **`node:22-alpine`** (fixado no `Dockerfile`). Guarde esse
número — ele aparece de novo lá embaixo.

---

## Os comandos, na ordem

### 1. Enviar o código

```bash
git push origin fix/correcoes_2
```

Separado de propósito: neste projeto o push só acontece quando pedido. O
runbook de 20/08 registra o custo de esquecer — o `git pull` do build traria a
EAP com um defeito de 6.000px porque dois commits ficaram na máquina local.

### 2. Construir a imagem — onde houver Docker

```bash
git pull
./scripts/build-prod.sh 2026-08-27-01     # a versão vai EXPLÍCITA
```

**Sempre passe a versão.** O padrão embutido no script é `2026-07-12-01`, de
julho: rodar sem argumento sobrescreve uma imagem antiga com conteúdo novo, e
`APP_VERSION` deixa de dizer o que está no ar.

As `NEXT_PUBLIC_*` são **embutidas no bundle** durante o build, não lidas em
runtime. Erradas aqui, o sintoma em produção é tela branca — por isso o
`Dockerfile` falha de propósito se vierem vazias.

### 3. Publicar a imagem

```bash
docker push pronutrir/gestaopro:2026-08-27-01
```

### 4. Trocar o contêiner na VM

```bash
export APP_VERSION=2026-08-27-01
docker compose -f docker-compose.prod.yml pull app
docker compose -f docker-compose.prod.yml up -d app
docker compose -f docker-compose.prod.yml ps    # confirma a versão no label
```

`docker-compose.prod.yml` **não constrói** — só puxa a imagem. Sobem dois
serviços: `app` (Next.js standalone, porta 8080) e `proxy` (nginx). A rede
`gestaopro-net` é externa e compartilhada com o Supabase; precisa existir antes
(`docker network create gestaopro-net`).

### 5. As migrations

**Migration antes do código, sempre que o código novo ler coluna nova.** Cada
script imprime números antes, pede confirmação, e imprime depois.

```bash
export PGPASSWORD=...
./scripts/apply-conversao-identificador.sh    # o que falta hoje — ver abaixo
```

---

## Como saber o que está no ar

### O jeito que funciona

```bash
# na VM
docker compose -f docker-compose.prod.yml ps
```

O label da imagem traz a `APP_VERSION`, e é a **única** resposta confiável.

### O jeito que NÃO funciona — e por quê

Comparar o hash dos chunks servidos com um build local **não identifica o
commit**. Foi tentado em 27/08 e falha por construção:

- o Docker constrói em **`node:22-alpine`**;
- a máquina de desenvolvimento roda **node 24.18**;
- versões diferentes de Node produzem hashes diferentes **para o mesmo código**.

Conferido: até `app/(auth)/login/page-*.js` — arquivo que ninguém tocou na
sessão — tem hash diferente entre produção e o build local, tanto no commit
mais recente quanto no anterior à sessão. O hash mede o ambiente de build, não
o conteúdo.

> **Para a próxima:** anote a versão e o commit ao publicar. Uma linha em
> `docs/deploys.md` resolve o que nenhuma investigação técnica resolve depois.

### Um marcador melhor, se quiser um dia

O `Dockerfile` já aceita `APP_VERSION` como build-arg e a grava como label
OCI. Expor isso numa rota (`/api/version`) tornaria a pergunta respondível sem
entrar na VM. **Não foi feito** — é mudança de código, e o pedido aqui era
descobrir e documentar.

---

## Como voltar atrás

### A aplicação

```bash
export APP_VERSION=<versão anterior>
docker compose -f docker-compose.prod.yml up -d app
```

A imagem volta na hora. **As migrations não voltam com isso.**

### As migrations

Cada uma tem rollback próprio, e derrubar a aplicação sem derrubar o banco é o
caminho normal — o esquema novo é aditivo e o código antigo o ignora.

| migration | rollback |
|---|---|
| `20260826150000` P00 | `20260826150001_p00_rollback.sql` |
| `20260826160000` sincronia | `20260826160001_fase05_rollback.sql` |
| `20260826180000` homônimos | `20260826180001_homonimos_rollback.sql` |
| `20260826190000` progresso | `20260826190001_progresso_rollback.sql` |
| `20260826200000` conversão | `20260826200001_conversao_rollback.sql` |

```bash
docker cp supabase/migrations/<rollback>.sql supabase-db-1:/tmp/rb.sql
docker exec -i supabase-db-1 psql -U supabase_admin -d postgres -f /tmp/rb.sql
```

> **O par que não se separa:** `20260826190000` (progresso) e o commit `6c60a67`
> do front. Reverter um sem o outro derruba 74 barras de progresso — a régua do
> banco e a da tela precisam combinar. Reverta os dois, ou nenhum.

---

## Conferir o que já está aplicado — pelo ESQUEMA, não pelo registro

As duas fontes já divergiram nesta semana, então confira as duas.

```bash
node scripts/conferir-migrations.cjs
```

O script pergunta ao **esquema** se cada objeto existe, e compara com
`schema_migrations`. Detalhe que custou uma investigação: perguntar com
`?select=<coluna>` **não serve** — o PostgREST ignora coluna inexistente e
devolve sucesso. Só filtrar por ela (`?<coluna>=not.is.null`) força o erro
`42703`. O script usa o filtro.

### Estado em 27/08/2026

| migration | objeto | esquema | registro |
|---|---|---|---|
| `…120000` fase 02 | `activity_assignees` | sim | sim |
| `…130000` fase 09 | `activities.derived_hours` | sim | sim |
| `…140000` fase 04 | `activities.estagio` | sim | sim |
| `…150000` **P00** | `pode_ler_atividade_v2()` | **sim** | sim |
| `…160000` sincronia | `resolver_profile_do_texto()` | sim | sim |
| `…170000` fase 08 | `feed_da_subarvore()` | sim | sim |
| `…180000` homônimos | `nome_e_ambiguo()` | sim | sim |
| `…190000` progresso | `percentual_da_coluna()` | sim | sim |
| `…200000` **conversão** | `activities.assigned_to_id` | **NÃO** | **NÃO** |

**As duas fontes concordam.** Oito aplicadas, uma faltando.

**A P00 está aplicada** — e isso importa, porque a orientação era não aplicá-la
antes de falar com o Bruno e o Williame. Ela já está valendo em produção.

Conferido em execução, chamando as próprias funções: numa atividade atribuída
ao nome ambíguo e **não criada** pelo perfil hotmail,
`is_activity_actor_v2` devolve `false` para ele e `true` para o corporativo —
que é exatamente o desenho. (Numa atividade que ele criou, devolve `true` pelo
`created_by`, que é identificador e via legítima.)

---

## O que falta aplicar nesta publicação

**Nada.** O código pendente de publicar é só front — o quadro (agrupador vira
faixa) e o backlog (total no rodapé, densidade). Nenhum deles lê coluna nova.

A conversão `20260826200000` **não é necessária para este deploy**: as telas
preferem `assigned_to_id` **quando existe** e caem no texto quando não — sem
fallback silencioso, porque o texto continua sendo a fonte declarada enquanto a
coluna não existir. Ela pode ir antes ou depois, e o script tem sonda própria.
