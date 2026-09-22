import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listarRecomendacoes } from "@/modules/consorcio/recomendacao.service";
import { listarCotas } from "@/modules/consorcio/cota.service";
import {
  registrarRecomendacaoAction,
  criarPropostaConsorcioAction,
  criarCotaConsorcioAction,
  registrarLanceAction,
  registrarContemplacaoAction,
} from "./actions";

export default async function ConsorcioPage() {
  const client = await createServerSupabaseClient();
  const [recomendacoes, cotas] = await Promise.all([
    listarRecomendacoes(client),
    listarCotas(client),
  ]);

  return (
    <main>
      <h1>Consórcio</h1>

      <h2>Recomendar administradoras</h2>
      <form action={registrarRecomendacaoAction}>
        <input name="oportunidadeId" placeholder="ID da oportunidade" required />
        <input name="creditoDesejado" type="number" step="0.01" placeholder="Crédito desejado" required />
        <input name="prazoDesejadoMeses" type="number" placeholder="Prazo desejado (meses)" required />
        <button type="submit">Recomendar</button>
      </form>

      <ul>
        {recomendacoes.map((recomendacao) => (
          <li key={recomendacao.id}>
            {recomendacao.id} — oportunidade {recomendacao.oportunidade_id} — crédito{" "}
            {recomendacao.credito_desejado} / {recomendacao.prazo_desejado_meses} meses — pesos{" "}
            {recomendacao.peso_adequacao}/{recomendacao.peso_resultado_comercial}
            <ol>
              {recomendacao.resultado.slice(0, 3).map((item) => (
                <li key={item.ofertaId}>
                  {item.administradoraNome} — oferta {item.ofertaId} — score {item.scoreFinal.toFixed(3)}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>

      <h2>Criar proposta de consórcio</h2>
      <form action={criarPropostaConsorcioAction}>
        <input name="oportunidadeId" placeholder="ID da oportunidade" required />
        <input name="ofertaId" placeholder="ID da oferta" required />
        <input name="credito" type="number" step="0.01" placeholder="Crédito" required />
        <input name="recomendacaoId" placeholder="ID da recomendação (opcional)" />
        <button type="submit">Criar proposta</button>
      </form>

      <h2>Registrar cota</h2>
      <form action={criarCotaConsorcioAction}>
        <input name="contratoId" placeholder="ID do contrato" required />
        <input name="grupo" placeholder="Grupo" required />
        <input name="numeroCota" placeholder="Número da cota" required />
        <input name="valorParcela" type="number" step="0.01" placeholder="Valor da parcela" required />
        <input name="dataAdesao" type="date" required />
        <button type="submit">Registrar cota</button>
      </form>

      <h2>Registrar lance</h2>
      <form action={registrarLanceAction}>
        <input name="cotaId" placeholder="ID da cota" required />
        <select name="tipo" required>
          <option value="livre">Livre</option>
          <option value="fixo">Fixo</option>
          <option value="embutido">Embutido</option>
        </select>
        <input name="valor" type="number" step="0.01" placeholder="Valor" required />
        <input name="assembleiaData" type="date" required />
        <button type="submit">Registrar lance</button>
      </form>

      <h2>Registrar contemplação</h2>
      <form action={registrarContemplacaoAction}>
        <input name="cotaId" placeholder="ID da cota" required />
        <input name="data" type="date" required />
        <select name="modalidade" required>
          <option value="sorteio">Sorteio</option>
          <option value="lance">Lance</option>
        </select>
        <input name="lanceId" placeholder="ID do lance (se por lance)" />
        <input name="creditoLiberado" type="number" step="0.01" placeholder="Crédito liberado" required />
        <button type="submit">Registrar contemplação</button>
      </form>

      <h2>Cotas</h2>
      <ul>
        {cotas.map((cota) => (
          <li key={cota.id}>
            {cota.id} — grupo {cota.grupo} / cota {cota.numero_cota} — crédito {cota.credito} —{" "}
            {cota.prazo_meses} meses — {cota.status}
          </li>
        ))}
      </ul>
    </main>
  );
}
