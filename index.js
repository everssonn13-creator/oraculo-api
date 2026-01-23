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

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  next();
});

app.options("*", (_, res) => res.sendStatus(200));

app.get("/", (_, res) => {
  res.send("🔮 Oráculo Financeiro ativo e observando seus gastos...");
});

/* ===============================
   MEMÓRIA TEMPORÁRIA (POR USUÁRIO)
================================ */
const pendingActions = {}; 
// estrutura:
// pendingActions[userId] = { descricao, valor, data }

/* ===============================
   ROTA PRINCIPAL
================================ */
app.post("/oraculo", async (req, res) => {
  try {
    const { message, user_id } = req.body;

    console.log("📩 Mensagem recebida:", message);
    console.log("👤 User ID:", user_id);

    if (!message || !user_id) {
      return res.json({
        reply: "⚠️ Não consegui identificar seu usuário. Atualize a página e tente novamente."
      });
    }

    /* ===============================
       CASO: EXISTE AÇÃO PENDENTE
    ================================ */
    if (pendingActions[user_id]) {
      const pending = pendingActions[user_id];

      // Consideramos a mensagem como categoria
      const categoria = message.trim();

      const { error } = await supabase.from("despesas").insert([
        {
          user_id,
          description: pending.descricao,
          amount: pending.valor,
          category: categoria,
          expense_date: pending.data,
          expense_type: "Variável",
          status: "pendente"
        }
      ]);

      if (error) {
        console.error("❌ Erro Supabase:", error);
        return res.json({
          reply: "❌ Tive um problema ao registrar sua despesa. Vamos tentar novamente?"
        });
      }

      delete pendingActions[user_id];

      return res.json({
        reply: "✅ Despesa registrada com sucesso! Quer registrar outra?"
      });
    }

    /* ===============================
       CHAMADA OPENAI
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
Você é o Oráculo Financeiro 🔮.

Extraia informações financeiras quando existirem.

FORMATO OBRIGATÓRIO (JSON):
{
  "acao": "REGISTRAR_DESPESA | RESPONDER | PEDIR_CONFIRMACAO",
  "dados": {
    "descricao": "",
    "valor": 0,
    "data": "YYYY-MM-DD"
  },
  "mensagem_usuario": ""
}

REGRAS:
- Se for uma despesa clara, use REGISTRAR_DESPESA
- Se faltar categoria, backend irá pedir
- Nunca invente valores
- Sempre JSON válido
`
          },
          { role: "user", content: message }
        ]
      })
    });

    const data = await response.json();

    let rawReply = null;
    for (const item of data.output || []) {
      const text = item.content?.find(c => c.type === "output_text")?.text;
      if (text) rawReply = text;
    }

    if (!rawReply) {
      return res.json({ reply: "⚠️ Não consegui entender. Pode reformular?" });
    }

    const parsed = JSON.parse(rawReply);

    /* ===============================
       REGISTRAR DESPESA (SEM CATEGORIA)
    ================================ */
    if (parsed.acao === "REGISTRAR_DESPESA") {
      const { descricao, valor, data } = parsed.dados;

      pendingActions[user_id] = {
        descricao,
        valor,
        data
      };

      return res.json({
        reply:
          parsed.mensagem_usuario ||
          "Confirme a categoria da despesa (ex: Alimentação, Transporte, Lazer)."
      });
    }

    /* ===============================
       CONVERSA NORMAL
    ================================ */
    return res.json({
      reply:
        parsed.mensagem_usuario ||
        "🔮 Estou aqui para te ajudar com suas finanças."
    });

  } catch (err) {
    console.error("🔥 Erro geral:", err);
    return res.status(500).json({
      reply: "⚠️ O Oráculo encontrou uma instabilidade. Tente novamente."
    });
  }
});

/* ===============================
   START SERVER
================================ */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo ativo na porta " + PORT);
});
