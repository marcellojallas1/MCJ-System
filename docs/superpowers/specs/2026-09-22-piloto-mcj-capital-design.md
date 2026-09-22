# Design: Piloto do Ecossistema MCJ — Consórcio e Planejamento Patrimonial (MCJ Capital)

**Data:** 2026-09-22
**Status:** Em revisão
**Escopo:** Primeira fatia vertical (piloto) do sistema completo do Grupo MCJ

## 1. Contexto

O Grupo MCJ definiu uma especificação funcional completa em 8 documentos (Itens 1 a 8, disponíveis em `_Claude/CRM` no OneDrive), cobrindo arquitetura das marcas, jornada do cliente, modelo de dados do CRM, estrutura comercial, catálogo/precificação, operação pós-contratação, governança e arquitetura tecnológica. Esses documentos são a fonte de verdade das regras de negócio; este spec traduz um subconjunto deles — o piloto — em uma arquitetura técnica concreta e construível.

O objetivo do piloto é validar a espinha dorsal reutilizável do sistema (identidade única, CRM, catálogo, proposta/contrato, financeiro, permissões, auditoria) através de uma fatia vertical completa e comercialmente relevante, antes de expandir para as demais marcas e jornadas.

## 2. Decisões já aprovadas

| Decisão | Escolha |
|---|---|
| Marca piloto | MCJ Capital |
| Produtos do piloto | Consórcio + Planejamento Patrimonial |
| Fase seguinte (não bloqueia o piloto) | Viana Seguros e Amazon Mobility (Assinatura PF), em paralelo |
| Fora do piloto | Ciclo imobiliário completo (aquisição, preparação, administração/locação, reservas, canais externos) |
| Infraestrutura de dados | Supabase (Postgres gerenciado + Auth + Storage + Row Level Security) |
| Frontend/Backend | Next.js (App Router) + TypeScript + React, monólito modular (um único app, módulos internos por domínio) |
| Deploy | Vercel (app) + Supabase Cloud (dados/auth/storage) |
| Orquestração de integrações externas | Adiada (n8n como candidato futuro); piloto não depende disso |
| IA de agentes | Claude API, com escopo mínimo no piloto |
| Repositório de código | `/Users/MJallas/CRM` (separado da pasta de planejamento no OneDrive) |

## 3. Arquitetura geral

### 3.1 Stack

- **Frontend + Backend**: Next.js (App Router), TypeScript, React Server Components para leitura e Server Actions para mutações.
- **Banco de dados**: Supabase Postgres — um projeto Supabase por ambiente (dev, staging, produção), conforme Item 8.9.2.
- **Autenticação**: Supabase Auth, com MFA obrigatório para papéis internos/administrativos (Item 8.8.5). Claims customizadas no JWT carregando papel, marca(s) autorizada(s) e unidade/equipe.
- **Storage**: Supabase Storage para o Cofre Documental (Item 6.5.10), com buckets segregados por classificação de confidencialidade.
- **Segredos de terceiros** (credenciais de administradoras, chaves de API): Supabase Vault (armazenamento criptografado dentro do Postgres), nunca expostos em texto a agentes de IA ou logs.
- **Jobs em segundo plano**: Supabase Edge Functions + `pg_cron` para rotinas agendadas (revalidação de ofertas, agenda de obrigações, alertas de SLA).
- **Agentes de IA**: Claude API via camada de serviço própria, com ferramentas e permissões escopadas por função (Item 8.6).
- **Deploy**: Vercel (aplicação) + Supabase Cloud (dados/auth/storage).

### 3.2 Estrutura do projeto

Aplicação única (monólito modular, Item 8.1.4), organizada por domínio de negócio — não por marca — para que Viana e Amazon reaproveitem a mesma base na fase seguinte:

```
/src
  /modules
    /identity      (pessoa/empresa, vínculos, papéis)
    /commercial    (oportunidade, proposta, contrato — comuns a todas as marcas)
    /catalog       (produto, oferta, condição comercial)
    /capital       (cota de consórcio, plano patrimonial, ofertas de administradoras)
    /financial     (títulos a pagar/receber, comissão, conciliação)
    /governance    (auditoria, permissões, políticas — transversal)
    /agents        (definições de agentes de IA, ferramentas, prompts)
  /app             (rotas Next.js: CRM interno)
  /lib             (utilitários compartilhados, cliente Supabase, schemas Zod)
/supabase
  /migrations      (migrações versionadas do banco)
```

Cada módulo expõe serviços/repositórios próprios; módulos não acessam tabelas de outro módulo diretamente sem passar pelo serviço responsável (Item 8.3.2).

## 4. Modelo de dados do piloto

### 4.1 Núcleo compartilhado (reutilizável por todas as marcas — Item 3)

- `pessoa_fisica` / `pessoa_juridica` — identificador MCJ estável, independente de CPF/CNPJ.
- `vinculo_pf_pj` — relação pessoa-empresa com papel (solicitante, decisor, signatário, etc.).
- `marca` — MCJ, Amazon Mobility, Viana Seguros, MCJ Capital.
- `oportunidade` — cliente, marca, jornada, produto, funil, etapa, responsável, origem, valor previsto, probabilidade, status.
- `proposta` + `proposta_item` — versionadas, com condições, preços e validade preservados por versão (Item 3.3.5).
- `contrato` — partes, itens, versão aprovada, vigência, condições.
- `documento` — metadados + referência de storage, tipo, titular, origem, versão, validade, status de validação (Cofre Documental).
- `interacao` — histórico omnichannel (WhatsApp, e-mail, telefone, portal).
- `compromisso` — promessas registradas (quem prometeu, prazo, status).
- `obrigacao` — agenda de vencimentos (parcelas, renovações), mesmo quando pagas diretamente a terceiro.
- `evento_financeiro` / `titulo_pagar` / `titulo_receber` — com natureza (receita MCJ, capital do cliente, remuneração de terceiro).
- `parceiro` — inclui administradoras de consórcio.
- `usuario` / `papel` / `permissao` — RBAC combinado com RLS.
- `auditoria_evento` — log append-only.

### 4.2 Específico de MCJ Capital (piloto)

- `cota_consorcio` — administradora, plano, grupo, crédito, prazo, parcela, taxa de administração, status (ativa, contemplada, cancelada).
- `consorcio_parcela` — histórico de pagamentos.
- `consorcio_lance` — estratégia e valores de lance.
- `consorcio_contemplacao` — evento de contemplação.
- `plano_patrimonial` — situação inicial, objetivos, horizonte, **orçamento do cliente** (capital disponível + aportes periódicos possíveis), **objetivo de retorno** (valor-alvo e/ou horizonte), versionado.
- `plano_patrimonial_revisao` — versões do plano, preservando premissas e projeção usadas em cada revisão.
- `administradora` — cadastro das administradoras credenciadas.
- `plano_consorcio_administradora` — planos oferecidos por cada administradora.
- `campanha_incentivo` — condições especiais/incentivos vigentes por administradora, com vigência.
- `oferta_administradora` — condição comercial versionada (crédito, prazo, taxa, comissão MCJ, campanha vigente), com estado: coletado → pendente de validação → validado → vencido (Item 5.9.4).

### 4.3 Catálogo (mínimo para o piloto)

- `produto` — marca = Capital, tipo = consórcio | planejamento_patrimonial.
- `oferta` — produto + parceiro/administradora + condição + vigência.

## 5. Segurança e permissões

- **RLS (Row Level Security) do Postgres como camada principal de proteção** — a autorização é aplicada no servidor/banco antes de qualquer retorno de dado, não apenas ocultada na interface (Item 8.1.8).
- Modelo híbrido: papel + marca + unidade + carteira/oportunidade + classificação de confidencialidade (Item 7.1.8, 8.8.2), implementado via funções `security definer` (ex.: `has_access(...)`) reutilizadas nas políticas RLS, evitando duplicar lógica em cada tabela.
- Campos confidenciais (margem, comissão de parceiro, condições internas de administradora) segregados em tabelas/views não expostas a papéis externos ou ao contexto de agentes de atendimento ao cliente.
- Auditoria via triggers em tabelas sensíveis + log explícito de ações de negócio (aprovação de proposta, assinatura de contrato, aprovação de comissão) — Item 7.7.
- MFA obrigatório para papéis internos/administrativos via Supabase Auth.
- Credenciais de terceiros (administradoras) em Supabase Vault, nunca expostas a prompts de IA ou logs (Item 8.8.8).

## 6. Escopo funcional do piloto

### 6.1 Fluxo Consórcio

Identificação (cadastro único PF/PJ) → diagnóstico → consulta ao Motor de Recomendação de Administradoras (ver seção 7) → proposta → aprovação → contrato → cota (acompanhamento de parcelas, lance, contemplação) → financeiro (acompanhamento de parcela do cliente à administradora + comissão MCJ) → comissionamento interno simplificado.

### 6.2 Fluxo Planejamento Patrimonial

Diagnóstico patrimonial → captura de orçamento do cliente e objetivo de retorno → proposta de serviço (preço-base, segmentação, benefício conforme Item 5.4.11) → contratação → `plano_patrimonial` versionado → **comparador de benchmarks** (projeção da estratégia proposta vs. CDI, Tesouro e Ibovespa, com fluxos e datas reais — Item 3.10.7/5.4.10), mostrando ao cliente se a estratégia projetada supera investimento financeiro básico, sem apresentar a projeção como garantia → revisão periódica.

### 6.3 CRM interno mínimo

Ficha do cliente (identidade + oportunidades + propostas + contratos), pipeline de oportunidades, central de propostas, área financeira básica (títulos, comissões).

## 7. Motor de Monitoramento e Recomendação de Administradoras de Consórcio

### 7.1 Princípio

Espelha a regra já aprovada para recomendação de veículos na Amazon Mobility (Item 5.2.5): filtros de elegibilidade e disponibilidade são aplicados primeiro; somente depois entra a ponderação comercial. A ponderação inicial é **50% adequação ao cliente + 50% resultado comercial MCJ** (incluindo a campanha de incentivo vigente daquela semana/mês), parametrizada e versionada no banco — nunca fixada como instrução isolada de um agente de IA.

### 7.2 Papel da IA

O agente de IA orquestra a coleta e explica o resultado ao usuário interno, mas **não decide livremente o ranking**: ele chama um serviço de cálculo determinístico e auditável, preservando a fotografia da decisão (dados, versão da oferta, pesos, resultado) conforme Item 7.7.3. Isso evita que uma campanha de incentivo maior induza a uma recomendação inadequada ao cliente.

### 7.3 Coleta de condições — fases

**Fase piloto (dentro do escopo atual):**
Ingestão assistida por IA de boletins recebidos por e-mail e WhatsApp — a IA extrai condições comerciais estruturadas (separando conteúdo de marketing do dado comercial real) e registra como "pendente de validação"; um responsável humano confirma antes de a condição virar "oficial" e entrar no motor de recomendação (Item 8.2.8, 5.9.6).

**Fase seguinte (fast-follow, não bloqueia o piloto):**
Automação de navegador (Playwright) para login nos portais das administradoras com as credenciais master já existentes, começando pelas 1–2 administradoras de maior volume e expandindo gradualmente. Sempre com caminho manual de apoio quando o portal mudar de layout ou a coleta falhar (Item 8.7.7).

## 8. Fora do escopo do piloto

- Ciclo imobiliário completo (aquisição, preparação, administração/locação, calendário de reservas, sincronização com canais como Airbnb/Booking) — Item 3.6 e 5.4.7–5.4.10 (exceto o comparador de benchmarks, que entra no piloto).
- Automação de scraping de portais de administradoras (entra na fase seguinte).
- Viana Seguros e Amazon Mobility (entram na fase seguinte, reaproveitando o núcleo).
- Portais externos completos (site institucional, portal do cliente completo, portal de parceiros) — piloto usa CRM interno mínimo.
- Agentes de IA avançados de atendimento ao cliente (piloto tem apenas assistente de diagnóstico/qualificação interno).
- Orquestração via n8n.

## 9. Fases seguintes

1. **Fase 2**: Viana Seguros + Amazon Mobility (Assinatura PF), reaproveitando identidade, comercial, catálogo, financeiro e governança já construídos.
2. **Fase 3**: Ciclo imobiliário completo da Capital (aquisição, preparação, administração/locação, reservas), automação de scraping de administradoras, portais externos, agentes de IA mais avançados.
3. **Fase 4+**: Demais jornadas Amazon (PCD, Empresas PJ), expansão de automação e autonomia de IA conforme Item 8.10.5 (etapas 3–5).

## 10. Qualidade, testes e ambientes

- Desenvolvimento orientado a testes (TDD) para regras de negócio, especialmente cálculos financeiros e o motor de recomendação 50/50.
- Migrações do Supabase versionadas em `/supabase/migrations`.
- Ambientes separados: desenvolvimento, homologação, produção (Item 8.9.2), com dados fictícios/desidentificados fora de produção.
- Critérios de aceite do piloto (a detalhar no plano de implementação):
  - Identidade única funciona entre oportunidades de Consórcio e Planejamento Patrimonial para a mesma pessoa.
  - Proposta aprovada preserva a versão exata mesmo se a oferta da administradora mudar depois.
  - Motor de recomendação aplica filtros de elegibilidade antes da ponderação 50/50 e preserva a fotografia da decisão.
  - Condição extraída de boletim não se torna oficial sem validação humana.
  - RLS bloqueia acesso a dados fora do escopo autorizado mesmo via API direta, não apenas via interface.
  - Comparador de Planejamento Patrimonial distingue projeção de garantia e preserva versão usada em cada revisão.

## 11. Decisões pendentes (a resolver antes ou durante o plano de implementação)

- Quais administradoras entram na fase de automação de portal primeiro (maior volume).
- Definição fina dos pesos e critérios do "resultado comercial" na ponderação 50/50 (comissão, histórico de qualidade da administradora, SLA).
- Metodologia exata do comparador de benchmarks (fontes de CDI/Tesouro/Ibovespa, periodicidade de atualização).
- Canal de recebimento dos boletins (caixa de e-mail dedicada, número de WhatsApp Business) para a ingestão assistida por IA.
- Nome definitivo do projeto/repositório e configuração de conta/organização no GitHub (se aplicável).

## 12. Referências

Documentos-fonte (pasta `_Claude/CRM` no OneDrive): Item 1 (Arquitetura das Marcas), Item 2 (Jornada do Cliente), Item 3 (Arquitetura do CRM), Item 4 (Estrutura Comercial), Item 5 (Catálogo, Precificação e Regras), Item 6 (Operação e Entrega), Item 7 (Governança), Item 8 (Arquitetura Tecnológica).
