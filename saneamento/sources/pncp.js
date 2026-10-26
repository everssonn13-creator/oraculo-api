import { fetchCached } from "./http.js";

// =====================================
// PNCP — Portal Nacional de Contratações Públicas (Lei 14.133/2021)
// Fonte oficial e pública de editais de todos os entes federativos.
// =====================================

const PNCP_SEARCH = "https://pncp.gov.br/api/search/";

export const SANEAMENTO_QUERIES = [
  "estação de tratamento de esgoto",
  "estação de tratamento de água",
  "centrífuga lodo",
  "desaguamento de lodo",
  "saneamento básico",
  "rede coletora de esgoto",
  "adutora",
  "concessão água esgoto"
];

// Segmentos do mercado — usados para etiquetar cada edital
const SEGMENTOS = [
  { tag: "Lodo / Centrífuga", termos: ["centrifug", "decanter", "desaguamento", "deságue", "desague", "lodo", "polimero", "polímero", "adensamento"] },
  { tag: "ETE", termos: ["tratamento de esgoto", "ete", "esgotamento sanitario", "esgotamento sanitário", "reator uasb", "lodos ativados"] },
  { tag: "ETA", termos: ["tratamento de agua", "tratamento de água", "eta", "potabiliza", "filtros rapidos", "floculador"] },
  { tag: "Redes / Adutoras", termos: ["rede coletora", "rede de distribui", "adutora", "emissario", "emissário", "interceptor", "ligacoes", "ligações", "elevatória", "elevatoria"] },
  { tag: "Concessão / PPP", termos: ["concessao", "concessão", "ppp", "parceria publico", "parceria público", "subconcess"] },
  { tag: "Químicos", termos: ["cloro", "hipoclorito", "sulfato de aluminio", "sulfato de alumínio", "policloreto", "pac", "cal hidratada", "coagulante"] },
  { tag: "Perdas / Medição", termos: ["hidrometro", "hidrômetro", "macromedi", "perdas", "telemetria", "vazamento"] },
  { tag: "Projetos / Consultoria", termos: ["projeto executivo", "projeto basico", "projeto básico", "consultoria", "estudo de viabilidade", "plano municipal de saneamento", "pmsb"] }
];

const norm = (s = "") => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Siglas curtas (ETE, ETA, PPP...) exigem palavra inteira; termos longos casam por prefixo
const termoRegex = (term) => {
  const t = norm(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${t}${t.length <= 4 ? "($|[^a-z0-9])" : ""}`);
};
const SEGMENTOS_RX = SEGMENTOS.map(s => ({ tag: s.tag, rx: s.termos.map(termoRegex) }));

export function classificarSegmentos(texto) {
  const t = norm(texto);
  const tags = SEGMENTOS_RX.filter(s => s.rx.some(rx => rx.test(t))).map(s => s.tag);
  return tags.length ? tags : ["Saneamento (geral)"];
}

// A API de busca do PNCP já mudou nomes de campos ao longo do tempo —
// por isso a normalização aceita variações.
export function normalizarEdital(item) {
  const objeto = item.description || item.objeto || item.objetoCompra || item.title || "";
  const itemUrl = item.item_url || "";
  const link = itemUrl
    ? `https://pncp.gov.br/app/editais${itemUrl.replace(/^\/compras/, "")}`
    : item.linkSistemaOrigem || null;

  const valor = Number(item.valor_global ?? item.valorTotalEstimado ?? item.valor_total_estimado);

  return {
    id: item.numero_controle_pncp || item.numeroControlePNCP || item.id || itemUrl,
    titulo: item.title || objeto.slice(0, 120),
    objeto,
    orgao: item.orgao_nome || item.orgaoEntidade?.razaoSocial || "Órgão não informado",
    uf: item.uf || item.unidadeOrgao?.ufSigla || null,
    municipio: item.municipio_nome || item.unidadeOrgao?.municipioNome || null,
    modalidade: item.modalidade_licitacao_nome || item.modalidadeNome || null,
    situacao: item.situacao_nome || item.situacaoCompraNome || null,
    valorEstimado: Number.isFinite(valor) && valor > 0 ? valor : null,
    publicadoEm: item.data_publicacao_pncp || item.dataPublicacaoPncp || null,
    encerraEm: item.data_fim_vigencia || item.dataEncerramentoProposta || null,
    segmentos: classificarSegmentos(objeto),
    link,
    fonte: "PNCP"
  };
}

export async function buscarLicitacoes({ q = "saneamento", uf, status = "recebendo_proposta", pagina = 1, tamanho = 20 } = {}) {
  const params = new URLSearchParams({
    q,
    tipos_documento: "edital",
    ordenacao: "-data",
    pagina: String(pagina),
    tam_pagina: String(Math.min(tamanho, 50))
  });
  if (status && status !== "todos") params.set("status", status);
  if (uf) params.set("ufs", uf.toUpperCase());

  const data = await fetchCached(`${PNCP_SEARCH}?${params}`, { ttlMs: 15 * 60 * 1000 });
  const items = (data.items || data.data || []).map(normalizarEdital);

  return { total: data.total ?? items.length, consulta: q, items };
}

// Radar: junta várias buscas do setor, remove duplicados, ordena por publicação
export async function radarLicitacoes({ uf, limite = 40 } = {}) {
  const resultados = await Promise.allSettled(
    SANEAMENTO_QUERIES.map(q => buscarLicitacoes({ q, uf, tamanho: 15 }))
  );

  const vistos = new Map();
  const erros = [];
  for (const r of resultados) {
    if (r.status === "rejected") { erros.push(r.reason.message); continue; }
    for (const it of r.value.items) if (!vistos.has(it.id)) vistos.set(it.id, it);
  }

  const items = [...vistos.values()]
    .sort((a, b) => String(b.publicadoEm).localeCompare(String(a.publicadoEm)))
    .slice(0, limite);

  return { items, erros: [...new Set(erros)], atualizadoEm: new Date().toISOString() };
}

export function resumoPorSegmento(items) {
  const resumo = {};
  for (const it of items) {
    for (const s of it.segmentos) {
      resumo[s] ??= { quantidade: 0, valorEstimado: 0 };
      resumo[s].quantidade += 1;
      resumo[s].valorEstimado += it.valorEstimado || 0;
    }
  }
  return resumo;
}
