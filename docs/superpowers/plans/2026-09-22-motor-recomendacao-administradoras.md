# Motor de Monitoramento e Recomendação de Administradoras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the administradora/oferta data model with a coletado→validado state machine, an AI-assisted extraction path from pasted bulletin text, and a deterministic 50% adequação + 50% resultado comercial recommendation engine — laying the groundwork the upcoming Fluxo Consórcio plan will call into.

**Architecture:** A new `src/modules/consorcio` module. Unlike the identity/commercial modules, `administradora`/`oferta_administradora` are **Group-level, not marca-scoped** (spec 3.5.4: parceiros belong to the Group, not a single marca) — RLS here is "read for any authenticated internal user, write/validate restricted to papel `admin`/`gestor_capital`" instead of `tem_acesso_marca()`. AI extraction is isolated behind an injectable `ExtratorBoletim` function type so the orchestration logic is testable without calling the real Claude API; the recommendation engine itself is pure deterministic TypeScript (the IA orchestrates/explains per spec, it never decides the ranking).

**Tech Stack:** Same as prior plans (Next.js, TypeScript, Supabase, Zod, Vitest) plus `@anthropic-ai/sdk` for the real bulletin-extraction call.

**Spec:** `/Users/MJallas/CRM/docs/superpowers/specs/2026-09-22-piloto-mcj-capital-design.md`

## Global Constraints

- RLS habilitado na mesma migração que cria a tabela, com todas as políticas (select/insert/update) que este plano usa — nenhuma deferida para depois.
- `administradora`, `plano_consorcio_administradora`, `campanha_incentivo`, `oferta_administradora`, `politica_recomendacao_consorcio` são recursos do Grupo — RLS de leitura liberada a qualquer autenticado, escrita/validação restrita a `public.jwt_papel() in ('admin', 'gestor_capital')` — não usar `tem_acesso_marca()` nessas tabelas.
- Nenhuma credencial/chave em texto no código-fonte — `ANTHROPIC_API_KEY` via `.env.local`, nunca commitada.
- TypeScript em modo `strict`.
- Migrações do Supabase em `supabase/migrations/`, nunca editadas retroativamente.
- Ações de negócio relevantes passam por validação Zod antes de tocar o banco.
- A ponderação 50/50 nunca fica fixa em código — vem de `politica_recomendacao_consorcio` (tabela versionada, com `vigente`).
- Uma oferta nunca pode ser inserida já com `estado = 'validado'` — só chega a esse estado via `validarOferta`, restrito a `admin`/`gestor_capital`.
- A extração por IA nunca grava direto no banco — sempre retorna os dados extraídos para revisão antes de qualquer `criarOfertaAdministradora`.

---

### Task 1: Migração — administradora e plano_consorcio_administradora

**Files:**
- Create: `supabase/migrations/20260922000011_administradora_plano.sql`

**Interfaces:**
- Consumes: `public.registrar_auditoria()` (fundação).
- Produces: tabelas `administradora`, `plano_consorcio_administradora`, ambas com RLS habilitado (select liberado a autenticados; insert/update restrito a `admin`/`gestor_capital`).

- [ ] **Step 1: Escrever a migração**

```sql
-- supabase/migrations/20260922000011_administradora_plano.sql

create table administradora (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text unique,
  situacao text not null default 'ativa' check (situacao in ('ativa', 'inativa')),
  criado_em timestamptz not null default now()
);

alter table administradora enable row level security;

create policy "select_administradora_autenticado"
on administradora for select
to authenticated
using (true);

create policy "insert_administradora_gestor"
on administradora for insert
to authenticated
with check (public.jwt_papel() in ('admin', 'gestor_capital'));

create policy "update_administradora_gestor"
on administradora for update
to authenticated
using (public.jwt_papel() in ('admin', 'gestor_capital'))
with check (public.jwt_papel() in ('admin', 'gestor_capital'));

create trigger administradora_auditoria
after insert or update or delete on administradora
for each row execute function public.registrar_auditoria();

create table plano_consorcio_administradora (
  id uuid primary key default gen_random_uuid(),
  administradora_id uuid not null references administradora(id),
  nome_plano text not null,
  credito_min numeric not null,
  credito_max numeric not null,
  prazo_meses integer not null,
  taxa_administracao_percentual numeric not null,
  criado_em timestamptz not null default now(),
  constraint plano_credito_check check (credito_max >= credito_min)
);

alter table plano_consorcio_administradora enable row level security;
create index idx_plano_administradora_id on plano_consorcio_administradora (administradora_id);

create policy "select_plano_autenticado"
on plano_consorcio_administradora for select
to authenticated
using (true);

create policy "insert_plano_gestor"
on plano_consorcio_administradora for insert
to authenticated
with check (public.jwt_papel() in ('admin', 'gestor_capital'));

create policy "update_plano_gestor"
on plano_consorcio_administradora for update
to authenticated
using (public.jwt_papel() in ('admin', 'gestor_capital'))
with check (public.jwt_papel() in ('admin', 'gestor_capital'));

create trigger plano_consorcio_administradora_auditoria
after insert or update or delete on plano_consorcio_administradora
for each row execute function public.registrar_auditoria();
```

- [ ] **Step 2: Aplicar e verificar**

```bash
export PATH="/Users/MJallas/.docker/bin:$PATH" && npx supabase db reset
```

Expected: sem erros. Confirme no Studio (`http://127.0.0.1:54323`) que ambas as tabelas existem, com RLS habilitado e as políticas corretas.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260922000011_administradora_plano.sql
git commit -m "feat(db): add administradora and plano_consorcio_administradora tables"
```

---

### Task 2: Migração — campanha_incentivo, oferta_administradora e politica_recomendacao_consorcio

**Files:**
- Create: `supabase/migrations/20260922000012_oferta_campanha_politica.sql`

**Interfaces:**
- Consumes: `administradora`, `plano_consorcio_administradora` (Task 1); `usuario_interno` (fundação); `public.registrar_auditoria()` (fundação).
- Produces: tabelas `campanha_incentivo`, `oferta_administradora` (com estado `coletado`→`pendente_validacao`→`validado`→`vencido`), `politica_recomendacao_consorcio` (seed com peso 50/50 vigente).

- [ ] **Step 1: Escrever a migração**

```sql
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
```

- [ ] **Step 2: Aplicar e verificar**

```bash
export PATH="/Users/MJallas/.docker/bin:$PATH" && npx supabase db reset
```

Expected: sem erros. Confirme as 3 tabelas no Studio, RLS habilitado, e que `politica_recomendacao_consorcio` tem exatamente 1 linha com `peso_adequacao = 0.5`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260922000012_oferta_campanha_politica.sql
git commit -m "feat(db): add campanha_incentivo, oferta_administradora and politica_recomendacao_consorcio"
```

---

### Task 3: Serviço de administradora e plano de consórcio

**Files:**
- Create: `src/modules/consorcio/administradora.schema.ts`, `src/modules/consorcio/administradora.service.ts`
- Test: `src/modules/consorcio/administradora.service.test.ts`

**Interfaces:**
- Consumes: tabelas `administradora`, `plano_consorcio_administradora` (Task 1), `campanha_incentivo` (Task 2); `SupabaseClient<Database>` (fundação).
- Produces: `criarAdministradoraSchema`, `criarPlanoConsorcioSchema`, `criarCampanhaIncentivoSchema` (Zod); `criarAdministradora(client, input): Promise<Administradora>`; `listarAdministradoras(client): Promise<Administradora[]>`; `criarPlanoConsorcio(client, input): Promise<PlanoConsorcio>`; `listarPlanosPorAdministradora(client, administradoraId): Promise<PlanoConsorcio[]>`; `criarCampanhaIncentivo(client, input): Promise<CampanhaIncentivo>`; tipos `Administradora`, `PlanoConsorcio`, `CampanhaIncentivo`.

Nota: esta task também cria `campanha_incentivo`, que só existe como tabela a partir da Task 2 — sem um serviço para popular essa tabela, o motor de recomendação da Task 6 nunca teria uma campanha real para aplicar o bônus.

- [ ] **Step 1: Escrever os schemas de validação**

```typescript
// src/modules/consorcio/administradora.schema.ts
import { z } from "zod";

export const criarAdministradoraSchema = z.object({
  nome: z.string().min(1),
  cnpj: z.string().optional(),
});

export type CriarAdministradoraInput = z.infer<typeof criarAdministradoraSchema>;

export const criarPlanoConsorcioSchema = z
  .object({
    administradoraId: z.string().uuid(),
    nomePlano: z.string().min(1),
    creditoMin: z.number().positive(),
    creditoMax: z.number().positive(),
    prazoMeses: z.number().int().positive(),
    taxaAdministracaoPercentual: z.number().nonnegative(),
  })
  .refine((data) => data.creditoMax >= data.creditoMin, {
    message: "creditoMax deve ser maior ou igual a creditoMin",
  });

export type CriarPlanoConsorcioInput = z.infer<typeof criarPlanoConsorcioSchema>;

export const criarCampanhaIncentivoSchema = z.object({
  administradoraId: z.string().uuid(),
  nome: z.string().min(1),
  bonusPercentual: z.number().nonnegative(),
  vigenciaInicio: z.string(),
  vigenciaFim: z.string().optional(),
});

export type CriarCampanhaIncentivoInput = z.infer<typeof criarCampanhaIncentivoSchema>;
```

- [ ] **Step 2: Escrever o teste que falha primeiro**

```typescript
// src/modules/consorcio/administradora.service.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  criarAdministradora,
  listarAdministradoras,
  criarPlanoConsorcio,
  listarPlanosPorAdministradora,
  criarCampanhaIncentivo,
} from "./administradora.service";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient<Database>;
let clienteGestor: SupabaseClient<Database>;
let clienteConsultor: SupabaseClient<Database>;

async function criarUsuarioDeTeste(
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

  const cliente = createClient<Database>(SUPABASE_URL, ANON_KEY);
  await cliente.auth.signInWithPassword({ email, password: "senha-teste-123" });
  return cliente;
}

beforeAll(async () => {
  admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY);
  clienteGestor = await criarUsuarioDeTeste(
    admin,
    `administradora-gestor-${Date.now()}@teste.mcj`,
    "gestor_capital",
    "capital"
  );
  clienteConsultor = await criarUsuarioDeTeste(
    admin,
    `administradora-consultor-${Date.now()}@teste.mcj`,
    "consultor_capital",
    "capital"
  );
});

describe("administradora.service", () => {
  it("gestor cria administradora e plano; qualquer autenticado lista", async () => {
    const administradora = await criarAdministradora(clienteGestor, {
      nome: `Administradora Teste ${Date.now()}`,
    });

    const plano = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: administradora.id,
      nomePlano: "Plano 100k",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 60,
      taxaAdministracaoPercentual: 18,
    });

    const administradorasVistasPeloConsultor = await listarAdministradoras(clienteConsultor);
    const planosVistosPeloConsultor = await listarPlanosPorAdministradora(
      clienteConsultor,
      administradora.id
    );

    expect(administradorasVistasPeloConsultor.some((a) => a.id === administradora.id)).toBe(true);
    expect(planosVistosPeloConsultor.some((p) => p.id === plano.id)).toBe(true);
  });

  it("RLS impede que um consultor (não gestor/admin) crie administradora", async () => {
    await expect(
      criarAdministradora(clienteConsultor, { nome: `Tentativa Consultor ${Date.now()}` })
    ).rejects.toThrow();
  });

  it("gestor cria campanha de incentivo vinculada a uma administradora", async () => {
    const administradora = await criarAdministradora(clienteGestor, {
      nome: `Administradora Campanha ${Date.now()}`,
    });

    const campanha = await criarCampanhaIncentivo(clienteGestor, {
      administradoraId: administradora.id,
      nome: "Campanha Fim de Ano",
      bonusPercentual: 1.5,
      vigenciaInicio: "2026-01-01",
    });

    expect(campanha.administradora_id).toBe(administradora.id);
    expect(campanha.bonus_percentual).toBe(1.5);
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/administradora.service.test.ts
```

Expected: FAIL — módulo `./administradora.service` não encontrado.

- [ ] **Step 4: Implementar o serviço**

```typescript
// src/modules/consorcio/administradora.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  criarAdministradoraSchema,
  criarPlanoConsorcioSchema,
  criarCampanhaIncentivoSchema,
  type CriarAdministradoraInput,
  type CriarPlanoConsorcioInput,
  type CriarCampanhaIncentivoInput,
} from "./administradora.schema";

export type Administradora = Database["public"]["Tables"]["administradora"]["Row"];
export type PlanoConsorcio = Database["public"]["Tables"]["plano_consorcio_administradora"]["Row"];
export type CampanhaIncentivo = Database["public"]["Tables"]["campanha_incentivo"]["Row"];

export async function criarAdministradora(
  client: SupabaseClient<Database>,
  input: CriarAdministradoraInput
): Promise<Administradora> {
  const dadosValidados = criarAdministradoraSchema.parse(input);

  const { data, error } = await client
    .from("administradora")
    .insert({
      nome: dadosValidados.nome,
      cnpj: dadosValidados.cnpj ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listarAdministradoras(
  client: SupabaseClient<Database>
): Promise<Administradora[]> {
  const { data, error } = await client.from("administradora").select("*");
  if (error) throw error;
  return data;
}

export async function criarPlanoConsorcio(
  client: SupabaseClient<Database>,
  input: CriarPlanoConsorcioInput
): Promise<PlanoConsorcio> {
  const dadosValidados = criarPlanoConsorcioSchema.parse(input);

  const { data, error } = await client
    .from("plano_consorcio_administradora")
    .insert({
      administradora_id: dadosValidados.administradoraId,
      nome_plano: dadosValidados.nomePlano,
      credito_min: dadosValidados.creditoMin,
      credito_max: dadosValidados.creditoMax,
      prazo_meses: dadosValidados.prazoMeses,
      taxa_administracao_percentual: dadosValidados.taxaAdministracaoPercentual,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listarPlanosPorAdministradora(
  client: SupabaseClient<Database>,
  administradoraId: string
): Promise<PlanoConsorcio[]> {
  const { data, error } = await client
    .from("plano_consorcio_administradora")
    .select("*")
    .eq("administradora_id", administradoraId);

  if (error) throw error;
  return data;
}

export async function criarCampanhaIncentivo(
  client: SupabaseClient<Database>,
  input: CriarCampanhaIncentivoInput
): Promise<CampanhaIncentivo> {
  const dadosValidados = criarCampanhaIncentivoSchema.parse(input);

  const { data, error } = await client
    .from("campanha_incentivo")
    .insert({
      administradora_id: dadosValidados.administradoraId,
      nome: dadosValidados.nome,
      bonus_percentual: dadosValidados.bonusPercentual,
      vigencia_inicio: dadosValidados.vigenciaInicio,
      vigencia_fim: dadosValidados.vigenciaFim ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/administradora.service.test.ts
```

Expected: PASS nos 3 testes.

- [ ] **Step 6: Commit**

```bash
git add src/modules/consorcio/administradora.schema.ts src/modules/consorcio/administradora.service.ts src/modules/consorcio/administradora.service.test.ts
git commit -m "feat(consorcio): add administradora and plano_consorcio_administradora service"
```

---

### Task 4: Serviço de oferta, com estado coletado→validado

**Files:**
- Create: `src/modules/consorcio/oferta.schema.ts`, `src/modules/consorcio/oferta.service.ts`
- Test: `src/modules/consorcio/oferta.service.test.ts`

**Interfaces:**
- Consumes: tabela `oferta_administradora` (Task 2); `administradora`, `plano_consorcio_administradora` (Task 1); `criarAdministradora`, `criarPlanoConsorcio` (Task 3, usado no setup dos testes).
- Produces: `criarOfertaAdministradoraSchema` (Zod); `criarOfertaAdministradora(client, input): Promise<OfertaAdministradora>`; `validarOferta(client, ofertaId): Promise<OfertaAdministradora>`; tipo `OfertaAdministradora`.

- [ ] **Step 1: Escrever o schema de validação**

```typescript
// src/modules/consorcio/oferta.schema.ts
import { z } from "zod";

export const criarOfertaAdministradoraSchema = z.object({
  administradoraId: z.string().uuid(),
  planoId: z.string().uuid(),
  campanhaId: z.string().uuid().optional(),
  comissaoPercentual: z.number().nonnegative(),
  fonte: z.enum(["boletim", "manual"]),
  textoOrigem: z.string().optional(),
  vigenciaFim: z.string().optional(),
});

export type CriarOfertaAdministradoraInput = z.infer<typeof criarOfertaAdministradoraSchema>;
```

- [ ] **Step 2: Escrever o teste que falha primeiro**

```typescript
// src/modules/consorcio/oferta.service.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarAdministradora, criarPlanoConsorcio } from "./administradora.service";
import { criarOfertaAdministradora, validarOferta } from "./oferta.service";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient<Database>;
let clienteGestor: SupabaseClient<Database>;
let clienteConsultor: SupabaseClient<Database>;

async function criarUsuarioDeTeste(
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

  const cliente = createClient<Database>(SUPABASE_URL, ANON_KEY);
  await cliente.auth.signInWithPassword({ email, password: "senha-teste-123" });
  return cliente;
}

beforeAll(async () => {
  admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY);
  clienteGestor = await criarUsuarioDeTeste(
    admin,
    `oferta-gestor-${Date.now()}@teste.mcj`,
    "gestor_capital",
    "capital"
  );
  clienteConsultor = await criarUsuarioDeTeste(
    admin,
    `oferta-consultor-${Date.now()}@teste.mcj`,
    "consultor_capital",
    "capital"
  );
});

describe("oferta.service", () => {
  it("consultor cria oferta como coletada; gestor valida", async () => {
    const administradora = await criarAdministradora(clienteGestor, {
      nome: `Administradora Oferta ${Date.now()}`,
    });
    const plano = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: administradora.id,
      nomePlano: "Plano Oferta",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 60,
      taxaAdministracaoPercentual: 18,
    });

    const oferta = await criarOfertaAdministradora(clienteConsultor, {
      administradoraId: administradora.id,
      planoId: plano.id,
      comissaoPercentual: 4,
      fonte: "manual",
    });

    expect(oferta.estado).toBe("coletado");
    expect(oferta.validado_por).toBeNull();

    const ofertaValidada = await validarOferta(clienteGestor, oferta.id);

    expect(ofertaValidada.estado).toBe("validado");
    expect(ofertaValidada.validado_por).not.toBeNull();
    expect(ofertaValidada.validado_em).not.toBeNull();
  });

  it("RLS impede que um consultor (não gestor/admin) valide uma oferta", async () => {
    const administradora = await criarAdministradora(clienteGestor, {
      nome: `Administradora Validacao Negada ${Date.now()}`,
    });
    const plano = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: administradora.id,
      nomePlano: "Plano Validacao Negada",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 60,
      taxaAdministracaoPercentual: 18,
    });
    const oferta = await criarOfertaAdministradora(clienteConsultor, {
      administradoraId: administradora.id,
      planoId: plano.id,
      comissaoPercentual: 4,
      fonte: "manual",
    });

    await expect(validarOferta(clienteConsultor, oferta.id)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/oferta.service.test.ts
```

Expected: FAIL — módulo `./oferta.service` não encontrado.

- [ ] **Step 4: Implementar o serviço**

```typescript
// src/modules/consorcio/oferta.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  criarOfertaAdministradoraSchema,
  type CriarOfertaAdministradoraInput,
} from "./oferta.schema";

export type OfertaAdministradora = Database["public"]["Tables"]["oferta_administradora"]["Row"];

export async function criarOfertaAdministradora(
  client: SupabaseClient<Database>,
  input: CriarOfertaAdministradoraInput
): Promise<OfertaAdministradora> {
  const dadosValidados = criarOfertaAdministradoraSchema.parse(input);

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;

  const { data, error } = await client
    .from("oferta_administradora")
    .insert({
      administradora_id: dadosValidados.administradoraId,
      plano_id: dadosValidados.planoId,
      campanha_id: dadosValidados.campanhaId ?? null,
      comissao_percentual: dadosValidados.comissaoPercentual,
      fonte: dadosValidados.fonte,
      texto_origem: dadosValidados.textoOrigem ?? null,
      vigencia_fim: dadosValidados.vigenciaFim ?? null,
      criado_por: userData.user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function validarOferta(
  client: SupabaseClient<Database>,
  ofertaId: string
): Promise<OfertaAdministradora> {
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;

  const { data, error } = await client
    .from("oferta_administradora")
    .update({
      estado: "validado",
      validado_por: userData.user.id,
      validado_em: new Date().toISOString(),
    })
    .eq("id", ofertaId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/oferta.service.test.ts
```

Expected: PASS nos 2 testes.

- [ ] **Step 6: Commit**

```bash
git add src/modules/consorcio/oferta.schema.ts src/modules/consorcio/oferta.service.ts src/modules/consorcio/oferta.service.test.ts
git commit -m "feat(consorcio): add oferta service with coletado->validado state machine"
```

---

### Task 5: Extração assistida por IA a partir de texto colado

**Files:**
- Create: `src/modules/consorcio/boletim.schema.ts`, `src/modules/consorcio/boletim.service.ts`
- Test: `src/modules/consorcio/boletim.service.test.ts`

**Interfaces:**
- Consumes: nenhuma tabela (função pura de extração, sem gravação no banco).
- Produces: `extracaoOfertaBoletimSchema` (Zod), tipo `ExtracaoOfertaBoletim`; tipo `ExtratorBoletim = (textoBoletim: string) => Promise<ExtracaoOfertaBoletim>`; `extrairOfertaDeBoletimComClaude(textoBoletim): Promise<ExtracaoOfertaBoletim>` (implementação real via Claude); `processarBoletim(textoBoletim, extrator?): Promise<ExtracaoOfertaBoletim>`.

- [ ] **Step 1: Instalar a dependência do SDK da Anthropic**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Escrever o schema de validação**

```typescript
// src/modules/consorcio/boletim.schema.ts
import { z } from "zod";

export const extracaoOfertaBoletimSchema = z.object({
  administradoraNome: z.string().min(1),
  planoNome: z.string().min(1),
  creditoMin: z.number().positive(),
  creditoMax: z.number().positive(),
  prazoMeses: z.number().int().positive(),
  taxaAdministracaoPercentual: z.number().nonnegative(),
  comissaoPercentual: z.number().nonnegative(),
  campanhaNome: z.string().optional(),
  campanhaBonusPercentual: z.number().nonnegative().optional(),
});

export type ExtracaoOfertaBoletim = z.infer<typeof extracaoOfertaBoletimSchema>;
```

- [ ] **Step 3: Escrever o teste que falha primeiro**

Este teste NÃO chama a API real da Claude — usa um extrator falso injetado, para ficar rápido, determinístico e não depender de `ANTHROPIC_API_KEY`.

```typescript
// src/modules/consorcio/boletim.service.test.ts
import { describe, it, expect } from "vitest";
import { processarBoletim } from "./boletim.service";
import type { ExtracaoOfertaBoletim } from "./boletim.schema";

describe("boletim.service", () => {
  it("processarBoletim usa o extrator injetado e retorna os dados extraídos", async () => {
    const extracaoFalsa: ExtracaoOfertaBoletim = {
      administradoraNome: "Administradora Teste",
      planoNome: "Plano 100k",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 60,
      taxaAdministracaoPercentual: 18,
      comissaoPercentual: 4,
    };

    const extratorFalso = async (_texto: string) => extracaoFalsa;

    const resultado = await processarBoletim("boletim de teste", extratorFalso);

    expect(resultado).toEqual(extracaoFalsa);
  });

  it("processarBoletim propaga o erro quando o extrator falha", async () => {
    const extratorComErro = async (_texto: string) => {
      throw new Error("falha simulada de extração");
    };

    await expect(processarBoletim("boletim de teste", extratorComErro)).rejects.toThrow(
      "falha simulada de extração"
    );
  });
});
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/boletim.service.test.ts
```

Expected: FAIL — módulo `./boletim.service` não encontrado.

- [ ] **Step 5: Implementar o serviço**

```typescript
// src/modules/consorcio/boletim.service.ts
import Anthropic from "@anthropic-ai/sdk";
import { extracaoOfertaBoletimSchema, type ExtracaoOfertaBoletim } from "./boletim.schema";

export type ExtratorBoletim = (textoBoletim: string) => Promise<ExtracaoOfertaBoletim>;

const PROMPT_EXTRACAO = `Você é um assistente que extrai condições comerciais estruturadas de boletins de administradoras de consórcio, separando o dado comercial real de conteúdo de marketing. Responda APENAS com um JSON válido no formato:
{
  "administradoraNome": string,
  "planoNome": string,
  "creditoMin": number,
  "creditoMax": number,
  "prazoMeses": number,
  "taxaAdministracaoPercentual": number,
  "comissaoPercentual": number,
  "campanhaNome": string (opcional, omita se não houver),
  "campanhaBonusPercentual": number (opcional, omita se não houver)
}
Não inclua nenhum texto fora do JSON.`;

export async function extrairOfertaDeBoletimComClaude(
  textoBoletim: string
): Promise<ExtracaoOfertaBoletim> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const resposta = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: PROMPT_EXTRACAO,
    messages: [{ role: "user", content: textoBoletim }],
  });

  const bloco = resposta.content.find((c) => c.type === "text");
  if (!bloco || bloco.type !== "text") {
    throw new Error("Resposta da IA não contém texto extraído");
  }

  const json = JSON.parse(bloco.text);
  return extracaoOfertaBoletimSchema.parse(json);
}

export async function processarBoletim(
  textoBoletim: string,
  extrator: ExtratorBoletim = extrairOfertaDeBoletimComClaude
): Promise<ExtracaoOfertaBoletim> {
  return extrator(textoBoletim);
}
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/boletim.service.test.ts
```

Expected: PASS nos 2 testes.

- [ ] **Step 7: Verificação manual opcional (só se `ANTHROPIC_API_KEY` estiver configurada em `.env.local`)**

Se a chave existir, rode um script rápido chamando `extrairOfertaDeBoletimComClaude` com um texto de exemplo e confira visualmente o JSON retornado. Se a chave não existir, pule esta etapa — não é bloqueante, o teste automatizado já cobre a lógica de orquestração via extrator falso.

- [ ] **Step 8: Commit**

```bash
git add src/modules/consorcio/boletim.schema.ts src/modules/consorcio/boletim.service.ts src/modules/consorcio/boletim.service.test.ts package.json package-lock.json
git commit -m "feat(consorcio): add AI-assisted bulletin extraction with injectable extractor"
```

---

### Task 6: Motor de recomendação 50% adequação + 50% resultado comercial

**Files:**
- Create: `src/modules/consorcio/recomendacao.schema.ts`, `src/modules/consorcio/recomendacao.service.ts`
- Test: `src/modules/consorcio/recomendacao.service.test.ts`

**Interfaces:**
- Consumes: tabelas `oferta_administradora`, `administradora`, `plano_consorcio_administradora`, `campanha_incentivo`, `politica_recomendacao_consorcio` (Tasks 1-2); `criarAdministradora`/`criarPlanoConsorcio` (Task 3), `criarOfertaAdministradora`/`validarOferta` (Task 4), usados no setup dos testes.
- Produces: `recomendarAdministradorasSchema` (Zod); `recomendarAdministradoras(client, input): Promise<ResultadoRecomendacao[]>`; tipo `ResultadoRecomendacao`.

- [ ] **Step 1: Escrever o schema de validação**

```typescript
// src/modules/consorcio/recomendacao.schema.ts
import { z } from "zod";

export const recomendarAdministradorasSchema = z.object({
  creditoDesejado: z.number().positive(),
  prazoDesejadoMeses: z.number().int().positive(),
});

export type RecomendarAdministradorasInput = z.infer<typeof recomendarAdministradorasSchema>;
```

- [ ] **Step 2: Escrever o teste que falha primeiro**

```typescript
// src/modules/consorcio/recomendacao.service.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarAdministradora, criarPlanoConsorcio } from "./administradora.service";
import { criarOfertaAdministradora, validarOferta } from "./oferta.service";
import { recomendarAdministradoras } from "./recomendacao.service";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient<Database>;
let clienteGestor: SupabaseClient<Database>;

async function criarUsuarioDeTeste(
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

  const cliente = createClient<Database>(SUPABASE_URL, ANON_KEY);
  await cliente.auth.signInWithPassword({ email, password: "senha-teste-123" });
  return cliente;
}

beforeAll(async () => {
  admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY);
  clienteGestor = await criarUsuarioDeTeste(
    admin,
    `recomendacao-gestor-${Date.now()}@teste.mcj`,
    "gestor_capital",
    "capital"
  );
});

describe("recomendacao.service", () => {
  it("classifica ofertas elegíveis por 50% adequação + 50% resultado comercial", async () => {
    const sufixo = Date.now();

    const admA = await criarAdministradora(clienteGestor, { nome: `Administradora A ${sufixo}` });
    const admB = await criarAdministradora(clienteGestor, { nome: `Administradora B ${sufixo}` });

    const planoA = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: admA.id,
      nomePlano: "Plano A",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 60,
      taxaAdministracaoPercentual: 18,
    });
    const planoB = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: admB.id,
      nomePlano: "Plano B",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 80,
      taxaAdministracaoPercentual: 16,
    });

    const ofertaA = await criarOfertaAdministradora(clienteGestor, {
      administradoraId: admA.id,
      planoId: planoA.id,
      comissaoPercentual: 3,
      fonte: "manual",
    });
    const ofertaB = await criarOfertaAdministradora(clienteGestor, {
      administradoraId: admB.id,
      planoId: planoB.id,
      comissaoPercentual: 6,
      fonte: "manual",
    });

    await validarOferta(clienteGestor, ofertaA.id);
    await validarOferta(clienteGestor, ofertaB.id);

    const resultado = await recomendarAdministradoras(clienteGestor, {
      creditoDesejado: 100000,
      prazoDesejadoMeses: 60,
    });

    const resultadoA = resultado.find((r) => r.ofertaId === ofertaA.id);
    const resultadoB = resultado.find((r) => r.ofertaId === ofertaB.id);

    expect(resultadoA).toBeDefined();
    expect(resultadoB).toBeDefined();
    expect(resultadoA!.adequacao).toBe(1);
    expect(resultadoB!.adequacao).toBeCloseTo(1 - 20 / 60, 5);
    expect(resultadoB!.resultadoComercial).toBe(1);
    expect(resultadoA!.resultadoComercial).toBe(0);
    expect(resultadoB!.scoreFinal).toBeGreaterThan(resultadoA!.scoreFinal);
  });

  it("exclui ofertas fora da faixa de crédito e ofertas não validadas", async () => {
    const sufixo = Date.now();
    const adm = await criarAdministradora(clienteGestor, {
      nome: `Administradora Fora Faixa ${sufixo}`,
    });

    const planoForaFaixa = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: adm.id,
      nomePlano: "Plano Fora de Faixa",
      creditoMin: 200000,
      creditoMax: 300000,
      prazoMeses: 60,
      taxaAdministracaoPercentual: 18,
    });
    const ofertaForaFaixa = await criarOfertaAdministradora(clienteGestor, {
      administradoraId: adm.id,
      planoId: planoForaFaixa.id,
      comissaoPercentual: 10,
      fonte: "manual",
    });
    await validarOferta(clienteGestor, ofertaForaFaixa.id);

    const planoNaoValidado = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: adm.id,
      nomePlano: "Plano Não Validado",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 60,
      taxaAdministracaoPercentual: 18,
    });
    const ofertaNaoValidada = await criarOfertaAdministradora(clienteGestor, {
      administradoraId: adm.id,
      planoId: planoNaoValidado.id,
      comissaoPercentual: 10,
      fonte: "manual",
    });

    const resultado = await recomendarAdministradoras(clienteGestor, {
      creditoDesejado: 100000,
      prazoDesejadoMeses: 60,
    });

    expect(resultado.some((r) => r.ofertaId === ofertaForaFaixa.id)).toBe(false);
    expect(resultado.some((r) => r.ofertaId === ofertaNaoValidada.id)).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/recomendacao.service.test.ts
```

Expected: FAIL — módulo `./recomendacao.service` não encontrado.

- [ ] **Step 4: Implementar o serviço**

```typescript
// src/modules/consorcio/recomendacao.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  recomendarAdministradorasSchema,
  type RecomendarAdministradorasInput,
} from "./recomendacao.schema";

export interface ResultadoRecomendacao {
  ofertaId: string;
  administradoraId: string;
  administradoraNome: string;
  planoId: string;
  adequacao: number;
  resultadoComercial: number;
  scoreFinal: number;
}

export async function recomendarAdministradoras(
  client: SupabaseClient<Database>,
  input: RecomendarAdministradorasInput
): Promise<ResultadoRecomendacao[]> {
  const dadosValidados = recomendarAdministradorasSchema.parse(input);

  const { data: politica, error: erroPolitica } = await client
    .from("politica_recomendacao_consorcio")
    .select("peso_adequacao, peso_resultado_comercial")
    .eq("vigente", true)
    .single();
  if (erroPolitica) throw erroPolitica;

  const hoje = new Date().toISOString().slice(0, 10);

  const { data: ofertas, error: erroOfertas } = await client
    .from("oferta_administradora")
    .select("id, administradora_id, plano_id, comissao_percentual, campanha_id, vigencia_inicio, vigencia_fim")
    .eq("estado", "validado")
    .lte("vigencia_inicio", hoje)
    .or(`vigencia_fim.is.null,vigencia_fim.gte.${hoje}`);
  if (erroOfertas) throw erroOfertas;
  if (!ofertas || ofertas.length === 0) return [];

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
      ? await client.from("campanha_incentivo").select("id, bonus_percentual").in("id", campanhaIds)
      : { data: [], error: null };
  if (erroCampanhas) throw erroCampanhas;

  const administradoraPorId = new Map((administradoras ?? []).map((a) => [a.id, a]));
  const planoPorId = new Map((planos ?? []).map((p) => [p.id, p]));
  const campanhaPorId = new Map((campanhas ?? []).map((c) => [c.id, c]));

  const elegiveis = ofertas
    .map((oferta) => {
      const administradora = administradoraPorId.get(oferta.administradora_id);
      const plano = planoPorId.get(oferta.plano_id);
      if (!administradora || !plano) return null;
      if (administradora.situacao !== "ativa") return null;
      if (
        dadosValidados.creditoDesejado < plano.credito_min ||
        dadosValidados.creditoDesejado > plano.credito_max
      )
        return null;

      const campanha = oferta.campanha_id ? campanhaPorId.get(oferta.campanha_id) : undefined;
      const comissaoEfetiva = oferta.comissao_percentual + (campanha?.bonus_percentual ?? 0);

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

  if (elegiveis.length === 0) return [];

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
      politica.peso_adequacao * adequacao + politica.peso_resultado_comercial * resultadoComercial;

    return {
      ofertaId: oferta.ofertaId,
      administradoraId: oferta.administradoraId,
      administradoraNome: oferta.administradoraNome,
      planoId: oferta.planoId,
      adequacao,
      resultadoComercial,
      scoreFinal,
    };
  });

  return resultados.sort((a, b) => b.scoreFinal - a.scoreFinal);
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/consorcio/recomendacao.service.test.ts
```

Expected: PASS nos 2 testes.

- [ ] **Step 6: Commit**

```bash
git add src/modules/consorcio/recomendacao.schema.ts src/modules/consorcio/recomendacao.service.ts src/modules/consorcio/recomendacao.service.test.ts
git commit -m "feat(consorcio): add deterministic 50/50 recommendation engine"
```

---

### Task 7: UI mínima — administradoras, planos, ofertas e extração de boletim

**Files:**
- Create: `src/app/administradoras/page.tsx`, `src/app/administradoras/actions.ts`

**Interfaces:**
- Consumes: `criarAdministradora`, `listarAdministradoras` (Task 3); `criarOfertaAdministradora` (Task 4); `processarBoletim` (Task 5); `createServerSupabaseClient()` (fundação).
- Produces: página `/administradoras` funcional (lista + formulário de criação de administradora + formulário de criação de oferta manual + textarea de extração de boletim).

- [ ] **Step 1: Criar as server actions**

```typescript
// src/app/administradoras/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { criarAdministradora } from "@/modules/consorcio/administradora.service";
import { criarOfertaAdministradora } from "@/modules/consorcio/oferta.service";
import { processarBoletim } from "@/modules/consorcio/boletim.service";
import type { ExtracaoOfertaBoletim } from "@/modules/consorcio/boletim.schema";

export async function criarAdministradoraAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  await criarAdministradora(client, {
    nome: String(formData.get("nome")),
  });

  revalidatePath("/administradoras");
}

export async function criarOfertaManualAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  await criarOfertaAdministradora(client, {
    administradoraId: String(formData.get("administradoraId")),
    planoId: String(formData.get("planoId")),
    comissaoPercentual: Number(formData.get("comissaoPercentual")),
    fonte: "manual",
  });

  revalidatePath("/administradoras");
}

export async function extrairBoletimAction(
  textoBoletim: string
): Promise<ExtracaoOfertaBoletim> {
  return processarBoletim(textoBoletim);
}
```

- [ ] **Step 2: Criar a página**

```tsx
// src/app/administradoras/page.tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listarAdministradoras } from "@/modules/consorcio/administradora.service";
import { criarAdministradoraAction, criarOfertaManualAction } from "./actions";

export default async function AdministradorasPage() {
  const client = await createServerSupabaseClient();
  const administradoras = await listarAdministradoras(client);

  return (
    <main>
      <h1>Administradoras de Consórcio</h1>

      <form action={criarAdministradoraAction}>
        <input name="nome" placeholder="Nome da administradora" required />
        <button type="submit">Criar administradora</button>
      </form>

      <ul>
        {administradoras.map((administradora) => (
          <li key={administradora.id}>
            {administradora.nome} — {administradora.situacao}
          </li>
        ))}
      </ul>

      <h2>Registrar oferta manualmente</h2>
      <form action={criarOfertaManualAction}>
        <input name="administradoraId" placeholder="ID da administradora" required />
        <input name="planoId" placeholder="ID do plano" required />
        <input name="comissaoPercentual" type="number" step="0.01" placeholder="Comissão %" required />
        <button type="submit">Registrar oferta</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Validar manualmente**

```bash
npm run dev
```

Acesse `http://localhost:3000/administradoras` — sem sessão autenticada, a lista deve vir vazia e a criação deve falhar por causa do RLS (mesmo comportamento já validado para `/pessoas` e `/oportunidades`). Pare o servidor.

- [ ] **Step 4: Rodar a suíte completa uma última vez**

```bash
npm test
npx tsc --noEmit
```

Expected: todos os testes passam (fundação + comercial-core + este plano), `tsc --noEmit` limpo.

- [ ] **Step 5: Commit**

```bash
git add src/app/administradoras
git commit -m "feat(consorcio): add minimal UI for administradoras, ofertas and bulletin extraction"
```
