import fetch from "node-fetch";
import Anthropic from "@anthropic-ai/sdk";
import { buscarLicitacoes, radarLicitacoes, resumoPorSegmento } from "./sources/pncp.js";
import { buscarDiariosOficiais } from "./sources/diarios.js";
import { buscarNoticias } from "./sources/noticias.js";
import { perfilMunicipio } from "./sources/ibge.js";
import { geologiaNoPonto } from "./sources/geologia.js";
import { TOPICOS, ATUALIZADO_EM } from "./knowledge/base.js";
import { estimarMercadoLodo, PROCESSOS } from "./knowledge/mercadoLodo.js";

// =====================================
// ASSESSOR DE MERCADO — SANEAMENTO 🛰️
// LLM com function calling: o modelo decide quais fontes públicas consultar
// e só afirma números que vieram das ferramentas.
// =====================================

// Claude tem prioridade quando ANTHROPIC_API_KEY existe; senão usa OpenAI
export const provedorIA = () =>
  process.env.ANTHROPIC_API_KEY ? "claude" : process.env.OPENAI_API_KEY ? "openai" : null;
const modeloPadrao = () => process.env.SANEAMENTO_MODEL || (provedorIA() === "claude" ? "claude-opus-5-5" : "gpt-4o-mini");
const MAX_ROUNDS = 6;
const OPENAI_URL = `${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`;

const systemPrompt = () => `
Você é o ORÁCULO DO SANEAMENTO — assessor sênior de inteligência de mercado do saneamento básico no Brasil.
Hoje é ${new Date().toISOString().slice(0, 10)}. Base curada revisada em ${ATUALIZADO_EM}.

Especialidades: ETE/ETA, desaguamento de lodo e centrífugas decanter, licitações (Lei 14.133/PNCP),
concessões e PPPs (Lei 14.026/2020), regulação (ANA, agências infranacionais), geologia/hidrogeologia aplicada à implantação de unidades,
players do setor e dimensionamento de mercado.

REGRAS DE VERACIDADE (inegociáveis):
- Para fatos atuais (editais abertos, notícias, leilões recentes, diários oficiais) SEMPRE use as ferramentas antes de responder.
- Nunca invente números, órgãos, valores de edital ou vencedores. Se a ferramenta falhar ou não houver dado, diga isso claramente.
- Cite a fonte de cada dado relevante com link em markdown.
- Separe com clareza: **Dado oficial** (fonte pública) × **Estimativa** (premissas explícitas) × **Opinião do assessor**.
- Dados da base curada com confianca "media" devem ser apresentados como "a confirmar".

ESTILO: português do Brasil, direto, consultivo, como um consultor de estratégia. Use títulos curtos, listas e tabelas markdown.
Termine com "Próximos passos" acionáveis quando fizer sentido.
`;

const ESTUDO_PROMPT = `
MODO ESTUDO DE MERCADO COMPLETO. Consulte várias ferramentas (indicadores, concessões, licitações abertas, notícias, diários,
e se houver município/região: perfil IBGE + geologia + estimativa de lodo). Estruture:
1. Sumário executivo  2. Contexto regulatório e metas  3. Tamanho e dinâmica do mercado (com estimativas e premissas)
4. Oportunidades ativas (licitações/diários — tabela com órgão, objeto, valor, prazo, link)
5. Concorrência e players  6. Geologia e riscos de implantação (se aplicável)  7. Riscos e barreiras
8. Recomendações e próximos passos  9. Fontes consultadas.
`;

const TOOLS = [
  {
    name: "buscar_licitacoes",
    description: "Busca editais no PNCP (fonte oficial). Sem 'q', retorna o radar consolidado do setor (ETE, ETA, centrífugas, redes, concessões).",
    parameters: {
      type: "object",
      properties: {
        q: { type: "string", description: "Termo de busca, ex.: 'centrífuga desaguamento lodo'" },
        uf: { type: "string", description: "Sigla da UF, ex.: SP" },
        status: { type: "string", enum: ["recebendo_proposta", "encerradas", "todos"], description: "Padrão: recebendo_proposta" }
      }
    }
  },
  {
    name: "buscar_diarios_oficiais",
    description: "Busca textual em diários oficiais municipais (Querido Diário): avisos de licitação, homologações, contratos, concessões.",
    parameters: {
      type: "object",
      properties: {
        termo: { type: "string" },
        dias: { type: "integer", description: "Janela em dias (padrão 30)" }
      },
      required: ["termo"]
    }
  },
  {
    name: "buscar_noticias",
    description: "Notícias recentes (30 dias) do setor via Google News.",
    parameters: {
      type: "object",
      properties: {
        tema: { type: "string", enum: ["geral", "leiloes", "regulacao", "lodo", "empresas"] },
        consulta: { type: "string", description: "Consulta livre (substitui o tema)" }
      }
    }
  },
  {
    name: "perfil_municipio",
    description: "Perfil de município: código IBGE, população Censo 2022, centroide e triagem geológica/geotécnica para ETE/ETA.",
    parameters: {
      type: "object",
      properties: { nome: { type: "string" }, uf: { type: "string" } },
      required: ["nome"]
    }
  },
  {
    name: "analise_geologica",
    description: "Unidade geológica, altitude e implicações geotécnicas/hidrogeológicas para implantação de ETE/ETA em um ponto.",
    parameters: {
      type: "object",
      properties: { lat: { type: "number" }, lon: { type: "number" } },
      required: ["lat", "lon"]
    }
  },
  {
    name: "base_conhecimento",
    description: "Base curada com fontes: indicadores nacionais (SNIS/SINISA), marco legal, concessões e leilões, players, centrífugas (aplicações, desempenho, fabricantes, modelos de negócio), fontes oficiais.",
    parameters: {
      type: "object",
      properties: { topico: { type: "string", enum: Object.keys(TOPICOS) } },
      required: ["topico"]
    }
  },
  {
    name: "estimar_mercado_lodo",
    description: "Estima produção de lodo, número de centrífugas, polímero e custo de destinação para uma população atendida.",
    parameters: {
      type: "object",
      properties: {
        populacao: { type: "number" },
        processo: { type: "string", enum: Object.keys(PROCESSOS) },
        coberturaTratamento: { type: "number", description: "% da população com esgoto tratado (padrão 100)" },
        custoDestinacaoPorT: { type: "number", description: "R$/t de transporte + destinação (padrão 150)" }
      },
      required: ["populacao"]
    }
  }
];

async function executarFerramenta(nome, args) {
  switch (nome) {
    case "buscar_licitacoes": {
      const r = args.q ? await buscarLicitacoes(args) : await radarLicitacoes(args);
      return { ...r, resumoPorSegmento: resumoPorSegmento(r.items) };
    }
    case "buscar_diarios_oficiais": return buscarDiariosOficiais(args);
    case "buscar_noticias": return buscarNoticias(args);
    case "perfil_municipio": {
      const perfil = await perfilMunicipio(args.nome, args.uf);
      const geo = perfil.centroide ? await geologiaNoPonto(perfil.centroide.lat, perfil.centroide.lon) : null;
      return { ...perfil, geologia: geo };
    }
    case "analise_geologica": return geologiaNoPonto(args.lat, args.lon);
    case "base_conhecimento": return TOPICOS[args.topico]?.() ?? { erro: "Tópico inexistente" };
    case "estimar_mercado_lodo": return estimarMercadoLodo(args);
    default: return { erro: `Ferramenta desconhecida: ${nome}` };
  }
}

const truncar = (obj, max = 14000) => {
  const s = JSON.stringify(obj);
  return s.length > max ? s.slice(0, max) + "…[truncado]" : s;
};

async function chamarModelo(messages, maxTokens, { semFerramentas = false } = {}) {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: modeloPadrao(),
      messages,
      tools: TOOLS.map(t => ({ type: "function", function: t })),
      tool_choice: semFerramentas ? "none" : "auto",
      temperature: 0.3,
      max_tokens: maxTokens
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Falha no modelo (HTTP ${res.status})`);
  return data.choices[0].message;
}

// ---------- Claude (Anthropic) ----------
let anthropic = null;

async function consultarClaude(historico, modo, fontesConsultadas) {
  anthropic ??= new Anthropic();
  const model = modeloPadrao();
  const tools = TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));

  // A conversa precisa começar com o usuário
  const messages = [...historico];
  while (messages.length && messages[0].role !== "user") messages.shift();

  const pedir = (extra = {}) => anthropic.beta.messages.create({
    model,
    max_tokens: 16000,
    system: systemPrompt() + (modo === "estudo" ? ESTUDO_PROMPT : ""),
    tools,
    messages,
    output_config: { effort: modo === "estudo" ? "high" : "medium" },
    // Se um classificador de segurança recusar, a API tenta outro modelo automaticamente
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    ...extra
  });

  const textoDe = (r) => r.content.filter(b => b.type === "text").map(b => b.text).join("\n\n").trim();

  for (let rodada = 0; rodada <= MAX_ROUNDS; rodada++) {
    const ultima = rodada === MAX_ROUNDS;
    const r = await pedir(ultima ? { tool_choice: { type: "none" } } : {});

    if (r.stop_reason === "refusal") {
      return "Não consegui responder a essa pergunta. Tente reformular com foco no mercado de saneamento.";
    }

    // Conteúdo completo (inclui blocos de raciocínio) volta para a conversa sem alterações
    messages.push({ role: "assistant", content: r.content });
    if (r.stop_reason === "pause_turn") continue;

    const chamadas = r.content.filter(b => b.type === "tool_use");
    if (!chamadas.length || ultima) return textoDe(r) || "Não consegui consolidar a análise.";

    const resultados = await Promise.all(chamadas.map(async call => {
      let conteudo;
      try {
        conteudo = await executarFerramenta(call.name, call.input || {});
      } catch (err) {
        conteudo = { erro: err.message };
      }
      fontesConsultadas.push({ ferramenta: call.name, args: call.input, ok: !conteudo?.erro });
      return { type: "tool_result", tool_use_id: call.id, content: truncar(conteudo), ...(conteudo?.erro ? { is_error: true } : {}) };
    }));

    // Todos os resultados numa única mensagem; na última rodada, pede a consolidação
    const conteudoUsuario = rodada === MAX_ROUNDS - 1
      ? [...resultados, { type: "text", text: "Consolide agora a resposta final com os dados já obtidos." }]
      : resultados;
    messages.push({ role: "user", content: conteudoUsuario });
  }
}

// ---------- OpenAI ----------
async function consultarOpenAI(historico, modo, fontesConsultadas) {
  const messages = [
    { role: "system", content: systemPrompt() + (modo === "estudo" ? ESTUDO_PROMPT : "") },
    ...historico
  ];
  const maxTokens = modo === "estudo" ? 4000 : 1500;

  for (let rodada = 0; rodada < MAX_ROUNDS; rodada++) {
    const msg = await chamarModelo(messages, maxTokens);
    messages.push(msg);

    if (!msg.tool_calls?.length) return msg.content;

    const resultados = await Promise.all(msg.tool_calls.map(async call => {
      let args = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* args vazios */ }
      let conteudo;
      try {
        conteudo = await executarFerramenta(call.function.name, args);
      } catch (err) {
        conteudo = { erro: err.message };
      }
      fontesConsultadas.push({ ferramenta: call.function.name, args, ok: !conteudo?.erro });
      return { role: "tool", tool_call_id: call.id, content: truncar(conteudo) };
    }));
    messages.push(...resultados);
  }

  // Estourou as rodadas: força uma resposta final sem ferramentas
  messages.push({ role: "user", content: "Consolide agora a resposta final com os dados já obtidos." });
  const final = await chamarModelo(messages, maxTokens, { semFerramentas: true });
  return final.content || "Não consegui consolidar a análise.";
}

/**
 * historico: [{ role: "user" | "assistant", content: string }]
 * modo: "chat" | "estudo"
 */
export async function consultarAssessor({ historico = [], modo = "chat" }) {
  const provedor = provedorIA();
  if (!provedor) {
    throw new Error("Nenhuma chave de IA configurada no servidor (ANTHROPIC_API_KEY ou OPENAI_API_KEY) — o assessor está desativado (os painéis de dados continuam funcionando).");
  }

  const hist = historico
    .filter(m => ["user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.trim())
    .slice(-12);

  const fontesConsultadas = [];
  const resposta = provedor === "claude"
    ? await consultarClaude(hist, modo, fontesConsultadas)
    : await consultarOpenAI(hist, modo, fontesConsultadas);

  return { resposta, ferramentas: fontesConsultadas, modelo: modeloPadrao() };
}
