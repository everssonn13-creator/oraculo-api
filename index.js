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
   MEMÓRIA CURTA
================================ */
const memory = {};
/*
memory[user_id] = {
  expenses: [],
  awaitingConfirmation: false,
  pendingQuestion: null
}
*/

/* ===============================
   DATAS
================================ */
const todayISO = () => new Date().toISOString().split("T")[0];

const resolveDate = (text) => {
  const t = text.toLowerCase();
  const now = new Date();

  if (t.includes("amanhã")) {
    now.setDate(now.getDate() + 1);
    return now.toISOString().split("T")[0];
  }

  if (t.includes("hoje")) return todayISO();

  if (t.includes("ontem")) {
    now.setDate(now.getDate() - 1);
    return now.toISOString().split("T")[0];
  }

  const br = t.match(/dia\s(\d{1,2})\sde\s(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i);
  if (br) {
    const months = {
      janeiro: 0, fevereiro: 1, março: 2, abril: 3, maio: 4, junho: 5,
      julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11
    };
    const d = new Date();
    d.setMonth(months[br[2]]);
    d.setDate(Number(br[1]));
    return d.toISOString().split("T")[0];
  }

  return todayISO();
};

/* ===============================
   CATEGORIAS (DICIONÁRIO RICO)
================================ */
const CATEGORY_MAP = {
  Alimentação: [
    "lanche","pastel","marmita","comida","refeição","almoço","janta","jantar",
    "café","padaria","restaurante","lanchonete","pizzaria","hamburguer",
    "pizza","ifood","delivery","mercado","supermercado","bebida","cerveja"
  ],
  Transporte: [
    "gasolina","abastecer","abasteci","combustível","etanol","diesel",
    "posto","uber","99","taxi","ônibus","metro","passagem",
    "estacionamento","pedágio","ipva","seguro","lavagem","lava jato"
  ],
  Moradia: [
    "aluguel","condomínio","luz","energia","água","gás",
    "internet","wi-fi","iptu","reforma","manutenção"
  ],
  Saúde: [
    "dentista","consulta","médico","medica","hospital","exame",
    "farmácia","remédio","medicamento","plano de saúde",
    "psicólogo","terapia","fisioterapia","odontologia"
  ],
  Educação: [
    "curso","faculdade","universidade","mensalidade","escola",
    "livro","material","udemy","alura","certificação"
  ],
  Lazer: [
    "cinema","filme","show","evento","viagem","passeio",
    "bar","balada","jogo","games","netflix","spotify"
  ],
  Compras: [
    "roupa","camisa","calça","tênis","sapato","celular",
    "notebook","computador","fone","amazon","shopee"
  ],
  Assinaturas: [
    "assinatura","mensalidade","chatgpt","chatgpt pro","openai",
    "hostinger","spotify","netflix","prime","icloud",
    "google drive","adobe","canva"
  ],
  Dívidas: [
    "empréstimo","emprestimo","financiamento","parcela",
    "fatura","cartão","juros","boleto","acordo"
  ],
  Investimentos: [
    "investimento","aplicação","poupança","tesouro",
    "cdb","ações","bolsa","bitcoin","cripto"
  ],
  Pets: [
    "pet","cachorro","gato","ração","veterinário",
    "vacina","banho","tosa","petshop"
  ],
  Presentes: [
    "presente","lembrança","aniversário","natal",
    "flores","chocolate"
  ]
};

const classifyCategory = (text) => {
  const t = text.toLowerCase();
  let best = { name: "Outros", score: 0 };

  for (const [cat, words] of Object.entries(CATEGORY_MAP)) {
    let score = 0;
    for (const w of words) {
      if (t.includes(w)) score++;
    }
    if (score > best.score) best = { name: cat, score };
  }

  return best.name;
};

/* ===============================
   EXTRAÇÃO MÚLTIPLA
================================ */
const cleanDescription = (text) =>
  text
    .toLowerCase()
    .replace(/comprei|gastei|paguei|abasteci|tenho que pagar|valor|por|de|com|um|uma|dois|duas/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const extractExpenses = (text) => {
  const normalized = text
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/ e /g, " | ")
    .replace(/ também /g, " | ");

  const parts = normalized.split("|");
  const expenses = [];

  for (const p of parts) {
    const match = p.match(/(.+?)\s+(\d+[.,]?\d*)/);
    if (!match) {
      const desc = cleanDescription(p);
      if (desc) {
        expenses.push({ descricao: desc, valor: null });
      }
      continue;
    }

    expenses.push({
      descricao: cleanDescription(match[1]),
      valor: Number(match[2].replace(",", "."))
    });
  }

  return expenses.filter(e => e.descricao);
};

/* ===============================
   CONFIRMAÇÃO
================================ */
const isConfirmation = (msg) =>
  ["sim","confirmar","ok","pode","isso"].includes(msg.trim().toLowerCase());

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
      memory[user_id] = { expenses: [], awaitingConfirmation: false };
    }

    /* CONFIRMAÇÃO */
    if (memory[user_id].awaitingConfirmation && isConfirmation(message)) {
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

    /* EXTRAÇÃO */
    const extracted = extractExpenses(message);
    if (!extracted.length) {
      return res.json({ reply: "⚠️ Não consegui identificar despesas." });
    }

    const date = resolveDate(message);

    memory[user_id].expenses = extracted.map(e => ({
      description: e.descricao,
      amount: e.valor ?? null,
      category: classifyCategory(e.descricao),
      date
    }));

    memory[user_id].awaitingConfirmation = true;

    let preview = "🧾 Posso registrar assim?\n\n";
    memory[user_id].expenses.forEach((e, i) => {
      preview += `${i + 1}) ${e.description} — ${
        e.amount === null ? "Valor não informado" : `R$ ${e.amount}`
      } — ${e.category}\n`;
    });

    preview += `\n📅 Data: ${date}\n\nResponda "sim" para confirmar.`;

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
