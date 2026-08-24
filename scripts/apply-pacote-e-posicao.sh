#!/bin/bash
set -e
# "As fases, entregas/pacotes e atividades nao ficaram da mesma forma."
#
# O modelo de EAP e POSICIONAL: nivel 3 e PACOTE DE TRABALHO, tenha filhos ou
# nao. O importador decidia por conteudo (`hasChildren`), entao o mesmo nivel
# da EAP virava pacote ou atividade conforme alguem tivesse detalhado.
#
# Corrigido no codigo (lib/eapModel). Esta migration alinha o que ja foi
# importado: 174 itens medidos em 24/08/2026.
#
# So nivel 3 EXATO ("1.2.1", nunca "1.2.1.1"), gravado como atividade e que
# NAO e marco. Idempotente.
#
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-pacote-e-posicao.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260824130000_pacote_e_posicao.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260824130000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES: como cada nivel esta gravado ──"
$PSQL -c "
SELECT array_length(string_to_array(wbs_code,'.'),1) AS nivel,
       item_type, count(*) AS qtd
  FROM public.activities
 WHERE is_trashed = false AND wbs_code ~ '^[0-9]+(\.[0-9]+)*$'
   AND is_milestone = false
 GROUP BY 1,2 ORDER BY 1,2;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/pacote_e_posicao.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/pacote_e_posicao.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (nivel 3 deve ser todo 'fase') ──"
$PSQL -c "
SELECT array_length(string_to_array(wbs_code,'.'),1) AS nivel,
       item_type, count(*) AS qtd
  FROM public.activities
 WHERE is_trashed = false AND wbs_code ~ '^[0-9]+(\.[0-9]+)*$'
   AND is_milestone = false
 GROUP BY 1,2 ORDER BY 1,2;"
