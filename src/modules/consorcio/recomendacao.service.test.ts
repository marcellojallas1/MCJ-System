import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarAdministradora, criarPlanoConsorcio } from "./administradora.service";
import { criarOfertaAdministradora, validarOferta } from "./oferta.service";
import { recomendarAdministradoras } from "./recomendacao.service";

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
  it("classifica ofertas elegíveis por 50% adequação + 50% resultado comercial", async () => {
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
    });
    const ofertaB = await criarOfertaAdministradora(clienteGestor, {
      administradoraId: admB.id,
      planoId: planoB.id,
      comissaoPercentual: 6,
      fonte: "manual",
    });

    await validarOferta(clienteGestor, ofertaA.id);
    await validarOferta(clienteGestor, ofertaB.id);

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
    expect(resultadoB!.resultadoComercial).toBe(1);
    expect(resultadoA!.resultadoComercial).toBe(0);
    expect(resultadoB!.scoreFinal).toBeGreaterThan(resultadoA!.scoreFinal);
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
    });

    const resultado = await recomendarAdministradoras(clienteGestor, {
      creditoDesejado: 100000,
      prazoDesejadoMeses: 60,
    });

    expect(resultado.some((r) => r.ofertaId === ofertaForaFaixa.id)).toBe(false);
    expect(resultado.some((r) => r.ofertaId === ofertaNaoValidada.id)).toBe(false);
  });
});
