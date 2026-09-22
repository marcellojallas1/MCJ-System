"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { criarAdministradora } from "@/modules/consorcio/administradora.service";
import { criarOfertaAdministradora } from "@/modules/consorcio/oferta.service";
import { processarBoletim } from "@/modules/consorcio/boletim.service";
import type { ExtracaoOfertaBoletim } from "@/modules/consorcio/boletim.schema";

export async function criarAdministradoraAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  await criarAdministradora(client, {
    nome: String(formData.get("nome")),
  });

  revalidatePath("/administradoras");
}

export async function criarOfertaManualAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  await criarOfertaAdministradora(client, {
    administradoraId: String(formData.get("administradoraId")),
    planoId: String(formData.get("planoId")),
    comissaoPercentual: Number(formData.get("comissaoPercentual")),
    fonte: "manual",
  });

  revalidatePath("/administradoras");
}

export async function extrairBoletimAction(
  textoBoletim: string
): Promise<ExtracaoOfertaBoletim> {
  const client = await createServerSupabaseClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("não autenticado");
  if (textoBoletim.length > 20_000) throw new Error("boletim muito longo");

  return processarBoletim(textoBoletim);
}
