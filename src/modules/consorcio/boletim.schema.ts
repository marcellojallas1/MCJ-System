import { z } from "zod";

export const extracaoOfertaBoletimSchema = z.object({
  administradoraNome: z.string().min(1),
  planoNome: z.string().min(1),
  creditoMin: z.number().positive(),
  creditoMax: z.number().positive(),
  prazoMeses: z.number().int().positive(),
  taxaAdministracaoPercentual: z.number().nonnegative(),
  comissaoPercentual: z.number().nonnegative(),
  campanhaNome: z.string().optional(),
  campanhaBonusPercentual: z.number().nonnegative().optional(),
});

export type ExtracaoOfertaBoletim = z.infer<typeof extracaoOfertaBoletimSchema>;
