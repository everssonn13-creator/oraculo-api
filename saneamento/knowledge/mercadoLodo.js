// =====================================
// Estimador de demanda de desaguamento de lodo (centrífugas)
// Coeficientes per capita: faixas de literatura (von Sperling, "Princípios do
// Tratamento Biológico de Águas Residuárias", vol. 6 — Lodos de esgotos).
// Resultado é estimativa de engenharia para dimensionar mercado, não projeto.
// =====================================

export const PROCESSOS = {
  uasb: { nome: "Reator UASB", gSTporHabDia: [12, 18], stEntrada: 4, torta: 25, polimeroKgPorT: 7 },
  uasb_pos: { nome: "UASB + pós-tratamento aeróbio", gSTporHabDia: [18, 28], stEntrada: 3.5, torta: 23, polimeroKgPorT: 9 },
  lodos_ativados: { nome: "Lodos ativados convencional (com digestão)", gSTporHabDia: [40, 60], stEntrada: 3, torta: 22, polimeroKgPorT: 11 },
  aeracao_prolongada: { nome: "Lodos ativados — aeração prolongada", gSTporHabDia: [40, 45], stEntrada: 2.5, torta: 18, polimeroKgPorT: 10 }
};

const media = ([a, b]) => (a + b) / 2;

export function estimarMercadoLodo({
  populacao,
  processo = "uasb",
  coberturaTratamento = 100,
  horasOperacao = 16,
  capacidadeMaquinaM3h = 15,
  custoDestinacaoPorT = 150
} = {}) {
  const p = PROCESSOS[processo];
  if (!p) throw new Error(`Processo inválido. Use: ${Object.keys(PROCESSOS).join(", ")}`);
  const pop = Number(populacao);
  if (!Number.isFinite(pop) || pop <= 0) throw new Error("Informe a população (habitantes).");

  const habAtendidos = pop * Math.min(Math.max(coberturaTratamento, 0), 100) / 100;
  const tSTdia = habAtendidos * media(p.gSTporHabDia) / 1e6;
  const m3LodoDia = tSTdia / (p.stEntrada / 100);
  const m3h = m3LodoDia / horasOperacao;
  const maquinasOperando = m3h > 0 ? Math.ceil(m3h / capacidadeMaquinaM3h) : 0;
  const tTortaDia = tSTdia / (p.torta / 100);
  const tSemDesaguamento = m3LodoDia; // densidade ≈ 1 t/m³

  const r = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

  return {
    processo: p.nome,
    habitantesAtendidos: Math.round(habAtendidos),
    lodoSecoTdia: r(tSTdia, 2),
    faixaLodoSecoTdia: p.gSTporHabDia.map(g => r(habAtendidos * g / 1e6, 2)),
    volumeLodoM3dia: r(m3LodoDia),
    vazaoCentrifugacaoM3h: r(m3h),
    centrifugas: { operando: maquinasOperando, reserva: maquinasOperando ? 1 : 0, capacidadeAdotadaM3h: capacidadeMaquinaM3h },
    tortaTdia: r(tTortaDia),
    polimeroKgDia: r(tSTdia * p.polimeroKgPorT),
    custoDestinacaoAnual: {
      comDesaguamento: Math.round(tTortaDia * 365 * custoDestinacaoPorT),
      semDesaguamento: Math.round(tSemDesaguamento * 365 * custoDestinacaoPorT),
      premissaRSporT: custoDestinacaoPorT
    },
    premissas: [
      `Produção de lodo: ${p.gSTporHabDia.join("–")} g ST/hab·dia (média adotada)`,
      `Teor de sólidos na entrada: ${p.stEntrada}% | torta: ${p.torta}% ST`,
      `Dose de polímero: ${p.polimeroKgPorT} kg/t ST | operação ${horasOperacao} h/dia`,
      `Custo de transporte + destinação: R$ ${custoDestinacaoPorT}/t (ajuste à realidade regional)`
    ],
    aviso: "Estimativa de engenharia para análise de mercado; confirme com dados operacionais da ETE e ensaio piloto."
  };
}
