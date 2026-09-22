import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarCotaConsorcio, obterCota } from "./cota.service";
import { registrarLance, atualizarStatusLance, registrarContemplacao } from "./lance.service";
import {
  criarClienteAdmin,
  criarUsuarioDeTeste,
  prepararContratoConsorcio,
} from "./test-fixtures";

let clienteGestor: SupabaseClient<Database>;
let clienteConsultor: SupabaseClient<Database>;
let clienteAmazon: SupabaseClient<Database>;

beforeAll(async () => {
  const admin = criarClienteAdmin();
  const sufixo = Date.now();
  clienteGestor = await criarUsuarioDeTeste(admin, `lance-gestor-${sufixo}@teste.mcj`, "gestor_capital", "capital");
  clienteConsultor = await criarUsuarioDeTeste(admin, `lance-consultor-${sufixo}@teste.mcj`, "consultor_capital", "capital");
  clienteAmazon = await criarUsuarioDeTeste(admin, `lance-amazon-${sufixo}@teste.mcj`, "consultor_capital", "amazon");
});

async function criarCotaAtiva() {
  const { contrato } = await prepararContratoConsorcio(clienteGestor, clienteConsultor);
  return criarCotaConsorcio(clienteConsultor, {
    contratoId: contrato.id,
    grupo: `G-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    numeroCota: "0001",
    valorParcela: 1000,
    dataAdesao: "2031-01-10",
  });
}

describe("lances e contemplação", () => {
  it("contemplação por lance marca a cota como contemplada e o lance como vencedor", async () => {
    const cota = await criarCotaAtiva();
    const lance = await registrarLance(clienteConsultor, {
      cotaId: cota.id,
      tipo: "livre",
      valor: 30000,
      assembleiaData: "2031-03-15",
    });
    expect(lance.status).toBe("planejado");

    const ofertado = await atualizarStatusLance(clienteConsultor, lance.id, { status: "ofertado" });
    expect(ofertado.status).toBe("ofertado");

    const contemplacao = await registrarContemplacao(clienteConsultor, {
      cotaId: cota.id,
      data: "2031-03-15",
      modalidade: "lance",
      lanceId: lance.id,
      creditoLiberado: 100000,
    });
    expect(contemplacao.lance_id).toBe(lance.id);

    expect((await obterCota(clienteConsultor, cota.id)).status).toBe("contemplada");
    const { data: lanceRelido, error } = await clienteConsultor
      .from("consorcio_lance")
      .select("status")
      .eq("id", lance.id)
      .single();
    if (error) throw error;
    expect(lanceRelido.status).toBe("vencedor");
  });

  it("contemplação por sorteio; segunda contemplação e novo lance são recusados", async () => {
    const cota = await criarCotaAtiva();

    await registrarContemplacao(clienteConsultor, {
      cotaId: cota.id,
      data: "2031-02-15",
      modalidade: "sorteio",
      creditoLiberado: 100000,
    });
    expect((await obterCota(clienteConsultor, cota.id)).status).toBe("contemplada");

    await expect(
      registrarContemplacao(clienteConsultor, {
        cotaId: cota.id,
        data: "2031-03-15",
        modalidade: "sorteio",
        creditoLiberado: 100000,
      })
    ).rejects.toThrow("Só é possível contemplar uma cota ativa");

    await expect(
      registrarLance(clienteConsultor, {
        cotaId: cota.id,
        tipo: "fixo",
        valor: 10000,
        assembleiaData: "2031-04-15",
      })
    ).rejects.toThrow();
  });

  it("valida a coerência entre modalidade e lanceId", async () => {
    const cota = await criarCotaAtiva();

    await expect(
      registrarContemplacao(clienteConsultor, {
        cotaId: cota.id,
        data: "2031-03-15",
        modalidade: "lance",
        creditoLiberado: 100000,
      })
    ).rejects.toThrow("Contemplação por lance exige lanceId; por sorteio, não");
  });

  it("RLS recusa contemplação com lance de outra cota (API direta)", async () => {
    const cotaA = await criarCotaAtiva();
    const cotaB = await criarCotaAtiva();
    const lanceDaB = await registrarLance(clienteConsultor, {
      cotaId: cotaB.id,
      tipo: "livre",
      valor: 20000,
      assembleiaData: "2031-03-15",
    });

    const { error } = await clienteConsultor.from("consorcio_contemplacao").insert({
      cota_id: cotaA.id,
      data: "2031-03-15",
      modalidade: "lance",
      lance_id: lanceDaB.id,
      credito_liberado: 100000,
    });

    expect(error).not.toBeNull();
    expect((await obterCota(clienteConsultor, cotaA.id)).status).toBe("ativa");
  });

  it("RLS recusa marcar lance como vencedor sem contemplação", async () => {
    const cota = await criarCotaAtiva();
    const lance = await registrarLance(clienteConsultor, {
      cotaId: cota.id,
      tipo: "embutido",
      valor: 15000,
      assembleiaData: "2031-03-15",
    });

    const { error } = await clienteConsultor
      .from("consorcio_lance")
      .update({ status: "vencedor" })
      .eq("id", lance.id);

    expect(error).not.toBeNull();
  });

  it("RLS impede outra marca de registrar lance na cota", async () => {
    const cota = await criarCotaAtiva();

    await expect(
      registrarLance(clienteAmazon, {
        cotaId: cota.id,
        tipo: "livre",
        valor: 10000,
        assembleiaData: "2031-03-15",
      })
    ).rejects.toThrow();
  });

  it("RLS impede rebaixar lance vencedor depois da contemplação", async () => {
    const cota = await criarCotaAtiva();
    const lance = await registrarLance(clienteConsultor, {
      cotaId: cota.id,
      tipo: "livre",
      valor: 25000,
      assembleiaData: "2031-03-15",
    });

    await registrarContemplacao(clienteConsultor, {
      cotaId: cota.id,
      data: "2031-03-15",
      modalidade: "lance",
      lanceId: lance.id,
      creditoLiberado: 100000,
    });

    const { error } = await clienteConsultor
      .from("consorcio_lance")
      .update({ status: "ofertado" })
      .eq("id", lance.id);

    expect(error).not.toBeNull();

    const { data: lanceRelido, error: erroLeitura } = await clienteConsultor
      .from("consorcio_lance")
      .select("status")
      .eq("id", lance.id)
      .single();
    if (erroLeitura) throw erroLeitura;
    expect(lanceRelido.status).toBe("vencedor");
  });
});
