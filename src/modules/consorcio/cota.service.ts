import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { obterContrato } from "@/modules/commercial/contrato.service";
import {
  criarCotaConsorcioSchema,
  registrarPagamentoParcelaSchema,
  type CriarCotaConsorcioInput,
  type RegistrarPagamentoParcelaInput,
} from "./cota.schema";
import { obterCondicaoPorProposta } from "./proposta-consorcio.service";
import { adicionarMeses } from "./datas";

export type CotaConsorcio = Database["public"]["Tables"]["cota_consorcio"]["Row"];
export type ConsorcioParcela = Database["public"]["Tables"]["consorcio_parcela"]["Row"];

export async function criarCotaConsorcio(
  client: SupabaseClient<Database>,
  input: CriarCotaConsorcioInput
): Promise<CotaConsorcio & { parcelas: ConsorcioParcela[] }> {
  const dadosValidados = criarCotaConsorcioSchema.parse(input);

  const contrato = await obterContrato(client, dadosValidados.contratoId);
  if (contrato.status !== "ativo") {
    throw new Error("Só é possível registrar cota para contrato ativo");
  }

  const condicao = await obterCondicaoPorProposta(client, contrato.proposta_id);
  if (!condicao) {
    throw new Error("O contrato não possui condição de consórcio");
  }

  const { data: cotaExistente, error: erroCotaExistente } = await client
    .from("cota_consorcio")
    .select("id")
    .eq("contrato_id", contrato.id)
    .maybeSingle();
  if (erroCotaExistente) throw erroCotaExistente;
  if (cotaExistente) {
    throw new Error("O contrato já possui cota");
  }

  const { data: cota, error: erroCota } = await client
    .from("cota_consorcio")
    .insert({
      contrato_id: contrato.id,
      marca_id: contrato.marca_id,
      administradora_id: condicao.administradora_id,
      plano_id: condicao.plano_id,
      grupo: dadosValidados.grupo,
      numero_cota: dadosValidados.numeroCota,
      credito: condicao.credito,
      prazo_meses: condicao.prazo_meses,
      taxa_administracao_percentual: condicao.taxa_administracao_percentual,
      valor_parcela: dadosValidados.valorParcela,
      data_adesao: dadosValidados.dataAdesao,
    })
    .select()
    .single();
  if (erroCota) throw erroCota;

  const { data: parcelas, error: erroParcelas } = await client
    .from("consorcio_parcela")
    .insert(
      Array.from({ length: cota.prazo_meses }, (_, indice) => ({
        cota_id: cota.id,
        numero: indice + 1,
        vencimento: adicionarMeses(dadosValidados.dataAdesao, indice),
        valor: dadosValidados.valorParcela,
      }))
    )
    .select();
  if (erroParcelas) throw erroParcelas;

  return { ...cota, parcelas: parcelas.sort((a, b) => a.numero - b.numero) };
}

export async function obterCota(
  client: SupabaseClient<Database>,
  cotaId: string
): Promise<CotaConsorcio> {
  const { data, error } = await client
    .from("cota_consorcio")
    .select("*")
    .eq("id", cotaId)
    .single();

  if (error) throw error;
  return data;
}

export async function listarCotas(
  client: SupabaseClient<Database>,
  limite = 50
): Promise<CotaConsorcio[]> {
  const { data, error } = await client
    .from("cota_consorcio")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(limite);

  if (error) throw error;
  return data;
}

export async function listarParcelas(
  client: SupabaseClient<Database>,
  cotaId: string
): Promise<ConsorcioParcela[]> {
  const { data, error } = await client
    .from("consorcio_parcela")
    .select("*")
    .eq("cota_id", cotaId)
    .order("numero");

  if (error) throw error;
  return data;
}

export async function registrarPagamentoParcela(
  client: SupabaseClient<Database>,
  parcelaId: string,
  input: RegistrarPagamentoParcelaInput
): Promise<ConsorcioParcela> {
  const dadosValidados = registrarPagamentoParcelaSchema.parse(input);

  const { data, error } = await client
    .from("consorcio_parcela")
    .update({ status: "paga", pago_em: dadosValidados.pagoEm })
    .eq("id", parcelaId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
