import express from "express";
import { buscarLicitacoes, radarLicitacoes, resumoPorSegmento } from "./sources/pncp.js";
import { buscarDiariosOficiais } from "./sources/diarios.js";
import { buscarNoticias } from "./sources/noticias.js";
import { perfilMunicipio } from "./sources/ibge.js";
import { geologiaNoPonto } from "./sources/geologia.js";
import { INDICADORES, NOTA_INDICADORES, MARCO_LEGAL, CONCESSOES, PLAYERS, CENTRIFUGAS, FONTES_OFICIAIS, ATUALIZADO_EM } from "./knowledge/base.js";
import { estimarMercadoLodo, PROCESSOS } from "./knowledge/mercadoLodo.js";
import { consultarAssessor, provedorIA } from "./assessor.js";

// =====================================
// API /api/saneamento — plataforma de inteligência de mercado
// =====================================

export const saneamentoRouter = express.Router();

const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    console.error("[saneamento]", err.message);
    res.status(502).json({ erro: err.message });
  }
};

saneamentoRouter.get("/painel", handle(async () => ({
  atualizadoEm: ATUALIZADO_EM,
  indicadores: INDICADORES,
  notaIndicadores: NOTA_INDICADORES,
  marcoLegal: MARCO_LEGAL,
  concessoes: CONCESSOES,
  players: PLAYERS,
  centrifugas: CENTRIFUGAS,
  fontes: FONTES_OFICIAIS,
  processosLodo: Object.fromEntries(Object.entries(PROCESSOS).map(([k, v]) => [k, v.nome])),
  assessorAtivo: Boolean(provedorIA()),
  provedorIA: provedorIA()
})));

saneamentoRouter.get("/licitacoes", handle(async (req) => {
  const { q, uf, status } = req.query;
  const r = q ? await buscarLicitacoes({ q, uf, status }) : await radarLicitacoes({ uf });
  return { ...r, resumoPorSegmento: resumoPorSegmento(r.items) };
}));

saneamentoRouter.get("/diarios", handle((req) =>
  buscarDiariosOficiais({ termo: req.query.termo || "estação de tratamento de esgoto", dias: Number(req.query.dias) || 30 })
));

saneamentoRouter.get("/noticias", handle((req) =>
  buscarNoticias({ tema: req.query.tema, consulta: req.query.q })
));

saneamentoRouter.get("/municipio", handle(async (req) => {
  if (!req.query.nome) throw new Error("Informe ?nome=Município&uf=UF");
  const perfil = await perfilMunicipio(req.query.nome, req.query.uf);
  const geologia = perfil.centroide ? await geologiaNoPonto(perfil.centroide.lat, perfil.centroide.lon) : null;
  return { ...perfil, geologia };
}));

saneamentoRouter.get("/geologia", handle((req) => {
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("Informe ?lat=&lon=");
  return geologiaNoPonto(lat, lon);
}));

saneamentoRouter.post("/mercado-lodo", handle(async (req) => estimarMercadoLodo(req.body || {})));

saneamentoRouter.post("/assessor", handle(async (req) => {
  const { historico, mensagem, modo } = req.body || {};
  const hist = Array.isArray(historico) ? historico : [];
  if (mensagem) hist.push({ role: "user", content: String(mensagem) });
  if (!hist.length) throw new Error("Envie 'mensagem' ou 'historico'.");
  return consultarAssessor({ historico: hist, modo: modo === "estudo" ? "estudo" : "chat" });
}));
