import { z } from "zod";
import { DATA_ISO_REGEX } from "./datas";

export const criarCotaConsorcioSchema = z.object({
  contratoId: z.string().uuid(),
  grupo: z.string().min(1),
  numeroCota: z.string().min(1),
  valorParcela: z.number().positive(),
  dataAdesao: z.string().regex(DATA_ISO_REGEX),
});

export type CriarCotaConsorcioInput = z.infer<typeof criarCotaConsorcioSchema>;

export const registrarPagamentoParcelaSchema = z.object({
  pagoEm: z.string().regex(DATA_ISO_REGEX),
});

export type RegistrarPagamentoParcelaInput = z.infer<typeof registrarPagamentoParcelaSchema>;
