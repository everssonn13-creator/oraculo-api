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
  expenses: [],
  awaitingConfirmation: false
}
*/

/* ===============================
   UTIL — DATAS
================================ */
const todayISO = () => new Date().toISOString().split("T")[0];

const normalizeToISODate = (input) => {
  if (!input) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  const br = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const [, d, m, y] = br;
    return `${y}-${m}-${d}`;
  }

  return null;
};

const resolveRelativeDate = (text = "") => {
  const t = text.toLowerCase();
  const now = new Date();

  if (t.includes("hoje")) return todayISO();

  if (t.includes("amanhã")) {
    now.setDate(now.getDate() + 1);
    return now.toISOString().split("T")[0];
  }

  if (t.includes("ontem")) {
    now.setDate(now.getDate() - 1);
    return now.toISOString().split("T")[0];
  }

  return null;
};

/* ===============================
   LIMPEZA DE DESCRIÇÃO (CORREÇÃO 1)
================================ */
const cleanDescription = (text = "") => {
  return text
    .replace(/\b(ontem|hoje|amanhã)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
};

/* ===============================
   CATEGORIAS (ALINHADAS AO APP)
================================ */
const CATEGORIES = [
  { name: "Moradia", keywords: ["aluguel", "condominio", "iptu", "luz", "agua", "internet"] },
  { name: "Alimentação", keywords: ["lanche", "comida", "mercado", "supermercado", "padaria"] },
  { name: "Transporte", keywords: ["gasolina", "combustivel", "uber", "99", "taxi", "onibus", "metro"] },
  { name: "Compras", keywords: ["mochila", "bicicleta", "tenis", "roupa", "notebook", "eletronico"] },
  { name: "Saúde", keywords: ["farmacia", "medico", "dentista", "remedio"] },
  { name: "Educação", keywords: ["curso", "faculdade", "livro"] },
  { name: "Lazer", keywords: ["cinema", "bar", "show", "viagem"] },
  { name: "Assinaturas", keywords: ["netflix", "spotify", "assinatura", "plano"] },
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
      memory[user_id] = { expenses: [], awaitingConfirmation: false };
    }

    /* ===============================
       CONFIRMAÇÃO (“sim”) — SEM LOOP
    ================================ */
    if (
      memory[user_id].awaitingConfirmation &&
      ["sim", "ok", "confirmar", "pode"].includes(message.toLowerCase())
    ) {
      for (const e of memory[user_id].expenses) {
        await supabase.from("despesas").insert({
          user_id,
          description: e.descricao,
          amount: e.valor,
          category: e.categoria,
          expense_date: e.data,
          data_vencimento: e.data,
          status: "pendente",
          expense_type: "Variável"
        });
      }

      memory[user_id] = { expenses: [], awaitingConfirmation: false };

      return res.json({
        reply: "✅ Despesas registradas com sucesso. Deseja adicionar outra?"
      });
    }

    /* ===============================
       PROCESSAMENTO MANUAL (SEM IA)
       CORREÇÃO 2: separa por vírgula E “ e ”
    ================================ */
    const parts = message
      .replace(/ e /gi, ",")
      .split(",");

    const detectedDate =
      normalizeToISODate(message) ||
      resolveRelativeDate(message) ||
      todayISO();

    const expenses = [];

    for (const part of parts) {
      const valueMatch = part.match(/(\d+[.,]?\d*)/);
      if (!valueMatch) continue;

      const valor = Number(valueMatch[1].replace(",", "."));
      const descricao = cleanDescription(
        part.replace(valueMatch[1], "")
      );

      const categoria = classifyCategory(descricao);

      expenses.push({
        descricao,
        valor,
        categoria,
        data: detectedDate
      });
    }

    if (!expenses.length) {
      return res.json({ reply: "⚠️ Não consegui identificar despesas válidas." });
    }

    memory[user_id].expenses = expenses;
    memory[user_id].awaitingConfirmation = true;

    /* ===============================
       RESPOSTA HUMANA DO ORÁCULO
    ================================ */
    const resumo = expenses
      .map(
        (e, i) =>
          `${i + 1}) ${e.descricao} — R$${e.valor} — ${e.categoria}`
      )
      .join("\n");

    return res.json({
      reply: `🔮 Identifiquei as seguintes despesas em ${detectedDate}:\n\n${resumo}\n\nPosso registrar todas assim? Responda **"sim"** ou diga o que deseja ajustar.`
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
