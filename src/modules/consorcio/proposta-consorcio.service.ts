import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { obterOportunidade } from "@/modules/commercial/oportunidade.service";
import {
  criarProposta,
  type Proposta,
  type PropostaItem,
} from "@/modules/commercial/proposta.service";
import {
  criarPropostaConsorcioSchema,
  type CriarPropostaConsorcioInput,
} from "./proposta-consorcio.schema";
import { estaVigente, hojeIso } from "./datas";

export type PropostaConsorcioCondicao =
  Database["public"]["Tables"]["proposta_consorcio_condicao"]["Row"];

export type PropostaConsorcio = Proposta & {
  itens: PropostaItem[];
  condicao: PropostaConsorcioCondicao;
};

export async function criarPropostaConsorcio(
  client: SupabaseClient<Database>,
  input: CriarPropostaConsorcioInput
): Promise<PropostaConsorcio> {
  const dadosValidados = criarPropostaConsorcioSchema.parse(input);
  const hoje = hojeIso();

  const oportunidade = await obterOportunidade(client, dadosValidados.oportunidadeId);
  if (oportunidade.produto !== "consorcio") {
    throw new Error("A oportunidade não é de consórcio");
  }

  if (dadosValidados.recomendacaoId) {
    const { data: recomendacao, error: erroRecomendacao } = await client
      .from("recomendacao_consorcio")
      .select("oportunidade_id")
      .eq("id", dadosValidados.recomendacaoId)
      .single();
    if (erroRecomendacao) throw erroRecomendacao;
    if (recomendacao.oportunidade_id !== oportunidade.id) {
      throw new Error("A recomendação pertence a outra oportunidade");
    }
  }

  const { data: oferta, error: erroOferta } = await client
    .from("oferta_administradora")
    .select("id, administradora_id, plano_id, campanha_id, comissao_percentual, estado, vigencia_inicio, vigencia_fim")
    .eq("id", dadosValidados.ofertaId)
    .single();
  if (erroOferta) throw erroOferta;
  if (oferta.estado !== "validado") {
    throw new Error("Só é possível propor a partir de uma oferta validada");
  }
  if (!estaVigente(oferta.vigencia_inicio, oferta.vigencia_fim, hoje)) {
    throw new Error("A oferta não está vigente");
  }

  const { data: plano, error: erroPlano } = await client
    .from("plano_consorcio_administradora")
    .select("id, nome_plano, credito_min, credito_max, prazo_meses, taxa_administracao_percentual")
    .eq("id", oferta.plano_id)
    .single();
  if (erroPlano) throw erroPlano;
  if (dadosValidados.credito < plano.credito_min || dadosValidados.credito > plano.credito_max) {
    throw new Error("Crédito fora da faixa do plano");
  }

  const { data: administradora, error: erroAdm } = await client
    .from("administradora")
    .select("id, nome, situacao")
    .eq("id", oferta.administradora_id)
    .single();
  if (erroAdm) throw erroAdm;
  if (administradora.situacao !== "ativa") {
    throw new Error("A administradora não está ativa");
  }

  let bonusCampanhaPercentual = 0;
  if (oferta.campanha_id) {
    const { data: campanha, error: erroCampanha } = await client
      .from("campanha_incentivo")
      .select("bonus_percentual, vigencia_inicio, vigencia_fim")
      .eq("id", oferta.campanha_id)
      .single();
    if (erroCampanha) throw erroCampanha;
    if (estaVigente(campanha.vigencia_inicio, campanha.vigencia_fim, hoje)) {
      bonusCampanhaPercentual = campanha.bonus_percentual;
    }
  }

  const proposta = await criarProposta(client, {
    oportunidadeId: oportunidade.id,
    validade: dadosValidados.validade,
    itens: [
      {
        descricao: `Cota de consórcio — ${administradora.nome} / ${plano.nome_plano}`,
        quantidade: 1,
        precoUnitario: dadosValidados.credito,
      },
    ],
  });

  const { data: condicao, error: erroCondicao } = await client
    .from("proposta_consorcio_condicao")
    .insert({
      proposta_id: proposta.id,
      oferta_id: oferta.id,
      recomendacao_id: dadosValidados.recomendacaoId ?? null,
      administradora_id: administradora.id,
      plano_id: plano.id,
      administradora_nome: administradora.nome,
      nome_plano: plano.nome_plano,
      credito: dadosValidados.credito,
      prazo_meses: plano.prazo_meses,
      taxa_administracao_percentual: plano.taxa_administracao_percentual,
      comissao_percentual: oferta.comissao_percentual,
      bonus_campanha_percentual: bonusCampanhaPercentual,
    })
    .select()
    .single();
  if (erroCondicao) throw erroCondicao;

  return { ...proposta, condicao };
}

export async function obterCondicaoPorProposta(
  client: SupabaseClient<Database>,
  propostaId: string
): Promise<PropostaConsorcioCondicao | null> {
  const { data, error } = await client
    .from("proposta_consorcio_condicao")
    .select("*")
    .eq("proposta_id", propostaId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
