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
   MEMÓRIA EM RAM
================================ */
const memory = {};
/*
memory[user_id] = {
  expenses: [],
  awaitingConfirmation: false
}
*/

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

  const iso = t.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];

  return todayISO();
};

/* ===============================
   CATEGORIAS
================================ */
const CATEGORIES = [
  { name: "Transporte", keywords: ["uber", "99", "taxi", "ônibus", "metro", "gasolina", "combustivel"] },
  { name: "Alimentação", keywords: ["lanche", "marmita", "comida", "restaurante", "mercado"] },
  { name: "Compras", keywords: ["mochila", "roupa", "tenis", "bicicleta", "notebook"] },
  { name: "Moradia", keywords: ["aluguel", "condominio", "iptu", "luz", "agua", "internet"] },
  { name: "Saúde", keywords: ["farmacia", "remedio", "medico"] },
  { name: "Educação", keywords: ["curso", "faculdade", "livro"] }
];

const classifyCategory = (text) => {
  const t = text.toLowerCase();
  for (const c of CATEGORIES) {
    if (c.keywords.some(k => t.includes(k))) return c.name;
  }
  return "Outros";
};

/* ===============================
   IDENTIFICADORES DE INTENÇÃO
================================ */
const isConfirmation = (msg) =>
  ["sim", "confirmar", "ok", "pode", "isso"].includes(msg.trim().toLowerCase());

const isReportRequest = (msg) =>
  msg.toLowerCase().includes("relatório");

const extractMonth = (msg) => {
  const months = {
    janeiro: 1, fevereiro: 2, março: 3, abril: 4, maio: 5, junho: 6,
    julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12
  };
  for (const m in months) {
    if (msg.toLowerCase().includes(m)) return months[m];
  }
  return null;
};

/* ===============================
   ROTA PRINCIPAL
================================ */
app.post("/oraculo", async (req, res) => {
  try {
    const { message, user_id } = req.body;
    if (!message || !user_id) {
      return res.json({ reply: "⚠️ Não consegui identificar o usuário." });
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
          expense_type: "Variável"
        });
      }

      memory[user_id] = { expenses: [], awaitingConfirmation: false };

      return res.json({ reply: "✅ Despesas registradas com sucesso." });
    }

    /* ===============================
       RELATÓRIO
    ================================ */
    if (isReportRequest(message)) {
      const month = extractMonth(message);
      if (!month) {
        return res.json({ reply: "📅 Informe o mês desejado (ex: janeiro, fevereiro)." });
      }

      const year = new Date().getFullYear();

      const { data, error } = await supabase
        .from("despesas")
        .select("amount, category, status")
        .eq("user_id", user_id)
        .gte("expense_date", `${year}-${String(month).padStart(2, "0")}-01`)
        .lte("expense_date", `${year}-${String(month).padStart(2, "0")}-31`);

      if (error) return res.json({ reply: "❌ Erro ao gerar relatório." });

      let total = 0;
      const byCategory = {};

      data.forEach(d => {
        total += Number(d.amount);
        byCategory[d.category] = (byCategory[d.category] || 0) + Number(d.amount);
      });

      let text = `📊 **Relatório de ${message}**\n\n💰 Total gasto: R$ ${total.toFixed(2)}\n\n`;
      for (const c in byCategory) {
        text += `• ${c}: R$ ${byCategory[c].toFixed(2)}\n`;
      }

      return res.json({ reply: text });
    }

    /* ===============================
       IA – EXTRAÇÃO DE DESPESAS
    ================================ */
    const ai = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          {
            role: "system",
            content: `
Extraia despesas do texto.
Retorne JSON:
{
  "despesas": [
    { "descricao": "", "valor": 0 }
  ]
}`
          },
          { role: "user", content: message }
        ]
      })
    });

    const aiData = await ai.json();
    const raw = aiData.output?.[0]?.content?.[0]?.text;
    if (!raw) return res.json({ reply: "⚠️ Não consegui entender a despesa." });

    const parsed = JSON.parse(raw);
    if (!parsed.despesas || !parsed.despesas.length) {
      return res.json({ reply: "⚠️ Nenhuma despesa válida identificada." });
    }

    const date = resolveDate(message);

    memory[user_id].expenses = parsed.despesas.map(d => ({
      description: d.descricao,
      amount: d.valor,
      category: classifyCategory(d.descricao),
      date
    }));

    memory[user_id].awaitingConfirmation = true;

    let preview = "🧾 Posso registrar assim?\n\n";
    memory[user_id].expenses.forEach((e, i) => {
      preview += `${i + 1}) ${e.description} — R$${e.amount} — ${e.category}\n`;
    });

    preview += `\n📅 Data: ${date}\n\nResponda **"sim"** para confirmar.`;

    return res.json({ reply: preview });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      reply: "⚠️ O Oráculo teve uma visão turva por um instante."
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
