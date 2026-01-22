import express from "express";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

// =====================
// SUPABASE
// =====================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =====================
// CORS
// =====================
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  next();
});

app.options("*", (req, res) => res.sendStatus(200));

// =====================
// ROOT
// =====================
app.get("/", (req, res) => {
  res.send("🔮 Oráculo Financeiro ativo e observando seus gastos...");
});

// =====================
// ORÁCULO
// =====================
app.post("/oraculo", async (req, res) => {
  try {
    const userMessage = req.body.message;
    console.log("📩 Mensagem recebida:", userMessage);

    if (!userMessage) {
      return res.status(400).json({ reply: "Mensagem vazia." });
    }

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

Você conversa de forma natural, amigável e humana.
Você NÃO fala como robô.
Você pode usar emojis com moderação.

Sua função é interpretar mensagens financeiras e decidir UMA ação.

Ações possíveis:
- REGISTRAR_DESPESA
- REGISTRAR_RECEITA
- PEDIR_CONFIRMACAO
- RESPONDER

Regras:
- Se for conversa normal → RESPONDER
- Se faltar dados → PEDIR_CONFIRMACAO
- Nunca invente valores
- Nunca julgue o usuário

Formato JSON (somente quando for ação):

{
  "acao": "RESPONDER | REGISTRAR_DESPESA | PEDIR_CONFIRMACAO",
  "dados": {
    "descricao": "",
    "valor": 0,
    "categoria": "",
    "data": "YYYY-MM-DD"
  },
  "mensagem_usuario": ""
}
`
          },
          {
            role: "user",
            content: userMessage
          }
        ]
      })
    });

    const data = await response.json();

    let replyText = "";

    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (Array.isArray(item.content)) {
          const block = item.content.find(c => c.type === "output_text");
          if (block?.text) {
            replyText = block.text;
            break;
          }
        }
      }
    }

    if (!replyText) {
      return res.json({ reply: "🤔 O Oráculo está refletindo..." });
    }

    console.log("🔮 Resposta do Oráculo:", replyText);

    // =====================
    // TENTA INTERPRETAR JSON
    // =====================
    let acaoSistema = null;

    try {
      acaoSistema = JSON.parse(replyText);
    } catch {
      // Conversa normal
      return res.json({ reply: replyText });
    }

    // =====================
    // REGISTRAR DESPESA
    // =====================
    if (acaoSistema.acao === "REGISTRAR_DESPESA") {
      const { descricao, valor, categoria, data } = acaoSistema.dados;

      if (!descricao || !valor || !categoria || !data) {
        return res.json({
          reply: "⚠️ Falta alguma informação para registrar a despesa."
        });
      }

      const { error } = await supabase
        .from("despesas")
        .insert([
          {
            description: descricao,
            amount: valor,
            category: categoria,
            expense_date: data,
            expense_type: "manual",
            status: "registrada"
          }
        ]);

      if (error) {
        console.error("Erro Supabase:", error);
        return res.json({
          reply: "❌ Tive um problema ao registrar essa despesa."
        });
      }

      return res.json({
        reply:
          acaoSistema.mensagem_usuario ||
          "✅ Despesa registrada com sucesso. Quer registrar outra?"
      });
    }

    // =====================
    // QUALQUER OUTRA AÇÃO
    // =====================
    return res.json({
      reply:
        acaoSistema.mensagem_usuario ||
        "🔮 Estou aqui. Como posso te ajudar?"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "Erro interno do Oráculo." });
  }
});

// =====================
// SERVER
// =====================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo ativo na porta " + PORT);
});

