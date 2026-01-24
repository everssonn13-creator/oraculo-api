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

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  next();
});

app.options("*", (_, res) => res.sendStatus(200));

/* ===============================
   MEMÓRIA CURTA (POR USUÁRIO)
================================ */
const memory = {};
/*
memory[userId] = {
  expense: {
    descricao,
    valor,
    categoria,
    expense_date
  }
}
*/

/* ===============================
   UTIL
================================ */
const todayISO = () => new Date().toISOString().split("T")[0];

const normalizeDate = (input) => {
  if (!input) return todayISO();

  // ISO direto
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  const parsed = new Date(input);
  if (!isNaN(parsed)) return parsed.toISOString().split("T")[0];

  return todayISO();
};

const normalizeCategory = (raw) => {
  if (!raw) return "Outros";

  const text = raw.toLowerCase();

  if (["lanche", "pizza", "comida", "almoço", "jantar"].some(w => text.includes(w)))
    return "Alimentação";

  if (["uber", "taxi", "gasolina", "combustível"].some(w => text.includes(w)))
    return "Transporte";

  if (["aluguel", "condomínio"].some(w => text.includes(w)))
    return "Moradia";

  if (["netflix", "spotify", "assinatura"].some(w => text.includes(w)))
    return "Assinaturas";

  return raw;
};

/* ===============================
   HEALTH
================================ */
app.get("/", (_, res) => {
  res.send("🔮 Oráculo Financeiro ativo e lúcido.");
});

/* ===============================
   ROTA PRINCIPAL
================================ */
app.post("/oraculo", async (req, res) => {
  try {
    const { message, user_id } = req.body;

    if (!message || !user_id) {
      return res.json({ reply: "⚠️ Não consegui identificar seu usuário." });
    }

    if (!memory[user_id]) {
      memory[user_id] = { expense: {} };
    }

    const pending = memory[user_id].expense;

    /* ===============================
       OPENAI
    ================================ */
    const response = await fetch("https://api.openai.com/v1/responses", {
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
Você é o Oráculo Financeiro 🔮.

Extraia dados de despesas a partir de linguagem natural.

REGRAS:
- NÃO invente valores
- NÃO repita perguntas
- Só peça o que faltar
- Se a data não for dita, deixe em branco

RESPONDA APENAS EM JSON:

{
  "acao": "RESPONDER | REGISTRAR_DESPESA",
  "dados": {
    "descricao": "",
    "valor": null,
    "categoria": "",
    "expense_date": ""
  },
  "mensagem": ""
}
`
          },
          {
            role: "user",
            content: message
          }
        ]
      })
    });

    const data = await response.json();

    let raw = null;
    for (const o of data.output || []) {
      for (const c of o.content || []) {
        if (c.type === "output_text") raw = c.text;
      }
    }

    if (!raw) {
      return res.json({ reply: "⚠️ Não consegui entender sua mensagem." });
    }

    const parsed = JSON.parse(raw);
    const d = parsed.dados || {};

    /* ===============================
       MEMÓRIA
    ================================ */
    if (d.descricao) pending.descricao = d.descricao;
    if (d.valor) pending.valor = d.valor;
    if (d.categoria) pending.categoria = normalizeCategory(d.categoria);
    if (d.expense_date) pending.expense_date = normalizeDate(d.expense_date);

    if (!pending.expense_date) pending.expense_date = todayISO();

    /* ===============================
       CHECAR FALTANTES
    ================================ */
    const missing = [];
    if (!pending.descricao) missing.push("descrição");
    if (!pending.valor) missing.push("valor");
    if (!pending.categoria) missing.push("categoria");

    if (missing.length > 0) {
      return res.json({
        reply:
          parsed.mensagem ||
          `Preciso apenas confirmar: ${missing.join(", ")}.`
      });
    }

    /* ===============================
       INSERT SUPABASE
    ================================ */
    const { error } = await supabase.from("despesas").insert({
      user_id,
      description: pending.descricao,
      amount: pending.valor,
      category: pending.categoria,
      expense_date: pending.expense_date,
      expense_type: "Variável",
      status: "pendente"
    });

    if (error) {
      console.error(error);
      return res.json({ reply: "❌ Erro ao salvar a despesa." });
    }

    memory[user_id].expense = {};

    return res.json({
      reply: "✅ Despesa registrada com sucesso. Quer adicionar outra?"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      reply: "⚠️ O Oráculo teve uma falha momentânea."
    });
  }
});

/* ===============================
   START
================================ */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo ativo na porta " + PORT);
});
