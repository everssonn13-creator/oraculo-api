import fetch from "node-fetch";

// =====================================
// HTTP com timeout + cache em memória
// Evita bater nas APIs públicas a cada requisição
// =====================================

const cache = new Map();

export async function fetchCached(url, { ttlMs = 10 * 60 * 1000, timeoutMs = 15000, as = "json", headers = {} } = {}) {
  const key = `${as}:${url}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "OraculoSaneamento/1.0 (+analise de mercado)", Accept: "*/*", ...headers }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} em ${new URL(url).host}`);

    const value = as === "json" ? await res.json() : await res.text();
    cache.set(key, { value, expires: Date.now() + ttlMs });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return value;
  } catch (err) {
    const host = new URL(url).host;
    if (err.name === "AbortError") throw new Error(`Tempo esgotado ao consultar ${host}`);
    if (err.message.startsWith("HTTP ")) throw err;
    throw new Error(`Fonte indisponível (${host}): ${err.code || err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

export const yyyymmdd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
export const isoDate = (d) => d.toISOString().slice(0, 10);
