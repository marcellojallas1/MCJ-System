-- supabase/migrations/20260922000007_proposta.sql

create table proposta (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references oportunidade(id),
  marca_id smallint not null references marca(id),
  versao integer not null,
  status text not null default 'rascunho' check (status in ('rascunho', 'enviada', 'aprovada', 'rejeitada', 'expirada')),
  validade date,
  responsavel_id uuid references usuario_interno(id),
  criado_em timestamptz not null default now(),
  unique (oportunidade_id, versao)
);

create table proposta_item (
  id uuid primary key default gen_random_uuid(),
  proposta_id uuid not null references proposta(id),
  descricao text not null,
  quantidade numeric not null default 1,
  preco_unitario numeric not null,
  preco_total numeric generated always as (quantidade * preco_unitario) stored,
  criado_em timestamptz not null default now()
);

alter table proposta enable row level security;
alter table proposta_item enable row level security;

create index idx_proposta_marca_id on proposta (marca_id);
create index idx_proposta_oportunidade_id on proposta (oportunidade_id);
create index idx_proposta_item_proposta_id on proposta_item (proposta_id);

create policy "select_proposta_por_marca"
on proposta for select
to authenticated
using (public.tem_acesso_marca(marca_id));

create policy "insert_proposta_por_marca"
on proposta for insert
to authenticated
with check (public.tem_acesso_marca(marca_id));

create policy "update_proposta_por_marca"
on proposta for update
to authenticated
using (public.tem_acesso_marca(marca_id))
with check (public.tem_acesso_marca(marca_id));

-- proposta_item não tem marca_id próprio (nunca é consultado fora do
-- contexto de uma proposta); o acesso segue a marca da proposta pai.
create policy "select_proposta_item_por_marca"
on proposta_item for select
to authenticated
using (
  exists (
    select 1 from proposta p
    where p.id = proposta_item.proposta_id
      and public.tem_acesso_marca(p.marca_id)
  )
);

create policy "insert_proposta_item_por_marca"
on proposta_item for insert
to authenticated
with check (
  exists (
    select 1 from proposta p
    where p.id = proposta_item.proposta_id
      and public.tem_acesso_marca(p.marca_id)
  )
);

create trigger proposta_auditoria
after insert or update or delete on proposta
for each row execute function public.registrar_auditoria();
