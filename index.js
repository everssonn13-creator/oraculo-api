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
    const userMessage = req.body.message;
    console.log("📩 Mensagem recebida:", userMessage);

    if (!userMessage) {
      return res.json({ reply: "⚠️ Não recebi nenhuma mensagem." });
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
Você é o Oráculo Financeiro 🔮 — um especialista em finanças pessoais, organizado, didático e humano.

OBJETIVO:
Conversar naturalmente com o usuário sobre finanças pessoais e decidir UMA ação do sistema quando necessário.

COMPORTAMENTO:
- Converse como um humano, de forma amigável e clara
- Use emojis com moderação 🙂
- Pode explicar conceitos, tirar dúvidas e orientar
- Não seja robótico

AÇÕES POSSÍVEIS:
- REGISTRAR_DESPESA
- REGISTRAR_RECEITA
- PEDIR_CONFIRMACAO
- RESPONDER

FORMATO OBRIGATÓRIO DA RESPOSTA (JSON VÁLIDO):
{
  "acao": "RESPONDER | REGISTRAR_DESPESA | REGISTRAR_RECEITA | PEDIR_CONFIRMACAO",
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
- Se faltar qualquer dado para registrar algo, use PEDIR_CONFIRMACAO
- Se for apenas conversa, explicação ou dúvida, use RESPONDER
- Nunca salve dados diretamente
- Sempre responda em JSON válido
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
       TENTAR PARSE DO JSON
    ================================ */
    let acaoSistema;
    try {
      acaoSistema = JSON.parse(rawReply);
    } catch {
      // Se não for JSON (fallback de segurança)
      return res.json({ reply: rawReply });
    }

    /* ===============================
       AÇÃO: RESPONDER (CONVERSA NORMAL)
    ================================ */
    if (acaoSistema.acao === "RESPONDER") {
      return res.json({
        reply:
          acaoSistema.mensagem_usuario ||
          "🔮 Estou aqui. Como posso ajudar com suas finanças?",
      });
    }

    /* ===============================
       AÇÃO: PEDIR CONFIRMAÇÃO
    ================================ */
    if (acaoSistema.acao === "PEDIR_CONFIRMACAO") {
      return res.json({
        reply:
          acaoSistema.mensagem_usuario ||
          "⚠️ Preciso de mais algumas informações para continuar.",
      });
    }

    /* ===============================
       AÇÃO: REGISTRAR DESPESA
    ================================ */
    if (acaoSistema.acao === "REGISTRAR_DESPESA") {
      const { descricao, valor, categoria, data } = acaoSistema.dados;

      if (!descricao || !valor || !categoria || !data) {
        return res.json({
          reply:
            "⚠️ Para registrar a despesa, preciso de descrição, valor, categoria e data.",
        });
      }

      const { error } = await supabase.from("despesas").insert([
        {
          description: descricao,
          amount: valor,
          category: categoria,
          expense_date: data,
          expense_type: "Variável",
          status: "registrada",
        },
      ]);

      if (error) {
        console.error("❌ Erro Supabase:", error);
        return res.json({
          reply:
            "❌ Tentei registrar a despesa, mas algo deu errado. Vamos tentar novamente?",
        });
      }

      return res.json({
        reply:
          acaoSistema.mensagem_usuario ||
          "✅ Despesa registrada com sucesso! Quer registrar outra ou analisar seus gastos?",
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
        "⚠️ O Oráculo encontrou uma turbulência astral. Tente novamente em instantes.",
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
