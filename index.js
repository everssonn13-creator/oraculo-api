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

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  next();
});

app.options("*", (_, res) => res.sendStatus(200));

/* ===============================
   MEMÓRIA CURTA
================================ */
const memory = {};

/* ===============================
   HEALTH
================================ */
app.get("/", (_, res) => {
  res.send("🔮 Oráculo Financeiro ativo.");
});

/* ===============================
   UTIL
================================ */
const todayISO = () => new Date().toISOString().split("T")[0];

/* ===============================
   ROTA PRINCIPAL
================================ */
app.post("/oraculo", async (req, res) => {
  try {
    const { message, user_id } = req.body;

    if (!message || !user_id) {
      return res.json({ reply: "⚠️ Usuário não identificado." });
    }

    if (!memory[user_id]) memory[user_id] = { pendingExpense: {} };
    const pending = memory[user_id].pendingExpense;

    /* ===============================
       OPENAI
    ================================ */
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          {
            role: "system",
            content: `
Você é o ORÁCULO FINANCEIRO 🔮.

========================
MISSÃO
========================
Converter linguagem humana informal em registros financeiros EXATOS.

========================
REGRA ABSOLUTA SOBRE DATAS
========================
❗ SE o usuário mencionar QUALQUER referência temporal,
VOCÊ DEVE calcular e retornar uma data REAL no formato YYYY-MM-DD.

❗ NUNCA retorne data vaga.
❗ NUNCA omita a data se houver referência temporal.

========================
COMO CALCULAR DATAS
========================
Considere HOJE como a data atual do sistema.

- hoje → hoje
- ontem → hoje - 1 dia
- amanhã → hoje + 1 dia

- sexta passada →
  a sexta-feira imediatamente ANTERIOR à semana atual

- sexta retrasada →
  a sexta-feira DUAS semanas antes da atual

- segunda que vem →
  a próxima segunda-feira após hoje

- dia 10 →
  dia 10 do mês atual (ou do próximo mês se já passou)

- 10 de janeiro de 2026 →
  2026-01-10

⚠️ Exemplos OBRIGATÓRIOS:
"bicicleta 1000 sexta passada"
→ data DEVE ser algo como: "2026-01-16" (exemplo)

========================
CATEGORIAS AUTOMÁTICAS
========================
- Alimentação: mercado, lanche, comida, restaurante
- Transporte: uber, taxi, gasolina, combustível
- Compras: bicicleta, notebook, roupa, tênis
- Moradia: aluguel, condomínio
- Contas: luz, água, internet
- Lazer: cinema, bar, show
- Saúde: médico, farmácia

Só pergunte categoria se NÃO for possível inferir.

========================
FORMATO DE SAÍDA (JSON PURO)
========================
{
  "acao": "RESPONDER" | "COLETAR_DADO" | "REGISTRAR_DESPESA",
  "dados": {
    "descricao": string | null,
    "valor": number | null,
    "categoria": string | null,
    "data": "YYYY-MM-DD" | null
  },
  "mensagem_usuario": string
}
`
          },
          {
            role: "user",
            content: message
          }
        ]
      })
    });

    const data = await response.json();

    let raw = null;
    for (const o of data.output || []) {
      for (const c of o.content || []) {
        if (c.type === "output_text") raw = c.text;
      }
    }

    if (!raw) {
      return res.json({ reply: "⚠️ Não consegui entender." });
    }

    const action = JSON.parse(raw);
    const d = action.dados || {};

    if (d.descricao) pending.descricao = d.descricao;
    if (d.valor) pending.valor = d.valor;
    if (d.categoria) pending.categoria = d.categoria;
    if (d.data) pending.data = d.data;

    if (!pending.data) pending.data = todayISO();

    const missing = [];
    if (!pending.descricao) missing.push("descrição");
    if (!pending.valor) missing.push("valor");
    if (!pending.categoria) missing.push("categoria");

    if (missing.length > 0) {
      return res.json({
        reply: action.mensagem_usuario || `Confirme: ${missing.join(", ")}.`
      });
    }

    const { error } = await supabase.from("despesas").insert({
      user_id,
      description: pending.descricao,
      amount: pending.valor,
      category: pending.categoria,
      expense_date: pending.data,
      expense_type: "Variável",
      status: "pendente"
    });

    if (error) {
      return res.json({ reply: "❌ Erro ao salvar despesa." });
    }

    memory[user_id].pendingExpense = {};

    return res.json({
      reply: "✅ Despesa registrada com sucesso! Quer adicionar outra?"
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ reply: "⚠️ Falha do Oráculo." });
  }
});

/* ===============================
   START
================================ */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo ativo na porta " + PORT);
});
