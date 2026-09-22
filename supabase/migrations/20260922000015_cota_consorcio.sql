-- supabase/migrations/20260922000015_cota_consorcio.sql

create table cota_consorcio (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contrato(id),
  marca_id smallint not null references marca(id),
  administradora_id uuid not null references administradora(id),
  plano_id uuid not null references plano_consorcio_administradora(id),
  grupo text not null,
  numero_cota text not null,
  credito numeric not null check (credito > 0),
  prazo_meses integer not null check (prazo_meses > 0),
  taxa_administracao_percentual numeric not null,
  valor_parcela numeric not null check (valor_parcela > 0),
  data_adesao date not null,
  status text not null default 'ativa' check (status in ('ativa', 'contemplada', 'cancelada')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (administradora_id, grupo, numero_cota),
  unique (contrato_id)
);

alter table cota_consorcio enable row level security;

create index idx_cota_consorcio_marca_id on cota_consorcio (marca_id);
create index idx_cota_consorcio_contrato_id on cota_consorcio (contrato_id);

create policy "select_cota_consorcio_por_marca"
on cota_consorcio for select
to authenticated
using (public.tem_acesso_marca(marca_id));

-- A cota nasce de um contrato ativo da mesma marca, e suas condições
-- (administradora, plano, crédito, prazo, taxa) têm de ser IGUAIS às
-- congeladas na proposta que originou o contrato.
create policy "insert_cota_consorcio_por_marca"
on cota_consorcio for insert
to authenticated
with check (
  public.tem_acesso_marca(marca_id)
  and exists (
    select 1
    from contrato c
    join proposta_consorcio_condicao pc on pc.proposta_id = c.proposta_id
    where c.id = cota_consorcio.contrato_id
      and c.marca_id = cota_consorcio.marca_id
      and c.status = 'ativo'
      and pc.administradora_id = cota_consorcio.administradora_id
      and pc.plano_id = cota_consorcio.plano_id
      and pc.credito = cota_consorcio.credito
      and pc.prazo_meses = cota_consorcio.prazo_meses
      and pc.taxa_administracao_percentual = cota_consorcio.taxa_administracao_percentual
  )
);

-- Placed after consorcio_contemplacao further below (like update_consorcio_lance_por_marca),
-- because the with check clause needs to reference that table.

revoke update on table public.cota_consorcio from anon, authenticated;
grant update (status, atualizado_em) on table public.cota_consorcio to authenticated;

create trigger cota_consorcio_auditoria
after insert or update or delete on cota_consorcio
for each row execute function public.registrar_auditoria();

-- Parcela devida pelo cliente à administradora. "Atrasada" não é
-- armazenada: é derivada (vencimento < hoje e status = 'prevista').
create table consorcio_parcela (
  id uuid primary key default gen_random_uuid(),
  cota_id uuid not null references cota_consorcio(id),
  numero integer not null check (numero > 0),
  vencimento date not null,
  valor numeric not null check (valor > 0),
  status text not null default 'prevista' check (status in ('prevista', 'paga')),
  pago_em date,
  criado_em timestamptz not null default now(),
  unique (cota_id, numero),
  constraint consorcio_parcela_pagamento_check check ((status = 'paga') = (pago_em is not null))
);

alter table consorcio_parcela enable row level security;

create index idx_consorcio_parcela_cota_id on consorcio_parcela (cota_id);

create policy "select_consorcio_parcela_por_marca"
on consorcio_parcela for select
to authenticated
using (
  exists (
    select 1 from cota_consorcio ct
    where ct.id = consorcio_parcela.cota_id
      and public.tem_acesso_marca(ct.marca_id)
  )
);

create policy "insert_consorcio_parcela_por_marca"
on consorcio_parcela for insert
to authenticated
with check (
  exists (
    select 1 from cota_consorcio ct
    where ct.id = consorcio_parcela.cota_id
      and public.tem_acesso_marca(ct.marca_id)
      and consorcio_parcela.numero <= ct.prazo_meses
      and consorcio_parcela.valor = ct.valor_parcela
      and consorcio_parcela.status = 'prevista'
  )
);

-- Uma parcela paga é terminal: só pode ser mudada enquanto 'prevista'.
create policy "update_consorcio_parcela_por_marca"
on consorcio_parcela for update
to authenticated
using (
  exists (
    select 1 from cota_consorcio ct
    where ct.id = consorcio_parcela.cota_id
      and public.tem_acesso_marca(ct.marca_id)
  )
  and consorcio_parcela.status = 'prevista'
)
with check (
  exists (
    select 1 from cota_consorcio ct
    where ct.id = consorcio_parcela.cota_id
      and public.tem_acesso_marca(ct.marca_id)
  )
);

revoke update on table public.consorcio_parcela from anon, authenticated;
grant update (status, pago_em) on table public.consorcio_parcela to authenticated;

create trigger consorcio_parcela_auditoria
after insert or update or delete on consorcio_parcela
for each row execute function public.registrar_auditoria();

create table consorcio_lance (
  id uuid primary key default gen_random_uuid(),
  cota_id uuid not null references cota_consorcio(id),
  tipo text not null check (tipo in ('livre', 'fixo', 'embutido')),
  valor numeric not null check (valor > 0),
  assembleia_data date not null,
  status text not null default 'planejado' check (status in ('planejado', 'ofertado', 'vencedor', 'perdedor')),
  criado_em timestamptz not null default now()
);

alter table consorcio_lance enable row level security;

create index idx_consorcio_lance_cota_id on consorcio_lance (cota_id);

create policy "select_consorcio_lance_por_marca"
on consorcio_lance for select
to authenticated
using (
  exists (
    select 1 from cota_consorcio ct
    where ct.id = consorcio_lance.cota_id
      and public.tem_acesso_marca(ct.marca_id)
  )
);

create policy "insert_consorcio_lance_por_marca"
on consorcio_lance for insert
to authenticated
with check (
  exists (
    select 1 from cota_consorcio ct
    where ct.id = consorcio_lance.cota_id
      and public.tem_acesso_marca(ct.marca_id)
      and ct.status = 'ativa'
  )
);

revoke update on table public.consorcio_lance from anon, authenticated;
grant update (status) on table public.consorcio_lance to authenticated;

create trigger consorcio_lance_auditoria
after insert or update or delete on consorcio_lance
for each row execute function public.registrar_auditoria();

create table consorcio_contemplacao (
  id uuid primary key default gen_random_uuid(),
  cota_id uuid not null unique references cota_consorcio(id),
  data date not null,
  modalidade text not null check (modalidade in ('sorteio', 'lance')),
  lance_id uuid references consorcio_lance(id),
  credito_liberado numeric not null check (credito_liberado > 0),
  criado_em timestamptz not null default now(),
  constraint consorcio_contemplacao_lance_check check ((modalidade = 'lance') = (lance_id is not null))
);

alter table consorcio_contemplacao enable row level security;

create index idx_consorcio_contemplacao_lance_id on consorcio_contemplacao (lance_id) where lance_id is not null;

create policy "select_consorcio_contemplacao_por_marca"
on consorcio_contemplacao for select
to authenticated
using (
  exists (
    select 1 from cota_consorcio ct
    where ct.id = consorcio_contemplacao.cota_id
      and public.tem_acesso_marca(ct.marca_id)
  )
);

-- Só contempla cota ativa e acessível; o lance (se houver) tem de ser da
-- mesma cota.
create policy "insert_consorcio_contemplacao_por_marca"
on consorcio_contemplacao for insert
to authenticated
with check (
  exists (
    select 1 from cota_consorcio ct
    where ct.id = consorcio_contemplacao.cota_id
      and public.tem_acesso_marca(ct.marca_id)
      and ct.status = 'ativa'
  )
  and (
    lance_id is null
    or exists (
      select 1 from consorcio_lance l
      where l.id = consorcio_contemplacao.lance_id
        and l.cota_id = consorcio_contemplacao.cota_id
    )
  )
);

-- Sem política de UPDATE/DELETE: a contemplação é um evento imutável.

create trigger consorcio_contemplacao_auditoria
after insert or update or delete on consorcio_contemplacao
for each row execute function public.registrar_auditoria();

-- Placed after consorcio_contemplacao table because it references that table in the using/with
-- check clauses. Invariants: only an 'ativa' cota can change status (USING) — 'contemplada' and
-- 'cancelada' are terminal; and a row may only claim status = 'contemplada' exactly when a
-- consorcio_contemplacao row for it already exists (WITH CHECK) — that row is what the
-- aplicar_contemplacao trigger inserts-then-updates-from in the same transaction, so the check
-- passes for the trigger's own UPDATE but rejects a client trying to set 'contemplada' directly.
create policy "update_cota_consorcio_por_marca"
on cota_consorcio for update
to authenticated
using (public.tem_acesso_marca(marca_id) and status = 'ativa')
with check (
  public.tem_acesso_marca(marca_id)
  and (status = 'contemplada') = exists (
    select 1 from consorcio_contemplacao cc
    where cc.cota_id = cota_consorcio.id
  )
);

-- Placed after consorcio_contemplacao table because it references that table in the with check clause.
-- 'vencedor' is required exactly when a contemplação references this lance — only the
-- aplicar_contemplacao trigger produces it, and it can never be undone.
create policy "update_consorcio_lance_por_marca"
on consorcio_lance for update
to authenticated
using (
  exists (
    select 1 from cota_consorcio ct
    where ct.id = consorcio_lance.cota_id
      and public.tem_acesso_marca(ct.marca_id)
  )
)
with check (
  exists (
    select 1 from cota_consorcio ct
    where ct.id = consorcio_lance.cota_id
      and public.tem_acesso_marca(ct.marca_id)
  )
  and (status = 'vencedor') = exists (
    select 1 from consorcio_contemplacao cc
    where cc.lance_id = consorcio_lance.id
  )
);

-- Aplica os efeitos da contemplação na mesma transação do INSERT. Não é
-- security definer: roda com os privilégios/RLS de quem contemplou, que
-- já provou acesso à cota no INSERT acima.
create or replace function public.aplicar_contemplacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.cota_consorcio
     set status = 'contemplada', atualizado_em = now()
   where id = new.cota_id;

  if new.lance_id is not null then
    update public.consorcio_lance
       set status = 'vencedor'
     where id = new.lance_id;
  end if;

  return new;
end;
$$;

create trigger consorcio_contemplacao_aplicar
after insert on consorcio_contemplacao
for each row execute function public.aplicar_contemplacao();
