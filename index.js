import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  next();
});
app.options("*", (req, res) => {
  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("🔮 Oráculo Financeiro ativo e observando seus gastos...");
});
 
app.post("/oraculo", async (req, res) => {
  try {
    const userMessage = req.body.message;

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
            content: "Você é o Oráculo Financeiro. Ajude a registrar despesas, receitas e cartões de forma clara e objetiva."
          },
          {
            role: "user",
            content: userMessage
          }
        ]
      })
    });

const data = await response.json();

const reply = data.output_text || "Sem resposta do Oráculo";

res.json({ reply });

  } catch (err) {
    res.status(500).json({ error: "Erro no Oráculo" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Oráculo ativo na porta " + PORT);
});
