import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  criarAdministradora,
  listarAdministradoras,
  criarPlanoConsorcio,
  listarPlanosPorAdministradora,
  criarCampanhaIncentivo,
} from "./administradora.service";

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
    `administradora-gestor-${Date.now()}@teste.mcj`,
    "gestor_capital",
    "capital"
  );
  clienteConsultor = await criarUsuarioDeTeste(
    admin,
    `administradora-consultor-${Date.now()}@teste.mcj`,
    "consultor_capital",
    "capital"
  );
});

describe("administradora.service", () => {
  it("gestor cria administradora e plano; qualquer autenticado lista", async () => {
    const administradora = await criarAdministradora(clienteGestor, {
      nome: `Administradora Teste ${Date.now()}`,
    });

    const plano = await criarPlanoConsorcio(clienteGestor, {
      administradoraId: administradora.id,
      nomePlano: "Plano 100k",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 60,
      taxaAdministracaoPercentual: 18,
    });

    const administradorasVistasPeloConsultor = await listarAdministradoras(clienteConsultor);
    const planosVistosPeloConsultor = await listarPlanosPorAdministradora(
      clienteConsultor,
      administradora.id
    );

    expect(administradorasVistasPeloConsultor.some((a) => a.id === administradora.id)).toBe(true);
    expect(planosVistosPeloConsultor.some((p) => p.id === plano.id)).toBe(true);
  });

  it("RLS impede que um consultor (não gestor/admin) crie administradora", async () => {
    await expect(
      criarAdministradora(clienteConsultor, { nome: `Tentativa Consultor ${Date.now()}` })
    ).rejects.toThrow();
  });

  it("gestor cria campanha de incentivo vinculada a uma administradora", async () => {
    const administradora = await criarAdministradora(clienteGestor, {
      nome: `Administradora Campanha ${Date.now()}`,
    });

    const campanha = await criarCampanhaIncentivo(clienteGestor, {
      administradoraId: administradora.id,
      nome: "Campanha Fim de Ano",
      bonusPercentual: 1.5,
      vigenciaInicio: "2026-01-01",
    });

    expect(campanha.administradora_id).toBe(administradora.id);
    expect(campanha.bonus_percentual).toBe(1.5);
  });
});
