"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { registrarRecomendacao } from "@/modules/consorcio/recomendacao.service";
import { criarPropostaConsorcio } from "@/modules/consorcio/proposta-consorcio.service";
import { criarCotaConsorcio } from "@/modules/consorcio/cota.service";
import { registrarLance, registrarContemplacao } from "@/modules/consorcio/lance.service";

function textoOpcional(formData: FormData, campo: string): string | undefined {
  const valor = formData.get(campo);
  return valor ? String(valor) : undefined;
}

export async function registrarRecomendacaoAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  await registrarRecomendacao(client, {
    oportunidadeId: String(formData.get("oportunidadeId")),
    creditoDesejado: Number(formData.get("creditoDesejado")),
    prazoDesejadoMeses: Number(formData.get("prazoDesejadoMeses")),
  });

  revalidatePath("/consorcio");
}

export async function criarPropostaConsorcioAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  await criarPropostaConsorcio(client, {
    oportunidadeId: String(formData.get("oportunidadeId")),
    ofertaId: String(formData.get("ofertaId")),
    credito: Number(formData.get("credito")),
    recomendacaoId: textoOpcional(formData, "recomendacaoId"),
  });

  revalidatePath("/consorcio");
}

export async function criarCotaConsorcioAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  await criarCotaConsorcio(client, {
    contratoId: String(formData.get("contratoId")),
    grupo: String(formData.get("grupo")),
    numeroCota: String(formData.get("numeroCota")),
    valorParcela: Number(formData.get("valorParcela")),
    dataAdesao: String(formData.get("dataAdesao")),
  });

  revalidatePath("/consorcio");
}

export async function registrarLanceAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  await registrarLance(client, {
    cotaId: String(formData.get("cotaId")),
    tipo: String(formData.get("tipo")) as "livre" | "fixo" | "embutido",
    valor: Number(formData.get("valor")),
    assembleiaData: String(formData.get("assembleiaData")),
  });

  revalidatePath("/consorcio");
}

export async function registrarContemplacaoAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  await registrarContemplacao(client, {
    cotaId: String(formData.get("cotaId")),
    data: String(formData.get("data")),
    modalidade: String(formData.get("modalidade")) as "sorteio" | "lance",
    lanceId: textoOpcional(formData, "lanceId"),
    creditoLiberado: Number(formData.get("creditoLiberado")),
  });

  revalidatePath("/consorcio");
}
