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
   CORS (LIBERADO)
================================ */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

/* ===============================
   MEMÓRIA CURTA (RAM)
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
   UTIL — DATAS
================================ */
const todayISO = () => new Date().toISOString().split("T")[0];

const normalizeToISODate = (input) => {
  if (!input) return null;

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  // dd/mm/yyyy
  const br = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const [, d, m, y] = br;
    return `${y}-${m}-${d}`;
  }

  return null;
};

const resolveRelativeDate = (text) => {
  const now = new Date();

  if (text.includes("hoje")) return todayISO();

  if (text.includes("amanhã")) {
    now.setDate(now.getDate() + 1);
    return now.toISOString().split("T")[0];
  }

  return null;
};

/* ===============================
   CATEGORIAS (ALINHADAS AO APP)
================================ */
const CATEGORIES = [
  { id: "moradia", name: "Moradia", keywords: ["aluguel", "condominio", "iptu", "luz", "agua", "internet", "gas"] },
  { id: "alimentacao", name: "Alimentação", keywords: ["mercado", "supermercado", "lanche", "comida", "restaurante", "padaria"] },
   { id: "compras", name: "Compras", keywords: ["tenis", "roupa", "bicicleta", "notebook", "eletronico"] },
  { id: "transporte", name: "Transporte", keywords: ["uber", "99", "taxi", "onibus", "metro", "gasolina", "combustivel"] },
  { id: "saude", name: "Saúde", keywords: ["farmacia", "medico", "dentista", "remedio"] },
  { id: "educacao", name: "Educação", keywords: ["curso", "faculdade", "livro"] },
  { id: "lazer", name: "Lazer", keywords: ["cinema", "show", "bar", "viagem"] },
  { id: "assinaturas", name: "Assinaturas", keywords: ["netflix", "spotify", "assinatura", "plano"] },
  { id: "pets", name: "Pets", keywords: ["pet", "racao", "veterinario"] },
  { id: "presentes", name: "Presentes", keywords: ["presente", "aniversario"] },
  { id: "dividas", name: "Dívidas", keywords: ["emprestimo", "financiamento", "divida", "parcela"] },
  { id: "investimentos", name: "Investimentos", keywords: ["acao", "investimento", "fundo", "cripto"] }
];

const classifyCategory = (text = "") => {
  const t = text.toLowerCase();
  for (const c of CATEGORIES) {
    if (c.keywords.some(k => t.includes(k))) return c.name;
  }
  return "Outros";
};

/* ===============================
   HEALTH
================================ */
app.get("/", (_, res) => {
  res.send("🔮 Oráculo Financeiro ativo e vigilante.");
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

    if (!memory[user_id]) memory[user_id] = { pendingExpense: {} };
    const pending = memory[user_id].pendingExpense;

    /* ===============================
       OPENAI
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
Você é o ORÁCULO FINANCEIRO 🔮

PERSONALIDADE:
Sábio, humano, claro, empático e inteligente. Fala como um mentor financeiro moderno.
Nunca é robótico. Nunca inventa dados.

OBJETIVO:
Interpretar mensagens financeiras livres e registrar despesas corretamente.

REGRAS:
- Extraia: descrição, valor, data, categoria
- Datas aceitas: hoje, amanhã, DD/MM/YYYY, YYYY-MM-DD
- Se faltar algo, pergunte APENAS o que falta
- Categorias válidas:
Moradia, Alimentação, Transporte, Saúde, Educação, Lazer, Compras, Assinaturas, Pets, Presentes, Dívidas, Investimentos, Outros

FORMATO DE SAÍDA (JSON PURO):
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
          { role: "user", content: message }
        ]
      })
    });

    const data = await ai.json();
    let raw = null;

    for (const o of data.output || []) {
      for (const c of o.content || []) {
        if (c.type === "output_text") raw = c.text;
      }
    }

    if (!raw) return res.json({ reply: "⚠️ Não consegui interpretar." });

    const action = JSON.parse(raw);
    const d = action.dados || {};

    if (d.descricao) pending.descricao = d.descricao;
    if (d.valor) pending.valor = d.valor;

    if (d.categoria) pending.categoria = d.categoria;
    if (!pending.categoria && pending.descricao) {
      pending.categoria = classifyCategory(pending.descricao);
    }

    if (d.data) {
      pending.data =
        normalizeToISODate(d.data) ||
        resolveRelativeDate(d.data) ||
        pending.data;
    }

    if (!pending.data) pending.data = todayISO();

    const missing = [];
    if (!pending.descricao) missing.push("descrição");
    if (!pending.valor) missing.push("valor");
    if (!pending.categoria) missing.push("categoria");

    if (missing.length) {
      return res.json({
        reply: action.mensagem_usuario || `Preciso confirmar: ${missing.join(", ")}.`
      });
    }

    /* ===============================
       SALVAR NO SUPABASE
    ================================ */
    const { error } = await supabase.from("despesas").insert({
      user_id,
      description: pending.descricao,
      amount: pending.valor,
      category: pending.categoria,
      expense_date: pending.data,
      data_vencimento: pending.data,
      status: "pendente",
      expense_type: "Variável"
    });

    if (error) {
      console.error(error);
      return res.json({ reply: "❌ Erro ao salvar a despesa." });
    }

    memory[user_id].pendingExpense = {};

    return res.json({
      reply: "✅ Despesa registrada com sucesso! Deseja registrar outra?"
    });

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
