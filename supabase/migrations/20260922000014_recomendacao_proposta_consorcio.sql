-- supabase/migrations/20260922000014_recomendacao_proposta_consorcio.sql

-- Fotografia da decisão do motor de recomendação (spec 7.2 / Item 7.7.3):
-- preserva a entrada, os pesos vigentes no momento e o ranking completo.
-- Os pesos são COPIADOS (não só referenciados por politica_id) porque a
-- política pode ser alterada depois; a fotografia não pode mudar junto.
create table recomendacao_consorcio (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references oportunidade(id),
  marca_id smallint not null references marca(id),
  politica_id uuid not null references politica_recomendacao_consorcio(id),
  peso_adequacao numeric not null,
  peso_resultado_comercial numeric not null,
  credito_desejado numeric not null check (credito_desejado > 0),
  prazo_desejado_meses integer not null check (prazo_desejado_meses > 0),
  resultado jsonb not null check (jsonb_typeof(resultado) = 'array'),
  criado_por uuid not null references usuario_interno(id),
  criado_em timestamptz not null default now()
);

alter table recomendacao_consorcio enable row level security;

create index idx_recomendacao_consorcio_marca_id on recomendacao_consorcio (marca_id);
create index idx_recomendacao_consorcio_oportunidade_id on recomendacao_consorcio (oportunidade_id);

create policy "select_recomendacao_consorcio_por_marca"
on recomendacao_consorcio for select
to authenticated
using (public.tem_acesso_marca(marca_id));

-- Além do acesso à marca: a oportunidade pai tem de ser da mesma marca e de
-- consórcio; o autor tem de ser o próprio usuário; e os pesos copiados têm
-- de ser exatamente os da política vigente referenciada (impede forjar uma
-- fotografia com pesos inventados via API direta).
create policy "insert_recomendacao_consorcio_por_marca"
on recomendacao_consorcio for insert
to authenticated
with check (
  public.tem_acesso_marca(marca_id)
  and criado_por = (select auth.uid())
  and exists (
    select 1 from oportunidade o
    where o.id = recomendacao_consorcio.oportunidade_id
      and o.marca_id = recomendacao_consorcio.marca_id
      and o.produto = 'consorcio'
  )
  and exists (
    select 1 from politica_recomendacao_consorcio p
    where p.id = recomendacao_consorcio.politica_id
      and p.vigente = true
      and p.peso_adequacao = recomendacao_consorcio.peso_adequacao
      and p.peso_resultado_comercial = recomendacao_consorcio.peso_resultado_comercial
  )
);

-- Sem política de UPDATE/DELETE: a fotografia é imutável por design.

create trigger recomendacao_consorcio_auditoria
after insert or update or delete on recomendacao_consorcio
for each row execute function public.registrar_auditoria();

-- Condição comercial congelada de uma proposta de consórcio (spec 10:
-- "proposta aprovada preserva a versão exata mesmo se a oferta da
-- administradora mudar depois"). Uma linha por proposta; os valores são
-- cópias da oferta/plano/administradora/campanha no instante da criação.
-- Sem marca_id próprio: o acesso segue a proposta pai (padrão proposta_item).
create table proposta_consorcio_condicao (
  id uuid primary key default gen_random_uuid(),
  proposta_id uuid not null unique references proposta(id),
  oferta_id uuid not null references oferta_administradora(id),
  recomendacao_id uuid references recomendacao_consorcio(id),
  administradora_id uuid not null references administradora(id),
  plano_id uuid not null references plano_consorcio_administradora(id),
  administradora_nome text not null,
  nome_plano text not null,
  credito numeric not null check (credito > 0),
  prazo_meses integer not null check (prazo_meses > 0),
  taxa_administracao_percentual numeric not null,
  comissao_percentual numeric not null,
  bonus_campanha_percentual numeric not null default 0,
  criado_em timestamptz not null default now()
);

alter table proposta_consorcio_condicao enable row level security;

create index idx_proposta_consorcio_condicao_oferta_id on proposta_consorcio_condicao (oferta_id);
create index idx_proposta_consorcio_condicao_recomendacao_id on proposta_consorcio_condicao (recomendacao_id) where recomendacao_id is not null;

create policy "select_proposta_consorcio_condicao_por_marca"
on proposta_consorcio_condicao for select
to authenticated
using (
  exists (
    select 1 from proposta p
    where p.id = proposta_consorcio_condicao.proposta_id
      and public.tem_acesso_marca(p.marca_id)
  )
);

-- Três provas no INSERT:
-- 1) a proposta pai é acessível, está em rascunho e é de uma oportunidade de
--    consórcio; a recomendação (se houver) é da mesma oportunidade;
-- 2) a oferta está validada e vigente, com administradora ativa;
-- 3) cada valor congelado é IGUAL ao valor atual da fonte e o crédito está
--    na faixa do plano — impede gravar uma condição forjada via API direta.
create policy "insert_proposta_consorcio_condicao_por_marca"
on proposta_consorcio_condicao for insert
to authenticated
with check (
  exists (
    select 1
    from proposta p
    join oportunidade o on o.id = p.oportunidade_id
    where p.id = proposta_consorcio_condicao.proposta_id
      and public.tem_acesso_marca(p.marca_id)
      and p.status = 'rascunho'
      and o.produto = 'consorcio'
      and (
        proposta_consorcio_condicao.recomendacao_id is null
        or exists (
          select 1 from recomendacao_consorcio r
          where r.id = proposta_consorcio_condicao.recomendacao_id
            and r.oportunidade_id = p.oportunidade_id
        )
      )
  )
  and exists (
    select 1
    from oferta_administradora f
    join plano_consorcio_administradora pl on pl.id = f.plano_id
    join administradora a on a.id = f.administradora_id
    left join campanha_incentivo c
      on c.id = f.campanha_id
      and c.vigencia_inicio <= current_date
      and (c.vigencia_fim is null or c.vigencia_fim >= current_date)
    where f.id = proposta_consorcio_condicao.oferta_id
      and f.estado = 'validado'
      and f.vigencia_inicio <= current_date
      and (f.vigencia_fim is null or f.vigencia_fim >= current_date)
      and a.situacao = 'ativa'
      and f.administradora_id = proposta_consorcio_condicao.administradora_id
      and f.plano_id = proposta_consorcio_condicao.plano_id
      and a.nome = proposta_consorcio_condicao.administradora_nome
      and pl.nome_plano = proposta_consorcio_condicao.nome_plano
      and pl.prazo_meses = proposta_consorcio_condicao.prazo_meses
      and pl.taxa_administracao_percentual = proposta_consorcio_condicao.taxa_administracao_percentual
      and f.comissao_percentual = proposta_consorcio_condicao.comissao_percentual
      and coalesce(c.bonus_percentual, 0) = proposta_consorcio_condicao.bonus_campanha_percentual
      and proposta_consorcio_condicao.credito between pl.credito_min and pl.credito_max
  )
);

-- Sem política de UPDATE/DELETE: a condição congelada é imutável. Mudou a
-- condição? Cria-se uma nova versão de proposta.

create trigger proposta_consorcio_condicao_auditoria
after insert or update or delete on proposta_consorcio_condicao
for each row execute function public.registrar_auditoria();
