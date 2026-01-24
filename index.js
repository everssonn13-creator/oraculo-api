import express from 'express';
import { createClient } from '@supabase/supabase-js';

/* ======================================================
   🔐 SUPABASE
   ====================================================== */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ======================================================
   🚀 APP
   ====================================================== */

const app = express();
app.use(express.json());

/* ======================================================
   🧠 MEMÓRIA DE CURTO PRAZO (POR SESSÃO)
   ====================================================== */

const memory = {};
/*
memory[sessionId] = {
  description,
  amount,
  category,
  expense_date
}
*/

/* ======================================================
   🗂️ CATEGORIAS OFICIAIS DO APP
   (IGUAL AO expenseCategories.js)
   ====================================================== */

const CATEGORIES = [
  { name: 'Moradia', keywords: ['aluguel','condominio','iptu','agua','luz','internet','gas','casa'] },
  { name: 'Alimentação', keywords: ['lanche','comida','mercado','supermercado','padaria','pizza','ifood'] },
  { name: 'Transporte', keywords: ['uber','99','gasolina','combustivel','onibus','metro','estacionamento'] },
  { name: 'Saúde', keywords: ['farmacia','remedio','medico','dentista','exame'] },
  { name: 'Educação', keywords: ['curso','faculdade','livro','mensalidade'] },
  { name: 'Lazer', keywords: ['cinema','bar','show','viagem','jogo'] },
  { name: 'Compras', keywords: ['tenis','roupa','sapato','bicicleta','celular','notebook'] },
  { name: 'Assinaturas', keywords: ['netflix','spotify','assinatura','plano'] },
  { name: 'Pets', keywords: ['pet','racao','veterinario','cachorro','gato'] },
  { name: 'Presentes', keywords: ['presente','aniversario','natal'] },
  { name: 'Dívidas', keywords: ['emprestimo','financiamento','parcela','divida'] },
  { name: 'Investimentos', keywords: ['acao','investimento','tesouro','fundo'] },
  { name: 'Outros', keywords: [] }
];

/* ======================================================
   🔎 CLASSIFICADOR DE CATEGORIA
   ====================================================== */

function classifyCategory(text) {
  const lower = text.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.keywords.some(k => lower.includes(k))) {
      return cat.name;
    }
  }
  return null;
}

/* ======================================================
   📅 PARSER DE DATAS (SEM LIBS)
   ====================================================== */

function parseDate(text) {
  const today = new Date();

  const normalize = (d) => d.toISOString().split('T')[0];

  if (text.includes('hoje')) return normalize(today);

  if (text.includes('amanha')) {
    today.setDate(today.getDate() + 1);
    return normalize(today);
  }

  // dd/mm/yyyy
  const numeric = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (numeric) {
    return `${numeric[3]}-${numeric[2]}-${numeric[1]}`;
  }

  // "dia 5 do proximo mes"
  const nextMonth = text.match(/dia (\d{1,2}) do proximo mes/);
  if (nextMonth) {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(Number(nextMonth[1]));
    return normalize(d);
  }

  return null;
}

/* ======================================================
   🧙 PERSONALIDADE DO ORÁCULO
   ====================================================== */

function oracle(text) {
  return `🔮 **Oráculo Financeiro**  
${text}`;
}

/* ======================================================
   🤖 ROTA PRINCIPAL
   ====================================================== */

app.post('/oraculo', async (req, res) => {
  try {
    const { sessionId, user_id, message } = req.body;
    if (!sessionId || !user_id) {
      return res.json({ reply: oracle('Não consegui identificar seu usuário.') });
    }

    if (!memory[sessionId]) memory[sessionId] = {};
    const mem = memory[sessionId];
    const text = message.toLowerCase();

    /* -------- VALOR -------- */
    const valueMatch = text.match(/(\d+[.,]?\d*)/);
    if (valueMatch && !mem.amount) {
      mem.amount = Number(valueMatch[1].replace(',', '.'));
    }

    /* -------- DESCRIÇÃO -------- */
    if (!mem.description) {
      mem.description = message;
    }

    /* -------- CATEGORIA -------- */
    if (!mem.category) {
      const cat = classifyCategory(text);
      if (cat) mem.category = cat;
    }

    /* -------- DATA -------- */
    if (!mem.expense_date) {
      const d = parseDate(text);
      if (d) mem.expense_date = d;
    }

    /* -------- CHECAGEM FINAL -------- */
    if (mem.description && mem.amount && mem.category && mem.expense_date) {

      const { error } = await supabase.from('despesas').insert({
        user_id,
        description: mem.description,
        amount: mem.amount,
        category: mem.category,
        expense_date: mem.expense_date,
        expense_type: 'Variável',
        status: 'pendente'
      });

      memory[sessionId] = {}; // limpa memória

      if (error) {
        console.error(error);
        return res.json({ reply: oracle('Tive um problema ao salvar essa despesa.') });
      }

      return res.json({
        reply: oracle(
          `Despesa registrada com sucesso ✨  
💰 R$ ${mem.amount}  
📂 ${mem.category}  
📅 ${mem.expense_date}  

Quer registrar outra?`
        )
      });
    }

    /* -------- PERGUNTAS INTELIGENTES -------- */
    if (!mem.category) {
      return res.json({ reply: oracle('Em qual categoria essa despesa se encaixa?') });
    }

    if (!mem.expense_date) {
      return res.json({ reply: oracle('Qual foi a data? Pode ser hoje, amanhã ou 05/02/2026.') });
    }

    return res.json({ reply: oracle('Pode continuar, estou acompanhando.') });

  } catch (err) {
    console.error(err);
    res.json({ reply: oracle('Algo saiu errado nos meus cálculos místicos.') });
  }
});

/* ======================================================
   🚀 START
   ====================================================== */

app.listen(8080, () => {
  console.log('🔮 Oráculo Financeiro conectado ao Supabase');
});
