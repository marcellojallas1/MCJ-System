"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { criarPessoaFisica } from "@/modules/identity/pessoa.service";

export async function criarPessoaFisicaAction(formData: FormData) {
  const client = await createServerSupabaseClient();

  await criarPessoaFisica(client, {
    nomeCompleto: String(formData.get("nomeCompleto")),
    marcaEntradaId: Number(formData.get("marcaEntradaId")),
  });

  revalidatePath("/pessoas");
}
