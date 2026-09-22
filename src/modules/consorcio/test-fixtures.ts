import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  criarAdministradora,
  criarPlanoConsorcio,
  criarCampanhaIncentivo,
  type Administradora,
  type PlanoConsorcio,
} from "./administradora.service";
import {
  criarOfertaAdministradora,
  validarOferta,
  type OfertaAdministradora,
} from "./oferta.service";
import { hojeIso } from "./datas";
import { criarPessoaFisica } from "@/modules/identity/pessoa.service";
import { criarOportunidade } from "@/modules/commercial/oportunidade.service";
import { aprovarProposta } from "@/modules/commercial/proposta.service";
import { criarContrato, type Contrato } from "@/modules/commercial/contrato.service";
import { criarPropostaConsorcio, type PropostaConsorcio } from "./proposta-consorcio.service";

export const SUPABASE_URL = "http://127.0.0.1:54321";

export function criarClienteAdmin(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function criarUsuarioDeTeste(
  admin: SupabaseClient<Database>,
  email: string,
  papelCodigo: string,
  marcaCodigo: string
): Promise<SupabaseClient<Database>> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "senha-teste-123",
    email_confirm: true,
  });
  if (error) throw error;

  const { data: papel, error: papelError } = await admin
    .from("papel")
    .select("id")
    .eq("codigo", papelCodigo)
    .single();
  if (papelError) throw papelError;

  const { data: marca, error: marcaError } = await admin
    .from("marca")
    .select("id")
    .eq("codigo", marcaCodigo)
    .single();
  if (marcaError) throw marcaError;

  const { error: usuarioInternoError } = await admin.from("usuario_interno").insert({
    id: data.user.id,
    nome: email,
    papel_id: papel.id,
    marca_id: marca.id,
  });
  if (usuarioInternoError) throw usuarioInternoError;

  const cliente = createClient<Database>(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  await cliente.auth.signInWithPassword({ email, password: "senha-teste-123" });
  return cliente;
}

export interface OpcoesOfertaValidada {
  prazoMeses?: number;
  comissaoPercentual?: number;
  creditoMin?: number;
  creditoMax?: number;
  bonusCampanhaPercentual?: number;
}

export async function criarOfertaValidada(
  clienteGestor: SupabaseClient<Database>,
  opcoes: OpcoesOfertaValidada = {}
): Promise<{ administradora: Administradora; plano: PlanoConsorcio; oferta: OfertaAdministradora }> {
  const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const administradora = await criarAdministradora(clienteGestor, {
    nome: `Administradora Fixture ${sufixo}`,
  });
  const plano = await criarPlanoConsorcio(clienteGestor, {
    administradoraId: administradora.id,
    nomePlano: `Plano Fixture ${sufixo}`,
    creditoMin: opcoes.creditoMin ?? 50000,
    creditoMax: opcoes.creditoMax ?? 150000,
    prazoMeses: opcoes.prazoMeses ?? 60,
    taxaAdministracaoPercentual: 18,
  });
  const campanha =
    opcoes.bonusCampanhaPercentual !== undefined
      ? await criarCampanhaIncentivo(clienteGestor, {
          administradoraId: administradora.id,
          nome: `Campanha Fixture ${sufixo}`,
          bonusPercentual: opcoes.bonusCampanhaPercentual,
          vigenciaInicio: hojeIso(),
        })
      : undefined;
  const ofertaColetada = await criarOfertaAdministradora(clienteGestor, {
    administradoraId: administradora.id,
    planoId: plano.id,
    campanhaId: campanha?.id,
    comissaoPercentual: opcoes.comissaoPercentual ?? 5,
    fonte: "manual",
  });
  const oferta = await validarOferta(clienteGestor, ofertaColetada.id);

  return { administradora, plano, oferta };
}

export async function prepararContratoConsorcio(
  clienteGestor: SupabaseClient<Database>,
  clienteConsultor: SupabaseClient<Database>,
  opcoes: { credito?: number; prazoMeses?: number } = {}
): Promise<{
  administradora: Administradora;
  plano: PlanoConsorcio;
  oferta: OfertaAdministradora;
  proposta: PropostaConsorcio;
  contrato: Contrato;
}> {
  const { administradora, plano, oferta } = await criarOfertaValidada(clienteGestor, {
    prazoMeses: opcoes.prazoMeses ?? 12,
  });
  const pessoa = await criarPessoaFisica(clienteConsultor, {
    nomeCompleto: `Cliente Cota ${Date.now()}`,
    marcaEntradaId: 4,
  });
  const oportunidade = await criarOportunidade(clienteConsultor, {
    pessoaFisicaId: pessoa.id,
    marcaId: 4,
    produto: "consorcio",
  });
  const proposta = await criarPropostaConsorcio(clienteConsultor, {
    oportunidadeId: oportunidade.id,
    ofertaId: oferta.id,
    credito: opcoes.credito ?? 100000,
  });
  await aprovarProposta(clienteConsultor, proposta.id);
  const contrato = await criarContrato(clienteConsultor, { propostaId: proposta.id });

  return { administradora, plano, oferta, proposta, contrato };
}
