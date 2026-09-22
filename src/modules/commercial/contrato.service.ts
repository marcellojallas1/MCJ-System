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

export async function obterContrato(
  client: SupabaseClient<Database>,
  contratoId: string
): Promise<Contrato> {
  const { data, error } = await client
    .from("contrato")
    .select("*")
    .eq("id", contratoId)
    .single();

  if (error) throw error;
  return data;
}
