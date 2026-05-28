-- Add responsible sector to projects for strategic filtering and governance.
alter table public.projects
  add column if not exists sector text;

comment on column public.projects.sector is
  'Setor responsável pelo projeto, definido na ficha de criação/edição.';

create index if not exists idx_projects_sector
  on public.projects (sector);

-- Backfill best-effort using project owner name when possible.
update public.projects p
set sector = pr.sector
from public.profiles pr
where p.sector is null
  and p.owner is not null
  and pr.sector is not null
  and lower(trim(pr.full_name)) = lower(trim(p.owner));
