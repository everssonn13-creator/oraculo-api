import express from "express";
import { buscarLicitacoes, radarLicitacoes, resumoPorSegmento } from "./sources/pncp.js";
import { buscarDiariosOficiais } from "./sources/diarios.js";
import { buscarNoticias } from "./sources/noticias.js";
import { perfilMunicipio } from "./sources/ibge.js";
import { geologiaNoPonto } from "./sources/geologia.js";
import { INDICADORES, NOTA_INDICADORES, MARCO_LEGAL, CONCESSOES, PLAYERS, CENTRIFUGAS, FONTES_OFICIAIS, ATUALIZADO_EM } from "./knowledge/base.js";
import { estimarMercadoLodo, PROCESSOS } from "./knowledge/mercadoLodo.js";
import { consultarAssessor, provedorIA, modeloAtual } from "./assessor.js";
import { listarDocumentos, adicionarDocumento, removerDocumento, extrairTextoArquivo, persistente } from "./knowledge/biblioteca.js";
import { REGIOES, UFS } from "./knowledge/regioes.js";

// =====================================
// API /api/saneamento — plataforma de inteligência de mercado
// =====================================

export const saneamentoRouter = express.Router();

const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    console.error("[saneamento]", err.message);
    res.status(err.status || 502).json({ erro: err.message });
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
  regioes: REGIOES,
  ufs: Object.fromEntries(Object.entries(UFS).map(([k, v]) => [k, { nome: v.nome, regiao: v.regiao }])),
  assessorAtivo: Boolean(provedorIA()),
  provedorIA: provedorIA(),
  modeloIA: provedorIA() ? modeloAtual() : null
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
  const { historico, mensagem, modo, foco } = req.body || {};
  const hist = Array.isArray(historico) ? historico : [];
  if (mensagem) hist.push({ role: "user", content: String(mensagem) });
  if (!hist.length) throw new Error("Envie 'mensagem' ou 'historico'.");
  const focoValido = foco && ["uf", "regiao"].includes(foco.tipo) && typeof foco.valor === "string"
    ? { tipo: foco.tipo, valor: foco.valor.slice(0, 40) }
    : { tipo: "brasil" };
  return consultarAssessor({ historico: hist, modo: modo === "estudo" ? "estudo" : "chat", foco: focoValido });
}));

// ---------- Base de conhecimento própria ----------
// Se SANEAMENTO_ADMIN_SENHA estiver definida, enviar/remover exige a senha no cabeçalho x-admin-senha
const exigirSenha = (req) => {
  const senha = process.env.SANEAMENTO_ADMIN_SENHA;
  if (senha && req.get("x-admin-senha") !== senha) {
    const err = new Error("Senha de administrador incorreta.");
    err.status = 401;
    throw err;
  }
};

saneamentoRouter.get("/conhecimento", handle(async () => ({
  documentos: await listarDocumentos(),
  persistente: persistente(),
  exigeSenha: Boolean(process.env.SANEAMENTO_ADMIN_SENHA)
})));

saneamentoRouter.post("/conhecimento", handle(async (req) => {
  exigirSenha(req);
  const { titulo, texto, arquivoNome, arquivoBase64 } = req.body || {};
  const conteudo = arquivoBase64 ? await extrairTextoArquivo(String(arquivoNome || ""), String(arquivoBase64)) : texto;
  return adicionarDocumento({ titulo: titulo || arquivoNome, texto: conteudo });
}));

saneamentoRouter.delete("/conhecimento/:id", handle(async (req) => {
  exigirSenha(req);
  return removerDocumento(req.params.id);
}));
