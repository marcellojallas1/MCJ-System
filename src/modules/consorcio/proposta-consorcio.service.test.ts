import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarPessoaFisica } from "@/modules/identity/pessoa.service";
import { criarOportunidade } from "@/modules/commercial/oportunidade.service";
import { criarProposta, aprovarProposta } from "@/modules/commercial/proposta.service";
import { criarOfertaAdministradora } from "./oferta.service";
import { registrarRecomendacao } from "./recomendacao.service";
import { criarPropostaConsorcio, obterCondicaoPorProposta } from "./proposta-consorcio.service";
import { criarClienteAdmin, criarUsuarioDeTeste, criarOfertaValidada } from "./test-fixtures";

let clienteGestor: SupabaseClient<Database>;
let clienteConsultor: SupabaseClient<Database>;
let clienteAmazon: SupabaseClient<Database>;

beforeAll(async () => {
  const admin = criarClienteAdmin();
  const sufixo = Date.now();
  clienteGestor = await criarUsuarioDeTeste(admin, `prop-cons-gestor-${sufixo}@teste.mcj`, "gestor_capital", "capital");
  clienteConsultor = await criarUsuarioDeTeste(admin, `prop-cons-consultor-${sufixo}@teste.mcj`, "consultor_capital", "capital");
  clienteAmazon = await criarUsuarioDeTeste(admin, `prop-cons-amazon-${sufixo}@teste.mcj`, "consultor_capital", "amazon");
});

async function criarOportunidadeConsorcio(nome: string) {
  const pessoa = await criarPessoaFisica(clienteConsultor, { nomeCompleto: nome, marcaEntradaId: 4 });
  return criarOportunidade(clienteConsultor, {
    pessoaFisicaId: pessoa.id,
    marcaId: 4,
    produto: "consorcio",
  });
}

describe("criarPropostaConsorcio", () => {
  it("cria proposta com item de cota e condição congelada, incluindo bônus de campanha vigente", async () => {
    const { administradora, plano, oferta } = await criarOfertaValidada(clienteGestor, {
      prazoMeses: 72,
      comissaoPercentual: 5,
      bonusCampanhaPercentual: 2,
    });
    const oportunidade = await criarOportunidadeConsorcio("Cliente Proposta Consorcio");

    const proposta = await criarPropostaConsorcio(clienteConsultor, {
      oportunidadeId: oportunidade.id,
      ofertaId: oferta.id,
      credito: 120000,
    });

    expect(proposta.versao).toBe(1);
    expect(proposta.itens).toHaveLength(1);
    expect(proposta.itens[0].preco_total).toBe(120000);
    expect(proposta.itens[0].descricao).toBe(
      `Cota de consórcio — ${administradora.nome} / ${plano.nome_plano}`
    );
    expect(proposta.condicao).toMatchObject({
      proposta_id: proposta.id,
      oferta_id: oferta.id,
      administradora_id: administradora.id,
      plano_id: plano.id,
      administradora_nome: administradora.nome,
      nome_plano: plano.nome_plano,
      credito: 120000,
      prazo_meses: 72,
      taxa_administracao_percentual: 18,
      comissao_percentual: 5,
      bonus_campanha_percentual: 2,
      recomendacao_id: null,
    });
  });

  it("preserva a condição da proposta aprovada mesmo depois que a oferta muda", async () => {
    const { oferta } = await criarOfertaValidada(clienteGestor, { comissaoPercentual: 5 });
    const oportunidade = await criarOportunidadeConsorcio("Cliente Condicao Preservada");
    const proposta = await criarPropostaConsorcio(clienteConsultor, {
      oportunidadeId: oportunidade.id,
      ofertaId: oferta.id,
      credito: 100000,
    });
    await aprovarProposta(clienteConsultor, proposta.id);

    try {
      const { error: erroUpdate } = await clienteGestor
        .from("oferta_administradora")
        .update({ comissao_percentual: 99 })
        .eq("id", oferta.id);
      if (erroUpdate) throw erroUpdate;

      const condicao = await obterCondicaoPorProposta(clienteConsultor, proposta.id);
      expect(condicao!.comissao_percentual).toBe(5);
    } finally {
      const { error: erroRestaurar } = await clienteGestor
        .from("oferta_administradora")
        .update({ comissao_percentual: 5 })
        .eq("id", oferta.id);
      if (erroRestaurar) throw erroRestaurar;
    }
  });

  it("vincula a recomendação da mesma oportunidade e recusa a de outra", async () => {
    const { oferta } = await criarOfertaValidada(clienteGestor);
    const oportunidadeA = await criarOportunidadeConsorcio("Cliente Recomendacao A");
    const oportunidadeB = await criarOportunidadeConsorcio("Cliente Recomendacao B");
    const recomendacaoA = await registrarRecomendacao(clienteConsultor, {
      oportunidadeId: oportunidadeA.id,
      creditoDesejado: 100000,
      prazoDesejadoMeses: 60,
    });

    const propostaA = await criarPropostaConsorcio(clienteConsultor, {
      oportunidadeId: oportunidadeA.id,
      ofertaId: oferta.id,
      credito: 100000,
      recomendacaoId: recomendacaoA.id,
    });
    expect(propostaA.condicao.recomendacao_id).toBe(recomendacaoA.id);

    await expect(
      criarPropostaConsorcio(clienteConsultor, {
        oportunidadeId: oportunidadeB.id,
        ofertaId: oferta.id,
        credito: 100000,
        recomendacaoId: recomendacaoA.id,
      })
    ).rejects.toThrow("A recomendação pertence a outra oportunidade");
  });

  it("recusa oferta não validada e crédito fora da faixa do plano", async () => {
    const { administradora, plano, oferta } = await criarOfertaValidada(clienteGestor);
    const ofertaColetada = await criarOfertaAdministradora(clienteGestor, {
      administradoraId: administradora.id,
      planoId: plano.id,
      comissaoPercentual: 5,
      fonte: "manual",
    });
    const oportunidade = await criarOportunidadeConsorcio("Cliente Oferta Invalida");

    await expect(
      criarPropostaConsorcio(clienteConsultor, {
        oportunidadeId: oportunidade.id,
        ofertaId: ofertaColetada.id,
        credito: 100000,
      })
    ).rejects.toThrow("Só é possível propor a partir de uma oferta validada");

    await expect(
      criarPropostaConsorcio(clienteConsultor, {
        oportunidadeId: oportunidade.id,
        ofertaId: oferta.id,
        credito: 999999999,
      })
    ).rejects.toThrow("Crédito fora da faixa do plano");
  });

  it("RLS recusa condição forjada (comissão diferente da oferta) via API direta", async () => {
    const { administradora, plano, oferta } = await criarOfertaValidada(clienteGestor, {
      comissaoPercentual: 5,
    });
    const oportunidade = await criarOportunidadeConsorcio("Cliente Condicao Forjada");
    const propostaSimples = await criarProposta(clienteConsultor, {
      oportunidadeId: oportunidade.id,
      itens: [{ descricao: "Cota", quantidade: 1, precoUnitario: 100000 }],
    });

    const { error } = await clienteConsultor.from("proposta_consorcio_condicao").insert({
      proposta_id: propostaSimples.id,
      oferta_id: oferta.id,
      administradora_id: administradora.id,
      plano_id: plano.id,
      administradora_nome: administradora.nome,
      nome_plano: plano.nome_plano,
      credito: 100000,
      prazo_meses: plano.prazo_meses,
      taxa_administracao_percentual: plano.taxa_administracao_percentual,
      comissao_percentual: 99,
      bonus_campanha_percentual: 0,
    });

    expect(error).not.toBeNull();
  });

  it("RLS isola a condição por marca", async () => {
    const { oferta } = await criarOfertaValidada(clienteGestor);
    const oportunidade = await criarOportunidadeConsorcio("Cliente Condicao Isolada");
    const proposta = await criarPropostaConsorcio(clienteConsultor, {
      oportunidadeId: oportunidade.id,
      ofertaId: oferta.id,
      credito: 100000,
    });

    expect(await obterCondicaoPorProposta(clienteAmazon, proposta.id)).toBeNull();
  });
});
