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
  pendingExpense: {},
  awaitingConfirmation: false
}
*/

/* ===============================
   DATAS
================================ */
const todayISO = () => new Date().toISOString().split("T")[0];

const normalizeDate = (input) => {
  if (!input) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  const br = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  if (input.toLowerCase().includes("hoje")) return todayISO();

  if (input.toLowerCase().includes("amanhã")) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }

  return null;
};

/* ===============================
   CATEGORIAS
================================ */
const CATEGORIES = [
  { name: "Moradia", keywords: ["aluguel", "condominio", "iptu", "luz", "agua", "internet"] },
  { name: "Alimentação", keywords: ["mercado", "supermercado", "lanche", "comida", "padaria"] },
  { name: "Transporte", keywords: ["uber", "99", "taxi", "onibus", "metro", "gasolina", "combustivel"] },
  { name: "Compras", keywords: ["mochila", "tenis", "roupa", "bicicleta", "notebook", "eletronico"] },
  { name: "Saúde", keywords: ["farmacia", "medico", "dentista", "remedio"] },
  { name: "Educação", keywords: ["curso", "faculdade", "livro"] },
  { name: "Lazer", keywords: ["cinema", "show", "bar", "viagem"] },
  { name: "Assinaturas", keywords: ["netflix", "spotify", "assinatura", "plano"] },
  { name: "Pets", keywords: ["pet", "racao", "veterinario"] },
  { name: "Presentes", keywords: ["presente", "aniversario"] },
  { name: "Dívidas", keywords: ["emprestimo", "financiamento", "divida", "parcela"] },
  { name: "Investimentos", keywords: ["acao", "fundo", "investimento", "cripto"] }
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
  res.send("🔮 Oráculo Financeiro desperto.");
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
      memory[user_id] = { pendingExpense: {}, awaitingConfirmation: false };
    }

    const state = memory[user_id];
    const lower = message.toLowerCase();

    /* ===============================
       CONFIRMAÇÃO
    ================================ */
    if (state.awaitingConfirmation && ["sim", "confirmar", "ok", "pode"].includes(lower)) {
      const p = state.pendingExpense;

      await supabase.from("despesas").insert({
        user_id,
        description: p.descricao,
        amount: p.valor,
        category: p.categoria,
        expense_date: p.data,
        data_vencimento: p.data,
        status: "pendente",
        expense_type: "Variável"
      });

      state.pendingExpense = {};
      state.awaitingConfirmation = false;

      return res.json({ reply: "✅ Despesa registrada com sucesso. Quer registrar outra?" });
    }

    /* ===============================
       RELATÓRIO
    ================================ */
    if (lower.includes("relatorio") || lower.includes("resumo") || lower.includes("gastei")) {
      const { data, error } = await supabase
        .from("despesas")
        .select("amount, category, expense_date")
        .eq("user_id", user_id);

      if (error) return res.json({ reply: "❌ Não consegui gerar o relatório." });

      const total = data.reduce((s, d) => s + Number(d.amount), 0);
      const byCat = {};

      data.forEach(d => {
        byCat[d.category] = (byCat[d.category] || 0) + Number(d.amount);
      });

      let text = `🔮 Relatório Financeiro\n\n💸 Total gasto: R$ ${total.toFixed(2)}\n\n📊 Por categoria:\n`;
      for (const c in byCat) {
        text += `• ${c}: R$ ${byCat[c].toFixed(2)}\n`;
      }

      return res.json({ reply: text });
    }

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
Fala como um mentor humano, claro e inteligente.

Extraia despesas da mensagem.
Nunca invente dados.
`
          },
          { role: "user", content: message }
        ]
      })
    });

    const out = await ai.json();
    const raw = out.output?.[0]?.content?.[0]?.text;
    if (!raw) return res.json({ reply: "⚠️ Não consegui interpretar." });

    const parsed = JSON.parse(raw);
    const d = parsed.dados || {};
    const p = state.pendingExpense;

    if (d.descricao) p.descricao = d.descricao;
    if (d.valor) p.valor = d.valor;
    if (!p.categoria && p.descricao) p.categoria = classifyCategory(p.descricao);
    if (d.data) p.data = normalizeDate(d.data);
    if (!p.data) p.data = todayISO();

    if (!p.descricao || !p.valor) {
      return res.json({ reply: "Pode me dizer a descrição ou o valor?" });
    }

    state.awaitingConfirmation = true;

    return res.json({
      reply: `🔮 Posso registrar assim?

Descrição: ${p.descricao}
Valor: R$ ${p.valor}
Categoria: ${p.categoria}
Data: ${p.data}

Responda "sim" para confirmar.`
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ reply: "⚠️ O Oráculo teve uma visão turva." });
  }
});

/* ===============================
   START
================================ */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo Financeiro ativo na porta " + PORT);
});
