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
