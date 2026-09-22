-- supabase/migrations/20260922000011_administradora_plano.sql

create table administradora (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text unique,
  situacao text not null default 'ativa' check (situacao in ('ativa', 'inativa')),
  criado_em timestamptz not null default now()
);

alter table administradora enable row level security;

create policy "select_administradora_autenticado"
on administradora for select
to authenticated
using (true);

create policy "insert_administradora_gestor"
on administradora for insert
to authenticated
with check (public.jwt_papel() in ('admin', 'gestor_capital'));

create policy "update_administradora_gestor"
on administradora for update
to authenticated
using (public.jwt_papel() in ('admin', 'gestor_capital'))
with check (public.jwt_papel() in ('admin', 'gestor_capital'));

create trigger administradora_auditoria
after insert or update or delete on administradora
for each row execute function public.registrar_auditoria();

create table plano_consorcio_administradora (
  id uuid primary key default gen_random_uuid(),
  administradora_id uuid not null references administradora(id),
  nome_plano text not null,
  credito_min numeric not null,
  credito_max numeric not null,
  prazo_meses integer not null,
  taxa_administracao_percentual numeric not null,
  criado_em timestamptz not null default now(),
  constraint plano_credito_check check (credito_max >= credito_min)
);

alter table plano_consorcio_administradora enable row level security;
create index idx_plano_administradora_id on plano_consorcio_administradora (administradora_id);

create policy "select_plano_autenticado"
on plano_consorcio_administradora for select
to authenticated
using (true);

create policy "insert_plano_gestor"
on plano_consorcio_administradora for insert
to authenticated
with check (public.jwt_papel() in ('admin', 'gestor_capital'));

create policy "update_plano_gestor"
on plano_consorcio_administradora for update
to authenticated
using (public.jwt_papel() in ('admin', 'gestor_capital'))
with check (public.jwt_papel() in ('admin', 'gestor_capital'));

create trigger plano_consorcio_administradora_auditoria
after insert or update or delete on plano_consorcio_administradora
for each row execute function public.registrar_auditoria();
