import express from "express";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
   MEMÓRIA CURTA
================================ */
const memory = {};

/* ===============================
   UTIL
================================ */
const todayISO = () => new Date().toISOString().split("T")[0];

const monthMap = {
  janeiro: 1,
  fevereiro: 2,
  março: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12
};

const detectMonth = (text) => {
  const lower = text.toLowerCase();
  for (const [name, num] of Object.entries(monthMap)) {
    if (lower.includes(name)) return num;
  }
  return null;
};

const hasValue = (text) => /\d+([.,]\d+)?/.test(text);
const wantsReport = (text) => text.toLowerCase().includes("relatório");

/* ===============================
   CATEGORIAS
================================ */
const CATEGORIES = [
  { name: "Moradia", keywords: ["aluguel", "condominio", "iptu", "luz", "agua", "internet"] },
  { name: "Alimentação", keywords: ["lanche", "comida", "mercado", "restaurante"] },
  { name: "Transporte", keywords: ["uber", "99", "gasolina", "ônibus", "metro"] },
  { name: "Compras", keywords: ["mochila", "roupa", "tenis", "bicicleta"] },
  { name: "Assinaturas", keywords: ["netflix", "spotify", "assinatura"] },
  { name: "Dívidas", keywords: ["emprestimo", "financiamento"] }
];

const classifyCategory = (text) => {
  const t = text.toLowerCase();
  for (const c of CATEGORIES) {
    if (c.keywords.some(k => t.includes(k))) return c.name;
  }
  return "Outros";
};

/* ===============================
   ROTA PRINCIPAL
================================ */
app.post("/oraculo", async (req, res) => {
  const { message, user_id } = req.body;
  if (!message || !user_id) {
    return res.json({ reply: "⚠️ Não consegui identificar seu usuário." });
  }

  /* ===============================
     1️⃣ REGISTRO TEM PRIORIDADE ABSOLUTA
  ================================ */
  if (hasValue(message)) {
    const ai = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [{
          role: "system",
          content: `
Extraia uma despesa.
Responda APENAS JSON:

{
  "descricao": "",
  "valor": 0,
  "data": "hoje|YYYY-MM-DD"
}
`
        }, { role: "user", content: message }]
      })
    });

    const data = await ai.json();
    const raw = data.output?.[0]?.content?.[0]?.text;
    if (!raw) return res.json({ reply: "⚠️ Não consegui entender a despesa." });

    const d = JSON.parse(raw);

    const categoria = classifyCategory(d.descricao);
    const dataFinal = d.data === "hoje" ? todayISO() : d.data;

    const { error } = await supabase.from("despesas").insert({
      user_id,
      description: d.descricao,
      amount: d.valor,
      category: categoria,
      expense_date: dataFinal,
      data_vencimento: dataFinal,
      status: "pendente",
      expense_type: "Variável"
    });

    if (error) {
      console.error(error);
      return res.json({ reply: "❌ Erro ao salvar despesa." });
    }

    return res.json({
      reply: `✅ Despesa registrada: ${d.descricao} — R$ ${d.valor} (${categoria})`
    });
  }

  /* ===============================
     2️⃣ RELATÓRIO (SÓ SE PEDIR)
  ================================ */
  if (wantsReport(message)) {
    const month = detectMonth(message);
    if (!month) {
      return res.json({
        reply: "📅 Qual mês deseja o relatório? (ex: janeiro, fevereiro)"
      });
    }

    const year = new Date().getFullYear();

    const { data, error } = await supabase
      .from("despesas")
      .select("amount, category")
      .eq("user_id", user_id)
      .gte("expense_date", `${year}-${String(month).padStart(2,"0")}-01`)
      .lte("expense_date", `${year}-${String(month).padStart(2,"0")}-31`);

    if (error) {
      console.error(error);
      return res.json({ reply: "❌ Erro ao gerar relatório." });
    }

    const total = data.reduce((s, d) => s + Number(d.amount), 0);
    const byCat = {};
    data.forEach(d => {
      byCat[d.category] = (byCat[d.category] || 0) + Number(d.amount);
    });

    let text = `📊 Relatório de ${Object.keys(monthMap).find(k => monthMap[k] === month)}\n\n`;
    text += `💰 Total gasto: R$ ${total.toFixed(2)}\n\n📂 Por categoria:\n`;
    for (const c in byCat) {
      text += `• ${c}: R$ ${byCat[c].toFixed(2)}\n`;
    }

    return res.json({ reply: text });
  }

  /* ===============================
     3️⃣ CONVERSA
  ================================ */
  return res.json({
    reply: "🔮 Posso registrar despesas ou gerar relatórios mensais. O que deseja?"
  });
});

/* ===============================
   START
================================ */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo Financeiro ativo na porta " + PORT);
});
