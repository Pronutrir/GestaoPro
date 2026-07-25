-- Complemento da 20260723100000_fix_projects_insert_policy.
--
-- Criar a policy de INSERT não bastou: o app faz
--   supabase.from("projects").insert(...).select("id").single()
-- (AddProjectDialog.tsx), que o PostgREST traduz em INSERT ... RETURNING.
-- O RETURNING exige permissão de SELECT sobre a linha recém-criada, e a única
-- policy de SELECT usa is_project_member(id, uid()) — que reconhece admin,
-- project_members e owner/assignees por nome, mas NUNCA created_by. No instante
-- do INSERT o projeto ainda não tem membros nem owner, então o SELECT é negado
-- e a transação inteira é revertida com:
--   "new row violates row-level security policy for table projects"
--
-- Verificado em produção: INSERT puro passa; INSERT ... RETURNING falha.
--
-- Correção: policy de SELECT adicional (PERMISSIVE, soma-se às existentes)
-- deixando o criador enxergar o próprio projeto. Não amplia acesso a projetos
-- de terceiros — created_by é preenchido com auth.uid().

DROP POLICY IF EXISTS "Creators can read own projects" ON public.projects;

CREATE POLICY "Creators can read own projects" ON public.projects
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

NOTIFY pgrst, 'reload schema';
