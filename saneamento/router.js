import express from "express";
import crypto from "node:crypto";
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
import { obterRadar, EMPRESA, PRODUTOS } from "./radar.js";

// =====================================
// API /api/saneamento — Centris IA (inteligência comercial do saneamento)
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
  modeloIA: provedorIA() ? modeloAtual() : null,
  empresa: EMPRESA,
  produtos: Object.fromEntries(PRODUTOS.map(p => [p.id, p.nome]))
})));

// Radar de compras: pré-calculado em segundo plano, responde na hora
saneamentoRouter.get("/radar", handle((req) =>
  obterRadar({ local: req.query.local ? String(req.query.local).slice(0, 80) : null, produto: req.query.produto || null })
));

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

  // Análises podem levar minutos: roda em segundo plano e o app consulta o andamento
  limparTarefas();
  const id = crypto.randomUUID();
  const tarefa = { status: "executando", etapas: [], criadaEm: Date.now() };
  tarefas.set(id, tarefa);
  consultarAssessor({
    historico: hist,
    modo: modo === "estudo" ? "estudo" : "chat",
    foco: focoValido,
    aoProgresso: (etapa) => { if (tarefa.etapas.at(-1) !== etapa) tarefa.etapas.push(etapa); }
  })
    .then(resultado => Object.assign(tarefa, { status: "concluida", resultado }))
    .catch(err => {
      console.error("[saneamento] assessor:", err.message);
      Object.assign(tarefa, { status: "erro", erro: err.message });
    });
  return { id };
}));

saneamentoRouter.get("/assessor/:id", handle(async (req) => {
  const tarefa = tarefas.get(req.params.id);
  if (!tarefa) {
    const err = new Error("Análise não encontrada (o servidor pode ter reiniciado). Envie a pergunta novamente.");
    err.status = 404;
    throw err;
  }
  return { status: tarefa.status, etapa: tarefa.etapas.at(-1) || null, etapas: tarefa.etapas, resultado: tarefa.resultado, erro: tarefa.erro };
}));

const tarefas = new Map();
function limparTarefas() {
  const limite = Date.now() - 60 * 60 * 1000;
  for (const [id, t] of tarefas) if (t.criadaEm < limite) tarefas.delete(id);
}

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
