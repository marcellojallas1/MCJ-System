-- supabase/migrations/20260922000001_identity_core.sql

create sequence if not exists mcj_id_seq;

create or replace function next_mcj_id(prefixo text)
returns text
language sql
as $$
  select prefixo || '-' || lpad(nextval('mcj_id_seq')::text, 8, '0');
$$;

create table marca (
  id smallint primary key,
  codigo text not null unique,
  nome text not null
);

insert into marca (id, codigo, nome) values
  (1, 'mcj', 'MCJ'),
  (2, 'amazon', 'Amazon Mobility'),
  (3, 'viana', 'Viana Seguros'),
  (4, 'capital', 'MCJ Capital');

create table pessoa_fisica (
  id uuid primary key default gen_random_uuid(),
  mcj_id text not null unique default next_mcj_id('PF'),
  nome_completo text not null,
  cpf text unique,
  data_nascimento date,
  email text,
  telefone_whatsapp text,
  marca_entrada_id smallint not null references marca(id),
  origem_primeiro_contato text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table pessoa_juridica (
  id uuid primary key default gen_random_uuid(),
  mcj_id text not null unique default next_mcj_id('PJ'),
  razao_social text not null,
  nome_fantasia text,
  cnpj text unique,
  marca_entrada_id smallint not null references marca(id),
  origem_primeiro_contato text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table vinculo_pf_pj (
  id uuid primary key default gen_random_uuid(),
  pessoa_fisica_id uuid not null references pessoa_fisica(id),
  pessoa_juridica_id uuid not null references pessoa_juridica(id),
  papel text not null,
  vigente boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (pessoa_fisica_id, pessoa_juridica_id, papel)
);

-- RLS habilitado sem políticas ainda: nega acesso por padrão (via API) até a
-- Task 5 adicionar as políticas. Isso satisfaz o Global Constraint de que
-- toda tabela de negócio tem RLS habilitado antes de a task que a cria ser
-- concluída, sem expor dados no meio tempo.
alter table pessoa_fisica enable row level security;
alter table pessoa_juridica enable row level security;
alter table vinculo_pf_pj enable row level security;
