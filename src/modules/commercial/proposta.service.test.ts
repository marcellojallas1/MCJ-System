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

  it("RLS impede inserir proposta com oportunidade_id de outra marca via API direta", async () => {
    const pessoaAmazon = await criarPessoaFisica(clienteAmazon, {
      nomeCompleto: "Cliente Amazon Parent Consistency",
      marcaEntradaId: 2,
    });
    const oportunidadeAmazon = await criarOportunidade(clienteAmazon, {
      pessoaFisicaId: pessoaAmazon.id,
      marcaId: 2,
      produto: "consorcio",
    });

    const { error } = await clienteCapital.from("proposta").insert({
      oportunidade_id: oportunidadeAmazon.id,
      marca_id: 4,
      versao: 1,
    });

    expect(error).not.toBeNull();
  });

  it("RLS impede inserir proposta_item em proposta de outra marca via API direta", async () => {
    const pessoaAmazon = await criarPessoaFisica(clienteAmazon, {
      nomeCompleto: "Cliente Amazon Item Cross Marca",
      marcaEntradaId: 2,
    });
    const oportunidadeAmazon = await criarOportunidade(clienteAmazon, {
      pessoaFisicaId: pessoaAmazon.id,
      marcaId: 2,
      produto: "consorcio",
    });
    const propostaAmazon = await criarProposta(clienteAmazon, {
      oportunidadeId: oportunidadeAmazon.id,
      itens: [{ descricao: "Item Amazon", quantidade: 1, precoUnitario: 100 }],
    });

    const { error } = await clienteCapital.from("proposta_item").insert({
      proposta_id: propostaAmazon.id,
      descricao: "Tentativa cross-marca",
      quantidade: 1,
      preco_unitario: 1,
    });

    expect(error).not.toBeNull();
  });
});
