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
   MEMÓRIA CURTA (POR USUÁRIO)
================================ */
const memory = {};
/*
memory[userId] = {
  pendingExpense: {
    descricao,
    valor,
    categoria,
    data
  }
}
*/

/* ===============================
   HEALTH
================================ */
app.get("/", (_, res) => {
  res.send("🔮 Oráculo Financeiro ativo e consciente.");
});

/* ===============================
   UTIL
================================ */
const todayISO = () => {
  const d = new Date();
  return d.toISOString().split("T")[0];
};

/* ===============================
   ROTA PRINCIPAL
================================ */
app.post("/oraculo", async (req, res) => {
  try {
    const { message, user_id } = req.body;

    if (!message || !user_id) {
      return res.json({ reply: "⚠️ Não consegui identificar seu usuário." });
    }

    if (!memory[user_id]) memory[user_id] = {};
    if (!memory[user_id].pendingExpense)
      memory[user_id].pendingExpense = {};

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
Você é o ORÁCULO FINANCEIRO 🔮, especialista em interpretar linguagem humana informal
e converter em registros financeiros estruturados.

========================
OBJETIVO
========================
Identificar despesas descritas em linguagem natural e convertê-las
em dados prontos para salvar no banco.

========================
REGRAS FUNDAMENTAIS
========================
- Nunca invente valores.
- Nunca invente datas.
- Não repita perguntas já respondidas.
- Pergunte SOMENTE o que estiver faltando.
- Sempre normalize datas para YYYY-MM-DD.
- Se nenhuma data for mencionada, use a data de hoje.
- Nunca escreva texto fora do JSON.

========================
INTERPRETAÇÃO DE DATAS
========================
Converta expressões humanas em datas reais usando a data atual como referência.

Exemplos obrigatórios:
- hoje → hoje
- ontem → hoje - 1 dia
- amanhã → hoje + 1 dia
- sexta passada → última sexta antes de hoje
- sexta retrasada → sexta da semana anterior à passada
- segunda que vem → próxima segunda após hoje
- dia 10 → dia 10 do mês atual (ou próximo se já passou)
- 10 de janeiro de 2026 → 2026-01-10
- semana passada → segunda-feira da semana anterior
- mês passado → primeiro dia do mês anterior

Se apenas o dia da semana for citado, use o mais próximo no passado.

========================
CATEGORIAS (AUTO)
========================
- Alimentação: lanche, mercado, comida, restaurante, pizza
- Transporte: uber, taxi, 99, gasolina, combustível
- Compras: tênis, roupa, notebook, compras
- Moradia: aluguel, condomínio
- Contas: internet, celular, luz, água
- Lazer: cinema, bar, show
- Saúde: médico, farmácia

Pergunte a categoria SOMENTE se não for possível inferir.

========================
FORMATO DE SAÍDA (JSON)
========================
{
  "acao": "RESPONDER" | "COLETAR_DADO" | "REGISTRAR_DESPESA",
  "dados": {
    "descricao": null | string,
    "valor": null | number,
    "categoria": null | string,
    "data": null | "YYYY-MM-DD"
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
      return res.json({ reply: "⚠️ Não consegui interpretar sua mensagem." });
    }

    const action = JSON.parse(raw);
    const d = action.dados || {};

    /* ===============================
       ATUALIZA MEMÓRIA
    ================================ */
    if (d.descricao) pending.descricao = d.descricao;
    if (d.valor) pending.valor = d.valor;
    if (d.categoria) pending.categoria = d.categoria;
    if (d.data) pending.data = d.data;

    if (!pending.data) pending.data = todayISO();

    /* ===============================
       VERIFICA FALTANTES
    ================================ */
    const missing = [];
    if (!pending.descricao) missing.push("descrição");
    if (!pending.valor) missing.push("valor");
    if (!pending.categoria) missing.push("categoria");

    if (missing.length > 0) {
      return res.json({
        reply:
          action.mensagem_usuario ||
          `Preciso apenas confirmar: ${missing.join(", ")}.`
      });
    }

    /* ===============================
       REGISTRA DESPESA
    ================================ */
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
      console.error("❌ Supabase:", error);
      return res.json({
        reply: "❌ Ocorreu um erro ao salvar a despesa."
      });
    }

    memory[user_id].pendingExpense = {};

    return res.json({
      reply: "✅ Despesa registrada com sucesso! Quer adicionar outra?"
    });

  } catch (err) {
    console.error("🔥 Erro:", err);
    return res.status(500).json({
      reply: "⚠️ O Oráculo teve uma falha momentânea."
    });
  }
});

/* ===============================
   START
================================ */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo ativo na porta " + PORT);
});
