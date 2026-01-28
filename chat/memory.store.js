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
