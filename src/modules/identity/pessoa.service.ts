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
