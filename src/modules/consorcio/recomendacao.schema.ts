import { z } from "zod";

export const recomendarAdministradorasSchema = z.object({
  creditoDesejado: z.number().positive(),
  prazoDesejadoMeses: z.number().int().positive(),
});

export type RecomendarAdministradorasInput = z.infer<typeof recomendarAdministradorasSchema>;
