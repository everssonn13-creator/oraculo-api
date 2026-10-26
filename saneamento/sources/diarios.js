import { fetchCached, isoDate } from "./http.js";

// =====================================
// Querido Diário (Open Knowledge Brasil)
// Busca textual em diários oficiais municipais — pega avisos de
// licitação, homologações, contratos e concessões que nem sempre estão no PNCP.
// =====================================

const QD_API = "https://api.queridodiario.ok.org.br/gazettes";

export async function buscarDiariosOficiais({ termo = "estação de tratamento de esgoto", dias = 30, ufMunicipioIds = [], tamanho = 10 } = {}) {
  const desde = new Date(Date.now() - dias * 86400000);
  const params = new URLSearchParams({
    querystring: termo,
    published_since: isoDate(desde),
    excerpt_size: "400",
    number_of_excerpts: "2",
    size: String(Math.min(tamanho, 50)),
    sort_by: "descending_date"
  });
  for (const id of ufMunicipioIds) params.append("territory_ids", id);

  const data = await fetchCached(`${QD_API}?${params}`, { ttlMs: 30 * 60 * 1000 });

  return {
    total: data.total_gazettes ?? 0,
    items: (data.gazettes || []).map(g => ({
      municipio: g.territory_name,
      uf: g.state_code,
      ibge: g.territory_id,
      data: g.date,
      trechos: (g.excerpts || []).map(e => e.replace(/\s+/g, " ").trim()),
      link: g.url,
      fonte: "Querido Diário"
    }))
  };
}
