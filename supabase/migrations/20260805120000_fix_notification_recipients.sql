-- Conserta generate_overdue_notifications, quebrada em produção
--
-- Sintoma: a cada abertura de projeto o console registra
--   `generate_overdue_notifications failed` e a RPC devolve
--   `42883 — function public.notification_recipient_user_ids(uuid) does not exist`.
-- Efeito: as notificações de atraso NÃO são geradas para nenhum projeto.
--
-- Causa: `notification_recipient_user_ids` nasceu em
-- 20260528193000_targeted_activity_notifications.sql, que nunca entrou em
-- nenhum script de apply e por isso jamais rodou na VM. Já
-- 20260731140000_lesson_prompts.sql FOI aplicada, e ela redefine
-- `generate_overdue_notifications` chamando essa função inexistente. Duas
-- migrations aplicadas fora de ordem.
--
-- Por que uma migration nova em vez de rodar a de 28/05: aquela também
-- redefine `generate_overdue_notifications`, numa versão ANTERIOR — com 3
-- blocos de INSERT e lendo a flag antiga de bloqueio. Aplicá-la agora
-- sobrescreveria a versão de 31/07, que lê `activities.is_blocked` (a flag
-- certa). Seria trocar um defeito por uma regressão silenciosa.
--
-- Esta migration cria SOMENTE a função que falta, com o corpo idêntico ao da
-- migration original. Não toca em `generate_overdue_notifications`.
-- Idempotente: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.notification_recipient_user_ids(_activity_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH activity_source AS (
    SELECT assigned_to, participants
    FROM public.activities
    WHERE id = _activity_id
  ),
  -- assigned_to e participants guardam texto livre: ora uuid, ora e-mail, ora
  -- nome digitado à mão. Por isso o JOIN abaixo tenta as quatro formas.
  raw_identities AS (
    SELECT DISTINCT lower(trim(value)) AS identity
    FROM activity_source,
    LATERAL unnest(
      array_cat(
        CASE
          WHEN nullif(trim(coalesce(assigned_to, '')), '') IS NOT NULL THEN ARRAY[assigned_to]
          ELSE ARRAY[]::text[]
        END,
        COALESCE(participants, ARRAY[]::text[])
      )
    ) AS value
    WHERE nullif(trim(value), '') IS NOT NULL
  )
  SELECT DISTINCT p.id AS user_id
  FROM raw_identities rid
  JOIN public.profiles p
    ON lower(trim(p.id::text)) = rid.identity
    OR lower(trim(coalesce(p.email, ''))) = rid.identity
    OR lower(trim(coalesce(p.full_name, ''))) = rid.identity
    OR lower(split_part(coalesce(p.email, ''), '@', 1)) = rid.identity;
$$;

COMMENT ON FUNCTION public.notification_recipient_user_ids(uuid) IS
  'Destinatários de notificação de uma atividade: responsável + participantes, casando por uuid, e-mail, nome ou prefixo do e-mail.';

-- Verificação: falha alto se a RPC continuar quebrada.
DO $$
BEGIN
  IF to_regprocedure('public.notification_recipient_user_ids(uuid)') IS NULL THEN
    RAISE EXCEPTION 'notification_recipient_user_ids nao foi criada';
  END IF;
  PERFORM public.generate_overdue_notifications(
    (SELECT id FROM public.projects WHERE is_trashed = false LIMIT 1)
  );
  RAISE NOTICE 'OK: generate_overdue_notifications executou sem erro.';
END $$;
