import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listarAdministradoras } from "@/modules/consorcio/administradora.service";
import { criarAdministradoraAction, criarOfertaManualAction } from "./actions";

export default async function AdministradorasPage() {
  const client = await createServerSupabaseClient();
  const administradoras = await listarAdministradoras(client);

  return (
    <main>
      <h1>Administradoras de Consórcio</h1>

      <form action={criarAdministradoraAction}>
        <input name="nome" placeholder="Nome da administradora" required />
        <button type="submit">Criar administradora</button>
      </form>

      <ul>
        {administradoras.map((administradora) => (
          <li key={administradora.id}>
            {administradora.nome} — {administradora.situacao}
          </li>
        ))}
      </ul>

      <h2>Registrar oferta manualmente</h2>
      <form action={criarOfertaManualAction}>
        <input name="administradoraId" placeholder="ID da administradora" required />
        <input name="planoId" placeholder="ID do plano" required />
        <input name="comissaoPercentual" type="number" step="0.01" placeholder="Comissão %" required />
        <button type="submit">Registrar oferta</button>
      </form>
    </main>
  );
}
