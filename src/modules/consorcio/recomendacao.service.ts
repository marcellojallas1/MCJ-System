import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  recomendarAdministradorasSchema,
  type RecomendarAdministradorasInput,
} from "./recomendacao.schema";

export interface ResultadoRecomendacao {
  ofertaId: string;
  administradoraId: string;
  administradoraNome: string;
  planoId: string;
  adequacao: number;
  resultadoComercial: number;
  scoreFinal: number;
}

export async function recomendarAdministradoras(
  client: SupabaseClient<Database>,
  input: RecomendarAdministradorasInput
): Promise<ResultadoRecomendacao[]> {
  const dadosValidados = recomendarAdministradorasSchema.parse(input);

  const { data: politica, error: erroPolitica } = await client
    .from("politica_recomendacao_consorcio")
    .select("peso_adequacao, peso_resultado_comercial")
    .eq("vigente", true)
    .single();
  if (erroPolitica) throw erroPolitica;

  const hoje = new Date().toISOString().slice(0, 10);

  const { data: ofertas, error: erroOfertas } = await client
    .from("oferta_administradora")
    .select("id, administradora_id, plano_id, comissao_percentual, campanha_id, vigencia_inicio, vigencia_fim")
    .eq("estado", "validado")
    .lte("vigencia_inicio", hoje)
    .or(`vigencia_fim.is.null,vigencia_fim.gte.${hoje}`);
  if (erroOfertas) throw erroOfertas;
  if (!ofertas || ofertas.length === 0) return [];

  const administradoraIds = [...new Set(ofertas.map((o) => o.administradora_id))];
  const planoIds = [...new Set(ofertas.map((o) => o.plano_id))];
  const campanhaIds = [
    ...new Set(ofertas.map((o) => o.campanha_id).filter((id): id is string => id != null)),
  ];

  const { data: administradoras, error: erroAdm } = await client
    .from("administradora")
    .select("id, nome, situacao")
    .in("id", administradoraIds);
  if (erroAdm) throw erroAdm;

  const { data: planos, error: erroPlanos } = await client
    .from("plano_consorcio_administradora")
    .select("id, credito_min, credito_max, prazo_meses")
    .in("id", planoIds);
  if (erroPlanos) throw erroPlanos;

  const { data: campanhas, error: erroCampanhas } =
    campanhaIds.length > 0
      ? await client.from("campanha_incentivo").select("id, bonus_percentual").in("id", campanhaIds)
      : { data: [], error: null };
  if (erroCampanhas) throw erroCampanhas;

  const administradoraPorId = new Map((administradoras ?? []).map((a) => [a.id, a]));
  const planoPorId = new Map((planos ?? []).map((p) => [p.id, p]));
  const campanhaPorId = new Map((campanhas ?? []).map((c) => [c.id, c]));

  const elegiveis = ofertas
    .map((oferta) => {
      const administradora = administradoraPorId.get(oferta.administradora_id);
      const plano = planoPorId.get(oferta.plano_id);
      if (!administradora || !plano) return null;
      if (administradora.situacao !== "ativa") return null;
      if (
        dadosValidados.creditoDesejado < plano.credito_min ||
        dadosValidados.creditoDesejado > plano.credito_max
      )
        return null;

      const campanha = oferta.campanha_id ? campanhaPorId.get(oferta.campanha_id) : undefined;
      const comissaoEfetiva = oferta.comissao_percentual + (campanha?.bonus_percentual ?? 0);

      return {
        ofertaId: oferta.id,
        administradoraId: administradora.id,
        administradoraNome: administradora.nome,
        planoId: plano.id,
        prazoMeses: plano.prazo_meses,
        comissaoEfetiva,
      };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null);

  if (elegiveis.length === 0) return [];

  const comissoes = elegiveis.map((o) => o.comissaoEfetiva);
  const comissaoMin = Math.min(...comissoes);
  const comissaoMax = Math.max(...comissoes);

  const resultados: ResultadoRecomendacao[] = elegiveis.map((oferta) => {
    const distanciaPrazo = Math.abs(oferta.prazoMeses - dadosValidados.prazoDesejadoMeses);
    const adequacao = Math.max(0, 1 - distanciaPrazo / dadosValidados.prazoDesejadoMeses);

    const resultadoComercial =
      comissaoMax === comissaoMin
        ? 1
        : (oferta.comissaoEfetiva - comissaoMin) / (comissaoMax - comissaoMin);

    const scoreFinal =
      politica.peso_adequacao * adequacao + politica.peso_resultado_comercial * resultadoComercial;

    return {
      ofertaId: oferta.ofertaId,
      administradoraId: oferta.administradoraId,
      administradoraNome: oferta.administradoraNome,
      planoId: oferta.planoId,
      adequacao,
      resultadoComercial,
      scoreFinal,
    };
  });

  return resultados.sort((a, b) => b.scoreFinal - a.scoreFinal);
}
