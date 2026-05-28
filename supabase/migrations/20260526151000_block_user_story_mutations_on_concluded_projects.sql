-- Bloqueia mutacoes em user_stories quando o projeto estiver concluido.
-- Regra de negocio: projetos com status "concluido" devem ficar imutaveis para historias.

create or replace function public.prevent_user_story_mutation_on_concluded_project()
returns trigger
language plpgsql
as $$
declare
  target_project_id uuid;
  target_project_status text;
begin
  target_project_id := coalesce(new.project_id, old.project_id);

  if target_project_id is null then
    return coalesce(new, old);
  end if;

  select p.status
    into target_project_status
  from public.projects p
  where p.id = target_project_id;

  if target_project_status = 'concluido' then
    raise exception using
      message = 'Projeto concluido nao permite alteracoes em historias.',
      errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_prevent_user_story_mutation_on_concluded_project on public.user_stories;

create trigger trg_prevent_user_story_mutation_on_concluded_project
before insert or update or delete
on public.user_stories
for each row
execute function public.prevent_user_story_mutation_on_concluded_project();
