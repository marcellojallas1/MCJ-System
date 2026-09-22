import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  criarAdministradora,
  criarPlanoConsorcio,
  criarCampanhaIncentivo,
} from "./administradora.service";
import { criarOfertaAdministradora, validarOferta } from "./oferta.service";
import { recomendarAdministradoras } from "./recomendacao.service";
import { amanhaIso } from "./test-fixtures";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient<Database>;
let clienteGestor: SupabaseClient<Database>;

async function criarUsuarioDeTeste(
  admin: SupabaseClient<Database>,
  email: string,
  papelCodigo: string,
  marcaCodigo: string
): Promise<SupabaseClient<Database>> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "senha-teste-123",
    email_confirm: true,
  });
  if (error) throw error;

  const { data: papel, error: papelError } = await admin
    .from("papel")
    .select("id")
    .eq("codigo", papelCodigo)
    .single();
  if (papelError) throw papelError;

  const { data: marca, error: marcaError } = await admin
    .from("marca")
    .select("id")
    .eq("codigo", marcaCodigo)
    .single();
  if (marcaError) throw marcaError;

  const { error: usuarioInternoError } = await admin.from("usuario_interno").insert({
    id: data.user.id,
    nome: email,
    papel_id: papel.id,
    marca_id: marca.id,
  });
  if (usuarioInternoError) throw usuarioInternoError;

  const cliente = createClient<Database>(SUPABASE_URL, ANON_KEY);
  await cliente.auth.signInWithPassword({ email, password: "senha-teste-123" });
  return cliente;
}

beforeAll(async () => {
  admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY);
  clienteGestor = await criarUsuarioDeTeste(
    admin,
    `recomendacao-gestor-${Date.now()}@teste.mcj`,
    "gestor_capital",
    "capital"
  );
});

describe("recomendacao.service", () => {
  it("classifica ofertas elegíveis pela ponderação vigente de adequação e resultado comercial", async () => {
    const sufixo = Date.now();

    const admA = await criarAdministradora(clienteGestor, { nome: `Administradora A ${sufixo}` });
    const admB = await criarAdministradora(clienteGestor, { nome: `Administradora B ${sufixo}` });

    const planoA = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: admA.id,
      nomePlano: "Plano A",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 60,
      taxaAdministracaoPercentual: 18,
    });
    const planoB = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: admB.id,
      nomePlano: "Plano B",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 80,
      taxaAdministracaoPercentual: 16,
    });

    const ofertaA = await criarOfertaAdministradora(clienteGestor, {
      administradoraId: admA.id,
      planoId: planoA.id,
      comissaoPercentual: 3,
      fonte: "manual",
      vigenciaFim: amanhaIso(),
    });
    const ofertaB = await criarOfertaAdministradora(clienteGestor, {
      administradoraId: admB.id,
      planoId: planoB.id,
      comissaoPercentual: 6,
      fonte: "manual",
      vigenciaFim: amanhaIso(),
    });

    await validarOferta(clienteGestor, ofertaA.id);
    await validarOferta(clienteGestor, ofertaB.id);

    const { data: politica, error: erroPolitica } = await clienteGestor
      .from("politica_recomendacao_consorcio")
      .select("peso_adequacao, peso_resultado_comercial")
      .eq("vigente", true)
      .single();
    if (erroPolitica) throw erroPolitica;

    const resultado = await recomendarAdministradoras(clienteGestor, {
      creditoDesejado: 100000,
      prazoDesejadoMeses: 60,
    });

    const resultadoA = resultado.find((r) => r.ofertaId === ofertaA.id);
    const resultadoB = resultado.find((r) => r.ofertaId === ofertaB.id);

    expect(resultadoA).toBeDefined();
    expect(resultadoB).toBeDefined();
    expect(resultadoA!.adequacao).toBe(1);
    expect(resultadoB!.adequacao).toBeCloseTo(1 - 20 / 60, 5);
    // resultadoComercial é normalizado min-max entre TODAS as ofertas elegíveis
    // no banco (compartilhado entre suítes), então só a ordem relativa e a
    // fórmula de ponderação são verificadas aqui — não valores absolutos.
    expect(resultadoB!.resultadoComercial).toBeGreaterThan(resultadoA!.resultadoComercial);
    for (const r of [resultadoA!, resultadoB!]) {
      expect(r.scoreFinal).toBeCloseTo(
        politica.peso_adequacao * r.adequacao + politica.peso_resultado_comercial * r.resultadoComercial,
        10
      );
    }
  });

  it("exclui ofertas fora da faixa de crédito e ofertas não validadas", async () => {
    const sufixo = Date.now();
    const adm = await criarAdministradora(clienteGestor, {
      nome: `Administradora Fora Faixa ${sufixo}`,
    });

    const planoForaFaixa = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: adm.id,
      nomePlano: "Plano Fora de Faixa",
      creditoMin: 200000,
      creditoMax: 300000,
      prazoMeses: 60,
      taxaAdministracaoPercentual: 18,
    });
    const ofertaForaFaixa = await criarOfertaAdministradora(clienteGestor, {
      administradoraId: adm.id,
      planoId: planoForaFaixa.id,
      comissaoPercentual: 10,
      fonte: "manual",
      vigenciaFim: amanhaIso(),
    });
    await validarOferta(clienteGestor, ofertaForaFaixa.id);

    const planoNaoValidado = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: adm.id,
      nomePlano: "Plano Não Validado",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 60,
      taxaAdministracaoPercentual: 18,
    });
    const ofertaNaoValidada = await criarOfertaAdministradora(clienteGestor, {
      administradoraId: adm.id,
      planoId: planoNaoValidado.id,
      comissaoPercentual: 10,
      fonte: "manual",
      vigenciaFim: amanhaIso(),
    });

    const resultado = await recomendarAdministradoras(clienteGestor, {
      creditoDesejado: 100000,
      prazoDesejadoMeses: 60,
    });

    expect(resultado.some((r) => r.ofertaId === ofertaForaFaixa.id)).toBe(false);
    expect(resultado.some((r) => r.ofertaId === ofertaNaoValidada.id)).toBe(false);
  });

  it("não aplica bônus de campanha vencida à comissão efetiva", async () => {
    const sufixo = Date.now();

    const admComCampanha = await criarAdministradora(clienteGestor, {
      nome: `Administradora Campanha Vencida ${sufixo}`,
    });
    const admSemCampanha = await criarAdministradora(clienteGestor, {
      nome: `Administradora Sem Campanha ${sufixo}`,
    });

    const planoComCampanha = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: admComCampanha.id,
      nomePlano: "Plano Campanha Vencida",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 60,
      taxaAdministracaoPercentual: 18,
    });
    const planoSemCampanha = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: admSemCampanha.id,
      nomePlano: "Plano Sem Campanha",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 60,
      taxaAdministracaoPercentual: 18,
    });

    const campanhaVencida = await criarCampanhaIncentivo(clienteGestor, {
      administradoraId: admComCampanha.id,
      nome: "Campanha Vencida",
      bonusPercentual: 50,
      vigenciaInicio: "2019-01-01",
      vigenciaFim: "2020-12-31",
    });

    const ofertaComCampanha = await criarOfertaAdministradora(clienteGestor, {
      administradoraId: admComCampanha.id,
      planoId: planoComCampanha.id,
      campanhaId: campanhaVencida.id,
      comissaoPercentual: 3,
      fonte: "manual",
      vigenciaFim: amanhaIso(),
    });
    const ofertaSemCampanha = await criarOfertaAdministradora(clienteGestor, {
      administradoraId: admSemCampanha.id,
      planoId: planoSemCampanha.id,
      comissaoPercentual: 4,
      fonte: "manual",
      vigenciaFim: amanhaIso(),
    });

    await validarOferta(clienteGestor, ofertaComCampanha.id);
    await validarOferta(clienteGestor, ofertaSemCampanha.id);

    const resultado = await recomendarAdministradoras(clienteGestor, {
      creditoDesejado: 100000,
      prazoDesejadoMeses: 60,
    });

    const resultadoComCampanha = resultado.find((r) => r.ofertaId === ofertaComCampanha.id);
    const resultadoSemCampanha = resultado.find((r) => r.ofertaId === ofertaSemCampanha.id);

    expect(resultadoComCampanha).toBeDefined();
    expect(resultadoSemCampanha).toBeDefined();
    // Both ofertas share the same prazo (60), so adequacao is identical for both and
    // scoreFinal ordering is driven entirely by resultadoComercial (comissaoEfetiva).
    // Comissão efetiva correta: 3 (sem bônus, campanha vencida) vs 4 (sem campanha) —
    // a sem-campanha deve ranquear melhor. Se o bônus vencido (50) fosse indevidamente
    // aplicado, a comissão efetiva com campanha (3 + 50 = 53) dominaria e inverteria
    // esta comparação, mesmo com outras ofertas elegíveis de outros testes no pool.
    expect(resultadoSemCampanha!.resultadoComercial).toBeGreaterThan(
      resultadoComCampanha!.resultadoComercial
    );
    expect(resultadoSemCampanha!.scoreFinal).toBeGreaterThan(resultadoComCampanha!.scoreFinal);
  });

  it("usa os pesos vigentes em politica_recomendacao_consorcio, não pesos fixos no código", async () => {
    const sufixo = Date.now();

    const admA = await criarAdministradora(clienteGestor, { nome: `Administradora Pesos A ${sufixo}` });
    const admB = await criarAdministradora(clienteGestor, { nome: `Administradora Pesos B ${sufixo}` });

    const planoA = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: admA.id,
      nomePlano: "Plano Pesos A",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 60,
      taxaAdministracaoPercentual: 18,
    });
    const planoB = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: admB.id,
      nomePlano: "Plano Pesos B",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 80,
      taxaAdministracaoPercentual: 16,
    });

    const ofertaA = await criarOfertaAdministradora(clienteGestor, {
      administradoraId: admA.id,
      planoId: planoA.id,
      comissaoPercentual: 3,
      fonte: "manual",
      vigenciaFim: amanhaIso(),
    });
    const ofertaB = await criarOfertaAdministradora(clienteGestor, {
      administradoraId: admB.id,
      planoId: planoB.id,
      comissaoPercentual: 6,
      fonte: "manual",
      vigenciaFim: amanhaIso(),
    });

    await validarOferta(clienteGestor, ofertaA.id);
    await validarOferta(clienteGestor, ofertaB.id);

    const { data: politicaOriginal, error: erroPolitica } = await clienteGestor
      .from("politica_recomendacao_consorcio")
      .select("id, peso_adequacao, peso_resultado_comercial")
      .eq("vigente", true)
      .single();
    if (erroPolitica) throw erroPolitica;

    try {
      const { error: erroUpdate } = await clienteGestor
        .from("politica_recomendacao_consorcio")
        .update({ peso_adequacao: 1, peso_resultado_comercial: 0 })
        .eq("id", politicaOriginal.id);
      if (erroUpdate) throw erroUpdate;

      const resultado = await recomendarAdministradoras(clienteGestor, {
        creditoDesejado: 100000,
        prazoDesejadoMeses: 60,
      });

      const resultadoA = resultado.find((r) => r.ofertaId === ofertaA.id);
      const resultadoB = resultado.find((r) => r.ofertaId === ofertaB.id);

      expect(resultadoA).toBeDefined();
      expect(resultadoB).toBeDefined();
      // With peso_adequacao=1, peso_resultado_comercial=0, A (adequacao=1) must
      // now outrank B (adequacao≈0.667), reversing the first test's ranking —
      // this only holds if the code reads politica from the DB, not a constant.
      expect(resultadoA!.scoreFinal).toBeGreaterThan(resultadoB!.scoreFinal);
    } finally {
      const { error: erroRestaura } = await clienteGestor
        .from("politica_recomendacao_consorcio")
        .update({
          peso_adequacao: politicaOriginal.peso_adequacao,
          peso_resultado_comercial: politicaOriginal.peso_resultado_comercial,
        })
        .eq("id", politicaOriginal.id);
      if (erroRestaura) throw erroRestaura;
    }
  });
});
