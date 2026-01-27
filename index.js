import express from "express";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
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
const ORACLE = {
  askClarify: "🔮 Minha visão ficou turva… pode me dar mais detalhes?",
  askConfirm: "Se minha leitura estiver correta, diga **\"sim\"**.",
  saved: "📜 As despesas foram seladas no livro financeiro.",
  nothingFound: "🌫️ Não consegui enxergar nenhuma despesa nessa mensagem.",
  aborted: "🌫️ As palavras se dispersaram… tente novamente com mais clareza."
};
/* ===============================
   CONVERSA LIVRE - PERSONALIDADE
================================ */
const ORACLE_CONVERSATION_PROMPT = `
Você é o ORÁCULO FINANCEIRO 🔮

Você conversa sobre dinheiro de forma leve, humana e próxima,
como um bom amigo que escuta, acolhe e incentiva.

════════ PERSONALIDADE ════════
- Criativo
- Alegre
- Otimista
- Empático
- Humano e próximo
- Fala como um amigo, nunca como professor

════════ REGRAS GERAIS ════════
- Respostas curtas (máx. 2 a 3 linhas)
- Tom leve, positivo e animado
- Use no máximo 1 emoji
- Faça no máximo UMA pergunta por resposta
- Se perceber que está ficando longo, simplifique
- Quando a pergunta for curta, a resposta também deve ser curta
- Varie levemente a forma de iniciar as respostas
- Use linguagem natural e cotidiana do português do Brasil

════════ COMO RESPONDER ════════

1) Se o usuário fizer uma PERGUNTA GERAL sobre dinheiro:
→ Responda de forma simples e acolhedora
→ Evite análises
→ Convide a pessoa a explicar melhor o momento dela

2) Se o usuário fizer um DESABAFO ou mostrar confusão:
→ Valide o sentimento primeiro
→ Traga uma frase curta de apoio
→ Faça uma pergunta leve para continuar

3) Se o usuário pedir OPINIÃO ou REFLEXÃO:
→ Traga uma visão equilibrada
→ Evite certo ou errado
→ Pergunte o que mais preocupa a pessoa

4) Se o usuário pedir ORIENTAÇÃO:
→ Sugira apenas UM pequeno passo possível
→ Nada de listas longas ou planos complexos

5) Se o usuário buscar CONFIRMAÇÃO:
→ Reforce o esforço da pessoa
→ Normalize a situação (isso é comum, acontece com muita gente)

6) Se o usuário apenas puxar CONVERSA:
→ Responda com simpatia e proximidade
→ Estimule a continuação do papo

════════ PROIBIDO ════════
- Relatórios
- Números
- Análises financeiras
- Julgamentos
- Moralizações
- Aulas

Objetivo final:
Criar uma conversa agradável sobre dinheiro,
onde a pessoa se sinta confortável para continuar falando.
`;
/* ===============================
   MEMÓRIA (ESTADO)
================================ */
const memory = {};
/*
memory[user_id] = {
  state: "idle" | "preview",
  expenses: []
}
*/

/* ===============================
   DATAS
================================ */
const todayISO = () => new Date().toISOString().split("T")[0];

const parseDateFromText = (text) => {
  const t = text.toLowerCase();

  if (t.includes("ontem")) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }

  if (t.includes("hoje")) return todayISO();

  if (t.includes("amanhã") || t.includes("amanha")) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }

  const match = t.match(
    /dia\s+(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/
  );

  if (match) {
    const months = {
      janeiro: 0, fevereiro: 1, março: 2, abril: 3,
      maio: 4, junho: 5, julho: 6, agosto: 7,
      setembro: 8, outubro: 9, novembro: 10, dezembro: 11
    };
    const d = new Date();
    d.setMonth(months[match[2]]);
    d.setDate(Number(match[1]));
    return d.toISOString().split("T")[0];
  }

  return null;
};

/* ===============================
   CATEGORIAS (DICIONÁRIO COMPLETO)
================================ */
const CATEGORY_MAP = {
  Alimentação: [
    "comi","almocei","jantei","lanchei","pedi comida","comer fora","comi fora",
    "gastei com comida","gastei em comida",
    "lanche","pastel","coxinha","pizza","hambúrguer","hamburguer","sushi","esfiha",
    "marmita","pf","prato feito","self service","buffet","rodízio","rodizio",
    "restaurante","lanchonete","padaria","cafeteria","bar",
    "café","cafe","bebida","suco","refrigerante","cerveja",
    "ifood","delivery","pedido comida",
    "mercado","supermercado","atacadão","assai","extra","carrefour"
  ],

  Transporte: [
    "abasteci","abastecer","fui de uber","peguei uber","peguei 99",
    "gastei com transporte","corrida",
    "gasolina","etanol","diesel","combustível","combustivel",
    "posto","posto de gasolina","abastecimento",
    "uber","99","taxi","ônibus","onibus","metrô","metro","trem","passagem",
    "estacionamento","pedágio","pedagio",
    "oficina","mecânico","mecanico","manutenção",
    "lavagem","lava jato","lavacar"
  ],

  Moradia: [
    "paguei aluguel","paguei condomínio","conta de casa","gastei com casa",
    "aluguel","condomínio","condominio",
    "luz","energia","conta de luz","conta de energia",
    "água","agua","conta de água",
    "internet","telefone","iptu",
    "gás","gas de cozinha","botijão","botijao",
    "reparo","conserto","manutenção",
    "faxina","limpeza","diarista"
  ],

  Saúde: [
    "fui ao médico","consulta médica","gastei com saúde",
    "médico","medico","dentista","psicólogo","psicologo",
    "nutricionista","fisioterapia","terapia",
    "farmácia","farmacia","remédio","remedio",
    "hospital","clínica","clinica",
    "exame","checkup","raio-x","ultrassom","ressonância",
    "plano de saúde","convênio","convenio","coparticipação"
  ],

  Pets: [
    "gastei com pet","levei no veterinário",
    "pet","cachorro","gato",
    "ração","racao","areia gato",
    "vacina","remédio pet",
    "veterinário","veterinario","petshop",
    "banho","tosa","hotel pet","creche pet"
  ],

  Dívidas: [
    "paguei fatura","paguei dívida","parcelei","renegociei",
    "fatura","cartão","cartao","cartão de crédito","cartao de credito",
    "mínimo","pagamento mínimo","juros",
    "boleto","financiamento","empréstimo","emprestimo",
    "acordo","renegociação","parcelamento",
    "atrasado","em atraso","consórcio","consorcio"
  ],

  Compras: [
    "comprei","fiz uma compra","pedido","encomenda",
    "roupa","camisa","calça","calca","tênis","tenis","sapato",
    "celular","notebook","computador","tablet","tv","televisão",
    "shopping","loja",
    "amazon","shopee","mercado livre",
    "magalu","casas bahia","americanas","shein"
  ],

  Lazer: [
    "saí","passei","viajei","gastei com lazer",
    "cinema","show","evento","festival",
    "viagem","passeio","bar","balada","churrasco",
    "hotel","airbnb","resort",
    "jogo","game","videogame","psn","xbox"
  ],

  Educação: [
    "estudei","paguei curso","mensalidade faculdade",
    "curso","faculdade","aula","escola",
    "mensalidade","material","apostila","livro",
    "ead","online","udemy","alura","coursera","hotmart",
    "mba","pós","pos","especialização","especializacao"
  ],

  Investimentos: [
    "investi","apliquei","fiz aporte","aporte mensal",
    "investimento","ação","acoes","fundo","fii",
    "cdb","lci","lca","tesouro","tesouro direto",
    "previdência","previdencia","poupança","poupanca",
    "cripto","bitcoin","renda fixa","renda variável"
  ],

  Assinaturas: [
    "assinatura","mensalidade","plano mensal",
    "netflix","spotify","prime","youtube","youtube premium",
    "apple music","deezer",
    "chatgpt","chatgpt pro","hostinger",
    "icloud","google one","dropbox",
    "office","office 365","canva","notion","figma"
  ]
};

const classifyCategory = (text) => {
  const t = text.toLowerCase();
  let best = { cat: "Outros", score: 0 };

  for (const [cat, words] of Object.entries(CATEGORY_MAP)) {
    let score = 0;
    for (const w of words) {
      if (t.includes(w)) score++;
    }
    if (score > best.score) best = { cat, score };
  }

  return best.cat;
};

/* ===============================
   SEGMENTAÇÃO + EXTRAÇÃO
================================ */
const segmentByTime = (text) => {
  const normalized = text.replace(/,/g, " | ").replace(/\s+e\s+/gi, " | ");
  const parts = normalized.split("|").map(p => p.trim()).filter(Boolean);

  let currentDate = null;
  return parts.map(p => {
    const d = parseDateFromText(p);
    if (d) currentDate = d;
    return {
      text: p.replace(/ontem|hoje|amanhã|amanha/gi, "").trim(),
      date: d ?? currentDate ?? todayISO()
    };
  });
};

const extractExpenses = (text) => {
  const segments = segmentByTime(text);
  const expenses = [];

  for (const seg of segments) {
    const tokens = seg.text.split(" ");
    let value = null;
    let desc = [];

    for (const tok of tokens) {
      if (/^\d+([.,]\d+)?$/.test(tok)) {
        value = Number(tok.replace(",", "."));
        break;
      }
      desc.push(tok);
    }

    const description = desc.join(" ").trim();
    if (!description) continue;

    expenses.push({ description, amount: value, date: seg.date });
  }

  return expenses;
};
/* ===============================
   CONVERSA LIVRE COM OPENAI
================================ */
async function conversaLivreComIA(message, financialContextText = "") {
  try {
   const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
  },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: ORACLE_CONVERSATION_PROMPT + "\n" + financialContextText
      },
      {
        role: "user",
        content: message
      }
    ],
    temperature: 0.7,
    max_tokens: 100
  })
});

const data = await response.json();

    return (
      data?.choices?.[0]?.message?.content ||
      "🔮 Vamos olhar isso com calma. Pode me contar um pouco mais?"
    );

  } catch (err) {
    console.error("Erro OpenAI:", err);
    return "🔮 Algo ficou nebuloso por um instante… quer tentar explicar de outro jeito?";
  }
}
/* ===============================
   ROTA PRINCIPAL
================================ */
app.post("/oraculo", async (req, res) => {
  try {
    const { message, user_id, financialContext } = req.body;
     let financialContextText = "";

if (financialContext) {
  financialContextText = `
CONTEXTO FINANCEIRO DO USUÁRIO:
- Renda mensal: R$ ${financialContext.monthlyIncome}
- Total de despesas: R$ ${financialContext.totalExpenses}

Despesas por categoria:
${JSON.stringify(financialContext.expenseByCategory, null, 2)}

Use essas informações SOMENTE se forem úteis para ajudar o usuário.
Não repita números sem necessidade.
`;
}
    if (!message || !user_id) {
      return res.json({ reply: ORACLE.askClarify });
    }
// ===============================
// DETECTOR DE INTENÇÃO
// ===============================
const lowerMsg = message.toLowerCase();

const isReportRequest =
  lowerMsg.includes("relatório") ||
  lowerMsg.includes("relatorio") ||
  lowerMsg.includes("diagnóstico") ||
  lowerMsg.includes("diagnostico") ||
  lowerMsg.includes("análise") ||
  lowerMsg.includes("analise") ||
  lowerMsg.includes("gastei com");

const isConversation =
  memory[user_id]?.lastReport &&
  (
    lowerMsg.includes("o que você acha") ||
    lowerMsg.includes("oq vc acha") ||
    lowerMsg.includes("isso é bom") ||
    lowerMsg.includes("isso é ruim") ||
    lowerMsg.includes("preocupante") ||
    lowerMsg.includes("ok") ||
    lowerMsg.includes("entendi")
  );

    if (!memory[user_id]) memory[user_id] = { state: "idle", expenses: [] };

    if (memory[user_id].state === "preview") {
      if (["sim","ok","confirmar"].includes(message.toLowerCase())) {
        for (const e of memory[user_id].expenses) {
          await supabase.from("despesas").insert({
            user_id,
            description: e.description,
            amount: e.amount,
            category: e.category,
            expense_date: e.date,
            data_vencimento: e.date,
            status: "pendente",
            expense_type: "Variável",
            is_recurring: false
          });
        }
        memory[user_id] = { state: "idle", expenses: [] };
        return res.json({ reply: ORACLE.saved });
      }
      memory[user_id] = { state: "idle", expenses: [] };
    }
// ===============================
// RELATÓRIO MENSAL
// ===============================
if (isReportRequest) {
  const monthMatch = lowerMsg.match(
    /(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/
  );

  const months = {
    janeiro: 0, fevereiro: 1, março: 2, abril: 3,
    maio: 4, junho: 5, julho: 6, agosto: 7,
    setembro: 8, outubro: 9, novembro: 10, dezembro: 11
  };

  const now = new Date();
  const start = new Date(now.getFullYear(), monthMatch ? months[monthMatch[1]] : now.getMonth(), 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);

  const { data, error } = await supabase
    .from("despesas")
    .select("*")
    .eq("user_id", user_id)
    .gte("expense_date", start.toISOString().split("T")[0])
    .lte("expense_date", end.toISOString().split("T")[0]);

  if (!data || !data.length) {
    return res.json({
      reply: "📭 Ainda não há registros suficientes para esse período."
    });
  }

  let total = 0;
  const byCategory = {};

  data.forEach(d => {
    total += d.amount || 0;
    byCategory[d.category] = (byCategory[d.category] || 0) + (d.amount || 0);
  });

  let reply = `📊 **Relatório ${monthMatch ? monthMatch[1] : "do mês atual"}**\n\n`;
  reply += `💰 Total gasto: **R$ ${total.toFixed(2)}**\n\n`;

  for (const [cat, val] of Object.entries(byCategory)) {
    const pct = ((val / total) * 100).toFixed(1);
    reply += `• ${cat}: R$ ${val.toFixed(2)} (${pct}%)\n`;
  }

  memory[user_id].lastReport = { total, byCategory };

  reply += `\n🔮 Quer que eu analise isso com mais profundidade?`;

  return res.json({ reply });
}
// ===============================
// CONVERSA SOBRE RELATÓRIO
// ===============================
if (isConversation) {
  const { total, byCategory } = memory[user_id].lastReport;

  const highest = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])[0];

  let reply = `🔮 Observando seus gastos...\n\n`;
  reply += `📌 Você gastou mais em **${highest[0]}**.\n`;
  reply += `💭 Isso representa uma parte significativa do seu orçamento.\n\n`;

  reply += `Se quiser, posso te ajudar a:\n`;
  reply += `• reduzir gastos\n• planejar o próximo mês\n• analisar outra categoria`;

  return res.json({ reply });
}
     // ===============================
// CONVERSA LIVRE (SEM REGISTRO)
// ===============================
const hasValue = /\d+([.,]\d+)?/.test(message);

const hasExpenseVerb =
  lowerMsg.includes("gastei") ||
  lowerMsg.includes("paguei") ||
  lowerMsg.includes("comprei") ||
  lowerMsg.includes("abasteci") ||
  lowerMsg.includes("fatura") ||
  lowerMsg.includes("cartão");

if (!hasValue && !hasExpenseVerb && !isReportRequest) {
  const reply = await conversaLivreComIA(message, financialContextText);
  return res.json({ reply });
}
const extracted = extractExpenses(message);
if (!extracted.length) {
  const reply = await conversaLivreComIA(message, financialContextText);
  return res.json({ reply });
}
    memory[user_id].expenses = extracted.map(e => ({
      ...e,
      category: classifyCategory(e.description)
    }));
    memory[user_id].state = "preview";

    let preview = "🧾 Posso registrar assim?\n\n";
    memory[user_id].expenses.forEach((e, i) => {
      preview += `${i + 1}) ${e.description} — ${
        e.amount === null ? "Valor não informado" : `R$ ${e.amount}`
      } — ${e.category}\n`;
    });

    preview += `\n${ORACLE.askConfirm}`;
    return res.json({ reply: preview });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ reply: "🌪️ As visões se romperam por um instante…" });
  }
});

/* ===============================
   START
================================ */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo Financeiro ativo na porta " + PORT);
});
