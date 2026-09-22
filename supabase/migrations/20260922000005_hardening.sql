-- supabase/migrations/20260922000005_hardening.sql
-- Fix wave from the final whole-branch code review: reusable RLS helper,
-- search_path hardening on the remaining functions, revoke of dead grants,
-- and indexes on the columns RLS policies filter on.

-- Part A — reusable RLS helper, replacing the duplicated marca-access
-- predicate in 4 policies. security definer bypasses RLS on marca (so the
-- helper no longer depends on marca's own RLS policy) and wraps
-- jwt_papel()/jwt_marca() in (select ...) for the InitPlan optimization.

create or replace function public.tem_acesso_marca(p_marca_id smallint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.jwt_papel() = 'admin'
    or p_marca_id = (select id from public.marca where codigo = public.jwt_marca());
$$;

drop policy "select_pessoa_fisica_por_marca" on pessoa_fisica;
drop policy "insert_pessoa_fisica_por_marca" on pessoa_fisica;
drop policy "select_pessoa_juridica_por_marca" on pessoa_juridica;
drop policy "insert_pessoa_juridica_por_marca" on pessoa_juridica;

create policy "select_pessoa_fisica_por_marca"
on pessoa_fisica for select
to authenticated
using (public.tem_acesso_marca(marca_entrada_id));

create policy "insert_pessoa_fisica_por_marca"
on pessoa_fisica for insert
to authenticated
with check (public.tem_acesso_marca(marca_entrada_id));

create policy "select_pessoa_juridica_por_marca"
on pessoa_juridica for select
to authenticated
using (public.tem_acesso_marca(marca_entrada_id));

create policy "insert_pessoa_juridica_por_marca"
on pessoa_juridica for insert
to authenticated
with check (public.tem_acesso_marca(marca_entrada_id));

-- Part B — set search_path = '' hardening on the three remaining functions
-- that lack it (mirroring custom_access_token_hook and registrar_auditoria).

create or replace function public.next_mcj_id(prefixo text)
returns text
language sql
set search_path = ''
as $$
  select prefixo || '-' || lpad(nextval('public.mcj_id_seq')::text, 8, '0');
$$;

create or replace function public.jwt_papel()
returns text
language sql stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'papel', '');
$$;

create or replace function public.jwt_marca()
returns text
language sql stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'marca', '');
$$;

-- Part C — revoke now-dead grants. custom_access_token_hook is security
-- definer, so it runs as its owner (bypassing RLS) and never actually
-- needed table-level grants on these three tables — the grants are pure
-- unused attack surface (including INSERT/UPDATE/DELETE on the table that
-- assigns roles).

revoke all on table public.usuario_interno from supabase_auth_admin;
revoke all on table public.papel from supabase_auth_admin;
revoke all on table public.marca from supabase_auth_admin;

-- Part D — indexes on the columns every RLS policy filters on, plus
-- unindexed FKs and the audit query shape.

create index if not exists idx_pessoa_fisica_marca_entrada_id on public.pessoa_fisica (marca_entrada_id);
create index if not exists idx_pessoa_juridica_marca_entrada_id on public.pessoa_juridica (marca_entrada_id);
create index if not exists idx_vinculo_pf_pj_pessoa_fisica_id on public.vinculo_pf_pj (pessoa_fisica_id);
create index if not exists idx_vinculo_pf_pj_pessoa_juridica_id on public.vinculo_pf_pj (pessoa_juridica_id);
create index if not exists idx_auditoria_evento_tabela_registro_id on public.auditoria_evento (tabela, registro_id);
