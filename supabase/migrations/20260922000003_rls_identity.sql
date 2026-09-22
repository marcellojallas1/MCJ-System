create or replace function public.jwt_papel()
returns text
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'papel', '');
$$;

create or replace function public.jwt_marca()
returns text
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'marca', '');
$$;

-- RLS já foi habilitado na Task 3 (20260922000001_identity_core.sql);
-- aqui só adicionamos as políticas.

create policy "select_pessoa_fisica_por_marca"
on pessoa_fisica for select
to authenticated
using (
  public.jwt_papel() = 'admin'
  or marca_entrada_id = (select id from marca where codigo = public.jwt_marca())
);

create policy "insert_pessoa_fisica_por_marca"
on pessoa_fisica for insert
to authenticated
with check (
  public.jwt_papel() = 'admin'
  or marca_entrada_id = (select id from marca where codigo = public.jwt_marca())
);

create policy "select_pessoa_juridica_por_marca"
on pessoa_juridica for select
to authenticated
using (
  public.jwt_papel() = 'admin'
  or marca_entrada_id = (select id from marca where codigo = public.jwt_marca())
);

create policy "insert_pessoa_juridica_por_marca"
on pessoa_juridica for insert
to authenticated
with check (
  public.jwt_papel() = 'admin'
  or marca_entrada_id = (select id from marca where codigo = public.jwt_marca())
);
