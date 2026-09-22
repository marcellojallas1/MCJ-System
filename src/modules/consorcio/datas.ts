export const DATA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function estaVigente(inicio: string, fim: string | null, hoje: string): boolean {
  return inicio <= hoje && (fim === null || fim >= hoje);
}

export function adicionarMeses(dataIso: string, meses: number): string {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const indiceMesAlvo = mes - 1 + meses;
  const anoAlvo = ano + Math.floor(indiceMesAlvo / 12);
  const mesAlvo = ((indiceMesAlvo % 12) + 12) % 12;
  const ultimoDiaDoMes = new Date(Date.UTC(anoAlvo, mesAlvo + 1, 0)).getUTCDate();
  const diaAlvo = Math.min(dia, ultimoDiaDoMes);
  return `${anoAlvo}-${String(mesAlvo + 1).padStart(2, "0")}-${String(diaAlvo).padStart(2, "0")}`;
}
