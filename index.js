import express from "express";
import fetch from "node-fetch";
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
   MEMÓRIA CURTA
================================ */
const memory = {};

/* ===============================
   DATAS
================================ */
const todayISO = () => new Date().toISOString().split("T")[0];

const resolveDate = (text) => {
  const t = text.toLowerCase();
  const now = new Date();

  if (t.includes("amanhã")) {
    now.setDate(now.getDate() + 1);
    return now.toISOString().split("T")[0];
  }

  if (t.includes("hoje")) return todayISO();
  if (t.includes("ontem")) {
    now.setDate(now.getDate() - 1);
    return now.toISOString().split("T")[0];
  }

  return todayISO();
};

/* ===============================
   CATEGORIAS (MELHORADAS)
================================ */
const CATEGORIES = [
  { name: "Transporte", keywords: ["uber", "99", "taxi", "ônibus", "metro", "gasolina", "combustivel", "abasteci"] },
  { name: "Alimentação", keywords: ["lanche", "pastel", "marmita", "comida", "restaurante", "mercado"] },
  { name: "Saúde", keywords: ["farmacia", "remedio", "medico", "dentista", "consulta", "odontologia"] },
  { name: "Moradia", keywords: ["aluguel", "condominio", "luz", "agua", "internet"] },
  { name: "Compras", keywords: ["roupa", "tenis", "notebook"] }
];

const classifyCategory = (text) => {
  const t = text.toLowerCase();
  for (const c of CATEGORIES) {
    if (c.keywords.some(k => t.includes(k))) return c.name;
  }
  return "Outros";
};

/* ===============================
   LIMPEZA DE TEXTO
================================ */
const cleanDescription = (text) => {
  return text
    .toLowerCase()
    .replace(/comprei|gastei|paguei|abasteci|valor|por|de|com|um|uma|dois|duas/gi, "")
    .replace(/\s+/g, " ")
    .trim();
};

/* ===============================
   EXTRAÇÃO MÚLTIPLA (CORE)
================================ */
const extractExpenses = (text) => {
  const normalized = text
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/ e /g, " | ")
    .replace(/ também /g, " | ");

  const parts = normalized.split("|");
  const expenses = [];

  for (const part of parts) {
    const match = part.match(/(.+?)\s+(\d+[.,]?\d*)/);
    if (!match) continue;

    const descricao = cleanDescription(match[1]);
    const valor = Number(match[2].replace(",", "."));

    if (descricao && valor > 0) {
      expenses.push({ descricao, valor });
    }
  }

  return expenses;
};

/* ===============================
   CONFIRMAÇÃO
================================ */
const isConfirmation = (msg) =>
  ["sim", "confirmar", "ok", "pode", "isso"].includes(msg.trim().toLowerCase());

/* ===============================
   ROTA PRINCIPAL
================================ */
app.post("/oraculo", async (req, res) => {
  try {
    const { message, user_id } = req.body;
    if (!message || !user_id) {
      return res.json({ reply: "⚠️ Usuário não identificado." });
    }

    if (!memory[user_id]) {
      memory[user_id] = { expenses: [], awaitingConfirmation: false };
    }

    /* ===============================
       CONFIRMAÇÃO
    ================================ */
    if (memory[user_id].awaitingConfirmation && isConfirmation(message)) {
      for (const e of memory[user_id].expenses) {
        await supabase.from("despesas").insert({
          user_id,
          description: e.description,
          amount: e.amount,
          category: e.category,
          expense_date: e.date,
          data_vencimento: e.date,
          status: "pendente",
          expense_type: "Variável",
          is_recurring: false
        });
      }

      memory[user_id] = { expenses: [], awaitingConfirmation: false };
      return res.json({ reply: "✅ Despesas registradas com sucesso." });
    }

    /* ===============================
       EXTRAÇÃO
    ================================ */
    const extracted = extractExpenses(message);
    if (!extracted.length) {
      return res.json({ reply: "⚠️ Não identifiquei despesas válidas." });
    }

    const date = resolveDate(message);

    memory[user_id].expenses = extracted.map(d => ({
      description: d.descricao,
      amount: d.valor,
      category: classifyCategory(d.descricao),
      date
    }));

    memory[user_id].awaitingConfirmation = true;

    let preview = "🧾 Posso registrar assim?\n\n";
    memory[user_id].expenses.forEach((e, i) => {
      preview += `${i + 1}) ${e.description} — R$ ${e.amount} — ${e.category}\n`;
    });

    preview += `\n📅 Data: ${date}\n\nResponda "sim" para confirmar.`;

    return res.json({ reply: preview });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      reply: "⚠️ O Oráculo teve uma visão turva."
    });
  }
});

/* ===============================
   START
================================ */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo Financeiro ativo na porta " + PORT);
});
