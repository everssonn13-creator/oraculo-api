// =====================================
// Oráculo do Saneamento — arena de conversa com painéis visuais
// =====================================
const API = "/api/saneamento";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
const fmt = (v, d = 0) => v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d });
const fmtCompacto = (v) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${fmt(v / 1e9, 1)} bi`;
  if (a >= 1e6) return `${fmt(v / 1e6, 1)} mi`;
  if (a >= 1e4) return `${fmt(v / 1e3, 0)} mil`;
  return fmt(v, 1);
};
const erroHtml = (e) => `<div class="erro">⚠ ${esc(e.message || e)}</div>`;
const md = (t) => window.marked && window.DOMPurify ? DOMPurify.sanitize(marked.parse(t || "")) : esc(t).replace(/\n/g, "<br>");

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } }
};

async function api(path, opts = {}) {
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || `Erro ${res.status}`);
  return data;
}

/* ---------- tooltip ---------- */
const tip = $("#tooltip");
function mostrarTip(html, ev) {
  tip.innerHTML = html;
  tip.classList.add("vis");
  const x = Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
  const y = Math.max(ev.clientY - tip.offsetHeight - 10, 8);
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}
const esconderTip = () => tip.classList.remove("vis");

/* ---------- estado ---------- */
let INFO = { regioes: {}, ufs: {} };
let MAPA = null;
let foco = store.get("foco", { tipo: "brasil" });
let historico = store.get("historico2", []); // [{ role, content, visuais?, ferramentas?, baseUsada?, foco? }]

const ufsDoFoco = (f = foco) =>
  f.tipo === "uf" ? [f.valor] : f.tipo === "regiao" ? Object.keys(INFO.ufs).filter(u => INFO.ufs[u].regiao === f.valor) : [];
const rotuloFoco = (f = foco) =>
  f.tipo === "uf" ? INFO.ufs[f.valor]?.nome || f.valor : f.tipo === "regiao" ? INFO.regioes[f.valor] || f.valor : "Brasil";

/* ---------- mapa (estilo "luzes à noite") ---------- */
// Gerador pseudoaleatório com semente: as luzes ficam sempre no mesmo lugar para cada estado
function aleatorio(semente) {
  let h = 2166136261;
  for (const c of semente) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let contadorMapas = 0;
const NIVEIS = 5;

function desenharMapa(el, { destacar = [], valores = null, rotuloValor = "", interativo = false, aoSelecionar } = {}) {
  if (!MAPA) { el.innerHTML = `<div class="nota">mapa indisponível</div>`; return; }
  const id = `m${++contadorMapas}`;
  const nums = valores ? Object.values(valores).filter(v => Number.isFinite(v)) : [];
  const min = Math.min(...nums), max = Math.max(...nums);
  const nivel = (v) => max === min ? NIVEIS - 1 : Math.min(NIVEIS - 1, Math.floor(((v - min) / (max - min)) * NIVEIS));
  const foco = new Set(destacar);
  const emFoco = (uf) => valores ? Number.isFinite(valores[uf]) && (foco.size === 0 || foco.has(uf)) : foco.has(uf);

  el.classList.toggle("interativo", interativo);
  el.innerHTML = `
  <svg viewBox="${MAPA.viewBox}" role="img" aria-label="Mapa do Brasil" class="mapa-noite">
    <defs>
      <filter id="${id}-gv" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="${id}-gl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <pattern id="${id}-pt" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r=".55" fill="#3dffa8" opacity=".32"/></pattern>
      <pattern id="${id}-po" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#ffb347" opacity=".45"/></pattern>
      <radialGradient id="${id}-polo"><stop offset="0" stop-color="#fff7d6"/><stop offset=".35" stop-color="#ffc04d"/><stop offset="1" stop-color="#ff7a00" stop-opacity="0"/></radialGradient>
    </defs>
    <g class="estados">${MAPA.estados.map(e => {
      const v = valores?.[e.uf];
      const n = Number.isFinite(v) ? nivel(v) : -1;
      const cls = emFoco(e.uf) ? `foco n${n}` : (valores && n < 0 ? "sem-dado" : "base");
      return `<path id="${id}-${e.uf}" d="${e.path}" data-uf="${e.uf}" class="${cls}"/>`;
    }).join("")}</g>
    <g class="textura" pointer-events="none">${MAPA.estados.map(e =>
      `<use href="#${id}-${e.uf}" fill="url(#${id}-${emFoco(e.uf) ? "po" : "pt"})"/>`).join("")}</g>
    <g class="bordas-verdes" filter="url(#${id}-gv)" pointer-events="none">${MAPA.estados.filter(e => !emFoco(e.uf)).map(e => `<use href="#${id}-${e.uf}"/>`).join("")}</g>
    <g class="bordas-laranja" filter="url(#${id}-gl)" pointer-events="none">${MAPA.estados.filter(e => emFoco(e.uf)).map(e => `<use href="#${id}-${e.uf}"/>`).join("")}</g>
    <g class="rede" filter="url(#${id}-gv)" pointer-events="none"></g>
    <g class="luzes" pointer-events="none"></g>
    <g class="polos" pointer-events="none"></g>
  </svg>
  <div class="legenda-noite">${valores && nums.length ? `
      <span>${esc(fmtCompacto(min))}</span><span class="rampa-laranja"></span><span>${esc(fmtCompacto(max))}</span>
      <span>${esc(rotuloValor || "")}</span><span class="item"><i class="sd"></i>sem dado</span>`
    : `<span class="item"><i class="laranja"></i>${foco.size ? "Região em foco" : "Brasil"}</span>
       ${foco.size ? `<span class="item"><i class="verde"></i>Demais estados</span>` : ""}
       <span class="item"><i class="polo"></i>Centro do estado</span><span class="item nota">luzes ilustrativas</span>`}</div>`;

  const svg = $("svg", el);
  const NS = "http://www.w3.org/2000/svg";
  const gLuzes = $(".luzes", svg), gRede = $(".rede", svg), gPolos = $(".polos", svg);
  const frag = { luzes: document.createDocumentFragment(), rede: document.createDocumentFragment(), polos: document.createDocumentFragment() };
  const ponto = (x, y) => (window.DOMPoint ? new DOMPoint(x, y) : { x, y });
  const destacado = foco.size > 0 || Boolean(valores);

  // Luzes: pontos aleatórios dentro de cada estado; mais densas e alaranjadas na região em foco
  MAPA.estados.forEach(e => {
    const path = svg.getElementById(`${id}-${e.uf}`);
    if (!path?.isPointInFill) return;
    const bb = path.getBBox();
    if (!bb.width || !bb.height) return;
    const rnd = aleatorio(e.uf);
    const quente = emFoco(e.uf) || !destacado;
    const n = Math.round(Math.min(70, Math.max(10, Math.sqrt(bb.width * bb.height) * (quente ? 0.75 : 0.35))));
    const pts = [];
    for (let t = 0; t < n * 8 && pts.length < n; t++) {
      const x = bb.x + rnd() * bb.width, y = bb.y + rnd() * bb.height;
      try { if (path.isPointInFill(ponto(x, y))) pts.push([x, y]); } catch { return; }
    }
    // polo: ponto mais próximo do centro do estado
    const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    const polo = pts.reduce((m, p) => (Math.hypot(p[0] - cx, p[1] - cy) < Math.hypot(m[0] - cx, m[1] - cy) ? p : m), pts[0] || [cx, cy]);

    pts.forEach(([x, y]) => {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", x.toFixed(1)); c.setAttribute("cy", y.toFixed(1));
      c.setAttribute("r", (0.5 + rnd() * (quente ? 1.3 : 0.8)).toFixed(2));
      c.setAttribute("class", quente && destacado ? "luz-quente" : quente ? "luz-quente suave" : "luz-fria");
      c.style.animationDelay = `${(rnd() * 4).toFixed(2)}s`;
      frag.luzes.appendChild(c);
    });

    if (quente && destacado) {
      // rede: linhas do polo para as luzes do estado
      pts.forEach(([x, y], i) => {
        if (i % 2) return;
        const l = document.createElementNS(NS, "line");
        l.setAttribute("x1", polo[0].toFixed(1)); l.setAttribute("y1", polo[1].toFixed(1));
        l.setAttribute("x2", x.toFixed(1)); l.setAttribute("y2", y.toFixed(1));
        l.style.animationDelay = `${(rnd() * 3).toFixed(2)}s`;
        frag.rede.appendChild(l);
      });
    }
    if (quente) {
      const g = document.createElementNS(NS, "circle");
      g.setAttribute("cx", polo[0].toFixed(1)); g.setAttribute("cy", polo[1].toFixed(1));
      g.setAttribute("r", destacado ? "7" : "4.5");
      g.setAttribute("fill", `url(#${id}-polo)`);
      g.setAttribute("class", "polo");
      frag.polos.appendChild(g);
    }
  });
  gLuzes.appendChild(frag.luzes); gRede.appendChild(frag.rede); gPolos.appendChild(frag.polos);

  svg.querySelectorAll(".estados path").forEach(p => {
    const uf = p.dataset.uf;
    p.addEventListener("mousemove", (ev) => {
      const v = valores?.[uf];
      mostrarTip(`<b>${esc(INFO.ufs[uf]?.nome || uf)}</b>${valores ? `<br>${Number.isFinite(v) ? `${fmt(v, 1)} ${esc(rotuloValor || "")}` : "sem dado"}` : ""}`, ev);
    });
    p.addEventListener("mouseleave", esconderTip);
    if (interativo) p.addEventListener("click", () => aoSelecionar?.(uf));
  });
}

/* ---------- foco ---------- */
function definirFoco(novo) {
  foco = novo;
  store.set("foco", foco);
  $("#sel-foco").value = foco.tipo === "brasil" ? "brasil" : `${foco.tipo}:${foco.valor}`;
  desenharMapa($("#mapa-inicio"), { destacar: ufsDoFoco(), interativo: true, aoSelecionar: ufClicada });
  document.querySelectorAll(".chip-regiao").forEach(c => c.classList.toggle("ativo", c.dataset.foco === $("#sel-foco").value));
}
function ufClicada(uf) {
  definirFoco(foco.tipo === "uf" && foco.valor === uf ? { tipo: "brasil" } : { tipo: "uf", valor: uf });
}
function montarSeletores() {
  const sel = $("#sel-foco");
  sel.innerHTML = `<option value="brasil">Brasil</option>
    <optgroup label="Regiões">${Object.entries(INFO.regioes).map(([k, v]) => `<option value="regiao:${k}">${esc(v)}</option>`).join("")}</optgroup>
    <optgroup label="Estados">${Object.entries(INFO.ufs).sort((a, b) => a[1].nome.localeCompare(b[1].nome)).map(([k, v]) => `<option value="uf:${k}">${esc(v.nome)}</option>`).join("")}</optgroup>`;
  sel.addEventListener("change", () => {
    const [tipo, valor] = sel.value.split(":");
    definirFoco(tipo === "brasil" ? { tipo: "brasil" } : { tipo, valor });
  });
  $("#chips-regiao").innerHTML = [["brasil", "Brasil"], ...Object.entries(INFO.regioes).map(([k, v]) => [`regiao:${k}`, v])]
    .map(([k, v]) => `<button type="button" class="chip-regiao" data-foco="${k}">${esc(v)}</button>`).join("");
  document.querySelectorAll(".chip-regiao").forEach(c => c.addEventListener("click", () => {
    const [tipo, valor] = c.dataset.foco.split(":");
    definirFoco(tipo === "brasil" ? { tipo: "brasil" } : { tipo, valor });
  }));
}

/* ---------- painéis ---------- */
const ehUrl = (s) => /^https?:\/\/\S+$/i.test(String(s).trim());

function renderPainel(p) {
  const el = document.createElement("section");
  el.className = "painel card-vidro";
  const temMapa = Boolean(p.mapa);
  const graficos = p.graficos || [];

  el.innerHTML = `
    <div class="painel-cab"><h3>${esc(p.titulo)}</h3></div>
    ${p.kpis?.length ? `<div class="kpis">${p.kpis.map(k => `
      <div class="kpi"><div class="v">${esc(k.valor)}</div><div class="r">${esc(k.rotulo)}</div>
        ${k.detalhe || k.fonte ? `<div class="d">${esc([k.detalhe, k.fonte && `fonte: ${k.fonte}`].filter(Boolean).join(" · "))}</div>` : ""}</div>`).join("")}</div>` : ""}
    ${temMapa || graficos.length ? `<div class="painel-grade ${temMapa && graficos.length ? "" : "so-um"}">
      ${temMapa ? `<div class="bloco"><h4>${esc(p.mapa.valores ? `Mapa — ${p.mapa.rotuloValor || "valores por estado"}` : "Região analisada")}</h4><div class="mapa"></div></div>` : ""}
      ${graficos.length ? `<div class="graficos" style="display:grid;gap:16px">${graficos.map((g, gi) => `
        <div class="bloco"><h4>${esc(g.titulo)} ${g.unidade ? `<small>(${esc(g.unidade)})</small>` : ""}</h4>
          <div class="barras" data-g="${gi}"></div></div>`).join("")}</div>` : ""}
    </div>` : ""}
    ${p.tabela ? `<div class="bloco">${p.tabela.titulo ? `<h4>${esc(p.tabela.titulo)}</h4>` : ""}
      <div class="tabela-wrap"><table><thead><tr>${p.tabela.colunas.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${p.tabela.linhas.map(l => `<tr>${l.map(c => `<td>${ehUrl(c) ? `<a href="${esc(c)}" target="_blank" rel="noopener">abrir ↗</a>` : esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>` : ""}
    ${p.fontes?.length ? `<div class="fontes">Fontes: ${p.fontes.map(f => f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.nome)}</a>` : `<span class="f">${esc(f.nome)}</span>`).join("")}</div>` : ""}`;

  // desenha depois que o painel entra na tela (as luzes precisam das medidas reais do SVG)
  if (temMapa) requestAnimationFrame(() => desenharMapa($(".mapa", el), p.mapa));

  graficos.forEach((g, gi) => {
    const max = Math.max(...g.itens.map(i => Math.abs(i.valor)), 1);
    const box = el.querySelector(`.barras[data-g="${gi}"]`);
    box.innerHTML = g.itens.map(i => `
      <div class="barra"><span class="rot">${esc(i.rotulo)}</span>
        <span class="trilha"><span class="preench" style="width:${(Math.abs(i.valor) / max) * 82}%"></span><span class="val">${esc(fmtCompacto(i.valor))}</span></span></div>`).join("");
    box.querySelectorAll(".barra").forEach((b, i) => {
      const it = g.itens[i];
      b.addEventListener("mousemove", (ev) => mostrarTip(`<b>${esc(it.rotulo)}</b><br>${fmt(it.valor, 2)} ${esc(g.unidade || "")}`, ev));
      b.addEventListener("mouseleave", esconderTip);
    });
  });
  return el;
}

/* ---------- conversa ---------- */
const conversa = $("#conversa");

function addUsuario(texto, f) {
  const div = document.createElement("div");
  div.className = "msg-user";
  div.innerHTML = `${f && f.tipo !== "brasil" ? `<span class="foco-tag">📍 ${esc(rotuloFoco(f))}</span>` : ""}${esc(texto).replace(/\n/g, "<br>")}`;
  conversa.appendChild(div);
}

function addAssistente({ content, visuais = [], ferramentas = [], baseUsada = [] }, pensando = false) {
  const div = document.createElement("div");
  div.className = "msg-ai";
  div.innerHTML = `<div class="ai-orb pequeno ${pensando ? "pensando" : ""}"><span></span></div><div class="corpo"></div>`;
  const corpo = $(".corpo", div);
  if (pensando) {
    corpo.innerHTML = `<div class="texto-ai"><span class="pensando-txt">${esc(content)}</span></div>`;
  } else {
    visuais.forEach(v => corpo.appendChild(renderPainel(v)));
    const t = document.createElement("div");
    t.className = "texto-ai";
    t.innerHTML = md(content);
    t.querySelectorAll("a").forEach(a => { a.target = "_blank"; a.rel = "noopener"; });
    corpo.appendChild(t);
    if (ferramentas.length || baseUsada.length) {
      corpo.insertAdjacentHTML("beforeend", `<div class="meta-ai">
        ${baseUsada.map(b => `<span class="tag base">📚 ${esc(b)}</span>`).join("")}
        ${ferramentas.filter(f => f.ferramenta !== "exibir_painel").map(f => `<span class="tag ${f.ok ? "ok" : "falha"}">⟲ ${esc(f.ferramenta.replace(/_/g, " "))}</span>`).join("")}</div>`);
    }
  }
  conversa.appendChild(div);
  return div;
}

function rolarFim() {
  requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
}

function atualizarModo() {
  $("#boas-vindas").hidden = historico.length > 0;
}

function salvarHistorico() {
  store.set("historico2", historico.slice(-20));
}

const pausa = (ms) => new Promise(r => setTimeout(r, ms));

// Consulta o andamento da análise até terminar; tolera quedas de conexão do celular
async function acompanharTarefa(id, pensando) {
  const txt = () => $(".pensando-txt", pensando);
  let falhas = 0;
  const inicio = Date.now();
  while (Date.now() - inicio < 20 * 60 * 1000) {
    await pausa(2000);
    let t;
    try {
      t = await api(`/assessor/${encodeURIComponent(id)}`);
      falhas = 0;
    } catch (e) {
      if (/não encontrada/i.test(e.message)) throw e;
      if (++falhas > 30) throw new Error("Sem conexão com o servidor. Verifique a internet e tente novamente.");
      if (txt()) txt().textContent = "Conexão instável — continuo aguardando a análise";
      continue;
    }
    if (t.status === "concluida") return t.resultado;
    if (t.status === "erro") throw new Error(t.erro || "Falha na análise.");
    if (t.etapa && txt()) txt().textContent = t.etapa;
  }
  throw new Error("A análise demorou demais. Tente novamente, talvez sem o modo Estudo completo.");
}

function mostrarResultado(r, pensando) {
  pensando.remove();
  const msg = { role: "assistant", content: r.resposta, visuais: r.visuais || [], ferramentas: r.ferramentas || [], baseUsada: r.baseUsada || [] };
  historico.push(msg);
  salvarHistorico();
  const el = addAssistente(msg);
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function mostrarFalha(e, pensando) {
  $(".corpo", pensando).innerHTML = erroHtml(e);
  $(".ai-orb", pensando).classList.remove("pensando");
  // remove a pergunta sem resposta para não confundir o contexto da próxima
  if (historico.at(-1)?.role === "user") historico.pop();
  salvarHistorico();
}

async function perguntar(texto) {
  const modo = $("#modo-estudo").checked ? "estudo" : "chat";
  const focoAtual = { ...foco };
  historico.push({ role: "user", content: texto, foco: focoAtual });
  salvarHistorico();
  atualizarModo();
  addUsuario(texto, focoAtual);
  const pensando = addAssistente({
    content: modo === "estudo" ? "Iniciando o estudo de mercado" : "Iniciando a análise"
  }, true);
  rolarFim();
  $("#form-chat .enviar").disabled = true;

  try {
    const { id } = await api("/assessor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ historico: historico.map(({ role, content }) => ({ role, content })), modo, foco: focoAtual })
    });
    store.set("tarefaPendente", id);
    mostrarResultado(await acompanharTarefa(id, pensando), pensando);
  } catch (e) {
    mostrarFalha(e, pensando);
  } finally {
    store.set("tarefaPendente", null);
    $("#form-chat .enviar").disabled = false;
  }
}

// Se a página recarregou no meio de uma análise (comum no celular), retoma o acompanhamento
async function retomarPendente() {
  const id = store.get("tarefaPendente", null);
  if (!id || historico.at(-1)?.role !== "user") return;
  const pensando = addAssistente({ content: "Retomando a análise em andamento" }, true);
  rolarFim();
  $("#form-chat .enviar").disabled = true;
  try {
    mostrarResultado(await acompanharTarefa(id, pensando), pensando);
  } catch (e) {
    mostrarFalha(e, pensando);
  } finally {
    store.set("tarefaPendente", null);
    $("#form-chat .enviar").disabled = false;
  }
}

const entrada = $("#entrada");
entrada.addEventListener("input", () => { entrada.style.height = "auto"; entrada.style.height = `${Math.min(entrada.scrollHeight, 160)}px`; });
entrada.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#form-chat").requestSubmit(); }
});
$("#form-chat").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = entrada.value.trim();
  if (!t || $("#form-chat .enviar").disabled) return;
  entrada.value = "";
  entrada.style.height = "auto";
  perguntar(t);
});
document.querySelectorAll("#sugestoes button").forEach(b => b.addEventListener("click", () => {
  if (b.dataset.estudo) $("#modo-estudo").checked = true;
  perguntar(b.textContent.trim());
}));
$("#btn-nova").addEventListener("click", () => {
  historico = [];
  salvarHistorico();
  conversa.innerHTML = "";
  atualizarModo();
  window.scrollTo({ top: 0 });
});

/* ---------- base de conhecimento ---------- */
const gaveta = $("#gaveta"), veu = $("#veu");
const abrirGaveta = (abrir) => {
  gaveta.classList.toggle("aberta", abrir);
  veu.classList.toggle("ativo", abrir);
  gaveta.setAttribute("aria-hidden", String(!abrir));
  if (abrir) carregarDocs();
};
$("#btn-base").addEventListener("click", () => abrirGaveta(true));
$("#fechar-gaveta").addEventListener("click", () => abrirGaveta(false));
veu.addEventListener("click", () => abrirGaveta(false));

let exigeSenha = false;
async function carregarDocs() {
  const lista = $("#lista-docs");
  lista.innerHTML = `<li class="nota">carregando…</li>`;
  try {
    const r = await api("/conhecimento");
    exigeSenha = r.exigeSenha;
    $("#campo-senha").hidden = !exigeSenha;
    $("#aviso-persistencia").innerHTML = r.persistente ? "" :
      `<div class="aviso">⚠ Armazenamento temporário: documentos enviados por aqui somem quando o servidor é atualizado. Para guardar de forma permanente, configure um Volume na Railway (variável DATA_DIR).</div>`;
    lista.innerHTML = r.documentos.length ? r.documentos.map(d => `
      <li><div><b>${esc(d.titulo)}</b><small>${d.origem === "sistema" ? "base do sistema" : `enviado em ${new Date(d.criadoEm).toLocaleDateString("pt-BR")}`} · ${d.trechos} trecho(s)</small></div>
        ${d.origem === "envio" ? `<button type="button" data-id="${esc(d.id)}">remover</button>` : ""}</li>`).join("")
      : `<li class="nota">Nenhum documento ainda.</li>`;
    lista.querySelectorAll("button[data-id]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("Remover este documento da base?")) return;
      try {
        await api(`/conhecimento/${encodeURIComponent(b.dataset.id)}`, { method: "DELETE", headers: { "x-admin-senha": $("#campo-senha").value } });
        carregarDocs();
      } catch (e) { alert(e.message); }
    }));
  } catch (e) { lista.innerHTML = `<li>${erroHtml(e)}</li>`; }
}

const lerBase64 = (arquivo) => new Promise((ok, falha) => {
  const fr = new FileReader();
  fr.onload = () => ok(String(fr.result).split(",")[1]);
  fr.onerror = () => falha(new Error("Não foi possível ler o arquivo."));
  fr.readAsDataURL(arquivo);
});

$("#form-doc").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, status = $("#doc-status"), btn = $("button", f);
  const arquivo = f.arquivo.files[0];
  if (!arquivo && f.texto.value.trim().length < 20) { status.textContent = "Cole um texto (mín. 20 caracteres) ou escolha um arquivo."; return; }
  if (arquivo && arquivo.size > 15 * 1024 * 1024) { status.textContent = "Arquivo acima de 15 MB."; return; }
  btn.disabled = true;
  status.textContent = arquivo ? "Lendo o arquivo…" : "Salvando…";
  try {
    const body = { titulo: f.titulo.value.trim() };
    if (arquivo) Object.assign(body, { arquivoNome: arquivo.name, arquivoBase64: await lerBase64(arquivo) });
    else body.texto = f.texto.value;
    const r = await api("/conhecimento", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-senha": f.senha.value }, body: JSON.stringify(body) });
    status.textContent = `✓ "${r.titulo}" adicionado (${r.trechos} trecho(s)).`;
    f.titulo.value = ""; f.texto.value = ""; f.arquivo.value = "";
    $(".arquivo span", f).textContent = "📎 ou escolha um arquivo (PDF, TXT, MD, CSV)";
    carregarDocs();
  } catch (err) {
    status.textContent = `⚠ ${err.message}`;
  } finally { btn.disabled = false; }
});
$("#form-doc").arquivo.addEventListener("change", (e) => {
  const a = e.target.files[0];
  $(".arquivo span").textContent = a ? `📎 ${a.name}` : "📎 ou escolha um arquivo (PDF, TXT, MD, CSV)";
});

/* ---------- início ---------- */
(async function iniciar() {
  const [painel, mapa] = await Promise.allSettled([api("/painel"), fetch("brasil-mapa.json").then(r => r.json())]);
  if (mapa.status === "fulfilled") MAPA = mapa.value;
  const st = $("#status");
  if (painel.status === "fulfilled") {
    INFO = painel.value;
    st.innerHTML = `<i class="dot"></i> ${INFO.assessorAtivo ? `IA online · ${esc(INFO.modeloIA || (INFO.provedorIA === "claude" ? "Claude" : "OpenAI"))}` : "IA offline — configure a chave da OpenAI"}`;
    if (INFO.assessorAtivo) st.classList.add("ok");
  } else {
    st.innerHTML = `<i class="dot"></i> ${esc(painel.reason.message)}`;
  }
  montarSeletores();
  definirFoco(foco);
  historico.forEach(m => m.role === "user" ? addUsuario(m.content, m.foco) : addAssistente(m));
  atualizarModo();
  if (historico.length) rolarFim();
  retomarPendente();
})();
