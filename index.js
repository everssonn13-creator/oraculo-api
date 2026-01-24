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

/* ===============================
   UTIL — DATAS (SEM LIB)
================================ */
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function resolveDate(text) {
  if (!text) return null;

  const base = startOfDay(new Date());
  const lower = text.toLowerCase();

  if (lower.includes("hoje")) return base;
  if (lower.includes("ontem")) return new Date(base.setDate(base.getDate() - 1));
  if (lower.includes("amanhã")) return new Date(base.setDate(base.getDate() + 1));

  if (lower.includes("semana passada")) {
    const d = new Date(base);
    d.setDate(d.getDate() - 7);
    return d;
  }

  const weekdays = {
    domingo: 0,
    segunda: 1,
    terça: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sábado: 6,
  };

  for (const day in weekdays) {
    if (lower.includes(day)) {
      const target = weekdays[day];
      const diff = (base.getDay() - target + 7) % 7 || 7;
      return new Date(base.setDate(base.getDate() - diff));
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(text);
  }

  return null;
}

/* ===============================
   CATEGORIAS E SUBCATEGORIAS
================================ */
const categoryMap = [
  { keywords: ["uber", "99", "taxi", "gasolina", "combustível"], category: "Transporte" },
  { keywords: ["mercado", "lanche", "almoço", "jantar", "restaurante"], category: "Alimentação" },
  { keywords: ["notebook", "bicicleta", "tênis", "roupa", "sapato"], category: "Compras" },
  { keywords: ["aluguel", "condomínio", "energia", "luz", "água"], category: "Moradia" },
];

function inferCategory(description) {
  if (!description) return null;
  const text = description.toLowerCase();
  for (const c of categoryMap) {
    if (c.keywords.some(k => text.includes(k))) {
      return c.category;
    }
  }
  return null;
}

/* ===============================
   HEALTH
================================ */
app.get("/", (_, res) => {
  res.send("🔮 Oráculo Financeiro desperto.");
});

/* ===============================
   ORÁCULO
================================ */
app.post("/oraculo", async (req, res) => {
  try {
    const { message, user_id } = req.body;
    if (!message || !user_id) {
      return res.json({ reply: "Não consegui identificar seu usuário." });
    }

    if (!memory[user_id]) memory[user_id] = {};
    if (!memory[user_id].pending) memory[user_id].pending = {};

    const pending = memory[user_id].pending;

    /* ===============================
       OPENAI
    ================================ */
    const ai = await fetch("https://api.openai.com/v1/responses", {
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
Você é o ORÁCULO FINANCEIRO 🔮
Um mestre em finanças pessoais, humano, inteligente e conversacional.

Extraia da fala do usuário:
- descrição
- valor
- expressão de data (ex: sexta passada)

Retorne SOMENTE JSON:
{
  "descricao": "",
  "valor": null,
  "data": ""
}
`
          },
          { role: "user", content: message }
        ]
      })
    });

    const json = await ai.json();
    let raw = null;

    for (const o of json.output || []) {
      for (const c of o.content || []) {
        if (c.type === "output_text") raw = c.text;
      }
    }

    if (!raw) {
      return res.json({ reply: "Não consegui interpretar sua mensagem." });
    }

    const parsed = JSON.parse(raw);

    if (parsed.descricao) pending.descricao = parsed.descricao;
    if (parsed.valor) pending.valor = parsed.valor;
    if (parsed.data) pending.dataText = parsed.data;

    if (!pending.category && pending.descricao) {
      pending.category = inferCategory(pending.descricao);
    }

    if (!pending.date && pending.dataText) {
      const d = resolveDate(pending.dataText);
      if (d) pending.date = d.toISOString();
    }

    /* ===============================
       VALIDAR
    ================================ */
    const missing = [];
    if (!pending.descricao) missing.push("descrição");
    if (!pending.valor) missing.push("valor");
    if (!pending.category) missing.push("categoria");

    if (missing.length > 0) {
      return res.json({
        reply: `Só preciso confirmar: ${missing.join(", ")}.`
      });
    }

    if (!pending.date) pending.date = new Date().toISOString();

    /* ===============================
       SALVAR
    ================================ */
    const { error } = await supabase.from("despesas").insert({
      user_id,
      description: pending.descricao,
      amount: pending.valor,
      category: pending.category,
      expense_date: pending.date,
      data_vencimento: pending.date,
      expense_type: "Variável",
      status: "pendente"
    });

    if (error) {
      console.error(error);
      return res.json({ reply: "Tive um problema ao salvar a despesa." });
    }

    memory[user_id].pending = {};

    return res.json({
      reply: "✅ Despesa registrada com sucesso! Quer adicionar outra?"
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      reply: "O Oráculo teve uma falha momentânea."
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
