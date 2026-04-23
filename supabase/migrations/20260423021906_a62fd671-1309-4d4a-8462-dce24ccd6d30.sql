-- Move subtarefas órfãs para a lixeira quando o pai já está na lixeira
UPDATE public.activities AS child
SET is_trashed = true, trashed_at = COALESCE(child.trashed_at, now())
FROM public.activities AS parent
WHERE child.parent_id = parent.id
  AND parent.is_trashed = true
  AND child.is_trashed = false;