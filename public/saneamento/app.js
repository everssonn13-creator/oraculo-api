// =====================================
// Oráculo do Saneamento — front-end
// =====================================
const API = "/api/saneamento";
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
const brl = (v) => v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = (v, d = 0) => v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d });
const dataBR = (s) => s ? new Date(s).toLocaleDateString("pt-BR") : "—";
const link = (url, txt = "abrir ↗") => url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(txt)}</a>` : "";
const erroHtml = (e) => `<div class="erro">⚠ ${esc(e.message || e)}</div>`;

async function api(path, opts) {
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || `Erro ${res.status}`);
  return data;
}

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } }
};

/* ---------- abas ---------- */
const carregado = new Set();
function abrir(view) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${view}`));
  document.body.classList.toggle("show-assessor", view === "assessor");
  if (!carregado.has(view)) { carregado.add(view); LOADERS[view]?.(); }
  store.set("aba", view);
}
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => abrir(t.dataset.view)));
document.querySelectorAll("select[name=uf]").forEach(s => UFS.forEach(uf => s.insertAdjacentHTML("beforeend", `<option>${uf}</option>`)));

/* ---------- painel ---------- */
let PAINEL = null;
async function carregarPainel() {
  PAINEL = await api("/painel");
  const st = $("#status");
  st.classList.add("ok");
  st.innerHTML = `<span class="dot"></span> base curada ${dataBR(PAINEL.atualizadoEm + "T12:00:00")} · IA ${PAINEL.assessorAtivo ? "online" : "offline (configure OPENAI_API_KEY)"}`;

  $("#kpis").innerHTML = PAINEL.indicadores.map(i => `
    <div class="kpi ${i.id.startsWith("meta") ? "alvo" : ""}">
      <div class="v">${num(i.valor, 1)}${esc(i.unidade)}</div>
      <div class="bar"><i style="width:${Math.min(i.valor, 100)}%"></i></div>
      <div class="n">${esc(i.nome)}</div>
      <div class="r">${esc(i.referencia)} · ${link(i.fonte, "fonte")}</div>
    </div>`).join("");
  $("#nota-indicadores").textContent = PAINEL.notaIndicadores;
  $("#marco").innerHTML = PAINEL.marcoLegal.map(m => `<li><b>${esc(m.norma)}</b> — ${esc(m.tema)} ${link(m.url, "↗")}</li>`).join("");
  $("#fontes").innerHTML = PAINEL.fontes.map(f => `<a class="chip" href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.nome)}</a>`).join("");

  // concessões
  $("#tab-concessoes").innerHTML = `<thead><tr><th>Data</th><th>UF</th><th>Projeto</th><th>Vencedor</th><th>Valor</th><th>Modelo</th><th>Conf.</th></tr></thead><tbody>${
    [...PAINEL.concessoes].sort((a, b) => b.ano - a.ano || b.mes - a.mes).map(c => `<tr>
      <td>${String(c.mes).padStart(2, "0")}/${c.ano}</td><td>${esc(c.uf)}</td>
      <td>${esc(c.projeto)} ${link(c.fonte, "↗")}</td><td>${esc(c.vencedor)}</td>
      <td class="num">${c.outorgaBi ? `R$ ${num(c.outorgaBi, 2)} bi` : "—"}</td>
      <td>${esc(c.modelo)}</td><td><span class="tag ${esc(c.confianca)}">${esc(c.confianca)}</span></td></tr>`).join("")}</tbody>`;
  $("#players").innerHTML = PAINEL.players.map(p => `<div class="player"><b>${esc(p.nome)}</b><small>${esc(p.tipo)}</small><p>${esc(p.destaque)}</p></div>`).join("");

  // centrífugas
  const c = PAINEL.centrifugas;
  $("#sel-processo").innerHTML = Object.entries(PAINEL.processosLodo).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join("");
  $("#tab-desempenho").innerHTML = `<thead><tr><th>Lodo</th><th>Torta</th><th>Polímero</th></tr></thead><tbody>${
    c.desempenhoTipico.map(d => `<tr><td>${esc(d.lodo)}</td><td class="num">${esc(d.torta)}</td><td class="num">${esc(d.polimero)}</td></tr>`).join("")}</tbody>`;
  $("#nota-desempenho").textContent = c.notaDesempenho;
  $("#modelos").innerHTML = c.modelosDeNegocio.map(m => `<li>${esc(m)}</li>`).join("");
  $("#vetores").innerHTML = [...c.vetoresDeDemanda, ...c.aplicacoes].map(m => `<li>${esc(m)}</li>`).join("");
  $("#fabricantes").innerHTML = c.fabricantes.map(f => `<span class="chip">${esc(f)}</span>`).join("");
  $("#concorrentes").innerHTML = c.tecnologiasConcorrentes.map(f => `<span class="chip">${esc(f)}</span>`).join("");
}

async function carregarSegmentos() {
  try {
    const r = await api("/licitacoes");
    const seg = Object.entries(r.resumoPorSegmento).sort((a, b) => b[1].quantidade - a[1].quantidade);
    const max = Math.max(1, ...seg.map(s => s[1].quantidade));
    $("#segmentos").innerHTML = seg.length
      ? seg.map(([nome, v]) => `<div class="row"><span>${esc(nome)}</span><div class="track"><i style="width:${v.quantidade / max * 100}%"></i></div><b>${v.quantidade}</b></div>`).join("")
        + `<p class="nota">${r.items.length} editais abertos no radar · atualizado ${new Date(r.atualizadoEm).toLocaleTimeString("pt-BR")}</p>`
      : `<div class="empty">Nenhum edital retornado pelo PNCP agora.</div>`;
    if (r.erros?.length) $("#segmentos").insertAdjacentHTML("beforeend", erroHtml(r.erros[0]));
    renderLicitacoes(r);
    carregado.add("licitacoes");
  } catch (e) { $("#segmentos").innerHTML = erroHtml(e); }
}

/* ---------- licitações ---------- */
function renderLicitacoes(r) {
  $("#lic-meta").textContent = `${r.items.length} resultado(s)${r.total > r.items.length ? ` de ${num(r.total)}` : ""} · fonte: PNCP`;
  $("#lic-list").innerHTML = r.items.length ? r.items.map(it => `
    <article class="item">
      <div>${it.segmentos.map(s => `<span class="tag">${esc(s)}</span>`).join("")}</div>
      <h3>${esc(it.titulo)}</h3>
      <p>${esc(it.objeto.slice(0, 320))}${it.objeto.length > 320 ? "…" : ""}</p>
      <div class="sub">
        <span>🏛 ${esc(it.orgao)}</span>
        <span>📍 ${esc([it.municipio, it.uf].filter(Boolean).join("/") || "—")}</span>
        <span class="valor">${brl(it.valorEstimado)}</span>
        <span>${esc(it.modalidade || "")}</span>
        <span>Publicado ${dataBR(it.publicadoEm)}</span>
        ${it.encerraEm ? `<span>Encerra ${dataBR(it.encerraEm)}</span>` : ""}
        ${link(it.link, "ver edital ↗")}
      </div>
    </article>`).join("") : `<div class="empty">Nenhum edital encontrado.</div>`;
}
$("#form-lic").addEventListener("submit", async (e) => {
  e.preventDefault();
  const p = new URLSearchParams([...new FormData(e.target)].filter(([, v]) => v));
  $("#lic-list").innerHTML = `<div class="loading">consultando PNCP…</div>`;
  try { renderLicitacoes(await api(`/licitacoes?${p}`)); } catch (err) { $("#lic-list").innerHTML = erroHtml(err); }
});

/* ---------- lodo ---------- */
$("#form-lodo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries([...new FormData(e.target)].map(([k, v]) => [k, k === "processo" ? v : Number(v)]));
  const out = $("#lodo-out");
  try {
    const r = await api("/mercado-lodo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const economia = r.custoDestinacaoAnual.semDesaguamento - r.custoDestinacaoAnual.comDesaguamento;
    out.innerHTML = `<h2>Dimensionamento <em>${esc(r.processo)}</em></h2>
      <div class="big">
        <div><b>${num(r.lodoSecoTdia, 2)}</b><span>t ST/dia (faixa ${num(r.faixaLodoSecoTdia[0], 2)}–${num(r.faixaLodoSecoTdia[1], 2)})</span></div>
        <div><b>${num(r.vazaoCentrifugacaoM3h, 1)}</b><span>m³/h a centrifugar</span></div>
        <div><b>${r.centrifugas.operando}+${r.centrifugas.reserva}</b><span>centrífugas (operação + reserva)</span></div>
        <div><b>${num(r.tortaTdia, 1)}</b><span>t de torta/dia</span></div>
        <div><b>${num(r.polimeroKgDia, 0)}</b><span>kg polímero/dia</span></div>
        <div><b>${brl(economia)}</b><span>economia anual em destinação vs. lodo líquido</span></div>
      </div>
      <ul class="list">${r.premissas.map(p => `<li>${esc(p)}</li>`).join("")}</ul>
      <p class="nota">${esc(r.aviso)}</p>`;
  } catch (err) { out.innerHTML = erroHtml(err); }
});

/* ---------- geologia ---------- */
function renderGeo(r) {
  const g = r.nome ? r.geologia : r;
  const cab = r.nome
    ? `<div class="big"><div><b>${esc(r.nome)}/${esc(r.uf)}</b><span>IBGE ${esc(r.id)}</span></div>
       <div><b>${num(r.populacao2022)}</b><span>habitantes (Censo 2022)</span></div>
       <div><b>${num(g?.altitudeM)} m</b><span>altitude no centroide</span></div>
       <div><b>${r.centroide ? `${r.centroide.lat.toFixed(3)}, ${r.centroide.lon.toFixed(3)}` : "—"}</b><span>centroide</span></div></div>`
    : `<div class="big"><div><b>${num(g.altitudeM)} m</b><span>altitude</span></div><div><b>${g.ponto.lat}, ${g.ponto.lon}</b><span>ponto</span></div></div>`;
  if (!g) return `<div class="card">${cab}${erroHtml("Sem centroide para análise geológica.")}</div>`;

  const i = g.interpretacao;
  return `<div class="card">${cab}
    <h2>Unidades geológicas no ponto</h2>
    ${g.unidades.length ? `<div class="table-wrap"><table><thead><tr><th>Unidade</th><th>Litologia</th><th>Idade</th></tr></thead><tbody>${
      g.unidades.map(u => `<tr><td>${esc(u.nome || "—")}</td><td>${esc(u.litologia || "—")}</td><td>${esc(u.idade || "—")}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty">Nenhuma unidade retornada para o ponto.</div>`}
    </div>
    ${i.classes.map(c => `<div class="card"><h2>${esc(c.titulo)}</h2><ul class="list">${c.implicacoes.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}
    ${i.alertas.map(a => `<div class="card alerta">⚠ ${esc(a)}</div>`).join("")}
    ${g.erros?.length ? erroHtml(g.erros.join(" · ")) : ""}
    <p class="nota">${esc(i.aviso)}<br>Fontes: ${g.fontes.map(f => link(f.url, f.nome)).join(" · ")}</p>`;
}
$("#form-geo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const p = new URLSearchParams([...new FormData(e.target)].filter(([, v]) => v));
  $("#geo-out").innerHTML = `<div class="loading">consultando IBGE, Macrostrat e modelo de elevação…</div>`;
  try { $("#geo-out").innerHTML = renderGeo(await api(`/municipio?${p}`)); } catch (err) { $("#geo-out").innerHTML = erroHtml(err); }
});
$("#form-ponto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const p = new URLSearchParams(new FormData(e.target));
  $("#geo-out").innerHTML = `<div class="loading">analisando ponto…</div>`;
  try { $("#geo-out").innerHTML = renderGeo(await api(`/geologia?${p}`)); } catch (err) { $("#geo-out").innerHTML = erroHtml(err); }
});

/* ---------- notícias & diários ---------- */
async function carregarNoticias() {
  $("#news").innerHTML = `<div class="loading">buscando notícias…</div>`;
  try {
    const r = await api(`/noticias?tema=${$("#sel-tema").value}`);
    $("#news").innerHTML = r.items.length ? r.items.map(n => `<article class="item"><h3>${link(n.link, n.titulo)}</h3>
      <div class="sub"><span>${esc(n.veiculo || "")}</span><span>${dataBR(n.publicadoEm)}</span></div></article>`).join("")
      : `<div class="empty">Sem notícias no período.</div>`;
  } catch (e) { $("#news").innerHTML = erroHtml(e); }
}
async function carregarDiarios(termo = $("#form-diario").termo.value) {
  $("#diarios").innerHTML = `<div class="loading">varrendo diários oficiais…</div>`;
  try {
    const r = await api(`/diarios?termo=${encodeURIComponent(termo)}&dias=60`);
    $("#diarios").innerHTML = r.items.length ? r.items.map(d => `<article class="item">
      <h3>${esc(d.municipio)}/${esc(d.uf)} · ${dataBR(d.data + "T12:00:00")}</h3>
      ${d.trechos.map(t => `<p>…${esc(t)}…</p>`).join("")}
      <div class="sub">${link(d.link, "diário completo ↗")}</div></article>`).join("")
      : `<div class="empty">Nenhuma menção nos últimos 60 dias.</div>`;
  } catch (e) { $("#diarios").innerHTML = erroHtml(e); }
}
$("#sel-tema").addEventListener("change", carregarNoticias);
$("#form-diario").addEventListener("submit", (e) => { e.preventDefault(); carregarDiarios(); });

const LOADERS = {
  radar: () => { carregarNoticias(); carregarDiarios(); }
};

/* ---------- assessor IA ---------- */
let historico = store.get("historico", []);
const chat = $("#chat");

function addMsg(role, content, ferramentas) {
  const div = document.createElement("div");
  div.className = `msg ${role === "user" ? "user" : "ai"}`;
  const md = window.marked && window.DOMPurify
    ? DOMPurify.sanitize(marked.parse(content || ""))
    : esc(content).replace(/\n/g, "<br>");
  div.innerHTML = role === "user" ? esc(content).replace(/\n/g, "<br>") : md;
  div.querySelectorAll("a").forEach(a => { a.target = "_blank"; a.rel = "noopener"; });
  if (ferramentas?.length) {
    div.insertAdjacentHTML("beforeend", `<div class="tools">${ferramentas.map(f => `<span class="tag ${f.ok ? "alta" : "media"}">⟲ ${esc(f.ferramenta)}</span>`).join("")}</div>`);
  }
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}
historico.forEach(m => addMsg(m.role, m.content));
if (historico.length) $("#sugestoes").remove();

async function perguntar(texto) {
  const modo = $("#modo-estudo").checked ? "estudo" : "chat";
  $("#sugestoes")?.remove();
  addMsg("user", texto);
  historico.push({ role: "user", content: texto });

  const orb = $("#ai-orb");
  orb.classList.add("thinking");
  const pensando = addMsg("ai", modo === "estudo" ? "_Montando estudo de mercado: consultando PNCP, IBGE, diários, notícias e base curada…_" : "_Consultando fontes…_");
  $("#form-chat button").disabled = true;

  try {
    const r = await api("/assessor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ historico, modo }) });
    pensando.remove();
    addMsg("ai", r.resposta, r.ferramentas);
    historico.push({ role: "assistant", content: r.resposta });
    store.set("historico", historico.slice(-30));
  } catch (e) {
    pensando.innerHTML = erroHtml(e);
    historico.pop();
  } finally {
    orb.classList.remove("thinking");
    $("#form-chat button").disabled = false;
  }
}

$("#form-chat").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("#input-chat").value.trim();
  if (!t) return;
  $("#input-chat").value = "";
  perguntar(t);
});
$("#input-chat").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#form-chat").requestSubmit(); }
});
document.querySelectorAll("#sugestoes button").forEach(b => b.addEventListener("click", () => {
  if (/estudo de mercado/i.test(b.textContent)) $("#modo-estudo").checked = true;
  perguntar(b.textContent);
}));

/* ---------- início ---------- */
carregarPainel().then(carregarSegmentos).catch(e => { $("#status").innerHTML = `<span class="dot"></span> ${esc(e.message)}`; });
const abaSalva = store.get("aba", "painel");
if (abaSalva !== "painel" && document.getElementById(`view-${abaSalva}`)) abrir(abaSalva);
