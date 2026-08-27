# Ordem de publicação — as entregas pendentes

> **Este arquivo diz o que publicar, em que ordem, e como voltar atrás.**
> O registro do que **já foi** publicado é outro: [deploys.md](deploys.md).
> O procedimento de build e push é o terceiro: [DEPLOY.md](DEPLOY.md).
>
> Estado em **27/08/2026**. Nada abaixo está no ar.

---

## ⚠ O PAR ACOPLADO — leia antes de qualquer coisa

**A entrega 3 tem uma migration que precisa ser aplicada ANTES ou JUNTO com o
build. Nunca depois.**

```
   ✅  migration 20260827130000  →  build com a leitura de item_type
   ✅  os dois na mesma janela, migration primeiro
   ❌  build primeiro, migration depois        ← 1.591 itens viram Fase na tela
```

### Por que, em uma frase

O código passou a **ler** `item_type` em vez de deduzir. O banco ainda tem o
lixo da importação: 1.591 linhas gravadas como `'fase'` que nunca foram fase —
são atividades comuns que receberam esse rótulo porque `fase`/`atividade` eram
os únicos dois valores disponíveis na importação da EAP.

Enquanto o código deduzia, esse lixo era inofensivo: `hasChildren` corrigia na
hora de exibir. Com a leitura pura, **o lixo vai direto para a tela**.

### O que o usuário veria, se alguém publicar fora de ordem

- **1.591 atividades exibidas como Fase** no Backlog, no Kanban e no Cronograma.
- Como Fase é agrupador, elas **somem do Kanban** — agrupador não vira cartão.
  Quem procurar a própria tarefa não a encontra.
- O Backlog passa a mostrar faixas de grupo onde havia linhas de trabalho.

Não corrompe dado — é só exibição, e some assim que a migration rodar. Mas por
algumas horas o sistema fica inutilizável para quem trabalha no quadro.

### A ordem segura

```bash
# 1º  a migration
PGPASSWORD=... ./scripts/apply-congelar-item-type.sh

# 2º  só então o build
./scripts/build-prod.sh 2026-08-27-01
docker push pronutrir/gestaopro:2026-08-27-01
APP_VERSION=2026-08-27-01 docker compose -f docker-compose.prod.yml up -d app
```

O inverso — migration depois do build — é o único erro que não dá para
corrigir "deixando quieto": tem de rodar a migration ou reverter o build.

---

## Estado das migrations

Conferido pelo **esquema**, não pela tabela de controle
(`node scripts/conferir-migrations.cjs` + sonda por coluna, 27/08):

| | |
|---|---|
| já aplicadas | tudo até `20260826190000` — incluindo fase 02, 04, 05, 08, 09, homônimos, progresso e a **P00** |
| **pendentes** | **três**, e são exatamente as três das entregas abaixo |

```
20260826200000  conversão nome → identificador     (entrega 1)
20260827120000  marco não tem responsável nem GUT  (entrega 2)
20260827130000  congelar item_type                 (entrega 3)  ← acoplada
```

---

# A sequência

Uma por vez. **Cada entrega é publicada e observada antes da seguinte** — são
três mudanças de dado em três dias, e publicar as três juntas torna impossível
saber qual causou um problema.

---

## 1 · Conversão nome → identificador

**Migration:** `20260826200000_conversao_nome_para_identificador.sql`
**Acoplada?** Não. A migration pode ir sozinha, e o código funciona com ela ou
sem ela — as leituras aceitam os dois formatos de propósito.

### O que muda na tela

Quase nada, e é intencional. A coluna `assigned_to` (texto com o nome) **não é
apagada** — ganha ao lado uma `assigned_to_id`. Quem já aparecia como
responsável continua aparecendo.

O que muda de verdade é invisível: **permissão deixa de ser decidida por nome**.
Hoje dois perfis chamados "Williame Correia de Lima" são a mesma pessoa para o
sistema, e um enxerga as atividades do outro.

### O que fica pendente de propósito

Os registros **ambíguos** — os que casam com mais de um perfil — ficam com
`assigned_to_id` nulo e o nome intacto. São ~450 atividades dos dois Williames.
O script de resolução em massa está escrito e **não roda sozinho**: alguém
precisa dizer qual perfil é o certo.

### Como reverter

Não há flag — o apply imprime estes dois comandos no fim:

```bash
docker cp supabase/migrations/20260826200001_conversao_rollback.sql supabase-db-1:/tmp/rb.sql
docker exec -e PGPASSWORD=... -i supabase-db-1 psql -U supabase_admin -d postgres -f /tmp/rb.sql
```

Derruba `assigned_to_id`. O nome nunca saiu, então não há o que restaurar.

---

## 2 · Marco não tem responsável nem GUT

**Migration:** `20260827120000_marco_nao_tem_pessoa_nem_gut.sql`
**Acoplada?** Não. A tela já parou de oferecer esses campos no commit `6ace54d`,
que já está no ar. Esta migration limpa o que ficou e impede que volte.

### O que muda na tela

**60 marcos** perdem o responsável; **3** perdem o GUT.

- **11 são vivos** — alguém pode notar que o nome sumiu do marco.
- **49 estão na lixeira**, e entram de propósito: restaurar um deles devolveria
  o dado sujo.

Se alguém usava o responsável do marco como "quem confirma", esse nome
**não se perde** — vai para a coluna sombra `marco_limpeza_backup`, e continua
consultável.

### O que trava depois

Duas `CHECK` constraints. Marco passa a **recusar** responsável e GUT em
qualquer via de escrita — tela, importação, API. É a mesma proteção que
`wbs_code` tem desde 11/08, e que hoje mostra zero registros sujos.

### Como reverter

```bash
PGPASSWORD=... ./scripts/apply-marco-sem-pessoa.sh --rollback
```
Derruba as duas constraints **primeiro** (restaurar com elas de pé falharia em
cada linha), devolve os valores pela sombra, e derruba a sombra.

---

## 3 · Congelar `item_type` + a leitura pura ⚠ ACOPLADA

**Migration:** `20260827130000_congelar_item_type.sql`
**Build:** o commit `7c9fde6` e tudo acima dele.
**Acoplada?** **SIM.** Ver o aviso no topo. Migration antes ou junto. Nunca
depois.

### O que muda na tela

**14 itens** trocam de rótulo: Entrega → **Atividade**. Sete estão vivos, todos
em projetos de teste ou piloto; sete estão na lixeira. A lista com id, projeto e
título está em
[os-14-que-mudam-de-rotulo-27-08-2026.md](medicoes/os-14-que-mudam-de-rotulo-27-08-2026.md).

**Mais nada muda de aparência** — medido nas 8.199 linhas, não numa amostra.

O campo é reescrito em **2.604 linhas**, e ninguém vê: o valor gravado passa a
ser o que a tela já mostrava.

### O que isso conserta

O tipo de um item **parava de mudar sozinho**. Antes, criar a primeira
subatividade transformava uma Atividade em Entrega sem ninguém ter decidido —
e uma Entrega que perdesse a última filha voltava a ser Atividade.

### Como reverter

**Os dois lados, ou nenhum.**

```bash
# 1º  o código  — voltar o build anterior
APP_VERSION=<versao-anterior> docker compose -f docker-compose.prod.yml up -d app

# 2º  o banco
PGPASSWORD=... ./scripts/rollback-congelar-item-type.sh
```

Reverter só o banco é **pior que não reverter**: o código continuaria lendo um
campo que voltou a ser lixo de importação — o cenário dos 1.591 descrito no topo.

O rollback recusa rodar se a coluna sombra estiver incompleta, e avisa disso na
saída.

---

# Depois de publicar

1. **Anote em [deploys.md](deploys.md)** — data, `APP_VERSION`, commit
   (`git rev-parse --short HEAD`) e quem publicou. É a única coisa que responde
   "o que está no ar" depois; a data se descobre pelo ETag
   (`node scripts/data-do-build-no-ar.cjs`), o commit não.
2. **Confira o esquema:** `node scripts/conferir-migrations.cjs`.
3. **Observe antes da entrega seguinte.**

## O que NÃO entra nesta leva

- **Fase 1, itens 4 e 5** (regra de tipo por nível; recálculo da EAP ao mover) —
  em construção.
- **Fases 2, 3 e 4** do comando de construção — não começadas.
- **A resolução dos dois Williames** — depende de decisão humana sobre qual
  perfil é o correto.
- **A conversa sobre a P00**, que já está valendo e concede o projeto inteiro a
  quem entra por atribuição. Não é publicação, é decisão pendente.
