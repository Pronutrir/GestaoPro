-- APLICADA EM PRODUCAO EM 11/09/2026
-- Migration: Arquivar (is_trashed=true) requer can_delete, não só can_edit
-- Data: 11/09/2026
--
-- Problema (Tarefa 1 da auditoria): A policy UPDATE em activities permite qualquer um
-- com can_edit=true fazer UPDATE activities SET is_trashed=true. Não consulta can_delete.
-- Resultado: e2e-tudo (can_edit=true, can_delete=false) consegue arquivar pela API,
-- contornando o botão cinza da tela. Testado e confirmado em 11/09/2026.
--
-- Solução: Criar política que bloqueia UPDATE para is_trashed=true a menos que o usuário
-- tenha can_delete OU seja responsável do ramo. Edição normal (outros campos) continua
-- usando can_mutate_activity_v2.

-- ---------------------------------------------------------------------------
-- Separar o gate de DELETE do gate de EDIT em activities
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Activities can edit v2" ON public.activities;

CREATE POLICY "Activities can edit v2" ON public.activities
FOR UPDATE TO authenticated
USING (
  -- USING: quais atividades o usuário consegue alcançar para editar
  can_mutate_activity_v2(id, auth.uid())
)
WITH CHECK (
  -- WITH CHECK: quais mudanças o usuário consegue fazer
  -- Caso 1: Se NÃO está tentando arquivar (is_trashed = false), vale can_mutate
  CASE 
    WHEN COALESCE((NEW).is_trashed, FALSE) = FALSE
    THEN can_mutate_activity_v2(id, auth.uid())
    
    -- Caso 2: Se ESTÁ arquivando (is_trashed = true), precisa de permissão específica
    -- Checagem análoga a podeExcluirAtividade no frontend:
    -- - Admin sempre pode
    -- - Qualquer um com can_delete pode
    -- - Responsável do ramo pode
    ELSE (
      -- Acesso à tabela auth.users via auth.uid() para checkar can_delete
      EXISTS (
        SELECT 1 FROM public.user_perms up
        WHERE up.user_id = auth.uid()
          AND up.can_delete = true
      )
      OR
      -- OU responsável do ramo (mesmo critério de can_mutate_activity_v2)
      eh_descendente_de_atividade_do_responsavel(id, auth.uid())
    )
  END
);

NOTIFY pgrst, 'reload schema';
