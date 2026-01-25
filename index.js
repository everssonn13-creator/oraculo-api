import express from "express";
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
   MEMÓRIA (ESTADO REAL)
================================ */
const memory = {};
/*
memory[user_id] = {
  state: "idle" | "preview",
  expenses: []
}
*/

/* ===============================
   DATAS
================================ */
const todayISO = () => new Date().toISOString().split("T")[0];

const parseDateFromText = (text) => {
  const t = text.toLowerCase();

  if (t.includes("ontem")) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }

  if (t.includes("hoje")) return todayISO();

  if (t.includes("amanhã")) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }

  const match = t.match(
    /dia\s+(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/
  );

  if (match) {
    const months = {
      janeiro: 0, fevereiro: 1, março: 2, abril: 3,
      maio: 4, junho: 5, julho: 6, agosto: 7,
      setembro: 8, outubro: 9, novembro: 10, dezembro: 11
    };
    const d = new Date();
    d.setMonth(months[match[2]]);
    d.setDate(Number(match[1]));
    return d.toISOString().split("T")[0];
  }

  return null;
};

/* ===============================
   CATEGORIAS (EXPANDIDAS)
================================ */
const CATEGORY_MAP = {
  Alimentação: [
    "lanche","pastel","marmita","comida","refeição",
    "almoço","janta","comi fora","comer fora",
    "restaurante","lanchonete","ifood","mercado"
  ],
  Transporte: [
    "gasolina","abastecer","abasteci","combustível",
    "uber","99","taxi","ônibus","carro","moto"
  ],
  Moradia: [
    "aluguel","condomínio","luz","água","energia",
    "internet","iptu"
  ],
  Saúde: [
    "dentista","consulta","médico","medica",
    "farmácia","remédio","hospital"
  ],
  Assinaturas: [
    "assinatura","chatgpt","chatgpt pro",
    "netflix","spotify","hostinger","prime"
  ]
};

const classifyCategory = (text) => {
  const t = text.toLowerCase();
  let best = { cat: "Outros", score: 0 };

  for (const [cat, words] of Object.entries(CATEGORY_MAP)) {
    let score = 0;
    for (const w of words) {
      if (t.includes(w)) score++;
    }
    if (score > best.score) best = { cat, score };
  }

  return best.cat;
};

/* ===============================
   SEGMENTAÇÃO TEMPORAL (CORE)
================================ */
const segmentByTime = (text) => {
  const normalized = text
    .replace(/,/g, " | ")
    .replace(/\s+e\s+/gi, " | ");

  const rawParts = normalized.split("|").map(p => p.trim()).filter(Boolean);

  const segments = [];
  let currentDate = null;

  for (const part of rawParts) {
    const date = parseDateFromText(part);
    if (date) currentDate = date;

    segments.push({
      text: part
        .replace(/ontem|hoje|amanhã/gi, "")
        .replace(/dia\s+\d{1,2}\s+de\s+\w+/gi, "")
        .trim(),
      date: date ?? currentDate ?? todayISO()
    });
  }

  return segments;
};

/* ===============================
   EXTRAÇÃO DE DESPESAS
================================ */
const extractExpenses = (text) => {
  const segments = segmentByTime(text);
  const expenses = [];

  for (const seg of segments) {
    const tokens = seg.text.split(" ");
    let value = null;
    let desc = [];

    for (const tok of tokens) {
      if (/^\d+([.,]\d+)?$/.test(tok)) {
        value = Number(tok.replace(",", "."));
        break;
      }
      desc.push(tok);
    }

    const description = desc.join(" ").trim();
    if (!description) continue;

    expenses.push({
      description,
      amount: value ?? null,
      date: seg.date
    });
  }

  return expenses;
};

/* ===============================
   HELPERS
================================ */
const isConfirmation = (msg) =>
  ["sim","ok","confirmar","pode"].includes(msg.trim().toLowerCase());

const isAbortText = (msg) =>
  ["sei lá","qualquer coisa","umas coisas"].some(k =>
    msg.toLowerCase().includes(k)
  );

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
      memory[user_id] = { state: "idle", expenses: [] };
    }

    // Texto confuso → aborta
    if (isAbortText(message)) {
      memory[user_id] = { state: "idle", expenses: [] };
      return res.json({ reply: "🤔 Não consegui entender. Pode explicar melhor?" });
    }

    // CONFIRMAÇÃO
    if (memory[user_id].state === "preview") {
      if (isConfirmation(message)) {
        for (const e of memory[user_id].expenses) {
          await supabase.from("despesas").insert({
            user_id,
            description: e.description,
            amount: e.amount,
            category: e.category,
            expense_date: e.date,
            data_vencimento: e.date,
            status: "pendente",
            expense_type: "Variável",
            is_recurring: false
          });
        }

        memory[user_id] = { state: "idle", expenses: [] };
        return res.json({ reply: "✅ Despesas registradas com sucesso." });
      }

      // Qualquer outra coisa cancela preview
      memory[user_id] = { state: "idle", expenses: [] };
    }

    // NOVA FRASE → sempre reseta estado
    memory[user_id] = { state: "idle", expenses: [] };

    const extracted = extractExpenses(message);

    if (!extracted.length) {
      return res.json({
        reply: "🤔 Não consegui identificar despesas. Pode reformular?"
      });
    }

    memory[user_id].expenses = extracted.map(e => ({
      description: e.description,
      amount: e.amount,
      category: classifyCategory(e.description),
      date: e.date
    }));

    memory[user_id].state = "preview";

    let preview = "🧾 Posso registrar assim?\n\n";
    memory[user_id].expenses.forEach((e, i) => {
      preview += `${i + 1}) ${e.description} — ${
        e.amount === null ? "Valor não informado" : `R$ ${e.amount}`
      } — ${e.category}\n`;
    });

    preview += `\nResponda "sim" para confirmar.`;

    return res.json({ reply: preview });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      reply: "⚠️ O Oráculo teve uma visão turva."
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

