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

/* ---------- mapa ---------- */
const RAMPA = ["--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5"].map(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim());

function desenharMapa(el, { destacar = [], valores = null, rotuloValor = "", interativo = false, aoSelecionar } = {}) {
  if (!MAPA) { el.innerHTML = `<div class="nota">mapa indisponível</div>`; return; }
  const nums = valores ? Object.values(valores).filter(v => Number.isFinite(v)) : [];
  const min = Math.min(...nums), max = Math.max(...nums);
  const cor = (v) => {
    if (max === min) return RAMPA[3];
    const i = Math.min(4, Math.floor(((v - min) / (max - min)) * 5));
    return RAMPA[i];
  };
  const set = new Set(destacar);

  el.classList.toggle("interativo", interativo);
  el.innerHTML = `<svg viewBox="${MAPA.viewBox}" role="img" aria-label="Mapa do Brasil">${MAPA.estados.map(e => {
    const v = valores?.[e.uf];
    let cls = "neutro", fill = "";
    if (valores) {
      if (Number.isFinite(v)) { cls = "com-valor" + (set.has(e.uf) ? " destaque-borda" : ""); fill = `style="fill:${cor(v)}"`; }
      else cls = "sem-dado";
    } else if (set.has(e.uf)) cls = "destaque";
    return `<path d="${e.path}" data-uf="${e.uf}" class="${cls}" ${fill}><title>${esc(e.nome)}</title></path>`;
  }).join("")}</svg>${valores && nums.length ? `
    <div class="legenda"><span>${esc(fmtCompacto(min))}</span><span class="rampa"></span><span>${esc(fmtCompacto(max))}</span>
      <span>${esc(rotuloValor || "")}</span><span class="sd"><i></i> sem dado</span></div>` : ""}`;

  el.querySelectorAll("path").forEach(p => {
    p.querySelector("title")?.remove(); // usamos o tooltip próprio
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

  if (temMapa) desenharMapa($(".mapa", el), p.mapa);

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

async function perguntar(texto) {
  const modo = $("#modo-estudo").checked ? "estudo" : "chat";
  const focoAtual = { ...foco };
  historico.push({ role: "user", content: texto, foco: focoAtual });
  atualizarModo();
  addUsuario(texto, focoAtual);
  const pensando = addAssistente({
    content: modo === "estudo" ? "Montando o estudo de mercado: consultando a base própria e as fontes públicas" : "Analisando: consultando a base própria e as fontes públicas"
  }, true);
  rolarFim();
  $("#form-chat .enviar").disabled = true;

  try {
    const r = await api("/assessor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ historico: historico.map(({ role, content }) => ({ role, content })), modo, foco: focoAtual })
    });
    pensando.remove();
    const msg = { role: "assistant", content: r.resposta, visuais: r.visuais || [], ferramentas: r.ferramentas || [], baseUsada: r.baseUsada || [] };
    historico.push(msg);
    salvarHistorico();
    const el = addAssistente(msg);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    $(".corpo", pensando).innerHTML = erroHtml(e);
    $(".ai-orb", pensando).classList.remove("pensando");
    historico.pop();
  } finally {
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
    st.innerHTML = `<i class="dot"></i> ${INFO.assessorAtivo ? `IA online · ${INFO.provedorIA === "claude" ? "Claude" : "OpenAI"}` : "IA offline — configure a chave da OpenAI"}`;
    if (INFO.assessorAtivo) st.classList.add("ok");
  } else {
    st.innerHTML = `<i class="dot"></i> ${esc(painel.reason.message)}`;
  }
  montarSeletores();
  definirFoco(foco);
  historico.forEach(m => m.role === "user" ? addUsuario(m.content, m.foco) : addAssistente(m));
  atualizarModo();
  if (historico.length) rolarFim();
})();
