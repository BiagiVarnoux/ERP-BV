-- Config de "Datos para notas" por empresa (una fila por company): datos fijos del
-- proveedor que se repiten en las notas de las licitaciones (representante, empresa,
-- RUPE, NIT, no adeudo, banco/cuenta, lista de documentos, prefijo de CITE, ciudad).
create table if not exists public.licitacion_notas_config (
  company_id uuid primary key references public.companies(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.licitacion_notas_config enable row level security;

drop policy if exists "company_member_all" on public.licitacion_notas_config;
create policy "company_member_all" on public.licitacion_notas_config
  for all using (
    company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid())
  ) with check (
    company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid())
  );
