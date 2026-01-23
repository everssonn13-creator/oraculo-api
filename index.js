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

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  next();
});

app.options("*", (_, res) => res.sendStatus(200));

/* ===============================
   MEMÓRIA POR USUÁRIO (RAM)
================================ */
const memory = {};
/*
memory[userId] = {
  pendingExpense: {
    descricao,
    valor,
    categoria,
    data
  }
}
*/

/* ===============================
   HEALTH
================================ */
app.get("/", (_, res) => {
  res.send("🔮 Oráculo Financeiro ativo e consciente.");
});

/* ===============================
   UTIL
================================ */
const todayISO = () => new Date().toISOString().split("T")[0];

/* ===============================
   ROTA PRINCIPAL
================================ */
app.post("/oraculo", async (req, res) => {
  try {
    const { message, user_id } = req.body;

    console.log("📩 Mensagem:", message);
    console.log("👤 User:", user_id);

    if (!message || !user_id) {
      return res.json({ reply: "⚠️ Não consegui identificar seu usuário." });
    }

    if (!memory[user_id]) memory[user_id] = {};
    if (!memory[user_id].pendingExpense)
      memory[user_id].pendingExpense = {};

    const pending = memory[user_id].pendingExpense;

    /* ===============================
       CHAMADA OPENAI
    ================================ */
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          {
            role: "system",
            content: `
Você é o Oráculo Financeiro 🔮.

OBJETIVO:
Conversar naturalmente com o usuário sobre finanças pessoais.
Quando identificar uma despesa, ajude a registrar.

REGRAS IMPORTANTES:
- Não repita perguntas já respondidas
- Só pergunte o que estiver faltando
- Use os dados já conhecidos
- Nunca invente valores
- Data padrão é hoje se não informada

FORMATO DE SAÍDA (JSON):
{
  "acao": "RESPONDER | COLETAR_DADO | REGISTRAR_DESPESA",
  "dados": {
    "descricao": "",
    "valor": null,
    "categoria": "",
    "data": ""
  },
  "mensagem_usuario": ""
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
      return res.json({ reply: "⚠️ Não consegui interpretar sua mensagem." });
    }

    console.log("🧠 IA:", raw);

    const action = JSON.parse(raw);

    /* ===============================
       ATUALIZA MEMÓRIA
    ================================ */
    const d = action.dados || {};

    if (d.descricao) pending.descricao = d.descricao;
    if (d.valor) pending.valor = d.valor;
    if (d.categoria) pending.categoria = d.categoria;
    if (d.data) pending.data = d.data;

    if (!pending.data) pending.data = todayISO();

    /* ===============================
       VERIFICA O QUE FALTA
    ================================ */
    const missing = [];
    if (!pending.descricao) missing.push("descrição");
    if (!pending.valor) missing.push("valor");
    if (!pending.categoria) missing.push("categoria");

    /* ===============================
       PEDIR SOMENTE O QUE FALTA
    ================================ */
    if (missing.length > 0) {
      return res.json({
        reply:
          action.mensagem_usuario ||
          `Preciso apenas confirmar: ${missing.join(", ")}.`
      });
    }

    /* ===============================
       REGISTRAR DESPESA
    ================================ */
    const { error } = await supabase.from("despesas").insert({
      user_id,
      description: pending.descricao,
      amount: pending.valor,
      category: pending.categoria,
      expense_date: pending.data,
      expense_type: "Variável",
      status: "pendente"
    });

    if (error) {
      console.error("❌ Supabase:", error);
      return res.json({
        reply: "❌ Tive um problema ao salvar a despesa."
      });
    }

    // Limpa memória
    memory[user_id].pendingExpense = {};

    return res.json({
      reply: "✅ Despesa registrada com sucesso! Quer registrar outra?"
    });

  } catch (err) {
    console.error("🔥 Erro:", err);
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
