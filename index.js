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
   MEMÓRIA RAM
================================ */
const memory = {};
/*
memory[user_id] = {
  pendingExpense: {},
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
  if (t.includes("ontem")) {
    now.setDate(now.getDate() - 1);
    return now.toISOString().split("T")[0];
  }
  if (t.includes("amanhã")) {
    now.setDate(now.getDate() + 1);
    return now.toISOString().split("T")[0];
  }

  return null;
};

/* ===============================
   CATEGORIAS
================================ */
const CATEGORIES = [
  { name: "Moradia", keywords: ["aluguel", "condominio", "iptu", "luz", "agua", "internet"] },
  { name: "Alimentação", keywords: ["lanche", "comida", "restaurante", "padaria", "mercado"] },
  { name: "Transporte", keywords: ["uber", "99", "taxi", "onibus", "metro", "gasolina", "combustivel"] },
  { name: "Compras", keywords: ["mochila", "roupa", "tenis", "bicicleta", "notebook"] },
  { name: "Saúde", keywords: ["farmacia", "medico", "dentista"] },
  { name: "Educação", keywords: ["curso", "faculdade", "livro"] },
  { name: "Lazer", keywords: ["cinema", "show", "bar", "viagem"] },
  { name: "Assinaturas", keywords: ["netflix", "spotify", "assinatura"] },
  { name: "Pets", keywords: ["pet", "racao", "veterinario"] },
  { name: "Presentes", keywords: ["presente", "aniversario"] },
  { name: "Dívidas", keywords: ["emprestimo", "financiamento", "divida", "parcela"] },
  { name: "Investimentos", keywords: ["acao", "fundo", "cripto"] }
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
      return res.json({ reply: "⚠️ Usuário não identificado." });
    }

    if (!memory[user_id]) {
      memory[user_id] = { pendingExpense: {}, awaitingConfirmation: false };
    }

    const state = memory[user_id];
    const pending = state.pendingExpense;
    const msg = message.toLowerCase();

    /* ===============================
       CONFIRMAÇÃO
    ================================ */
    if (
      state.awaitingConfirmation &&
      ["sim", "confirmar", "ok", "pode"].includes(msg)
    ) {
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
        return res.json({ reply: "❌ Erro ao salvar despesa." });
      }

      memory[user_id] = { pendingExpense: {}, awaitingConfirmation: false };

      return res.json({
        reply: "✅ Despesa registrada com sucesso! Deseja registrar outra?"
      });
    }

    /* ===============================
       RELATÓRIO (SÓ SE PEDIR)
    ================================ */
    if (msg.includes("relatório")) {
      let month = null;
      let year = null;

      const months = {
        janeiro: 1, fevereiro: 2, março: 3, abril: 4,
        maio: 5, junho: 6, julho: 7, agosto: 8,
        setembro: 9, outubro: 10, novembro: 11, dezembro: 12
      };

      for (const [name, num] of Object.entries(months)) {
        if (msg.includes(name)) month = num;
      }

      year = new Date().getFullYear();

      if (!month) {
        return res.json({
          reply: "📅 Qual mês você deseja no relatório? (ex: janeiro)"
        });
      }

      const { data, error } = await supabase
        .from("despesas")
        .select("amount, category, expense_date")
        .eq("user_id", user_id)
        .gte("expense_date", `${year}-${String(month).padStart(2, "0")}-01`)
        .lte("expense_date", `${year}-${String(month).padStart(2, "0")}-31`);

      if (error) {
        console.error(error);
        return res.json({ reply: "❌ Erro ao gerar relatório." });
      }

      let total = 0;
      const byCat = {};

      data.forEach(d => {
        total += Number(d.amount);
        byCat[d.category] = (byCat[d.category] || 0) + Number(d.amount);
      });

      let report = `📊 **Relatório de ${Object.keys(months).find(k => months[k] === month)}**\n\n`;
      report += `💰 Total gasto: R$ ${total.toFixed(2)}\n\n`;
      report += `📂 Por categoria:\n`;

      for (const [cat, val] of Object.entries(byCat)) {
        report += `• ${cat}: R$ ${val.toFixed(2)}\n`;
      }

      return res.json({ reply: report });
    }

    /* ===============================
       OPENAI — EXTRAÇÃO
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
Extraia dados de despesas.
Responda APENAS em JSON válido.

Formato:
{
  "descricao": "",
  "valor": 0,
  "data": ""
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
      return res.json({ reply: "⚠️ Não consegui entender a despesa." });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.json({ reply: "⚠️ Erro ao interpretar a despesa." });
    }

    pending.descricao = parsed.descricao;
    pending.valor = parsed.valor;
    pending.data =
      normalizeToISODate(parsed.data) ||
      resolveRelativeDate(parsed.data) ||
      todayISO();
    pending.categoria = classifyCategory(pending.descricao);

    state.awaitingConfirmation = true;

    return res.json({
      reply: `🔮 Posso registrar assim?

Descrição: ${pending.descricao}
Valor: R$ ${pending.valor}
Categoria: ${pending.categoria}
Data: ${pending.data}

Responda **"sim"** para confirmar ou diga o que deseja ajustar.`
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
