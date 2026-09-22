import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { obterOportunidade } from "@/modules/commercial/oportunidade.service";
import {
  recomendarAdministradorasSchema,
  registrarRecomendacaoSchema,
  type RecomendarAdministradorasInput,
  type RegistrarRecomendacaoInput,
} from "./recomendacao.schema";
import { estaVigente, hojeIso } from "./datas";

// `type` (não `interface`) para ser atribuível a `Json` ao gravar a fotografia.
export type ResultadoRecomendacao = {
  ofertaId: string;
  administradoraId: string;
  administradoraNome: string;
  planoId: string;
  prazoMeses: number;
  comissaoEfetiva: number;
  adequacao: number;
  resultadoComercial: number;
  scoreFinal: number;
};

export interface CalculoRecomendacao {
  politica: { id: string; pesoAdequacao: number; pesoResultadoComercial: number };
  resultados: ResultadoRecomendacao[];
}

type RecomendacaoRow = Database["public"]["Tables"]["recomendacao_consorcio"]["Row"];

export type RecomendacaoRegistrada = Omit<RecomendacaoRow, "resultado"> & {
  resultado: ResultadoRecomendacao[];
};

export async function calcularRecomendacao(
  client: SupabaseClient<Database>,
  input: RecomendarAdministradorasInput
): Promise<CalculoRecomendacao> {
  const dadosValidados = recomendarAdministradorasSchema.parse(input);

  const { data: politicaRow, error: erroPolitica } = await client
    .from("politica_recomendacao_consorcio")
    .select("id, peso_adequacao, peso_resultado_comercial")
    .eq("vigente", true)
    .single();
  if (erroPolitica) throw erroPolitica;

  const politica = {
    id: politicaRow.id,
    pesoAdequacao: politicaRow.peso_adequacao,
    pesoResultadoComercial: politicaRow.peso_resultado_comercial,
  };

  const hoje = hojeIso();

  const { data: ofertas, error: erroOfertas } = await client
    .from("oferta_administradora")
    .select("id, administradora_id, plano_id, comissao_percentual, campanha_id, vigencia_inicio, vigencia_fim")
    .eq("estado", "validado")
    .lte("vigencia_inicio", hoje)
    .or(`vigencia_fim.is.null,vigencia_fim.gte.${hoje}`)
    .order("id")
    .limit(1000);
  if (erroOfertas) throw erroOfertas;
  if (!ofertas || ofertas.length === 0) return { politica, resultados: [] };

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
      ? await client
          .from("campanha_incentivo")
          .select("id, bonus_percentual, vigencia_inicio, vigencia_fim")
          .in("id", campanhaIds)
      : { data: [], error: null };
  if (erroCampanhas) throw erroCampanhas;

  const administradoraPorId = new Map((administradoras ?? []).map((a) => [a.id, a]));
  const planoPorId = new Map((planos ?? []).map((p) => [p.id, p]));
  const campanhaPorId = new Map((campanhas ?? []).map((c) => [c.id, c]));

  const elegiveis = ofertas
    .map((oferta) => {
      const administradora = administradoraPorId.get(oferta.administradora_id);
      const plano = planoPorId.get(oferta.plano_id);
      if (!administradora || !plano) {
        throw new Error(
          `Inconsistência de dados: oferta ${oferta.id} referencia administradora ou plano inexistente`
        );
      }
      if (administradora.situacao !== "ativa") return null;
      if (
        dadosValidados.creditoDesejado < plano.credito_min ||
        dadosValidados.creditoDesejado > plano.credito_max
      )
        return null;

      const campanha = oferta.campanha_id ? campanhaPorId.get(oferta.campanha_id) : undefined;
      const campanhaVigente =
        campanha !== undefined && estaVigente(campanha.vigencia_inicio, campanha.vigencia_fim, hoje);
      const comissaoEfetiva = oferta.comissao_percentual + (campanhaVigente ? campanha.bonus_percentual : 0);

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

  if (elegiveis.length === 0) return { politica, resultados: [] };

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
      politica.pesoAdequacao * adequacao + politica.pesoResultadoComercial * resultadoComercial;

    return { ...oferta, adequacao, resultadoComercial, scoreFinal };
  });

  return { politica, resultados: resultados.sort((a, b) => b.scoreFinal - a.scoreFinal) };
}

export async function recomendarAdministradoras(
  client: SupabaseClient<Database>,
  input: RecomendarAdministradorasInput
): Promise<ResultadoRecomendacao[]> {
  const { resultados } = await calcularRecomendacao(client, input);
  return resultados;
}

export async function registrarRecomendacao(
  client: SupabaseClient<Database>,
  input: RegistrarRecomendacaoInput
): Promise<RecomendacaoRegistrada> {
  const dadosValidados = registrarRecomendacaoSchema.parse(input);

  const oportunidade = await obterOportunidade(client, dadosValidados.oportunidadeId);
  if (oportunidade.produto !== "consorcio") {
    throw new Error("A oportunidade não é de consórcio");
  }

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;

  const { politica, resultados } = await calcularRecomendacao(client, {
    creditoDesejado: dadosValidados.creditoDesejado,
    prazoDesejadoMeses: dadosValidados.prazoDesejadoMeses,
  });

  const { data, error } = await client
    .from("recomendacao_consorcio")
    .insert({
      oportunidade_id: oportunidade.id,
      marca_id: oportunidade.marca_id,
      politica_id: politica.id,
      peso_adequacao: politica.pesoAdequacao,
      peso_resultado_comercial: politica.pesoResultadoComercial,
      credito_desejado: dadosValidados.creditoDesejado,
      prazo_desejado_meses: dadosValidados.prazoDesejadoMeses,
      resultado: resultados,
      criado_por: userData.user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return { ...data, resultado: resultados };
}

export async function listarRecomendacoes(
  client: SupabaseClient<Database>,
  limite = 20
): Promise<RecomendacaoRegistrada[]> {
  const { data, error } = await client
    .from("recomendacao_consorcio")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(limite);

  if (error) throw error;
  return data.map((row) => ({ ...row, resultado: row.resultado as ResultadoRecomendacao[] }));
}
