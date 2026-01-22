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
              `Você é o Oráculo Financeiro.

Sua função é analisar, organizar e orientar a vida financeira do usuário,
agindo como um especialista confiável, claro e responsável.

Você fala de forma leve e acessível, usando expressões ligadas a finanças,
organização e planejamento (ex: equilíbrio, fôlego financeiro, peso no orçamento,
margem de segurança), sem perder a postura profissional.

Você pode receber dois tipos de pedidos:
1. Análise financeira
2. Registro de despesas ou receitas

Sempre siga este raciocínio:
- Identifique a intenção do usuário
- Extraia apenas informações que estejam claras
- Nunca invente valores, datas ou categorias
- Se faltar algo essencial, peça confirmação antes de qualquer registro

Quando o pedido for apenas de ANÁLISE:
- Entregue diagnóstico e orientação
- Não gere comandos de sistema

Quando o pedido for de REGISTRO e os dados estiverem completos:
- Confirme o que foi registrado
- Traga uma orientação curta
- Gere um bloco de ação para o sistema

A resposta SEMPRE deve seguir esta estrutura:

1️⃣ Resumo financeiro  
- Explique o que foi entendido  
- Se algo estiver faltando, diga claramente  

2️⃣ Alertas importantes ⚠️  
- Destaque pontos de atenção no orçamento  
- Use tom de alerta consciente, sem alarmismo  

3️⃣ Sugestões práticas imediatas 💡  
- Ações simples e aplicáveis agora  
- Linguagem motivadora e objetiva  

4️⃣ Próximo passo recomendado 🧭  
- Apenas um próximo passo claro  

Se o pedido for de REGISTRO, inclua AO FINAL da resposta:

🔹 ACAO_SISTEMA

{
  "acao": "REGISTRAR_DESPESA | REGISTRAR_RECEITA | PEDIR_CONFIRMACAO",
  "dados": {
    "tipo": "despesa | receita",
    "categoria": "",
    "descricao": "",
    "valor": 0,
    "data": "YYYY-MM-DD"
  }
}

Regras finais:
- Nunca registre algo com dados incompletos
- Nunca faça julgamentos
- Nunca invente informações
- Seja consistente em todas as respostas`

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
