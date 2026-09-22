import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarAdministradora, criarPlanoConsorcio } from "./administradora.service";
import { criarOfertaAdministradora, validarOferta } from "./oferta.service";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient<Database>;
let clienteGestor: SupabaseClient<Database>;
let clienteConsultor: SupabaseClient<Database>;

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
    `oferta-gestor-${Date.now()}@teste.mcj`,
    "gestor_capital",
    "capital"
  );
  clienteConsultor = await criarUsuarioDeTeste(
    admin,
    `oferta-consultor-${Date.now()}@teste.mcj`,
    "consultor_capital",
    "capital"
  );
});

describe("oferta.service", () => {
  it("consultor cria oferta como coletada; gestor valida", async () => {
    const administradora = await criarAdministradora(clienteGestor, {
      nome: `Administradora Oferta ${Date.now()}`,
    });
    const plano = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: administradora.id,
      nomePlano: "Plano Oferta",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 60,
      taxaAdministracaoPercentual: 18,
    });

    const oferta = await criarOfertaAdministradora(clienteConsultor, {
      administradoraId: administradora.id,
      planoId: plano.id,
      comissaoPercentual: 4,
      fonte: "manual",
    });

    expect(oferta.estado).toBe("coletado");
    expect(oferta.validado_por).toBeNull();

    const ofertaValidada = await validarOferta(clienteGestor, oferta.id);

    expect(ofertaValidada.estado).toBe("validado");
    expect(ofertaValidada.validado_por).not.toBeNull();
    expect(ofertaValidada.validado_em).not.toBeNull();
  });

  it("RLS impede que um consultor (não gestor/admin) valide uma oferta", async () => {
    const administradora = await criarAdministradora(clienteGestor, {
      nome: `Administradora Validacao Negada ${Date.now()}`,
    });
    const plano = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: administradora.id,
      nomePlano: "Plano Validacao Negada",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 60,
      taxaAdministracaoPercentual: 18,
    });
    const oferta = await criarOfertaAdministradora(clienteConsultor, {
      administradoraId: administradora.id,
      planoId: plano.id,
      comissaoPercentual: 4,
      fonte: "manual",
    });

    await expect(validarOferta(clienteConsultor, oferta.id)).rejects.toThrow();
  });
});
