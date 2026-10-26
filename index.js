/* ======================================================
   1️⃣ IMPORTAÇÕES E DEPENDÊNCIAS
====================================================== */
import express from "express";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { conversaLivreComIA } from "./chat/conversaLivre.js";
import {
  getUserMemory,
  registerInteraction,
  updatePatterns,
  saveUserContext,
  loadUserContext
} from "./chat/memory.store.js";
import { saneamentoRouter } from "./saneamento/router.js";

/* ======================================================
   2️⃣ SUPABASE
====================================================== */
// Opcional: sem as chaves, só o Oráculo Financeiro fica desativado
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

/* ======================================================
   3️⃣ APP EXPRESS
====================================================== */
const app = express();
app.use(express.json());

/* ======================================================
   4️⃣ CORS
====================================================== */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

/* ======================================================
   5️⃣ PERSONALIDADE DO ORÁCULO
====================================================== */
const ORACLE = {
  askClarify: "🔮 Minha visão ficou turva… pode me dar mais detalhes?",
  askConfirm: "Se minha leitura estiver correta, diga **\"sim\"**.",
  saved: "📜 As despesas foram seladas no livro financeiro.",
  nothingFound: "🌫️ Não consegui enxergar nenhuma despesa nessa mensagem.",
  aborted: "🌫️ As palavras se dispersaram… tente novamente com mais clareza."
};

/* ======================================================
   6️⃣ CONVERSA LIVRE — PROMPT DE PERSONALIDADE
====================================================== */
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

/* ======================================================
   7️⃣ MEMÓRIA (ESTADO)
====================================================== */
/*
memory[user_id] = {
  state: "idle" | "preview" | "post_report",
  expenses: []
}
*/

/* ======================================================
   8️⃣ DATAS
====================================================== */
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

/* ======================================================
   9️⃣ CATEGORIAS (DICIONÁRIO COMPLETO)
====================================================== */
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
    "comprei","fiz uma compra","pedido","encomenda","comprei um","comprei uma",
    "roupa","camisa","camiseta","calça","calca","tênis","tenis","sapato",
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

const DOMAIN_MAP = {
  roupa: ["camiseta", "camisa", "blusa", "calça", "calca", "short", "bermuda", "jaqueta", "casaco", "roupa"],
  eletronico: ["celular", "notebook", "computador", "tablet", "tv", "televisao"],
};

const INTENT_WORDS = {
  compra: ["comprei", "compra", "pedido", "encomenda", "paguei", "gastei"],
};

/* ======================================================
   1️⃣0️⃣ NORMALIZAÇÃO + CLASSIFICAÇÃO
====================================================== */
const normalize = (text) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const classifyCategory = (text) => {
  const t = normalize(text);
  const scores = {};

  for (const [cat, words] of Object.entries(CATEGORY_MAP)) {
    scores[cat] = 0;
    for (const w of words) {
      if (t.includes(normalize(w))) {
        scores[cat] += 2;
      }
    }
  }

  if (DOMAIN_MAP.roupa.some(w => t.includes(w))) {
    scores["Compras"] = (scores["Compras"] || 0) + 3;
  }

  if (DOMAIN_MAP.eletronico.some(w => t.includes(w))) {
    scores["Compras"] = (scores["Compras"] || 0) + 3;
  }

  if (INTENT_WORDS.compra.some(w => t.includes(w))) {
    scores["Compras"] = (scores["Compras"] || 0) + 1;
  }

  let bestCat = "Outros";
  let bestScore = 0;

  for (const [cat, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCat = cat;
    }
  }

  return bestScore > 0 ? bestCat : "Outros";
};

/* ======================================================
   1️⃣1️⃣ SEGMENTAÇÃO + EXTRAÇÃO
====================================================== */
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

/* ======================================================
   1️⃣2️⃣ PERFIL COMPORTAMENTAL
====================================================== */
function inferUserProfile(userMemory) {
  const { interactions, totalExpenses, topCategories } = userMemory.patterns;

  const categoriesCount = Object.keys(topCategories || {}).length;

  if (totalExpenses < 500 && interactions > 5) {
    return "economico";
  }

  if (categoriesCount >= 4 && interactions < 5) {
    return "impulsivo";
  }

  if (interactions >= 6 && totalExpenses < 1000) {
    return "cauteloso";
  }

  return "neutro";
}

/* ======================================================
   1️⃣3️⃣ ROTA PRINCIPAL
====================================================== */
app.post("/oraculo", async (req, res) => {
  try {

    /* =========================================
       1️⃣ VALIDAÇÃO INICIAL DA REQUISIÇÃO
    ========================================= */
    if (!supabase) {
      return res.status(503).json({ reply: "🔒 Oráculo Financeiro desativado: configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY." });
    }

    const { message, user_id } = req.body;

    if (!message || !user_id) {
      return res.json({ reply: ORACLE.askClarify });
    }

    /* =========================================
       2️⃣ MEMÓRIA DO USUÁRIO (RUNTIME)
    ========================================= */
    const userMemory = getUserMemory(user_id);
    userMemory.flags = userMemory.flags || {};

    /* =========================================
       3️⃣ CARREGAMENTO DE CONTEXTO PERSISTIDO
       (SUPABASE → MEMÓRIA EM RUNTIME)
    ========================================= */
    await loadUserContext(supabase, user_id, userMemory);

    /* =========================================
       4️⃣ REGISTRO DE INTERAÇÃO / PADRÕES
    ========================================= */
    registerInteraction(userMemory);

    /* =========================================
       5️⃣ NORMALIZAÇÃO DA MENSAGEM
    ========================================= */
    const lowerMsg = message.toLowerCase();
     /* =========================================
      6️⃣ DETECÇÃO DE MENSAGEM FINANCEIRA
    ========================================= */
    const hasValue = /\d+([.,]\d+)?/.test(message);

    const hasExpenseVerb =
      lowerMsg.includes("gastei") ||
      lowerMsg.includes("paguei") ||
      lowerMsg.includes("comprei") ||
      lowerMsg.includes("abasteci") ||
      lowerMsg.includes("fatura") ||
      lowerMsg.includes("cartão");
    /* =========================================
      7️⃣  DETECTOR DE INTENÇÃO — RELATÓRIO
    ========================================= */
    const isReportRequest =
      lowerMsg.includes("relatório") ||
      lowerMsg.includes("relatorio") ||
      lowerMsg.includes("diagnóstico") ||
      lowerMsg.includes("diagnostico") ||
      lowerMsg.includes("análise") ||
      lowerMsg.includes("analise") ||
      lowerMsg.includes("gastei com");

    /* =========================================
       8️⃣ DETECTOR DE CONTINUIDADE
       (CONVERSA APÓS RELATÓRIO)
    ========================================= */
    const isConversation =
      userMemory.lastReport &&
      (
        lowerMsg.includes("o que você acha") ||
        lowerMsg.includes("oq vc acha") ||
        lowerMsg.includes("isso é bom") ||
        lowerMsg.includes("isso é ruim") ||
        lowerMsg.includes("preocupante") ||
        lowerMsg.includes("ok") ||
        lowerMsg.includes("entendi")
      );

    /* =========================================
    9️⃣ FLUXO DE PREVIEW (CONFIRMAÇÃO)
    ========================================= */
    if (userMemory.state === "preview") {

      /* ---------- 9.1 CONFIRMAÇÃO POSITIVA ---------- */
      if (["sim", "ok", "confirmar"].includes(lowerMsg)) {
        for (const e of userMemory.expenses) {
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

        updatePatterns(userMemory);

        userMemory.state = "idle";
        userMemory.expenses = [];
        userMemory.lastReport = null;

        await saveUserContext(supabase, user_id, userMemory);

        return res.json({ reply: ORACLE.saved });
      }

      /* ---------- 9.2 NEGATIVA / CORREÇÃO ---------- */
      if (["não", "nao", "cancelar", "corrigir"].includes(lowerMsg)) {
        userMemory.state = "idle";
        userMemory.expenses = [];

        await saveUserContext(supabase, user_id, userMemory);

        return res.json({
          reply: "Tudo bem 🙂 Me diga novamente como foi que eu ajusto."
        });
      }
    }

    /* =========================================
        🔟 FLUXO DE RELATÓRIO MENSAL
    ========================================= */
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

      const { data } = await supabase
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

      userMemory.lastReport = { total, byCategory };
      userMemory.state = "post_report";
      await saveUserContext(supabase, user_id, userMemory);

      reply += `\n🔮 Quer que eu analise isso com mais profundidade?`;
      return res.json({ reply });
    }

    /* =========================================
        1️⃣1️⃣ CONVERSA ANALÍTICA SOBRE RELATÓRIO
    ========================================= */
    if (isConversation && userMemory.lastReport) {
      const { byCategory } = userMemory.lastReport;

      const highest = Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])[0];

      let reply = `🔮 Observando seus gastos...\n\n`;
      reply += `📌 Você gastou mais em **${highest[0]}**.\n`;
      reply += `💭 Isso representa uma parte significativa do seu orçamento.\n\n`;

      reply += `Se quiser, posso te ajudar a:\n`;
      reply += `• reduzir gastos\n• planejar o próximo mês\n• analisar outra categoria`;
      return res.json({ reply });
    }

    /* =========================================
        1️⃣2️⃣ CONVERSA HUMANA PÓS-RELATÓRIO
    ========================================= */
    if (userMemory.state === "post_report" && userMemory.lastReport) {
      const { byCategory, total } = userMemory.lastReport;

      const [topCat, topValue] = Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])[0];

      const pct = ((topValue / total) * 100).toFixed(1);

      const reply = `🔍 Olhando para esse período, **${topCat}** teve o maior peso (${pct}%).\n\nQuer conversar sobre isso ou prefere pensar em um pequeno ajuste?`;

      return res.json({ reply });
    }
  /* =========================================
   1️⃣3️⃣ CONVERSA LIVRE (SEM REGISTRO)
========================================= */
if (!hasValue && !hasExpenseVerb && !isReportRequest) {
  let reply = await conversaLivreComIA(message);

  const profile = inferUserProfile(userMemory);

  // Comentário de perfil — apenas UMA vez
  if (profile === "economico" && !userMemory.flags.profileCommented) {
    reply = `💡 Dá pra perceber que você costuma cuidar bem do dinheiro.\n\n${reply}`;
    userMemory.flags.profileCommented = true;
  }

  if (profile === "impulsivo" && !userMemory.flags.profileCommented) {
    reply = `⚡ Parece que suas decisões são bem rápidas — isso tem seu lado bom.\n\n${reply}`;
    userMemory.flags.profileCommented = true;
  }

  if (profile === "cauteloso" && !userMemory.flags.profileCommented) {
    reply = `🧘 Você costuma pensar antes de agir, isso ajuda muito.\n\n${reply}`;
    userMemory.flags.profileCommented = true;
  }

  // Primeira interação — apenas uma vez
  if (userMemory.patterns.interactions === 1 && !userMemory.flags.firstTime) {
    reply = `🔮 Primeira vez por aqui? Fica à vontade.\n\n${reply}`;
    userMemory.flags.firstTime = true;
  }

  // Saudação recorrente — apenas uma vez
  if (userMemory.patterns.interactions > 3 && !userMemory.flags.greeted) {
    reply = `🙂 Bom te ver de novo por aqui.\n\n${reply}`;
    userMemory.flags.greeted = true;
  }

  // Hábito frequente — apenas uma vez
  if (userMemory.patterns.interactions > 10 && !userMemory.flags.habitMentioned) {
    reply = `😄 Já virou hábito passar por aqui, né?\n\n${reply}`;
    userMemory.flags.habitMentioned = true;
  }

  // Observação de categoria dominante — controlada
  const topCats = Object.entries(userMemory.patterns.topCategories || {})
    .sort((a, b) => b[1] - a[1]);

  if (
    topCats.length &&
    userMemory.patterns.interactions > 5 &&
    !userMemory.flags.topCategoryMentioned
  ) {
    const [cat] = topCats[0];
    reply += `\n\n🔎 Notei que você costuma falar bastante sobre **${cat}**.`;
    userMemory.flags.topCategoryMentioned = true;
  }

  // 🔐 Persistir flags para não repetir
  await saveUserContext(supabase, user_id, userMemory);

  return res.json({ reply });
}
    /* =========================================
       1️⃣4️⃣ EXTRAÇÃO DE DESPESAS
    ========================================= */
    const extracted = extractExpenses(message);

    if (!extracted.length) {
      const reply = await conversaLivreComIA(message);
      return res.json({ reply });
    }

    /* =========================================
       1️⃣5️⃣ CLASSIFICAÇÃO + ENTRADA EM PREVIEW
    ========================================= */
    userMemory.expenses = extracted.map(e => ({
      ...e,
      category: classifyCategory(e.description)
    }));

    userMemory.state = "preview";

    let preview = "🧾 Posso registrar assim?\n\n";

    userMemory.expenses.forEach((e, i) => {
      preview += `${i + 1}) ${e.description} — ${
        e.amount === null ? "Valor não informado" : `R$ ${e.amount}`
      } — ${e.category}\n`;
    });

    preview += `\n${ORACLE.askConfirm}`;

    await saveUserContext(supabase, user_id, userMemory);

    return res.json({ reply: preview });

  } catch (err) {

    /* =========================================
       ❌ TRATAMENTO DE ERRO GLOBAL DA ROTA
    ========================================= */
    console.error(err);
    return res.status(500).json({
      reply: "🌪️ As visões se romperam por um instante…"
    });
  }
});
/* ======================================================
   1️⃣6️⃣ PLATAFORMA SANEAMENTO (API + APP)
====================================================== */
app.use("/api/saneamento", saneamentoRouter);
app.use("/saneamento", express.static(fileURLToPath(new URL("./public/saneamento", import.meta.url))));
app.get("/", (req, res) => res.redirect("/saneamento/"));

/* ======================================================
   1️⃣7️⃣ START
====================================================== */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🔮 Oráculo Financeiro ativo na porta " + PORT);
});
