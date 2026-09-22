import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { criarPessoaFisica } from "@/modules/identity/pessoa.service";
import { criarOportunidade } from "@/modules/commercial/oportunidade.service";
import { criarProposta, aprovarProposta } from "@/modules/commercial/proposta.service";
import { criarContrato } from "@/modules/commercial/contrato.service";
import {
  criarCotaConsorcio,
  listarCotas,
  listarParcelas,
  registrarPagamentoParcela,
} from "./cota.service";
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
  clienteGestor = await criarUsuarioDeTeste(admin, `cota-gestor-${sufixo}@teste.mcj`, "gestor_capital", "capital");
  clienteConsultor = await criarUsuarioDeTeste(admin, `cota-consultor-${sufixo}@teste.mcj`, "consultor_capital", "capital");
  clienteAmazon = await criarUsuarioDeTeste(admin, `cota-amazon-${sufixo}@teste.mcj`, "consultor_capital", "amazon");
});

function grupoUnico() {
  return `G-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

describe("criarCotaConsorcio", () => {
  it("cria a cota com as condições congeladas da proposta e gera o cronograma de parcelas", async () => {
    const { contrato, administradora, plano } = await prepararContratoConsorcio(
      clienteGestor,
      clienteConsultor,
      { credito: 110000, prazoMeses: 12 }
    );

    const cota = await criarCotaConsorcio(clienteConsultor, {
      contratoId: contrato.id,
      grupo: grupoUnico(),
      numeroCota: "0042",
      valorParcela: 1100,
      dataAdesao: "2031-01-31",
    });

    expect(cota).toMatchObject({
      contrato_id: contrato.id,
      marca_id: 4,
      administradora_id: administradora.id,
      plano_id: plano.id,
      credito: 110000,
      prazo_meses: 12,
      taxa_administracao_percentual: 18,
      status: "ativa",
    });
    expect(cota.parcelas).toHaveLength(12);
    expect(cota.parcelas.map((p) => p.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(cota.parcelas[0].vencimento).toBe("2031-01-31");
    expect(cota.parcelas[1].vencimento).toBe("2031-02-28");
    expect(cota.parcelas[11].vencimento).toBe("2031-12-31");
    expect(cota.parcelas.every((p) => p.valor === 1100 && p.status === "prevista")).toBe(true);

    const cotas = await listarCotas(clienteConsultor);
    expect(cotas.some((c) => c.id === cota.id)).toBe(true);
  });

  it("recusa contrato que não veio de proposta de consórcio", async () => {
    const pessoa = await criarPessoaFisica(clienteConsultor, {
      nomeCompleto: "Cliente Patrimonial Sem Cota",
      marcaEntradaId: 4,
    });
    const oportunidade = await criarOportunidade(clienteConsultor, {
      pessoaFisicaId: pessoa.id,
      marcaId: 4,
      produto: "planejamento_patrimonial",
    });
    const proposta = await criarProposta(clienteConsultor, {
      oportunidadeId: oportunidade.id,
      itens: [{ descricao: "Planejamento", quantidade: 1, precoUnitario: 5000 }],
    });
    await aprovarProposta(clienteConsultor, proposta.id);
    const contrato = await criarContrato(clienteConsultor, { propostaId: proposta.id });

    await expect(
      criarCotaConsorcio(clienteConsultor, {
        contratoId: contrato.id,
        grupo: grupoUnico(),
        numeroCota: "0001",
        valorParcela: 100,
        dataAdesao: "2031-01-10",
      })
    ).rejects.toThrow("O contrato não possui condição de consórcio");
  });

  it("RLS recusa cota com crédito diferente do congelado na proposta (API direta)", async () => {
    const { contrato, administradora, plano } = await prepararContratoConsorcio(
      clienteGestor,
      clienteConsultor,
      { credito: 100000 }
    );

    const { error } = await clienteConsultor.from("cota_consorcio").insert({
      contrato_id: contrato.id,
      marca_id: 4,
      administradora_id: administradora.id,
      plano_id: plano.id,
      grupo: grupoUnico(),
      numero_cota: "0001",
      credito: 150000,
      prazo_meses: plano.prazo_meses,
      taxa_administracao_percentual: plano.taxa_administracao_percentual,
      valor_parcela: 1000,
      data_adesao: "2031-01-10",
    });

    expect(error).not.toBeNull();
  });

  it("RLS impede outra marca de criar cota no contrato", async () => {
    const { contrato } = await prepararContratoConsorcio(clienteGestor, clienteConsultor);

    await expect(
      criarCotaConsorcio(clienteAmazon, {
        contratoId: contrato.id,
        grupo: grupoUnico(),
        numeroCota: "0001",
        valorParcela: 1000,
        dataAdesao: "2031-01-10",
      })
    ).rejects.toThrow();
  });

  it("grant de coluna impede editar as condições da cota via UPDATE", async () => {
    const { contrato } = await prepararContratoConsorcio(clienteGestor, clienteConsultor);
    const cota = await criarCotaConsorcio(clienteConsultor, {
      contratoId: contrato.id,
      grupo: grupoUnico(),
      numeroCota: "0001",
      valorParcela: 1000,
      dataAdesao: "2031-01-10",
    });

    const { error } = await clienteConsultor
      .from("cota_consorcio")
      .update({ credito: 1 })
      .eq("id", cota.id);

    expect(error).not.toBeNull();
  });
});

describe("registrarPagamentoParcela", () => {
  it("marca a parcela como paga com a data de pagamento", async () => {
    const { contrato } = await prepararContratoConsorcio(clienteGestor, clienteConsultor);
    const cota = await criarCotaConsorcio(clienteConsultor, {
      contratoId: contrato.id,
      grupo: grupoUnico(),
      numeroCota: "0001",
      valorParcela: 1000,
      dataAdesao: "2031-01-10",
    });

    const paga = await registrarPagamentoParcela(clienteConsultor, cota.parcelas[0].id, {
      pagoEm: "2031-01-09",
    });
    expect(paga.status).toBe("paga");
    expect(paga.pago_em).toBe("2031-01-09");

    const parcelas = await listarParcelas(clienteConsultor, cota.id);
    expect(parcelas[0].status).toBe("paga");
    expect(parcelas[1].status).toBe("prevista");
  });
});
