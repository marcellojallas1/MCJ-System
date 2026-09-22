import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarPropostaSchema, type CriarPropostaInput } from "./proposta.schema";

export type Proposta = Database["public"]["Tables"]["proposta"]["Row"];
export type PropostaItem = Database["public"]["Tables"]["proposta_item"]["Row"];

export async function criarProposta(
  client: SupabaseClient<Database>,
  input: CriarPropostaInput
): Promise<Proposta & { itens: PropostaItem[] }> {
  const dadosValidados = criarPropostaSchema.parse(input);

  const { data: oportunidade, error: erroOportunidade } = await client
    .from("oportunidade")
    .select("marca_id")
    .eq("id", dadosValidados.oportunidadeId)
    .single();

  if (erroOportunidade) throw erroOportunidade;

  const { data: propostasExistentes, error: erroConsulta } = await client
    .from("proposta")
    .select("versao")
    .eq("oportunidade_id", dadosValidados.oportunidadeId)
    .order("versao", { ascending: false })
    .limit(1);

  if (erroConsulta) throw erroConsulta;

  const proximaVersao = (propostasExistentes?.[0]?.versao ?? 0) + 1;

  const { data: proposta, error: erroProposta } = await client
    .from("proposta")
    .insert({
      oportunidade_id: dadosValidados.oportunidadeId,
      marca_id: oportunidade.marca_id,
      versao: proximaVersao,
      validade: dadosValidados.validade ?? null,
      responsavel_id: dadosValidados.responsavelId ?? null,
    })
    .select()
    .single();

  if (erroProposta) throw erroProposta;

  const { data: itens, error: erroItens } = await client
    .from("proposta_item")
    .insert(
      dadosValidados.itens.map((item) => ({
        proposta_id: proposta.id,
        descricao: item.descricao,
        quantidade: item.quantidade,
        preco_unitario: item.precoUnitario,
      }))
    )
    .select();

  if (erroItens) throw erroItens;

  return { ...proposta, itens };
}

export async function listarPropostasPorOportunidade(
  client: SupabaseClient<Database>,
  oportunidadeId: string
): Promise<Proposta[]> {
  const { data, error } = await client
    .from("proposta")
    .select("*")
    .eq("oportunidade_id", oportunidadeId)
    .order("versao", { ascending: false });

  if (error) throw error;
  return data;
}

export async function aprovarProposta(
  client: SupabaseClient<Database>,
  propostaId: string
): Promise<Proposta> {
  const { data, error } = await client
    .from("proposta")
    .update({ status: "aprovada" })
    .eq("id", propostaId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
