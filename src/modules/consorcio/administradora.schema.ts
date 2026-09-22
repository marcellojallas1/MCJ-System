import { z } from "zod";

export const criarAdministradoraSchema = z.object({
  nome: z.string().min(1),
  cnpj: z.string().optional(),
});

export type CriarAdministradoraInput = z.infer<typeof criarAdministradoraSchema>;

export const criarPlanoConsorcioSchema = z
  .object({
    administradoraId: z.string().uuid(),
    nomePlano: z.string().min(1),
    creditoMin: z.number().positive(),
    creditoMax: z.number().positive(),
    prazoMeses: z.number().int().positive(),
    taxaAdministracaoPercentual: z.number().nonnegative(),
  })
  .refine((data) => data.creditoMax >= data.creditoMin, {
    message: "creditoMax deve ser maior ou igual a creditoMin",
  });

export type CriarPlanoConsorcioInput = z.infer<typeof criarPlanoConsorcioSchema>;

export const criarCampanhaIncentivoSchema = z.object({
  administradoraId: z.string().uuid(),
  nome: z.string().min(1),
  bonusPercentual: z.number().nonnegative(),
  vigenciaInicio: z.string(),
  vigenciaFim: z.string().optional(),
});

export type CriarCampanhaIncentivoInput = z.infer<typeof criarCampanhaIncentivoSchema>;
