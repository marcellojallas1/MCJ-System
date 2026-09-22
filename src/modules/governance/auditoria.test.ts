// src/modules/governance/auditoria.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { criarPessoaFisica } from "@/modules/identity/pessoa.service";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient;

beforeAll(() => {
  admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
});

describe("auditoria", () => {
  it("registra evento de auditoria ao criar uma pessoa_fisica", async () => {
    const pessoa = await criarPessoaFisica(admin, {
      nomeCompleto: "Pessoa Auditada",
      marcaEntradaId: 4,
    });

    const { data: eventos, error } = await admin
      .from("auditoria_evento")
      .select("*")
      .eq("tabela", "pessoa_fisica")
      .eq("registro_id", pessoa.id);

    if (error) throw error;

    expect(eventos).toHaveLength(1);
    expect(eventos![0].acao).toBe("INSERT");
  });
});
