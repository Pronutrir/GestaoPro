#!/bin/bash
set -e
# ============================================================================
# DESEMPATE DO HOMÔNIMO — converte de uma vez os registros que ficaram
# pendentes, assim que alguém disser qual perfil é o certo.
#
# ESTE SCRIPT ESTÁ PRONTO E NÃO FOI RODADO. Ele espera uma decisão de pessoa:
# os dois perfis "Williame Correia de Lima" estão ativos e os dois escrevem
# (ver docs/medicoes/homonimos-26-08-2026.md). A pergunta é por qual login a
# pessoa entra hoje.
#
# O que ele faz:
#   - converte `assigned_to_id`, `participant_ids`, `owner_id`, `manager_id`
#     de TODOS os registros cujo texto é o nome ambíguo;
#   - NÃO toca no texto original nem na coluna sombra;
#   - mostra números antes, pede confirmação, e confere depois.
#
# O que ele NÃO faz: não funde perfis, não desativa ninguém. Decisão do
# Raphael — apenas marcar.
#
# USO, na VM:
#   PGPASSWORD=...  PERFIL=<uuid-do-perfil-correto>  ./scripts/desempatar-homonimo.sh
#
#   # opcional: restringir a um nome específico, se um dia houver mais de um
#   NOME="Williame Correia de Lima"
#
# DESFAZER: o texto e a sombra estão intactos, então basta
#   UPDATE activities SET assigned_to_id = NULL WHERE assigned_to_id = '<uuid>'
#     AND lower(btrim(assigned_to)) = lower(btrim('<nome>'));
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
: "${PERFIL:?defina PERFIL com o uuid do perfil escolhido}"
NOME="${NOME:-}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── PRÉ-REQUISITO ──"
$PSQL -v ON_ERROR_STOP=1 -c "DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='activities'
                    AND column_name='assigned_to_id') THEN
    RAISE EXCEPTION 'aplique a migration 20260826200000 ANTES desta';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '${PERFIL}'::uuid) THEN
    RAISE EXCEPTION 'o perfil % nao existe', '${PERFIL}';
  END IF;
END \$\$;"
echo "  ✓ colunas de conversão presentes e perfil existe"

echo ""
echo "── O PERFIL ESCOLHIDO ──"
$PSQL -c "SELECT id, full_name, email, role_title,
                 CASE WHEN is_active THEN 'ativo' ELSE 'INATIVO' END AS estado,
                 COALESCE(last_login_at::text, 'nunca') AS ultimo_login
            FROM public.profiles WHERE id = '${PERFIL}'::uuid;"

# Sem NOME, usa o(s) nome(s) daquele perfil que sejam ambíguos.
FILTRO_NOME="lower(btrim(a.assigned_to)) IN (
  SELECT lower(btrim(p.full_name)) FROM public.profiles p
   WHERE p.id = '${PERFIL}'::uuid AND p.full_name IS NOT NULL)"
if [ -n "$NOME" ]; then
  FILTRO_NOME="lower(btrim(a.assigned_to)) = lower(btrim('${NOME}'))"
fi

echo ""
echo "── ANTES — quantos serão convertidos ──"
$PSQL -c "
SELECT count(*) FILTER (WHERE a.is_trashed = false) AS vivas,
       count(*) FILTER (WHERE a.is_trashed = true)  AS na_lixeira,
       count(*) AS total
  FROM public.activities a
 WHERE a.assigned_to_id IS NULL
   AND a.assigned_to IS NOT NULL
   AND ${FILTRO_NOME};"

echo ""
echo "Por projeto (só as vivas):"
$PSQL -c "
SELECT p.title AS projeto, count(*) AS atividades
  FROM public.activities a
  JOIN public.projects p ON p.id = a.project_id
 WHERE a.assigned_to_id IS NULL
   AND a.assigned_to IS NOT NULL
   AND a.is_trashed = false
   AND ${FILTRO_NOME}
 GROUP BY 1 ORDER BY 2 DESC;"

echo ""
echo "E os projetos com dono/gestor ambíguo:"
$PSQL -c "
SELECT title AS projeto,
       CASE WHEN owner_id   IS NULL AND owner   IS NOT NULL THEN 'owner'   END AS c1,
       CASE WHEN manager_id IS NULL AND manager IS NOT NULL THEN 'manager' END AS c2
  FROM public.projects
 WHERE is_trashed = false
   AND ((owner_id IS NULL AND lower(btrim(owner)) IN
          (SELECT lower(btrim(full_name)) FROM public.profiles WHERE id = '${PERFIL}'::uuid))
     OR (manager_id IS NULL AND lower(btrim(manager)) IN
          (SELECT lower(btrim(full_name)) FROM public.profiles WHERE id = '${PERFIL}'::uuid)));"

echo ""
echo "   O TEXTO ORIGINAL NÃO SERÁ TOCADO. Só as colunas *_id são preenchidas."
echo ""
read -r -p "Converter todos para ${PERFIL}? [s/N] " RESP
case "$RESP" in
  s|S|sim|SIM) ;;
  *) echo "Cancelado. Nada foi alterado."; exit 0 ;;
esac

$PSQL -v ON_ERROR_STOP=1 <<SQL
BEGIN;

UPDATE public.activities a
   SET assigned_to_id = '${PERFIL}'::uuid
 WHERE a.assigned_to_id IS NULL
   AND a.assigned_to IS NOT NULL
   AND ${FILTRO_NOME};

-- participants: troca o NOME ambíguo pelo id, preservando os demais já
-- resolvidos. Só mexe em linha que ainda não converteu.
UPDATE public.activities a
   SET participant_ids = sub.ids
  FROM (
    SELECT x.id,
           array_agg(
             COALESCE(
               public.resolver_identificador_para_conversao(n),
               CASE WHEN lower(btrim(n)) IN (
                      SELECT lower(btrim(full_name)) FROM public.profiles
                       WHERE id = '${PERFIL}'::uuid)
                    THEN '${PERFIL}'::uuid END
             ) ORDER BY n) AS ids,
           bool_and(
             public.resolver_identificador_para_conversao(n) IS NOT NULL
             OR lower(btrim(n)) IN (
                  SELECT lower(btrim(full_name)) FROM public.profiles
                   WHERE id = '${PERFIL}'::uuid)
           ) AS todos_ok
      FROM public.activities x
      CROSS JOIN LATERAL unnest(x.participants) AS t(n)
     WHERE x.participant_ids IS NULL
       AND x.participants IS NOT NULL AND cardinality(x.participants) > 0
       AND btrim(COALESCE(n, '')) <> ''
     GROUP BY x.id
  ) sub
 WHERE a.id = sub.id AND sub.todos_ok;

UPDATE public.projects
   SET owner_id = '${PERFIL}'::uuid
 WHERE owner_id IS NULL AND owner IS NOT NULL
   AND lower(btrim(owner)) IN
       (SELECT lower(btrim(full_name)) FROM public.profiles WHERE id = '${PERFIL}'::uuid);

UPDATE public.projects
   SET manager_id = '${PERFIL}'::uuid
 WHERE manager_id IS NULL AND manager IS NOT NULL
   AND lower(btrim(manager)) IN
       (SELECT lower(btrim(full_name)) FROM public.profiles WHERE id = '${PERFIL}'::uuid);

-- O texto NÃO pode ter mudado. Se mudou, algo além deste script escreveu.
DO \$\$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.activities
     WHERE assigned_to_nome_original IS NOT NULL
       AND assigned_to IS DISTINCT FROM assigned_to_nome_original
  ) THEN
    RAISE EXCEPTION 'o texto divergiu da sombra -- este script NAO reescreve nome';
  END IF;
END \$\$;

COMMIT;
SQL
echo "  ✓ convertido"

echo ""
echo "── DEPOIS ──"
$PSQL -c "
SELECT
  (SELECT count(*) FROM public.activities
    WHERE assigned_to IS NOT NULL AND btrim(assigned_to) <> '') AS com_responsavel,
  (SELECT count(*) FROM public.activities WHERE assigned_to_id IS NOT NULL) AS convertidos,
  (SELECT count(*) FROM public.activities
    WHERE assigned_to IS NOT NULL AND btrim(assigned_to) <> ''
      AND assigned_to_id IS NULL) AS ainda_pendentes;"

echo ""
echo "Esperado: ainda_pendentes = 0, se este era o único nome ambíguo."
echo ""
echo "Desfazer, se preciso (o texto e a sombra continuam intactos):"
echo "  UPDATE activities SET assigned_to_id = NULL WHERE assigned_to_id = '${PERFIL}';"
echo ""
echo "✓ concluído"
