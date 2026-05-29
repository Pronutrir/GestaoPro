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

CREATE OR REPLACE FUNCTION public.generate_overdue_notifications(p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.notifications (project_id, activity_id, target_user_id, type, title, message)
  SELECT
    a.project_id,
    a.id,
    recipients.user_id,
    'overdue',
    '⚠️ Atividade em atraso: ' || a.title,
    'A atividade "' || a.title || '" estava prevista para ' || to_char(a.end_date, 'DD/MM/YYYY') || ' e ainda não foi concluída.'
  FROM public.activities a
  CROSS JOIN LATERAL public.notification_recipient_user_ids(a.id) recipients
  WHERE a.project_id = p_project_id
    AND a.end_date < CURRENT_DATE
    AND a.status != 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.activity_id = a.id
        AND n.type = 'overdue'
        AND n.target_user_id = recipients.user_id
        AND n.created_at > now() - interval '24 hours'
    );

  INSERT INTO public.notifications (project_id, activity_id, target_user_id, type, title, message)
  SELECT
    a.project_id,
    a.id,
    recipients.user_id,
    'deadline',
    '⏰ Prazo próximo: ' || a.title,
    'A atividade "' || a.title || '" vence em ' || to_char(a.end_date, 'DD/MM/YYYY') || '. Faltam ' || (a.end_date - CURRENT_DATE) || ' dia(s).'
  FROM public.activities a
  CROSS JOIN LATERAL public.notification_recipient_user_ids(a.id) recipients
  WHERE a.project_id = p_project_id
    AND a.end_date >= CURRENT_DATE
    AND a.end_date <= CURRENT_DATE + interval '7 days'
    AND a.status != 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.activity_id = a.id
        AND n.type = 'deadline'
        AND n.target_user_id = recipients.user_id
        AND n.created_at > now() - interval '24 hours'
    );

  INSERT INTO public.notifications (project_id, activity_id, target_user_id, type, title, message)
  SELECT
    a.project_id,
    a.id,
    recipients.user_id,
    'blocked',
    '🚫 Atividade bloqueada: ' || a.title,
    'A atividade "' || a.title || '" está em uma etapa de bloqueio e não pode avançar.'
  FROM public.activities a
  INNER JOIN public.workflow_stages ws ON ws.id = a.workflow_stage_id
  CROSS JOIN LATERAL public.notification_recipient_user_ids(a.id) recipients
  WHERE a.project_id = p_project_id
    AND ws.is_blocked = true
    AND a.status != 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.activity_id = a.id
        AND n.type = 'blocked'
        AND n.target_user_id = recipients.user_id
        AND n.created_at > now() - interval '24 hours'
    );
END;
$function$;