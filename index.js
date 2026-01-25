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
   MEMÓRIA CURTA
================================ */
const memory = {};
/*
memory[user_id] = {
  expenses: [],
  awaitingConfirmation: false
}
*/

/* ===============================
   DATAS
================================ */
const todayISO = () => new Date().toISOString().split("T")[0];

const parseExplicitDate = (text) => {
  const t = text.toLowerCase();

  if (t.includes("ontem")) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }

  if (t.includes("hoje")) {
    return todayISO();
  }

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
   CATEGORIAS (DICIONÁRIO FINAL)
================================ */
const CATEGORY_MAP = {
  Alimentação: [
    "lanche","pastel","marmita","comida","refeição","almoço","janta",
    "restaurante","lanchonete","ifood","delivery","mercado","padaria"
  ],
  Transporte: [
    "gasolina","abastecer","abasteci","combustível","etanol","diesel",
    "uber","99","taxi","ônibus","metro","passagem","estacionamento",
    "carro","moto"
  ],
  Moradia: [
    "aluguel","condomínio","luz","energia","água","gás",
    "internet","iptu"
  ],
  Saúde: [
    "dentista","consulta","médico","medica","farmácia","remédio",
    "hospital","exame","terapia","psicólogo"
  ],
  Educação: [
    "curso","faculdade","universidade","escola","livro","mensalidade"
  ],
  Assinaturas: [
    "assinatura","chatgpt","chatgpt pro","openai","netflix",
    "spotify","hostinger","prime","icloud","google drive"
  ],
  Lazer: [
    "cinema","show","viagem","bar","balada","jogo"
  ],
  Compras: [
    "roupa","tenis","tênis","celular","notebook","amazon","shopee"
  ],
  Dívidas: [
    "empréstimo","emprestimo","parcela","fatura","cartão","boleto"
  ],
  Investimentos: [
    "investimento","aplicação","poupança","tesouro","cdb","ações"
  ],
  Pets: [
    "pet","cachorro","gato","ração","veterinário","petshop"
  ],
  Presentes: [
    "presente","aniversário","natal","flores"
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
   UTILIDADES NLP
================================ */
const normalizeText = (text) =>
  text
    .toLowerCase()
    .replace(/[,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isOnlyNumber = (text) =>
  /^\d+([.,]\d+)?$/.test(text.trim());

const isAbortText = (text) =>
  ["sei lá","qualquer coisa","umas coisas"].some(k =>
    text.toLowerCase().includes(k)
  );

/* ===============================
   EXTRAÇÃO ROBUSTA (CORE)
================================ */
const extractExpenses = (originalText) => {
  const text = normalizeText(originalText);

  // Divide por contexto semântico
  const blocks = text
    .replace(/\s+e\s+/g, "|")
    .split("|")
    .map(b => b.trim())
    .filter(Boolean);

  const expenses = [];

  for (const block of blocks) {
    const date = parseExplicitDate(block);
    const cleanBlock = block
      .replace(/ontem|hoje|amanhã/gi, "")
      .replace(/dia\s+\d{1,2}\s+de\s+\w+/gi, "")
      .trim();

    const tokens = cleanBlock.split(" ");
    let value = null;
    let descTokens = [];

    for (let i = 0; i < tokens.length; i++) {
      if (/^\d+([.,]\d+)?$/.test(tokens[i])) {
        value = Number(tokens[i].replace(",", "."));
        break;
      }
      descTokens.push(tokens[i]);
    }

    const description = descTokens.join(" ").trim();

    if (!description) continue;

    expenses.push({
      description,
      amount: value ?? null,
      date: date ?? todayISO()
    });
  }

  return expenses;
};

/* ===============================
   CONFIRMAÇÃO
================================ */
const isConfirmation = (msg) =>
  ["sim","ok","confirmar","pode"].includes(msg.trim().toLowerCase());

/* ===============================
   ROTA PRINCIPAL
================================ */
app.post("/oraculo", async (req, res) => {
  try {
    const { message, user_id } = req.body;

    if (!message || !user_id) {
      return res.json({ reply: "⚠️ Usuário não identificado." });
    }

    if (isAbortText(message)) {
      return res.json({
        reply: "🤔 Não consegui entender. Pode explicar melhor?"
      });
    }

    if (!memory[user_id]) {
      memory[user_id] = { expenses: [], awaitingConfirmation: false };
    }

    if (memory[user_id].awaitingConfirmation) {
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

        memory[user_id] = { expenses: [], awaitingConfirmation: false };
        return res.json({ reply: "✅ Despesas registradas com sucesso." });
      }

      return res.json({
        reply: "❌ Ok, não salvei. O que você quer corrigir?"
      });
    }

    if (isOnlyNumber(message)) {
      return res.json({
        reply: "❓ Esse valor é referente a qual despesa?"
      });
    }

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

    memory[user_id].awaitingConfirmation = true;

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
