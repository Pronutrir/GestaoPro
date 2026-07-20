-- Restringe UPDATE/DELETE em roadmap_items.
--
-- As políticas anteriores eram `FOR UPDATE TO authenticated USING (true)` e
-- `FOR DELETE TO authenticated USING (true)`: qualquer usuário logado podia
-- reescrever ou apagar qualquer item — solicitações de outras pessoas e as
-- notas de priorização dos avaliadores. Sem `WITH CHECK` no UPDATE, o Postgres
-- reaproveita o `USING (true)`, então também era possível reatribuir
-- `created_by` ou alterar `status`/`origem` livremente.
--
-- O modelo passa a ser:
--   * dono: edita apenas a própria solicitação, enquanto está em backlog e
--     ninguém a priorizou (classificado_em IS NULL). O WITH CHECK impede que
--     ele use o próprio UPDATE para se autopromover de estágio ou transferir
--     a posse do item.
--   * admin/gestor: acesso total, preservando os fluxos de avaliação
--     (mover estágio, projetizar, salvar priorização).

DROP POLICY IF EXISTS "Auth users can update roadmap_items" ON public.roadmap_items;
DROP POLICY IF EXISTS "Auth users can delete roadmap_items" ON public.roadmap_items;

-- ── UPDATE ────────────────────────────────────────────────────────────────

CREATE POLICY "Dono edita propria solicitacao nao priorizada"
  ON public.roadmap_items
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND origem = 'formulario'
    AND status = 'backlog'
    AND classificado_em IS NULL
  )
  WITH CHECK (
    created_by = auth.uid()
    AND origem = 'formulario'
    AND status = 'backlog'
    AND classificado_em IS NULL
  );

CREATE POLICY "Gestor edita qualquer roadmap_item"
  ON public.roadmap_items
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
  );

-- ── DELETE ────────────────────────────────────────────────────────────────
-- Mesma janela do UPDATE: desistir de um pedido que ninguém começou a avaliar.

CREATE POLICY "Dono apaga propria solicitacao nao priorizada"
  ON public.roadmap_items
  FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND origem = 'formulario'
    AND status = 'backlog'
    AND classificado_em IS NULL
  );

CREATE POLICY "Gestor apaga qualquer roadmap_item"
  ON public.roadmap_items
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
  );
