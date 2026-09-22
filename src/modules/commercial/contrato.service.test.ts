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
