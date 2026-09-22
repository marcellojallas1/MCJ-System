import { z } from "zod";
import { DATA_ISO_REGEX } from "./datas";

export const criarPropostaConsorcioSchema = z.object({
  oportunidadeId: z.string().uuid(),
  ofertaId: z.string().uuid(),
  credito: z.number().positive(),
  recomendacaoId: z.string().uuid().optional(),
  validade: z.string().regex(DATA_ISO_REGEX).optional(),
});

export type CriarPropostaConsorcioInput = z.infer<typeof criarPropostaConsorcioSchema>;
