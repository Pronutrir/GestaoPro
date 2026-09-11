-- Migration: Permitir que convidado pendente responda ao convite
-- Data: 11/09/2026
--
-- Problema: Usuário com convite 'pending' não consegue aceitar/recusar
-- porque as policies UPDATE em project_members exigem can_manage_project_v2.
-- O PATCH casa zero linhas, volta 204, e a tela trata como sucesso.
--
-- Solução: policy que deixa cada usuário atualizar a PRÓPRIA linha enquanto o
-- convite está pendente.
--
-- POR QUE O `WITH CHECK` NÃO É SÓ `auth.uid() = user_id`
--
-- `USING` decide QUAIS LINHAS a pessoa alcança; `WITH CHECK` decide O QUE ela
-- pode gravar nelas. Com um check que só confere o dono, o PostgREST aceitaria
-- um PATCH que, na mesma requisição, aceita o convite E grava
-- `can_edit/can_delete/can_create/can_move = true`. O convidado entraria no
-- projeto com permissão total, concedida por ele mesmo — escalonamento de
-- privilégio. Medido em 11/09/2026 durante a validação E2E.
--
-- Por isso o check amarra as colunas de permissão aos valores que JÁ estão na
-- linha. Sobra ao convidado exatamente o que ele precisa: `invitation_status`
-- e `responded_at`.

-- ---------------------------------------------------------------------------
-- Comparador dos valores gravados contra os que já estão na linha.
--
-- SECURITY DEFINER de propósito: sem isso a leitura de dentro do `WITH CHECK`
-- passaria de novo pela RLS de `project_members` e recursaria. STABLE garante
-- que a leitura enxergue o snapshot do início do comando — ou seja, os valores
-- ANTIGOS, que é contra o que queremos comparar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convite_preserva_permissoes(
  _id            uuid,
  _can_edit      boolean,
  _can_delete    boolean,
  _can_create    boolean,
  _can_move      boolean,
  _can_edit_own  boolean,
  _project_role  text,
  _access_level  text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.project_members pm
     WHERE pm.id = _id
       AND pm.can_edit          IS NOT DISTINCT FROM _can_edit
       AND pm.can_delete        IS NOT DISTINCT FROM _can_delete
       AND pm.can_create        IS NOT DISTINCT FROM _can_create
       AND pm.can_move          IS NOT DISTINCT FROM _can_move
       AND pm.can_edit_own      IS NOT DISTINCT FROM _can_edit_own
       AND pm.project_role::text IS NOT DISTINCT FROM _project_role
       AND pm.access_level      IS NOT DISTINCT FROM _access_level
  );
$$;

REVOKE ALL ON FUNCTION public.convite_preserva_permissoes(
  uuid, boolean, boolean, boolean, boolean, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convite_preserva_permissoes(
  uuid, boolean, boolean, boolean, boolean, boolean, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Convidado pendente responde convite" ON public.project_members;

CREATE POLICY "Convidado pendente responde convite" ON public.project_members
FOR UPDATE TO authenticated
USING (
  -- só o próprio convidado, e só enquanto o convite não foi respondido
  auth.uid() = user_id
  AND invitation_status = 'pending'
)
WITH CHECK (
  auth.uid() = user_id
  -- a resposta só pode ser aceitar ou recusar
  AND invitation_status IN ('accepted', 'declined')
  -- e nenhuma permissão pode mudar no caminho
  AND public.convite_preserva_permissoes(
        id, can_edit, can_delete, can_create, can_move, can_edit_own,
        project_role::text, access_level)
);

NOTIFY pgrst, 'reload schema';
