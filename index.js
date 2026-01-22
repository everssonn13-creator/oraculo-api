import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// CORS (para funcionar no HTML local)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  next();
});

app.options("*", (req, res) => res.sendStatus(200));

// Rota raiz (teste)
app.get("/", (req, res) => {
  res.send("🔮 Oráculo Financeiro ativo e observando seus gastos...");
});

// Rota do Oráculo
app.post("/oraculo", async (req, res) => {
  try {
    const userMessage = req.body.message;
    console.log("📩 Mensagem recebida:", userMessage);

    if (!userMessage) {
      return res.status(400).json({ error: "Mensagem não enviada" });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          {
            role: "system",
            content:
              "Você é o Oráculo Financeiro.

Sua função é analisar informações financeiras pessoais e devolver diagnósticos claros,
objetivos e acionáveis, mesmo que os dados venham incompletos ou desorganizados.

Sempre siga esta estrutura na resposta:

1️⃣ Resumo financeiro
- Identifique receitas, despesas e saldo estimado
- Se algo estiver faltando, diga explicitamente

2️⃣ Alertas importantes
- Alerte sobre gastos altos, desequilíbrios ou riscos

3️⃣ Sugestões práticas imediatas
- Ações concretas com exemplos simples

4️⃣ Próximo passo recomendado
- Apenas um próximo passo claro

Regras:
- Linguagem simples
- Nada de julgamentos
- Não invente valores"
          },
          {
            role: "user",
            content: userMessage
          }
        ]
      })
    });

const data = await response.json();

let reply = "⚠️ Oráculo não conseguiu responder";

try {
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (Array.isArray(item.content)) {
        const textBlock = item.content.find(c => c.type === "output_text");
        if (textBlock?.text) {
          reply = textBlock.text;
          break;
        }
      }
    }
  }
} catch (e) {
  console.error("Erro ao extrair texto:", e);
}
console.log("📤 Resposta enviada:", reply);

res.json({ reply });


  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro no Oráculo" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo ativo na porta " + PORT);
});
