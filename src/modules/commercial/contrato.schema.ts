import { z } from "zod";

export const criarContratoSchema = z.object({
  propostaId: z.string().uuid(),
});

export type CriarContratoInput = z.infer<typeof criarContratoSchema>;
