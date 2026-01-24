import express from "express";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import {
  parse,
  parseISO,
  isValid,
  subDays,
  subWeeks,
  subMonths,
  previousFriday
} from "date-fns";
import { ptBR } from "date-fns/locale";

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

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  next();
});

app.options("*", (_, res) => res.sendStatus(200));

/* ===============================
   MEMÓRIA CURTA (POR USUÁRIO)
================================ */
const memory = {};

/* ===============================
   UTIL — DATA
================================ */
const today = () => new Date();

function resolveDate(input) {
  if (!input) return today();

  const text = input.toLowerCase();
  const base = today();

  // Palavras simples
  if (text.includes("hoje")) return base;
  if (text.includes("ontem")) return subDays(base, 1);
  if (text.includes("anteontem")) return subDays(base, 2);

  // Semana passada
  if (text.includes("semana passada")) {
    return subWeeks(base, 1);
  }

  // Mês passado
  if (text.includes("mês passado")) {
    return subMonths(base, 1);
  }

  // Sexta passada
  if (text.includes("sexta passada")) {
    return previousFriday(base);
  }

  // Datas explícitas dd/MM/yyyy
  const parsedNumeric = parse(input, "dd/MM/yyyy", new Date(), { locale: ptBR });
  if (isValid(parsedNumeric)) return parsedNumeric;

  // Datas por extenso
  const parsedTextual = parse(
    input,
    "d 'de' MMMM 'de' yyyy",
    new Date(),
    { locale: ptBR }
  );
  if (isValid(parsedTextual)) return parsedTextual;

  // ISO direto
  const parsedISO = parseISO(input);
  if (isValid(parsedISO)) return parsedISO;

  return base;
}

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
      return res.json({ reply: "⚠️ Não consegui identificar o usuário." });
    }

    if (!memory[user_id]) {
      memory[user_id] = { pendingExpense: {} };
    }

    const pending = memory[user_id].pendingExpense;

    /* ===============================
       OPENAI
    ================================ */
    const response = await fetch("https://api.openai.com/v1/responses", {
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
Você é o Oráculo Financeiro 🔮.

OBJETIVO:
Extrair dados de despesas a partir de mensagens livres.

REGRAS:
- Nunca invente valores
- Nunca invente datas
- Se a data for relativa (ex: "sexta passada"), apenas IDENTIFIQUE
- NÃO calcule datas
- NÃO assuma categoria se não tiver certeza

FORMATO DE SAÍDA (JSON PURO):
{
  "acao": "RESPONDER | COLETAR_DADO | REGISTRAR_DESPESA",
  "dados": {
    "descricao": "",
    "valor": null,
    "categoria": "",
    "expressao_data": ""
  },
  "mensagem_usuario": ""
}
`
          },
          { role: "user", content: message }
        ]
      })
    });

    const aiData = await response.json();

    let raw = null;
    for (const o of aiData.output || []) {
      for (const c of o.content || []) {
        if (c.type === "output_text") raw = c.text;
      }
    }

    if (!raw) {
      return res.json({ reply: "⚠️ Não consegui entender sua mensagem." });
    }

    const action = JSON.parse(raw);
    const d = action.dados || {};

    if (d.descricao) pending.descricao = d.descricao;
    if (d.valor) pending.valor = d.valor;
    if (d.categoria) pending.categoria = d.categoria;
    if (d.expressao_data) pending.expressao_data = d.expressao_data;

    /* ===============================
       VERIFICA O QUE FALTA
    ================================ */
    const missing = [];
    if (!pending.descricao) missing.push("descrição");
    if (!pending.valor) missing.push("valor");
    if (!pending.categoria) missing.push("categoria");

    if (missing.length > 0) {
      return res.json({
        reply:
          action.mensagem_usuario ||
          `Preciso confirmar: ${missing.join(", ")}.`
      });
    }

    /* ===============================
       RESOLVE DATA
    ================================ */
    const finalDate = resolveDate(pending.expressao_data);

    /* ===============================
       REGISTRA DESPESA
    ================================ */
    const { error } = await supabase.from("despesas").insert({
      user_id,
      description: pending.descricao,
      amount: pending.valor,
      category: pending.categoria,
      expense_date: finalDate.toISOString(),
      data_vencimento: finalDate.toISOString(),
      expense_type: "Variável",
      status: "pendente"
    });

    if (error) {
      console.error(error);
      return res.json({ reply: "❌ Erro ao salvar despesa." });
    }

    memory[user_id].pendingExpense = {};

    return res.json({
      reply: "✅ Despesa registrada com sucesso! Quer adicionar outra?"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      reply: "⚠️ O Oráculo encontrou uma dissonância temporária."
    });
  }
});

/* ===============================
   START
================================ */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo ativo na porta " + PORT);
});
