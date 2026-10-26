import { fetchCached } from "./http.js";

// =====================================
// IBGE — localidades, centroide e população (Censo 2022)
// =====================================

const IBGE = "https://servicodados.ibge.gov.br/api";
const DAY = 24 * 60 * 60 * 1000;

const norm = (s = "") => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const ufDe = (m) =>
  m.microrregiao?.mesorregiao?.UF?.sigla ||
  m["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla || null;

export async function listarMunicipios() {
  const data = await fetchCached(`${IBGE}/v1/localidades/municipios?orderBy=nome`, { ttlMs: 7 * DAY, timeoutMs: 30000 });
  return data.map(m => ({ id: String(m.id), nome: m.nome, uf: ufDe(m) }));
}

export async function encontrarMunicipio(nome, uf) {
  const todos = await listarMunicipios();
  const n = norm(nome);
  const candidatos = todos.filter(m => norm(m.nome) === n && (!uf || m.uf === uf.toUpperCase()));
  return candidatos[0] || todos.find(m => norm(m.nome).startsWith(n) && (!uf || m.uf === uf.toUpperCase())) || null;
}

export async function centroideMunicipio(id) {
  const data = await fetchCached(`${IBGE}/v3/malhas/municipios/${id}/metadados`, { ttlMs: 30 * DAY });
  const meta = Array.isArray(data) ? data[0] : data;
  const c = meta?.centroide;
  return c ? { lat: Number(c.latitude), lon: Number(c.longitude), areaKm2: Number(meta?.area?.dimensao) || null } : null;
}

// Agregado 4709 / variável 93 = população residente (Censo 2022)
export async function populacaoCenso2022(id) {
  const data = await fetchCached(`${IBGE}/v3/agregados/4709/periodos/2022/variaveis/93?localidades=N6[${id}]`, { ttlMs: 30 * DAY });
  const valor = data?.[0]?.resultados?.[0]?.series?.[0]?.serie?.["2022"];
  return valor ? Number(valor) : null;
}

export async function perfilMunicipio(nome, uf) {
  const mun = await encontrarMunicipio(nome, uf);
  if (!mun) throw new Error(`Município "${nome}${uf ? "/" + uf : ""}" não encontrado no IBGE`);

  const [centro, pop] = await Promise.allSettled([centroideMunicipio(mun.id), populacaoCenso2022(mun.id)]);

  return {
    ...mun,
    centroide: centro.status === "fulfilled" ? centro.value : null,
    populacao2022: pop.status === "fulfilled" ? pop.value : null,
    fonte: "IBGE (Localidades, Malhas e Censo 2022)"
  };
}
