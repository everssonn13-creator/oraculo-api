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
   MEMÓRIA CURTA (RAM)
================================ */
const memory = {};
/*
memory[userId] = {
  pendingExpenses: []
}
*/

/* ===============================
   UTIL — DATAS
================================ */
const todayISO = () => new Date().toISOString().split("T")[0];

const normalizeDate = (input = "") => {
  if (!input) return todayISO();

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  // dd/mm/yyyy
  const br = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const [, d, m, y] = br;
    return `${y}-${m}-${d}`;
  }

  if (input.includes("amanhã")) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }

  if (input.includes("hoje")) {
    return todayISO();
  }

  return todayISO();
};

/* ===============================
   CATEGORIAS (IGUAIS AO APP)
================================ */
const CATEGORIES = [
  { name: "Moradia", keywords: ["aluguel", "condominio", "iptu", "luz", "agua", "internet"] },
  { name: "Alimentação", keywords: ["lanche", "mercado", "comida", "restaurante", "padaria"] },
  { name: "Transporte", keywords: ["uber", "99", "taxi", "onibus", "metro", "gasolina", "combustivel"] },
  { name: "Saúde", keywords: ["farmacia", "medico", "dentista", "remedio"] },
  { name: "Educação", keywords: ["curso", "faculdade", "livro"] },
  { name: "Lazer", keywords: ["cinema", "show", "viagem", "bar"] },
  { name: "Compras", keywords: ["tenis", "roupa", "mochila", "bicicleta", "notebook", "eletronico"] },
  { name: "Assinaturas", keywords: ["netflix", "spotify", "assinatura"] },
  { name: "Pets", keywords: ["pet", "racao", "veterinario"] },
  { name: "Presentes", keywords: ["presente", "aniversario"] },
  { name: "Dívidas", keywords: ["emprestimo", "financiamento", "divida", "parcela"] },
  { name: "Investimentos", keywords: ["acao", "fundo", "cripto", "investimento"] }
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
  res.send("🔮 Oráculo Financeiro ativo.");
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

    if (!memory[user_id]) memory[user_id] = { pendingExpenses: [] };

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
Mentor financeiro humano, direto, claro e empático.

OBJETIVO:
Interpretar mensagens livres e identificar UMA OU MAIS DESPESAS.

REGRAS:
- Sempre separe despesas individuais
- Nunca pergunte novamente algo já identificado
- Se a despesa estiver completa, registre
- Categorias válidas:
Moradia, Alimentação, Transporte, Saúde, Educação, Lazer, Compras, Assinaturas, Pets, Presentes, Dívidas, Investimentos, Outros

FORMATO DE SAÍDA (JSON PURO):
{
  "despesas": [
    {
      "descricao": "",
      "valor": null,
      "categoria": "",
      "data": ""
    }
  ],
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

    if (!raw) {
      return res.json({ reply: "⚠️ Não consegui interpretar sua mensagem." });
    }

    const parsed = JSON.parse(raw);
    const despesas = parsed.despesas || [];

    if (!despesas.length) {
      return res.json({ reply: parsed.mensagem_usuario || "Não identifiquei despesas." });
    }

    /* ===============================
       SALVAR TODAS (SEPARADAS)
    ================================ */
    for (const d of despesas) {
      const descricao = d.descricao;
      const valor = d.valor;
      const categoria = d.categoria || classifyCategory(descricao);
      const dataISO = normalizeDate(d.data);

      if (!descricao || !valor) continue;

      await supabase.from("despesas").insert({
        user_id,
        description: descricao,
        amount: valor,
        category: categoria,
        expense_date: dataISO,
        data_vencimento: dataISO,
        status: "pendente",
        expense_type: "Variável"
      });
    }

    return res.json({
      reply: `✅ Tudo certo! Registrei ${despesas.length} despesa(s) com sucesso.`
    });

  } catch (err) {
    console.error("🔥 Erro:", err);
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
