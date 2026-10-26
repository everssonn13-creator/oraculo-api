import { fetchCached } from "./http.js";

// =====================================
// Notícias do setor — Google News RSS (pt-BR)
// Mantém a plataforma atualizada com leilões, aquisições, regulação, etc.
// =====================================

export const TEMAS_NOTICIAS = {
  geral: "saneamento básico Brasil",
  leiloes: "leilão saneamento concessão água esgoto",
  regulacao: "ANA norma de referência saneamento OR \"marco legal do saneamento\"",
  lodo: "lodo ETE centrífuga OR desaguamento OR biossólido",
  empresas: "Sabesp OR Aegea OR Iguá OR BRK OR \"Águas do Brasil\" OR Copasa OR Sanepar"
};

const decode = (s = "") =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "").trim();

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : null;
};

export function parseRss(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return items.map(it => {
    const titulo = tag(it, "title") || "";
    const veiculo = tag(it, "source");
    return {
      titulo: veiculo && titulo.endsWith(` - ${veiculo}`) ? titulo.slice(0, -(veiculo.length + 3)) : titulo,
      veiculo,
      link: tag(it, "link"),
      publicadoEm: tag(it, "pubDate") ? new Date(tag(it, "pubDate")).toISOString() : null
    };
  });
}

export async function buscarNoticias({ tema = "geral", consulta, limite = 15 } = {}) {
  const q = consulta || TEMAS_NOTICIAS[tema] || TEMAS_NOTICIAS.geral;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:30d`)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  const xml = await fetchCached(url, { as: "text", ttlMs: 20 * 60 * 1000 });
  return { consulta: q, items: parseRss(xml).slice(0, limite) };
}
