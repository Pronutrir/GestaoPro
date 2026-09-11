-- Migration: Permitir que convidado pendente responda ao convite
-- Data: 11/09/2026
-- 
-- Problema: Usuário com convite 'pending' não consegue aceitar/recusar
-- porque as policies UPDATE em project_members exigem can_manage_project_v2.
--
-- Solução: Adicionar policy que deixa cada usuário atualizar sua própria linha
-- quando o status é 'pending', permitindo mudar para 'accepted' ou 'declined'.

-- Adiciona a nova policy ANTES da existente para que seja checada primeiro
DROP POLICY IF EXISTS "Convidado pendente responde convite" ON public.project_members;

CREATE POLICY "Convidado pendente responde convite" ON public.project_members
FOR UPDATE TO authenticated
USING (
  -- Só quem é o próprio convidado pode alterar
  auth.uid() = user_id
  AND
  -- E só enquanto o status é pending
  invitation_status = 'pending'
)
WITH CHECK (
  -- Confirma na output que é update do próprio usuário
  auth.uid() = user_id
);

NOTIFY pgrst, 'reload schema';
