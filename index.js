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
memory[userId] = {
  pendingExpenses: [],
  awaitingConfirmation: false
}
*/

/* ===============================
   DATAS
================================ */
const todayISO = () => new Date().toISOString().split("T")[0];

const normalizeDate = (text) => {
  if (!text) return null;

  if (text.includes("hoje")) return todayISO();

  if (text.includes("ontem")) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }

  if (text.includes("amanhã")) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }

  const br = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];

  return null;
};

/* ===============================
   CATEGORIAS (DEFINITIVAS)
================================ */
const CATEGORIES = [
  { name: "Moradia", keywords: ["aluguel", "condominio", "iptu", "luz", "agua", "internet", "gas"] },
  { name: "Alimentação", keywords: ["lanche", "comida", "restaurante", "padaria", "mercado"] },
  { name: "Transporte", keywords: ["gasolina", "combustivel", "uber", "99", "onibus", "metro"] },
  { name: "Compras", keywords: ["mochila", "bicicleta", "roupa", "tenis", "notebook", "eletronico"] },
  { name: "Saúde", keywords: ["farmacia", "medico", "dentista", "remedio"] },
  { name: "Educação", keywords: ["curso", "faculdade", "livro"] },
  { name: "Lazer", keywords: ["cinema", "show", "viagem", "bar"] },
  { name: "Assinaturas", keywords: ["netflix", "spotify", "assinatura"] },
  { name: "Pets", keywords: ["pet", "racao", "veterinario"] },
  { name: "Presentes", keywords: ["presente", "aniversario"] },
  { name: "Dívidas", keywords: ["emprestimo", "financiamento", "parcela"] },
  { name: "Investimentos", keywords: ["acao", "fundo", "cripto"] }
];

const classifyCategory = (desc) => {
  const t = desc.toLowerCase();
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
  const { message, user_id } = req.body;
  if (!message || !user_id) {
    return res.json({ reply: "⚠️ Usuário não identificado." });
  }

  if (!memory[user_id]) {
    memory[user_id] = { pendingExpenses: [], awaitingConfirmation: false };
  }

  const state = memory[user_id];

  /* ===============================
     CONFIRMAÇÃO
  ================================ */
  if (state.awaitingConfirmation && ["sim", "ok", "confirmar"].includes(message.toLowerCase())) {
    await supabase.from("despesas").insert(
      state.pendingExpenses.map(e => ({
        user_id,
        description: e.descricao,
        amount: e.valor,
        category: e.categoria,
        expense_date: e.data,
        data_vencimento: e.data,
        status: "pendente",
        expense_type: "Variável"
      }))
    );

    memory[user_id] = { pendingExpenses: [], awaitingConfirmation: false };

    return res.json({
      reply: "✅ Todas as despesas foram registradas com sucesso. Deseja registrar outra?"
    });
  }

  /* ===============================
     PROCESSAR MULTI-DESPESAS
  ================================ */
  const date = normalizeDate(message) || todayISO();

  const parts = message.split(",");
  const expenses = [];

  for (const part of parts) {
    const valueMatch = part.match(/(\d+)/);
    if (!valueMatch) continue;

    const valor = Number(valueMatch[1]);
    const descricao = part.replace(valueMatch[1], "").trim();
    const categoria = classifyCategory(descricao);

    expenses.push({
      descricao,
      valor,
      categoria,
      data: date
    });
  }

  if (!expenses.length) {
    return res.json({ reply: "🔮 Não consegui identificar despesas nessa mensagem." });
  }

  state.pendingExpenses = expenses;
  state.awaitingConfirmation = true;

  const resumo = expenses
    .map(
      (e, i) =>
        `${i + 1}) ${e.descricao} — R$${e.valor} — ${e.categoria}`
    )
    .join("\n");

  return res.json({
    reply: `🔮 Identifiquei as seguintes despesas em ${date}:\n\n${resumo}\n\nPosso registrar todas assim? Responda **"sim"** ou diga o que deseja ajustar.`
  });
});

/* ===============================
   START
================================ */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo Financeiro ativo na porta " + PORT);
});
