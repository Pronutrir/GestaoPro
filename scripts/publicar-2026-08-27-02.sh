#!/bin/bash
set -e
# ============================================================================
# PUBLICAR 2026-08-27-02 — a leva do conserto para a frente
#
# RODAR NUMA MAQUINA COM DOCKER. Nao ha Docker na maquina onde este script foi
# escrito (nem Podman, nem CI): commit e push estao feitos, o build e o deploy
# nao.
#
# ----------------------------------------------------------------------------
# O QUE ENTRA
#
#   * promover agrupador passa a ser RECUSADO, com a mensagem que o arrasto ja
#     usava — no botao, no menu e no arrasto. Nunca mais aceitar em silencio.
#   * o contador de subatividades sai das preferencias: cartao com filhas
#     SEMPRE diz quantas.
#   * coluna SITUACAO no backlog, entre PREVISTO e ESFORCO — vazia na fila,
#     ponto de 7px + palavra no quadro.
#   * chip "No quadro" ao lado de "Sem responsavel" e "Sem data".
#   * a faixa de grupo diz "4 de 6 no backlog".
#   * o rodape conta o total de verdade: dizia "6" num projeto com 107 folhas.
#
# NENHUMA MIGRATION. E so codigo — por isso nao ha clone-teste aqui.
#
# ----------------------------------------------------------------------------
# O QUE NAO ENTRA, e por que
#
#   * OS 68 PRESOS NO QUADRO. A migration 20260827140000 esta escrita e NAO
#     aplicada: medido antes de aplicar, ela liberta 1 dos 68. Os outros 67 tem
#     wbs_code de nivel 2 ou 3, e resolveEapKind decide por POSICAO antes de
#     olhar o campo. Libertar os 67 exige mexer na deducao por nivel, que esta
#     leva excluiu do escopo.
#
#   * A TELA DA ATIVIDADE. As secoes 02, 05, 06 e 08 do desenho nao chegaram —
#     a 02, indicada como referencia principal, tem 23 caracteres e termina em
#     HTML cortado.
#
# ----------------------------------------------------------------------------
# POR QUE PULAR_BARREIRA=1, E O QUE ISSO ASSUME
#
# A barreira recusa este build, e ela esta CERTA: ela exige o backfill do
# congelamento, que nao rodou (estado B — a sombra existe, o backfill nao).
# Nada nesta leva satisfaz isso, e a migration retomavel que resolveria ainda
# nao existe.
#
# Pular e aceitavel aqui por um motivo especifico: o build com a leitura pura
# JA ESTA NO AR desde 27/08 12:08. O acoplamento ja foi rompido — esta leva nao
# o piora, ela corrige parte dos efeitos. Recusar o build agora manteria o
# defeito no ar sem nada em troca.
#
# NAO tome isto como precedente: PULAR_BARREIRA=1 num banco sem o incidente ja
# instalado seria criar o incidente de novo.
# ============================================================================

VERSAO="${1:-2026-08-27-02}"
COMMIT_ESPERADO="47f27b1"

command -v docker >/dev/null 2>&1 || {
  echo "ERRO: docker nao encontrado. Este script precisa rodar onde ha Docker."
  exit 1
}

echo "── ANTES ──"
echo ""
echo "  versao a publicar : ${VERSAO}"
echo "  commit local      : $(git rev-parse --short HEAD)"
echo "  commit esperado   : ${COMMIT_ESPERADO} (ou mais recente)"
echo "  branch            : $(git rev-parse --abbrev-ref HEAD)"
echo ""

if [ -n "$(git status --porcelain)" ]; then
  echo "  ATENCAO: ha alteracoes nao commitadas. O build usa o que esta em disco,"
  echo "  nao o que esta no commit — e depois ninguem sabe o que foi ao ar."
  git status --short
  echo ""
  read -r -p "  Continuar mesmo assim? [s/N] " R
  case "$R" in s|S|sim|SIM) ;; *) echo "Cancelado."; exit 0 ;; esac
fi

echo "  O QUE ESTA NO AR AGORA:"
node scripts/data-do-build-no-ar.cjs 2>/dev/null | tail -3 || echo "    (nao consegui consultar)"

echo ""
read -r -p "Publicar ${VERSAO}? [s/N] " RESP
case "$RESP" in s|S|sim|SIM) ;; *) echo "Cancelado. Nada foi publicado."; exit 0 ;; esac

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  BUILD"
echo "══════════════════════════════════════════════════════════"
PULAR_BARREIRA=1 ./scripts/build-prod.sh "${VERSAO}"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  PUSH DA IMAGEM"
echo "══════════════════════════════════════════════════════════"
docker push "pronutrir/gestaopro:${VERSAO}"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  SUBIR NA VM"
echo "══════════════════════════════════════════════════════════"
APP_VERSION="${VERSAO}" docker compose -f docker-compose.prod.yml up -d app

echo ""
echo "── DEPOIS ──"
sleep 5
node scripts/data-do-build-no-ar.cjs 2>/dev/null | tail -3 || true

cat <<REGISTRO

  ── ANOTE EM docs/deploys.md, AGORA ──

  | data/hora | APP_VERSION | commit | quem publicou | o que entrou |
  | $(date '+%d/%m/%Y %H:%M:%S') | ${VERSAO} | $(git rev-parse --short HEAD) | <SEU NOME> | conserto para a frente: promocao recusada, contador, coluna Situacao, rodape |

  E registre TAMBEM que a barreira foi pulada, e por que — senao a proxima
  pessoa a ver PULAR_BARREIRA no historico nao vai saber se foi decisao ou
  descuido.

  ── DEPOIS DISSO ──

  As SETE CONFERENCIAS de docs/ORDEM-DE-PUBLICACAO.md, com uma segunda pessoa
  que NAO seja administrador do sistema.

  Atencao a duas delas, que vao falhar DE PROPOSITO nesta leva:
    - a conferencia 2 (fase e pacote sao faixa): os 68 continuam presos,
      porque a migration deles nao entrou;
    - a conferencia 6 (criar subatividade): depende do backfill, que nao rodou.

  As outras cinco valem, e a 4 (numeros da faixa) e a que testa o que mudou.

REGISTRO
