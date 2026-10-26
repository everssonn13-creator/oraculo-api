import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// =====================================
// BIBLIOTECA PRÓPRIA — a base que vocês alimentam
// - Documentos do sistema: arquivos .md/.txt em saneamento/conhecimento (versionados no Git)
// - Documentos enviados pelo app: DATA_DIR/conhecimento.json
//   (na Railway, monte um Volume e aponte DATA_DIR para ele, senão os envios somem a cada deploy)
// Busca por palavras-chave (BM25) em trechos de ~1.200 caracteres.
// =====================================

const PASTA_SISTEMA = fileURLToPath(new URL("../conhecimento", import.meta.url));
const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL("../../dados", import.meta.url));
const ARQUIVO_ENVIOS = path.join(DATA_DIR, "conhecimento.json");

const STOP = new Set(("de da do das dos em no na nos nas um uma uns umas para por com sem que qual quais como mais menos " +
  "ao aos as os se sua seu suas seus ser sao foi era sobre entre ate apos pelo pela pelos pelas este esta estes estas esse essa " +
  "isso isto ele ela eles elas voce nao sim tem ter muito muita quando onde porque pois tambem ja the and for").split(" "));

const tokens = (s = "") =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !STOP.has(t));

export function dividirEmTrechos(texto, tamanho = 1200, sobreposicao = 200) {
  const limpo = texto.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (limpo.length <= tamanho) return limpo ? [limpo] : [];
  const trechos = [];
  let i = 0;
  while (i < limpo.length) {
    let fim = Math.min(i + tamanho, limpo.length);
    // corta preferencialmente em fim de parágrafo ou frase
    if (fim < limpo.length) {
      const corte = Math.max(limpo.lastIndexOf("\n\n", fim), limpo.lastIndexOf(". ", fim));
      if (corte > i + tamanho / 2) fim = corte + 1;
    }
    trechos.push(limpo.slice(i, fim).trim());
    if (fim >= limpo.length) break;
    i = fim - sobreposicao;
  }
  return trechos;
}

let docs = null;   // [{ id, titulo, origem, criadoEm, texto }]
let indice = null; // { trechos: [{ docId, titulo, texto, tf, len }], df, mediaLen }

async function carregarSistema() {
  let arquivos = [];
  try { arquivos = await fs.readdir(PASTA_SISTEMA); } catch { return []; }
  const lista = [];
  for (const nome of arquivos.filter(a => /\.(md|txt)$/i.test(a) && !/^leia-me/i.test(a))) {
    const texto = await fs.readFile(path.join(PASTA_SISTEMA, nome), "utf8");
    const titulo = texto.match(/^#\s+(.+)$/m)?.[1]?.trim() || nome.replace(/\.(md|txt)$/i, "");
    lista.push({ id: `sistema:${nome}`, titulo, origem: "sistema", criadoEm: null, texto });
  }
  return lista;
}

async function carregarEnvios() {
  try { return JSON.parse(await fs.readFile(ARQUIVO_ENVIOS, "utf8")); } catch { return []; }
}

async function salvarEnvios() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const envios = docs.filter(d => d.origem === "envio");
  await fs.writeFile(ARQUIVO_ENVIOS, JSON.stringify(envios));
}

function indexar() {
  const trechos = [];
  for (const d of docs) {
    for (const texto of dividirEmTrechos(d.texto)) {
      const toks = tokens(`${d.titulo} ${texto}`);
      const tf = new Map();
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
      trechos.push({ docId: d.id, titulo: d.titulo, texto, tf, len: toks.length });
    }
  }
  const df = new Map();
  for (const tr of trechos) for (const t of tr.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const mediaLen = trechos.reduce((s, t) => s + t.len, 0) / (trechos.length || 1);
  indice = { trechos, df, mediaLen };
}

async function garantir() {
  if (docs) return;
  docs = [...await carregarSistema(), ...await carregarEnvios()];
  indexar();
}

export async function buscarNaBiblioteca(consulta, limite = 5) {
  await garantir();
  const q = [...new Set(tokens(consulta))];
  if (!q.length || !indice.trechos.length) return [];
  const N = indice.trechos.length, k1 = 1.4, b = 0.75;

  return indice.trechos
    .map(tr => {
      let score = 0;
      for (const t of q) {
        const f = tr.tf.get(t);
        if (!f) continue;
        const idf = Math.log(1 + (N - indice.df.get(t) + 0.5) / (indice.df.get(t) + 0.5));
        score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * tr.len / indice.mediaLen));
      }
      return { score, documento: tr.titulo, docId: tr.docId, trecho: tr.texto };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map(r => ({ ...r, score: Math.round(r.score * 100) / 100 }));
}

export async function listarDocumentos() {
  await garantir();
  return docs.map(d => ({
    id: d.id, titulo: d.titulo, origem: d.origem, criadoEm: d.criadoEm,
    caracteres: d.texto.length, trechos: dividirEmTrechos(d.texto).length
  }));
}

export async function adicionarDocumento({ titulo, texto }) {
  await garantir();
  const t = String(texto || "").trim();
  if (t.length < 20) throw new Error("O documento está vazio ou muito curto.");
  const doc = {
    id: `envio:${crypto.randomUUID()}`,
    titulo: String(titulo || "").trim().slice(0, 160) || t.slice(0, 60),
    origem: "envio",
    criadoEm: new Date().toISOString(),
    texto: t.slice(0, 2_000_000)
  };
  docs.push(doc);
  await salvarEnvios();
  indexar();
  return { id: doc.id, titulo: doc.titulo, trechos: dividirEmTrechos(doc.texto).length };
}

export async function removerDocumento(id) {
  await garantir();
  const alvo = docs.find(d => d.id === id);
  if (!alvo) throw new Error("Documento não encontrado.");
  if (alvo.origem !== "envio") throw new Error("Documentos do sistema só podem ser alterados no repositório.");
  docs = docs.filter(d => d.id !== id);
  await salvarEnvios();
  indexar();
  return { removido: id };
}

export async function extrairTextoArquivo(nome, base64) {
  const buf = Buffer.from(base64, "base64");
  if (/\.pdf$/i.test(nome)) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n\n") : text;
  }
  if (/\.(txt|md|csv|json)$/i.test(nome)) return buf.toString("utf8");
  throw new Error("Formato não suportado. Envie PDF, TXT, MD, CSV ou JSON.");
}

export const persistente = () => Boolean(process.env.DATA_DIR);
