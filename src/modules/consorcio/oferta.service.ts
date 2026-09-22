import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  criarOfertaAdministradoraSchema,
  type CriarOfertaAdministradoraInput,
} from "./oferta.schema";

export type OfertaAdministradora = Database["public"]["Tables"]["oferta_administradora"]["Row"];

export async function criarOfertaAdministradora(
  client: SupabaseClient<Database>,
  input: CriarOfertaAdministradoraInput
): Promise<OfertaAdministradora> {
  const dadosValidados = criarOfertaAdministradoraSchema.parse(input);

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;

  const { data, error } = await client
    .from("oferta_administradora")
    .insert({
      administradora_id: dadosValidados.administradoraId,
      plano_id: dadosValidados.planoId,
      campanha_id: dadosValidados.campanhaId ?? null,
      comissao_percentual: dadosValidados.comissaoPercentual,
      fonte: dadosValidados.fonte,
      texto_origem: dadosValidados.textoOrigem ?? null,
      vigencia_fim: dadosValidados.vigenciaFim ?? null,
      criado_por: userData.user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function validarOferta(
  client: SupabaseClient<Database>,
  ofertaId: string
): Promise<OfertaAdministradora> {
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;

  const { data, error } = await client
    .from("oferta_administradora")
    .update({
      estado: "validado",
      validado_por: userData.user.id,
      validado_em: new Date().toISOString(),
    })
    .eq("id", ofertaId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
