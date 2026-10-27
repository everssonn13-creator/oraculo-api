import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buscarLicitacoes } from "./sources/pncp.js";
import { buscarDiariosOficiais } from "./sources/diarios.js";
import { buscarNoticias } from "./sources/noticias.js";
import { expandirLocal } from "./knowledge/regioes.js";

// =====================================
// RADAR DE COMPRAS — sinais de que um órgão/empresa vai comprar
// (ou acabou de comprar) o que a empresa cliente vende.
// Fica pré-calculado em memória e é atualizado em segundo plano.
// =====================================

export const EMPRESA = process.env.CENTRIS_EMPRESA || "Pieralisi do Brasil";

// Linhas de produto da empresa cliente e os termos que as identificam
export const PRODUTOS = [
  { id: "centrifuga", nome: "Centrífuga decanter", termos: ["centrifug", "decanter", "desaguamento", "deságue", "desidratação de lodo", "desidratacao de lodo", "adensamento de lodo", "tratamento de lodo"] },
  { id: "polimero", nome: "Preparador de polímero", termos: ["preparador de polímero", "preparador de polimero", "preparo de polímero", "preparo de polimero", "dosagem de polímero", "dosador de polímero", "polieletrólito", "polieletrolito"] },
  { id: "ete", nome: "Equipamentos para ETE", termos: ["estação de tratamento de esgoto", "estacao de tratamento de esgoto", "ete", "lodos ativados", "reator uasb"] },
  { id: "eta", nome: "Equipamentos para ETA", termos: ["estação de tratamento de água", "estacao de tratamento de agua", "eta", "lodo de eta", "decantador"] }
];

const BUSCAS_PNCP = ["centrífuga lodo", "decanter", "desaguamento de lodo", "preparador de polímero", "desidratação de lodo", "adensamento de lodo"];
const BUSCAS_DIARIOS = ["centrífuga para lodo", "desaguamento de lodo", "preparador de polímero", "desidratação de lodo", "centrífuga decanter"];
const BUSCAS_NOTICIAS = ["centrífuga lodo saneamento", "desaguamento de lodo ETE investimento", "nova ETE licitação equipamentos"];

const norm = (s = "") => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Siglas curtas (ETE, ETA) exigem palavra inteira; termos longos casam por prefixo
const termoRx = (term) => {
  const t = norm(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${t}${t.length <= 4 ? "($|[^a-z0-9])" : ""}`);
};
const PRODUTOS_RX = PRODUTOS.map(p => ({ id: p.id, rx: p.termos.map(termoRx) }));

export function produtosDoTexto(texto) {
  const t = norm(texto);
  const achados = PRODUTOS_RX.filter(p => p.rx.some(rx => rx.test(t))).map(p => p.id);
  // ETE/ETA genérico só conta se não houver produto mais específico
  const especificos = achados.filter(id => id === "centrifuga" || id === "polimero");
  return especificos.length ? especificos : achados;
}

// Tipo de sinal a partir do texto (diários e notícias)
export function tipoDoSinal(texto) {
  const t = norm(texto);
  if (/homolog|adjudic|extrato d[eo] contrato|contrato n|ata de registro de preco/.test(t)) return { tipo: "Compra fechada", confianca: "media", nota: "alguém já vendeu — mapear concorrente e próxima demanda" };
  if (/aviso de licitac|pregao|edital|concorrencia|tomada de preco|licitac/.test(t)) return { tipo: "Licitação", confianca: "alta" };
  if (/dispensa|inexigibilidade/.test(t)) return { tipo: "Compra direta", confianca: "alta" };
  if (/dotac|credito (adicional|suplementar|especial)|suplementa|aprova|orcament|recurso|financiamento|convenio/.test(t)) return { tipo: "Verba / orçamento", confianca: "media" };
  return { tipo: "Menção", confianca: "baixa" };
}

const ufDoTexto = (texto) => {
  const m = String(texto || "").match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
  return m ? m[1] : null;
};

async function sinaisPNCP() {
  const r = await Promise.allSettled(BUSCAS_PNCP.map(q => buscarLicitacoes({ q, tamanho: 20 })));
  const itens = r.filter(x => x.status === "fulfilled").flatMap(x => x.value.items);
  return {
    erros: r.filter(x => x.status === "rejected").map(x => x.reason.message),
    sinais: itens.map(it => ({
      id: `pncp:${it.id}`,
      fonte: "PNCP",
      tipo: "Edital aberto",
      confianca: "alta",
      orgao: it.orgao,
      uf: it.uf,
      municipio: it.municipio,
      produtos: produtosDoTexto(it.objeto),
      resumo: it.objeto.slice(0, 280),
      valor: it.valorEstimado,
      data: it.publicadoEm,
      prazo: it.encerraEm,
      link: it.link
    }))
  };
}

async function sinaisDiarios() {
  const r = await Promise.allSettled(BUSCAS_DIARIOS.map(termo => buscarDiariosOficiais({ termo, dias: 60, tamanho: 15 })));
  const itens = r.filter(x => x.status === "fulfilled").flatMap(x => x.value.items);
  return {
    erros: r.filter(x => x.status === "rejected").map(x => x.reason.message),
    sinais: itens.map(g => {
      const texto = g.trechos.join(" … ");
      const t = tipoDoSinal(texto);
      return {
        id: `qd:${g.ibge}:${g.data}:${norm(texto).slice(0, 40)}`,
        fonte: "Diário oficial",
        ...t,
        orgao: `Prefeitura/órgão de ${g.municipio}`,
        uf: g.uf,
        municipio: g.municipio,
        produtos: produtosDoTexto(texto),
        resumo: texto.slice(0, 280),
        valor: null,
        data: g.data,
        link: g.link
      };
    })
  };
}

async function sinaisNoticias() {
  const r = await Promise.allSettled(BUSCAS_NOTICIAS.map(consulta => buscarNoticias({ consulta, limite: 10 })));
  const itens = r.filter(x => x.status === "fulfilled").flatMap(x => x.value.items);
  return {
    erros: r.filter(x => x.status === "rejected").map(x => x.reason.message),
    sinais: itens.map(n => {
      const t = tipoDoSinal(n.titulo);
      return {
        id: `news:${n.link}`,
        fonte: `Notícia${n.veiculo ? ` (${n.veiculo})` : ""}`,
        tipo: t.tipo === "Menção" ? "Notícia" : t.tipo,
        confianca: "baixa",
        orgao: null,
        uf: ufDoTexto(n.titulo),
        municipio: null,
        produtos: produtosDoTexto(n.titulo),
        resumo: n.titulo,
        valor: null,
        data: n.publicadoEm,
        link: n.link
      };
    })
  };
}

// Projetos em andamento da base própria (Obras Programadas da Sanepar) ligados a lodo/ETE
async function sinaisBasePropria() {
  const arquivo = fileURLToPath(new URL("./conhecimento/sanepar-obras-programadas-2026-09.md", import.meta.url));
  let texto = "";
  try { texto = await fs.readFile(arquivo, "utf8"); } catch { return { erros: [], sinais: [] }; }
  const sinais = [];
  for (const linha of texto.split("\n")) {
    const m = linha.replace(/^- /, "").match(/^(.+?) · (OBRA|PROJETO|POÇO) · (Em Andamento) · (\S+(?: \S+)?) — (.+)$/);
    if (!m) continue;
    const produtos = produtosDoTexto(m[5]);
    if (!produtos.includes("centrifuga") && !produtos.includes("polimero") && !/lodo/i.test(m[5])) continue;
    sinais.push({
      id: `sanepar:${m[1]}:${m[5].slice(0, 40)}`,
      fonte: "Sanepar — obras programadas (set/2026)",
      tipo: m[2] === "PROJETO" ? "Projeto em andamento" : "Obra em andamento",
      confianca: "media",
      orgao: "Sanepar",
      uf: "PR",
      municipio: m[1],
      produtos: produtos.length ? produtos : ["ete"],
      resumo: m[5].slice(0, 280),
      valor: null,
      data: "2026-09-30",
      financiamento: m[4],
      link: null
    });
  }
  return { erros: [], sinais };
}

const PESO = { alta: 3, media: 2, baixa: 1 };
// confiança primeiro; dentro dela, sinais de centrífuga/polímero (produto principal) antes dos genéricos de ETE/ETA
const relevancia = (s) => PESO[s.confianca] * 10 + (s.produtos.some(p => p === "centrifuga" || p === "polimero") ? 5 : 0);

let cache = null;          // { sinais, erros, atualizadoEm }
let emAndamento = null;

export async function atualizarRadar() {
  if (emAndamento) return emAndamento;
  emAndamento = (async () => {
    const partes = await Promise.all([sinaisPNCP(), sinaisDiarios(), sinaisNoticias(), sinaisBasePropria()]);
    const vistos = new Map();
    for (const s of partes.flatMap(p => p.sinais)) {
      if (!s.produtos.length) continue; // sem relação com o que a empresa vende
      if (!vistos.has(s.id)) vistos.set(s.id, s);
    }
    cache = {
      sinais: [...vistos.values()].sort((a, b) => relevancia(b) - relevancia(a) || String(b.data).localeCompare(String(a.data))),
      erros: [...new Set(partes.flatMap(p => p.erros))],
      atualizadoEm: new Date().toISOString()
    };
    return cache;
  })().finally(() => { emAndamento = null; });
  return emAndamento;
}

export async function obterRadar({ local, produto } = {}) {
  const idade = cache ? Date.now() - Date.parse(cache.atualizadoEm) : Infinity;
  if (!cache) await atualizarRadar();
  else if (idade > 6 * 60 * 60 * 1000) atualizarRadar(); // atualiza em segundo plano e devolve o que já tem

  const ufs = local ? expandirLocal(local) : [];
  let sinais = cache.sinais;
  if (ufs.length && ufs.length < 27) sinais = sinais.filter(s => !s.uf || ufs.includes(s.uf));
  if (produto) sinais = sinais.filter(s => s.produtos.includes(produto));

  const porUF = {}, porProduto = {}, porConfianca = { alta: 0, media: 0, baixa: 0 };
  for (const s of sinais) {
    if (s.uf) porUF[s.uf] = (porUF[s.uf] || 0) + 1;
    for (const p of s.produtos) porProduto[p] = (porProduto[p] || 0) + 1;
    porConfianca[s.confianca]++;
  }
  return {
    empresa: EMPRESA,
    atualizadoEm: cache.atualizadoEm,
    total: sinais.length,
    editaisAbertos: sinais.filter(s => s.tipo === "Edital aberto").length,
    valorEstimado: sinais.reduce((t, s) => t + (s.valor || 0), 0),
    porUF, porProduto, porConfianca,
    produtos: Object.fromEntries(PRODUTOS.map(p => [p.id, p.nome])),
    sinais: sinais.slice(0, 60),
    erros: cache.erros
  };
}

// Pré-carrega ao iniciar e mantém atualizado a cada 6 h
export function iniciarRadar() {
  atualizarRadar().catch(err => console.error("[radar]", err.message));
  setInterval(() => atualizarRadar().catch(err => console.error("[radar]", err.message)), 6 * 60 * 60 * 1000).unref();
}
