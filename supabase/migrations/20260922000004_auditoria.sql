-- supabase/migrations/20260922000004_auditoria.sql

create table auditoria_evento (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id uuid not null,
  acao text not null,
  dados_anteriores jsonb,
  dados_novos jsonb,
  autor_id uuid references auth.users(id),
  criado_em timestamptz not null default now()
);

alter table auditoria_evento enable row level security;

create policy "select_auditoria_admin"
on auditoria_evento for select
to authenticated
using (public.jwt_papel() = 'admin');

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.auditoria_evento (tabela, registro_id, acao, dados_anteriores, dados_novos, autor_id)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

create trigger pessoa_fisica_auditoria
after insert or update or delete on pessoa_fisica
for each row execute function public.registrar_auditoria();

create trigger pessoa_juridica_auditoria
after insert or update or delete on pessoa_juridica
for each row execute function public.registrar_auditoria();
