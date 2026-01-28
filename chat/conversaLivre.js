import fetch from "node-fetch";
import { ORACLE_CONVERSATION_PROMPT } from "./oracle.personality.js";

export async function conversaLivreComIA(message) {
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
            content: ORACLE_CONVERSATION_PROMPT
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
