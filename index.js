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
   MEMÓRIA CURTA
================================ */
const memory = {};

/* ===============================
   UTIL — DATAS (JS PURO)
================================ */
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function resolveDate(expression) {
  const today = startOfDay(new Date());

  if (!expression) return today;

  const text = expression.toLowerCase();

  if (text.includes("hoje")) return today;

  if (text.includes("ontem")) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d;
  }

  if (text.includes("anteontem")) {
    const d = new Date(today);
    d.setDate(d.getDate() - 2);
    return d;
  }

  if (text.includes("semana passada")) {
    const d = new Date(today);
    d.setDate(d.getDate() - 7);
    return d;
  }

  if (text.includes("mês passado")) {
    const d = new Date(today);
    d.setMonth(d.getMonth() - 1);
    return d;
  }

  if (text.includes("sexta passada")) {
    const d = new Date(today);
    const day = d.getDay(); // 0 dom, 5 sex
    const diff = day >= 5 ? day - 5 : day + 2;
    d.setDate(d.getDate() - diff - 7);
    return d;
  }

  // dd/MM/yyyy
  const matchNumeric = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (matchNumeric) {
    const [, dd, mm, yyyy] = matchNumeric;
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  }

  return today;
}

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
      return res.json({ reply: "⚠️ Usuário não identificado." });
    }

    if (!memory[user_id]) {
      memory[user_id] = { pendingExpense: {} };
    }

    const pending = memory[user_id].pendingExpense;

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
- Nunca invente valores
- Nunca invente datas
- Se a data for relativa (ex: "sexta passada"), apenas IDENTIFIQUE
- Não calcule datas
- Não assuma categoria se não tiver certeza

FORMATO JSON PURO:
{
  "acao": "RESPONDER | COLETAR_DADO | REGISTRAR_DESPESA",
  "dados": {
    "descricao": "",
    "valor": null,
    "categoria": "",
    "expressao_data": ""
  },
  "mensagem_usuario": ""
}
`
          },
          { role: "user", content: message }
        ]
      })
    });

    const aiData = await response.json();

    let raw = null;
    for (const o of aiData.output || []) {
      for (const c of o.content || []) {
        if (c.type === "output_text") raw = c.text;
      }
    }

    if (!raw) {
      return res.json({ reply: "⚠️ Não consegui entender." });
    }

    const action = JSON.parse(raw);
    const d = action.dados || {};

    if (d.descricao) pending.descricao = d.descricao;
    if (d.valor) pending.valor = d.valor;
    if (d.categoria) pending.categoria = d.categoria;
    if (d.expressao_data) pending.expressao_data = d.expressao_data;

    const missing = [];
    if (!pending.descricao) missing.push("descrição");
    if (!pending.valor) missing.push("valor");
    if (!pending.categoria) missing.push("categoria");

    if (missing.length > 0) {
      return res.json({
        reply:
          action.mensagem_usuario ||
          `Preciso confirmar: ${missing.join(", ")}.`
      });
    }

    const finalDate = resolveDate(pending.expressao_data);

    const { error } = await supabase.from("despesas").insert({
      user_id,
      description: pending.descricao,
      amount: pending.valor,
      category: pending.categoria,
      expense_date: finalDate.toISOString(),
      data_vencimento: finalDate.toISOString(),
      expense_type: "Variável",
      status: "pendente"
    });

    if (error) {
      console.error(error);
      return res.json({ reply: "❌ Erro ao salvar despesa." });
    }

    memory[user_id].pendingExpense = {};

    return res.json({
      reply: "✅ Despesa registrada com sucesso! Quer adicionar outra?"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      reply: "⚠️ O Oráculo sofreu uma falha temporária."
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
