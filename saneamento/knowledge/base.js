// =====================================
// BASE DE CONHECIMENTO CURADA — SANEAMENTO BÁSICO NO BRASIL
// Regra: todo número tem fonte pública. Dados que mudam com frequência
// (licitações, notícias, diários) NÃO ficam aqui — vêm das APIs ao vivo.
// Revise este arquivo quando o SINISA publicar novo ano-base.
// =====================================

export const ATUALIZADO_EM = "2026-10-26";

export const INDICADORES = [
  { id: "agua", nome: "População atendida com rede de água", valor: 84.9, unidade: "%", referencia: "SNIS 2022 (ano-base 2022)", fonte: "https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/saneamento/snis" },
  { id: "coleta", nome: "População atendida com coleta de esgoto", valor: 56.0, unidade: "%", referencia: "SNIS 2022 (ano-base 2022)", fonte: "https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/saneamento/snis" },
  { id: "tratamento", nome: "Esgoto gerado que é tratado", valor: 52.2, unidade: "%", referencia: "SNIS 2022 (ano-base 2022)", fonte: "https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/saneamento/snis" },
  { id: "perdas", nome: "Perdas de água na distribuição", valor: 39.53, unidade: "%", referencia: "Estudo Trata Brasil / GO Associados 2026 com base no SINISA 2024", fonte: "https://agenciainfra.com/blog/brasil-desperdica-quase-40-da-agua-trata-diz-estudo/" },
  { id: "meta_agua", nome: "Meta legal de atendimento de água até 31/12/2033", valor: 99, unidade: "%", referencia: "Lei 14.026/2020 (art. 11-B da Lei 11.445/2007)", fonte: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14026.htm" },
  { id: "meta_esgoto", nome: "Meta legal de coleta e tratamento de esgoto até 31/12/2033", valor: 90, unidade: "%", referencia: "Lei 14.026/2020 (art. 11-B da Lei 11.445/2007)", fonte: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14026.htm" },
  { id: "meta_perdas", nome: "Teto de perdas na distribuição previsto para 2025", valor: 35, unidade: "%", referencia: "Portaria MCid 788/2024 (citada no estudo Trata Brasil 2026: só 12 de 5.569 municípios cumprem)", fonte: "https://brasil61.com/n/brasil-perde-quase-40-da-agua-tratada-antes-de-ela-chegar-aos-consumidores-bras2616481" }
];

export const NOTA_INDICADORES =
  "SNIS (até ano-base 2022) e SINISA (a partir de 2023) têm metodologias diferentes — não compare séries diretamente. Confira o painel oficial do SINISA para o ano-base mais recente.";

export const MARCO_LEGAL = [
  { norma: "Lei 11.445/2007", tema: "Diretrizes nacionais do saneamento básico (água, esgoto, resíduos e drenagem)", url: "https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/lei/l11445.htm" },
  { norma: "Lei 14.026/2020 — Novo Marco Legal", tema: "Metas 99%/90% até 2033, fim dos contratos de programa sem licitação, regionalização, ANA como editora de normas de referência", url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14026.htm" },
  { norma: "Decreto 11.598/2023", tema: "Metodologia de comprovação da capacidade econômico-financeira dos prestadores", url: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/decreto/D11598.htm" },
  { norma: "Decreto 11.599/2023", tema: "Prestação regionalizada, apoio técnico/financeiro da União e alocação de recursos", url: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/decreto/D11599.htm" },
  { norma: "Lei 14.133/2021", tema: "Nova Lei de Licitações — editais publicados obrigatoriamente no PNCP", url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm" },
  { norma: "Lei 8.987/1995 e Lei 11.079/2004", tema: "Concessões comuns e Parcerias Público-Privadas", url: "https://www.planalto.gov.br/ccivil_03/leis/l8987cons.htm" },
  { norma: "Normas de Referência da ANA", tema: "Regulação nacional de referência (tarifas, indenizações, metas, contabilidade regulatória)", url: "https://www.gov.br/ana/pt-br/assuntos/saneamento-basico/normas-de-referencia" },
  { norma: "Resolução CONAMA 430/2011", tema: "Padrões de lançamento de efluentes (complementa a 357/2005)", url: "https://conama.mma.gov.br" },
  { norma: "Resolução CONAMA 357/2005", tema: "Classificação dos corpos d'água e padrões de qualidade", url: "https://conama.mma.gov.br" },
  { norma: "Resolução CONAMA 498/2020", tema: "Uso agrícola de lodo de esgoto/biossólido (substituiu a 375/2006)", url: "https://conama.mma.gov.br" },
  { norma: "Portaria GM/MS 888/2021", tema: "Padrão de potabilidade da água para consumo humano (altera Anexo XX da PRC 5/2017)", url: "https://www.in.gov.br" },
  { norma: "Lei 12.305/2010 — PNRS", tema: "Política Nacional de Resíduos Sólidos — destinação de lodos de ETA/ETE", url: "https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2010/lei/l12305.htm" }
];

// Leilões/desestatizações relevantes pós-marco. "confianca" indica se o valor
// foi conferido em fonte primária/imprensa especializada.
export const CONCESSOES = [
  { ano: 2020, mes: 9, uf: "AL", projeto: "Casal — Bloco A (Região Metropolitana de Maceió)", vencedor: "BRK Ambiental", outorgaBi: 2.009, modelo: "Concessão (água e esgoto)", estruturador: "BNDES", confianca: "alta", fonte: "https://agenciadenoticias.bndes.gov.br" },
  { ano: 2021, mes: 4, uf: "RJ", projeto: "Cedae — Blocos 1, 2 e 4", vencedor: "Aegea (Blocos 1 e 4 — Águas do Rio) e Iguá (Bloco 2)", outorgaBi: 22.69, modelo: "Concessão regionalizada (distribuição + esgoto)", estruturador: "BNDES", confianca: "alta", fonte: "https://agenciadenoticias.bndes.gov.br" },
  { ano: 2021, mes: 12, uf: "RJ", projeto: "Cedae — Bloco 3 (relicitação)", vencedor: "Consórcio Rio+ Saneamento (Grupo Águas do Brasil)", outorgaBi: 2.2, modelo: "Concessão regionalizada", estruturador: "BNDES", confianca: "media", fonte: "https://agenciadenoticias.bndes.gov.br" },
  { ano: 2021, mes: 9, uf: "AP", projeto: "Caesa — Concessão estadual (16 municípios)", vencedor: "Consórcio Marco Zero (Equatorial + SAM Ambiental)", outorgaBi: 0.93, modelo: "Concessão plena", estruturador: "BNDES", confianca: "media", fonte: "https://agenciadenoticias.bndes.gov.br" },
  { ano: 2022, mes: 12, uf: "RS", projeto: "Corsan — Privatização (venda do controle)", vencedor: "Aegea", outorgaBi: 4.15, modelo: "Desestatização", estruturador: "Governo do RS", confianca: "alta", fonte: "https://www.b3.com.br" },
  { ano: 2024, mes: 7, uf: "SP", projeto: "Sabesp — Desestatização (oferta de ações)", vencedor: "Equatorial (acionista de referência, 15% a R$ 67/ação)", outorgaBi: 6.9, modelo: "Follow-on / desestatização; oferta total ≈ R$ 14,8 bi", estruturador: "Governo de SP / IFC", confianca: "alta", fonte: "https://ri.sabesp.com.br" },
  { ano: 2024, mes: 9, uf: "SE", projeto: "Deso — Concessão parcial (74 municípios)", vencedor: "Iguá Saneamento", outorgaBi: 4.5, modelo: "Concessão parcial; ágio 122,6%; investimentos previstos R$ 6,3 bi", estruturador: "BNDES", confianca: "alta", fonte: "https://agenciadenoticias.bndes.gov.br/infraestrutura/Igua-vence-leilao-de-concessao-parcial-de-servicos-de-saneamento-de-74-municipios-de-Sergipe/" },
  { ano: 2024, mes: 9, uf: "PR", projeto: "Sanepar — 3 PPPs de esgoto (microrregiões)", vencedor: "Acciona, Iguá e consórcio Aegea/Kinea/Perfin", outorgaBi: null, modelo: "PPP de esgotamento sanitário", estruturador: "Sanepar", confianca: "alta", fonte: "https://conteudos.xpi.com.br/renda-fixa/relatorios/sanepar-promove-leilao-de-ppps-na-b3/" },
  { ano: 2024, mes: 10, uf: "PI", projeto: "Agespisa — Concessão/PPP estadual", vencedor: "Aegea (proposta única) — confirmar homologação", outorgaBi: null, modelo: "Concessão", estruturador: "Governo do PI", confianca: "media", fonte: "https://www.cnnbrasil.com.br/economia/negocios/aegea-faz-proposta-em-leilao-de-saneamento-no-piaui/" },
  { ano: 2025, mes: 4, uf: "PA", projeto: "Cosanpa — Concessão regionalizada (blocos)", vencedor: "Aegea (um bloco sem interessados)", outorgaBi: null, modelo: "Concessão; investimentos previstos ≈ R$ 15 bi", estruturador: "BNDES", confianca: "media", fonte: "https://exame.com/esg/aegea-vence-leilao-bilionario-no-para-mas-obras-de-saneamento-nao-chegarao-a-tempo-da-cop30/" }
];

export const PLAYERS = [
  { nome: "Sabesp", tipo: "Privatizada (2024)", destaque: "Uma das maiores empresas de saneamento do mundo em população atendida; Equatorial como acionista de referência; plano de universalização antecipado para 2029 em SP." },
  { nome: "Aegea", tipo: "Privado", destaque: "Maior operadora privada em população atendida; Águas do Rio, Corsan, Pará, Piauí e dezenas de concessões municipais." },
  { nome: "Iguá Saneamento", tipo: "Privado", destaque: "Cedae Bloco 2, Sergipe (Deso), PPP Sanepar e concessões municipais." },
  { nome: "BRK Ambiental", tipo: "Privado", destaque: "Casal/AL (RMM) e concessões/PPPs em vários estados." },
  { nome: "GS Inima Brasil", tipo: "Privado", destaque: "Concessões municipais e PPPs de esgoto (grupo GS E&C, Coreia)." },
  { nome: "Grupo Águas do Brasil", tipo: "Privado", destaque: "Concessões no RJ (incluindo Cedae Bloco 3) e interior." },
  { nome: "Equatorial", tipo: "Privado", destaque: "Entrou em saneamento via Amapá e tornou-se referência da Sabesp." },
  { nome: "Companhias estaduais", tipo: "Público / misto", destaque: "Sanepar, Copasa, Embasa, Cagece, Compesa, Caesb, Casan, Saneago, Cesan etc. — compradoras relevantes de ETE/ETA, químicos e equipamentos; parte em estudos de desestatização ou PPPs." }
];

// Centrífugas decanter no desaguamento de lodo (ETE e ETA)
export const CENTRIFUGAS = {
  aplicacoes: [
    "Desaguamento de lodo de ETE (UASB, lodos ativados, lodo digerido) antes de transporte para aterro, secagem térmica ou uso agrícola (CONAMA 498/2020).",
    "Adensamento de lodo biológico antes de digestores.",
    "Desaguamento de lodo de ETA (hidróxidos de alumínio/ferro) — demanda crescente pela pressão de órgãos ambientais contra o lançamento em corpos d'água."
  ],
  desempenhoTipico: [
    { lodo: "UASB / anaeróbio", torta: "20–30 % ST", polimero: "≈ 5–10 kg/t ST" },
    { lodo: "Lodos ativados (digerido)", torta: "18–25 % ST", polimero: "≈ 8–14 kg/t ST" },
    { lodo: "Lodos ativados (não digerido, excesso)", torta: "15–20 % ST", polimero: "≈ 8–12 kg/t ST" },
    { lodo: "Lodo de ETA (alumínio/ferro)", torta: "18–30 % ST", polimero: "≈ 1–4 kg/t ST" }
  ],
  notaDesempenho: "Faixas típicas de literatura técnica e catálogos de fabricantes; o valor real depende de ensaio piloto com o lodo do cliente.",
  fabricantes: ["Alfa Laval (linha ALDEC)", "GEA (Westfalia Separator)", "Flottweg (Xelletor)", "ANDRITZ", "Hiller", "Pieralisi", "Centrisys/CNP", "HAUS"],
  tecnologiasConcorrentes: ["Filtro-prensa de placas", "Prensa desaguadora de esteira (belt press)", "Prensa parafuso (screw press)", "Bags geotêxteis", "Leitos de secagem", "Secagem térmica/solar (etapa posterior)"],
  modelosDeNegocio: [
    "Venda de equipamento (CAPEX) + contrato de manutenção e peças (scroll, bowl, rolamentos).",
    "Locação de centrífugas e unidades móveis de desaguamento (muito usada em contratos emergenciais e em ETEs novas de concessionárias).",
    "Serviço de desaguamento por tonelada de lodo (operação terceirizada, OPEX para o cliente).",
    "Retrofit/upgrade de backdrive e automação para reduzir consumo de polímero."
  ],
  vetoresDeDemanda: [
    "Metas de 90% de esgoto tratado até 2033 → novas ETEs e ampliação das existentes.",
    "Concessões privadas com CAPEX elevado e foco em OPEX (custo de transporte/aterro por tonelada de lodo úmido).",
    "Fiscalização de lançamento de lodo de ETA e passivos em lagoas/lodos acumulados.",
    "Aproveitamento energético (biogás, secagem) e biossólidos na agricultura."
  ]
};

export const FONTES_OFICIAIS = [
  { nome: "SINISA — Sistema Nacional de Informações em Saneamento Básico (MCid)", url: "https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/saneamento/sinisa" },
  { nome: "PNCP — Portal Nacional de Contratações Públicas", url: "https://pncp.gov.br" },
  { nome: "ANA — Saneamento e Normas de Referência", url: "https://www.gov.br/ana/pt-br/assuntos/saneamento-basico" },
  { nome: "BNDES — Hub de Projetos (saneamento)", url: "https://hubdeprojetos.bndes.gov.br" },
  { nome: "Querido Diário — diários oficiais municipais", url: "https://queridodiario.ok.org.br" },
  { nome: "IBGE — Censo 2022 e APIs", url: "https://servicodados.ibge.gov.br/api/docs" },
  { nome: "GeoSGB — Serviço Geológico do Brasil", url: "https://geosgb.sgb.gov.br" },
  { nome: "Instituto Trata Brasil — Ranking e estudos", url: "https://tratabrasil.org.br" },
  { nome: "ABCON SINDCON — concessões privadas", url: "https://abconsindcon.com.br" }
];

export const TOPICOS = {
  indicadores: () => ({ indicadores: INDICADORES, nota: NOTA_INDICADORES }),
  marco_legal: () => MARCO_LEGAL,
  concessoes: () => CONCESSOES,
  players: () => PLAYERS,
  centrifugas: () => CENTRIFUGAS,
  fontes: () => FONTES_OFICIAIS
};
