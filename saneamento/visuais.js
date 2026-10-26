import { expandirLocal, UFS } from "./knowledge/regioes.js";

// =====================================
// PAINÉIS VISUAIS das respostas do assessor
// Formato único consumido pelo front-end:
// { titulo, mapa?: { destacar: [UF], valores?: {UF: n}, rotuloValor? },
//   kpis?: [{ rotulo, valor, detalhe?, fonte? }],
//   graficos?: [{ titulo, unidade?, itens: [{ rotulo, valor }] }],
//   tabela?: { titulo?, colunas: [], linhas: [[]] },
//   fontes?: [{ nome, url }] }
// =====================================

const txt = (v, max = 200) => (v === null || v === undefined ? "" : String(v)).slice(0, max);
const num = (v) => {
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const url = (u) => (/^https?:\/\//i.test(String(u || "")) ? String(u) : null);

export function sanitizarPainel(p = {}, focoUfs = []) {
  const painel = { titulo: txt(p.titulo, 120) || "Painel" };

  const destacar = [...new Set((p.mapa?.destacar || []).flatMap(expandirLocal))];
  const valores = {};
  for (const [k, v] of Object.entries(p.mapa?.valores || {})) {
    const uf = expandirLocal(k);
    const n = num(v);
    if (uf.length === 1 && n !== null) valores[uf[0]] = n;
  }
  if (destacar.length || Object.keys(valores).length || p.mapa) {
    painel.mapa = {
      destacar: destacar.length ? destacar : focoUfs,
      valores: Object.keys(valores).length ? valores : null,
      rotuloValor: txt(p.mapa?.rotuloValor, 60) || null
    };
  }

  const kpis = (p.kpis || []).slice(0, 8).map(k => ({
    rotulo: txt(k.rotulo, 80), valor: txt(k.valor, 40), detalhe: txt(k.detalhe, 120) || null, fonte: txt(k.fonte, 120) || null
  })).filter(k => k.rotulo && k.valor);
  if (kpis.length) painel.kpis = kpis;

  const graficos = (p.graficos || []).slice(0, 4).map(g => ({
    titulo: txt(g.titulo, 100),
    unidade: txt(g.unidade, 20) || null,
    itens: (g.itens || []).slice(0, 15).map(i => ({ rotulo: txt(i.rotulo, 60), valor: num(i.valor) })).filter(i => i.rotulo && i.valor !== null)
  })).filter(g => g.itens.length);
  if (graficos.length) painel.graficos = graficos;

  if (Array.isArray(p.tabela?.colunas) && Array.isArray(p.tabela?.linhas) && p.tabela.linhas.length) {
    const colunas = p.tabela.colunas.slice(0, 8).map(c => txt(c, 40));
    painel.tabela = {
      titulo: txt(p.tabela.titulo, 100) || null,
      colunas,
      linhas: p.tabela.linhas.slice(0, 30).map(l => (Array.isArray(l) ? l : []).slice(0, colunas.length).map(c => txt(c, 160)))
    };
  }

  const fontes = (p.fontes || []).slice(0, 10).map(f => ({ nome: txt(f.nome, 100), url: url(f.url) })).filter(f => f.nome);
  if (fontes.length) painel.fontes = fontes;

  return painel;
}

const brl = (v) => v == null ? "—" : `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

// Painéis automáticos — usados quando o modelo não monta um painel próprio
export function painelAutomatico(ferramenta, args, r, focoUfs) {
  if (!r || r.erro) return null;

  if (ferramenta === "buscar_licitacoes" && r.items?.length) {
    const porUF = {};
    for (const it of r.items) if (it.uf) porUF[it.uf] = (porUF[it.uf] || 0) + 1;
    const seg = Object.entries(r.resumoPorSegmento || {}).sort((a, b) => b[1].quantidade - a[1].quantidade);
    return sanitizarPainel({
      titulo: `Licitações encontradas — ${args.q || "radar do setor"}`,
      mapa: { destacar: args.uf ? [args.uf] : focoUfs, valores: porUF, rotuloValor: "editais" },
      kpis: [
        { rotulo: "Editais no resultado", valor: String(r.items.length), fonte: "PNCP" },
        { rotulo: "Valor estimado somado", valor: brl(r.items.reduce((s, i) => s + (i.valorEstimado || 0), 0)), detalhe: "apenas editais com valor informado", fonte: "PNCP" }
      ],
      graficos: seg.length ? [{ titulo: "Editais por segmento", unidade: "editais", itens: seg.map(([k, v]) => ({ rotulo: k, valor: v.quantidade })) }] : [],
      tabela: {
        titulo: "Editais",
        colunas: ["Órgão", "UF", "Objeto", "Valor", "Link"],
        linhas: r.items.slice(0, 15).map(i => [i.orgao, i.uf || "—", i.objeto.slice(0, 140), brl(i.valorEstimado), i.link || ""])
      },
      fontes: [{ nome: "PNCP — Portal Nacional de Contratações Públicas", url: "https://pncp.gov.br" }]
    }, focoUfs);
  }

  if (ferramenta === "estimar_mercado_lodo") {
    return sanitizarPainel({
      titulo: `Dimensionamento de lodo — ${r.processo}`,
      kpis: [
        { rotulo: "Habitantes atendidos", valor: r.habitantesAtendidos.toLocaleString("pt-BR") },
        { rotulo: "Lodo seco", valor: `${r.lodoSecoTdia.toLocaleString("pt-BR")} t ST/dia`, detalhe: `faixa ${r.faixaLodoSecoTdia.join("–")}` },
        { rotulo: "Centrífugas", valor: `${r.centrifugas.operando} + ${r.centrifugas.reserva}`, detalhe: `operação + reserva, ${r.centrifugas.capacidadeAdotadaM3h} m³/h cada` },
        { rotulo: "Torta", valor: `${r.tortaTdia.toLocaleString("pt-BR")} t/dia` },
        { rotulo: "Polímero", valor: `${r.polimeroKgDia.toLocaleString("pt-BR")} kg/dia` }
      ],
      graficos: [{
        titulo: "Custo anual de destinação",
        unidade: "R$",
        itens: [
          { rotulo: "Sem desaguamento", valor: r.custoDestinacaoAnual.semDesaguamento },
          { rotulo: "Com centrífuga", valor: r.custoDestinacaoAnual.comDesaguamento }
        ]
      }],
      fontes: [{ nome: "Estimativa de engenharia (premissas no texto)" }]
    }, focoUfs);
  }

  if (ferramenta === "dados_estado" && r.uf) {
    return sanitizarPainel({
      titulo: `${r.nome} (${r.uf})`,
      mapa: { destacar: [r.uf] },
      kpis: [
        { rotulo: "População (Censo 2022)", valor: r.populacao2022 ? r.populacao2022.toLocaleString("pt-BR") : "—", fonte: "IBGE" },
        { rotulo: "Municípios", valor: r.municipios ? String(r.municipios) : "—", fonte: "IBGE" },
        { rotulo: "Editais abertos no radar", valor: String(r.licitacoesAbertas?.length ?? "—"), fonte: "PNCP" },
        { rotulo: "Leilões na base curada", valor: String(r.concessoes?.length ?? 0) }
      ],
      fontes: [{ nome: "IBGE", url: "https://servicodados.ibge.gov.br/api/docs" }, { nome: "PNCP", url: "https://pncp.gov.br" }]
    }, focoUfs);
  }

  if (ferramenta === "perfil_municipio" && r.id) {
    return sanitizarPainel({
      titulo: `${r.nome}/${r.uf}`,
      mapa: { destacar: [r.uf] },
      kpis: [
        { rotulo: "População (Censo 2022)", valor: r.populacao2022 ? r.populacao2022.toLocaleString("pt-BR") : "—", fonte: "IBGE" },
        { rotulo: "Altitude no centroide", valor: r.geologia?.altitudeM != null ? `${Math.round(r.geologia.altitudeM)} m` : "—" },
        { rotulo: "Classe geológica", valor: r.geologia?.interpretacao?.classes?.[0]?.titulo?.split(" — ")[0] || "não identificada" }
      ],
      fontes: (r.geologia?.fontes || []).map(f => ({ nome: f.nome, url: f.url }))
    }, focoUfs);
  }

  return null;
}

export const nomeUF = (uf) => UFS[uf]?.nome || uf;
