-- Migration: a trava de homônimo em TODAS as funções que concedem acesso por nome
-- Data: 14/09/2026
--
-- ────────────────────────────────────────────────────────────────────────────
-- O QUE ACONTECEU
--
-- Uma pessoa entrou pela Microsoft (`williame.correia@pronutrir.com.br`, papel
-- "user") e abriu um projeto do qual NÃO faz parte. O projeto aparecia, e
-- segundos depois virava "Acesso restrito".
--
-- Existem dois perfis ativos chamados "Williame Correia de Lima": esse e
-- `williame_lima@hotmail.com` (admin, e o que está na equipe do projeto). O
-- projeto guarda o dono como TEXTO — `owner = 'Williame Correia de Lima'`.
--
-- A migration 20260826180000 criou `nome_e_ambiguo()` justamente para isto: um
-- nome que pertence a mais de uma pessoa não identifica ninguém, então não
-- concede nada. Mas a trava só foi aplicada a TRÊS funções
-- (`is_activity_actor_v2`, `is_project_leader_v2`,
-- `eh_responsavel_da_atividade_v2`). Medido em 14/09/2026, seis funções que
-- decidem acesso continuavam comparando nome SEM ela:
--
--   is_project_member            16 policies  — "membro" por nome = dono
--   can_view_project_v2          21 policies  — ver o projeto por nome na atividade
--   is_project_leader             5 policies  — incluir/alterar/REMOVER membros da equipe
--   tem_atividade_no_projeto_v2  (via can_view_project_work_v2)
--   is_activity_comment_author_v2 2 policies  — editar/apagar comentário do outro
--   is_activity_member           (sem policy direta; mesma regra)
--
-- Consequência medida: o banco deixava a conta Microsoft ler 2 projetos só pelo
-- nome. E pela `is_project_leader`, as policies "Leaders can insert/update/delete
-- project_members" a deixavam mexer na EQUIPE desses projetos — uma conta "user"
-- podendo se incluir. Escalonamento de privilégio, não só leitura.
--
-- O "aparece e some" da tela era outro defeito, na página (a lista de nomes
-- ambíguos chegava depois da primeira checagem) — corrigido no código. Aqui se
-- fecha o lado do banco, que é a decisão que vale.
--
-- ────────────────────────────────────────────────────────────────────────────
-- A REGRA APLICADA, IGUAL À DE `is_activity_actor_v2`
--
-- Só as comparações por NOME ganham a trava. Id e e-mail continuam valendo —
-- são únicos, não existe homonímia neles. Nas funções com LEFT JOIN no perfil, a
-- trava vai no próprio JOIN: se o nome da pessoa é ambíguo, o perfil não entra e
-- os ramos por nome falham, enquanto o ramo por e-mail (outro JOIN) segue igual.
-- Posta ali, ela é avaliada uma vez por chamada, não uma vez por atividade.
--
-- Errar para "ninguém" é visível — a pessoa reclama e ganha acesso pelo caminho
-- certo (entrar na equipe, com vínculo por conta). Errar para "os dois" é
-- invisível.
--
-- ────────────────────────────────────────────────────────────────────────────
-- O QUE FICA DE FORA, DE PROPÓSITO
--
-- `notification_recipient_user_ids` também compara nome sem a trava, mas decide
-- quem RECEBE notificação, não quem acessa. Travar ali silenciaria as duas
-- contas — é uma decisão de produto, registrada, não tomada aqui.

-- 1 ── is_project_member ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _user_id IS NOT NULL
    AND (
      public.has_role(_user_id, 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = _project_id AND user_id = _user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.projects p
        JOIN public.profiles pr ON pr.id = _user_id
        WHERE p.id = _project_id
          AND pr.full_name IS NOT NULL
          -- nome de mais de uma pessoa não faz ninguém membro (20260914180000)
          AND NOT public.nome_e_ambiguo(pr.full_name)
          AND (
            lower(trim(p.owner)) = lower(trim(pr.full_name))
            OR EXISTS (
              SELECT 1 FROM unnest(COALESCE(p.assignees, '{}'::text[])) a
              WHERE lower(trim(a)) = lower(trim(pr.full_name))
            )
          )
      )
    )
$function$;

-- 2 ── is_project_leader (sustenta INSERT/UPDATE/DELETE em project_members) ───
CREATE OR REPLACE FUNCTION public.is_project_leader(_project_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _user_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.profiles pr ON pr.id = _user_id
      WHERE p.id = _project_id
        AND pr.full_name IS NOT NULL
        -- sem isto, um homônimo do dono gerenciava a equipe (20260914180000)
        AND NOT public.nome_e_ambiguo(pr.full_name)
        AND lower(trim(p.owner)) = lower(trim(pr.full_name))
    )
$function$;

-- 3 ── can_view_project_v2 ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_view_project_v2(_project_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _user_id IS NOT NULL
    AND (
      public.is_admin_user_v2(_user_id)
      OR public.is_project_leader_v2(_project_id, _user_id)
      OR public.is_project_member_v2(_project_id, _user_id)
      OR EXISTS (
        SELECT 1
        FROM public.activities a
        -- perfil de nome ambíguo não entra: os ramos por nome falham, o de e-mail não
        LEFT JOIN public.profiles pr ON pr.id = _user_id AND NOT public.nome_e_ambiguo(pr.full_name)
        LEFT JOIN auth.users au ON au.id = _user_id
        WHERE a.project_id = _project_id
          AND a.is_trashed = false
          AND (
            a.created_by = _user_id
            OR (
              a.assigned_to IS NOT NULL
              AND (
                (pr.full_name IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(pr.full_name)))
                OR (au.email IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(au.email)))
              )
            )
            OR EXISTS (
              SELECT 1
              FROM unnest(COALESCE(a.participants, '{}'::text[])) AS participant_name
              WHERE
                (pr.full_name IS NOT NULL AND lower(trim(participant_name)) = lower(trim(pr.full_name)))
                OR (au.email IS NOT NULL AND lower(trim(participant_name)) = lower(trim(au.email)))
            )
          )
      )
    );
$function$;

-- 4 ── tem_atividade_no_projeto_v2 ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tem_atividade_no_projeto_v2(_project_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities a
    JOIN public.projects p ON p.id = a.project_id
    -- perfil de nome ambíguo não entra: os ramos por nome falham, o de e-mail não
    LEFT JOIN public.profiles pr ON pr.id = _user_id AND NOT public.nome_e_ambiguo(pr.full_name)
    LEFT JOIN auth.users au ON au.id = _user_id
    WHERE a.project_id = _project_id
      AND COALESCE(a.is_trashed, false) = false
      AND COALESCE(p.is_trashed, false) = false
      AND (
        a.created_by = _user_id
        OR (a.assigned_to IS NOT NULL AND (
          lower(trim(a.assigned_to)) = lower(trim(_user_id::text))
          OR (pr.full_name IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(pr.full_name)))
          OR (au.email IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(au.email)))
        ))
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(a.participants, '{}'::text[])) nome
          WHERE (pr.full_name IS NOT NULL AND lower(trim(nome)) = lower(trim(pr.full_name)))
             OR (au.email IS NOT NULL AND lower(trim(nome)) = lower(trim(au.email)))
        )
      )
  );
$function$;

-- 5 ── is_activity_comment_author_v2 (editar/apagar comentário) ──────────────
CREATE OR REPLACE FUNCTION public.is_activity_comment_author_v2(_comment_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.activity_comments c
    -- homônimo não edita comentário do outro; `created_by` e e-mail seguem valendo
    LEFT JOIN public.profiles pr ON pr.id = _user_id AND NOT public.nome_e_ambiguo(pr.full_name)
    LEFT JOIN auth.users au ON au.id = _user_id
    WHERE c.id = _comment_id
      AND (
        c.created_by = _user_id
        OR (
          c.author IS NOT NULL
          AND (
            (pr.full_name IS NOT NULL AND lower(trim(c.author)) = lower(trim(pr.full_name)))
            OR (au.email IS NOT NULL AND lower(trim(c.author)) = lower(trim(au.email)))
          )
        )
      )
  );
$function$;

-- 6 ── is_activity_member ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_activity_member(_activity_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _user_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.activities a
      JOIN public.profiles pr ON pr.id = _user_id
      WHERE a.id = _activity_id
        AND pr.full_name IS NOT NULL
        AND NOT public.nome_e_ambiguo(pr.full_name)
        AND (
          lower(trim(COALESCE(a.assigned_to, ''))) = lower(trim(pr.full_name))
          OR EXISTS (
            SELECT 1 FROM unnest(COALESCE(a.participants, '{}'::text[])) p
            WHERE lower(trim(p)) = lower(trim(pr.full_name))
          )
        )
    )
$function$;

NOTIFY pgrst, 'reload schema';
