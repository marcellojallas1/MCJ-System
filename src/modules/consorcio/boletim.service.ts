import Anthropic from "@anthropic-ai/sdk";
import { extracaoOfertaBoletimSchema, type ExtracaoOfertaBoletim } from "./boletim.schema";

export type ExtratorBoletim = (textoBoletim: string) => Promise<ExtracaoOfertaBoletim>;

const PROMPT_EXTRACAO = `Você é um assistente que extrai condições comerciais estruturadas de boletins de administradoras de consórcio, separando o dado comercial real de conteúdo de marketing. Responda APENAS com um JSON válido no formato:
{
  "administradoraNome": string,
  "planoNome": string,
  "creditoMin": number,
  "creditoMax": number,
  "prazoMeses": number,
  "taxaAdministracaoPercentual": number,
  "comissaoPercentual": number,
  "campanhaNome": string (opcional, omita se não houver),
  "campanhaBonusPercentual": number (opcional, omita se não houver)
}
Não inclua nenhum texto fora do JSON.`;

export async function extrairOfertaDeBoletimComClaude(
  textoBoletim: string
): Promise<ExtracaoOfertaBoletim> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const resposta = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: PROMPT_EXTRACAO,
    messages: [{ role: "user", content: textoBoletim }],
  });

  const bloco = resposta.content.find((c) => c.type === "text");
  if (!bloco || bloco.type !== "text") {
    throw new Error("Resposta da IA não contém texto extraído");
  }

  const json = JSON.parse(bloco.text);
  return extracaoOfertaBoletimSchema.parse(json);
}

export async function processarBoletim(
  textoBoletim: string,
  extrator: ExtratorBoletim = extrairOfertaDeBoletimComClaude
): Promise<ExtracaoOfertaBoletim> {
  return extrator(textoBoletim);
}
