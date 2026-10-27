import fetch from "node-fetch";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { buscarLicitacoes, radarLicitacoes, resumoPorSegmento } from "./sources/pncp.js";
import { buscarDiariosOficiais } from "./sources/diarios.js";
import { buscarNoticias } from "./sources/noticias.js";
import { perfilMunicipio, populacaoUFs, totalMunicipiosUF } from "./sources/ibge.js";
import { geologiaNoPonto } from "./sources/geologia.js";
import { TOPICOS, ATUALIZADO_EM, CONCESSOES } from "./knowledge/base.js";
import { estimarMercadoLodo, PROCESSOS } from "./knowledge/mercadoLodo.js";
import { buscarNaBiblioteca } from "./knowledge/biblioteca.js";
import { UFS, expandirLocal, rotuloFoco } from "./knowledge/regioes.js";
import { sanitizarPainel, painelAutomatico } from "./visuais.js";
import { obterRadar, EMPRESA, PRODUTOS } from "./radar.js";

// =====================================
// ASSESSOR DE MERCADO — SANEAMENTO 🛰️
// LLM com ferramentas: consulta a base própria, as fontes públicas ao vivo
// e monta painéis visuais (mapa, indicadores, gráficos, tabelas) na tela.
// =====================================

// Claude tem prioridade quando ANTHROPIC_API_KEY existe; senão usa OpenAI
export const provedorIA = () =>
  process.env.ANTHROPIC_API_KEY ? "claude" : process.env.OPENAI_API_KEY ? "openai" : null;
const modeloPadrao = () => process.env.SANEAMENTO_MODEL || (provedorIA() === "claude" ? "claude-opus-5-5" : "gpt-4o-mini");
export const modeloAtual = () => modeloPadrao();
const MAX_ROUNDS = 6;
const OPENAI_URL = `${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`;

// Memória fixa: perfil da empresa cliente + resumo executivo das fontes. Fica sempre no início do prompt,
// idêntica em todas as chamadas, para o provedor reaproveitar (cache) sem reprocessar a cada pergunta.
const lerConhecimento = (nome) => {
  try { return readFileSync(fileURLToPath(new URL(`./conhecimento/${nome}`, import.meta.url)), "utf8"); } catch { return ""; }
};
const MEMORIA_FIXA = [lerConhecimento("perfil-empresa-cliente.md"), lerConhecimento("panorama-saneamento-2026-resumo.md")].filter(Boolean).join("\n\n");

const PROMPT_FIXO = `
Você é o CENTRIS IA — inteligência comercial do saneamento para a ${EMPRESA}.
Seu usuário é o comercial e a diretoria: querem números, sinais de compra e ações, não textos longos.

Produtos da empresa: centrífugas decanter (desaguamento/adensamento de lodo), equipamentos para ETA e ETE e preparadores de polímero.
Toda análise deve responder: quem compra, quanto, onde, quando, com que confiança — e o que o comercial deve fazer.

COMO TRABALHAR (rápido e preciso):
1. Use primeiro a MEMÓRIA FIXA abaixo e os trechos da base própria enviados no contexto. Só chame "consultar_base_propria" se faltar dado.
2. Para sinais de compra use "radar_oportunidades" (já pré-carregado, é instantâneo). Para editais específicos, "buscar_licitacoes".
3. Faça no máximo 2 rodadas de ferramentas, chamando as necessárias em paralelo na mesma rodada.
4. Em análises, chame "exibir_painel" UMA vez com:
   - 4 a 6 indicadores numéricos (valores, quantidades, %, prazos);
   - mapa com as UFs analisadas (com "valores" por UF quando houver número comparável);
   - 1 a 3 gráficos ("barras" para ranking/comparação; "participacao" para composição);
   - tabela de contas/oportunidades quando houver lista (órgão, UF, o que compra, valor, prazo, confiança);
   - até 3 "insights" de UMA frase, cada um com um número;
   - 2 a 3 "estrategias" = ações comerciais objetivas (até 3 ações curtas cada, com horizonte e prioridade).
5. No final, chame "sugerir_proximas_analises" com 3 opções curtas e acionáveis (ex.: "Contas com edital aberto no PR", "Roteiro de proposta para a Sanepar").

VERACIDADE (inegociável):
- Nunca invente números, órgãos, valores, vencedores ou compras. Sem dado: "não encontrado" e onde verificar.
- Todo sinal de compra deve trazer fonte e nível de confiança: ALTA (edital/licitação publicada), MÉDIA (verba, contrato, obra/projeto em andamento), BAIXA (notícia/menção).
- Estratégias e ações são recomendações do assessor e devem decorrer dos dados.

ESTILO: português do Brasil, executivo. Texto final com no máximo 70 palavras, em até 3 tópicos curtos — os números ficam no painel.

MEMÓRIA FIXA (perfil da empresa e resumo das fontes da base):
${MEMORIA_FIXA}
`;

const contextoDinamico = ({ foco, trechos, modo }) => `
CONTEXTO DESTA PERGUNTA
Hoje é ${new Date().toISOString().slice(0, 10)}. Base curada revisada em ${ATUALIZADO_EM}.
Foco geográfico escolhido pelo usuário: ${rotuloFoco(foco)}.
${modo === "estudo" ? `MODO ESTUDO COMPLETO: pode usar até 4 rodadas de ferramentas e um texto de até 250 palavras, organizado em
Mercado (tamanho e números) · Contas e sinais de compra · Concorrência · Riscos · Plano comercial. Mantenha o painel completo.` : ""}

TRECHOS DA BASE PRÓPRIA RELEVANTES PARA ESTA PERGUNTA:
${trechos.length ? trechos.map((t, i) => `[${i + 1}] (${t.documento}) ${t.trecho}`).join("\n\n") : "(nenhum trecho relevante encontrado)"}
`;

const TOOLS = [
  {
    name: "consultar_base_propria",
    description: "Busca na base de conhecimento própria (documentos, PDFs e anotações enviados pela equipe). Use antes das demais fontes.",
    parameters: { type: "object", properties: { consulta: { type: "string" } }, required: ["consulta"] }
  },
  {
    name: "radar_oportunidades",
    description: "Sinais de compra pré-carregados para os produtos da empresa (editais PNCP, diários oficiais, notícias, obras em andamento), com confiança e fonte. Instantâneo.",
    parameters: {
      type: "object",
      properties: {
        local: { type: "string", description: "UF, região ou 'Brasil' (padrão: foco do usuário)" },
        produto: { type: "string", enum: PRODUTOS.map(p => p.id), description: "Filtra por linha de produto" }
      }
    }
  },
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
    name: "dados_estado",
    description: "Dados de uma UF: população (Censo 2022), número de municípios, editais abertos do setor no PNCP e leilões da base curada.",
    parameters: { type: "object", properties: { uf: { type: "string", description: "Sigla, ex.: BA" } }, required: ["uf"] }
  },
  {
    name: "populacao_por_estado",
    description: "População de todas as UFs (Censo 2022, IBGE). Útil para mapas e comparações regionais.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "buscar_diarios_oficiais",
    description: "Busca textual em diários oficiais municipais (Querido Diário): avisos de licitação, homologações, contratos, concessões.",
    parameters: {
      type: "object",
      properties: { termo: { type: "string" }, dias: { type: "integer", description: "Janela em dias (padrão 30)" } },
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
    parameters: { type: "object", properties: { nome: { type: "string" }, uf: { type: "string" } }, required: ["nome"] }
  },
  {
    name: "analise_geologica",
    description: "Unidade geológica, altitude e implicações geotécnicas/hidrogeológicas para implantação de ETE/ETA em um ponto.",
    parameters: { type: "object", properties: { lat: { type: "number" }, lon: { type: "number" } }, required: ["lat", "lon"] }
  },
  {
    name: "base_conhecimento",
    description: "Base curada com fontes: indicadores nacionais (SNIS/SINISA), marco legal, concessões e leilões, players, centrífugas, fontes oficiais.",
    parameters: { type: "object", properties: { topico: { type: "string", enum: Object.keys(TOPICOS) } }, required: ["topico"] }
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
  },
  {
    name: "sugerir_proximas_analises",
    description: "Sugere de 3 a 4 próximas análises que o usuário pode pedir, mostradas como botões na tela.",
    parameters: {
      type: "object",
      properties: { opcoes: { type: "array", items: { type: "string" }, description: "Frases curtas, até 8 palavras" } },
      required: ["opcoes"]
    }
  },
  {
    name: "exibir_painel",
    description: "Mostra na tela um painel visual com mapa do Brasil, indicadores, gráficos de barras e tabela. Use só dados já obtidos.",
    parameters: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        mapa: {
          type: "object",
          description: "Mapa do Brasil",
          properties: {
            destacar: { type: "array", items: { type: "string" }, description: "UFs ou regiões a destacar (ex.: ['BA','PE'] ou ['Nordeste'])" },
            valores: { type: "object", description: "Valor numérico por UF para colorir o mapa, ex.: {\"BA\": 12, \"PE\": 5}", additionalProperties: { type: "number" } },
            rotuloValor: { type: "string", description: "Unidade dos valores, ex.: 'editais' ou 'habitantes'" }
          }
        },
        kpis: {
          type: "array",
          items: {
            type: "object",
            properties: { rotulo: { type: "string" }, valor: { type: "string" }, detalhe: { type: "string" }, fonte: { type: "string" } },
            required: ["rotulo", "valor"]
          }
        },
        graficos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              titulo: { type: "string" },
              tipo: { type: "string", enum: ["barras", "participacao"], description: "barras = comparação/ranking; participacao = composição de um total (até 5 partes)" },
              unidade: { type: "string" },
              itens: { type: "array", items: { type: "object", properties: { rotulo: { type: "string" }, valor: { type: "number" } }, required: ["rotulo", "valor"] } }
            },
            required: ["titulo", "itens"]
          }
        },
        insights: {
          type: "array",
          description: "3 a 5 leituras dos dados",
          items: {
            type: "object",
            properties: {
              tipo: { type: "string", enum: ["oportunidade", "risco", "tendencia"] },
              titulo: { type: "string" },
              texto: { type: "string", description: "1 a 2 frases citando o dado que sustenta" }
            },
            required: ["tipo", "titulo", "texto"]
          }
        },
        estrategias: {
          type: "array",
          description: "3 a 4 estratégias de entrada ou crescimento no mercado",
          items: {
            type: "object",
            properties: {
              titulo: { type: "string" },
              descricao: { type: "string" },
              acoes: { type: "array", items: { type: "string" }, description: "2 a 4 ações concretas" },
              horizonte: { type: "string", enum: ["curto prazo", "médio prazo", "longo prazo"] },
              prioridade: { type: "string", enum: ["alta", "média", "baixa"] }
            },
            required: ["titulo", "acoes"]
          }
        },
        tabela: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            colunas: { type: "array", items: { type: "string" } },
            linhas: { type: "array", items: { type: "array", items: { type: "string" } } }
          }
        },
        fontes: { type: "array", items: { type: "object", properties: { nome: { type: "string" }, url: { type: "string" } }, required: ["nome"] } }
      },
      required: ["titulo"]
    }
  }
];

async function dadosEstado(ufEntrada) {
  const uf = expandirLocal(ufEntrada).length === 1 ? expandirLocal(ufEntrada)[0] : null;
  if (!uf) throw new Error(`UF inválida: ${ufEntrada}`);
  const [pops, municipios, radar] = await Promise.allSettled([populacaoUFs(), totalMunicipiosUF(uf), radarLicitacoes({ uf, limite: 20 })]);
  return {
    uf,
    nome: UFS[uf].nome,
    regiao: UFS[uf].regiao,
    populacao2022: pops.status === "fulfilled" ? pops.value[String(UFS[uf].ibge)] ?? null : null,
    municipios: municipios.status === "fulfilled" ? municipios.value : null,
    licitacoesAbertas: radar.status === "fulfilled" ? radar.value.items : null,
    concessoes: CONCESSOES.filter(c => c.uf === uf),
    erros: [pops, municipios, radar].filter(r => r.status === "rejected").map(r => r.reason.message)
  };
}

async function executarFerramenta(nome, args, ctx) {
  switch (nome) {
    case "radar_oportunidades": {
      const r = await obterRadar({ local: args.local || (ctx.focoUfs.length ? ctx.focoUfs.join(",") : null), produto: args.produto });
      return { ...r, sinais: r.sinais.slice(0, 30) };
    }
    case "consultar_base_propria": return { trechos: await buscarNaBiblioteca(args.consulta || "", 6) };
    case "buscar_licitacoes": {
      const r = args.q ? await buscarLicitacoes(args) : await radarLicitacoes(args);
      return { ...r, resumoPorSegmento: resumoPorSegmento(r.items) };
    }
    case "dados_estado": return dadosEstado(args.uf);
    case "populacao_por_estado": {
      const pops = await populacaoUFs();
      return { fonte: "IBGE Censo 2022", populacao: Object.fromEntries(Object.entries(UFS).map(([uf, d]) => [uf, pops[String(d.ibge)] ?? null])) };
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
    case "sugerir_proximas_analises": {
      ctx.proximas = (args.opcoes || []).map(o => String(o).trim().slice(0, 90)).filter(Boolean).slice(0, 4);
      return { ok: true };
    }
    case "exibir_painel": {
      ctx.paineisModelo.push(sanitizarPainel(args, ctx.focoUfs));
      return { ok: true, mensagem: "Painel exibido na tela. Agora escreva a análise em texto." };
    }
    default: return { erro: `Ferramenta desconhecida: ${nome}` };
  }
}

const ETAPAS = {
  consultar_base_propria: "Consultando a base de conhecimento própria",
  radar_oportunidades: "Lendo o radar de compras",
  buscar_licitacoes: "Buscando licitações no PNCP",
  dados_estado: "Levantando dados do estado (IBGE e PNCP)",
  populacao_por_estado: "Consultando população por estado (IBGE)",
  buscar_diarios_oficiais: "Varrendo diários oficiais municipais",
  buscar_noticias: "Lendo notícias recentes do setor",
  perfil_municipio: "Analisando o município (IBGE e geologia)",
  analise_geologica: "Fazendo a triagem geológica",
  base_conhecimento: "Consultando a base curada",
  estimar_mercado_lodo: "Estimando o mercado de lodo e centrífugas",
  exibir_painel: "Montando o painel visual",
  sugerir_proximas_analises: "Preparando sugestões de próximas análises"
};

async function rodarFerramenta(nome, args, ctx) {
  ctx.progresso(ETAPAS[nome] || `Executando ${nome}`);
  let conteudo;
  try {
    conteudo = await executarFerramenta(nome, args, ctx);
  } catch (err) {
    conteudo = { erro: err.message };
  }
  ctx.fontes.push({ ferramenta: nome, args, ok: !conteudo?.erro });
  const auto = painelAutomatico(nome, args, conteudo, ctx.focoUfs);
  if (auto) ctx.paineisAuto.push(auto);
  return conteudo;
}

const truncar = (obj, max = 14000) => {
  const s = JSON.stringify(obj);
  return s.length > max ? s.slice(0, max) + "…[truncado]" : s;
};

// ---------- Claude (Anthropic) ----------
let anthropic = null;

async function consultarClaude(historico, contexto, modo, ctx) {
  anthropic ??= new Anthropic();
  const tools = TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));

  // A conversa precisa começar com o usuário
  const messages = [...historico];
  while (messages.length && messages[0].role !== "user") messages.shift();

  const pedir = (extra = {}) => anthropic.beta.messages.create({
    model: modeloPadrao(),
    max_tokens: 16000,
    system: [
      { type: "text", text: PROMPT_FIXO, cache_control: { type: "ephemeral" } },
      { type: "text", text: contexto }
    ],
    tools,
    messages,
    output_config: { effort: modo === "estudo" ? "medium" : "low" },
    // Se um classificador de segurança recusar, a API tenta outro modelo automaticamente
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    ...extra
  });

  const textoDe = (r) => r.content.filter(b => b.type === "text").map(b => b.text).join("\n\n").trim();

  for (let rodada = 0; rodada <= MAX_ROUNDS; rodada++) {
    const ultima = rodada === MAX_ROUNDS;
    ctx.progresso(rodada === 0 ? "Pensando na melhor abordagem" : "Analisando os dados obtidos");
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
      const conteudo = await rodarFerramenta(call.name, call.input || {}, ctx);
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
let esforcoSuportado = true; // desliga sozinho se o modelo recusar o parâmetro

async function chamarOpenAI(messages, maxTokens, { semFerramentas = false, esforco = "low" } = {}) {
  const raciocinio = !/^gpt-4/i.test(modeloPadrao());
  const corpo = {
    model: modeloPadrao(),
    messages,
    tools: TOOLS.map(t => ({ type: "function", function: t })),
    tool_choice: semFerramentas ? "none" : "auto",
    // Modelos de raciocínio (GPT-5, série o) não aceitam temperature nem max_tokens
    ...(raciocinio ? (esforcoSuportado ? { reasoning_effort: esforco } : {}) : { temperature: 0.3 }),
    max_completion_tokens: maxTokens
  };
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(corpo)
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || `Falha no modelo (HTTP ${res.status})`;
    if (corpo.reasoning_effort && /reasoning_effort|reasoning effort/i.test(msg)) {
      esforcoSuportado = false;
      return chamarOpenAI(messages, maxTokens, { semFerramentas, esforco });
    }
    throw new Error(msg);
  }
  return data.choices[0].message;
}

async function consultarOpenAI(historico, contexto, modo, ctx) {
  const messages = [{ role: "system", content: PROMPT_FIXO }, { role: "system", content: contexto }, ...historico];
  const esforco = modo === "estudo" ? "medium" : "low";
  const maxTokens = /^gpt-4/i.test(modeloPadrao()) ? (modo === "estudo" ? 4000 : 2000) : (modo === "estudo" ? 32000 : 16000);

  for (let rodada = 0; rodada < MAX_ROUNDS; rodada++) {
    ctx.progresso(rodada === 0 ? "Pensando na melhor abordagem" : "Analisando os dados obtidos");
    const msg = await chamarOpenAI(messages, maxTokens, { esforco });
    messages.push(msg);

    if (!msg.tool_calls?.length) return msg.content;

    const resultados = await Promise.all(msg.tool_calls.map(async call => {
      let args = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* args vazios */ }
      const conteudo = await rodarFerramenta(call.function.name, args, ctx);
      return { role: "tool", tool_call_id: call.id, content: truncar(conteudo) };
    }));
    messages.push(...resultados);
  }

  // Estourou as rodadas: força uma resposta final sem ferramentas
  messages.push({ role: "user", content: "Consolide agora a resposta final com os dados já obtidos." });
  const final = await chamarOpenAI(messages, maxTokens, { semFerramentas: true, esforco });
  return final.content || "Não consegui consolidar a análise.";
}

// Sugestões de reserva, caso o modelo não chame sugerir_proximas_analises
function proximasPadrao(foco) {
  const onde = rotuloFoco(foco);
  return [
    `Radar de compras em ${onde}`,
    `Contas prioritárias para centrífugas em ${onde}`,
    `Roteiro de proposta para a principal conta em ${onde}`
  ];
}

/**
 * historico: [{ role: "user" | "assistant", content: string }]
 * modo: "chat" | "estudo"
 * foco: { tipo: "brasil" | "regiao" | "uf", valor? }
 */
export async function consultarAssessor({ historico = [], modo = "chat", foco = { tipo: "brasil" }, aoProgresso = () => {} }) {
  const provedor = provedorIA();
  if (!provedor) {
    throw new Error("Nenhuma chave de IA configurada no servidor (ANTHROPIC_API_KEY ou OPENAI_API_KEY) — o assessor está desativado.");
  }

  const hist = historico
    .filter(m => ["user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.trim())
    .slice(-12);
  const pergunta = [...hist].reverse().find(m => m.role === "user")?.content || "";

  const focoUfs = foco?.tipo === "brasil" || !foco?.valor ? [] : expandirLocal(foco.valor);
  const trechos = await buscarNaBiblioteca(`${pergunta} ${rotuloFoco(foco)}`, 4);
  const contexto = contextoDinamico({ foco, trechos, modo });

  const ctx = { fontes: [], paineisModelo: [], paineisAuto: [], focoUfs, progresso: aoProgresso };
  const resposta = provedor === "claude"
    ? await consultarClaude(hist, contexto, modo, ctx)
    : await consultarOpenAI(hist, contexto, modo, ctx);

  // Painel montado pelo modelo tem prioridade; senão usa os automáticos das ferramentas
  const visuais = ctx.paineisModelo.length ? ctx.paineisModelo : ctx.paineisAuto.slice(0, 2);

  return {
    resposta,
    visuais,
    proximas: ctx.proximas?.length ? ctx.proximas : proximasPadrao(foco),
    baseUsada: trechos.map(t => t.documento).filter((d, i, a) => a.indexOf(d) === i),
    ferramentas: ctx.fontes,
    modelo: modeloPadrao()
  };
}
