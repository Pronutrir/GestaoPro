#!/bin/bash
set -e
# ============================================================================
# AS 4 MIGRATIONS QUE FALTAM — verificadas por API em 10/08/2026.
#
# A leva de 31/07 foi quase toda aplicada. Restam estas quatro, e cada uma
# corresponde a código JÁ PUBLICADO que hoje promete algo que o banco recusa.
#
# Este script é um recorte do apply-leva-tap.sh, que continua válido e é
# idempotente. A diferença é o tempo: aqui rodam 4 migrations em vez de 14.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-4-pendentes.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

run() {
  local version="$1" file="$2" nome="$3"
  echo ""
  echo "══════════════════════════════════════════════════════════"
  echo "  $nome"
  echo "══════════════════════════════════════════════════════════"
  if [ ! -f "$file" ]; then
    echo "  ERRO: migration não encontrada: $file"
    exit 1
  fi
  docker cp "$file" "$CONTAINER:/tmp/mig.sql"
  # ON_ERROR_STOP: para no primeiro erro em vez de seguir com o banco meio
  # migrado, que é pior que não ter começado.
  $PSQL -v ON_ERROR_STOP=1 -f /tmp/mig.sql
  $PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
            VALUES ('${version}', NOW()) ON CONFLICT DO NOTHING;"
  echo "  ✓ aplicada"
}

# 1) Dívida antiga de maio. Sem ela a importação de EAP falha na PRIMEIRA fase
#    com "Could not find the 'wbs_code' column of 'phases'".
run 20260512013359 "supabase/migrations/20260512013359_0d23dad5-dd70-4dd9-bf05-9011ec5f18c5.sql" \
  "wbs_code em activities e phases  ·  destrava a importação de EAP"

# 2) generate_overdue_notifications chama uma função que não existe, então
#    devolve 42883 a cada abertura de projeto. Efeito: NENHUMA notificação de
#    atraso é gerada, em nenhum projeto. Código publicado no commit 184d475.
run 20260805120000 "supabase/migrations/20260805120000_fix_notification_recipients.sql" \
  "notification_recipient_user_ids  ·  volta a gerar notificação de atraso"

# 3) A tela já libera os campos para o responsável (commit 2e61273), mas o RLS
#    ainda barra: a pessoa vê que pode editar e o salvamento falha.
run 20260805140000 "supabase/migrations/20260805140000_activity_owner_can_edit.sql" \
  "is_activity_owner  ·  responsável passa a conseguir salvar"

# 4) Só ACRESCENTA uma coluna opcional e preenche a pauta dos 6 tipos já
#    semeados. A tela degrada sem ela (relê os tipos sem o campo), então esta
#    é a menos urgente das quatro.
run 20260807100000 "supabase/migrations/20260807100000_meeting_agenda_templates.sql" \
  "agenda_template  ·  pauta pronta por tipo de reunião"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  VERIFICAÇÃO"
echo "══════════════════════════════════════════════════════════"

echo "── wbs_code (importação de EAP) ──"
$PSQL -c "SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema='public' AND column_name='wbs_code'
            AND table_name IN ('phases','activities') ORDER BY 1;"

echo "── funções que o código já chama ──"
$PSQL -c "SELECT proname FROM pg_proc
          WHERE proname IN ('notification_recipient_user_ids','is_activity_owner')
          ORDER BY 1;"

echo "── pauta por tipo de reunião ──"
$PSQL -c "SELECT label, (agenda_template IS NOT NULL) AS tem_pauta, count(*)
          FROM public.meeting_types GROUP BY 1,2 ORDER BY 1;"

echo ""
echo "✓ Recarregue a aplicação (Ctrl+Shift+R). Passa a funcionar:"
echo "   · importar EAP sem falhar na primeira fase"
echo "   · notificações de atraso sendo geradas"
echo "   · responsável salvando a própria atividade"
echo "   · pauta preenchida ao escolher o tipo da reunião"
