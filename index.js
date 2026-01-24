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
   CORS (CORRETO E DEFINITIVO)
================================ */
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://oraculofinanceiro.com");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

/* ===============================
   MEMÓRIA EM RAM (por usuário)
================================ */
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
const memory = {};

/* ===============================
   UTIL – DATAS (SEM date-fns)
================================ */
const today = () => {
  const d = new Date();
  return d.toISOString().split("T")[0];
};

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
};

const parseDateFromText = (text) => {
  const lower = text.toLowerCase();

  if (lower.includes("hoje")) return today();
  if (lower.includes("amanhã")) return tomorrow();

  // dd/mm/yyyy
  const match = lower.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    const [_, d, m, y] = match;
    return `${y}-${m}-${d}`;
  }

  // "dia 5 do próximo mês"
  const nextMonthMatch = lower.match(/dia\s+(\d{1,2})\s+do\s+pr[oó]ximo\s+m[eê]s/);
  if (nextMonthMatch) {
    const day = Number(nextMonthMatch[1]);
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(day);
    return d.toISOString().split("T")[0];
  }

  return null;
};

/* ===============================
   CATEGORIAS (ESPELHO DO APP)
================================ */
const CATEGORIES = [
  "Moradia",
  "Alimentação",
  "Transporte",
  "Saúde",
  "Educação",
  "Lazer",
  "Compras",
  "Assinaturas",
  "Pets",
  "Presentes",
  "Dívidas",
  "Investimentos",
  "Outros"
];

const autoCategoryFromText = (text) => {
  const t = text.toLowerCase();

  if (t.match(/aluguel|condom|iptu|luz|água|internet|g[aá]s/)) return "Moradia";
  if (t.match(/mercado|supermercado|lanche|comida|padaria|feira/)) return "Alimentação";
  if (t.match(/uber|99|gasolina|combust[ií]vel|metr[oô]|ônibus/)) return "Transporte";
  if (t.match(/farm[aá]cia|m[eé]dico|dentista|exame|rem[eé]dio/)) return "Saúde";
  if (t.match(/curso|faculdade|livro|educa[cç][aã]o/)) return "Educação";
  if (t.match(/cinema|bar|restaurante|viagem|show/)) return "Lazer";
  if (t.match(/tenis|roupa|sapato|notebook|celular|bicicleta/)) return "Compras";
  if (t.match(/netflix|spotify|assinatura|plano/)) return "Assinaturas";
  if (t.match(/ra[cç][aã]o|pet|veterin[aá]rio/)) return "Pets";
  if (t.match(/presente|anivers[aá]rio|natal/)) return "Presentes";
  if (t.match(/empr[eé]stimo|financiamento|d[ií]vida|parcela/)) return "Dívidas";
  if (t.match(/a[cç][aã]o|fundo|cripto|invest/)) return "Investimentos";

  return null;
};

/* ===============================
   HEALTH
================================ */
app.get("/", (_, res) => {
  res.send("🔮 Oráculo Financeiro desperto e observando.");
});

/* ===============================
   ROTA PRINCIPAL
================================ */
app.post("/oraculo", async (req, res) => {
  try {
    const { message, user_id } = req.body;
    if (!message || !user_id) {
      return res.json({ reply: "Preciso saber quem está falando comigo." });
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
Você é o ORÁCULO FINANCEIRO 🔮.

PERSONALIDADE:
- Fala como um mentor sábio, humano e acessível
- Tom amigável, empático e inteligente
- Ajuda o usuário a organizar a vida financeira sem julgar

OBJETIVO:
- Conversar naturalmente
- Identificar despesas
- Coletar: descrição, valor, categoria e data
- Nunca inventar dados
- Perguntar apenas o que estiver faltando

CATEGORIAS VÁLIDAS:
${CATEGORIES.join(", ")}

DATAS:
- "hoje" = data atual
- "amanhã" = amanhã
- datas no formato DD/MM/AAAA
- "dia X do próximo mês"

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

    const aiData = await ai.json();
    let raw = null;

    for (const o of aiData.output || []) {
      for (const c of o.content || []) {
        if (c.type === "output_text") raw = c.text;
      }
    }

    if (!raw) {
      return res.json({ reply: "Não consegui interpretar isso agora." });
    }

    const action = JSON.parse(raw);
    const d = action.dados || {};

    /* ===============================
       MEMÓRIA
    ================================ */
    if (d.descricao) pending.descricao = d.descricao;
    if (d.valor) pending.valor = d.valor;
    if (d.categoria) pending.categoria = d.categoria;

    if (!pending.categoria && pending.descricao) {
      pending.categoria = autoCategoryFromText(pending.descricao);
    }

    if (d.data) pending.data = d.data;
    if (!pending.data) {
      const parsed = parseDateFromText(message);
      if (parsed) pending.data = parsed;
    }
    if (!pending.data) pending.data = today();

    /* ===============================
       VALIDAÇÃO
    ================================ */
    const missing = [];
    if (!pending.descricao) missing.push("descrição");
    if (!pending.valor) missing.push("valor");
    if (!pending.categoria) missing.push("categoria");

    if (missing.length) {
      return res.json({
        reply:
          action.mensagem_usuario ||
          `Só preciso confirmar: ${missing.join(", ")}.`
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
      status: "pendente",
      expense_type: "Variável"
    });

    if (error) {
      console.error(error);
      return res.json({ reply: "Tive um problema ao salvar isso." });
    }

    memory[user_id].pendingExpense = {};

    return res.json({
      reply: "Despesa registrada com sucesso. Quer continuar?"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      reply: "O Oráculo teve uma turbulência momentânea."
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
