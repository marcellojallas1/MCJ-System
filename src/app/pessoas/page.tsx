import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listarPessoasFisicas } from "@/modules/identity/pessoa.service";
import { criarPessoaFisicaAction } from "./actions";

export default async function PessoasPage() {
  const client = await createServerSupabaseClient();
  const pessoas = await listarPessoasFisicas(client);

  return (
    <main>
      <h1>Pessoas físicas</h1>

      <form action={criarPessoaFisicaAction}>
        <input name="nomeCompleto" placeholder="Nome completo" required />
        <input name="marcaEntradaId" type="number" placeholder="ID da marca" required />
        <button type="submit">Criar</button>
      </form>

      <ul>
        {pessoas.map((pessoa) => (
          <li key={pessoa.id}>
            {pessoa.mcj_id} — {pessoa.nome_completo}
          </li>
        ))}
      </ul>
    </main>
  );
}
