#!/usr/bin/env bash
# Build da imagem de PRODUÇÃO do GestãoPro.
# As envs NEXT_PUBLIC_* são embutidas no bundle no build — sempre usar os valores de produção,
# independente do estado do .env local (que costuma estar em modo dev).
#
# Uso:
#   ./scripts/build-prod.sh              # usa APP_VERSION abaixo
#   ./scripts/build-prod.sh 2026-08-01-00  # sobrescreve a versão
set -euo pipefail
cd "$(dirname "$0")/.."

APP_VERSION="${1:-2026-07-12-01}"

# Produção: proxy same-origin na porta 80 (trocar para https://dominio quando houver TLS).
# Valores lidos do ambiente — não hardcodar chaves no script (evita vazamento em commits).
# Carrega de .env.prod se existir; senão exige as variáveis já exportadas.
if [ -f .env.prod ]; then
  set -a; . ./.env.prod; set +a
fi

PROD_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:?defina NEXT_PUBLIC_SUPABASE_URL (ex.: em .env.prod ou export)}"
PROD_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:?defina NEXT_PUBLIC_SUPABASE_ANON_KEY (ex.: em .env.prod ou export)}"

IMAGE="pronutrir/gestaopro:${APP_VERSION}"

# ---------------------------------------------------------------------------
# BARREIRA DE ACOPLAMENTO — escrita depois do incidente de 27/08/2026 12:08.
#
# Havia um `publicar-as-tres.sh` desde as 09:48 daquele dia, e ele não impediu
# nada: os comandos de build viviam dentro de um `cat <<TXT`, isto é, eram TEXTO
# IMPRESSO para um humano ler. Quem publicou pelo caminho normal — este script —
# passou por fora sem contorcer nada.
#
# Uma barreira que depende de alguém ler não é barreira, é uma placa. Esta roda
# aqui, no caminho que as pessoas usam de verdade, e derruba o build.
#
# Para forçar: PULAR_BARREIRA=1 ./scripts/build-prod.sh <versao>
# ---------------------------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  node scripts/barreira-de-acoplamento.cjs || exit 1
else
  echo "AVISO: node não encontrado — a barreira de acoplamento NÃO foi conferida."
  echo "       Confirme à mão que as migrations acopladas já estão aplicadas."
fi

echo "==> Buildando ${IMAGE}"
echo "    NEXT_PUBLIC_SUPABASE_URL=${PROD_SUPABASE_URL}"

docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="${PROD_SUPABASE_URL}" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="${PROD_ANON_KEY}" \
  --build-arg APP_VERSION="${APP_VERSION}" \
  -t "${IMAGE}" .

echo
echo "==> OK: ${IMAGE}"
echo "    Push:  docker push ${IMAGE}"
