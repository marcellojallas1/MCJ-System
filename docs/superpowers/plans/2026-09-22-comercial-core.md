# Comercial Core (Oportunidade, Proposta, Contrato) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the commercial core objects (`oportunidade`, versioned `proposta`/`proposta_item`, `contrato`) on top of the identity foundation, reusing the established RLS/audit patterns, and switch the whole codebase to a typed Supabase client.

**Architecture:** Same monólito modular pattern as the foundation — a new `src/modules/commercial` module, tables scoped by `marca_id` through the existing `public.tem_acesso_marca()` RLS helper, audit triggers reusing `public.registrar_auditoria()`. `proposta`/`contrato` derive their `marca_id` server-side from their parent record (never trust client-supplied `marca_id` for child objects) to prevent a class of RLS-bypassing data-integrity bugs.

**Tech Stack:** Same as the foundation — Next.js (App Router) + TypeScript, Supabase (Postgres + Auth), Zod, Vitest. Adds `supabase gen types typescript` for a typed `SupabaseClient<Database>`.

**Spec:** `/Users/MJallas/CRM/docs/superpowers/specs/2026-09-22-piloto-mcj-capital-design.md`

## Global Constraints

- Toda tabela de negócio tem RLS habilitado na mesma migração que a cria — nunca numa task posterior (lição da fundação: isso já vale para select/insert/update juntos, não só select/insert).
- Nenhuma credencial/chave em texto no código-fonte — sempre via `.env.local`, que fica no `.gitignore`.
- TypeScript em modo `strict`.
- Migrações do Supabase em `supabase/migrations/`, nunca editadas retroativamente — mudança de schema é sempre uma nova migração.
- Ações de negócio relevantes passam por validação Zod antes de tocar o banco.
- `marca_id` em `proposta` e `contrato` é sempre derivado do registro pai (oportunidade / proposta) no servidor, nunca aceito como entrada direta do cliente — evita que um `marca_id` "válido para a RLS" seja combinado com um `oportunidade_id`/`proposta_id` de outra marca.

---

### Task 1: Migração — oportunidade

**Files:**
- Create: `supabase/migrations/20260922000006_oportunidade.sql`

**Interfaces:**
- Consumes: `pessoa_fisica`, `pessoa_juridica`, `marca`, `usuario_interno` (fundação); `public.tem_acesso_marca(p_marca_id smallint)` (fundação); `public.registrar_auditoria()` (fundação).
- Produces: tabela `oportunidade` com RLS habilitado e políticas de select/insert/update.

- [ ] **Step 1: Escrever a migração**

```sql
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
```

- [ ] **Step 2: Aplicar e verificar**

```bash
export PATH="/Users/MJallas/.docker/bin:$PATH" && npx supabase db reset
```

Expected: sem erros. Confirme no Studio (`http://127.0.0.1:54323`) que `oportunidade` existe, com RLS habilitado e 3 políticas.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260922000006_oportunidade.sql
git commit -m "feat(db): add oportunidade table with RLS scoped by marca"
```

---

### Task 2: Migração — proposta e proposta_item

**Files:**
- Create: `supabase/migrations/20260922000007_proposta.sql`

**Interfaces:**
- Consumes: `oportunidade` (Task 1); `marca`, `usuario_interno` (fundação); `public.tem_acesso_marca()`, `public.registrar_auditoria()` (fundação).
- Produces: tabelas `proposta` (versionada por `oportunidade_id`) e `proposta_item`, ambas com RLS.

- [ ] **Step 1: Escrever a migração**

```sql
-- supabase/migrations/20260922000007_proposta.sql

create table proposta (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references oportunidade(id),
  marca_id smallint not null references marca(id),
  versao integer not null,
  status text not null default 'rascunho' check (status in ('rascunho', 'enviada', 'aprovada', 'rejeitada', 'expirada')),
  validade date,
  responsavel_id uuid references usuario_interno(id),
  criado_em timestamptz not null default now(),
  unique (oportunidade_id, versao)
);

create table proposta_item (
  id uuid primary key default gen_random_uuid(),
  proposta_id uuid not null references proposta(id),
  descricao text not null,
  quantidade numeric not null default 1,
  preco_unitario numeric not null,
  preco_total numeric generated always as (quantidade * preco_unitario) stored,
  criado_em timestamptz not null default now()
);

alter table proposta enable row level security;
alter table proposta_item enable row level security;

create index idx_proposta_marca_id on proposta (marca_id);
create index idx_proposta_oportunidade_id on proposta (oportunidade_id);
create index idx_proposta_item_proposta_id on proposta_item (proposta_id);

create policy "select_proposta_por_marca"
on proposta for select
to authenticated
using (public.tem_acesso_marca(marca_id));

create policy "insert_proposta_por_marca"
on proposta for insert
to authenticated
with check (public.tem_acesso_marca(marca_id));

create policy "update_proposta_por_marca"
on proposta for update
to authenticated
using (public.tem_acesso_marca(marca_id))
with check (public.tem_acesso_marca(marca_id));

-- proposta_item não tem marca_id próprio (nunca é consultado fora do
-- contexto de uma proposta); o acesso segue a marca da proposta pai.
create policy "select_proposta_item_por_marca"
on proposta_item for select
to authenticated
using (
  exists (
    select 1 from proposta p
    where p.id = proposta_item.proposta_id
      and public.tem_acesso_marca(p.marca_id)
  )
);

create policy "insert_proposta_item_por_marca"
on proposta_item for insert
to authenticated
with check (
  exists (
    select 1 from proposta p
    where p.id = proposta_item.proposta_id
      and public.tem_acesso_marca(p.marca_id)
  )
);

create trigger proposta_auditoria
after insert or update or delete on proposta
for each row execute function public.registrar_auditoria();
```

- [ ] **Step 2: Aplicar e verificar**

```bash
export PATH="/Users/MJallas/.docker/bin:$PATH" && npx supabase db reset
```

Expected: sem erros. Confirme `proposta` e `proposta_item` no Studio, com RLS habilitado.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260922000007_proposta.sql
git commit -m "feat(db): add versioned proposta and proposta_item tables with RLS"
```

---

### Task 3: Migração — contrato

**Files:**
- Create: `supabase/migrations/20260922000008_contrato.sql`

**Interfaces:**
- Consumes: `oportunidade` (Task 1), `proposta` (Task 2), `marca` (fundação), `public.tem_acesso_marca()`, `public.registrar_auditoria()` (fundação).
- Produces: tabela `contrato`, um por `proposta_id` (unique), com RLS.

- [ ] **Step 1: Escrever a migração**

```sql
-- supabase/migrations/20260922000008_contrato.sql

create table contrato (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references oportunidade(id),
  proposta_id uuid not null references proposta(id),
  marca_id smallint not null references marca(id),
  status text not null default 'ativo' check (status in ('ativo', 'encerrado', 'cancelado')),
  vigencia_inicio date not null default current_date,
  vigencia_fim date,
  criado_em timestamptz not null default now(),
  unique (proposta_id)
);

alter table contrato enable row level security;

create index idx_contrato_marca_id on contrato (marca_id);
create index idx_contrato_oportunidade_id on contrato (oportunidade_id);

create policy "select_contrato_por_marca"
on contrato for select
to authenticated
using (public.tem_acesso_marca(marca_id));

create policy "insert_contrato_por_marca"
on contrato for insert
to authenticated
with check (public.tem_acesso_marca(marca_id));

create trigger contrato_auditoria
after insert or update or delete on contrato
for each row execute function public.registrar_auditoria();
```

- [ ] **Step 2: Aplicar e verificar**

```bash
export PATH="/Users/MJallas/.docker/bin:$PATH" && npx supabase db reset
```

Expected: sem erros. Confirme `contrato` no Studio, com RLS habilitado e a constraint `unique (proposta_id)`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260922000008_contrato.sql
git commit -m "feat(db): add contrato table, one per approved proposta, with RLS"
```

---

### Task 4: Cliente Supabase tipado

**Files:**
- Create: `src/lib/supabase/database.types.ts` (gerado)
- Modify: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/modules/identity/pessoa.service.ts`, `src/modules/identity/pessoa.service.test.ts`, `src/modules/governance/auditoria.test.ts`

**Interfaces:**
- Consumes: schema completo do banco (Tasks 1-3 + fundação).
- Produces: tipo `Database` exportado de `src/lib/supabase/database.types.ts`; `createBrowserSupabaseClient()` e `createServerSupabaseClient()` retornando `SupabaseClient<Database>`; `PessoaFisica` passa a ser `Database["public"]["Tables"]["pessoa_fisica"]["Row"]` em vez de uma interface própria.

- [ ] **Step 1: Confirmar que o Supabase local está rodando**

```bash
export PATH="/Users/MJallas/.docker/bin:$PATH" && npx supabase status
```

Se não estiver, suba com `export PATH="/Users/MJallas/.docker/bin:$PATH" && npx supabase start`.

- [ ] **Step 2: Gerar os tipos**

```bash
export PATH="/Users/MJallas/.docker/bin:$PATH" && npx supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

- [ ] **Step 3: Verificar que os tipos cobrem todas as tabelas**

```bash
grep -o '"\(marca\|pessoa_fisica\|pessoa_juridica\|vinculo_pf_pj\|papel\|usuario_interno\|auditoria_evento\|oportunidade\|proposta\|proposta_item\|contrato\)"' src/lib/supabase/database.types.ts | sort -u
```

Expected: as 11 tabelas listadas aparecem na saída.

- [ ] **Step 4: Atualizar o cliente de browser**

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 5: Atualizar o cliente de servidor**

```typescript
// src/lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — safe to ignore when middleware
            // is refreshing the session (no middleware yet in this codebase;
            // this guard just prevents a hard crash until it exists).
          }
        },
      },
    }
  );
}
```

- [ ] **Step 6: Trocar a interface `PessoaFisica` pelo tipo gerado**

```typescript
// src/modules/identity/pessoa.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarPessoaFisicaSchema, type CriarPessoaFisicaInput } from "./pessoa.schema";

export type PessoaFisica = Database["public"]["Tables"]["pessoa_fisica"]["Row"];

export async function criarPessoaFisica(
  client: SupabaseClient<Database>,
  input: CriarPessoaFisicaInput
): Promise<PessoaFisica> {
  const dadosValidados = criarPessoaFisicaSchema.parse(input);

  const { data, error } = await client
    .from("pessoa_fisica")
    .insert({
      nome_completo: dadosValidados.nomeCompleto,
      cpf: dadosValidados.cpf ?? null,
      email: dadosValidados.email ?? null,
      telefone_whatsapp: dadosValidados.telefoneWhatsapp ?? null,
      marca_entrada_id: dadosValidados.marcaEntradaId,
      origem_primeiro_contato: dadosValidados.origemPrimeiroContato ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listarPessoasFisicas(client: SupabaseClient<Database>): Promise<PessoaFisica[]> {
  const { data, error } = await client.from("pessoa_fisica").select("*");
  if (error) throw error;
  return data;
}
```

- [ ] **Step 7: Tipar os clientes de teste existentes**

Em `src/modules/identity/pessoa.service.test.ts`, adicione `import type { Database } from "@/lib/supabase/database.types";` e troque toda ocorrência de `createClient(` por `createClient<Database>(` (há duas: o cliente `admin` e o cliente criado dentro de `criarUsuarioDeTeste`). Troque também as declarações `let clienteCapital: SupabaseClient;` / `let clienteAmazon: SupabaseClient;` para `SupabaseClient<Database>`, e o parâmetro `admin: SupabaseClient` de `criarUsuarioDeTeste` para `admin: SupabaseClient<Database>`, com retorno `Promise<SupabaseClient<Database>>`.

Faça a mesma troca em `src/modules/governance/auditoria.test.ts`: importe `Database` e troque `createClient(` por `createClient<Database>(`, e `admin: SupabaseClient;` por `admin: SupabaseClient<Database>;`.

- [ ] **Step 8: Rodar a suíte completa e o type-check**

```bash
npm test
npx tsc --noEmit
```

Expected: `npm test` continua com 3/3 passando (nada de funcional mudou, só tipos); `tsc --noEmit` limpo.

- [ ] **Step 9: Commit**

```bash
git add src/lib/supabase/database.types.ts src/lib/supabase/client.ts src/lib/supabase/server.ts src/modules/identity/pessoa.service.ts src/modules/identity/pessoa.service.test.ts src/modules/governance/auditoria.test.ts
git commit -m "feat: switch to typed Supabase client (SupabaseClient<Database>)"
```

---

### Task 5: Serviço de oportunidade, com testes de RLS (select/insert/update) e do papel admin

**Files:**
- Create: `src/modules/commercial/oportunidade.schema.ts`, `src/modules/commercial/oportunidade.service.ts`
- Test: `src/modules/commercial/oportunidade.service.test.ts`

**Interfaces:**
- Consumes: tabela `oportunidade` (Task 1); `SupabaseClient<Database>` (Task 4); `criarPessoaFisica` (fundação, usado no setup dos testes).
- Produces: `criarOportunidadeSchema`, `atualizarEtapaOportunidadeSchema` (Zod); `criarOportunidade(client, input): Promise<Oportunidade>`; `listarOportunidades(client): Promise<Oportunidade[]>`; `atualizarEtapaOportunidade(client, oportunidadeId, input): Promise<Oportunidade>`; tipo `Oportunidade`.

- [ ] **Step 1: Escrever o schema de validação**

```typescript
// src/modules/commercial/oportunidade.schema.ts
import { z } from "zod";

export const criarOportunidadeSchema = z
  .object({
    pessoaFisicaId: z.string().uuid().optional(),
    pessoaJuridicaId: z.string().uuid().optional(),
    marcaId: z.number().int().positive(),
    produto: z.enum(["consorcio", "planejamento_patrimonial"]),
    origem: z.string().optional(),
    valorPrevisto: z.number().positive().optional(),
    probabilidade: z.number().int().min(0).max(100).optional(),
    responsavelId: z.string().uuid().optional(),
  })
  .refine((data) => (data.pessoaFisicaId != null) !== (data.pessoaJuridicaId != null), {
    message: "Informe pessoaFisicaId ou pessoaJuridicaId, não ambos nem nenhum",
  });

export type CriarOportunidadeInput = z.infer<typeof criarOportunidadeSchema>;

export const atualizarEtapaOportunidadeSchema = z.object({
  etapa: z.enum(["qualificacao", "diagnostico", "proposta", "negociacao", "encerrada"]),
});

export type AtualizarEtapaOportunidadeInput = z.infer<typeof atualizarEtapaOportunidadeSchema>;
```

- [ ] **Step 2: Escrever o teste que falha primeiro**

```typescript
// src/modules/commercial/oportunidade.service.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarPessoaFisica } from "@/modules/identity/pessoa.service";
import {
  criarOportunidade,
  listarOportunidades,
  atualizarEtapaOportunidade,
} from "./oportunidade.service";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient<Database>;
let clienteCapital: SupabaseClient<Database>;
let clienteAmazon: SupabaseClient<Database>;
let clienteAdminPapel: SupabaseClient<Database>;

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
  clienteCapital = await criarUsuarioDeTeste(
    admin,
    `oport-capital-${Date.now()}@teste.mcj`,
    "consultor_capital",
    "capital"
  );
  clienteAmazon = await criarUsuarioDeTeste(
    admin,
    `oport-amazon-${Date.now()}@teste.mcj`,
    "consultor_capital",
    "amazon"
  );
  clienteAdminPapel = await criarUsuarioDeTeste(
    admin,
    `oport-admin-${Date.now()}@teste.mcj`,
    "admin",
    "capital"
  );
});

describe("oportunidade.service", () => {
  it("cria e lista oportunidade apenas para a marca do usuário autenticado", async () => {
    const pessoa = await criarPessoaFisica(clienteCapital, {
      nomeCompleto: "Cliente Oportunidade Capital",
      marcaEntradaId: 4,
    });

    await criarOportunidade(clienteCapital, {
      pessoaFisicaId: pessoa.id,
      marcaId: 4,
      produto: "consorcio",
    });

    const vistasPelaCapital = await listarOportunidades(clienteCapital);
    const vistasPelaAmazon = await listarOportunidades(clienteAmazon);

    expect(vistasPelaCapital.some((o) => o.pessoa_fisica_id === pessoa.id)).toBe(true);
    expect(vistasPelaAmazon.some((o) => o.pessoa_fisica_id === pessoa.id)).toBe(false);
  });

  it("RLS impede criar oportunidade em marca diferente da do usuário (WITH CHECK)", async () => {
    const pessoa = await criarPessoaFisica(clienteCapital, {
      nomeCompleto: "Cliente Cross Marca",
      marcaEntradaId: 4,
    });

    await expect(
      criarOportunidade(clienteAmazon, {
        pessoaFisicaId: pessoa.id,
        marcaId: 4,
        produto: "consorcio",
      })
    ).rejects.toThrow();
  });

  it("usuário com papel admin vê oportunidades de todas as marcas", async () => {
    const pessoa = await criarPessoaFisica(clienteAmazon, {
      nomeCompleto: "Cliente Amazon Para Admin",
      marcaEntradaId: 2,
    });

    await criarOportunidade(clienteAmazon, {
      pessoaFisicaId: pessoa.id,
      marcaId: 2,
      produto: "consorcio",
    });

    const vistasPeloAdmin = await listarOportunidades(clienteAdminPapel);
    expect(vistasPeloAdmin.some((o) => o.pessoa_fisica_id === pessoa.id)).toBe(true);
  });

  it("atualizarEtapaOportunidade registra evento de auditoria de UPDATE", async () => {
    const pessoa = await criarPessoaFisica(clienteCapital, {
      nomeCompleto: "Cliente Etapa Auditoria",
      marcaEntradaId: 4,
    });

    const oportunidade = await criarOportunidade(clienteCapital, {
      pessoaFisicaId: pessoa.id,
      marcaId: 4,
      produto: "planejamento_patrimonial",
    });

    await atualizarEtapaOportunidade(clienteCapital, oportunidade.id, {
      etapa: "diagnostico",
    });

    const { data: eventos, error } = await admin
      .from("auditoria_evento")
      .select("*")
      .eq("tabela", "oportunidade")
      .eq("registro_id", oportunidade.id)
      .eq("acao", "UPDATE");

    if (error) throw error;
    expect(eventos).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/commercial/oportunidade.service.test.ts
```

Expected: FAIL — módulo `./oportunidade.service` não encontrado.

- [ ] **Step 4: Implementar o serviço**

```typescript
// src/modules/commercial/oportunidade.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  criarOportunidadeSchema,
  atualizarEtapaOportunidadeSchema,
  type CriarOportunidadeInput,
  type AtualizarEtapaOportunidadeInput,
} from "./oportunidade.schema";

export type Oportunidade = Database["public"]["Tables"]["oportunidade"]["Row"];

export async function criarOportunidade(
  client: SupabaseClient<Database>,
  input: CriarOportunidadeInput
): Promise<Oportunidade> {
  const dadosValidados = criarOportunidadeSchema.parse(input);

  const { data, error } = await client
    .from("oportunidade")
    .insert({
      pessoa_fisica_id: dadosValidados.pessoaFisicaId ?? null,
      pessoa_juridica_id: dadosValidados.pessoaJuridicaId ?? null,
      marca_id: dadosValidados.marcaId,
      produto: dadosValidados.produto,
      origem: dadosValidados.origem ?? null,
      valor_previsto: dadosValidados.valorPrevisto ?? null,
      probabilidade: dadosValidados.probabilidade ?? null,
      responsavel_id: dadosValidados.responsavelId ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listarOportunidades(
  client: SupabaseClient<Database>
): Promise<Oportunidade[]> {
  const { data, error } = await client.from("oportunidade").select("*");
  if (error) throw error;
  return data;
}

export async function atualizarEtapaOportunidade(
  client: SupabaseClient<Database>,
  oportunidadeId: string,
  input: AtualizarEtapaOportunidadeInput
): Promise<Oportunidade> {
  const dadosValidados = atualizarEtapaOportunidadeSchema.parse(input);

  const { data, error } = await client
    .from("oportunidade")
    .update({ etapa: dadosValidados.etapa, atualizado_em: new Date().toISOString() })
    .eq("id", oportunidadeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/commercial/oportunidade.service.test.ts
```

Expected: PASS nos 4 testes.

- [ ] **Step 6: Commit**

```bash
git add src/modules/commercial/oportunidade.schema.ts src/modules/commercial/oportunidade.service.ts src/modules/commercial/oportunidade.service.test.ts
git commit -m "feat(commercial): add oportunidade service with RLS and admin-role tests"
```

---

### Task 6: Serviço de proposta (versionada), com marca_id derivado do pai

**Files:**
- Create: `src/modules/commercial/proposta.schema.ts`, `src/modules/commercial/proposta.service.ts`
- Test: `src/modules/commercial/proposta.service.test.ts`

**Interfaces:**
- Consumes: tabelas `proposta`, `proposta_item` (Task 2); `oportunidade` (Task 1); `SupabaseClient<Database>` (Task 4); `criarOportunidade` (Task 5, usado no setup dos testes).
- Produces: `criarPropostaSchema` (Zod); `criarProposta(client, input): Promise<Proposta & { itens: PropostaItem[] }>`; `listarPropostasPorOportunidade(client, oportunidadeId): Promise<Proposta[]>`; `aprovarProposta(client, propostaId): Promise<Proposta>`; tipos `Proposta`, `PropostaItem`.

- [ ] **Step 1: Escrever o schema de validação**

```typescript
// src/modules/commercial/proposta.schema.ts
import { z } from "zod";

export const criarPropostaSchema = z.object({
  oportunidadeId: z.string().uuid(),
  validade: z.string().optional(),
  responsavelId: z.string().uuid().optional(),
  itens: z
    .array(
      z.object({
        descricao: z.string().min(1),
        quantidade: z.number().positive(),
        precoUnitario: z.number().positive(),
      })
    )
    .min(1),
});

export type CriarPropostaInput = z.infer<typeof criarPropostaSchema>;
```

- [ ] **Step 2: Escrever o teste que falha primeiro**

```typescript
// src/modules/commercial/proposta.service.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarPessoaFisica } from "@/modules/identity/pessoa.service";
import { criarOportunidade } from "./oportunidade.service";
import { criarProposta, listarPropostasPorOportunidade, aprovarProposta } from "./proposta.service";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient<Database>;
let clienteCapital: SupabaseClient<Database>;
let clienteAmazon: SupabaseClient<Database>;

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
  clienteCapital = await criarUsuarioDeTeste(
    admin,
    `proposta-capital-${Date.now()}@teste.mcj`,
    "consultor_capital",
    "capital"
  );
  clienteAmazon = await criarUsuarioDeTeste(
    admin,
    `proposta-amazon-${Date.now()}@teste.mcj`,
    "consultor_capital",
    "amazon"
  );
});

describe("proposta.service", () => {
  it("cria propostas com versão incremental para a mesma oportunidade", async () => {
    const pessoa = await criarPessoaFisica(clienteCapital, {
      nomeCompleto: "Cliente Proposta Versionada",
      marcaEntradaId: 4,
    });
    const oportunidade = await criarOportunidade(clienteCapital, {
      pessoaFisicaId: pessoa.id,
      marcaId: 4,
      produto: "consorcio",
    });

    const v1 = await criarProposta(clienteCapital, {
      oportunidadeId: oportunidade.id,
      itens: [{ descricao: "Cota de consórcio", quantidade: 1, precoUnitario: 50000 }],
    });
    const v2 = await criarProposta(clienteCapital, {
      oportunidadeId: oportunidade.id,
      itens: [{ descricao: "Cota de consórcio revisada", quantidade: 1, precoUnitario: 48000 }],
    });

    expect(v1.versao).toBe(1);
    expect(v2.versao).toBe(2);
    expect(v1.itens[0].preco_total).toBe(50000);

    const propostas = await listarPropostasPorOportunidade(clienteCapital, oportunidade.id);
    expect(propostas.map((p) => p.versao)).toEqual([2, 1]);
  });

  it("RLS impede que outra marca veja ou crie propostas para a oportunidade", async () => {
    const pessoa = await criarPessoaFisica(clienteCapital, {
      nomeCompleto: "Cliente Proposta Isolada",
      marcaEntradaId: 4,
    });
    const oportunidade = await criarOportunidade(clienteCapital, {
      pessoaFisicaId: pessoa.id,
      marcaId: 4,
      produto: "planejamento_patrimonial",
    });
    await criarProposta(clienteCapital, {
      oportunidadeId: oportunidade.id,
      itens: [{ descricao: "Planejamento inicial", quantidade: 1, precoUnitario: 5000 }],
    });

    const propostasVistasPelaAmazon = await listarPropostasPorOportunidade(
      clienteAmazon,
      oportunidade.id
    );
    expect(propostasVistasPelaAmazon).toHaveLength(0);

    await expect(
      criarProposta(clienteAmazon, {
        oportunidadeId: oportunidade.id,
        itens: [{ descricao: "Tentativa cross-marca", quantidade: 1, precoUnitario: 1 }],
      })
    ).rejects.toThrow();
  });

  it("aprovarProposta atualiza o status para aprovada", async () => {
    const pessoa = await criarPessoaFisica(clienteCapital, {
      nomeCompleto: "Cliente Proposta Aprovada",
      marcaEntradaId: 4,
    });
    const oportunidade = await criarOportunidade(clienteCapital, {
      pessoaFisicaId: pessoa.id,
      marcaId: 4,
      produto: "consorcio",
    });
    const proposta = await criarProposta(clienteCapital, {
      oportunidadeId: oportunidade.id,
      itens: [{ descricao: "Cota", quantidade: 1, precoUnitario: 30000 }],
    });

    const aprovada = await aprovarProposta(clienteCapital, proposta.id);
    expect(aprovada.status).toBe("aprovada");
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/commercial/proposta.service.test.ts
```

Expected: FAIL — módulo `./proposta.service` não encontrado.

- [ ] **Step 4: Implementar o serviço**

```typescript
// src/modules/commercial/proposta.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarPropostaSchema, type CriarPropostaInput } from "./proposta.schema";

export type Proposta = Database["public"]["Tables"]["proposta"]["Row"];
export type PropostaItem = Database["public"]["Tables"]["proposta_item"]["Row"];

export async function criarProposta(
  client: SupabaseClient<Database>,
  input: CriarPropostaInput
): Promise<Proposta & { itens: PropostaItem[] }> {
  const dadosValidados = criarPropostaSchema.parse(input);

  const { data: oportunidade, error: erroOportunidade } = await client
    .from("oportunidade")
    .select("marca_id")
    .eq("id", dadosValidados.oportunidadeId)
    .single();

  if (erroOportunidade) throw erroOportunidade;

  const { data: propostasExistentes, error: erroConsulta } = await client
    .from("proposta")
    .select("versao")
    .eq("oportunidade_id", dadosValidados.oportunidadeId)
    .order("versao", { ascending: false })
    .limit(1);

  if (erroConsulta) throw erroConsulta;

  const proximaVersao = (propostasExistentes?.[0]?.versao ?? 0) + 1;

  const { data: proposta, error: erroProposta } = await client
    .from("proposta")
    .insert({
      oportunidade_id: dadosValidados.oportunidadeId,
      marca_id: oportunidade.marca_id,
      versao: proximaVersao,
      validade: dadosValidados.validade ?? null,
      responsavel_id: dadosValidados.responsavelId ?? null,
    })
    .select()
    .single();

  if (erroProposta) throw erroProposta;

  const { data: itens, error: erroItens } = await client
    .from("proposta_item")
    .insert(
      dadosValidados.itens.map((item) => ({
        proposta_id: proposta.id,
        descricao: item.descricao,
        quantidade: item.quantidade,
        preco_unitario: item.precoUnitario,
      }))
    )
    .select();

  if (erroItens) throw erroItens;

  return { ...proposta, itens };
}

export async function listarPropostasPorOportunidade(
  client: SupabaseClient<Database>,
  oportunidadeId: string
): Promise<Proposta[]> {
  const { data, error } = await client
    .from("proposta")
    .select("*")
    .eq("oportunidade_id", oportunidadeId)
    .order("versao", { ascending: false });

  if (error) throw error;
  return data;
}

export async function aprovarProposta(
  client: SupabaseClient<Database>,
  propostaId: string
): Promise<Proposta> {
  const { data, error } = await client
    .from("proposta")
    .update({ status: "aprovada" })
    .eq("id", propostaId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/commercial/proposta.service.test.ts
```

Expected: PASS nos 3 testes.

- [ ] **Step 6: Commit**

```bash
git add src/modules/commercial/proposta.schema.ts src/modules/commercial/proposta.service.ts src/modules/commercial/proposta.service.test.ts
git commit -m "feat(commercial): add versioned proposta service deriving marca_id from oportunidade"
```

---

### Task 7: Serviço de contrato, gerado a partir de proposta aprovada

**Files:**
- Create: `src/modules/commercial/contrato.schema.ts`, `src/modules/commercial/contrato.service.ts`
- Test: `src/modules/commercial/contrato.service.test.ts`

**Interfaces:**
- Consumes: tabela `contrato` (Task 3); `proposta` (Task 2); `SupabaseClient<Database>` (Task 4); `criarOportunidade` (Task 5), `criarProposta`/`aprovarProposta` (Task 6), usados no setup dos testes.
- Produces: `criarContratoSchema` (Zod); `criarContrato(client, input): Promise<Contrato>`; tipo `Contrato`.

- [ ] **Step 1: Escrever o schema de validação**

```typescript
// src/modules/commercial/contrato.schema.ts
import { z } from "zod";

export const criarContratoSchema = z.object({
  propostaId: z.string().uuid(),
});

export type CriarContratoInput = z.infer<typeof criarContratoSchema>;
```

- [ ] **Step 2: Escrever o teste que falha primeiro**

```typescript
// src/modules/commercial/contrato.service.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarPessoaFisica } from "@/modules/identity/pessoa.service";
import { criarOportunidade } from "./oportunidade.service";
import { criarProposta, aprovarProposta } from "./proposta.service";
import { criarContrato } from "./contrato.service";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient<Database>;
let clienteCapital: SupabaseClient<Database>;

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
  clienteCapital = await criarUsuarioDeTeste(
    admin,
    `contrato-capital-${Date.now()}@teste.mcj`,
    "consultor_capital",
    "capital"
  );
});

describe("contrato.service", () => {
  it("recusa gerar contrato a partir de proposta não aprovada", async () => {
    const pessoa = await criarPessoaFisica(clienteCapital, {
      nomeCompleto: "Cliente Contrato Recusado",
      marcaEntradaId: 4,
    });
    const oportunidade = await criarOportunidade(clienteCapital, {
      pessoaFisicaId: pessoa.id,
      marcaId: 4,
      produto: "consorcio",
    });
    const proposta = await criarProposta(clienteCapital, {
      oportunidadeId: oportunidade.id,
      itens: [{ descricao: "Cota", quantidade: 1, precoUnitario: 20000 }],
    });

    await expect(criarContrato(clienteCapital, { propostaId: proposta.id })).rejects.toThrow(
      "Só é possível gerar contrato a partir de uma proposta aprovada"
    );
  });

  it("gera contrato a partir de proposta aprovada e impede um segundo contrato para a mesma proposta", async () => {
    const pessoa = await criarPessoaFisica(clienteCapital, {
      nomeCompleto: "Cliente Contrato Gerado",
      marcaEntradaId: 4,
    });
    const oportunidade = await criarOportunidade(clienteCapital, {
      pessoaFisicaId: pessoa.id,
      marcaId: 4,
      produto: "planejamento_patrimonial",
    });
    const proposta = await criarProposta(clienteCapital, {
      oportunidadeId: oportunidade.id,
      itens: [{ descricao: "Planejamento", quantidade: 1, precoUnitario: 8000 }],
    });
    await aprovarProposta(clienteCapital, proposta.id);

    const contrato = await criarContrato(clienteCapital, { propostaId: proposta.id });

    expect(contrato.oportunidade_id).toBe(oportunidade.id);
    expect(contrato.proposta_id).toBe(proposta.id);
    expect(contrato.marca_id).toBe(4);

    await expect(criarContrato(clienteCapital, { propostaId: proposta.id })).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/commercial/contrato.service.test.ts
```

Expected: FAIL — módulo `./contrato.service` não encontrado.

- [ ] **Step 4: Implementar o serviço**

```typescript
// src/modules/commercial/contrato.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarContratoSchema, type CriarContratoInput } from "./contrato.schema";

export type Contrato = Database["public"]["Tables"]["contrato"]["Row"];

export async function criarContrato(
  client: SupabaseClient<Database>,
  input: CriarContratoInput
): Promise<Contrato> {
  const dadosValidados = criarContratoSchema.parse(input);

  const { data: proposta, error: erroProposta } = await client
    .from("proposta")
    .select("id, oportunidade_id, marca_id, status")
    .eq("id", dadosValidados.propostaId)
    .single();

  if (erroProposta) throw erroProposta;
  if (proposta.status !== "aprovada") {
    throw new Error("Só é possível gerar contrato a partir de uma proposta aprovada");
  }

  const { data: contrato, error: erroContrato } = await client
    .from("contrato")
    .insert({
      oportunidade_id: proposta.oportunidade_id,
      proposta_id: proposta.id,
      marca_id: proposta.marca_id,
    })
    .select()
    .single();

  if (erroContrato) throw erroContrato;
  return contrato;
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/commercial/contrato.service.test.ts
```

Expected: PASS nos 2 testes.

- [ ] **Step 6: Commit**

```bash
git add src/modules/commercial/contrato.schema.ts src/modules/commercial/contrato.service.ts src/modules/commercial/contrato.service.test.ts
git commit -m "feat(commercial): add contrato service, one per approved proposta"
```

---

### Task 8: UI mínima — criar e listar oportunidades

**Files:**
- Create: `src/app/oportunidades/page.tsx`, `src/app/oportunidades/actions.ts`

**Interfaces:**
- Consumes: `criarOportunidade`, `listarOportunidades` (Task 5); `createServerSupabaseClient()` (Task 4).
- Produces: página `/oportunidades` funcional (formulário de criação + lista).

- [ ] **Step 1: Criar a server action**

```typescript
// src/app/oportunidades/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { criarOportunidade } from "@/modules/commercial/oportunidade.service";

export async function criarOportunidadeAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  const pessoaFisicaId = formData.get("pessoaFisicaId");

  await criarOportunidade(client, {
    pessoaFisicaId: pessoaFisicaId ? String(pessoaFisicaId) : undefined,
    marcaId: Number(formData.get("marcaId")),
    produto: String(formData.get("produto")) as "consorcio" | "planejamento_patrimonial",
  });

  revalidatePath("/oportunidades");
}
```

- [ ] **Step 2: Criar a página**

```tsx
// src/app/oportunidades/page.tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listarOportunidades } from "@/modules/commercial/oportunidade.service";
import { criarOportunidadeAction } from "./actions";

export default async function OportunidadesPage() {
  const client = await createServerSupabaseClient();
  const oportunidades = await listarOportunidades(client);

  return (
    <main>
      <h1>Oportunidades</h1>

      <form action={criarOportunidadeAction}>
        <input name="pessoaFisicaId" placeholder="ID da pessoa física" required />
        <input name="marcaId" type="number" placeholder="ID da marca" required />
        <select name="produto" required>
          <option value="consorcio">Consórcio</option>
          <option value="planejamento_patrimonial">Planejamento Patrimonial</option>
        </select>
        <button type="submit">Criar</button>
      </form>

      <ul>
        {oportunidades.map((oportunidade) => (
          <li key={oportunidade.id}>
            {oportunidade.produto} — {oportunidade.etapa} — {oportunidade.status}
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

Acesse `http://localhost:3000/oportunidades` — sem sessão autenticada, a lista deve vir vazia e a criação deve falhar por causa do RLS (mesmo comportamento já validado para `/pessoas` na fundação). Pare o servidor.

- [ ] **Step 4: Rodar a suíte completa uma última vez**

```bash
npm test
npx tsc --noEmit
```

Expected: todos os testes passam (fundação + comercial), `tsc --noEmit` limpo.

- [ ] **Step 5: Commit**

```bash
git add src/app/oportunidades
git commit -m "feat(commercial): add minimal UI to create and list oportunidades"
```
