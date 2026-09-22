# Fundação: Projeto, Supabase, Identidade Única e RLS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabelecer a base técnica reutilizável do ecossistema MCJ — projeto Next.js, Supabase local, identidade única de pessoa física/jurídica, usuários internos com papel/marca, RLS e auditoria — validada por um fluxo real de criar e listar uma pessoa física, protegido por RLS.

**Architecture:** Aplicação Next.js (App Router, TypeScript) em monólito modular, com Supabase (Postgres local via CLI para desenvolvimento) fornecendo banco, autenticação (com claims customizadas de papel/marca via Auth Hook) e RLS como camada principal de proteção. Módulo `identity` isolado em `src/modules/identity`, reutilizável por todas as marcas nas fases seguintes.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, Supabase (Postgres + Auth + CLI local), `@supabase/ssr` + `@supabase/supabase-js`, Zod, Vitest.

**Spec:** `/Users/MJallas/CRM/docs/superpowers/specs/2026-09-22-piloto-mcj-capital-design.md`

## Global Constraints

- Toda tabela de negócio tem RLS habilitado antes de a task que a cria ser considerada concluída (spec seção 5).
- Nenhuma credencial/chave em texto no código-fonte — sempre via `.env.local`, que fica no `.gitignore`.
- TypeScript em modo `strict`.
- Migrações do Supabase em `supabase/migrations/`, nunca editadas retroativamente — mudança de schema é sempre uma nova migração.
- Ações de negócio relevantes (criar pessoa) passam por validação Zod antes de tocar o banco.

---

### Task 1: Scaffold do projeto Next.js

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `.gitignore`, `.eslintrc` (gerados pelo `create-next-app`)

**Interfaces:**
- Produces: projeto Next.js rodável em `npm run dev`, TypeScript configurado com `strict: true`.

- [ ] **Step 1: Rodar o scaffold**

```bash
cd /Users/MJallas/CRM
npx create-next-app@latest . --typescript --eslint --app --src-dir --import-alias "@/*" --no-tailwind --use-npm
```

Quando perguntar se pode sobrescrever/usar diretório não vazio (por causa do `.git` e `docs/` já existentes), confirme que sim.

- [ ] **Step 2: Confirmar TypeScript strict mode**

Abra `tsconfig.json` e garanta que `"strict": true` está presente em `compilerOptions` (o `create-next-app` já gera assim por padrão; se não estiver, adicione).

- [ ] **Step 3: Rodar o servidor de desenvolvimento para validar o scaffold**

```bash
npm run dev
```

Expected: servidor sobe em `http://localhost:3000` sem erros. Pare o servidor (Ctrl+C) depois de confirmar.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with TypeScript"
```

---

### Task 2: Supabase CLI e stack local

**Files:**
- Create: `supabase/config.toml`, `supabase/.gitignore` (gerados pelo `supabase init`)
- Modify: `.env.local` (novo, não versionado)

**Interfaces:**
- Produces: stack local do Supabase rodando (Postgres, Auth, Storage, Studio) acessível via `http://127.0.0.1:54321`.

- [ ] **Step 1: Inicializar o Supabase no projeto**

```bash
cd /Users/MJallas/CRM
npx supabase init
```

- [ ] **Step 2: Subir a stack local (requer Docker Desktop em execução)**

```bash
npx supabase start
```

Expected: saída no terminal com `API URL`, `anon key` e `service_role key`. Guarde esses valores.

- [ ] **Step 3: Criar `.env.local` com as credenciais locais**

```bash
cat > .env.local <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<cole o "anon key" impresso pelo supabase start>
SUPABASE_SERVICE_ROLE_KEY=<cole o "service_role key" impresso pelo supabase start>
EOF
```

- [ ] **Step 4: Confirmar que `.env.local` está no `.gitignore`**

```bash
grep -q "^.env.local$" .gitignore || echo ".env.local" >> .gitignore
```

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml supabase/.gitignore .gitignore
git commit -m "chore: initialize Supabase local dev stack"
```

---

### Task 3: Migração — núcleo de identidade (marca, pessoa física/jurídica, vínculo)

**Files:**
- Create: `supabase/migrations/20260922000001_identity_core.sql`

**Interfaces:**
- Produces: tabelas `marca`, `pessoa_fisica`, `pessoa_juridica`, `vinculo_pf_pj`; função `next_mcj_id(prefixo text) returns text`. RLS habilitado (sem políticas) em `pessoa_fisica`, `pessoa_juridica` e `vinculo_pf_pj` — políticas reais chegam na Task 5.

- [ ] **Step 1: Escrever a migração**

```sql
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
```

- [ ] **Step 2: Aplicar a migração localmente**

```bash
npx supabase db reset
```

Expected: saída sem erros, terminando com "Finished supabase db reset".

- [ ] **Step 3: Verificar a tabela no Studio local**

Abra `http://127.0.0.1:54323` no navegador, confirme que `marca`, `pessoa_fisica`, `pessoa_juridica` e `vinculo_pf_pj` existem e que `marca` tem 4 linhas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260922000001_identity_core.sql
git commit -m "feat(db): add identity core tables (marca, pessoa_fisica, pessoa_juridica, vinculo_pf_pj)"
```

---

### Task 4: Migração — usuário interno, papel e claims customizadas no JWT

**Files:**
- Create: `supabase/migrations/20260922000002_usuario_papel_claims.sql`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `marca` (Task 3).
- Produces: tabelas `papel`, `usuario_interno`; função `custom_access_token_hook(event jsonb) returns jsonb` registrada como Auth Hook, injetando `papel` e `marca` no JWT do usuário autenticado. RLS habilitado em `marca`/`papel` (leitura liberada a autenticados) e em `usuario_interno` (sem política ainda, nega tudo por padrão).

- [ ] **Step 1: Escrever a migração**

```sql
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
```

- [ ] **Step 2: Registrar o Auth Hook no `supabase/config.toml`**

Adicione ao final do arquivo:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

- [ ] **Step 3: Reaplicar migrações e reiniciar a stack para carregar o hook**

```bash
npx supabase db reset
npx supabase stop
npx supabase start
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260922000002_usuario_papel_claims.sql supabase/config.toml
git commit -m "feat(db): add usuario_interno, papel and custom access token hook"
```

---

### Task 5: Funções auxiliares de RLS e políticas em pessoa_fisica/pessoa_juridica

**Files:**
- Create: `supabase/migrations/20260922000003_rls_identity.sql`

**Interfaces:**
- Consumes: `pessoa_fisica`, `pessoa_juridica`, `marca` (Task 3); claims `papel`/`marca` no JWT (Task 4).
- Produces: funções `public.jwt_papel() returns text`, `public.jwt_marca() returns text`; RLS habilitado e com políticas em `pessoa_fisica` e `pessoa_juridica`.

- [ ] **Step 1: Escrever a migração**

```sql
-- supabase/migrations/20260922000003_rls_identity.sql

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
```

- [ ] **Step 2: Aplicar e verificar**

```bash
npx supabase db reset
```

Expected: sem erros. Confirme no Studio (`http://127.0.0.1:54323` → Authentication → Policies) que as 4 políticas aparecem.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260922000003_rls_identity.sql
git commit -m "feat(db): add RLS policies for pessoa_fisica and pessoa_juridica scoped by marca"
```

---

### Task 6: Clientes Supabase no Next.js (browser e servidor)

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`
- Test: nenhum (wiring de infraestrutura, validado pela Task 7)

**Interfaces:**
- Produces: `createBrowserSupabaseClient(): SupabaseClient` (uso em Client Components), `createServerSupabaseClient(): Promise<SupabaseClient>` (uso em Server Components/Actions).

- [ ] **Step 1: Instalar dependências**

```bash
npm install @supabase/supabase-js @supabase/ssr zod
```

- [ ] **Step 2: Criar o cliente de browser**

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 3: Criar o cliente de servidor**

```typescript
// src/lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase package.json package-lock.json
git commit -m "feat: add Supabase browser and server clients"
```

---

### Task 7: Camada de serviço de pessoa física, com validação e testes de RLS

**Files:**
- Create: `src/modules/identity/pessoa.schema.ts`, `src/modules/identity/pessoa.service.ts`
- Test: `src/modules/identity/pessoa.service.test.ts`

**Interfaces:**
- Consumes: tabela `pessoa_fisica` (Task 3); RLS de `pessoa_fisica` (Task 5); tipo `SupabaseClient` de `@supabase/supabase-js` (instalado na Task 6). O serviço recebe um `SupabaseClient` já autenticado como parâmetro — não instancia cliente próprio, nem chama `createServerSupabaseClient()` diretamente (isso é papel do chamador, ex.: Task 8).
- Produces: `criarPessoaFisicaSchema: ZodSchema`, `criarPessoaFisica(client: SupabaseClient, input: CriarPessoaFisicaInput): Promise<PessoaFisica>`, `listarPessoasFisicas(client: SupabaseClient): Promise<PessoaFisica[]>`, tipo `PessoaFisica`.

- [ ] **Step 1: Instalar Vitest**

```bash
npm install -D vitest dotenv-cli
```

Adicione ao `package.json` em `scripts`: `"test": "vitest run"`.

- [ ] **Step 2: Escrever o schema de validação**

```typescript
// src/modules/identity/pessoa.schema.ts
import { z } from "zod";

export const criarPessoaFisicaSchema = z.object({
  nomeCompleto: z.string().min(3, "Nome completo é obrigatório"),
  cpf: z.string().length(11).optional(),
  email: z.string().email().optional(),
  telefoneWhatsapp: z.string().min(10).optional(),
  marcaEntradaId: z.number().int().positive(),
  origemPrimeiroContato: z.string().optional(),
});

export type CriarPessoaFisicaInput = z.infer<typeof criarPessoaFisicaSchema>;
```

- [ ] **Step 3: Escrever o teste que falha primeiro (RLS + criação)**

```typescript
// src/modules/identity/pessoa.service.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { criarPessoaFisica, listarPessoasFisicas } from "./pessoa.service";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let clienteCapital: SupabaseClient;
let clienteAmazon: SupabaseClient;

async function criarUsuarioDeTeste(
  admin: SupabaseClient,
  email: string,
  papelCodigo: string,
  marcaCodigo: string
): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "senha-teste-123",
    email_confirm: true,
  });
  if (error) throw error;

  const { data: papel } = await admin
    .from("papel")
    .select("id")
    .eq("codigo", papelCodigo)
    .single();
  const { data: marca } = await admin
    .from("marca")
    .select("id")
    .eq("codigo", marcaCodigo)
    .single();

  await admin.from("usuario_interno").insert({
    id: data.user.id,
    nome: email,
    papel_id: papel!.id,
    marca_id: marca!.id,
  });

  const cliente = createClient(SUPABASE_URL, ANON_KEY);
  await cliente.auth.signInWithPassword({ email, password: "senha-teste-123" });
  return cliente;
}

beforeAll(async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  clienteCapital = await criarUsuarioDeTeste(
    admin,
    `capital-${Date.now()}@teste.mcj`,
    "consultor_capital",
    "capital"
  );
  clienteAmazon = await criarUsuarioDeTeste(
    admin,
    `amazon-${Date.now()}@teste.mcj`,
    "consultor_capital",
    "amazon"
  );
});

describe("pessoa.service", () => {
  it("cria uma pessoa física vinculada à marca do usuário autenticado", async () => {
    const pessoa = await criarPessoaFisica(clienteCapital, {
      nomeCompleto: "Cliente Teste Capital",
      marcaEntradaId: 4,
    });

    expect(pessoa.nome_completo).toBe("Cliente Teste Capital");
    expect(pessoa.marca_entrada_id).toBe(4);
  });

  it("RLS impede que um usuário de outra marca veja a pessoa criada", async () => {
    await criarPessoaFisica(clienteCapital, {
      nomeCompleto: "Cliente Somente Capital",
      marcaEntradaId: 4,
    });

    const pessoasVistasPelaCapital = await listarPessoasFisicas(clienteCapital);
    const pessoasVistasPelaAmazon = await listarPessoasFisicas(clienteAmazon);

    expect(
      pessoasVistasPelaCapital.some((p) => p.nome_completo === "Cliente Somente Capital")
    ).toBe(true);
    expect(
      pessoasVistasPelaAmazon.some((p) => p.nome_completo === "Cliente Somente Capital")
    ).toBe(false);
  });
});
```

- [ ] **Step 4: Rodar o teste e confirmar que falha (módulo ainda não existe)**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/identity/pessoa.service.test.ts
```

Expected: FAIL com erro de módulo `./pessoa.service` não encontrado.

- [ ] **Step 5: Implementar o serviço**

```typescript
// src/modules/identity/pessoa.service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarPessoaFisicaSchema, type CriarPessoaFisicaInput } from "./pessoa.schema";

export interface PessoaFisica {
  id: string;
  mcj_id: string;
  nome_completo: string;
  cpf: string | null;
  data_nascimento: string | null;
  email: string | null;
  telefone_whatsapp: string | null;
  marca_entrada_id: number;
  origem_primeiro_contato: string | null;
  criado_em: string;
  atualizado_em: string;
}

export async function criarPessoaFisica(
  client: SupabaseClient,
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
  return data as PessoaFisica;
}

export async function listarPessoasFisicas(client: SupabaseClient): Promise<PessoaFisica[]> {
  const { data, error } = await client.from("pessoa_fisica").select("*");
  if (error) throw error;
  return data as PessoaFisica[];
}
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/identity/pessoa.service.test.ts
```

Expected: PASS nos dois testes.

- [ ] **Step 7: Commit**

```bash
git add src/modules/identity package.json package-lock.json
git commit -m "feat(identity): add pessoa_fisica service with RLS-verified tests"
```

---

### Task 8: UI mínima — criar e listar pessoa física

**Files:**
- Create: `src/app/pessoas/page.tsx`, `src/app/pessoas/actions.ts`

**Interfaces:**
- Consumes: `criarPessoaFisica`, `listarPessoasFisicas` (Task 7); `createServerSupabaseClient()` (Task 6).
- Produces: página `/pessoas` funcional (formulário de criação + lista).

- [ ] **Step 1: Criar a server action**

```typescript
// src/app/pessoas/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { criarPessoaFisica } from "@/modules/identity/pessoa.service";

export async function criarPessoaFisicaAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  await criarPessoaFisica(client, {
    nomeCompleto: String(formData.get("nomeCompleto")),
    marcaEntradaId: Number(formData.get("marcaEntradaId")),
  });

  revalidatePath("/pessoas");
}
```

- [ ] **Step 2: Criar a página**

```tsx
// src/app/pessoas/page.tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listarPessoasFisicas } from "@/modules/identity/pessoa.service";
import { criarPessoaFisicaAction } from "./actions";

export default async function PessoasPage() {
  const client = await createServerSupabaseClient();
  const pessoas = await listarPessoasFisicas(client);

  return (
    <main>
      <h1>Pessoas físicas</h1>

      <form action={criarPessoaFisicaAction}>
        <input name="nomeCompleto" placeholder="Nome completo" required />
        <input name="marcaEntradaId" type="number" placeholder="ID da marca" required />
        <button type="submit">Criar</button>
      </form>

      <ul>
        {pessoas.map((pessoa) => (
          <li key={pessoa.id}>
            {pessoa.mcj_id} — {pessoa.nome_completo}
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

Acesse `http://localhost:3000/pessoas` — sem sessão autenticada, a lista deve vir vazia e a criação deve falhar por causa do RLS (nenhum usuário logado ainda). Isso confirma que o RLS está bloqueando por padrão. Pare o servidor.

- [ ] **Step 4: Commit**

```bash
git add src/app/pessoas
git commit -m "feat(identity): add minimal UI to create and list pessoa_fisica"
```

---

### Task 9: Auditoria — trigger genérico em pessoa_fisica e pessoa_juridica

**Files:**
- Create: `supabase/migrations/20260922000004_auditoria.sql`
- Test: `src/modules/governance/auditoria.test.ts`

**Interfaces:**
- Consumes: `pessoa_fisica`, `pessoa_juridica` (Task 3); `public.jwt_papel()` (Task 5), usado na política de leitura de `auditoria_evento`.
- Produces: tabela `auditoria_evento`; função de trigger `public.registrar_auditoria()`; triggers em `pessoa_fisica` e `pessoa_juridica`.

- [ ] **Step 1: Escrever a migração**

```sql
-- supabase/migrations/20260922000004_auditoria.sql

create table auditoria_evento (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id uuid not null,
  acao text not null,
  dados_anteriores jsonb,
  dados_novos jsonb,
  autor_id uuid references auth.users(id),
  criado_em timestamptz not null default now()
);

alter table auditoria_evento enable row level security;

create policy "select_auditoria_admin"
on auditoria_evento for select
to authenticated
using (public.jwt_papel() = 'admin');

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.auditoria_evento (tabela, registro_id, acao, dados_anteriores, dados_novos, autor_id)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

create trigger pessoa_fisica_auditoria
after insert or update or delete on pessoa_fisica
for each row execute function public.registrar_auditoria();

create trigger pessoa_juridica_auditoria
after insert or update or delete on pessoa_juridica
for each row execute function public.registrar_auditoria();
```

- [ ] **Step 2: Aplicar a migração**

```bash
npx supabase db reset
```

- [ ] **Step 3: Escrever o teste que falha primeiro**

```typescript
// src/modules/governance/auditoria.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { criarPessoaFisica } from "@/modules/identity/pessoa.service";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient;

beforeAll(() => {
  admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
});

describe("auditoria", () => {
  it("registra evento de auditoria ao criar uma pessoa_fisica", async () => {
    const pessoa = await criarPessoaFisica(admin, {
      nomeCompleto: "Pessoa Auditada",
      marcaEntradaId: 4,
    });

    const { data: eventos, error } = await admin
      .from("auditoria_evento")
      .select("*")
      .eq("tabela", "pessoa_fisica")
      .eq("registro_id", pessoa.id);

    if (error) throw error;

    expect(eventos).toHaveLength(1);
    expect(eventos![0].acao).toBe("INSERT");
  });
});
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/governance/auditoria.test.ts
```

Expected: FAIL — nenhum evento em `auditoria_evento` (migração ainda não aplicada na sessão de teste, ou tabela vazia por outro motivo). Se a migração já foi aplicada no Step 2 e o teste passar de primeira, prossiga normalmente — o objetivo do ciclo é confirmar o comportamento, não forçar uma falha artificial.

- [ ] **Step 5: Confirmar que o teste passa após a migração aplicada**

```bash
npx dotenv -e .env.local -- npx vitest run src/modules/governance/auditoria.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260922000004_auditoria.sql src/modules/governance
git commit -m "feat(governance): add auditoria_evento table and triggers on pessoa tables"
```

---

## Próximos planos (fora deste documento)

Após esta fundação estar completa e testada, os próximos planos, nesta ordem, reaproveitando o que foi construído aqui:

1. **Comercial core** — `oportunidade`, `proposta`/`proposta_item` (versionada), `contrato`.
2. **Motor de Monitoramento e Recomendação de Administradoras** — `administradora`, `oferta_administradora`, ingestão assistida por IA de boletins, cálculo 50/50.
3. **Fluxo Consórcio** — `cota_consorcio`, `consorcio_parcela`, `consorcio_lance`, `consorcio_contemplacao`, integrado ao motor de recomendação.
4. **Fluxo Planejamento Patrimonial** — `plano_patrimonial`, `plano_patrimonial_revisao`, comparador de benchmarks (CDI/Tesouro/Ibovespa).
