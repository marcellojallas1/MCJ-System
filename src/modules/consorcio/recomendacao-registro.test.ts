import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarPessoaFisica } from "@/modules/identity/pessoa.service";
import { criarOportunidade } from "@/modules/commercial/oportunidade.service";
import { registrarRecomendacao, listarRecomendacoes } from "./recomendacao.service";
import { criarClienteAdmin, criarUsuarioDeTeste, criarOfertaValidada } from "./test-fixtures";

let admin: SupabaseClient<Database>;
let clienteGestor: SupabaseClient<Database>;
let clienteConsultor: SupabaseClient<Database>;
let clienteAmazon: SupabaseClient<Database>;

beforeAll(async () => {
  admin = criarClienteAdmin();
  const sufixo = Date.now();
  clienteGestor = await criarUsuarioDeTeste(admin, `fotografia-gestor-${sufixo}@teste.mcj`, "gestor_capital", "capital");
  clienteConsultor = await criarUsuarioDeTeste(admin, `fotografia-consultor-${sufixo}@teste.mcj`, "consultor_capital", "capital");
  clienteAmazon = await criarUsuarioDeTeste(admin, `fotografia-amazon-${sufixo}@teste.mcj`, "consultor_capital", "amazon");
});

async function criarOportunidadeConsorcio(nome: string) {
  const pessoa = await criarPessoaFisica(clienteConsultor, { nomeCompleto: nome, marcaEntradaId: 4 });
  return criarOportunidade(clienteConsultor, {
    pessoaFisicaId: pessoa.id,
    marcaId: 4,
    produto: "consorcio",
  });
}

describe("registrarRecomendacao", () => {
  it("grava a fotografia com entrada, pesos vigentes e ranking completo", async () => {
    const { oferta } = await criarOfertaValidada(clienteGestor, { prazoMeses: 60 });
    const oportunidade = await criarOportunidadeConsorcio("Cliente Fotografia");

    const { data: politica, error: erroPolitica } = await clienteConsultor
      .from("politica_recomendacao_consorcio")
      .select("id, peso_adequacao, peso_resultado_comercial")
      .eq("vigente", true)
      .single();
    if (erroPolitica) throw erroPolitica;

    const registrada = await registrarRecomendacao(clienteConsultor, {
      oportunidadeId: oportunidade.id,
      creditoDesejado: 100000,
      prazoDesejadoMeses: 60,
    });

    expect(registrada.oportunidade_id).toBe(oportunidade.id);
    expect(registrada.marca_id).toBe(4);
    expect(registrada.politica_id).toBe(politica.id);
    expect(registrada.peso_adequacao).toBe(politica.peso_adequacao);
    expect(registrada.peso_resultado_comercial).toBe(politica.peso_resultado_comercial);
    expect(registrada.credito_desejado).toBe(100000);
    expect(registrada.prazo_desejado_meses).toBe(60);

    const item = registrada.resultado.find((r) => r.ofertaId === oferta.id);
    expect(item).toBeDefined();
    expect(item!.prazoMeses).toBe(60);
    expect(item!.adequacao).toBe(1);

    const scores = registrada.resultado.map((r) => r.scoreFinal);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    const recentes = await listarRecomendacoes(clienteConsultor);
    expect(recentes.some((r) => r.id === registrada.id)).toBe(true);
  });

  it("recusa oportunidade que não é de consórcio", async () => {
    const pessoa = await criarPessoaFisica(clienteConsultor, {
      nomeCompleto: "Cliente Patrimonial Sem Recomendacao",
      marcaEntradaId: 4,
    });
    const oportunidade = await criarOportunidade(clienteConsultor, {
      pessoaFisicaId: pessoa.id,
      marcaId: 4,
      produto: "planejamento_patrimonial",
    });

    await expect(
      registrarRecomendacao(clienteConsultor, {
        oportunidadeId: oportunidade.id,
        creditoDesejado: 100000,
        prazoDesejadoMeses: 60,
      })
    ).rejects.toThrow("A oportunidade não é de consórcio");
  });

  it("a fotografia é imutável: UPDATE via API não altera a linha", async () => {
    const oportunidade = await criarOportunidadeConsorcio("Cliente Fotografia Imutavel");
    const registrada = await registrarRecomendacao(clienteConsultor, {
      oportunidadeId: oportunidade.id,
      creditoDesejado: 100000,
      prazoDesejadoMeses: 60,
    });

    await clienteConsultor
      .from("recomendacao_consorcio")
      .update({ resultado: [], peso_adequacao: 0.9 })
      .eq("id", registrada.id);

    const { data: relida, error } = await admin
      .from("recomendacao_consorcio")
      .select("resultado, peso_adequacao")
      .eq("id", registrada.id)
      .single();
    if (error) throw error;

    expect(relida.peso_adequacao).toBe(registrada.peso_adequacao);
    expect(relida.resultado).toEqual(registrada.resultado);
  });

  it("RLS recusa fotografia com pesos diferentes dos da política vigente", async () => {
    const oportunidade = await criarOportunidadeConsorcio("Cliente Pesos Forjados");
    const { data: politica, error: erroPolitica } = await clienteConsultor
      .from("politica_recomendacao_consorcio")
      .select("id")
      .eq("vigente", true)
      .single();
    if (erroPolitica) throw erroPolitica;
    const { data: userData } = await clienteConsultor.auth.getUser();

    const { error } = await clienteConsultor.from("recomendacao_consorcio").insert({
      oportunidade_id: oportunidade.id,
      marca_id: 4,
      politica_id: politica.id,
      peso_adequacao: 0.9,
      peso_resultado_comercial: 0.1,
      credito_desejado: 100000,
      prazo_desejado_meses: 60,
      resultado: [],
      criado_por: userData.user!.id,
    });

    expect(error).not.toBeNull();
  });

  it("RLS isola a fotografia por marca", async () => {
    const oportunidade = await criarOportunidadeConsorcio("Cliente Fotografia Isolada");
    const registrada = await registrarRecomendacao(clienteConsultor, {
      oportunidadeId: oportunidade.id,
      creditoDesejado: 100000,
      prazoDesejadoMeses: 60,
    });

    const { data: vistasPelaAmazon, error } = await clienteAmazon
      .from("recomendacao_consorcio")
      .select("id")
      .eq("id", registrada.id);
    if (error) throw error;
    expect(vistasPelaAmazon).toHaveLength(0);

    await expect(
      registrarRecomendacao(clienteAmazon, {
        oportunidadeId: oportunidade.id,
        creditoDesejado: 100000,
        prazoDesejadoMeses: 60,
      })
    ).rejects.toThrow();
  });
});
