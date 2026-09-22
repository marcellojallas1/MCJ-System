import { describe, it, expect } from "vitest";
import { processarBoletim } from "./boletim.service";
import type { ExtracaoOfertaBoletim } from "./boletim.schema";

describe("boletim.service", () => {
  it("processarBoletim usa o extrator injetado e retorna os dados extraídos", async () => {
    const extracaoFalsa: ExtracaoOfertaBoletim = {
      administradoraNome: "Administradora Teste",
      planoNome: "Plano 100k",
      creditoMin: 50000,
      creditoMax: 150000,
      prazoMeses: 60,
      taxaAdministracaoPercentual: 18,
      comissaoPercentual: 4,
    };

    const extratorFalso = async (_texto: string) => extracaoFalsa;

    const resultado = await processarBoletim("boletim de teste", extratorFalso);

    expect(resultado).toEqual(extracaoFalsa);
  });

  it("processarBoletim propaga o erro quando o extrator falha", async () => {
    const extratorComErro = async (_texto: string) => {
      throw new Error("falha simulada de extração");
    };

    await expect(processarBoletim("boletim de teste", extratorComErro)).rejects.toThrow(
      "falha simulada de extração"
    );
  });
});
