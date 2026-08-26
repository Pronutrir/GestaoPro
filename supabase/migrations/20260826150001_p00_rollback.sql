-- ROLLBACK DA P00 -- devolve a policy ampla.
--
-- Rode isto se, depois de aplicar a P00, alguém relatar que perdeu leitura que
-- precisa. Ele REABRE o furo de propósito: é melhor ter o vazamento de volta
-- por um dia do que gente sem conseguir trabalhar.
--
-- COMO RODAR:
--   docker exec -i supabase-db-1 psql -U supabase_admin -d postgres \
--     -f /tmp/20260826150001_p00_rollback.sql
--   DELETE FROM public.schema_migrations WHERE version = 20260826150000;
--
-- Depois de rodar, o estado é o de antes: quem entra por atribuição volta a
-- enxergar todas as atividades do projeto.
--
-- ANTES DE REAPLICAR a P00, descubra POR QUE alguém perdeu acesso. As duas
-- causas prováveis:
--
--   1. a pessoa é membro da equipe mas com `invitation_status = 'declined'` --
--      `is_project_member_v2` a reconhece, mas confira;
--   2. a atividade dela é responsabilidade por NOME que não casa com o perfil
--      (a base tem `assigned_to` com nome curto, e a comparação é tolerante
--      mas não infalível). Nesse caso o problema é o dado, não a policy.

DROP POLICY IF EXISTS "Activities access v2 read" ON public.activities;
CREATE POLICY "Activities access v2 read" ON public.activities
FOR SELECT TO authenticated
USING (public.can_view_project_work_v2(project_id, auth.uid()));

-- A função nova fica: não atrapalha, e evita ter de reescrevê-la na volta.
-- Se quiser removê-la mesmo:
--   DROP FUNCTION IF EXISTS public.pode_ler_atividade_v2(uuid, uuid);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='activities'
       AND policyname='Activities access v2 read'
       AND qual LIKE '%can_view_project_work_v2%'
  ) THEN
    RAISE EXCEPTION 'o rollback nao restaurou a policy ampla';
  END IF;
END $$;
