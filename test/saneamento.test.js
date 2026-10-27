import { test } from "node:test";
import assert from "node:assert/strict";
import { classificarSegmentos, normalizarEdital, resumoPorSegmento } from "../saneamento/sources/pncp.js";
import { parseRss } from "../saneamento/sources/noticias.js";
import { interpretarGeologia } from "../saneamento/sources/geologia.js";
import { estimarMercadoLodo } from "../saneamento/knowledge/mercadoLodo.js";
import { CONCESSOES, INDICADORES } from "../saneamento/knowledge/base.js";

test("classifica segmentos sem falsos positivos de siglas", () => {
  assert.deepEqual(classificarSegmentos("Locação de centrífuga decanter para desaguamento de lodo"), ["Lodo / Centrífuga"]);
  assert.ok(classificarSegmentos("Ampliação da ETE Jardim").includes("ETE"));
  assert.deepEqual(classificarSegmentos("Contratação de frete e etapa de obra"), ["Saneamento (geral)"]);
});

test("normaliza item da busca do PNCP", () => {
  const e = normalizarEdital({
    title: "Pregão 12/2026", description: "Aquisição de polímero e locação de centrífuga",
    item_url: "/compras/12345678000199/2026/45", orgao_nome: "SAAE X", uf: "MG",
    municipio_nome: "Itabira", valor_global: 1500000, numero_controle_pncp: "abc"
  });
  assert.equal(e.link, "https://pncp.gov.br/app/editais/12345678000199/2026/45");
  assert.equal(e.valorEstimado, 1500000);
  assert.ok(e.segmentos.includes("Lodo / Centrífuga"));
  const r = resumoPorSegmento([e, e]);
  assert.equal(r["Lodo / Centrífuga"].quantidade, 2);
});

test("lê RSS do Google News e separa o veículo", () => {
  const xml = `<rss><channel><item><title>Iguá vence leilão em SE - Poder360</title><link>https://x.y/1</link>
    <pubDate>Mon, 02 Sep 2024 10:00:00 GMT</pubDate><source url="https://poder360.com.br">Poder360</source></item></channel></rss>`;
  const [n] = parseRss(xml);
  assert.equal(n.titulo, "Iguá vence leilão em SE");
  assert.equal(n.veiculo, "Poder360");
  assert.equal(n.publicadoEm, "2024-09-02T10:00:00.000Z");
});

test("interpreta geologia cárstica e cota baixa", () => {
  const r = interpretarGeologia([{ nome: "Bambuí", litologia: "limestone, dolomite" }], 5);
  assert.equal(r.classes[0].id, "carste");
  assert.equal(r.alertas.length, 1);
});

test("estima mercado de lodo para 500 mil hab em UASB", () => {
  const r = estimarMercadoLodo({ populacao: 500000, processo: "uasb" });
  assert.equal(r.lodoSecoTdia, 7.5);           // 500k × 15 g
  assert.equal(r.volumeLodoM3dia, 187.5);      // a 4% ST
  assert.equal(r.centrifugas.operando, 1);     // 11,7 m³/h ÷ 15
  assert.ok(r.custoDestinacaoAnual.comDesaguamento < r.custoDestinacaoAnual.semDesaguamento);
  assert.throws(() => estimarMercadoLodo({ populacao: 0 }));
});

test("base curada sempre tem fonte", () => {
  for (const x of [...CONCESSOES, ...INDICADORES]) assert.match(x.fonte, /^https:\/\//);
});

import { sanitizarPainel } from "../saneamento/visuais.js";
import { expandirLocal } from "../saneamento/knowledge/regioes.js";
import { dividirEmTrechos } from "../saneamento/knowledge/biblioteca.js";

test("expande regiões e nomes de estados em UFs", () => {
  assert.equal(expandirLocal("Nordeste").length, 9);
  assert.deepEqual(expandirLocal("bahia"), ["BA"]);
  assert.deepEqual(expandirLocal("SP"), ["SP"]);
  assert.equal(expandirLocal("Brasil").length, 27);
});

test("sanitiza painel do modelo", () => {
  const p = sanitizarPainel({
    titulo: "X",
    mapa: { destacar: ["Sul"], valores: { "Paraná": "1.234", XX: 3 } },
    kpis: [{ rotulo: "a", valor: "1" }, { rotulo: "", valor: "2" }],
    graficos: [{ titulo: "g", itens: [{ rotulo: "r", valor: "x" }] }],
    fontes: [{ nome: "f", url: "javascript:alert(1)" }]
  });
  assert.deepEqual(p.mapa.destacar, ["PR", "SC", "RS"]);
  assert.deepEqual(p.mapa.valores, { PR: 1234 });
  assert.equal(p.kpis.length, 1);
  assert.equal(p.graficos, undefined);
  assert.equal(p.fontes[0].url, null);
});

test("divide documentos longos em trechos com sobreposição", () => {
  const texto = Array.from({ length: 60 }, (_, i) => `Frase número ${i} sobre lodo e centrífugas.`).join(" ");
  const t = dividirEmTrechos(texto, 500, 100);
  assert.ok(t.length > 3);
  assert.ok(t.every(x => x.length <= 520));
});

import { produtosDoTexto, tipoDoSinal } from "../saneamento/radar.js";

test("radar identifica produto e tipo de sinal", () => {
  assert.deepEqual(produtosDoTexto("Aquisição de centrífuga decanter para a ETE Norte"), ["centrifuga"]);
  assert.deepEqual(produtosDoTexto("Fornecimento de preparador de polímero"), ["polimero"]);
  assert.deepEqual(produtosDoTexto("Contratação de frete"), []);
  assert.equal(tipoDoSinal("Aviso de licitação — pregão eletrônico 12/2026").confianca, "alta");
  assert.equal(tipoDoSinal("Extrato de contrato nº 45/2026").tipo, "Compra fechada");
  assert.equal(tipoDoSinal("Abre crédito suplementar no orçamento").tipo, "Verba / orçamento");
});
