// Memória em tempo de execução (in-memory)
// Reinicia quando o servidor reinicia

const memory = {};

export function getUserMemory(userId) {
  if (!memory[userId]) {
    memory[userId] = {
      state: "idle",
      expenses: [],
      lastReport: null,

      // 🧠 memória contextual
      patterns: {
        topCategories: {},   // { Alimentação: 5, Transporte: 2 }
        totalExpenses: 0,
        interactions: 0
      }
    };
  }

  return memory[userId];
}

export function updatePatterns(userMemory) {
  userMemory.patterns.interactions += 1;

  for (const e of userMemory.expenses) {
    userMemory.patterns.totalExpenses += e.amount || 0;

    if (!userMemory.patterns.topCategories[e.category]) {
      userMemory.patterns.topCategories[e.category] = 0;
    }

    userMemory.patterns.topCategories[e.category] += 1;
  }
}
