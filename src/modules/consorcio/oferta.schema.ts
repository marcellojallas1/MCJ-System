import { z } from "zod";

export const criarOfertaAdministradoraSchema = z.object({
  administradoraId: z.string().uuid(),
  planoId: z.string().uuid(),
  campanhaId: z.string().uuid().optional(),
  comissaoPercentual: z.number().nonnegative(),
  fonte: z.enum(["boletim", "manual"]),
  textoOrigem: z.string().optional(),
  vigenciaFim: z.string().optional(),
});

export type CriarOfertaAdministradoraInput = z.infer<typeof criarOfertaAdministradoraSchema>;
