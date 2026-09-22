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
