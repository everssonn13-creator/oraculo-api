// =====================================
// Oráculo do Saneamento — símbolo da IA + análises que se moldam na tela
// =====================================
const API = "/api/saneamento";
const NS = "http://www.w3.org/2000/svg";

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
const md = (t) => window.marked && window.DOMPurify ? DOMPurify.sanitize(marked.parse(t || "")) : esc(t).replace(/\n/g, "<br>");
const pausa = (ms) => new Promise(r => setTimeout(r, ms));
let seqId = 0;
const novoId = () => `s${++seqId}`;

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
  tip.style.left = `${Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8)}px`;
  tip.style.top = `${Math.max(ev.clientY - tip.offsetHeight - 10, 8)}px`;
}
const esconderTip = () => tip.classList.remove("vis");

/* ---------- estado ---------- */
let INFO = { regioes: {}, ufs: {} };
let MAPA = null;
let foco = store.get("foco", { tipo: "brasil" });
let analises = store.get("analises", []); // [{ pergunta, foco, modo, resultado?, erro?, tarefa? }]
let atual = store.get("atual", analises.length - 1);

const ufsDoFoco = (f = foco) =>
  f.tipo === "uf" ? [f.valor] : f.tipo === "regiao" ? Object.keys(INFO.ufs).filter(u => INFO.ufs[u].regiao === f.valor) : [];
const rotuloFoco = (f = foco) =>
  f.tipo === "uf" ? INFO.ufs[f.valor]?.nome || f.valor : f.tipo === "regiao" ? INFO.regioes[f.valor] || f.valor : "Brasil";
const salvar = () => { store.set("analises", analises.slice(-15)); store.set("atual", atual); };

/* ---------- símbolo da IA: o Brasil como rede neural ---------- */
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

function desenharCerebro(el, { interativo = false, destacar = [], aoSelecionar, detalhado = true } = {}) {
  if (!MAPA) return;
  const id = novoId();
  const set = new Set(destacar);
  el.classList.toggle("interativo", interativo);
  el.innerHTML = `<svg viewBox="${MAPA.viewBox}" role="img" aria-label="Símbolo da IA">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#60a5fa"/><stop offset=".55" stop-color="#38bdf8"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs>
    <g stroke="url(#${id})">${MAPA.estados.map(e => `<path class="uf${set.has(e.uf) ? " foco" : ""}" data-uf="${e.uf}" d="${e.path}"/>`).join("")}</g>
    <g class="rede" stroke="url(#${id})"></g><g class="nos"></g></svg>`;
  const svg = $("svg", el);

  if (detalhado) {
    // neurônios: centro de cada estado + pontos internos; sinapses: ligações aos vizinhos mais próximos
    const nos = [];
    svg.querySelectorAll(".uf").forEach(p => {
      const bb = p.getBBox();
      if (!bb.width) return;
      const rnd = aleatorio(p.dataset.uf);
      const dentro = (x, y) => { try { return p.isPointInFill(new DOMPoint(x, y)); } catch { return true; } };
      const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
      if (dentro(cx, cy)) nos.push({ x: cx, y: cy, maior: true });
      const extras = Math.min(4, Math.max(1, Math.round(Math.sqrt(bb.width * bb.height) / 45)));
      for (let t = 0, n = 0; t < 40 && n < extras; t++) {
        const x = bb.x + rnd() * bb.width, y = bb.y + rnd() * bb.height;
        if (dentro(x, y)) { nos.push({ x, y, maior: false }); n++; }
      }
    });
    const rede = $(".rede", svg), gNos = $(".nos", svg);
    const vistos = new Set();
    nos.forEach((a, i) => {
      nos.map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) }))
        .filter(o => o.j !== i).sort((p, q) => p.d - q.d).slice(0, 3)
        .forEach(({ j }) => {
          const chave = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (vistos.has(chave)) return;
          vistos.add(chave);
          const b = nos[j];
          const l = document.createElementNS(NS, "line");
          l.setAttribute("x1", a.x.toFixed(1)); l.setAttribute("y1", a.y.toFixed(1));
          l.setAttribute("x2", b.x.toFixed(1)); l.setAttribute("y2", b.y.toFixed(1));
          l.setAttribute("class", vistos.size % 5 === 0 ? "sinapse pulso" : "sinapse");
          l.style.animationDelay = `${(vistos.size % 7) * 0.4}s`;
          rede.appendChild(l);
        });
    });
    nos.forEach((n, i) => {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", n.x.toFixed(1)); c.setAttribute("cy", n.y.toFixed(1));
      c.setAttribute("r", n.maior ? "4.2" : "2.4");
      c.setAttribute("class", n.maior ? "neuronio maior" : "neuronio");
      if (n.maior) { c.setAttribute("fill", `url(#${id})`); c.style.animationDelay = `${(i % 9) * 0.35}s`; }
      gNos.appendChild(c);
    });
  }

  if (interativo) {
    svg.querySelectorAll(".uf").forEach(p => {
      p.addEventListener("click", () => aoSelecionar?.(p.dataset.uf));
      p.addEventListener("mousemove", (ev) => mostrarTip(esc(INFO.ufs[p.dataset.uf]?.nome || p.dataset.uf), ev));
      p.addEventListener("mouseleave", esconderTip);
    });
  }
}

/* ---------- mapa de dados (estilo profissional) ---------- */
const RAMPA = ["--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5"].map(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim());

function desenharMapa(el, { destacar = [], valores = null, rotuloValor = "" } = {}) {
  if (!MAPA) { el.innerHTML = `<p class="nota">mapa indisponível</p>`; return; }
  const id = novoId();
  const nums = valores ? Object.values(valores).filter(Number.isFinite) : [];
  const min = Math.min(...nums), max = Math.max(...nums);
  const cor = (v) => max === min ? RAMPA[3] : RAMPA[Math.min(4, Math.floor(((v - min) / (max - min)) * 5))];
  const set = new Set(destacar);

  el.innerHTML = `<svg viewBox="${MAPA.viewBox}" role="img" aria-label="Mapa do Brasil">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset=".6" stop-color="#3b82f6"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs>
    ${MAPA.estados.map(e => {
      const v = valores?.[e.uf];
      if (valores) {
        return Number.isFinite(v)
          ? `<path d="${e.path}" data-uf="${e.uf}" fill="${cor(v)}" class="${set.has(e.uf) && set.size < 27 ? "foco-borda" : ""}"/>`
          : `<path d="${e.path}" data-uf="${e.uf}" class="sem-dado"/>`;
      }
      return set.has(e.uf) ? `<path d="${e.path}" data-uf="${e.uf}" fill="url(#${id})"/>` : `<path d="${e.path}" data-uf="${e.uf}" class="base"/>`;
    }).join("")}</svg>
    <div class="legenda">${valores && nums.length
      ? `<span>${esc(fmtCompacto(min))}</span><span class="rampa"></span><span>${esc(fmtCompacto(max))}</span><span>${esc(rotuloValor)}</span>
         <span class="item"><i style="background:#131c2b;border:1px solid #2a3850"></i>sem dado</span>`
      : set.size ? `<span class="item"><i style="background:linear-gradient(135deg,#2563eb,#38bdf8)"></i>Região analisada</span>` : ""}</div>`;

  el.querySelectorAll("path").forEach(p => {
    const uf = p.dataset.uf;
    p.addEventListener("mousemove", (ev) => {
      const v = valores?.[uf];
      mostrarTip(`<b>${esc(INFO.ufs[uf]?.nome || uf)}</b>${valores ? `<br>${Number.isFinite(v) ? `${fmt(v, 1)} ${esc(rotuloValor)}` : "sem dado"}` : ""}`, ev);
    });
    p.addEventListener("mouseleave", esconderTip);
  });
}

/* ---------- painel de uma análise ---------- */
const ehUrl = (s) => /^https?:\/\/\S+$/i.test(String(s).trim());

function renderVisual(p) {
  const frag = document.createDocumentFragment();
  const graficos = p.graficos || [];

  if (p.kpis?.length) {
    const k = document.createElement("div");
    k.className = "kpis";
    k.innerHTML = p.kpis.map(x => `<div class="kpi"><div class="v">${esc(x.valor)}</div><div class="r">${esc(x.rotulo)}</div>
      ${x.detalhe || x.fonte ? `<div class="d">${esc([x.detalhe, x.fonte && `fonte: ${x.fonte}`].filter(Boolean).join(" · "))}</div>` : ""}</div>`).join("");
    frag.appendChild(k);
  }

  if (p.mapa || graficos.length) {
    const g = document.createElement("div");
    g.className = `grade${p.mapa && graficos.length ? "" : " um"}`;
    if (p.mapa) {
      const c = document.createElement("div");
      c.className = "cartao";
      c.innerHTML = `<h3>${esc(p.mapa.valores ? (p.mapa.rotuloValor ? `Por estado — ${p.mapa.rotuloValor}` : "Por estado") : "Região analisada")}</h3><div class="mapa"></div>`;
      desenharMapa($(".mapa", c), p.mapa);
      g.appendChild(c);
    }
    if (graficos.length) {
      const col = document.createElement("div");
      col.className = "coluna";
      graficos.forEach(gr => {
        const c = document.createElement("div");
        c.className = "cartao";
        if (gr.tipo === "participacao") renderParticipacao(c, gr);
        else {
          const max = Math.max(...gr.itens.map(i => Math.abs(i.valor)), 1);
          c.innerHTML = `<h3>${esc(gr.titulo)} ${gr.unidade ? `<small>(${esc(gr.unidade)})</small>` : ""}</h3>
            <div class="barras">${gr.itens.map(i => `<div class="barra"><span class="rot">${esc(i.rotulo)}</span>
              <span class="trilho"><span class="preench" style="width:${(Math.abs(i.valor) / max) * 80}%"></span><span class="val">${esc(fmtCompacto(i.valor))}</span></span></div>`).join("")}</div>`;
          c.querySelectorAll(".barra").forEach((b, i) => {
            b.addEventListener("mousemove", (ev) => mostrarTip(`<b>${esc(gr.itens[i].rotulo)}</b><br>${fmt(gr.itens[i].valor, 2)} ${esc(gr.unidade || "")}`, ev));
            b.addEventListener("mouseleave", esconderTip);
          });
        }
        col.appendChild(c);
      });
      g.appendChild(col);
    }
    frag.appendChild(g);
  }

  if (p.tabela) {
    const t = document.createElement("div");
    t.className = "cartao";
    t.innerHTML = `${p.tabela.titulo ? `<h3>${esc(p.tabela.titulo)}</h3>` : ""}<div class="tabela"><table>
      <thead><tr>${p.tabela.colunas.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${p.tabela.linhas.map(l => `<tr>${l.map(c => `<td>${ehUrl(c) ? `<a href="${esc(c)}" target="_blank" rel="noopener">abrir ↗</a>` : esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    frag.appendChild(t);
  }

  if (p.insights?.length) {
    frag.appendChild(tituloSecao("Insights"));
    const box = document.createElement("div");
    box.className = "insights";
    const ROT = { oportunidade: "▲ Oportunidade", risco: "▼ Risco", tendencia: "◆ Tendência" };
    box.innerHTML = p.insights.map(i => `<div class="insight ${esc(i.tipo)}"><span class="rotulo">${ROT[i.tipo] || "◆ Insight"}</span>
      <h4>${esc(i.titulo)}</h4><p>${esc(i.texto)}</p></div>`).join("");
    frag.appendChild(box);
  }

  if (p.estrategias?.length) {
    frag.appendChild(tituloSecao("Estratégias para entrar no mercado"));
    const box = document.createElement("div");
    box.className = "estrategias";
    box.innerHTML = p.estrategias.map((e, i) => `<div class="estrategia"><span class="num">${i + 1}</span><div>
      <h4>${esc(e.titulo)}</h4>${e.descricao ? `<p>${esc(e.descricao)}</p>` : ""}
      ${e.acoes.length ? `<ul>${e.acoes.map(a => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
      ${e.prioridade || e.horizonte ? `<div class="tags">${e.prioridade ? `<span class="${e.prioridade === "alta" ? "alta" : ""}">Prioridade ${esc(e.prioridade)}</span>` : ""}${e.horizonte ? `<span>${esc(e.horizonte)}</span>` : ""}</div>` : ""}
    </div></div>`).join("");
    frag.appendChild(box);
    const nota = document.createElement("p");
    nota.className = "nota-estrategia";
    nota.textContent = "Recomendações do assessor com base nos dados acima — valide com sua realidade comercial.";
    frag.appendChild(nota);
  }
  return frag;
}

function tituloSecao(texto) {
  const h = document.createElement("h3");
  h.className = "secao-titulo";
  h.textContent = texto;
  return h;
}

// Composição de um total: barra 100% empilhada + legenda com valores (até 5 partes; o resto vira "Outros")
const CORES = ["--c1", "--c2", "--c3", "--c4", "--c5"].map(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim());
function renderParticipacao(c, gr) {
  let itens = [...gr.itens].filter(i => i.valor > 0).sort((a, b) => b.valor - a.valor);
  if (itens.length > 5) {
    const resto = itens.slice(4).reduce((s, i) => s + i.valor, 0);
    itens = [...itens.slice(0, 4), { rotulo: "Outros", valor: resto, outros: true }];
  }
  const total = itens.reduce((s, i) => s + i.valor, 0) || 1;
  const cor = (i, k) => i.outros ? getComputedStyle(document.documentElement).getPropertyValue("--c-outros").trim() : CORES[k];
  c.innerHTML = `<h3>${esc(gr.titulo)} ${gr.unidade ? `<small>(${esc(gr.unidade)})</small>` : ""}</h3>
    <div class="part-barra">${itens.map((i, k) => `<span style="width:${(i.valor / total) * 100}%;background:${cor(i, k)}"></span>`).join("")}</div>
    <div class="part-legenda">${itens.map((i, k) => `<div><i style="background:${cor(i, k)}"></i><span class="rot">${esc(i.rotulo)}</span>
      <span class="val">${esc(fmtCompacto(i.valor))}</span><span class="pct">${fmt((i.valor / total) * 100, 1)}%</span></div>`).join("")}</div>`;
  c.querySelectorAll(".part-barra span").forEach((sp, k) => {
    sp.addEventListener("mousemove", (ev) => mostrarTip(`<b>${esc(itens[k].rotulo)}</b><br>${fmt(itens[k].valor, 2)} ${esc(gr.unidade || "")} · ${fmt((itens[k].valor / total) * 100, 1)}%`, ev));
    sp.addEventListener("mouseleave", esconderTip);
  });
}

/* ---------- tela de sessão ---------- */
const palco = $("#analise");

function renderTrilha() {
  const trilha = $("#trilha");
  trilha.hidden = analises.length < 2;
  trilha.innerHTML = analises.map((a, i) => `<button type="button" class="${i === atual ? "ativa" : ""}" data-i="${i}" title="${esc(a.pergunta)}">${i + 1}. ${esc(a.pergunta)}</button>`).join("");
  trilha.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { atual = Number(b.dataset.i); salvar(); renderAnalise(); }));
  $(".ativa", trilha)?.scrollIntoView({ inline: "center", block: "nearest" });
}

function renderAnalise() {
  document.body.classList.toggle("sessao", analises.length > 0);
  document.body.classList.toggle("inicio", analises.length === 0);
  renderTrilha();
  const a = analises[atual];
  if (!a) { palco.innerHTML = ""; return; }

  palco.innerHTML = `<header class="analise-cab"><h2 class="pergunta">${esc(a.pergunta)}</h2>
    <div class="meta">${esc(rotuloFoco(a.foco))}${a.modo === "estudo" ? " · estudo completo" : ""}</div></header>`;

  if (!a.resultado && !a.erro) {
    palco.insertAdjacentHTML("beforeend", `<div class="pensando"><div class="cerebro pensando"></div><div class="etapa">${esc(a.etapa || "Analisando")}</div></div>`);
    requestAnimationFrame(() => desenharCerebro($(".pensando .cerebro", palco), { destacar: ufsDoFoco(a.foco) }));
    return;
  }
  if (a.erro) {
    palco.insertAdjacentHTML("beforeend", `<div class="erro">⚠ ${esc(a.erro)}</div>`);
    palco.appendChild(blocoProximas(a, [`Tentar novamente: ${a.pergunta}`]));
    return;
  }

  const r = a.resultado;
  (r.visuais || []).forEach(v => palco.appendChild(renderVisual(v)));
  if ((r.visuais || []).some(v => v.insights || v.estrategias)) palco.appendChild(tituloSecao("Leitura do assessor"));
  const texto = document.createElement("div");
  texto.className = "cartao texto";
  texto.innerHTML = md(r.resposta);
  texto.querySelectorAll("a").forEach(l => { l.target = "_blank"; l.rel = "noopener"; });
  palco.appendChild(texto);

  const fontes = [...new Set([
    ...(r.visuais || []).flatMap(v => v.fontes || []).map(f => f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.nome)}</a>` : `<span>${esc(f.nome)}</span>`),
    ...(r.baseUsada || []).map(b => `<span>Base: ${esc(b)}</span>`)
  ])];
  if (fontes.length) palco.insertAdjacentHTML("beforeend", `<details class="fontes"><summary>Fontes consultadas (${fontes.length})</summary><div class="lista">${fontes.join("")}</div></details>`);
  palco.appendChild(blocoProximas(a, r.proximas || []));
}

function blocoProximas(a, opcoes) {
  const div = document.createElement("section");
  div.className = "proximas";
  const estudo = a.modo !== "estudo" && a.resultado ? `<button type="button" class="estudo" data-estudo="1">Gerar estudo completo sobre isto</button>` : "";
  div.innerHTML = `<h3>Próximas análises</h3><div class="opcoes">${opcoes.map(o => `<button type="button">${esc(o)}</button>`).join("")}${estudo}</div>`;
  div.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.estudo) pedir(`Estudo completo: ${a.pergunta}`, "estudo");
    else pedir(b.textContent.replace(/^Tentar novamente: /, ""));
  }));
  return div;
}

/* ---------- pedir análise ---------- */
let ocupado = false;

function contexto() {
  // conversa enviada à IA: perguntas e respostas anteriores desta sessão
  return analises.flatMap(a => a.resultado ? [{ role: "user", content: a.pergunta }, { role: "assistant", content: a.resultado.resposta }] : []);
}

async function acompanhar(id, a) {
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
      continue;
    }
    if (t.status === "concluida") return t.resultado;
    if (t.status === "erro") throw new Error(t.erro || "Falha na análise.");
    if (t.etapa && t.etapa !== a.etapa) {
      a.etapa = t.etapa;
      const el = $(".pensando .etapa", palco);
      if (el && analises[atual] === a) el.textContent = t.etapa;
    }
  }
  throw new Error("A análise demorou demais. Tente novamente.");
}

async function executar(a, id) {
  ocupado = true;
  $("#form .enviar").disabled = true;
  try {
    a.resultado = await acompanhar(id, a);
  } catch (e) {
    a.erro = e.message;
  } finally {
    delete a.tarefa;
    ocupado = false;
    $("#form .enviar").disabled = false;
    salvar();
    if (analises[atual] === a) { renderAnalise(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  }
}

async function pedir(pergunta, modo = "chat") {
  if (ocupado || !pergunta.trim()) return;
  const a = { pergunta: pergunta.trim(), foco: { ...foco }, modo };
  const conversa = [...contexto(), { role: "user", content: a.pergunta }];
  analises.push(a);
  atual = analises.length - 1;
  salvar();
  renderAnalise();
  window.scrollTo({ top: 0, behavior: "smooth" });
  try {
    const { id } = await api("/assessor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ historico: conversa, modo, foco: a.foco })
    });
    a.tarefa = id;
    salvar();
    await executar(a, id);
  } catch (e) {
    a.erro = e.message;
    salvar();
    renderAnalise();
  }
}

/* ---------- foco ---------- */
function definirFoco(novo) {
  foco = novo;
  store.set("foco", foco);
  $("#sel-foco").value = foco.tipo === "brasil" ? "brasil" : `${foco.tipo}:${foco.valor}`;
  $("#dica-foco").textContent = foco.tipo === "brasil" ? "Toque num estado para focar a análise" : `Foco: ${rotuloFoco()} · toque de novo para voltar ao Brasil`;
  desenharCerebro($("#cerebro-grande"), {
    interativo: true,
    destacar: ufsDoFoco(),
    aoSelecionar: (uf) => definirFoco(foco.tipo === "uf" && foco.valor === uf ? { tipo: "brasil" } : { tipo: "uf", valor: uf })
  });
}

function montarSeletor() {
  const sel = $("#sel-foco");
  sel.innerHTML = `<option value="brasil">Brasil</option>
    <optgroup label="Regiões">${Object.entries(INFO.regioes).map(([k, v]) => `<option value="regiao:${k}">${esc(v)}</option>`).join("")}</optgroup>
    <optgroup label="Estados">${Object.entries(INFO.ufs).sort((a, b) => a[1].nome.localeCompare(b[1].nome)).map(([k, v]) => `<option value="uf:${k}">${esc(v.nome)}</option>`).join("")}</optgroup>`;
  sel.addEventListener("change", () => {
    const [tipo, valor] = sel.value.split(":");
    definirFoco(tipo === "brasil" ? { tipo: "brasil" } : { tipo, valor });
  });
}

/* ---------- eventos ---------- */
$("#form").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#pergunta");
  if (!q.value.trim() || ocupado) return;
  pedir(q.value);
  q.value = "";
  q.blur();
});
document.querySelectorAll("#cards-inicio button").forEach(b => b.addEventListener("click", () => pedir(b.dataset.p)));
$("#btn-inicio").addEventListener("click", () => {
  if (!analises.length) return;
  document.body.classList.remove("sessao");
  document.body.classList.add("inicio");
  definirFoco(foco);
});
$("#btn-nova").addEventListener("click", () => {
  if (ocupado) return;
  analises = [];
  atual = -1;
  salvar();
  renderAnalise();
  definirFoco(foco);
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

async function carregarDocs() {
  const lista = $("#lista-docs");
  lista.innerHTML = `<li class="nota">carregando…</li>`;
  try {
    const r = await api("/conhecimento");
    $("#campo-senha").hidden = !r.exigeSenha;
    $("#aviso-persistencia").innerHTML = r.persistente ? "" :
      `<div class="aviso">Armazenamento temporário: documentos enviados por aqui somem quando o servidor é atualizado. Configure um Volume na Railway (variável DATA_DIR) para guardar de forma permanente.</div>`;
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
  } catch (e) { lista.innerHTML = `<li class="erro">${esc(e.message)}</li>`; }
}

const lerBase64 = (arquivo) => new Promise((ok, falha) => {
  const fr = new FileReader();
  fr.onload = () => ok(String(fr.result).split(",")[1]);
  fr.onerror = () => falha(new Error("Não foi possível ler o arquivo."));
  fr.readAsDataURL(arquivo);
});
const rotuloArquivo = "Escolher arquivo (PDF, TXT, MD, CSV)";

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
    $(".arquivo span", f).textContent = rotuloArquivo;
    carregarDocs();
  } catch (err) {
    status.textContent = `⚠ ${err.message}`;
  } finally { btn.disabled = false; }
});
$("#form-doc").arquivo.addEventListener("change", (e) => {
  $(".arquivo span").textContent = e.target.files[0]?.name || rotuloArquivo;
});

/* ---------- início ---------- */
(async function iniciar() {
  const [painel, mapa] = await Promise.allSettled([api("/painel"), fetch("brasil-mapa.json").then(r => r.json())]);
  if (mapa.status === "fulfilled") MAPA = mapa.value;
  if (painel.status === "fulfilled") INFO = painel.value;
  montarSeletor();
  definirFoco(foco);
  if (painel.status === "fulfilled" && !INFO.assessorAtivo) {
    $("#dica-foco").textContent = "IA offline: configure a chave da OpenAI no servidor";
  }
  desenharCerebro($("#cerebro-mini"), { detalhado: false });
  // análises que ficaram sem tarefa (página fechada antes de iniciar) viram erro com opção de repetir
  analises.filter(a => !a.tarefa && !a.resultado && !a.erro).forEach(a => { a.erro = "A análise foi interrompida."; });
  if (atual >= analises.length || atual < 0) atual = analises.length - 1;
  renderAnalise();
  // retoma uma análise que estava em andamento quando a página recarregou
  const pendente = analises.find(a => a.tarefa && !a.resultado && !a.erro);
  if (pendente) executar(pendente, pendente.tarefa);
})();
