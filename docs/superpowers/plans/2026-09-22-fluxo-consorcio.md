# Fluxo Consórcio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the commercial core to the recommendation engine and to the life of a consórcio cota: an immutable "fotografia" of each recommendation, a consórcio proposta whose commercial conditions are frozen at creation time, and the cota itself (parcelas, lances, contemplação) generated from the signed contrato.

**Architecture:** Everything consórcio-specific lives in `src/modules/consorcio`. Unlike `administradora`/`oferta_administradora` (Group-level), the tables added here belong to a **client's deal**, so they are **marca-scoped** via `public.tem_acesso_marca()` with parent-consistency checks in RLS (the lesson from migrations `…09`/`…10`/`…13`: every child row's RLS must prove it matches its parent, never trust the service layer alone). Snapshot tables (`recomendacao_consorcio`, `proposta_consorcio_condicao`, `consorcio_contemplacao`) are **append-only** — no UPDATE policy exists, by design. Mutable tables (`cota_consorcio`, `consorcio_parcela`, `consorcio_lance`) restrict UPDATE to their status columns through **column-level grants**, so values copied from the contrato can never be edited afterwards. The consórcio module reads `oportunidade`/`contrato` only through new `obterOportunidade`/`obterContrato` functions on the commercial services (spec 3.2: modules do not reach into another module's tables).

**Tech Stack:** Same as prior plans — Next.js 16 (App Router), TypeScript strict, Supabase (Postgres + Auth + RLS), Zod 4, Vitest 5 against the local Supabase stack.

**Spec:** `/Users/MJallas/CRM/docs/superpowers/specs/2026-09-22-piloto-mcj-capital-design.md` (sections 4.2, 6.1, 7.2, 10)

**Out of scope for this plan (next plan: "Financeiro básico e comissionamento"):** `obrigacao`, `evento_financeiro`, `titulo_pagar`/`titulo_receber`, comissão MCJ and internal commissioning (spec 6.1 tail and 6.3 "área financeira básica"). Those tables are shared with Planejamento Patrimonial and deserve their own plan. The IA explanation of the ranking (spec 7.2) is also out — this plan only makes the ranking auditable, which is its prerequisite.

## Global Constraints

- RLS habilitado na mesma migração que cria a tabela, com todas as políticas que este plano usa. Tabelas de fotografia/evento são deliberadamente sem política de UPDATE/DELETE (imutáveis) — isso deve estar comentado na migração.
- Toda tabela deste plano é marca-scoped: acesso via `public.tem_acesso_marca(...)`, direto (coluna `marca_id`) ou herdado do pai via `exists (...)` (padrão de `proposta_item`).
- Toda política de INSERT/UPDATE que referencia um pai (oportunidade, proposta, contrato, cota, oferta, lance) verifica consistência com esse pai no próprio RLS.
- Migrações do Supabase em `supabase/migrations/`, nunca editadas retroativamente. Numeração continua em `20260922000014`.
- Após cada migração: regenerar `src/lib/supabase/database.types.ts` com `npx supabase gen types typescript --local` e commitar junto.
- TypeScript em modo `strict`. Ações de negócio passam por validação Zod antes de tocar o banco.
- O módulo `consorcio` nunca lê `oportunidade`, `proposta` ou `contrato` com `client.from(...)` — usa `obterOportunidade`, `criarProposta`, `obterContrato` do módulo `commercial`.
- Critério de aceite do spec (seção 10) que este plano precisa provar em teste: "Proposta aprovada preserva a versão exata mesmo se a oferta da administradora mudar depois" e "Motor de recomendação […] preserva a fotografia da decisão".
- Nenhuma credencial em texto no código. Testes rodam contra o Supabase local (`http://127.0.0.1:54321`) com `.env.local`.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260922000014_recomendacao_proposta_consorcio.sql` | `recomendacao_consorcio` (fotografia) + `proposta_consorcio_condicao` (condição congelada) |
| `supabase/migrations/20260922000015_cota_consorcio.sql` | `cota_consorcio`, `consorcio_parcela`, `consorcio_lance`, `consorcio_contemplacao` + trigger de contemplação |
| `src/modules/consorcio/datas.ts` (+ `.test.ts`) | Funções puras de data: `hojeIso`, `estaVigente`, `adicionarMeses`, `DATA_ISO_REGEX` |
| `src/modules/consorcio/test-fixtures.ts` | Helpers de teste compartilhados (usuário de teste, oferta validada, contrato de consórcio pronto) |
| `src/modules/consorcio/recomendacao.service.ts` (modify) | `calcularRecomendacao`, `recomendarAdministradoras`, `registrarRecomendacao`, `listarRecomendacoes` |
| `src/modules/consorcio/recomendacao-registro.test.ts` | Testes da fotografia |
| `src/modules/consorcio/proposta-consorcio.{schema,service,service.test}.ts` | `criarPropostaConsorcio`, `obterCondicaoPorProposta` |
| `src/modules/consorcio/cota.{schema,service,service.test}.ts` | `criarCotaConsorcio`, `obterCota`, `listarCotas`, `listarParcelas`, `registrarPagamentoParcela` |
| `src/modules/consorcio/lance.{schema,service,service.test}.ts` | `registrarLance`, `atualizarStatusLance`, `registrarContemplacao` |
| `src/modules/commercial/oportunidade.service.ts` (modify) | + `obterOportunidade` |
| `src/modules/commercial/contrato.service.ts` (modify) | + `obterContrato` |
| `vitest.config.mts` (modify) | `fileParallelism: false` (ver Task 4) |
| `src/app/consorcio/{page.tsx,actions.ts}` | UI mínima do fluxo |

---

### Task 1: Migração — recomendacao_consorcio e proposta_consorcio_condicao

**Files:**
- Create: `supabase/migrations/20260922000014_recomendacao_proposta_consorcio.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerado)

**Interfaces:**
- Consumes: `oportunidade`, `proposta`, `marca`, `usuario_interno`, `politica_recomendacao_consorcio`, `oferta_administradora`, `plano_consorcio_administradora`, `administradora`, `campanha_incentivo`; `public.tem_acesso_marca(smallint)`, `public.registrar_auditoria()`.
- Produces: tabelas `recomendacao_consorcio` e `proposta_consorcio_condicao` (colunas exatamente como no SQL abaixo — Tasks 4 e 5 dependem delas).

- [ ] **Step 1: Escrever a migração**

```sql
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
```

- [ ] **Step 2: Aplicar e regenerar os tipos**

```bash
export PATH="/Users/MJallas/.docker/bin:$PATH" && npx supabase db reset
export PATH="/Users/MJallas/.docker/bin:$PATH" && npx supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

Expected: `db reset` sem erros. `grep -n "recomendacao_consorcio\|proposta_consorcio_condicao" src/lib/supabase/database.types.ts` mostra as duas tabelas.

- [ ] **Step 3: Rodar a suíte existente (nada pode quebrar)**

```bash
npm test && npx tsc --noEmit
```

Expected: todos os testes existentes passam; `tsc` limpo.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260922000014_recomendacao_proposta_consorcio.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): add recomendacao_consorcio snapshot and frozen proposta_consorcio_condicao"
```

---

### Task 2: Migração — cota, parcelas, lances e contemplação

**Files:**
- Create: `supabase/migrations/20260922000015_cota_consorcio.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerado)

**Interfaces:**
- Consumes: `contrato`, `proposta_consorcio_condicao` (Task 1), `administradora`, `plano_consorcio_administradora`, `marca`; `public.tem_acesso_marca(smallint)`, `public.registrar_auditoria()`.
- Produces: tabelas `cota_consorcio`, `consorcio_parcela`, `consorcio_lance`, `consorcio_contemplacao`; função de trigger `public.aplicar_contemplacao()` que, ao inserir uma contemplação, muda a cota para `contemplada` e o lance vencedor (se houver) para `vencedor`. UPDATE via API só nas colunas `cota_consorcio(status, atualizado_em)`, `consorcio_parcela(status, pago_em)`, `consorcio_lance(status)`.

- [ ] **Step 1: Escrever a migração**

```sql
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
  unique (administradora_id, grupo, numero_cota)
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

-- UPDATE só altera status/atualizado_em (grant de coluna abaixo), então
-- contrato_id e as condições copiadas não podem ser reapontadas/editadas;
-- a política precisa apenas do acesso à marca.
create policy "update_cota_consorcio_por_marca"
on cota_consorcio for update
to authenticated
using (public.tem_acesso_marca(marca_id))
with check (public.tem_acesso_marca(marca_id));

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
  )
);

create policy "update_consorcio_parcela_por_marca"
on consorcio_parcela for update
to authenticated
using (
  exists (
    select 1 from cota_consorcio ct
    where ct.id = consorcio_parcela.cota_id
      and public.tem_acesso_marca(ct.marca_id)
  )
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

-- 'vencedor' só é aceito quando já existe a contemplação que aponta para
-- este lance (é o trigger aplicar_contemplacao quem faz essa transição).
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
  and (
    status <> 'vencedor'
    or exists (
      select 1 from consorcio_contemplacao cc
      where cc.lance_id = consorcio_lance.id
    )
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
```

- [ ] **Step 2: Aplicar e regenerar os tipos**

```bash
export PATH="/Users/MJallas/.docker/bin:$PATH" && npx supabase db reset
export PATH="/Users/MJallas/.docker/bin:$PATH" && npx supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

Expected: `db reset` sem erros; as 4 tabelas aparecem em `database.types.ts`.

- [ ] **Step 3: Rodar a suíte existente**

```bash
npm test && npx tsc --noEmit
```

Expected: tudo passa.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260922000015_cota_consorcio.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): add cota_consorcio, parcelas, lances and contemplacao with column-level update grants"
```

---

### Task 3: Funções puras de data

**Files:**
- Create: `src/modules/consorcio/datas.ts`
- Test: `src/modules/consorcio/datas.test.ts`

**Interfaces:**
- Produces:
  - `DATA_ISO_REGEX: RegExp` — `/^\d{4}-\d{2}-\d{2}$/`
  - `hojeIso(): string` — data UTC de hoje em `YYYY-MM-DD` (mesma convenção do `recomendacao.service` atual e do `current_date` do Postgres local).
  - `estaVigente(inicio: string, fim: string | null, hoje: string): boolean`
  - `adicionarMeses(dataIso: string, meses: number): string` — soma meses de calendário; se o dia não existe no mês de destino, usa o último dia do mês.

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// src/modules/consorcio/datas.test.ts
import { describe, it, expect } from "vitest";
import { adicionarMeses, estaVigente, hojeIso, DATA_ISO_REGEX } from "./datas";

describe("adicionarMeses", () => {
  it("soma meses mantendo o dia", () => {
    expect(adicionarMeses("2031-05-10", 1)).toBe("2031-06-10");
    expect(adicionarMeses("2031-05-10", 0)).toBe("2031-05-10");
  });

  it("vira o ano", () => {
    expect(adicionarMeses("2031-11-15", 2)).toBe("2032-01-15");
    expect(adicionarMeses("2031-01-15", 24)).toBe("2033-01-15");
  });

  it("usa o último dia do mês quando o dia não existe no destino", () => {
    expect(adicionarMeses("2031-01-31", 1)).toBe("2031-02-28");
    expect(adicionarMeses("2032-01-31", 1)).toBe("2032-02-29");
    expect(adicionarMeses("2031-03-31", 1)).toBe("2031-04-30");
  });

  it("não acumula o encurtamento ao somar a partir da data original", () => {
    expect(adicionarMeses("2031-01-31", 2)).toBe("2031-03-31");
  });
});

describe("estaVigente", () => {
  it("considera inclusivos o início e o fim", () => {
    expect(estaVigente("2031-01-01", "2031-01-31", "2031-01-01")).toBe(true);
    expect(estaVigente("2031-01-01", "2031-01-31", "2031-01-31")).toBe(true);
  });

  it("fim nulo significa sem prazo", () => {
    expect(estaVigente("2031-01-01", null, "2099-12-31")).toBe(true);
  });

  it("fora da janela não é vigente", () => {
    expect(estaVigente("2031-01-01", "2031-01-31", "2030-12-31")).toBe(false);
    expect(estaVigente("2031-01-01", "2031-01-31", "2031-02-01")).toBe(false);
  });
});

describe("hojeIso", () => {
  it("retorna a data no formato YYYY-MM-DD", () => {
    expect(hojeIso()).toMatch(DATA_ISO_REGEX);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/datas.test.ts`
Expected: FAIL — `Failed to resolve import "./datas"`.

- [ ] **Step 3: Implementar**

```typescript
// src/modules/consorcio/datas.ts
export const DATA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function estaVigente(inicio: string, fim: string | null, hoje: string): boolean {
  return inicio <= hoje && (fim === null || fim >= hoje);
}

export function adicionarMeses(dataIso: string, meses: number): string {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const indiceMesAlvo = mes - 1 + meses;
  const anoAlvo = ano + Math.floor(indiceMesAlvo / 12);
  const mesAlvo = ((indiceMesAlvo % 12) + 12) % 12;
  const ultimoDiaDoMes = new Date(Date.UTC(anoAlvo, mesAlvo + 1, 0)).getUTCDate();
  const diaAlvo = Math.min(dia, ultimoDiaDoMes);
  return `${anoAlvo}-${String(mesAlvo + 1).padStart(2, "0")}-${String(diaAlvo).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/datas.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/consorcio/datas.ts src/modules/consorcio/datas.test.ts
git commit -m "feat(consorcio): add pure date helpers for vigência and monthly schedules"
```

---

### Task 4: Fotografia da recomendação

**Files:**
- Modify: `src/modules/consorcio/recomendacao.service.ts` (arquivo inteiro abaixo)
- Modify: `src/modules/consorcio/recomendacao.schema.ts`
- Modify: `src/modules/commercial/oportunidade.service.ts` (+ `obterOportunidade`)
- Modify: `vitest.config.mts`
- Create: `src/modules/consorcio/test-fixtures.ts`
- Test: `src/modules/consorcio/recomendacao-registro.test.ts`

**Interfaces:**
- Consumes: tabela `recomendacao_consorcio` (Task 1); `hojeIso`, `estaVigente` (Task 3); `criarAdministradora`, `criarPlanoConsorcio`, `criarCampanhaIncentivo` (administradora.service); `criarOfertaAdministradora`, `validarOferta` (oferta.service); `criarPessoaFisica` (identity); `criarOportunidade` (commercial).
- Produces:
  - `obterOportunidade(client, oportunidadeId: string): Promise<Oportunidade>` em `@/modules/commercial/oportunidade.service`.
  - `type ResultadoRecomendacao = { ofertaId; administradoraId; administradoraNome; planoId; prazoMeses: number; comissaoEfetiva: number; adequacao; resultadoComercial; scoreFinal }` (agora `type`, não `interface`, para ser atribuível a `Json`; ganha `prazoMeses` e `comissaoEfetiva`).
  - `calcularRecomendacao(client, input: RecomendarAdministradorasInput): Promise<{ politica: { id: string; pesoAdequacao: number; pesoResultadoComercial: number }; resultados: ResultadoRecomendacao[] }>`
  - `recomendarAdministradoras(client, input): Promise<ResultadoRecomendacao[]>` — mesma assinatura de antes.
  - `registrarRecomendacao(client, input: RegistrarRecomendacaoInput): Promise<RecomendacaoRegistrada>` onde `RegistrarRecomendacaoInput = { oportunidadeId: string; creditoDesejado: number; prazoDesejadoMeses: number }` e `RecomendacaoRegistrada = Omit<Row<"recomendacao_consorcio">, "resultado"> & { resultado: ResultadoRecomendacao[] }`.
  - `listarRecomendacoes(client, limite = 20): Promise<RecomendacaoRegistrada[]>` — mais recentes primeiro.
  - `test-fixtures.ts`: `SUPABASE_URL`, `criarClienteAdmin()`, `criarUsuarioDeTeste(admin, email, papelCodigo, marcaCodigo)`, `criarOfertaValidada(clienteGestor, opcoes?)`.

**Por que `fileParallelism: false`:** Vitest roda arquivos de teste em paralelo por padrão, e todos compartilham o mesmo banco local. `recomendacao.service.test.ts` altera temporariamente a política vigente (singleton global); rodando em paralelo com `registrarRecomendacao`, o INSERT pode ver pesos diferentes dos que foram lidos e falhar no RLS de forma intermitente. Serializar os arquivos elimina essa classe de flakiness.

- [ ] **Step 1: Serializar os arquivos de teste**

Em `vitest.config.mts`, dentro de `test`, adicione `fileParallelism: false`:

```typescript
  test: {
    exclude: ["**/node_modules/**", "**/.worktrees/**", "**/dist/**", "**/.next/**"],
    // Os arquivos compartilham um único banco local e alguns alteram estado
    // global (política de recomendação vigente) — rodar em série.
    fileParallelism: false,
  },
```

- [ ] **Step 2: Criar os helpers de teste compartilhados**

```typescript
// src/modules/consorcio/test-fixtures.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  criarAdministradora,
  criarPlanoConsorcio,
  criarCampanhaIncentivo,
  type Administradora,
  type PlanoConsorcio,
} from "./administradora.service";
import {
  criarOfertaAdministradora,
  validarOferta,
  type OfertaAdministradora,
} from "./oferta.service";
import { hojeIso } from "./datas";

export const SUPABASE_URL = "http://127.0.0.1:54321";

export function criarClienteAdmin(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function criarUsuarioDeTeste(
  admin: SupabaseClient<Database>,
  email: string,
  papelCodigo: string,
  marcaCodigo: string
): Promise<SupabaseClient<Database>> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "senha-teste-123",
    email_confirm: true,
  });
  if (error) throw error;

  const { data: papel, error: papelError } = await admin
    .from("papel")
    .select("id")
    .eq("codigo", papelCodigo)
    .single();
  if (papelError) throw papelError;

  const { data: marca, error: marcaError } = await admin
    .from("marca")
    .select("id")
    .eq("codigo", marcaCodigo)
    .single();
  if (marcaError) throw marcaError;

  const { error: usuarioInternoError } = await admin.from("usuario_interno").insert({
    id: data.user.id,
    nome: email,
    papel_id: papel.id,
    marca_id: marca.id,
  });
  if (usuarioInternoError) throw usuarioInternoError;

  const cliente = createClient<Database>(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  await cliente.auth.signInWithPassword({ email, password: "senha-teste-123" });
  return cliente;
}

export interface OpcoesOfertaValidada {
  prazoMeses?: number;
  comissaoPercentual?: number;
  creditoMin?: number;
  creditoMax?: number;
  bonusCampanhaPercentual?: number;
}

export async function criarOfertaValidada(
  clienteGestor: SupabaseClient<Database>,
  opcoes: OpcoesOfertaValidada = {}
): Promise<{ administradora: Administradora; plano: PlanoConsorcio; oferta: OfertaAdministradora }> {
  const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const administradora = await criarAdministradora(clienteGestor, {
    nome: `Administradora Fixture ${sufixo}`,
  });
  const plano = await criarPlanoConsorcio(clienteGestor, {
    administradoraId: administradora.id,
    nomePlano: `Plano Fixture ${sufixo}`,
    creditoMin: opcoes.creditoMin ?? 50000,
    creditoMax: opcoes.creditoMax ?? 150000,
    prazoMeses: opcoes.prazoMeses ?? 60,
    taxaAdministracaoPercentual: 18,
  });
  const campanha =
    opcoes.bonusCampanhaPercentual !== undefined
      ? await criarCampanhaIncentivo(clienteGestor, {
          administradoraId: administradora.id,
          nome: `Campanha Fixture ${sufixo}`,
          bonusPercentual: opcoes.bonusCampanhaPercentual,
          vigenciaInicio: hojeIso(),
        })
      : undefined;
  const ofertaColetada = await criarOfertaAdministradora(clienteGestor, {
    administradoraId: administradora.id,
    planoId: plano.id,
    campanhaId: campanha?.id,
    comissaoPercentual: opcoes.comissaoPercentual ?? 5,
    fonte: "manual",
  });
  const oferta = await validarOferta(clienteGestor, ofertaColetada.id);

  return { administradora, plano, oferta };
}
```

- [ ] **Step 3: Escrever os testes que falham**

```typescript
// src/modules/consorcio/recomendacao-registro.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarPessoaFisica } from "@/modules/identity/pessoa.service";
import { criarOportunidade } from "@/modules/commercial/oportunidade.service";
import { registrarRecomendacao, listarRecomendacoes } from "./recomendacao.service";
import { criarClienteAdmin, criarUsuarioDeTeste, criarOfertaValidada } from "./test-fixtures";

let admin: SupabaseClient<Database>;
let clienteGestor: SupabaseClient<Database>;
let clienteConsultor: SupabaseClient<Database>;
let clienteAmazon: SupabaseClient<Database>;

beforeAll(async () => {
  admin = criarClienteAdmin();
  const sufixo = Date.now();
  clienteGestor = await criarUsuarioDeTeste(admin, `fotografia-gestor-${sufixo}@teste.mcj`, "gestor_capital", "capital");
  clienteConsultor = await criarUsuarioDeTeste(admin, `fotografia-consultor-${sufixo}@teste.mcj`, "consultor_capital", "capital");
  clienteAmazon = await criarUsuarioDeTeste(admin, `fotografia-amazon-${sufixo}@teste.mcj`, "consultor_capital", "amazon");
});

async function criarOportunidadeConsorcio(nome: string) {
  const pessoa = await criarPessoaFisica(clienteConsultor, { nomeCompleto: nome, marcaEntradaId: 4 });
  return criarOportunidade(clienteConsultor, {
    pessoaFisicaId: pessoa.id,
    marcaId: 4,
    produto: "consorcio",
  });
}

describe("registrarRecomendacao", () => {
  it("grava a fotografia com entrada, pesos vigentes e ranking completo", async () => {
    const { oferta } = await criarOfertaValidada(clienteGestor, { prazoMeses: 60 });
    const oportunidade = await criarOportunidadeConsorcio("Cliente Fotografia");

    const { data: politica, error: erroPolitica } = await clienteConsultor
      .from("politica_recomendacao_consorcio")
      .select("id, peso_adequacao, peso_resultado_comercial")
      .eq("vigente", true)
      .single();
    if (erroPolitica) throw erroPolitica;

    const registrada = await registrarRecomendacao(clienteConsultor, {
      oportunidadeId: oportunidade.id,
      creditoDesejado: 100000,
      prazoDesejadoMeses: 60,
    });

    expect(registrada.oportunidade_id).toBe(oportunidade.id);
    expect(registrada.marca_id).toBe(4);
    expect(registrada.politica_id).toBe(politica.id);
    expect(registrada.peso_adequacao).toBe(politica.peso_adequacao);
    expect(registrada.peso_resultado_comercial).toBe(politica.peso_resultado_comercial);
    expect(registrada.credito_desejado).toBe(100000);
    expect(registrada.prazo_desejado_meses).toBe(60);

    const item = registrada.resultado.find((r) => r.ofertaId === oferta.id);
    expect(item).toBeDefined();
    expect(item!.prazoMeses).toBe(60);
    expect(item!.adequacao).toBe(1);

    const scores = registrada.resultado.map((r) => r.scoreFinal);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    const recentes = await listarRecomendacoes(clienteConsultor);
    expect(recentes.some((r) => r.id === registrada.id)).toBe(true);
  });

  it("recusa oportunidade que não é de consórcio", async () => {
    const pessoa = await criarPessoaFisica(clienteConsultor, {
      nomeCompleto: "Cliente Patrimonial Sem Recomendacao",
      marcaEntradaId: 4,
    });
    const oportunidade = await criarOportunidade(clienteConsultor, {
      pessoaFisicaId: pessoa.id,
      marcaId: 4,
      produto: "planejamento_patrimonial",
    });

    await expect(
      registrarRecomendacao(clienteConsultor, {
        oportunidadeId: oportunidade.id,
        creditoDesejado: 100000,
        prazoDesejadoMeses: 60,
      })
    ).rejects.toThrow("A oportunidade não é de consórcio");
  });

  it("a fotografia é imutável: UPDATE via API não altera a linha", async () => {
    const oportunidade = await criarOportunidadeConsorcio("Cliente Fotografia Imutavel");
    const registrada = await registrarRecomendacao(clienteConsultor, {
      oportunidadeId: oportunidade.id,
      creditoDesejado: 100000,
      prazoDesejadoMeses: 60,
    });

    await clienteConsultor
      .from("recomendacao_consorcio")
      .update({ resultado: [], peso_adequacao: 0.9 })
      .eq("id", registrada.id);

    const { data: relida, error } = await admin
      .from("recomendacao_consorcio")
      .select("resultado, peso_adequacao")
      .eq("id", registrada.id)
      .single();
    if (error) throw error;

    expect(relida.peso_adequacao).toBe(registrada.peso_adequacao);
    expect(relida.resultado).toEqual(registrada.resultado);
  });

  it("RLS recusa fotografia com pesos diferentes dos da política vigente", async () => {
    const oportunidade = await criarOportunidadeConsorcio("Cliente Pesos Forjados");
    const { data: politica, error: erroPolitica } = await clienteConsultor
      .from("politica_recomendacao_consorcio")
      .select("id")
      .eq("vigente", true)
      .single();
    if (erroPolitica) throw erroPolitica;
    const { data: userData } = await clienteConsultor.auth.getUser();

    const { error } = await clienteConsultor.from("recomendacao_consorcio").insert({
      oportunidade_id: oportunidade.id,
      marca_id: 4,
      politica_id: politica.id,
      peso_adequacao: 0.9,
      peso_resultado_comercial: 0.1,
      credito_desejado: 100000,
      prazo_desejado_meses: 60,
      resultado: [],
      criado_por: userData.user!.id,
    });

    expect(error).not.toBeNull();
  });

  it("RLS isola a fotografia por marca", async () => {
    const oportunidade = await criarOportunidadeConsorcio("Cliente Fotografia Isolada");
    const registrada = await registrarRecomendacao(clienteConsultor, {
      oportunidadeId: oportunidade.id,
      creditoDesejado: 100000,
      prazoDesejadoMeses: 60,
    });

    const { data: vistasPelaAmazon, error } = await clienteAmazon
      .from("recomendacao_consorcio")
      .select("id")
      .eq("id", registrada.id);
    if (error) throw error;
    expect(vistasPelaAmazon).toHaveLength(0);

    await expect(
      registrarRecomendacao(clienteAmazon, {
        oportunidadeId: oportunidade.id,
        creditoDesejado: 100000,
        prazoDesejadoMeses: 60,
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/recomendacao-registro.test.ts`
Expected: FAIL — `registrarRecomendacao` / `listarRecomendacoes` não exportados.

- [ ] **Step 5: Adicionar `obterOportunidade` ao serviço comercial**

Acrescente ao final de `src/modules/commercial/oportunidade.service.ts`:

```typescript
export async function obterOportunidade(
  client: SupabaseClient<Database>,
  oportunidadeId: string
): Promise<Oportunidade> {
  const { data, error } = await client
    .from("oportunidade")
    .select("*")
    .eq("id", oportunidadeId)
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 6: Adicionar o schema de registro**

Acrescente ao final de `src/modules/consorcio/recomendacao.schema.ts`:

```typescript
export const registrarRecomendacaoSchema = recomendarAdministradorasSchema.extend({
  oportunidadeId: z.string().uuid(),
});

export type RegistrarRecomendacaoInput = z.infer<typeof registrarRecomendacaoSchema>;
```

- [ ] **Step 7: Reescrever `recomendacao.service.ts`**

O cálculo não muda (os testes existentes em `recomendacao.service.test.ts` continuam valendo sem alteração). O que muda: o corpo vira `calcularRecomendacao`, que também devolve a política usada (com `id`); `recomendarAdministradoras` vira um wrapper; o resultado ganha `prazoMeses` e `comissaoEfetiva`; a checagem de vigência usa `estaVigente`/`hojeIso`.

```typescript
// src/modules/consorcio/recomendacao.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { obterOportunidade } from "@/modules/commercial/oportunidade.service";
import {
  recomendarAdministradorasSchema,
  registrarRecomendacaoSchema,
  type RecomendarAdministradorasInput,
  type RegistrarRecomendacaoInput,
} from "./recomendacao.schema";
import { estaVigente, hojeIso } from "./datas";

// `type` (não `interface`) para ser atribuível a `Json` ao gravar a fotografia.
export type ResultadoRecomendacao = {
  ofertaId: string;
  administradoraId: string;
  administradoraNome: string;
  planoId: string;
  prazoMeses: number;
  comissaoEfetiva: number;
  adequacao: number;
  resultadoComercial: number;
  scoreFinal: number;
};

export interface CalculoRecomendacao {
  politica: { id: string; pesoAdequacao: number; pesoResultadoComercial: number };
  resultados: ResultadoRecomendacao[];
}

type RecomendacaoRow = Database["public"]["Tables"]["recomendacao_consorcio"]["Row"];

export type RecomendacaoRegistrada = Omit<RecomendacaoRow, "resultado"> & {
  resultado: ResultadoRecomendacao[];
};

export async function calcularRecomendacao(
  client: SupabaseClient<Database>,
  input: RecomendarAdministradorasInput
): Promise<CalculoRecomendacao> {
  const dadosValidados = recomendarAdministradorasSchema.parse(input);

  const { data: politicaRow, error: erroPolitica } = await client
    .from("politica_recomendacao_consorcio")
    .select("id, peso_adequacao, peso_resultado_comercial")
    .eq("vigente", true)
    .single();
  if (erroPolitica) throw erroPolitica;

  const politica = {
    id: politicaRow.id,
    pesoAdequacao: politicaRow.peso_adequacao,
    pesoResultadoComercial: politicaRow.peso_resultado_comercial,
  };

  const hoje = hojeIso();

  const { data: ofertas, error: erroOfertas } = await client
    .from("oferta_administradora")
    .select("id, administradora_id, plano_id, comissao_percentual, campanha_id, vigencia_inicio, vigencia_fim")
    .eq("estado", "validado")
    .lte("vigencia_inicio", hoje)
    .or(`vigencia_fim.is.null,vigencia_fim.gte.${hoje}`)
    .order("id")
    .limit(1000);
  if (erroOfertas) throw erroOfertas;
  if (!ofertas || ofertas.length === 0) return { politica, resultados: [] };

  const administradoraIds = [...new Set(ofertas.map((o) => o.administradora_id))];
  const planoIds = [...new Set(ofertas.map((o) => o.plano_id))];
  const campanhaIds = [
    ...new Set(ofertas.map((o) => o.campanha_id).filter((id): id is string => id != null)),
  ];

  const { data: administradoras, error: erroAdm } = await client
    .from("administradora")
    .select("id, nome, situacao")
    .in("id", administradoraIds);
  if (erroAdm) throw erroAdm;

  const { data: planos, error: erroPlanos } = await client
    .from("plano_consorcio_administradora")
    .select("id, credito_min, credito_max, prazo_meses")
    .in("id", planoIds);
  if (erroPlanos) throw erroPlanos;

  const { data: campanhas, error: erroCampanhas } =
    campanhaIds.length > 0
      ? await client
          .from("campanha_incentivo")
          .select("id, bonus_percentual, vigencia_inicio, vigencia_fim")
          .in("id", campanhaIds)
      : { data: [], error: null };
  if (erroCampanhas) throw erroCampanhas;

  const administradoraPorId = new Map((administradoras ?? []).map((a) => [a.id, a]));
  const planoPorId = new Map((planos ?? []).map((p) => [p.id, p]));
  const campanhaPorId = new Map((campanhas ?? []).map((c) => [c.id, c]));

  const elegiveis = ofertas
    .map((oferta) => {
      const administradora = administradoraPorId.get(oferta.administradora_id);
      const plano = planoPorId.get(oferta.plano_id);
      if (!administradora || !plano) {
        throw new Error(
          `Inconsistência de dados: oferta ${oferta.id} referencia administradora ou plano inexistente`
        );
      }
      if (administradora.situacao !== "ativa") return null;
      if (
        dadosValidados.creditoDesejado < plano.credito_min ||
        dadosValidados.creditoDesejado > plano.credito_max
      )
        return null;

      const campanha = oferta.campanha_id ? campanhaPorId.get(oferta.campanha_id) : undefined;
      const campanhaVigente =
        campanha !== undefined && estaVigente(campanha.vigencia_inicio, campanha.vigencia_fim, hoje);
      const comissaoEfetiva = oferta.comissao_percentual + (campanhaVigente ? campanha.bonus_percentual : 0);

      return {
        ofertaId: oferta.id,
        administradoraId: administradora.id,
        administradoraNome: administradora.nome,
        planoId: plano.id,
        prazoMeses: plano.prazo_meses,
        comissaoEfetiva,
      };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null);

  if (elegiveis.length === 0) return { politica, resultados: [] };

  const comissoes = elegiveis.map((o) => o.comissaoEfetiva);
  const comissaoMin = Math.min(...comissoes);
  const comissaoMax = Math.max(...comissoes);

  const resultados: ResultadoRecomendacao[] = elegiveis.map((oferta) => {
    const distanciaPrazo = Math.abs(oferta.prazoMeses - dadosValidados.prazoDesejadoMeses);
    const adequacao = Math.max(0, 1 - distanciaPrazo / dadosValidados.prazoDesejadoMeses);

    const resultadoComercial =
      comissaoMax === comissaoMin
        ? 1
        : (oferta.comissaoEfetiva - comissaoMin) / (comissaoMax - comissaoMin);

    const scoreFinal =
      politica.pesoAdequacao * adequacao + politica.pesoResultadoComercial * resultadoComercial;

    return { ...oferta, adequacao, resultadoComercial, scoreFinal };
  });

  return { politica, resultados: resultados.sort((a, b) => b.scoreFinal - a.scoreFinal) };
}

export async function recomendarAdministradoras(
  client: SupabaseClient<Database>,
  input: RecomendarAdministradorasInput
): Promise<ResultadoRecomendacao[]> {
  const { resultados } = await calcularRecomendacao(client, input);
  return resultados;
}

export async function registrarRecomendacao(
  client: SupabaseClient<Database>,
  input: RegistrarRecomendacaoInput
): Promise<RecomendacaoRegistrada> {
  const dadosValidados = registrarRecomendacaoSchema.parse(input);

  const oportunidade = await obterOportunidade(client, dadosValidados.oportunidadeId);
  if (oportunidade.produto !== "consorcio") {
    throw new Error("A oportunidade não é de consórcio");
  }

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;

  const { politica, resultados } = await calcularRecomendacao(client, {
    creditoDesejado: dadosValidados.creditoDesejado,
    prazoDesejadoMeses: dadosValidados.prazoDesejadoMeses,
  });

  const { data, error } = await client
    .from("recomendacao_consorcio")
    .insert({
      oportunidade_id: oportunidade.id,
      marca_id: oportunidade.marca_id,
      politica_id: politica.id,
      peso_adequacao: politica.pesoAdequacao,
      peso_resultado_comercial: politica.pesoResultadoComercial,
      credito_desejado: dadosValidados.creditoDesejado,
      prazo_desejado_meses: dadosValidados.prazoDesejadoMeses,
      resultado: resultados,
      criado_por: userData.user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return { ...data, resultado: resultados };
}

export async function listarRecomendacoes(
  client: SupabaseClient<Database>,
  limite = 20
): Promise<RecomendacaoRegistrada[]> {
  const { data, error } = await client
    .from("recomendacao_consorcio")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(limite);

  if (error) throw error;
  return data.map((row) => ({ ...row, resultado: row.resultado as ResultadoRecomendacao[] }));
}
```

- [ ] **Step 8: Rodar os testes novos e os antigos do motor**

Run: `npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/recomendacao-registro.test.ts src/modules/consorcio/recomendacao.service.test.ts`
Expected: PASS (5 novos + 4 existentes). Se `expect(registrada.resultado).toEqual(...)`/`toBe` em pesos falhar por tipo (`"0.5"` vs `0.5`), confira em `database.types.ts` que `numeric` foi gerado como `number` — é o que os serviços existentes já assumem.

- [ ] **Step 9: Suíte completa e tipos**

```bash
npm test && npx tsc --noEmit
```

Expected: tudo passa.

- [ ] **Step 10: Commit**

```bash
git add vitest.config.mts src/modules/consorcio/test-fixtures.ts src/modules/consorcio/recomendacao-registro.test.ts src/modules/consorcio/recomendacao.service.ts src/modules/consorcio/recomendacao.schema.ts src/modules/commercial/oportunidade.service.ts
git commit -m "feat(consorcio): persist immutable recommendation snapshot with pinned policy weights"
```

---

### Task 5: Proposta de consórcio com condição congelada

**Files:**
- Create: `src/modules/consorcio/proposta-consorcio.schema.ts`
- Create: `src/modules/consorcio/proposta-consorcio.service.ts`
- Test: `src/modules/consorcio/proposta-consorcio.service.test.ts`

**Interfaces:**
- Consumes: tabela `proposta_consorcio_condicao` (Task 1); `obterOportunidade` (Task 4); `criarProposta`, `aprovarProposta`, tipos `Proposta`, `PropostaItem` (`@/modules/commercial/proposta.service`); `hojeIso`, `estaVigente` (Task 3); `registrarRecomendacao` (Task 4); fixtures (Task 4).
- Produces:
  - `criarPropostaConsorcio(client, input: CriarPropostaConsorcioInput): Promise<PropostaConsorcio>` onde `CriarPropostaConsorcioInput = { oportunidadeId: string; ofertaId: string; credito: number; recomendacaoId?: string; validade?: string }` e `PropostaConsorcio = Proposta & { itens: PropostaItem[]; condicao: PropostaConsorcioCondicao }`.
  - `obterCondicaoPorProposta(client, propostaId: string): Promise<PropostaConsorcioCondicao | null>`
  - `type PropostaConsorcioCondicao = Row<"proposta_consorcio_condicao">`
  - Mensagens de erro exatas: `"A oportunidade não é de consórcio"`, `"Só é possível propor a partir de uma oferta validada"`, `"A oferta não está vigente"`, `"Crédito fora da faixa do plano"`, `"A administradora não está ativa"`, `"A recomendação pertence a outra oportunidade"`.

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// src/modules/consorcio/proposta-consorcio.service.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarPessoaFisica } from "@/modules/identity/pessoa.service";
import { criarOportunidade } from "@/modules/commercial/oportunidade.service";
import { criarProposta, aprovarProposta } from "@/modules/commercial/proposta.service";
import { criarOfertaAdministradora } from "./oferta.service";
import { registrarRecomendacao } from "./recomendacao.service";
import { criarPropostaConsorcio, obterCondicaoPorProposta } from "./proposta-consorcio.service";
import { criarClienteAdmin, criarUsuarioDeTeste, criarOfertaValidada } from "./test-fixtures";

let clienteGestor: SupabaseClient<Database>;
let clienteConsultor: SupabaseClient<Database>;
let clienteAmazon: SupabaseClient<Database>;

beforeAll(async () => {
  const admin = criarClienteAdmin();
  const sufixo = Date.now();
  clienteGestor = await criarUsuarioDeTeste(admin, `prop-cons-gestor-${sufixo}@teste.mcj`, "gestor_capital", "capital");
  clienteConsultor = await criarUsuarioDeTeste(admin, `prop-cons-consultor-${sufixo}@teste.mcj`, "consultor_capital", "capital");
  clienteAmazon = await criarUsuarioDeTeste(admin, `prop-cons-amazon-${sufixo}@teste.mcj`, "consultor_capital", "amazon");
});

async function criarOportunidadeConsorcio(nome: string) {
  const pessoa = await criarPessoaFisica(clienteConsultor, { nomeCompleto: nome, marcaEntradaId: 4 });
  return criarOportunidade(clienteConsultor, {
    pessoaFisicaId: pessoa.id,
    marcaId: 4,
    produto: "consorcio",
  });
}

describe("criarPropostaConsorcio", () => {
  it("cria proposta com item de cota e condição congelada, incluindo bônus de campanha vigente", async () => {
    const { administradora, plano, oferta } = await criarOfertaValidada(clienteGestor, {
      prazoMeses: 72,
      comissaoPercentual: 5,
      bonusCampanhaPercentual: 2,
    });
    const oportunidade = await criarOportunidadeConsorcio("Cliente Proposta Consorcio");

    const proposta = await criarPropostaConsorcio(clienteConsultor, {
      oportunidadeId: oportunidade.id,
      ofertaId: oferta.id,
      credito: 120000,
    });

    expect(proposta.versao).toBe(1);
    expect(proposta.itens).toHaveLength(1);
    expect(proposta.itens[0].preco_total).toBe(120000);
    expect(proposta.itens[0].descricao).toBe(
      `Cota de consórcio — ${administradora.nome} / ${plano.nome_plano}`
    );
    expect(proposta.condicao).toMatchObject({
      proposta_id: proposta.id,
      oferta_id: oferta.id,
      administradora_id: administradora.id,
      plano_id: plano.id,
      administradora_nome: administradora.nome,
      nome_plano: plano.nome_plano,
      credito: 120000,
      prazo_meses: 72,
      taxa_administracao_percentual: 18,
      comissao_percentual: 5,
      bonus_campanha_percentual: 2,
      recomendacao_id: null,
    });
  });

  it("preserva a condição da proposta aprovada mesmo depois que a oferta muda", async () => {
    const { oferta } = await criarOfertaValidada(clienteGestor, { comissaoPercentual: 5 });
    const oportunidade = await criarOportunidadeConsorcio("Cliente Condicao Preservada");
    const proposta = await criarPropostaConsorcio(clienteConsultor, {
      oportunidadeId: oportunidade.id,
      ofertaId: oferta.id,
      credito: 100000,
    });
    await aprovarProposta(clienteConsultor, proposta.id);

    const { error: erroUpdate } = await clienteGestor
      .from("oferta_administradora")
      .update({ comissao_percentual: 99 })
      .eq("id", oferta.id);
    if (erroUpdate) throw erroUpdate;

    const condicao = await obterCondicaoPorProposta(clienteConsultor, proposta.id);
    expect(condicao!.comissao_percentual).toBe(5);
  });

  it("vincula a recomendação da mesma oportunidade e recusa a de outra", async () => {
    const { oferta } = await criarOfertaValidada(clienteGestor);
    const oportunidadeA = await criarOportunidadeConsorcio("Cliente Recomendacao A");
    const oportunidadeB = await criarOportunidadeConsorcio("Cliente Recomendacao B");
    const recomendacaoA = await registrarRecomendacao(clienteConsultor, {
      oportunidadeId: oportunidadeA.id,
      creditoDesejado: 100000,
      prazoDesejadoMeses: 60,
    });

    const propostaA = await criarPropostaConsorcio(clienteConsultor, {
      oportunidadeId: oportunidadeA.id,
      ofertaId: oferta.id,
      credito: 100000,
      recomendacaoId: recomendacaoA.id,
    });
    expect(propostaA.condicao.recomendacao_id).toBe(recomendacaoA.id);

    await expect(
      criarPropostaConsorcio(clienteConsultor, {
        oportunidadeId: oportunidadeB.id,
        ofertaId: oferta.id,
        credito: 100000,
        recomendacaoId: recomendacaoA.id,
      })
    ).rejects.toThrow("A recomendação pertence a outra oportunidade");
  });

  it("recusa oferta não validada e crédito fora da faixa do plano", async () => {
    const { administradora, plano, oferta } = await criarOfertaValidada(clienteGestor);
    const ofertaColetada = await criarOfertaAdministradora(clienteGestor, {
      administradoraId: administradora.id,
      planoId: plano.id,
      comissaoPercentual: 5,
      fonte: "manual",
    });
    const oportunidade = await criarOportunidadeConsorcio("Cliente Oferta Invalida");

    await expect(
      criarPropostaConsorcio(clienteConsultor, {
        oportunidadeId: oportunidade.id,
        ofertaId: ofertaColetada.id,
        credito: 100000,
      })
    ).rejects.toThrow("Só é possível propor a partir de uma oferta validada");

    await expect(
      criarPropostaConsorcio(clienteConsultor, {
        oportunidadeId: oportunidade.id,
        ofertaId: oferta.id,
        credito: 999999999,
      })
    ).rejects.toThrow("Crédito fora da faixa do plano");
  });

  it("RLS recusa condição forjada (comissão diferente da oferta) via API direta", async () => {
    const { administradora, plano, oferta } = await criarOfertaValidada(clienteGestor, {
      comissaoPercentual: 5,
    });
    const oportunidade = await criarOportunidadeConsorcio("Cliente Condicao Forjada");
    const propostaSimples = await criarProposta(clienteConsultor, {
      oportunidadeId: oportunidade.id,
      itens: [{ descricao: "Cota", quantidade: 1, precoUnitario: 100000 }],
    });

    const { error } = await clienteConsultor.from("proposta_consorcio_condicao").insert({
      proposta_id: propostaSimples.id,
      oferta_id: oferta.id,
      administradora_id: administradora.id,
      plano_id: plano.id,
      administradora_nome: administradora.nome,
      nome_plano: plano.nome_plano,
      credito: 100000,
      prazo_meses: plano.prazo_meses,
      taxa_administracao_percentual: plano.taxa_administracao_percentual,
      comissao_percentual: 99,
      bonus_campanha_percentual: 0,
    });

    expect(error).not.toBeNull();
  });

  it("RLS isola a condição por marca", async () => {
    const { oferta } = await criarOfertaValidada(clienteGestor);
    const oportunidade = await criarOportunidadeConsorcio("Cliente Condicao Isolada");
    const proposta = await criarPropostaConsorcio(clienteConsultor, {
      oportunidadeId: oportunidade.id,
      ofertaId: oferta.id,
      credito: 100000,
    });

    expect(await obterCondicaoPorProposta(clienteAmazon, proposta.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/proposta-consorcio.service.test.ts`
Expected: FAIL — `Failed to resolve import "./proposta-consorcio.service"`.

- [ ] **Step 3: Escrever o schema**

```typescript
// src/modules/consorcio/proposta-consorcio.schema.ts
import { z } from "zod";
import { DATA_ISO_REGEX } from "./datas";

export const criarPropostaConsorcioSchema = z.object({
  oportunidadeId: z.string().uuid(),
  ofertaId: z.string().uuid(),
  credito: z.number().positive(),
  recomendacaoId: z.string().uuid().optional(),
  validade: z.string().regex(DATA_ISO_REGEX).optional(),
});

export type CriarPropostaConsorcioInput = z.infer<typeof criarPropostaConsorcioSchema>;
```

- [ ] **Step 4: Escrever o serviço**

As checagens no serviço existem para dar mensagens claras e evitar criar uma proposta órfã antes de a condição ser recusada; a garantia de verdade é o RLS da Task 1.

```typescript
// src/modules/consorcio/proposta-consorcio.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { obterOportunidade } from "@/modules/commercial/oportunidade.service";
import {
  criarProposta,
  type Proposta,
  type PropostaItem,
} from "@/modules/commercial/proposta.service";
import {
  criarPropostaConsorcioSchema,
  type CriarPropostaConsorcioInput,
} from "./proposta-consorcio.schema";
import { estaVigente, hojeIso } from "./datas";

export type PropostaConsorcioCondicao =
  Database["public"]["Tables"]["proposta_consorcio_condicao"]["Row"];

export type PropostaConsorcio = Proposta & {
  itens: PropostaItem[];
  condicao: PropostaConsorcioCondicao;
};

export async function criarPropostaConsorcio(
  client: SupabaseClient<Database>,
  input: CriarPropostaConsorcioInput
): Promise<PropostaConsorcio> {
  const dadosValidados = criarPropostaConsorcioSchema.parse(input);
  const hoje = hojeIso();

  const oportunidade = await obterOportunidade(client, dadosValidados.oportunidadeId);
  if (oportunidade.produto !== "consorcio") {
    throw new Error("A oportunidade não é de consórcio");
  }

  if (dadosValidados.recomendacaoId) {
    const { data: recomendacao, error: erroRecomendacao } = await client
      .from("recomendacao_consorcio")
      .select("oportunidade_id")
      .eq("id", dadosValidados.recomendacaoId)
      .single();
    if (erroRecomendacao) throw erroRecomendacao;
    if (recomendacao.oportunidade_id !== oportunidade.id) {
      throw new Error("A recomendação pertence a outra oportunidade");
    }
  }

  const { data: oferta, error: erroOferta } = await client
    .from("oferta_administradora")
    .select("id, administradora_id, plano_id, campanha_id, comissao_percentual, estado, vigencia_inicio, vigencia_fim")
    .eq("id", dadosValidados.ofertaId)
    .single();
  if (erroOferta) throw erroOferta;
  if (oferta.estado !== "validado") {
    throw new Error("Só é possível propor a partir de uma oferta validada");
  }
  if (!estaVigente(oferta.vigencia_inicio, oferta.vigencia_fim, hoje)) {
    throw new Error("A oferta não está vigente");
  }

  const { data: plano, error: erroPlano } = await client
    .from("plano_consorcio_administradora")
    .select("id, nome_plano, credito_min, credito_max, prazo_meses, taxa_administracao_percentual")
    .eq("id", oferta.plano_id)
    .single();
  if (erroPlano) throw erroPlano;
  if (dadosValidados.credito < plano.credito_min || dadosValidados.credito > plano.credito_max) {
    throw new Error("Crédito fora da faixa do plano");
  }

  const { data: administradora, error: erroAdm } = await client
    .from("administradora")
    .select("id, nome, situacao")
    .eq("id", oferta.administradora_id)
    .single();
  if (erroAdm) throw erroAdm;
  if (administradora.situacao !== "ativa") {
    throw new Error("A administradora não está ativa");
  }

  let bonusCampanhaPercentual = 0;
  if (oferta.campanha_id) {
    const { data: campanha, error: erroCampanha } = await client
      .from("campanha_incentivo")
      .select("bonus_percentual, vigencia_inicio, vigencia_fim")
      .eq("id", oferta.campanha_id)
      .single();
    if (erroCampanha) throw erroCampanha;
    if (estaVigente(campanha.vigencia_inicio, campanha.vigencia_fim, hoje)) {
      bonusCampanhaPercentual = campanha.bonus_percentual;
    }
  }

  const proposta = await criarProposta(client, {
    oportunidadeId: oportunidade.id,
    validade: dadosValidados.validade,
    itens: [
      {
        descricao: `Cota de consórcio — ${administradora.nome} / ${plano.nome_plano}`,
        quantidade: 1,
        precoUnitario: dadosValidados.credito,
      },
    ],
  });

  const { data: condicao, error: erroCondicao } = await client
    .from("proposta_consorcio_condicao")
    .insert({
      proposta_id: proposta.id,
      oferta_id: oferta.id,
      recomendacao_id: dadosValidados.recomendacaoId ?? null,
      administradora_id: administradora.id,
      plano_id: plano.id,
      administradora_nome: administradora.nome,
      nome_plano: plano.nome_plano,
      credito: dadosValidados.credito,
      prazo_meses: plano.prazo_meses,
      taxa_administracao_percentual: plano.taxa_administracao_percentual,
      comissao_percentual: oferta.comissao_percentual,
      bonus_campanha_percentual: bonusCampanhaPercentual,
    })
    .select()
    .single();
  if (erroCondicao) throw erroCondicao;

  return { ...proposta, condicao };
}

export async function obterCondicaoPorProposta(
  client: SupabaseClient<Database>,
  propostaId: string
): Promise<PropostaConsorcioCondicao | null> {
  const { data, error } = await client
    .from("proposta_consorcio_condicao")
    .select("*")
    .eq("proposta_id", propostaId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/proposta-consorcio.service.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 6: Suíte completa e tipos**

```bash
npm test && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/consorcio/proposta-consorcio.schema.ts src/modules/consorcio/proposta-consorcio.service.ts src/modules/consorcio/proposta-consorcio.service.test.ts
git commit -m "feat(consorcio): create consórcio proposta with frozen oferta conditions"
```

---

### Task 6: Cota de consórcio e parcelas

**Files:**
- Modify: `src/modules/commercial/contrato.service.ts` (+ `obterContrato`)
- Modify: `src/modules/consorcio/test-fixtures.ts` (+ `prepararContratoConsorcio`)
- Create: `src/modules/consorcio/cota.schema.ts`
- Create: `src/modules/consorcio/cota.service.ts`
- Test: `src/modules/consorcio/cota.service.test.ts`

**Interfaces:**
- Consumes: tabelas `cota_consorcio`, `consorcio_parcela` (Task 2); `obterCondicaoPorProposta`, `criarPropostaConsorcio`, `PropostaConsorcio` (Task 5); `adicionarMeses`, `DATA_ISO_REGEX` (Task 3); `criarContrato`, `Contrato` (commercial); `aprovarProposta` (commercial).
- Produces:
  - `obterContrato(client, contratoId: string): Promise<Contrato>` em `@/modules/commercial/contrato.service`.
  - `criarCotaConsorcio(client, input: CriarCotaConsorcioInput): Promise<CotaConsorcio & { parcelas: ConsorcioParcela[] }>` onde `CriarCotaConsorcioInput = { contratoId: string; grupo: string; numeroCota: string; valorParcela: number; dataAdesao: string /* YYYY-MM-DD */ }`. Gera `prazo_meses` parcelas; parcela `n` vence em `adicionarMeses(dataAdesao, n - 1)`.
  - `obterCota(client, cotaId): Promise<CotaConsorcio>`
  - `listarCotas(client, limite = 50): Promise<CotaConsorcio[]>` — mais recentes primeiro.
  - `listarParcelas(client, cotaId): Promise<ConsorcioParcela[]>` — ordenadas por `numero`.
  - `registrarPagamentoParcela(client, parcelaId, input: { pagoEm: string }): Promise<ConsorcioParcela>`
  - Tipos `CotaConsorcio`, `ConsorcioParcela` (Rows).
  - Mensagens: `"Só é possível registrar cota para contrato ativo"`, `"O contrato não possui condição de consórcio"`.
  - Fixture `prepararContratoConsorcio(clienteGestor, clienteConsultor, opcoes?: { credito?: number; prazoMeses?: number })` → `{ administradora, plano, oferta, proposta: PropostaConsorcio, contrato: Contrato }`.

- [ ] **Step 1: Adicionar `obterContrato` ao serviço comercial**

Acrescente ao final de `src/modules/commercial/contrato.service.ts`:

```typescript
export async function obterContrato(
  client: SupabaseClient<Database>,
  contratoId: string
): Promise<Contrato> {
  const { data, error } = await client
    .from("contrato")
    .select("*")
    .eq("id", contratoId)
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Adicionar a fixture de contrato de consórcio**

Acrescente a `src/modules/consorcio/test-fixtures.ts` (imports no topo, função no final):

```typescript
import { criarPessoaFisica } from "@/modules/identity/pessoa.service";
import { criarOportunidade } from "@/modules/commercial/oportunidade.service";
import { aprovarProposta } from "@/modules/commercial/proposta.service";
import { criarContrato, type Contrato } from "@/modules/commercial/contrato.service";
import { criarPropostaConsorcio, type PropostaConsorcio } from "./proposta-consorcio.service";
```

```typescript
export async function prepararContratoConsorcio(
  clienteGestor: SupabaseClient<Database>,
  clienteConsultor: SupabaseClient<Database>,
  opcoes: { credito?: number; prazoMeses?: number } = {}
): Promise<{
  administradora: Administradora;
  plano: PlanoConsorcio;
  oferta: OfertaAdministradora;
  proposta: PropostaConsorcio;
  contrato: Contrato;
}> {
  const { administradora, plano, oferta } = await criarOfertaValidada(clienteGestor, {
    prazoMeses: opcoes.prazoMeses ?? 12,
  });
  const pessoa = await criarPessoaFisica(clienteConsultor, {
    nomeCompleto: `Cliente Cota ${Date.now()}`,
    marcaEntradaId: 4,
  });
  const oportunidade = await criarOportunidade(clienteConsultor, {
    pessoaFisicaId: pessoa.id,
    marcaId: 4,
    produto: "consorcio",
  });
  const proposta = await criarPropostaConsorcio(clienteConsultor, {
    oportunidadeId: oportunidade.id,
    ofertaId: oferta.id,
    credito: opcoes.credito ?? 100000,
  });
  await aprovarProposta(clienteConsultor, proposta.id);
  const contrato = await criarContrato(clienteConsultor, { propostaId: proposta.id });

  return { administradora, plano, oferta, proposta, contrato };
}
```

- [ ] **Step 3: Escrever os testes que falham**

```typescript
// src/modules/consorcio/cota.service.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarPessoaFisica } from "@/modules/identity/pessoa.service";
import { criarOportunidade } from "@/modules/commercial/oportunidade.service";
import { criarProposta, aprovarProposta } from "@/modules/commercial/proposta.service";
import { criarContrato } from "@/modules/commercial/contrato.service";
import {
  criarCotaConsorcio,
  listarCotas,
  listarParcelas,
  registrarPagamentoParcela,
} from "./cota.service";
import {
  criarClienteAdmin,
  criarUsuarioDeTeste,
  prepararContratoConsorcio,
} from "./test-fixtures";

let clienteGestor: SupabaseClient<Database>;
let clienteConsultor: SupabaseClient<Database>;
let clienteAmazon: SupabaseClient<Database>;

beforeAll(async () => {
  const admin = criarClienteAdmin();
  const sufixo = Date.now();
  clienteGestor = await criarUsuarioDeTeste(admin, `cota-gestor-${sufixo}@teste.mcj`, "gestor_capital", "capital");
  clienteConsultor = await criarUsuarioDeTeste(admin, `cota-consultor-${sufixo}@teste.mcj`, "consultor_capital", "capital");
  clienteAmazon = await criarUsuarioDeTeste(admin, `cota-amazon-${sufixo}@teste.mcj`, "consultor_capital", "amazon");
});

function grupoUnico() {
  return `G-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

describe("criarCotaConsorcio", () => {
  it("cria a cota com as condições congeladas da proposta e gera o cronograma de parcelas", async () => {
    const { contrato, administradora, plano } = await prepararContratoConsorcio(
      clienteGestor,
      clienteConsultor,
      { credito: 110000, prazoMeses: 12 }
    );

    const cota = await criarCotaConsorcio(clienteConsultor, {
      contratoId: contrato.id,
      grupo: grupoUnico(),
      numeroCota: "0042",
      valorParcela: 1100,
      dataAdesao: "2031-01-31",
    });

    expect(cota).toMatchObject({
      contrato_id: contrato.id,
      marca_id: 4,
      administradora_id: administradora.id,
      plano_id: plano.id,
      credito: 110000,
      prazo_meses: 12,
      taxa_administracao_percentual: 18,
      status: "ativa",
    });
    expect(cota.parcelas).toHaveLength(12);
    expect(cota.parcelas.map((p) => p.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(cota.parcelas[0].vencimento).toBe("2031-01-31");
    expect(cota.parcelas[1].vencimento).toBe("2031-02-28");
    expect(cota.parcelas[11].vencimento).toBe("2031-12-31");
    expect(cota.parcelas.every((p) => p.valor === 1100 && p.status === "prevista")).toBe(true);

    const cotas = await listarCotas(clienteConsultor);
    expect(cotas.some((c) => c.id === cota.id)).toBe(true);
  });

  it("recusa contrato que não veio de proposta de consórcio", async () => {
    const pessoa = await criarPessoaFisica(clienteConsultor, {
      nomeCompleto: "Cliente Patrimonial Sem Cota",
      marcaEntradaId: 4,
    });
    const oportunidade = await criarOportunidade(clienteConsultor, {
      pessoaFisicaId: pessoa.id,
      marcaId: 4,
      produto: "planejamento_patrimonial",
    });
    const proposta = await criarProposta(clienteConsultor, {
      oportunidadeId: oportunidade.id,
      itens: [{ descricao: "Planejamento", quantidade: 1, precoUnitario: 5000 }],
    });
    await aprovarProposta(clienteConsultor, proposta.id);
    const contrato = await criarContrato(clienteConsultor, { propostaId: proposta.id });

    await expect(
      criarCotaConsorcio(clienteConsultor, {
        contratoId: contrato.id,
        grupo: grupoUnico(),
        numeroCota: "0001",
        valorParcela: 100,
        dataAdesao: "2031-01-10",
      })
    ).rejects.toThrow("O contrato não possui condição de consórcio");
  });

  it("RLS recusa cota com crédito diferente do congelado na proposta (API direta)", async () => {
    const { contrato, administradora, plano } = await prepararContratoConsorcio(
      clienteGestor,
      clienteConsultor,
      { credito: 100000 }
    );

    const { error } = await clienteConsultor.from("cota_consorcio").insert({
      contrato_id: contrato.id,
      marca_id: 4,
      administradora_id: administradora.id,
      plano_id: plano.id,
      grupo: grupoUnico(),
      numero_cota: "0001",
      credito: 150000,
      prazo_meses: plano.prazo_meses,
      taxa_administracao_percentual: plano.taxa_administracao_percentual,
      valor_parcela: 1000,
      data_adesao: "2031-01-10",
    });

    expect(error).not.toBeNull();
  });

  it("RLS impede outra marca de criar cota no contrato", async () => {
    const { contrato } = await prepararContratoConsorcio(clienteGestor, clienteConsultor);

    await expect(
      criarCotaConsorcio(clienteAmazon, {
        contratoId: contrato.id,
        grupo: grupoUnico(),
        numeroCota: "0001",
        valorParcela: 1000,
        dataAdesao: "2031-01-10",
      })
    ).rejects.toThrow();
  });

  it("grant de coluna impede editar as condições da cota via UPDATE", async () => {
    const { contrato } = await prepararContratoConsorcio(clienteGestor, clienteConsultor);
    const cota = await criarCotaConsorcio(clienteConsultor, {
      contratoId: contrato.id,
      grupo: grupoUnico(),
      numeroCota: "0001",
      valorParcela: 1000,
      dataAdesao: "2031-01-10",
    });

    const { error } = await clienteConsultor
      .from("cota_consorcio")
      .update({ credito: 1 })
      .eq("id", cota.id);

    expect(error).not.toBeNull();
  });
});

describe("registrarPagamentoParcela", () => {
  it("marca a parcela como paga com a data de pagamento", async () => {
    const { contrato } = await prepararContratoConsorcio(clienteGestor, clienteConsultor);
    const cota = await criarCotaConsorcio(clienteConsultor, {
      contratoId: contrato.id,
      grupo: grupoUnico(),
      numeroCota: "0001",
      valorParcela: 1000,
      dataAdesao: "2031-01-10",
    });

    const paga = await registrarPagamentoParcela(clienteConsultor, cota.parcelas[0].id, {
      pagoEm: "2031-01-09",
    });
    expect(paga.status).toBe("paga");
    expect(paga.pago_em).toBe("2031-01-09");

    const parcelas = await listarParcelas(clienteConsultor, cota.id);
    expect(parcelas[0].status).toBe("paga");
    expect(parcelas[1].status).toBe("prevista");
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/cota.service.test.ts`
Expected: FAIL — `Failed to resolve import "./cota.service"`.

- [ ] **Step 5: Escrever o schema**

```typescript
// src/modules/consorcio/cota.schema.ts
import { z } from "zod";
import { DATA_ISO_REGEX } from "./datas";

export const criarCotaConsorcioSchema = z.object({
  contratoId: z.string().uuid(),
  grupo: z.string().min(1),
  numeroCota: z.string().min(1),
  valorParcela: z.number().positive(),
  dataAdesao: z.string().regex(DATA_ISO_REGEX),
});

export type CriarCotaConsorcioInput = z.infer<typeof criarCotaConsorcioSchema>;

export const registrarPagamentoParcelaSchema = z.object({
  pagoEm: z.string().regex(DATA_ISO_REGEX),
});

export type RegistrarPagamentoParcelaInput = z.infer<typeof registrarPagamentoParcelaSchema>;
```

- [ ] **Step 6: Escrever o serviço**

```typescript
// src/modules/consorcio/cota.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { obterContrato } from "@/modules/commercial/contrato.service";
import {
  criarCotaConsorcioSchema,
  registrarPagamentoParcelaSchema,
  type CriarCotaConsorcioInput,
  type RegistrarPagamentoParcelaInput,
} from "./cota.schema";
import { obterCondicaoPorProposta } from "./proposta-consorcio.service";
import { adicionarMeses } from "./datas";

export type CotaConsorcio = Database["public"]["Tables"]["cota_consorcio"]["Row"];
export type ConsorcioParcela = Database["public"]["Tables"]["consorcio_parcela"]["Row"];

export async function criarCotaConsorcio(
  client: SupabaseClient<Database>,
  input: CriarCotaConsorcioInput
): Promise<CotaConsorcio & { parcelas: ConsorcioParcela[] }> {
  const dadosValidados = criarCotaConsorcioSchema.parse(input);

  const contrato = await obterContrato(client, dadosValidados.contratoId);
  if (contrato.status !== "ativo") {
    throw new Error("Só é possível registrar cota para contrato ativo");
  }

  const condicao = await obterCondicaoPorProposta(client, contrato.proposta_id);
  if (!condicao) {
    throw new Error("O contrato não possui condição de consórcio");
  }

  const { data: cota, error: erroCota } = await client
    .from("cota_consorcio")
    .insert({
      contrato_id: contrato.id,
      marca_id: contrato.marca_id,
      administradora_id: condicao.administradora_id,
      plano_id: condicao.plano_id,
      grupo: dadosValidados.grupo,
      numero_cota: dadosValidados.numeroCota,
      credito: condicao.credito,
      prazo_meses: condicao.prazo_meses,
      taxa_administracao_percentual: condicao.taxa_administracao_percentual,
      valor_parcela: dadosValidados.valorParcela,
      data_adesao: dadosValidados.dataAdesao,
    })
    .select()
    .single();
  if (erroCota) throw erroCota;

  const { data: parcelas, error: erroParcelas } = await client
    .from("consorcio_parcela")
    .insert(
      Array.from({ length: cota.prazo_meses }, (_, indice) => ({
        cota_id: cota.id,
        numero: indice + 1,
        vencimento: adicionarMeses(dadosValidados.dataAdesao, indice),
        valor: dadosValidados.valorParcela,
      }))
    )
    .select();
  if (erroParcelas) throw erroParcelas;

  return { ...cota, parcelas: parcelas.sort((a, b) => a.numero - b.numero) };
}

export async function obterCota(
  client: SupabaseClient<Database>,
  cotaId: string
): Promise<CotaConsorcio> {
  const { data, error } = await client
    .from("cota_consorcio")
    .select("*")
    .eq("id", cotaId)
    .single();

  if (error) throw error;
  return data;
}

export async function listarCotas(
  client: SupabaseClient<Database>,
  limite = 50
): Promise<CotaConsorcio[]> {
  const { data, error } = await client
    .from("cota_consorcio")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(limite);

  if (error) throw error;
  return data;
}

export async function listarParcelas(
  client: SupabaseClient<Database>,
  cotaId: string
): Promise<ConsorcioParcela[]> {
  const { data, error } = await client
    .from("consorcio_parcela")
    .select("*")
    .eq("cota_id", cotaId)
    .order("numero");

  if (error) throw error;
  return data;
}

export async function registrarPagamentoParcela(
  client: SupabaseClient<Database>,
  parcelaId: string,
  input: RegistrarPagamentoParcelaInput
): Promise<ConsorcioParcela> {
  const dadosValidados = registrarPagamentoParcelaSchema.parse(input);

  const { data, error } = await client
    .from("consorcio_parcela")
    .update({ status: "paga", pago_em: dadosValidados.pagoEm })
    .eq("id", parcelaId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/cota.service.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 8: Suíte completa e tipos**

```bash
npm test && npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add src/modules/commercial/contrato.service.ts src/modules/consorcio/test-fixtures.ts src/modules/consorcio/cota.schema.ts src/modules/consorcio/cota.service.ts src/modules/consorcio/cota.service.test.ts
git commit -m "feat(consorcio): create cota from signed contrato with monthly parcela schedule"
```

---

### Task 7: Lances e contemplação

**Files:**
- Create: `src/modules/consorcio/lance.schema.ts`
- Create: `src/modules/consorcio/lance.service.ts`
- Test: `src/modules/consorcio/lance.service.test.ts`

**Interfaces:**
- Consumes: tabelas `consorcio_lance`, `consorcio_contemplacao` e trigger `aplicar_contemplacao` (Task 2); `criarCotaConsorcio`, `obterCota` (Task 6); `prepararContratoConsorcio` (Task 6); `DATA_ISO_REGEX` (Task 3).
- Produces:
  - `registrarLance(client, input: { cotaId: string; tipo: "livre" | "fixo" | "embutido"; valor: number; assembleiaData: string }): Promise<ConsorcioLance>`
  - `atualizarStatusLance(client, lanceId: string, input: { status: "ofertado" | "perdedor" }): Promise<ConsorcioLance>` — `vencedor` só via contemplação.
  - `registrarContemplacao(client, input: { cotaId: string; data: string; modalidade: "sorteio" | "lance"; lanceId?: string; creditoLiberado: number }): Promise<ConsorcioContemplacao>`
  - Tipos `ConsorcioLance`, `ConsorcioContemplacao`.
  - Mensagens: `"Só é possível contemplar uma cota ativa"`, `"Contemplação por lance exige lanceId; por sorteio, não"`.

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// src/modules/consorcio/lance.service.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarCotaConsorcio, obterCota } from "./cota.service";
import { registrarLance, atualizarStatusLance, registrarContemplacao } from "./lance.service";
import {
  criarClienteAdmin,
  criarUsuarioDeTeste,
  prepararContratoConsorcio,
} from "./test-fixtures";

let clienteGestor: SupabaseClient<Database>;
let clienteConsultor: SupabaseClient<Database>;
let clienteAmazon: SupabaseClient<Database>;

beforeAll(async () => {
  const admin = criarClienteAdmin();
  const sufixo = Date.now();
  clienteGestor = await criarUsuarioDeTeste(admin, `lance-gestor-${sufixo}@teste.mcj`, "gestor_capital", "capital");
  clienteConsultor = await criarUsuarioDeTeste(admin, `lance-consultor-${sufixo}@teste.mcj`, "consultor_capital", "capital");
  clienteAmazon = await criarUsuarioDeTeste(admin, `lance-amazon-${sufixo}@teste.mcj`, "consultor_capital", "amazon");
});

async function criarCotaAtiva() {
  const { contrato } = await prepararContratoConsorcio(clienteGestor, clienteConsultor);
  return criarCotaConsorcio(clienteConsultor, {
    contratoId: contrato.id,
    grupo: `G-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    numeroCota: "0001",
    valorParcela: 1000,
    dataAdesao: "2031-01-10",
  });
}

describe("lances e contemplação", () => {
  it("contemplação por lance marca a cota como contemplada e o lance como vencedor", async () => {
    const cota = await criarCotaAtiva();
    const lance = await registrarLance(clienteConsultor, {
      cotaId: cota.id,
      tipo: "livre",
      valor: 30000,
      assembleiaData: "2031-03-15",
    });
    expect(lance.status).toBe("planejado");

    const ofertado = await atualizarStatusLance(clienteConsultor, lance.id, { status: "ofertado" });
    expect(ofertado.status).toBe("ofertado");

    const contemplacao = await registrarContemplacao(clienteConsultor, {
      cotaId: cota.id,
      data: "2031-03-15",
      modalidade: "lance",
      lanceId: lance.id,
      creditoLiberado: 100000,
    });
    expect(contemplacao.lance_id).toBe(lance.id);

    expect((await obterCota(clienteConsultor, cota.id)).status).toBe("contemplada");
    const { data: lanceRelido, error } = await clienteConsultor
      .from("consorcio_lance")
      .select("status")
      .eq("id", lance.id)
      .single();
    if (error) throw error;
    expect(lanceRelido.status).toBe("vencedor");
  });

  it("contemplação por sorteio; segunda contemplação e novo lance são recusados", async () => {
    const cota = await criarCotaAtiva();

    await registrarContemplacao(clienteConsultor, {
      cotaId: cota.id,
      data: "2031-02-15",
      modalidade: "sorteio",
      creditoLiberado: 100000,
    });
    expect((await obterCota(clienteConsultor, cota.id)).status).toBe("contemplada");

    await expect(
      registrarContemplacao(clienteConsultor, {
        cotaId: cota.id,
        data: "2031-03-15",
        modalidade: "sorteio",
        creditoLiberado: 100000,
      })
    ).rejects.toThrow("Só é possível contemplar uma cota ativa");

    await expect(
      registrarLance(clienteConsultor, {
        cotaId: cota.id,
        tipo: "fixo",
        valor: 10000,
        assembleiaData: "2031-04-15",
      })
    ).rejects.toThrow();
  });

  it("valida a coerência entre modalidade e lanceId", async () => {
    const cota = await criarCotaAtiva();

    await expect(
      registrarContemplacao(clienteConsultor, {
        cotaId: cota.id,
        data: "2031-03-15",
        modalidade: "lance",
        creditoLiberado: 100000,
      })
    ).rejects.toThrow("Contemplação por lance exige lanceId; por sorteio, não");
  });

  it("RLS recusa contemplação com lance de outra cota (API direta)", async () => {
    const cotaA = await criarCotaAtiva();
    const cotaB = await criarCotaAtiva();
    const lanceDaB = await registrarLance(clienteConsultor, {
      cotaId: cotaB.id,
      tipo: "livre",
      valor: 20000,
      assembleiaData: "2031-03-15",
    });

    const { error } = await clienteConsultor.from("consorcio_contemplacao").insert({
      cota_id: cotaA.id,
      data: "2031-03-15",
      modalidade: "lance",
      lance_id: lanceDaB.id,
      credito_liberado: 100000,
    });

    expect(error).not.toBeNull();
    expect((await obterCota(clienteConsultor, cotaA.id)).status).toBe("ativa");
  });

  it("RLS recusa marcar lance como vencedor sem contemplação", async () => {
    const cota = await criarCotaAtiva();
    const lance = await registrarLance(clienteConsultor, {
      cotaId: cota.id,
      tipo: "embutido",
      valor: 15000,
      assembleiaData: "2031-03-15",
    });

    const { error } = await clienteConsultor
      .from("consorcio_lance")
      .update({ status: "vencedor" })
      .eq("id", lance.id);

    expect(error).not.toBeNull();
  });

  it("RLS impede outra marca de registrar lance na cota", async () => {
    const cota = await criarCotaAtiva();

    await expect(
      registrarLance(clienteAmazon, {
        cotaId: cota.id,
        tipo: "livre",
        valor: 10000,
        assembleiaData: "2031-03-15",
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/lance.service.test.ts`
Expected: FAIL — `Failed to resolve import "./lance.service"`.

- [ ] **Step 3: Escrever o schema**

```typescript
// src/modules/consorcio/lance.schema.ts
import { z } from "zod";
import { DATA_ISO_REGEX } from "./datas";

export const registrarLanceSchema = z.object({
  cotaId: z.string().uuid(),
  tipo: z.enum(["livre", "fixo", "embutido"]),
  valor: z.number().positive(),
  assembleiaData: z.string().regex(DATA_ISO_REGEX),
});

export type RegistrarLanceInput = z.infer<typeof registrarLanceSchema>;

// 'vencedor' fica de fora de propósito: só a contemplação produz essa transição.
export const atualizarStatusLanceSchema = z.object({
  status: z.enum(["ofertado", "perdedor"]),
});

export type AtualizarStatusLanceInput = z.infer<typeof atualizarStatusLanceSchema>;

export const registrarContemplacaoSchema = z
  .object({
    cotaId: z.string().uuid(),
    data: z.string().regex(DATA_ISO_REGEX),
    modalidade: z.enum(["sorteio", "lance"]),
    lanceId: z.string().uuid().optional(),
    creditoLiberado: z.number().positive(),
  })
  .refine((dados) => (dados.modalidade === "lance") === (dados.lanceId != null), {
    message: "Contemplação por lance exige lanceId; por sorteio, não",
  });

export type RegistrarContemplacaoInput = z.infer<typeof registrarContemplacaoSchema>;
```

- [ ] **Step 4: Escrever o serviço**

```typescript
// src/modules/consorcio/lance.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  registrarLanceSchema,
  atualizarStatusLanceSchema,
  registrarContemplacaoSchema,
  type RegistrarLanceInput,
  type AtualizarStatusLanceInput,
  type RegistrarContemplacaoInput,
} from "./lance.schema";
import { obterCota } from "./cota.service";

export type ConsorcioLance = Database["public"]["Tables"]["consorcio_lance"]["Row"];
export type ConsorcioContemplacao = Database["public"]["Tables"]["consorcio_contemplacao"]["Row"];

export async function registrarLance(
  client: SupabaseClient<Database>,
  input: RegistrarLanceInput
): Promise<ConsorcioLance> {
  const dadosValidados = registrarLanceSchema.parse(input);

  const { data, error } = await client
    .from("consorcio_lance")
    .insert({
      cota_id: dadosValidados.cotaId,
      tipo: dadosValidados.tipo,
      valor: dadosValidados.valor,
      assembleia_data: dadosValidados.assembleiaData,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function atualizarStatusLance(
  client: SupabaseClient<Database>,
  lanceId: string,
  input: AtualizarStatusLanceInput
): Promise<ConsorcioLance> {
  const dadosValidados = atualizarStatusLanceSchema.parse(input);

  const { data, error } = await client
    .from("consorcio_lance")
    .update({ status: dadosValidados.status })
    .eq("id", lanceId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// A mudança da cota para 'contemplada' e do lance para 'vencedor' é feita
// pelo trigger aplicar_contemplacao, na mesma transação do INSERT.
export async function registrarContemplacao(
  client: SupabaseClient<Database>,
  input: RegistrarContemplacaoInput
): Promise<ConsorcioContemplacao> {
  const dadosValidados = registrarContemplacaoSchema.parse(input);

  const cota = await obterCota(client, dadosValidados.cotaId);
  if (cota.status !== "ativa") {
    throw new Error("Só é possível contemplar uma cota ativa");
  }

  const { data, error } = await client
    .from("consorcio_contemplacao")
    .insert({
      cota_id: dadosValidados.cotaId,
      data: dadosValidados.data,
      modalidade: dadosValidados.modalidade,
      lance_id: dadosValidados.lanceId ?? null,
      credito_liberado: dadosValidados.creditoLiberado,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/lance.service.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 6: Suíte completa e tipos**

```bash
npm test && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/consorcio/lance.schema.ts src/modules/consorcio/lance.service.ts src/modules/consorcio/lance.service.test.ts
git commit -m "feat(consorcio): add lances and contemplação with trigger-applied cota status"
```

---

### Task 8: UI mínima — /consorcio

**Files:**
- Create: `src/app/consorcio/actions.ts`
- Create: `src/app/consorcio/page.tsx`

**Interfaces:**
- Consumes: `registrarRecomendacao`, `listarRecomendacoes` (Task 4); `criarPropostaConsorcio` (Task 5); `criarCotaConsorcio`, `listarCotas` (Task 6); `registrarLance`, `registrarContemplacao` (Task 7); `createServerSupabaseClient()` (fundação).
- Produces: página `/consorcio` com formulários para registrar recomendação, criar proposta de consórcio, criar cota, registrar lance e registrar contemplação; lista das recomendações recentes (top 3 de cada) e das cotas.

Nenhuma API nova do Next.js é usada: é o mesmo padrão (Server Component assíncrono + `"use server"` actions recebendo `FormData` + `revalidatePath`) de `src/app/oportunidades` e `src/app/administradoras`, já validado nesta versão do Next. Se precisar de algo além disso, consulte `node_modules/next/dist/docs/01-app/` antes.

- [ ] **Step 1: Criar as server actions**

```typescript
// src/app/consorcio/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { registrarRecomendacao } from "@/modules/consorcio/recomendacao.service";
import { criarPropostaConsorcio } from "@/modules/consorcio/proposta-consorcio.service";
import { criarCotaConsorcio } from "@/modules/consorcio/cota.service";
import { registrarLance, registrarContemplacao } from "@/modules/consorcio/lance.service";

function textoOpcional(formData: FormData, campo: string): string | undefined {
  const valor = formData.get(campo);
  return valor ? String(valor) : undefined;
}

export async function registrarRecomendacaoAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  await registrarRecomendacao(client, {
    oportunidadeId: String(formData.get("oportunidadeId")),
    creditoDesejado: Number(formData.get("creditoDesejado")),
    prazoDesejadoMeses: Number(formData.get("prazoDesejadoMeses")),
  });

  revalidatePath("/consorcio");
}

export async function criarPropostaConsorcioAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  await criarPropostaConsorcio(client, {
    oportunidadeId: String(formData.get("oportunidadeId")),
    ofertaId: String(formData.get("ofertaId")),
    credito: Number(formData.get("credito")),
    recomendacaoId: textoOpcional(formData, "recomendacaoId"),
  });

  revalidatePath("/consorcio");
}

export async function criarCotaConsorcioAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  await criarCotaConsorcio(client, {
    contratoId: String(formData.get("contratoId")),
    grupo: String(formData.get("grupo")),
    numeroCota: String(formData.get("numeroCota")),
    valorParcela: Number(formData.get("valorParcela")),
    dataAdesao: String(formData.get("dataAdesao")),
  });

  revalidatePath("/consorcio");
}

export async function registrarLanceAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  await registrarLance(client, {
    cotaId: String(formData.get("cotaId")),
    tipo: String(formData.get("tipo")) as "livre" | "fixo" | "embutido",
    valor: Number(formData.get("valor")),
    assembleiaData: String(formData.get("assembleiaData")),
  });

  revalidatePath("/consorcio");
}

export async function registrarContemplacaoAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  await registrarContemplacao(client, {
    cotaId: String(formData.get("cotaId")),
    data: String(formData.get("data")),
    modalidade: String(formData.get("modalidade")) as "sorteio" | "lance",
    lanceId: textoOpcional(formData, "lanceId"),
    creditoLiberado: Number(formData.get("creditoLiberado")),
  });

  revalidatePath("/consorcio");
}
```

- [ ] **Step 2: Criar a página**

```tsx
// src/app/consorcio/page.tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listarRecomendacoes } from "@/modules/consorcio/recomendacao.service";
import { listarCotas } from "@/modules/consorcio/cota.service";
import {
  registrarRecomendacaoAction,
  criarPropostaConsorcioAction,
  criarCotaConsorcioAction,
  registrarLanceAction,
  registrarContemplacaoAction,
} from "./actions";

export default async function ConsorcioPage() {
  const client = await createServerSupabaseClient();
  const [recomendacoes, cotas] = await Promise.all([
    listarRecomendacoes(client),
    listarCotas(client),
  ]);

  return (
    <main>
      <h1>Consórcio</h1>

      <h2>Recomendar administradoras</h2>
      <form action={registrarRecomendacaoAction}>
        <input name="oportunidadeId" placeholder="ID da oportunidade" required />
        <input name="creditoDesejado" type="number" step="0.01" placeholder="Crédito desejado" required />
        <input name="prazoDesejadoMeses" type="number" placeholder="Prazo desejado (meses)" required />
        <button type="submit">Recomendar</button>
      </form>

      <ul>
        {recomendacoes.map((recomendacao) => (
          <li key={recomendacao.id}>
            {recomendacao.id} — oportunidade {recomendacao.oportunidade_id} — crédito{" "}
            {recomendacao.credito_desejado} / {recomendacao.prazo_desejado_meses} meses — pesos{" "}
            {recomendacao.peso_adequacao}/{recomendacao.peso_resultado_comercial}
            <ol>
              {recomendacao.resultado.slice(0, 3).map((item) => (
                <li key={item.ofertaId}>
                  {item.administradoraNome} — oferta {item.ofertaId} — score {item.scoreFinal.toFixed(3)}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>

      <h2>Criar proposta de consórcio</h2>
      <form action={criarPropostaConsorcioAction}>
        <input name="oportunidadeId" placeholder="ID da oportunidade" required />
        <input name="ofertaId" placeholder="ID da oferta" required />
        <input name="credito" type="number" step="0.01" placeholder="Crédito" required />
        <input name="recomendacaoId" placeholder="ID da recomendação (opcional)" />
        <button type="submit">Criar proposta</button>
      </form>

      <h2>Registrar cota</h2>
      <form action={criarCotaConsorcioAction}>
        <input name="contratoId" placeholder="ID do contrato" required />
        <input name="grupo" placeholder="Grupo" required />
        <input name="numeroCota" placeholder="Número da cota" required />
        <input name="valorParcela" type="number" step="0.01" placeholder="Valor da parcela" required />
        <input name="dataAdesao" type="date" required />
        <button type="submit">Registrar cota</button>
      </form>

      <h2>Registrar lance</h2>
      <form action={registrarLanceAction}>
        <input name="cotaId" placeholder="ID da cota" required />
        <select name="tipo" required>
          <option value="livre">Livre</option>
          <option value="fixo">Fixo</option>
          <option value="embutido">Embutido</option>
        </select>
        <input name="valor" type="number" step="0.01" placeholder="Valor" required />
        <input name="assembleiaData" type="date" required />
        <button type="submit">Registrar lance</button>
      </form>

      <h2>Registrar contemplação</h2>
      <form action={registrarContemplacaoAction}>
        <input name="cotaId" placeholder="ID da cota" required />
        <input name="data" type="date" required />
        <select name="modalidade" required>
          <option value="sorteio">Sorteio</option>
          <option value="lance">Lance</option>
        </select>
        <input name="lanceId" placeholder="ID do lance (se por lance)" />
        <input name="creditoLiberado" type="number" step="0.01" placeholder="Crédito liberado" required />
        <button type="submit">Registrar contemplação</button>
      </form>

      <h2>Cotas</h2>
      <ul>
        {cotas.map((cota) => (
          <li key={cota.id}>
            {cota.id} — grupo {cota.grupo} / cota {cota.numero_cota} — crédito {cota.credito} —{" "}
            {cota.prazo_meses} meses — {cota.status}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Validar manualmente**

```bash
npm run dev
```

Acesse `http://localhost:3000/consorcio` — sem sessão autenticada, as listas vêm vazias e os formulários falham por RLS (mesmo comportamento de `/pessoas`, `/oportunidades`, `/administradoras`). A página deve renderizar sem erro de servidor. Pare o servidor.

- [ ] **Step 4: Suíte completa, tipos e lint**

```bash
npm test
npx tsc --noEmit
npm run lint
```

Expected: todos os testes passam (fundação + comercial-core + motor + este plano); `tsc` e `lint` limpos.

- [ ] **Step 5: Commit**

```bash
git add src/app/consorcio
git commit -m "feat(consorcio): add minimal UI for recommendation, consórcio proposta, cota, lance and contemplação"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| 4.2 `cota_consorcio` (administradora, plano, grupo, crédito, prazo, parcela, taxa, status ativa/contemplada/cancelada) | 2, 6 |
| 4.2 `consorcio_parcela` (histórico de pagamentos) | 2, 6 |
| 4.2 `consorcio_lance` | 2, 7 |
| 4.2 `consorcio_contemplacao` | 2, 7 |
| 6.1 oportunidade → Motor → proposta → aprovação → contrato → cota (parcelas, lance, contemplação) | 4, 5, 6, 7, 8 |
| 7.2 fotografia da decisão (dados, versão da oferta, pesos, resultado) | 1, 4 |
| 10 "Proposta aprovada preserva a versão exata mesmo se a oferta mudar" | 1, 5 (teste explícito) |
| 10 "RLS bloqueia acesso fora do escopo mesmo via API direta" | testes de RLS em 4, 5, 6, 7 |
| 5 auditoria via triggers em tabelas sensíveis | 1, 2 (`registrar_auditoria` em todas as 6 tabelas) |
| 6.1 financeiro (parcela cliente→administradora como obrigação, comissão MCJ) e comissionamento interno | **fora — próximo plano** (declarado no topo) |
