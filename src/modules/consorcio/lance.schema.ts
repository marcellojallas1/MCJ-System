import { z } from "zod";
import { DATA_ISO_REGEX } from "./datas";

export const registrarLanceSchema = z.object({
  cotaId: z.string().uuid(),
  tipo: z.enum(["livre", "fixo", "embutido"]),
  valor: z.number().positive(),
  assembleiaData: z.string().regex(DATA_ISO_REGEX),
});

export type RegistrarLanceInput = z.infer<typeof registrarLanceSchema>;

// 'vencedor' fica de fora de propósito: só a contemplação produz essa transição.
export const atualizarStatusLanceSchema = z.object({
  status: z.enum(["ofertado", "perdedor"]),
});

export type AtualizarStatusLanceInput = z.infer<typeof atualizarStatusLanceSchema>;

export const registrarContemplacaoSchema = z
  .object({
    cotaId: z.string().uuid(),
    data: z.string().regex(DATA_ISO_REGEX),
    modalidade: z.enum(["sorteio", "lance"]),
    lanceId: z.string().uuid().optional(),
    creditoLiberado: z.number().positive(),
  })
  .refine((dados) => (dados.modalidade === "lance") === (dados.lanceId != null), {
    message: "Contemplação por lance exige lanceId; por sorteio, não",
  });

export type RegistrarContemplacaoInput = z.infer<typeof registrarContemplacaoSchema>;
