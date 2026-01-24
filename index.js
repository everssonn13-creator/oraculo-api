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
   MEMÓRIA CURTA (POR USUÁRIO)
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
  res.send("🔮 Oráculo Financeiro ativo.");
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

    if (!message || !user_id) {
      return res.json({ reply: "⚠️ Usuário não identificado." });
    }

    if (!memory[user_id]) memory[user_id] = {};
    if (!memory[user_id].pendingExpense)
      memory[user_id].pendingExpense = {};

    const pending = memory[user_id].pendingExpense;

    /* ===============================
       OPENAI
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
Você é o ORÁCULO FINANCEIRO 🔮.

OBJETIVO:
Registrar despesas automaticamente a partir de mensagens naturais.

REGRAS:
- Nunca invente valores ou datas
- Nunca repita perguntas
- Use sempre a memória
- Data padrão: hoje
- Registre assim que todos os dados existirem

DADOS OBRIGATÓRIOS:
descrição, valor, categoria, data

DATAS:
Interprete datas naturais (ontem, amanhã, dia 10 de janeiro de 2026, etc).
Formato final: YYYY-MM-DD

CATEGORIAS (inferir sempre que possível):
Alimentação, Transporte, Compras, Moradia, Saúde, Lazer

FORMATO DE RESPOSTA (JSON):
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
      return res.json({ reply: "⚠️ Não consegui entender sua mensagem." });
    }

    const action = JSON.parse(raw);
    const d = action.dados || {};

    /* ===============================
       ATUALIZA MEMÓRIA
    ================================ */
    if (d.descricao) pending.descricao = d.descricao;
    if (d.valor) pending.valor = d.valor;
    if (d.categoria) pending.categoria = d.categoria;
    if (d.data) pending.data = d.data;

    if (!pending.data) pending.data = todayISO();

    /* ===============================
       VERIFICA FALTANTES
    ================================ */
    const missing = [];
    if (!pending.descricao) missing.push("descrição");
    if (!pending.valor) missing.push("valor");
    if (!pending.categoria) missing.push("categoria");

    if (missing.length > 0) {
      return res.json({
        reply:
          action.mensagem_usuario ||
          `Preciso apenas confirmar: ${missing.join(", ")}.`
      });
    }

    /* ===============================
       REGISTRA NO SUPABASE
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
      console.error("Supabase error:", error);
      return res.json({ reply: "❌ Erro ao salvar despesa." });
    }

    memory[user_id].pendingExpense = {};

    return res.json({
      reply: "✅ Despesa registrada com sucesso! Quer adicionar outra?"
    });

  } catch (err) {
    console.error("Erro Oráculo:", err);
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
