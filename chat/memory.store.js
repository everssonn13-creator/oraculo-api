// =====================================
// Memória em tempo de execução (in-memory)
// Reinicia quando o servidor reinicia
// =====================================

const memory = {};

/**
 * Retorna ou inicializa a memória do usuário
 */
export function getUserMemory(userId) {
  if (!memory[userId]) {
    memory[userId] = {
      // controle de fluxo
      state: "idle",        // idle | preview
      expenses: [],
      lastReport: null,

      // 🧠 memória contextual (Fase 3)
      patterns: {
        interactions: 0,    // quantas mensagens já trocou
        totalExpenses: 0,   // soma dos gastos já registrados
        topCategories: {}   // { Alimentação: 3, Transporte: 1 }
      }
    };
  }

  return memory[userId];
}

/**
 * Atualiza padrões com base nas despesas confirmadas
 * (chamar SOMENTE quando o usuário confirma registros)
 */
export function updatePatterns(userMemory) {
  if (!userMemory || !userMemory.expenses?.length) return;

  for (const e of userMemory.expenses) {
    userMemory.patterns.totalExpenses += e.amount || 0;

    if (!userMemory.patterns.topCategories[e.category]) {
      userMemory.patterns.topCategories[e.category] = 0;
    }

    userMemory.patterns.topCategories[e.category] += 1;
  }
}

/**
 * Registra qualquer interação do usuário
 * (chamar no início da rota /oraculo)
 */
export function registerInteraction(userMemory) {
  if (!userMemory) return;
  userMemory.patterns.interactions += 1;
}
/**
 * Salva o contexto do usuário no Supabase
 */
export async function saveUserContext(supabase, userId, userMemory) {
  const { interactions, totalExpenses, topCategories } = userMemory.patterns;

  await supabase
    .from("user_context")
    .upsert({
      user_id: userId,
      interactions,
      total_expenses: totalExpenses,
      top_categories: topCategories,
      profile: inferProfileFromPatterns(userMemory),
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
}

/**
 * Carrega o contexto do usuário do Supabase
 */
export async function loadUserContext(supabase, userId, userMemory) {
  const { data } = await supabase
    .from("user_context")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!data) return;

  userMemory.patterns.interactions = data.interactions ?? 0;
  userMemory.patterns.totalExpenses = data.total_expenses ?? 0;
  userMemory.patterns.topCategories = data.top_categories ?? {};
}
function inferProfileFromPatterns(userMemory) {
  const { interactions, totalExpenses, topCategories } = userMemory.patterns;
  const categoriesCount = Object.keys(topCategories || {}).length;

  if (totalExpenses < 500 && interactions > 5) return "economico";
  if (categoriesCount >= 4 && interactions < 5) return "impulsivo";
  if (interactions >= 6 && totalExpenses < 1000) return "cauteloso";

  return "neutro";
}
