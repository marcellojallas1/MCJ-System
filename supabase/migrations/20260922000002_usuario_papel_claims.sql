-- supabase/migrations/20260922000002_usuario_papel_claims.sql

create table papel (
  id smallint primary key generated always as identity,
  codigo text not null unique,
  descricao text not null
);

insert into papel (codigo, descricao) values
  ('admin', 'Administrador do sistema'),
  ('consultor_capital', 'Consultor comercial MCJ Capital'),
  ('gestor_capital', 'Gestor MCJ Capital');

create table usuario_interno (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  papel_id smallint not null references papel(id),
  marca_id smallint not null references marca(id),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  usuario record;
begin
  select p.codigo as papel_codigo, m.codigo as marca_codigo
  into usuario
  from public.usuario_interno u
  join public.papel p on p.id = u.papel_id
  join public.marca m on m.id = u.marca_id
  where u.id = (event->>'user_id')::uuid
    and u.ativo = true;

  claims := event->'claims';

  if usuario is not null then
    claims := jsonb_set(claims, '{papel}', to_jsonb(usuario.papel_codigo));
    claims := jsonb_set(claims, '{marca}', to_jsonb(usuario.marca_codigo));
  else
    claims := jsonb_set(claims, '{papel}', to_jsonb(''::text));
    claims := jsonb_set(claims, '{marca}', to_jsonb(''::text));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

grant all on table public.usuario_interno to supabase_auth_admin;
grant all on table public.papel to supabase_auth_admin;
grant all on table public.marca to supabase_auth_admin;

-- marca e papel são tabelas de referência: leitura liberada a qualquer
-- usuário autenticado (necessário para popular seletores na UI), sem
-- política de escrita — só migração altera essas tabelas.
alter table marca enable row level security;
alter table papel enable row level security;

create policy "select_marca_autenticado"
on marca for select
to authenticated
using (true);

create policy "select_papel_autenticado"
on papel for select
to authenticated
using (true);

-- usuario_interno revela estrutura interna de equipe: RLS habilitado sem
-- política própria ainda (nega tudo por padrão via API). Uma política de
-- leitura para admin/gestor fica para um plano futuro de governança.
alter table usuario_interno enable row level security;
