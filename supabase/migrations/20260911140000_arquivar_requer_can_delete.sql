-- Migration: arquivar (is_trashed = true) exige permissão de EXCLUIR, não de editar
-- Data: 11/09/2026
--
-- TAREFA 1 DA AUDITORIA DE 10/09/2026.
--
-- O PROBLEMA
--
-- Arquivar não apaga linha: grava `is_trashed = true`. Para a policy de UPDATE
-- isso é uma edição como outra qualquer, e o `WITH CHECK` só pergunta se a
-- pessoa pode EDITAR. Resultado medido em 11/09/2026: `e2e-tudo`
-- (`can_edit = true`, `can_delete = false`) mandou
--
--   PATCH /rest/v1/activities?id=eq.<id>  {"is_trashed": true}
--
-- e o banco respondeu 200 e gravou. O botão cinza da tela não protege nada:
-- quem abre o console não precisa de botão nenhum.
--
-- A policy de DELETE já consulta `can_delete` — mas ninguém passa por ela,
-- porque a exclusão que o produto oferece é reversível e é um UPDATE. A regra
-- estava sendo aplicada numa porta que não se usa.
--
-- A CORREÇÃO
--
-- O `WITH CHECK` passa a se dividir em dois casos. Edição comum continua
-- exatamente como era. A transição para arquivado exige a mesma condição que
-- `podeExcluirAtividade` aplica no front: `can_delete` de papel na equipe, ser
-- dono/gestor, ser admin, ou ser responsável do ramo.
--
-- POR QUE SUBSTITUIR A POLICY, E NÃO ACRESCENTAR UMA
--
-- Policies permissivas se somam com OU. Criar uma policy nova "mais restrita"
-- ao lado da existente não restringe coisa alguma — a antiga continua
-- liberando. Por isso esta migration DROPA a policy pelo nome real
-- (`Activities access v2 update`) e a recria. Uma tentativa anterior falhou
-- por dropar um nome que não existia.
--
-- O QUE ESTA MIGRATION NÃO MUDA
--
-- Restaurar da Lixeira (`is_trashed = false`) continua caindo no caso de
-- edição comum, ou seja, segue exigindo permissão de EDITAR, como hoje. Se a
-- decisão for que restaurar também exija excluir, é um terceiro ramo no CASE —
-- deixado de fora de propósito, porque muda comportamento que ninguém relatou.

-- Guarda de dependências: sem estas funções a policy recriada ficaria inválida
-- e a tabela ficaria sem UPDATE nenhum.
DO $guarda$
BEGIN
  IF to_regprocedure('public.can_update_activity_v2(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'can_update_activity_v2 ausente — aplique as migrations anteriores antes.';
  END IF;
  IF to_regprocedure('public.eh_descendente_de_atividade_do_responsavel(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'eh_descendente_de_atividade_do_responsavel ausente — aplique 20260901120000 antes.';
  END IF;
  IF to_regprocedure('public.can_member_action(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'can_member_action ausente — aplique as migrations anteriores antes.';
  END IF;
END $guarda$;

DROP POLICY IF EXISTS "Activities access v2 update" ON public.activities;

CREATE POLICY "Activities access v2 update" ON public.activities
FOR UPDATE TO authenticated
USING (
  -- quais atividades a pessoa alcança: inalterado
  public.can_update_activity_v2(id, auth.uid())
)
WITH CHECK (
  CASE
    -- edição comum (e restaurar da Lixeira): a regra de sempre
    WHEN is_trashed IS NOT TRUE THEN (
      public.is_admin_user_v2(auth.uid())
      OR public.is_project_leader_v2(project_id, auth.uid())
      OR public.can_member_action(project_id, auth.uid(), 'edit')
      OR public.can_member_action(project_id, auth.uid(), 'move')
      OR public.is_activity_actor_v2(id, auth.uid())
      OR public.eh_descendente_de_atividade_do_responsavel(id, auth.uid())
    )
    -- arquivar: exige permissão de EXCLUIR, espelhando podeExcluirAtividade
    ELSE (
      public.is_admin_user_v2(auth.uid())
      OR public.is_project_leader_v2(project_id, auth.uid())
      OR public.can_member_action(project_id, auth.uid(), 'delete')
      OR public.eh_descendente_de_atividade_do_responsavel(id, auth.uid())
    )
  END
);

NOTIFY pgrst, 'reload schema';
