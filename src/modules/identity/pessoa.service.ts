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
