-- supabase/migrations/20260922000006_oportunidade.sql

create table oportunidade (
  id uuid primary key default gen_random_uuid(),
  pessoa_fisica_id uuid references pessoa_fisica(id),
  pessoa_juridica_id uuid references pessoa_juridica(id),
  marca_id smallint not null references marca(id),
  produto text not null check (produto in ('consorcio', 'planejamento_patrimonial')),
  etapa text not null default 'qualificacao' check (etapa in ('qualificacao', 'diagnostico', 'proposta', 'negociacao', 'encerrada')),
  status text not null default 'aberta' check (status in ('aberta', 'ganha', 'perdida')),
  origem text,
  valor_previsto numeric,
  probabilidade smallint check (probabilidade between 0 and 100),
  responsavel_id uuid references usuario_interno(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint oportunidade_cliente_check check (
    (pessoa_fisica_id is not null and pessoa_juridica_id is null) or
    (pessoa_fisica_id is null and pessoa_juridica_id is not null)
  )
);

alter table oportunidade enable row level security;

create index idx_oportunidade_marca_id on oportunidade (marca_id);
create index idx_oportunidade_pessoa_fisica_id on oportunidade (pessoa_fisica_id) where pessoa_fisica_id is not null;
create index idx_oportunidade_pessoa_juridica_id on oportunidade (pessoa_juridica_id) where pessoa_juridica_id is not null;

create policy "select_oportunidade_por_marca"
on oportunidade for select
to authenticated
using (public.tem_acesso_marca(marca_id));

create policy "insert_oportunidade_por_marca"
on oportunidade for insert
to authenticated
with check (public.tem_acesso_marca(marca_id));

create policy "update_oportunidade_por_marca"
on oportunidade for update
to authenticated
using (public.tem_acesso_marca(marca_id))
with check (public.tem_acesso_marca(marca_id));

create trigger oportunidade_auditoria
after insert or update or delete on oportunidade
for each row execute function public.registrar_auditoria();
