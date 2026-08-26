-- ROLLBACK DOS HOMONIMOS -- devolve a comparacao por nome
--
-- REABRE O FURO DE PROPOSITO: os dois perfis homonimos voltam a ser atores da
-- mesma atividade e donos do mesmo projeto. E melhor o furo de volta por um dia
-- do que gente sem conseguir trabalhar -- mesma logica do rollback da P00.
--
-- As linhas de `project_members` criadas pela rede de seguranca NAO sao
-- removidas: elas concedem acesso por user_id, que e correto de qualquer jeito,
-- e tirar acesso num rollback e o oposto do que um rollback deve fazer.
--
-- `nome_e_ambiguo` FICA: e funcao de leitura, sem efeito colateral, e o
-- levantamento pode estar usando.

CREATE OR REPLACE FUNCTION public.is_activity_actor_v2(_activity_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities a
    LEFT JOIN public.profiles pr ON pr.id = _user_id
    LEFT JOIN auth.users au ON au.id = _user_id
    WHERE a.id = _activity_id
      AND (
        a.created_by = _user_id
        OR EXISTS (
          SELECT 1 FROM public.activity_assignees aa
           WHERE aa.activity_id = a.id AND aa.user_id = _user_id
        )
        OR (
          (a.assigned_to IS NOT NULL AND (
            lower(trim(a.assigned_to)) = lower(trim(_user_id::text))
            OR (pr.full_name IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(pr.full_name)))
            OR (au.email IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(au.email)))
          ))
          OR EXISTS (
            SELECT 1
            FROM unnest(COALESCE(a.participants, '{}'::text[])) participant_name
            WHERE (pr.full_name IS NOT NULL AND lower(trim(participant_name)) = lower(trim(pr.full_name)))
               OR (au.email IS NOT NULL AND lower(trim(participant_name)) = lower(trim(au.email)))
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_leader_v2(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.profiles pr ON pr.id = _user_id
    WHERE p.id = _project_id
      AND pr.full_name IS NOT NULL
      AND (
        (p.owner IS NOT NULL AND lower(trim(p.owner)) = lower(trim(pr.full_name)))
        OR (p.manager IS NOT NULL AND lower(trim(p.manager)) = lower(trim(pr.full_name)))
      )
  );
$$;

DO $$
BEGIN
  RAISE NOTICE 'comparacao por nome restaurada. O furo do homonimo esta aberto de novo.';
END $$;
