import { z } from "zod";

export const criarOportunidadeSchema = z
  .object({
    pessoaFisicaId: z.string().uuid().optional(),
    pessoaJuridicaId: z.string().uuid().optional(),
    marcaId: z.number().int().positive(),
    produto: z.enum(["consorcio", "planejamento_patrimonial"]),
    origem: z.string().optional(),
    valorPrevisto: z.number().positive().optional(),
    probabilidade: z.number().int().min(0).max(100).optional(),
    responsavelId: z.string().uuid().optional(),
  })
  .refine((data) => (data.pessoaFisicaId != null) !== (data.pessoaJuridicaId != null), {
    message: "Informe pessoaFisicaId ou pessoaJuridicaId, não ambos nem nenhum",
  });

export type CriarOportunidadeInput = z.infer<typeof criarOportunidadeSchema>;

export const atualizarEtapaOportunidadeSchema = z.object({
  etapa: z.enum(["qualificacao", "diagnostico", "proposta", "negociacao", "encerrada"]),
});

export type AtualizarEtapaOportunidadeInput = z.infer<typeof atualizarEtapaOportunidadeSchema>;
