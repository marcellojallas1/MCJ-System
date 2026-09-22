import { z } from "zod";

export const criarPessoaFisicaSchema = z.object({
  nomeCompleto: z.string().min(3, "Nome completo é obrigatório"),
  cpf: z.string().length(11).optional(),
  email: z.string().email().optional(),
  telefoneWhatsapp: z.string().min(10).optional(),
  marcaEntradaId: z.number().int().positive(),
  origemPrimeiroContato: z.string().optional(),
});

export type CriarPessoaFisicaInput = z.infer<typeof criarPessoaFisicaSchema>;
