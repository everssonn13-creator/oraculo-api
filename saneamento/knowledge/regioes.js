// =====================================
// UFs, regiões e códigos IBGE
// =====================================

export const UFS = {
  RO: { nome: "Rondônia", ibge: 11, regiao: "N" }, AC: { nome: "Acre", ibge: 12, regiao: "N" },
  AM: { nome: "Amazonas", ibge: 13, regiao: "N" }, RR: { nome: "Roraima", ibge: 14, regiao: "N" },
  PA: { nome: "Pará", ibge: 15, regiao: "N" }, AP: { nome: "Amapá", ibge: 16, regiao: "N" },
  TO: { nome: "Tocantins", ibge: 17, regiao: "N" }, MA: { nome: "Maranhão", ibge: 21, regiao: "NE" },
  PI: { nome: "Piauí", ibge: 22, regiao: "NE" }, CE: { nome: "Ceará", ibge: 23, regiao: "NE" },
  RN: { nome: "Rio Grande do Norte", ibge: 24, regiao: "NE" }, PB: { nome: "Paraíba", ibge: 25, regiao: "NE" },
  PE: { nome: "Pernambuco", ibge: 26, regiao: "NE" }, AL: { nome: "Alagoas", ibge: 27, regiao: "NE" },
  SE: { nome: "Sergipe", ibge: 28, regiao: "NE" }, BA: { nome: "Bahia", ibge: 29, regiao: "NE" },
  MG: { nome: "Minas Gerais", ibge: 31, regiao: "SE" }, ES: { nome: "Espírito Santo", ibge: 32, regiao: "SE" },
  RJ: { nome: "Rio de Janeiro", ibge: 33, regiao: "SE" }, SP: { nome: "São Paulo", ibge: 35, regiao: "SE" },
  PR: { nome: "Paraná", ibge: 41, regiao: "S" }, SC: { nome: "Santa Catarina", ibge: 42, regiao: "S" },
  RS: { nome: "Rio Grande do Sul", ibge: 43, regiao: "S" }, MS: { nome: "Mato Grosso do Sul", ibge: 50, regiao: "CO" },
  MT: { nome: "Mato Grosso", ibge: 51, regiao: "CO" }, GO: { nome: "Goiás", ibge: 52, regiao: "CO" },
  DF: { nome: "Distrito Federal", ibge: 53, regiao: "CO" }
};

export const REGIOES = {
  N: "Norte", NE: "Nordeste", CO: "Centro-Oeste", SE: "Sudeste", S: "Sul"
};

const norm = (s = "") => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export const ufsDaRegiao = (r) => Object.keys(UFS).filter(uf => UFS[uf].regiao === r);

// Aceita "BA", "Bahia", "NE", "Nordeste", "Brasil" → lista de UFs
export function expandirLocal(valor) {
  const v = norm(valor);
  if (!v) return [];
  if (["br", "brasil", "brazil", "nacional"].includes(v)) return Object.keys(UFS);
  const sigla = v.toUpperCase();
  if (UFS[sigla]) return [sigla];
  if (REGIOES[sigla]) return ufsDaRegiao(sigla);
  const reg = Object.entries(REGIOES).find(([, nome]) => norm(nome) === v);
  if (reg) return ufsDaRegiao(reg[0]);
  const uf = Object.entries(UFS).find(([, d]) => norm(d.nome) === v);
  return uf ? [uf[0]] : [];
}

export function rotuloFoco(foco) {
  if (!foco || foco.tipo === "brasil") return "Brasil";
  if (foco.tipo === "regiao") return REGIOES[foco.valor] || foco.valor;
  return UFS[foco.valor]?.nome || foco.valor;
}
