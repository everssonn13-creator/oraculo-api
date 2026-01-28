// Memória simples do chat (in-memory)
// Não persistente – reinicia quando o servidor reinicia

export const memory = {};

/**
 * Garante que o usuário sempre tenha uma estrutura de memória válida
 */
export function getUserMemory(user_id) {
  if (!memory[user_id]) {
    memory[user_id] = {
      // Estado do fluxo (ex: idle, preview, confirming)
      state: "idle",

      // Última intenção detectada (ex: expense, income, conversation)
      lastIntent: null,

      // Última mensagem do usuário
      lastMessage: "",

      // Contexto livre para a conversa (ex: assunto atual)
      context: {},

      // Despesas pendentes de confirmação
      expenses: []
    };
  }

  return memory[user_id];
}

/**
 * Reseta apenas o fluxo financeiro, mantendo contexto de conversa
 */
export function resetFinancialFlow(user_id) {
  if (!memory[user_id]) return;

  memory[user_id].state = "idle";
  memory[user_id].expenses = [];
  memory[user_id].lastIntent = null;
}
