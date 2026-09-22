import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listarOportunidades } from "@/modules/commercial/oportunidade.service";
import { criarOportunidadeAction } from "./actions";

export default async function OportunidadesPage() {
  const client = await createServerSupabaseClient();
  const oportunidades = await listarOportunidades(client);

  return (
    <main>
      <h1>Oportunidades</h1>

      <form action={criarOportunidadeAction}>
        <input name="pessoaFisicaId" placeholder="ID da pessoa física" required />
        <input name="marcaId" type="number" placeholder="ID da marca" required />
        <select name="produto" required>
          <option value="consorcio">Consórcio</option>
          <option value="planejamento_patrimonial">Planejamento Patrimonial</option>
        </select>
        <button type="submit">Criar</button>
      </form>

      <ul>
        {oportunidades.map((oportunidade) => (
          <li key={oportunidade.id}>
            {oportunidade.produto} — {oportunidade.etapa} — {oportunidade.status}
          </li>
        ))}
      </ul>
    </main>
  );
}
