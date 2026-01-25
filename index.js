import express from "express";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

/* ======================================================
   SUPABASE
====================================================== */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ======================================================
   APP
====================================================== */
const app = express();
app.use(express.json());

/* ======================================================
   CORS
====================================================== */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

/* ======================================================
   MEMÓRIA VOLÁTIL (POR USUÁRIO)
====================================================== */
const memory = {};

/*
memory[user_id] = {
  expenses: [],
  awaitingConfirmation: false,
  lastContext: null // "report" | "conversation"
}
*/

/* ======================================================
   DATAS
====================================================== */
const todayISO = () => new Date().toISOString().split("T")[0];

const monthMap = {
  janeiro: 1, fevereiro: 2, março: 3, abril: 4,
  maio: 5, junho: 6, julho: 7, agosto: 8,
  setembro: 9, outubro: 10, novembro: 11, dezembro: 12
};

const resolveDate = (text) => {
  const t = text.toLowerCase();
  const now = new Date();

  if (t.includes("hoje")) return todayISO();
  if (t.includes("ontem")) {
    now.setDate(now.getDate() - 1);
    return now.toISOString().split("T")[0];
  }

  const full = t.match(/dia (\d{1,2}) de (\w+)/);
  if (full && monthMap[full[2]]) {
    return `${now.getFullYear()}-${String(monthMap[full[2]]).padStart(2, "0")}-${String(full[1]).padStart(2, "0")}`;
  }

  return todayISO();
};

/* ======================================================
   CATEGORIAS (COMPLETAS + VARIAÇÕES)
====================================================== */
const CATEGORIES = {
  Alimentação: [
    "comi","almocei","jantei","lanchei","pedi comida","comer fora","comi fora",
    "lanche","pastel","pizza","hambúrguer","hamburguer","coxinha","sushi","esfiha",
    "marmita","pf","prato feito","buffet","rodízio","rodizio",
    "restaurante","lanchonete","padaria","cafeteria","bar",
    "ifood","delivery","mercado","supermercado","assai","atacadão","carrefour"
  ],
  Transporte: [
    "abasteci","abastecer","abastecimento","gasolina","etanol","diesel","combustível",
    "uber","99","taxi","ônibus","onibus","metrô","metro","trem",
    "estacionamento","pedágio","pedagio","oficina","mecânico","manutenção"
  ],
  Moradia: [
    "aluguel","condomínio","condominio","luz","energia","água","agua",
    "internet","telefone","iptu","faxina","diarista","reparo","conserto"
  ],
  Saúde: [
    "médico","medico","dentista","consulta","psicólogo","psicologo",
    "nutricionista","fisioterapia","terapia","farmácia","farmacia",
    "remédio","remedio","hospital","exame","plano de saúde"
  ],
  Pets: [
    "pet","cachorro","gato","ração","racao","areia","veterinário",
    "petshop","banho","tosa","vacina"
  ],
  Dívidas: [
    "fatura","cartão","cartao","boleto","financiamento",
    "empréstimo","emprestimo","parcelamento","juros"
  ],
  Compras: [
    "comprei","roupa","camisa","calça","calca","tênis","tenis",
    "celular","notebook","computador","tv","shopping",
    "amazon","shopee","mercado livre","magalu","shein"
  ],
  Lazer: [
    "cinema","show","evento","festival","viagem","hotel",
    "bar","balada","churrasco","jogo","videogame"
  ],
  Educação: [
    "curso","faculdade","escola","mensalidade",
    "livro","apostila","ead","udemy","alura","mba"
  ],
  Investimentos: [
    "investi","aporte","investimento","ação","acoes",
    "fundo","fii","cdb","tesouro","bitcoin","cripto"
  ],
  Assinaturas: [
    "assinatura","mensalidade","netflix","spotify","prime",
    "youtube","chatgpt","chatgpt pro","hostinger",
    "icloud","google one","office","canva","notion"
  ]
};

const classifyCategory = (text) => {
  const t = text.toLowerCase();
  let best = { cat: "Outros", score: 0 };

  for (const cat in CATEGORIES) {
    let score = 0;
    CATEGORIES[cat].forEach(k => {
      if (t.includes(k)) score++;
    });
    if (score > best.score) best = { cat, score };
  }
  return best.cat;
};

/* ======================================================
   DETECÇÃO DE INTENÇÃO
====================================================== */
const isConfirmation = (msg) =>
  ["sim","confirmar","ok","pode","isso"].includes(msg.trim().toLowerCase());

const isReport = (msg) =>
  msg.toLowerCase().includes("relatório") ||
  msg.toLowerCase().includes("diagnóstico") ||
  msg.toLowerCase().includes("quanto gastei");

const isConversation = (msg) =>
  msg.endsWith("?") ||
  msg.toLowerCase().includes("o que você acha") ||
  msg.toLowerCase().includes("entendi");

/* ======================================================
   ROTA PRINCIPAL
====================================================== */
app.post("/oraculo", async (req, res) => {
  try {
    const { message, user_id } = req.body;
    if (!message || !user_id) {
      return res.json({ reply: "🔮 Preciso saber quem está me consultando." });
    }

    if (!memory[user_id]) {
      memory[user_id] = { expenses: [], awaitingConfirmation: false, lastContext: null };
    }

    /* ================= CONFIRMAÇÃO ================= */
    if (memory[user_id].awaitingConfirmation && isConfirmation(message)) {
      for (const e of memory[user_id].expenses) {
        await supabase.from("despesas").insert({
          user_id,
          description: e.description,
          amount: e.amount,
          category: e.category,
          expense_date: e.date,
          status: "pendente"
        });
      }
      memory[user_id] = { expenses: [], awaitingConfirmation: false, lastContext: null };
      return res.json({ reply: "✅ As despesas foram inscritas no livro financeiro." });
    }

    /* ================= RELATÓRIO ================= */
    if (isReport(message)) {
      memory[user_id].lastContext = "report";

      const { data } = await supabase
        .from("despesas")
        .select("amount, category");

      if (!data || !data.length) {
        return res.json({ reply: "📭 Ainda não há registros suficientes para essa análise." });
      }

      let total = 0;
      const byCat = {};
      data.forEach(d => {
        total += Number(d.amount || 0);
        byCat[d.category] = (byCat[d.category] || 0) + Number(d.amount || 0);
      });

      let text = `📊 **Diagnóstico Financeiro**\n\n💰 Total: R$ ${total.toFixed(2)}\n\n`;
      for (const c in byCat) {
        const pct = ((byCat[c] / total) * 100).toFixed(1);
        text += `• ${c}: R$ ${byCat[c].toFixed(2)} (${pct}%)\n`;
      }

      text += `\n🔮 *Vejo padrões claros aqui. Se quiser, posso te ajudar a interpretar ou ajustar esse caminho.*`;
      return res.json({ reply: text });
    }

    /* ================= CONVERSA ================= */
    if (isConversation(message)) {
      return res.json({
        reply: "🔮 Pensando com calma… seus hábitos mostram oportunidades interessantes. Quer que eu analise um ponto específico?"
      });
    }

    /* ================= REGISTRO (IA) ================= */
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
Você é o Oráculo Financeiro.
Extraia TODAS as despesas do texto.
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
    if (!raw) {
      return res.json({ reply: "Hmm… essa visão não está clara. Pode explicar melhor?" });
    }

    const parsed = JSON.parse(raw);
    if (!parsed.despesas?.length) {
      return res.json({ reply: "Não consegui identificar despesas nessa mensagem." });
    }

    const date = resolveDate(message);

    memory[user_id].expenses = parsed.despesas.map(d => ({
      description: d.descricao,
      amount: d.valor,
      category: classifyCategory(d.descricao),
      date
    }));

    memory[user_id].awaitingConfirmation = true;

    let preview = "🧾 **Posso registrar assim?**\n\n";
    memory[user_id].expenses.forEach((e, i) => {
      preview += `${i + 1}) ${e.description} — ${e.amount ? "R$ " + e.amount : "Valor não informado"} — ${e.category}\n`;
    });

    preview += `\n📅 Data: ${date}\n\nResponda **"sim"** para confirmar.`;
    return res.json({ reply: preview });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      reply: "⚠️ O Oráculo teve uma visão turva por um instante."
    });
  }
});

/* ======================================================
   START
====================================================== */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo Financeiro ativo na porta " + PORT);
});
