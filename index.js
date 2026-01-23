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

// Health check
app.get("/", (_, res) => {
  res.send("🔮 Oráculo Financeiro ativo e observando seus gastos...");
});

/* ===============================
   ROTA PRINCIPAL
================================ */
app.post("/oraculo", async (req, res) => {
  try {
    const { message: userMessage, user_id: userId } = req.body;

    console.log("📩 Mensagem recebida:", userMessage);
    console.log("👤 User ID:", userId);

    if (!userMessage) {
      return res.json({ reply: "⚠️ Não recebi nenhuma mensagem." });
    }

    if (!userId) {
      return res.json({
        reply:
          "⚠️ Não consegui identificar seu usuário. Atualize a página e tente novamente.",
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
Você é o Oráculo Financeiro 🔮

Sua função é conversar naturalmente sobre finanças pessoais
e decidir UMA ação quando necessário.

AÇÕES POSSÍVEIS:
- REGISTRAR_DESPESA
- REGISTRAR_RECEITA
- PEDIR_CONFIRMACAO
- RESPONDER

FORMATO OBRIGATÓRIO (JSON VÁLIDO):
{
  "acao": "",
  "dados": {
    "descricao": "",
    "valor": 0,
    "categoria": "",
    "data": "YYYY-MM-DD"
  },
  "mensagem_usuario": ""
}

REGRAS:
- Nunca invente valores
- Se faltar qualquer dado, use PEDIR_CONFIRMACAO
- Se for conversa normal, use RESPONDER
- Nunca responda fora do JSON
`
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
      }),
    });

    const data = await response.json();

    /* ===============================
       EXTRAIR TEXTO DA OPENAI
    ================================ */
    let rawReply = null;

    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (Array.isArray(item.content)) {
          const textBlock = item.content.find(
            (c) => c.type === "output_text"
          );
          if (textBlock?.text) {
            rawReply = textBlock.text;
            break;
          }
        }
      }
    }

    if (!rawReply) {
      return res.json({
        reply: "⚠️ O Oráculo ficou pensativo demais… tente novamente.",
      });
    }

    console.log("🧠 Resposta bruta da IA:", rawReply);

    /* ===============================
       PARSE DO JSON
    ================================ */
    let acaoSistema;
    try {
      acaoSistema = JSON.parse(rawReply);
    } catch {
      return res.json({ reply: rawReply });
    }

    /* ===============================
       RESPONDER (CONVERSA)
    ================================ */
    if (acaoSistema.acao === "RESPONDER") {
      return res.json({
        reply:
          acaoSistema.mensagem_usuario ||
          "🔮 Estou aqui. Como posso ajudar?",
      });
    }

    /* ===============================
       PEDIR CONFIRMAÇÃO
    ================================ */
    if (acaoSistema.acao === "PEDIR_CONFIRMACAO") {
      return res.json({
        reply:
          acaoSistema.mensagem_usuario ||
          "⚠️ Preciso de mais informações para continuar.",
      });
    }

    /* ===============================
       REGISTRAR DESPESA
    ================================ */
    if (acaoSistema.acao === "REGISTRAR_DESPESA") {
      const { descricao, valor, categoria, data } = acaoSistema.dados;

      if (!descricao || !valor || !categoria) {
        return res.json({
          reply:
            "⚠️ Preciso da descrição, valor e categoria para registrar a despesa.",
        });
      }

      // Normalização de data (TEXT no banco)
      const rawDate = data || new Date().toISOString();
      const expenseDate = rawDate.split("T")[0]; // YYYY-MM-DD

      const dateObj = new Date(expenseDate);
      const statement_month = dateObj.getMonth() + 1;
      const statement_year = dateObj.getFullYear();

      const { error } = await supabase.from("despesas").insert([
        {
          user_id: userId,
          description: descricao,
          amount: Number(valor),
          category: categoria,
          expense_date: expenseDate,
          statement_month,
          statement_year,
          expense_type: "Variável",
          status: "pendente",
        },
      ]);

      if (error) {
        console.error("❌ Erro Supabase:", error);
        return res.json({
          reply:
            "❌ Tive um problema ao registrar a despesa. Vamos tentar novamente?",
        });
      }

      return res.json({
        reply:
          acaoSistema.mensagem_usuario ||
          "✅ Despesa registrada! Quer ver um resumo do mês ou registrar outra?",
        action: "REFRESH_DESPESAS",
      });
    }

    /* ===============================
       FALLBACK
    ================================ */
    return res.json({
      reply: "🤔 Não entendi completamente. Pode reformular?",
    });
  } catch (err) {
    console.error("🔥 Erro geral:", err);
    return res.status(500).json({
      reply:
        "⚠️ O Oráculo encontrou uma instabilidade. Tente novamente.",
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
