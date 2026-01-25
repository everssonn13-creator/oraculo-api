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

/* ===============================
   CORS
================================ */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

/* ===============================
   PERSONALIDADE DO ORÁCULO
================================ */
const ORACLE_TONE = {
  intro: "🔮 O Oráculo observa seus fluxos financeiros...",
  confirm: "Posso registrar assim?",
  success: "✨ Registro selado no livro financeiro.",
  doubt: "Hmm… essa visão não está clara. Pode explicar melhor?",
  reflect: "Se quiser, posso refletir sobre isso com você."
};

/* ===============================
   MEMÓRIA
================================ */
const memory = {};

/* ===============================
   DATAS
================================ */
const todayISO = () => new Date().toISOString().split("T")[0];

const resolveDate = (text) => {
  const t = text.toLowerCase();
  const now = new Date();

  if (t.includes("hoje")) return todayISO();
  if (t.includes("ontem")) {
    now.setDate(now.getDate() - 1);
    return now.toISOString().split("T")[0];
  }

  const dia = t.match(/dia\s(\d{1,2})/);
  const mes = t.match(/(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/);
  const meses = {
    janeiro: 0, fevereiro: 1, março: 2, abril: 3, maio: 4, junho: 5,
    julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11
  };

  if (dia && mes) {
    const d = new Date();
    d.setDate(Number(dia[1]));
    d.setMonth(meses[mes[1]]);
    return d.toISOString().split("T")[0];
  }

  return todayISO();
};

/* ===============================
   CATEGORIAS (EXPANDIDAS)
================================ */
const CATEGORIAS = { /* 👇 exatamente como você enviou */ 
  Alimentação: [
    "comi","almocei","jantei","lanchei","pedi comida","comer fora","comi fora",
    "lanche","pastel","coxinha","pizza","hambúrguer","hamburguer","sushi",
    "marmita","pf","restaurante","lanchonete","padaria","ifood","mercado"
  ],
  Transporte: [
    "abasteci","abastecer","gasolina","etanol","diesel","uber","99","taxi",
    "ônibus","metro","estacionamento","pedágio","oficina","lavagem"
  ],
  Moradia: [
    "aluguel","condomínio","luz","energia","água","internet","iptu","gás"
  ],
  Saúde: [
    "médico","medico","dentista","consulta","farmácia","remédio","hospital"
  ],
  Pets: [
    "pet","cachorro","gato","ração","veterinário","petshop"
  ],
  Dívidas: [
    "fatura","cartão","boleto","empréstimo","financiamento","juros"
  ],
  Compras: [
    "comprei","roupa","tênis","celular","amazon","shopee","mercado livre"
  ],
  Lazer: [
    "cinema","show","viagem","bar","balada","hotel"
  ],
  Educação: [
    "curso","faculdade","livro","udemy","alura"
  ],
  Investimentos: [
    "investi","ação","fundo","cdb","tesouro","cripto"
  ],
  Assinaturas: [
    "netflix","spotify","prime","chatgpt","hostinger","icloud","office"
  ]
};

const classifyCategory = (text) => {
  const t = text.toLowerCase();
  for (const cat in CATEGORIAS) {
    if (CATEGORIAS[cat].some(k => t.includes(k))) return cat;
  }
  return "Outros";
};

/* ===============================
   INTENÇÕES
================================ */
const isReport = (msg) =>
  msg.includes("relatório") || msg.includes("diagnóstico") || msg.includes("gastei com");

const isPureConversation = (msg) =>
  !msg.match(/\d+/) && !msg.includes("relatório");

/* ===============================
   ROTA
================================ */
app.post("/oraculo", async (req, res) => {
  const { message, user_id } = req.body;
  if (!message || !user_id) return res.json({ reply: ORACLE_TONE.doubt });

  const text = message.toLowerCase();

  /* ===============================
     CONVERSA LIVRE
  ================================ */
  if (isPureConversation(text)) {
    return res.json({
      reply: `${ORACLE_TONE.reflect}\n\nO que deseja explorar sobre suas finanças?`
    });
  }

  /* ===============================
     RELATÓRIO / DIAGNÓSTICO
  ================================ */
  if (isReport(text)) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const { data } = await supabase
      .from("despesas")
      .select("*")
      .gte("expense_date", `${year}-${String(month).padStart(2, "0")}-01`)
      .lte("expense_date", `${year}-${String(month).padStart(2, "0")}-31`);

    if (!data || data.length === 0) {
      return res.json({ reply: "📭 Ainda não há registros suficientes para essa análise." });
    }

    let total = 0;
    const byCat = {};
    data.forEach(d => {
      total += Number(d.amount || 0);
      byCat[d.category] = (byCat[d.category] || 0) + Number(d.amount || 0);
    });

    let reply = `📊 **Diagnóstico Financeiro do Mês**\n\n💰 Total gasto: R$ ${total.toFixed(2)}\n\n`;
    for (const c in byCat) {
      const pct = ((byCat[c] / total) * 100).toFixed(1);
      reply += `• ${c}: R$ ${byCat[c].toFixed(2)} (${pct}%)\n`;
    }

    reply += `\n🔮 Reflexão: pequenos ajustes nas maiores categorias geram grandes impactos.`;

    return res.json({ reply });
  }

  /* ===============================
     REGISTRO (IA)
  ================================ */
  const ai = await fetch("https://api.openai.com/v1/responses", {
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
Extraia despesas do texto.
Retorne JSON:
{
  "despesas": [
    { "descricao": "", "valor": null }
  ]
}`
        },
        { role: "user", content: message }
      ]
    })
  });

  const aiData = await ai.json();
  const raw = aiData.output?.[0]?.content?.[0]?.text;
  if (!raw) return res.json({ reply: ORACLE_TONE.doubt });

  const parsed = JSON.parse(raw);
  const date = resolveDate(message);

  memory[user_id] = parsed.despesas.map(d => ({
    description: d.descricao,
    amount: d.valor,
    category: classifyCategory(d.descricao),
    date
  }));

  let preview = `${ORACLE_TONE.confirm}\n\n`;
  memory[user_id].forEach((e, i) => {
    preview += `${i + 1}) ${e.description} — ${e.amount ?? "Valor não informado"} — ${e.category}\n`;
  });

  preview += `\n📅 Data: ${date}\n\nResponda **"sim"** para confirmar.`;

  return res.json({ reply: preview });
});

/* ===============================
   START
================================ */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo Financeiro ativo na porta " + PORT);
});
