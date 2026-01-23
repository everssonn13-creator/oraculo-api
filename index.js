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
   MEMÓRIA TEMPORÁRIA (V1)
================================ */
const pendingActions = {}; 
// Estrutura:
// pendingActions[user_id] = {
//   tipo: "DESPESA",
//   descricao,
//   valor,
//   data
// }

/* ===============================
   ROTA PRINCIPAL
================================ */
app.post("/oraculo", async (req, res) => {
  try {
    const { message, user_id } = req.body;

    console.log("📩 Mensagem recebida:", message);
    console.log("👤 User ID:", user_id);

    if (!message) {
      return res.json({ reply: "⚠️ Não recebi nenhuma mensagem." });
    }

    if (!user_id) {
      return res.json({
        reply: "⚠️ Não consegui identificar seu usuário. Atualize a página e tente novamente.",
      });
    }

    /* ===============================
       CASO: EXISTE AÇÃO PENDENTE
    ================================ */
    if (pendingActions[user_id]) {
      const pending = pendingActions[user_id];

      // Tentativa simples: se usuário respondeu só a categoria
      if (!pending.categoria) {
        pending.categoria = message.trim();

        // Agora temos tudo para registrar
        const { descricao, valor, data, categoria } = pending;

        const { error } = await supabase.from("despesas").insert([
          {
            user_id,
            description: descricao,
            amount: valor,
            category: categoria,
            expense_date: data,
            expense_type: "Variável",
            status: "pendente",
          },
        ]);

        // Limpa memória
        delete pendingActions[user_id];

        if (error) {
          console.error("❌ Erro Supabase:", error);
          return res.json({
            reply: "❌ Tentei registrar a despesa, mas algo deu errado.",
          });
        }

        return res.json({
          reply: `✅ Despesa registrada em **${categoria}** com sucesso! Quer registrar outra ou analisar seus gastos?`,
        });
      }
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
Você é o Oráculo Financeiro 🔮 — especialista em finanças pessoais.

OBJETIVO:
Conversar naturalmente e decidir UMA ação do sistema.

AÇÕES:
- REGISTRAR_DESPESA
- PEDIR_CONFIRMACAO
- RESPONDER

FORMATO OBRIGATÓRIO (JSON):
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
- Nunca invente dados
- Se faltar algo, use PEDIR_CONFIRMACAO
- Sempre responda JSON válido
`
          },
          { role: "user", content: message },
        ],
      }),
    });

    const data = await response.json();

    let rawReply = null;
    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        const textBlock = item.content?.find(c => c.type === "output_text");
        if (textBlock?.text) {
          rawReply = textBlock.text;
          break;
        }
      }
    }

    if (!rawReply) {
      return res.json({ reply: "⚠️ O Oráculo ficou pensativo demais…" });
    }

    const acaoSistema = JSON.parse(rawReply);

    /* ===============================
       RESPONDER NORMAL
    ================================ */
    if (acaoSistema.acao === "RESPONDER") {
      return res.json({ reply: acaoSistema.mensagem_usuario });
    }

    /* ===============================
       PEDIR CONFIRMAÇÃO
    ================================ */
    if (acaoSistema.acao === "PEDIR_CONFIRMACAO") {
      const { descricao, valor, data } = acaoSistema.dados;

      // Guarda contexto
      pendingActions[user_id] = {
        tipo: "DESPESA",
        descricao,
        valor,
        data,
        categoria: null,
      };

      return res.json({ reply: acaoSistema.mensagem_usuario });
    }

    /* ===============================
       REGISTRAR DIRETO (caso raro)
    ================================ */
    if (acaoSistema.acao === "REGISTRAR_DESPESA") {
      const { descricao, valor, categoria, data } = acaoSistema.dados;

      const { error } = await supabase.from("despesas").insert([
        {
          user_id,
          description: descricao,
          amount: valor,
          category: categoria,
          expense_date: data,
          expense_type: "Variável",
          status: "pendente",
        },
      ]);

      if (error) {
        return res.json({ reply: "❌ Erro ao registrar despesa." });
      }

      return res.json({ reply: "✅ Despesa registrada com sucesso!" });
    }

    return res.json({ reply: "🤔 Não entendi. Pode reformular?" });

  } catch (err) {
    console.error("🔥 Erro geral:", err);
    return res.status(500).json({
      reply: "⚠️ O Oráculo encontrou uma turbulência astral.",
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
