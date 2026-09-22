import { z } from "zod";

export const criarPropostaSchema = z.object({
  oportunidadeId: z.string().uuid(),
  validade: z.string().optional(),
  responsavelId: z.string().uuid().optional(),
  itens: z
    .array(
      z.object({
        descricao: z.string().min(1),
        quantidade: z.number().positive(),
        precoUnitario: z.number().positive(),
      })
    )
    .min(1),
});

export type CriarPropostaInput = z.infer<typeof criarPropostaSchema>;
