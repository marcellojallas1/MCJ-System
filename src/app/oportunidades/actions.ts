"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { criarOportunidade } from "@/modules/commercial/oportunidade.service";

export async function criarOportunidadeAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  const pessoaFisicaId = formData.get("pessoaFisicaId");

  await criarOportunidade(client, {
    pessoaFisicaId: pessoaFisicaId ? String(pessoaFisicaId) : undefined,
    marcaId: Number(formData.get("marcaId")),
    produto: String(formData.get("produto")) as "consorcio" | "planejamento_patrimonial",
  });

  revalidatePath("/oportunidades");
}
