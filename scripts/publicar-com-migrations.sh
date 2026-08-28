#!/bin/bash
set -e
# ============================================================================
# PUBLICAR — duas migrations antes do build, com conferencia de EFEITO entre elas
#
# RODAR NUMA MAQUINA COM DOCKER. Na maquina onde este script foi escrito nao ha
# docker, psql, nem supabase CLI, e o PostgREST nao expoe DDL (rpc/exec_sql
# devolve 404). Commit e push estao feitos; a aplicacao depende de quem tem
# acesso.
#
# ----------------------------------------------------------------------------
# AS TRES TRAVAS, E POR QUE CADA UMA EXISTE
#
# 1. CONFERENCIA DE EFEITO ENTRE AS MIGRATIONS, e o script PARA se reprovar.
#
#    O congelamento "rodou" e parou no meio: criou a coluna sombra, copiou os
#    valores antigos, e nao escreveu o backfill. Ninguem percebeu por dias --
#    porque toda conferencia perguntava "a coluna existe?", e ela existia.
#
#    A pergunta certa nao e se rodou. E se PRODUZIU O EFEITO.
#
# 2. A DATA NO AR VEM DA MAIOR ENTRE OS CHUNKS, nunca do webpack.
#
#    O chunk do webpack tem conteudo estavel entre builds, entao o mtime dele
#    pode ser o do build ANTERIOR -- e a conferencia diria que nada subiu.
#
# 3. REGISTRO EM deploys.md ANTES DE AVISAR QUE TERMINOU.
#
#    A data se descobre de fora pelo ETag. O COMMIT, nao: so o que estiver
#    escrito. Sem essa linha, daqui a uma semana ninguem sabe o que esta no ar.
#
# ----------------------------------------------------------------------------
# O QUE VAI AO AR
#
#   FASE C  a tela da atividade: feed ligado, descricao rica (lista de
#           conferencia, link, @mencao), rota de criar com "criar e continuar
#           criando", licao aprendida, incluir-e-atribuir
#   FASE E2 a deducao por nivel saiu -- 67 folhas presas viram cartao
#   FASE A  os 68 (ja aplicada no banco; e a E2 que a fez valer na tela)
#   FASE B  coluna Situacao, chip "No quadro", faixa "N de M", rodape
#
# RODAR:  PGPASSWORD=... ./scripts/publicar-com-migrations.sh [versao]
# ============================================================================

VERSAO="${1:-2026-08-27-03}"
CONTAINER="${CONTAINER:-supabase-db-1}"

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
command -v docker >/dev/null 2>&1 || { echo "ERRO: docker nao encontrado."; exit 1; }

PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

aplicar() {
  local versao="$1" arquivo="$2" nome="$3" chave="$4"
  echo ""
  echo "══════════════════════════════════════════════════════════════"
  echo "  $nome"
  echo "══════════════════════════════════════════════════════════════"
  [ -f "$arquivo" ] || { echo "ERRO: nao encontrei $arquivo"; exit 1; }

  docker cp "$arquivo" "$CONTAINER:/tmp/mig.sql"
  $PSQL -v ON_ERROR_STOP=1 -f /tmp/mig.sql
  $PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
            VALUES (${versao}, NOW()) ON CONFLICT DO NOTHING;"

  echo ""
  echo "  ── A CONFERENCIA DE EFEITO ──"
  # Nao basta "rodou sem erro": a pergunta e se produziu o efeito.
  if ! node scripts/conferir-migration-terminou.cjs "$chave"; then
    echo ""
    echo "  A MIGRATION NAO TERMINOU. Parando aqui, como combinado."
    echo "  NAO siga para a proxima nem para o build."
    exit 1
  fi
}

# ── 1) VISITAS ──────────────────────────────────────────────────────────────
aplicar 20260827150000 \
  "supabase/migrations/20260827150000_feed_visitas.sql" \
  "1 de 2 — nao-lido do feed (visitas)" \
  "feed"

# ── 2) INCLUIR E ATRIBUIR ───────────────────────────────────────────────────
aplicar 20260827160000 \
  "supabase/migrations/20260827160000_incluir_e_atribuir.sql" \
  "2 de 2 — incluir e atribuir na mesma transacao" \
  "incluir"

# ── 3) O BUILD ──────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  BUILD ${VERSAO}"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "  PULAR_BARREIRA=1 e necessario e a razao esta declarada:"
echo "  a barreira exige o backfill do congelamento, que NAO rodou (estado B)."
echo "  Nada desta leva depende dele -- o que sobe e codigo mais as duas"
echo "  migrations acima. Ver docs/O-QUE-FALTA.md item 3."
echo ""
PULAR_BARREIRA=1 ./scripts/build-prod.sh "${VERSAO}"
docker push "pronutrir/gestaopro:${VERSAO}"
APP_VERSION="${VERSAO}" docker compose -f docker-compose.prod.yml up -d app

# ── 4) A DATA NO AR, PELA MAIOR ENTRE OS CHUNKS ────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  A DATA NO AR"
echo "══════════════════════════════════════════════════════════════"
sleep 8
node scripts/data-do-build-no-ar.cjs

COMMIT=$(git rev-parse --short HEAD)

cat <<REGISTRO

  ── REGISTRE EM docs/deploys.md AGORA, ANTES DE AVISAR ──

  | $(date '+%d/%m/%Y %H:%M:%S') | ${VERSAO} | ${COMMIT} | <SEU NOME> | Fase C (tela da atividade), E2 (deducao por nivel), A e B |

  E anote que PULAR_BARREIRA=1 foi usado, e por que -- senao a proxima pessoa
  a ver isso no historico nao vai saber se foi decisao ou descuido.

  ── DEPOIS ──

  As sete conferencias de docs/ORDEM-DE-PUBLICACAO.md, com uma segunda pessoa
  que NAO seja administrador.

  Duas delas mudaram de expectativa nesta leva:
    - a 2 (fase e pacote sao faixa) agora PASSA: a deducao por nivel saiu e as
      67 folhas presas viram cartao;
    - a 6 (criar subatividade) tambem, porque nao depende mais do backfill.

REGISTRO
