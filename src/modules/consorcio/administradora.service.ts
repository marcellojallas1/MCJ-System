import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  criarAdministradoraSchema,
  criarPlanoConsorcioSchema,
  criarCampanhaIncentivoSchema,
  type CriarAdministradoraInput,
  type CriarPlanoConsorcioInput,
  type CriarCampanhaIncentivoInput,
} from "./administradora.schema";

export type Administradora = Database["public"]["Tables"]["administradora"]["Row"];
export type PlanoConsorcio = Database["public"]["Tables"]["plano_consorcio_administradora"]["Row"];
export type CampanhaIncentivo = Database["public"]["Tables"]["campanha_incentivo"]["Row"];

export async function criarAdministradora(
  client: SupabaseClient<Database>,
  input: CriarAdministradoraInput
): Promise<Administradora> {
  const dadosValidados = criarAdministradoraSchema.parse(input);

  const { data, error } = await client
    .from("administradora")
    .insert({
      nome: dadosValidados.nome,
      cnpj: dadosValidados.cnpj ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listarAdministradoras(
  client: SupabaseClient<Database>
): Promise<Administradora[]> {
  const { data, error } = await client.from("administradora").select("*");
  if (error) throw error;
  return data;
}

export async function criarPlanoConsorcio(
  client: SupabaseClient<Database>,
  input: CriarPlanoConsorcioInput
): Promise<PlanoConsorcio> {
  const dadosValidados = criarPlanoConsorcioSchema.parse(input);

  const { data, error } = await client
    .from("plano_consorcio_administradora")
    .insert({
      administradora_id: dadosValidados.administradoraId,
      nome_plano: dadosValidados.nomePlano,
      credito_min: dadosValidados.creditoMin,
      credito_max: dadosValidados.creditoMax,
      prazo_meses: dadosValidados.prazoMeses,
      taxa_administracao_percentual: dadosValidados.taxaAdministracaoPercentual,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listarPlanosPorAdministradora(
  client: SupabaseClient<Database>,
  administradoraId: string
): Promise<PlanoConsorcio[]> {
  const { data, error } = await client
    .from("plano_consorcio_administradora")
    .select("*")
    .eq("administradora_id", administradoraId);

  if (error) throw error;
  return data;
}

export async function criarCampanhaIncentivo(
  client: SupabaseClient<Database>,
  input: CriarCampanhaIncentivoInput
): Promise<CampanhaIncentivo> {
  const dadosValidados = criarCampanhaIncentivoSchema.parse(input);

  const { data, error } = await client
    .from("campanha_incentivo")
    .insert({
      administradora_id: dadosValidados.administradoraId,
      nome: dadosValidados.nome,
      bonus_percentual: dadosValidados.bonusPercentual,
      vigencia_inicio: dadosValidados.vigenciaInicio,
      vigencia_fim: dadosValidados.vigenciaFim ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
