import express from "express";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

/* ===============================
   IMPORTA A LÓGICA REAL DO APP
================================ */
import {
  EXPENSE_CATEGORIES,
  classifyExpenseToCategory,
  getCategoryByName
} from "./src/constants/expenseCategories.js";

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

app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  next();
});

/* ===============================
   MEMÓRIA CURTA (POR USUÁRIO)
================================ */
const memory = {};
/*
memory[userId] = {
  expense: {
    description,
    amount,
    category,
    date
  }
}
*/

/* ===============================
   UTIL – DATAS (SEM LIB)
================================ */
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const toISO = (date) => date.toISOString().split("T")[0];

const parseDateFromText = (text) => {
  const lower = text.toLowerCase();

  if (lower.includes("hoje")) return today();
  if (lower.includes("amanhã") || lower.includes("amanha")) {
    const d = today();
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (lower.includes("ontem")) {
    const d = today();
    d.setDate(d.getDate() - 1);
    return d;
  }

  // dd/mm/yyyy
  const numeric = lower.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (numeric) {
    const [, day, month, year] = numeric;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  // "dia 5 do próximo mês"
  const nextMonth = lower.match(/dia\s(\d{1,2}).*proximo mes/);
  if (nextMonth) {
    const d = today();
    d.setMonth(d.getMonth() + 1);
    d.setDate(Number(nextMonth[1]));
    return d;
  }

  return null;
};

/* ===============================
   HEALTH
================================ */
app.get("/", (_, res) => {
  res.send("🔮 Oráculo Financeiro ativo.");
});

/* ===============================
   ROTA PRINCIPAL
================================ */
app.post("/oraculo", async (req, res) => {
  try {
    const { message, user_id } = req.body;

    if (!message || !user_id) {
      return res.json({ reply: "Não consegui identificar seu usuário." });
    }

    if (!memory[user_id]) {
      memory[user_id] = { expense: {} };
    }

    const state = memory[user_id].expense;

    /* ===============================
       IA – SYSTEM PROMPT
    ================================ */
    const systemPrompt = `
Você é o ORÁCULO FINANCEIRO 🔮

PERSONALIDADE:
- Tom humano, empático e claro
- Levemente bem-humorado
- Age como um mentor financeiro experiente
- Nunca infantil
- Nunca robótico

OBJETIVO:
Ajudar o usuário a registrar despesas corretamente.

CATEGORIAS EXISTENTES (NUNCA INVENTAR OUTRAS):

${EXPENSE_CATEGORIES.map(c => `- ${c.name}`).join("\n")}

REGRAS IMPORTANTES:
- Nunca crie categorias novas
- Se reconhecer a categoria, NÃO pergunte
- Só pergunte o que estiver faltando
- Use memória da conversa
- Datas possíveis:
  hoje, amanhã, ontem,
  dd/mm/yyyy,
  "dia X do próximo mês"

FORMATO DE SAÍDA OBRIGATÓRIO (JSON PURO):
{
  "acao": "RESPONDER | COLETAR | REGISTRAR",
  "dados": {
    "description": "",
    "amount": null,
    "category": "",
    "dateText": ""
  },
  "mensagem": ""
}
`;

    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ]
      })
    });

    const data = await aiResponse.json();

    let raw;
    for (const o of data.output || []) {
      for (const c of o.content || []) {
        if (c.type === "output_text") raw = c.text;
      }
    }

    if (!raw) {
      return res.json({ reply: "Não consegui entender sua mensagem." });
    }

    const parsed = JSON.parse(raw);
    const d = parsed.dados || {};

    /* ===============================
       MEMÓRIA
    ================================ */
    if (d.description) state.description = d.description;
    if (d.amount) state.amount = d.amount;

    if (d.category) {
      const cat = getCategoryByName(d.category);
      state.category = cat.name;
    }

    if (d.dateText) {
      const parsedDate = parseDateFromText(d.dateText);
      if (parsedDate) state.date = parsedDate;
    }

    if (!state.date) state.date = today();

    /* ===============================
       AUTO CLASSIFICAÇÃO
    ================================ */
    if (!state.category && state.description) {
      const auto = classifyExpenseToCategory(state.description);
      if (auto.id !== "outros") {
        state.category = auto.name;
      }
    }

    /* ===============================
       VERIFICA FALTANTES
    ================================ */
    const missing = [];
    if (!state.description) missing.push("descrição");
    if (!state.amount) missing.push("valor");
    if (!state.category) missing.push("categoria");

    if (missing.length > 0) {
      return res.json({
        reply:
          parsed.mensagem ||
          `Só preciso confirmar: ${missing.join(", ")}.`
      });
    }

    /* ===============================
       REGISTRA
    ================================ */
    await supabase.from("despesas").insert({
      user_id,
      description: state.description,
      amount: state.amount,
      category: state.category,
      expense_date: toISO(state.date),
      status: "pendente",
      expense_type: "Variável"
    });

    memory[user_id].expense = {};

    return res.json({
      reply: "Despesa registrada com sucesso. Quer adicionar outra?"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      reply: "O Oráculo teve uma falha momentânea."
    });
  }
});

/* ===============================
   START
================================ */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo Financeiro rodando na porta", PORT);
});
