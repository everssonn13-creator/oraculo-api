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

  if (t.includes("hoje")) return todayISO();
  if (t.includes("ontem")) {
    now.setDate(now.getDate() - 1);
    return now.toISOString().split("T")[0];
  }

  const br = t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return todayISO();
};

/* ===============================
   CATEGORIAS
================================ */
const CATEGORIES = [
  { name: "Transporte", keywords: ["uber", "99", "taxi", "ônibus", "metro", "gasolina"] },
  { name: "Alimentação", keywords: ["lanche", "marmita", "comida", "restaurante", "mercado"] },
  { name: "Compras", keywords: ["roupa", "tenis", "notebook"] },
  { name: "Moradia", keywords: ["aluguel", "condominio", "luz", "agua", "internet"] },
  { name: "Saúde", keywords: ["farmacia", "remedio", "medico"] }
];

const classifyCategory = (text) => {
  const t = text.toLowerCase();
  for (const c of CATEGORIES) {
    if (c.keywords.some(k => t.includes(k))) return c.name;
  }
  return "Outros";
};

/* ===============================
   INTENÇÕES
================================ */
const isConfirmation = (msg) =>
  ["sim", "confirmar", "ok", "pode", "isso"].includes(msg.trim().toLowerCase());

/* ===============================
   EXTRAÇÃO SEM IA (CRÍTICO)
================================ */
const extractExpenseSimple = (text) => {
  // gasolina 200 | lanche 22 | mercado 150
  const match = text.match(/(.+?)\s+(\d+[.,]?\d*)/i);
  if (!match) return null;

  return {
    descricao: match[1].trim(),
    valor: Number(match[2].replace(",", "."))
  };
};

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
      return res.json({ reply: "✅ Despesa registrada com sucesso." });
    }

    /* ===============================
       EXTRAÇÃO (SEM IA PRIMEIRO)
    ================================ */
    let despesas = [];
    const simple = extractExpenseSimple(message);

    if (simple && simple.valor > 0) {
      despesas.push(simple);
    }

    /* ===============================
       FALLBACK IA (SÓ SE PRECISAR)
    ================================ */
    if (!despesas.length) {
      const ai = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          input: `Extraia despesas e retorne JSON no formato:
{
  "despesas": [
    { "descricao": "string", "valor": number }
  ]
}
Texto: ${message}`
        })
      });

      const aiData = await ai.json();
      const text =
        aiData.output_text ||
        aiData.output?.[0]?.content?.[0]?.text;

      if (text) {
        try {
          const parsed = JSON.parse(text);
          if (parsed?.despesas?.length) despesas = parsed.despesas;
        } catch {}
      }
    }

    if (!despesas.length) {
      return res.json({ reply: "⚠️ Não identifiquei nenhuma despesa válida." });
    }

    const date = resolveDate(message);

    memory[user_id].expenses = despesas.map(d => ({
      description: d.descricao,
      amount: Number(d.valor),
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
