import express from "express";
import { createClient } from "@supabase/supabase-js";

/* ===============================
   SUPABASE
================================ */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ===============================
   APP
================================ */
const app = express();
app.use(express.json());

/* ===============================
   CORS
================================ */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

/* ===============================
   PERSONALIDADE DO ORÁCULO
================================ */
const ORACLE = {
  askClarify: "🔮 Minha visão ficou turva… pode detalhar melhor?",
  askConfirm: "Se minha leitura estiver correta, responda **\"sim\"**.",
  saved: "📜 As despesas foram seladas no livro financeiro.",
  nothingFound: "🌫️ Não identifiquei despesas claras nessa mensagem.",
  aborted: "🌫️ A visão se dissipou. Vamos tentar novamente.",
  noData: "🌫️ Ainda não há registros suficientes para essa análise."
};

/* ===============================
   MEMÓRIA CURTA (CONVERSACIONAL)
================================ */
const memory = {};

/*
memory[user_id] = {
  state: "idle" | "preview",
  expenses: [],
  reportContext?: { type, category }
}
*/

/* ===============================
   DATAS
================================ */
const todayISO = () => new Date().toISOString().split("T")[0];

const extractMonthFromText = (text) => {
  const months = {
    janeiro: 1, fevereiro: 2, março: 3, abril: 4,
    maio: 5, junho: 6, julho: 7, agosto: 8,
    setembro: 9, outubro: 10, novembro: 11, dezembro: 12
  };
  const t = text.toLowerCase();
  for (const m in months) {
    if (t.includes(m)) return months[m];
  }
  return null;
};

const parseDateFromText = (text) => {
  const t = text.toLowerCase();
  if (t.includes("ontem")) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }
  if (t.includes("amanhã") || t.includes("amanha")) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  if (t.includes("hoje")) return todayISO();

  const match = t.match(/dia\s+(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/);
  if (match) {
    const months = {
      janeiro: 0, fevereiro: 1, março: 2, abril: 3,
      maio: 4, junho: 5, julho: 6, agosto: 7,
      setembro: 8, outubro: 9, novembro: 10, dezembro: 11
    };
    const d = new Date();
    d.setMonth(months[match[2]]);
    d.setDate(Number(match[1]));
    return d.toISOString().split("T")[0];
  }

  return null;
};

/* ===============================
   CATEGORIAS (EXPANDIDAS)
================================ */
const CATEGORY_MAP = {
  Alimentação: [
    "comi","almocei","jantei","lanche","pastel","pizza","hamburguer","hambúrguer",
    "marmita","pf","restaurante","lanchonete","padaria","bar",
    "ifood","delivery","mercado","supermercado"
  ],
  Transporte: [
    "abasteci","abastecer","gasolina","etanol","diesel",
    "uber","99","taxi","ônibus","onibus","metrô","metro",
    "estacionamento","pedágio","pedagio","carro"
  ],
  Moradia: [
    "aluguel","condomínio","condominio","luz","energia",
    "água","agua","internet","iptu","gás","gas"
  ],
  Saúde: [
    "dentista","consulta","médico","medico","farmácia","farmacia",
    "remédio","remedio","hospital","exame","terapia"
  ],
  Pets: [
    "pet","cachorro","gato","ração","racao",
    "veterinário","veterinario","petshop","banho","tosa"
  ],
  Dívidas: [
    "fatura","cartão","cartao","boleto","juros",
    "empréstimo","emprestimo","financiamento","parcela"
  ],
  Compras: [
    "comprei","roupa","tenis","tênis","celular","notebook",
    "amazon","shopee","mercado livre"
  ],
  Lazer: [
    "cinema","show","viagem","passeio","balada"
  ],
  Educação: [
    "curso","faculdade","escola","livro","mensalidade"
  ],
  Investimentos: [
    "investimento","ação","acoes","cdb","tesouro","bitcoin"
  ],
  Assinaturas: [
    "assinatura","mensalidade","netflix","spotify",
    "chatgpt","chatgpt pro","hostinger","icloud"
  ]
};

const classifyCategory = (text) => {
  const t = text.toLowerCase();
  let best = { cat: "Outros", score: 0 };
  for (const [cat, words] of Object.entries(CATEGORY_MAP)) {
    let score = 0;
    words.forEach(w => { if (t.includes(w)) score++; });
    if (score > best.score) best = { cat, score };
  }
  return best.cat;
};

/* ===============================
   HELPERS
================================ */
const isConfirmation = (msg) =>
  ["sim","ok","confirmar","pode"].includes(msg.trim().toLowerCase());

const isAbortText = (msg) =>
  ["sei lá","sei la","qualquer coisa"].some(k => msg.toLowerCase().includes(k));

const isCategoryReportRequest = (msg) =>
  ["gastei com","gastos com","quanto gastei com"].some(k =>
    msg.toLowerCase().includes(k)
  );

const isGeneralReportRequest = (msg) =>
  ["relatório geral","relatorio geral","relatório do mês","como foi meu mês","analise do mes","análise do mês"]
    .some(k => msg.toLowerCase().includes(k));

/* ===============================
   DIAGNÓSTICO FINANCEIRO
================================ */
const buildMonthlyDiagnosis = async (user_id, month) => {
  const year = new Date().getFullYear();
  const start = `${year}-${String(month).padStart(2,"0")}-01`;
  const end = `${year}-${String(month).padStart(2,"0")}-31`;

  const { data } = await supabase
    .from("despesas")
    .select("amount, category")
    .eq("user_id", user_id)
    .gte("expense_date", start)
    .lte("expense_date", end);

  if (!data || !data.length) return null;

  let total = 0;
  const byCategory = {};
  data.forEach(d => {
    if (d.amount == null) return;
    total += Number(d.amount);
    byCategory[d.category] = (byCategory[d.category] || 0) + Number(d.amount);
  });

  const ranking = Object.entries(byCategory)
    .map(([cat, val]) => ({
      category: cat,
      value: val,
      percent: ((val / total) * 100).toFixed(1)
    }))
    .sort((a,b) => b.value - a.value);

  return { total, ranking, count: data.length };
};

/* ===============================
   EXTRAÇÃO DE DESPESAS
================================ */
const extractExpenses = (text) => {
  const parts = text.replace(/,| e /gi," | ").split("|");
  const expenses = [];

  parts.forEach(p => {
    const tokens = p.trim().split(" ");
    let value = null;
    let desc = [];
    tokens.forEach(tok => {
      if (/^\d+([.,]\d+)?$/.test(tok) && value === null) {
        value = Number(tok.replace(",", "."));
      } else {
        desc.push(tok);
      }
    });
    if (!desc.length) return;
    expenses.push({
      description: desc.join(" "),
      amount: value,
      date: parseDateFromText(p) || todayISO()
    });
  });

  return expenses;
};

/* ===============================
   ROTA PRINCIPAL
================================ */
app.post("/oraculo", async (req, res) => {
  try {
    const { message, user_id } = req.body;
    if (!message || !user_id) return res.json({ reply: ORACLE.askClarify });

    memory[user_id] ||= { state: "idle", expenses: [] };

    // DIAGNÓSTICO GERAL
    if (isGeneralReportRequest(message)) {
      const month = extractMonthFromText(message);
      if (!month) return res.json({ reply: "🔮 Qual mês deseja analisar?" });

      const report = await buildMonthlyDiagnosis(user_id, month);
      if (!report) return res.json({ reply: ORACLE.noData });

      let text = `📊 **Diagnóstico Financeiro — ${message}**\n\n`;
      text += `💰 Total gasto: R$ ${report.total.toFixed(2)}\n`;
      text += `📄 Registros: ${report.count}\n\n`;
      text += `🏆 Onde mais drenou recursos:\n`;
      report.ranking.forEach((r,i)=>{
        text += `${i+1}) ${r.category} — R$ ${r.value.toFixed(2)} (${r.percent}%)\n`;
      });
      text += `\n🔮 **Leitura do Oráculo:**\n`;
      text += report.ranking[0].percent > 40
        ? "Uma única categoria domina seus gastos. Ajustes nela geram grande impacto."
        : "Seus gastos estão relativamente equilibrados, mas há margem para otimização.";

      return res.json({ reply: text });
    }

    // CONFIRMAÇÃO
    if (memory[user_id].state === "preview" && isConfirmation(message)) {
      for (const e of memory[user_id].expenses) {
        await supabase.from("despesas").insert({
          user_id,
          description: e.description,
          amount: e.amount,
          category: e.category,
          expense_date: e.date,
          data_vencimento: e.date,
          status: "pendente",
          expense_type: "Variável"
        });
      }
      memory[user_id] = { state: "idle", expenses: [] };
      return res.json({ reply: ORACLE.saved });
    }

    // EXTRAÇÃO
    const extracted = extractExpenses(message);
    if (!extracted.length) return res.json({ reply: ORACLE.nothingFound });

    memory[user_id].expenses = extracted.map(e => ({
      ...e,
      category: classifyCategory(e.description)
    }));
    memory[user_id].state = "preview";

    let preview = "🧾 Posso registrar assim?\n\n";
    memory[user_id].expenses.forEach((e,i)=>{
      preview += `${i+1}) ${e.description} — ${
        e.amount == null ? "Valor não informado" : `R$ ${e.amount}`
      } — ${e.category}\n`;
    });
    preview += `\n${ORACLE.askConfirm}`;

    return res.json({ reply: preview });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ reply: "🌪️ O Oráculo perdeu o foco por um instante." });
  }
});

/* ===============================
   START
================================ */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo Financeiro ativo na porta " + PORT);
});
