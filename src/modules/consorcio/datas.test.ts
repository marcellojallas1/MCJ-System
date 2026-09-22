import { describe, it, expect } from "vitest";
import { adicionarMeses, estaVigente, hojeIso, DATA_ISO_REGEX } from "./datas";

describe("adicionarMeses", () => {
  it("soma meses mantendo o dia", () => {
    expect(adicionarMeses("2031-05-10", 1)).toBe("2031-06-10");
    expect(adicionarMeses("2031-05-10", 0)).toBe("2031-05-10");
  });

  it("vira o ano", () => {
    expect(adicionarMeses("2031-11-15", 2)).toBe("2032-01-15");
    expect(adicionarMeses("2031-01-15", 24)).toBe("2033-01-15");
  });

  it("usa o último dia do mês quando o dia não existe no destino", () => {
    expect(adicionarMeses("2031-01-31", 1)).toBe("2031-02-28");
    expect(adicionarMeses("2032-01-31", 1)).toBe("2032-02-29");
    expect(adicionarMeses("2031-03-31", 1)).toBe("2031-04-30");
  });

  it("não acumula o encurtamento ao somar a partir da data original", () => {
    expect(adicionarMeses("2031-01-31", 2)).toBe("2031-03-31");
  });
});

describe("estaVigente", () => {
  it("considera inclusivos o início e o fim", () => {
    expect(estaVigente("2031-01-01", "2031-01-31", "2031-01-01")).toBe(true);
    expect(estaVigente("2031-01-01", "2031-01-31", "2031-01-31")).toBe(true);
  });

  it("fim nulo significa sem prazo", () => {
    expect(estaVigente("2031-01-01", null, "2099-12-31")).toBe(true);
  });

  it("fora da janela não é vigente", () => {
    expect(estaVigente("2031-01-01", "2031-01-31", "2030-12-31")).toBe(false);
    expect(estaVigente("2031-01-01", "2031-01-31", "2031-02-01")).toBe(false);
  });
});

describe("hojeIso", () => {
  it("retorna a data no formato YYYY-MM-DD", () => {
    expect(hojeIso()).toMatch(DATA_ISO_REGEX);
  });
});
