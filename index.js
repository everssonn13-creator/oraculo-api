import express from "express";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);


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
              "Você é o Oráculo Financeiro. Sua função é analisar, organizar e orientar a vida financeira do usuário, agindo como um especialista confiável, claro e responsável. Você fala de forma leve e acessível, usando expressões ligadas a finanças,organização e planejamento (ex: equilíbrio, fôlego financeiro, peso no orçamento), sem perder a postura profissional. Você pode receber dois tipos de pedidos: 1. Análise financeira 2. Registro de despesas ou receitas Sempre siga este raciocínio: - Identifique a intenção do usuário - Extraia apenas informações que estejam claras - Nunca invente valores, datas ou categorias - Se faltar algo essencial, peça confirmação antes de qualquer registro A resposta SEMPRE deve seguir esta estrutura:1️⃣ Resumo financeiro  Explique claramente o que foi entendido.2️⃣ Alertas importantes ⚠️  Destaque pontos de atenção, se existirem.3️⃣ Sugestões práticas imediatas 💡  Ações simples que o usuário pode aplicar agora.4️⃣ Próximo passo recomendado 🧭  Apenas um próximo passo claro. Quando o pedido for de REGISTRO e os dados estiverem completos,ao FINAL da resposta escreva uma seção chamada:ACAO_SISTEMA:- Tipo: REGISTRAR_DESPESA ou REGISTRAR_RECEITA- Valor: número- Categoria: texto- Descrição: texto- Data: YYYY-MM-DDSe faltar qualquer dado essencial, use:ACAO_SISTEMA:- Tipo: PEDIR_CONFIRMACAO"
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
