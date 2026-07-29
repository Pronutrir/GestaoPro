-- Gestor do Projeto passa a ter o mesmo acesso que o Líder do Projeto.
--
-- Contexto: "Gestor do Projeto" (projects.manager) ganhou campo de cadastro
-- na ficha (antes só era editável em texto livre dentro do TAP). O JS da
-- aplicação já tratava owner e manager como equivalentes para acesso amplo
-- (ver hasProjectWideAccess em src/app/(dashboard)/project/[id]/page.tsx e
-- os 6 pontos de matchesIdentity(p.manager, ...) em
-- src/app/api/ai/agent/route.ts), mas o RLS nunca soube disso:
-- is_project_leader_v2() só comparava projects.owner. Sem esta migration,
-- alguém marcado só como Gestor (sem ser líder/criador/admin/membro) não
-- conseguiria abrir a tela do projeto pela UI normal, mas já conseguiria
-- editar o projeto via chat de IA (que usa a service role key e não passa
-- por RLS) — uma assimetria de acesso real, não só teórica, a partir do
-- momento em que o campo passa a ser preenchido de verdade.
--
-- CREATE OR REPLACE mantém o nome e a assinatura da função: toda policy que
-- já chama is_project_leader_v2 (visualizar projeto, gerenciar projeto,
-- criar/editar atividade) herda o novo comportamento automaticamente, sem
-- precisar editar policy por policy.
--
-- Aditivo e idempotente: reduz a CREATE OR REPLACE FUNCTION, sem alterar
-- dados. Mesmo padrão lower(trim(...)) já usado para owner.

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
