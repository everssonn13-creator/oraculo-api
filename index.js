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
  askClarify: "🔮 Minha visão ficou turva… pode me dar mais detalhes?",
  askConfirm: "Se minha leitura estiver correta, diga **\"sim\"**.",
  saved: "📜 As despesas foram seladas no livro financeiro.",
  nothingFound: "🌫️ Não consegui enxergar nenhuma despesa nessa mensagem.",
  aborted: "🌫️ As palavras se dispersaram… tente novamente com mais clareza.",
  noData: "🌫️ Ainda não há registros suficientes para essa análise."
};

/* ===============================
   MEMÓRIA (CURTA)
================================ */
const memory = {};
/*
memory[user_id] = {
  state: "idle" | "preview",
  expenses: []
}
*/

/* ===============================
   DATAS
================================ */
const todayISO = () => new Date().toISOString().split("T")[0];

const parseDateFromText = (text) => {
  const t = text.toLowerCase();

  if (t.includes("ontem")) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }

  if (t.includes("hoje")) return todayISO();

  if (t.includes("amanhã") || t.includes("amanha")) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }

  const match = t.match(
    /dia\s+(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/
  );

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
   CATEGORIAS (COMPLETAS)
================================ */
const CATEGORY_MAP = {
  Alimentação: [
    "comi","almocei","jantei","lanchei","pedi comida","comer fora","comi fora",
    "lanche","pastel","pizza","hamburguer","hambúrguer","marmita","pf",
    "restaurante","lanchonete","padaria","bar",
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
    "dentista","consulta","médico","medico",
    "farmácia","farmacia","remédio","remedio",
    "hospital","exame","terapia"
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
    "cinema","show","viagem","passeio","bar","balada"
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
    for (const w of words) {
      if (t.includes(w)) score++;
    }
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
  ["sei lá","sei la","qualquer coisa","umas coisas"].some(k =>
    msg.toLowerCase().includes(k)
  );

/* ===============================
   RELATÓRIO POR CATEGORIA
================================ */
const isCategoryReportRequest = (msg) => {
  const t = msg.toLowerCase();
  return (
    t.includes("quanto gastei com") ||
    t.includes("gastei com") ||
    t.includes("gastos com") ||
    t.includes("total com")
  );
};

const extractCategoryFromText = (msg) => {
  const t = msg.toLowerCase();
  for (const cat of Object.keys(CATEGORY_MAP)) {
    if (t.includes(cat.toLowerCase())) return cat;
  }
  return null;
};

const buildCategoryReport = async (user_id, category) => {
  const { data, error } = await supabase
    .from("despesas")
    .select("amount")
    .eq("user_id", user_id)
    .eq("category", category);

  if (error || !data || !data.length) return null;

  let total = 0;
  let count = 0;
  for (const d of data) {
    if (d.amount == null) continue;
    total += Number(d.amount);
    count++;
  }

  return { total, count };
};

/* ===============================
   SEGMENTAÇÃO + EXTRAÇÃO
================================ */
const segmentByTime = (text) => {
  const normalized = text.replace(/,/g, " | ").replace(/\s+e\s+/gi, " | ");
  const parts = normalized.split("|").map(p => p.trim()).filter(Boolean);

  let currentDate = null;
  return parts.map(p => {
    const d = parseDateFromText(p);
    if (d) currentDate = d;
    return {
      text: p.replace(/ontem|hoje|amanhã|amanha/gi, "").trim(),
      date: d ?? currentDate ?? todayISO()
    };
  });
};

const extractExpenses = (text) => {
  const segments = segmentByTime(text);
  const expenses = [];

  for (const seg of segments) {
    const tokens = seg.text.split(" ");
    let value = null;
    let desc = [];

    for (const tok of tokens) {
      if (/^\d+([.,]\d+)?$/.test(tok)) {
        value = Number(tok.replace(",", "."));
        break;
      }
      desc.push(tok);
    }

    const description = desc.join(" ").trim();
    if (!description) continue;

    expenses.push({ description, amount: value, date: seg.date });
  }

  return expenses;
};

/* ===============================
   ROTA PRINCIPAL
================================ */
app.post("/oraculo", async (req, res) => {
  try {
    const { message, user_id } = req.body;
    if (!message || !user_id) {
      return res.json({ reply: ORACLE.askClarify });
    }

    if (isAbortText(message)) {
      memory[user_id] = { state: "idle", expenses: [] };
      return res.json({ reply: ORACLE.aborted });
    }

    if (isCategoryReportRequest(message)) {
      const category = extractCategoryFromText(message);
      if (!category) {
        return res.json({ reply: "🔮 Qual categoria deseja analisar?" });
      }

      const report = await buildCategoryReport(user_id, category);
      if (!report) {
        return res.json({ reply: ORACLE.noData });
      }

      return res.json({
        reply:
          `📊 **Leitura de ${category}**\n\n` +
          `💰 Total gasto: R$ ${report.total.toFixed(2)}\n` +
          `📄 Registros considerados: ${report.count}\n\n` +
          `🔮 Posso analisar outras categorias se desejar.`
      });
    }

    if (!memory[user_id]) memory[user_id] = { state: "idle", expenses: [] };

    if (memory[user_id].state === "preview") {
      if (isConfirmation(message)) {
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
      memory[user_id] = { state: "idle", expenses: [] };
    }

    const extracted = extractExpenses(message);
    if (!extracted.length) {
      return res.json({ reply: ORACLE.nothingFound });
    }

    memory[user_id].expenses = extracted.map(e => ({
      ...e,
      category: classifyCategory(e.description)
    }));
    memory[user_id].state = "preview";

    let preview = "🧾 Posso registrar assim?\n\n";
    memory[user_id].expenses.forEach((e, i) => {
      preview += `${i + 1}) ${e.description} — ${
        e.amount == null ? "Valor não informado" : `R$ ${e.amount}`
      } — ${e.category}\n`;
    });
    preview += `\n${ORACLE.askConfirm}`;

    return res.json({ reply: preview });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ reply: "🌪️ As visões se romperam por um instante…" });
  }
});

/* ===============================
   START
================================ */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo Financeiro ativo na porta " + PORT);
});
