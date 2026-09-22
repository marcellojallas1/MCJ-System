import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  registrarLanceSchema,
  atualizarStatusLanceSchema,
  registrarContemplacaoSchema,
  type RegistrarLanceInput,
  type AtualizarStatusLanceInput,
  type RegistrarContemplacaoInput,
} from "./lance.schema";
import { obterCota } from "./cota.service";

export type ConsorcioLance = Database["public"]["Tables"]["consorcio_lance"]["Row"];
export type ConsorcioContemplacao = Database["public"]["Tables"]["consorcio_contemplacao"]["Row"];

export async function registrarLance(
  client: SupabaseClient<Database>,
  input: RegistrarLanceInput
): Promise<ConsorcioLance> {
  const dadosValidados = registrarLanceSchema.parse(input);

  const { data, error } = await client
    .from("consorcio_lance")
    .insert({
      cota_id: dadosValidados.cotaId,
      tipo: dadosValidados.tipo,
      valor: dadosValidados.valor,
      assembleia_data: dadosValidados.assembleiaData,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function atualizarStatusLance(
  client: SupabaseClient<Database>,
  lanceId: string,
  input: AtualizarStatusLanceInput
): Promise<ConsorcioLance> {
  const dadosValidados = atualizarStatusLanceSchema.parse(input);

  const { data, error } = await client
    .from("consorcio_lance")
    .update({ status: dadosValidados.status })
    .eq("id", lanceId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// A mudança da cota para 'contemplada' e do lance para 'vencedor' é feita
// pelo trigger aplicar_contemplacao, na mesma transação do INSERT.
export async function registrarContemplacao(
  client: SupabaseClient<Database>,
  input: RegistrarContemplacaoInput
): Promise<ConsorcioContemplacao> {
  const dadosValidados = registrarContemplacaoSchema.parse(input);

  const cota = await obterCota(client, dadosValidados.cotaId);
  if (cota.status !== "ativa") {
    throw new Error("Só é possível contemplar uma cota ativa");
  }

  const { data, error } = await client
    .from("consorcio_contemplacao")
    .insert({
      cota_id: dadosValidados.cotaId,
      data: dadosValidados.data,
      modalidade: dadosValidados.modalidade,
      lance_id: dadosValidados.lanceId ?? null,
      credito_liberado: dadosValidados.creditoLiberado,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
