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
