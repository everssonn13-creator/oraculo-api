import { fetchCached } from "./http.js";

// =====================================
// Inteligência geológica para implantação de ETE/ETA
// - Unidade geológica no ponto: Macrostrat (compilação global, inclui mapas do SGB/CPRM em escala regional)
// - Altitude: Open-Meteo Elevation (modelo Copernicus DEM 90 m)
// - Interpretação geotécnica/hidrogeológica: regras abaixo (triagem, não substitui sondagem)
// =====================================

const REGRAS = [
  {
    id: "carste",
    termos: ["limestone", "dolomit", "marble", "carbonat", "calcar", "calcário", "marmore", "karst"],
    titulo: "Rochas carbonáticas — risco cárstico",
    implicacoes: [
      "Possibilidade de dolinas, cavidades e colapsos: exigir sondagens rotativas + geofísica (eletrorresistividade/GPR) na área de reatores e lagoas.",
      "Aquífero cárstico muito vulnerável: lagoas de estabilização exigem impermeabilização com geomembrana e monitoramento de poços.",
      "Água bruta tende a dureza elevada — avaliar abrandamento/incrustação em ETA e adutoras."
    ]
  },
  {
    id: "sedimentar_arenoso",
    termos: ["sand", "sandstone", "arenit", "areia", "alluvi", "aluvi", "unconsolidated", "conglomerat", "gravel", "quaternary sediment"],
    titulo: "Sedimentos/rochas arenosas — alta permeabilidade",
    implicacoes: [
      "Solo permeável: lagoas e leitos de secagem precisam de impermeabilização (argila compactada k ≤ 1e-7 cm/s ou geomembrana).",
      "Aquífero poroso vulnerável a contaminação — atenção à distância de poços de captação (outorga/ANA e órgão estadual).",
      "Em aluviões o nível freático costuma ser raso: rebaixamento de lençol nas escavações de elevatórias e reatores.",
      "Bom potencial de captação subterrânea para pequenas ETAs/sistemas isolados."
    ]
  },
  {
    id: "argiloso",
    termos: ["clay", "shale", "mudstone", "siltstone", "argil", "folhelho", "siltito", "pelit", "slate"],
    titulo: "Rochas/solos argilosos — baixa permeabilidade",
    implicacoes: [
      "Favorável a lagoas (baixa infiltração), mas verificar argilas expansivas e baixa capacidade de suporte.",
      "Recalques em fundações de tanques pesados: considerar estacas ou radier com melhoria de solo.",
      "Taludes de lagoas e valas podem ser instáveis quando saturados."
    ]
  },
  {
    id: "cristalino",
    termos: ["granit", "gneiss", "gnaiss", "schist", "xisto", "migmat", "granodior", "tonalit", "quartzit", "crystalline", "metamorph", "orthogneiss"],
    titulo: "Embasamento cristalino (granitos/gnaisses)",
    implicacoes: [
      "Excelente capacidade de suporte; porém escavação em rocha encarece redes, elevatórias e interceptores (desmonte).",
      "Aquífero fraturado de baixa produtividade: captação tende a ser superficial (ETA convencional) — no semiárido, água salobra é comum (avaliar dessalinização).",
      "Solo residual pouco espesso: atenção à erosão em cortes."
    ]
  },
  {
    id: "basalto",
    termos: ["basalt", "basalto", "diabas", "volcanic", "serra geral", "mafic"],
    titulo: "Basaltos (ex.: Formação Serra Geral)",
    implicacoes: [
      "Solos argilosos lateríticos espessos (terra roxa): boa trabalhabilidade e baixa permeabilidade.",
      "Aquífero fraturado; sobreposição ao Sistema Aquífero Guarani em parte do Sul/Sudeste — proteger áreas de recarga.",
      "Rocha sã muito dura em profundidade: prever sondagem antes de definir cota de reatores."
    ]
  },
  {
    id: "laterita",
    termos: ["laterit", "ferricrete", "duricrust", "canga"],
    titulo: "Coberturas lateríticas",
    implicacoes: [
      "Crostas ferruginosas resistentes sobre solo poroso colapsível — avaliar colapsividade sob inundação (lagoas/tanques)."
    ]
  }
];

const norm = (s = "") => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function interpretarGeologia(unidades = [], altitude = null) {
  const texto = norm(unidades.map(u => [u.nome, u.litologia, u.descricao].join(" ")).join(" "));
  const achados = REGRAS.filter(r => r.termos.some(t => texto.includes(norm(t))));

  const alertas = [];
  if (altitude !== null && altitude < 10) {
    alertas.push("Cota abaixo de 10 m: risco de inundação e lençol raso; em áreas costeiras avaliar intrusão salina e emissário submarino como alternativa de disposição.");
  } else if (altitude !== null && altitude > 900) {
    alertas.push("Altitude elevada: temperaturas mais baixas reduzem a eficiência de reatores anaeróbios (UASB) — considerar maior TDH ou processo aeróbio.");
  }

  return {
    classes: achados.map(({ id, titulo, implicacoes }) => ({ id, titulo, implicacoes })),
    alertas,
    aviso: "Triagem preliminar em escala regional. Para projeto, exigir investigação geotécnica (SPT/rotativa), estudo hidrogeológico e consulta ao GeoSGB (SGB/CPRM) na escala 1:250.000 ou maior."
  };
}

export async function geologiaNoPonto(lat, lon) {
  const [macro, elev] = await Promise.allSettled([
    fetchCached(`https://macrostrat.org/api/v2/geologic_units/map?lat=${lat}&lng=${lon}`, { ttlMs: 30 * 86400000 }),
    fetchCached(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`, { ttlMs: 30 * 86400000 })
  ]);

  const unidades = macro.status === "fulfilled"
    ? (macro.value?.success?.data || []).map(u => ({
        nome: u.name || u.strat_name || null,
        litologia: u.lith || null,
        descricao: u.descrip || null,
        idade: u.best_int_name || [u.b_int_name, u.t_int_name].filter(Boolean).join(" – ") || null
      }))
    : [];

  const altitude = elev.status === "fulfilled" ? Number(elev.value?.elevation?.[0]) : null;

  return {
    ponto: { lat, lon },
    altitudeM: Number.isFinite(altitude) ? altitude : null,
    unidades,
    interpretacao: interpretarGeologia(unidades, Number.isFinite(altitude) ? altitude : null),
    erros: [macro, elev].filter(r => r.status === "rejected").map(r => r.reason.message),
    fontes: [
      { nome: "Macrostrat (mapas geológicos compilados)", url: "https://macrostrat.org" },
      { nome: "Open-Meteo Elevation (Copernicus DEM)", url: "https://open-meteo.com/en/docs/elevation-api" },
      { nome: "GeoSGB — Serviço Geológico do Brasil (consulta detalhada)", url: "https://geosgb.sgb.gov.br" }
    ]
  };
}
