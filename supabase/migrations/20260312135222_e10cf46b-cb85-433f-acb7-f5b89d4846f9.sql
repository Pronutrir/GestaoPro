CREATE OR REPLACE FUNCTION public.generate_overdue_notifications(p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Create notifications for overdue activities
  INSERT INTO public.notifications (project_id, activity_id, type, title, message)
  SELECT 
    a.project_id, a.id, 'overdue',
    '⚠️ Atividade em atraso: ' || a.title,
    'A atividade "' || a.title || '" estava prevista para ' || to_char(a.end_date, 'DD/MM/YYYY') || ' e ainda não foi concluída.'
  FROM public.activities a
  WHERE a.project_id = p_project_id
    AND a.end_date < CURRENT_DATE
    AND a.status != 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.activity_id = a.id AND n.type = 'overdue'
        AND n.created_at > now() - interval '24 hours'
    );

  -- Create notifications for activities due within 3 days
  INSERT INTO public.notifications (project_id, activity_id, type, title, message)
  SELECT 
    a.project_id, a.id, 'deadline',
    '⏰ Prazo próximo: ' || a.title,
    'A atividade "' || a.title || '" vence em ' || to_char(a.end_date, 'DD/MM/YYYY') || '. Faltam ' || (a.end_date - CURRENT_DATE) || ' dia(s).'
  FROM public.activities a
  WHERE a.project_id = p_project_id
    AND a.end_date >= CURRENT_DATE
    AND a.end_date <= CURRENT_DATE + interval '3 days'
    AND a.status != 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.activity_id = a.id AND n.type = 'deadline'
        AND n.created_at > now() - interval '24 hours'
    );

  -- Create notifications for blocked activities
  INSERT INTO public.notifications (project_id, activity_id, type, title, message)
  SELECT 
    a.project_id, a.id, 'blocked',
    '🚫 Atividade bloqueada: ' || a.title,
    'A atividade "' || a.title || '" está em uma etapa de bloqueio e não pode avançar.'
  FROM public.activities a
  INNER JOIN public.workflow_stages ws ON ws.id = a.workflow_stage_id
  WHERE a.project_id = p_project_id
    AND ws.is_blocked = true
    AND a.status != 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.activity_id = a.id AND n.type = 'blocked'
        AND n.created_at > now() - interval '24 hours'
    );
END;
$function$;