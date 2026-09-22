-- supabase/migrations/20260922000012_oferta_campanha_politica.sql

create table campanha_incentivo (
  id uuid primary key default gen_random_uuid(),
  administradora_id uuid not null references administradora(id),
  nome text not null,
  bonus_percentual numeric not null default 0,
  vigencia_inicio date not null,
  vigencia_fim date,
  criado_em timestamptz not null default now()
);

alter table campanha_incentivo enable row level security;
create index idx_campanha_administradora_id on campanha_incentivo (administradora_id);

create policy "select_campanha_autenticado"
on campanha_incentivo for select
to authenticated
using (true);

create policy "insert_campanha_gestor"
on campanha_incentivo for insert
to authenticated
with check (public.jwt_papel() in ('admin', 'gestor_capital'));

create policy "update_campanha_gestor"
on campanha_incentivo for update
to authenticated
using (public.jwt_papel() in ('admin', 'gestor_capital'))
with check (public.jwt_papel() in ('admin', 'gestor_capital'));

create trigger campanha_incentivo_auditoria
after insert or update or delete on campanha_incentivo
for each row execute function public.registrar_auditoria();

create table oferta_administradora (
  id uuid primary key default gen_random_uuid(),
  administradora_id uuid not null references administradora(id),
  plano_id uuid not null references plano_consorcio_administradora(id),
  campanha_id uuid references campanha_incentivo(id),
  comissao_percentual numeric not null,
  estado text not null default 'coletado' check (estado in ('coletado', 'pendente_validacao', 'validado', 'vencido')),
  fonte text not null check (fonte in ('boletim', 'manual')),
  texto_origem text,
  vigencia_inicio date not null default current_date,
  vigencia_fim date,
  criado_por uuid references usuario_interno(id),
  validado_por uuid references usuario_interno(id),
  validado_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint oferta_validacao_check check (
    (estado = 'validado' and validado_por is not null and validado_em is not null)
    or (estado != 'validado')
  )
);

alter table oferta_administradora enable row level security;
create index idx_oferta_administradora_id on oferta_administradora (administradora_id);
create index idx_oferta_plano_id on oferta_administradora (plano_id);
create index idx_oferta_estado on oferta_administradora (estado);

create policy "select_oferta_autenticado"
on oferta_administradora for select
to authenticated
using (true);

create policy "insert_oferta_autenticado"
on oferta_administradora for insert
to authenticated
with check (estado in ('coletado', 'pendente_validacao'));

create policy "update_oferta_gestor"
on oferta_administradora for update
to authenticated
using (public.jwt_papel() in ('admin', 'gestor_capital'))
with check (public.jwt_papel() in ('admin', 'gestor_capital'));

create trigger oferta_administradora_auditoria
after insert or update or delete on oferta_administradora
for each row execute function public.registrar_auditoria();

create table politica_recomendacao_consorcio (
  id uuid primary key default gen_random_uuid(),
  peso_adequacao numeric not null,
  peso_resultado_comercial numeric not null,
  vigente boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint politica_pesos_check check (peso_adequacao + peso_resultado_comercial = 1)
);

alter table politica_recomendacao_consorcio enable row level security;
create unique index idx_politica_vigente on politica_recomendacao_consorcio (vigente) where vigente = true;

create policy "select_politica_autenticado"
on politica_recomendacao_consorcio for select
to authenticated
using (true);

create policy "insert_politica_gestor"
on politica_recomendacao_consorcio for insert
to authenticated
with check (public.jwt_papel() in ('admin', 'gestor_capital'));

create trigger politica_recomendacao_consorcio_auditoria
after insert or update or delete on politica_recomendacao_consorcio
for each row execute function public.registrar_auditoria();

insert into politica_recomendacao_consorcio (peso_adequacao, peso_resultado_comercial, vigente)
values (0.5, 0.5, true);
