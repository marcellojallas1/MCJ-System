-- supabase/migrations/20260922000008_contrato.sql

create table contrato (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references oportunidade(id),
  proposta_id uuid not null references proposta(id),
  marca_id smallint not null references marca(id),
  status text not null default 'ativo' check (status in ('ativo', 'encerrado', 'cancelado')),
  vigencia_inicio date not null default current_date,
  vigencia_fim date,
  criado_em timestamptz not null default now(),
  unique (proposta_id)
);

alter table contrato enable row level security;

create index idx_contrato_marca_id on contrato (marca_id);
create index idx_contrato_oportunidade_id on contrato (oportunidade_id);

create policy "select_contrato_por_marca"
on contrato for select
to authenticated
using (public.tem_acesso_marca(marca_id));

create policy "insert_contrato_por_marca"
on contrato for insert
to authenticated
with check (public.tem_acesso_marca(marca_id));

create trigger contrato_auditoria
after insert or update or delete on contrato
for each row execute function public.registrar_auditoria();
