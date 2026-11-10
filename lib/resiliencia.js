// Timeout, retry e fallback de modelo para as chamadas externas (Anthropic, Meta, mem0).
// Repete só o que é transitório: 429, 5xx de sobrecarga e falha de rede ou timeout. 4xx definitivos sobem na hora.

export const STATUS_TRANSITORIOS = new Set([429, 500, 502, 503, 504, 529]);
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

function erro(mensagem, { status = null, transitorio, causa } = {}) {
  return Object.assign(new Error(mensagem, causa ? { cause: causa } : undefined), { status, transitorio });
}

function esperaRetryAfter(valor) {
  if (!valor) return null;
  const s = Number(valor);
  if (Number.isFinite(s)) return Math.max(0, s * 1000);
  const data = Date.parse(valor);
  return Number.isNaN(data) ? null : Math.max(0, data - Date.now());
}

// Devolve a resposta (r.ok) ou lança Error com .status e .transitorio.
export async function fetchComResiliencia(fetchImpl, url, init = {}, {
  rotulo = "http", timeoutMs = 15000, tentativas = 2, baseMs = 500, esperaMaxMs = 5000,
  dormir = esperar, aleatorio = Math.random,
} = {}) {
  let ultimo;
  for (let n = 1; n <= tentativas; n++) {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(erro(`${rotulo} -> timeout ${timeoutMs}ms`, { transitorio: true })), timeoutMs);
    let r;
    try {
      r = await fetchImpl(url, { ...init, signal: controle.signal });
    } catch (e) {
      ultimo = controle.signal.aborted
        ? erro(`${rotulo} -> timeout ${timeoutMs}ms`, { transitorio: true, causa: e })
        : erro(`${rotulo} -> falha de rede`, { transitorio: true, causa: e });
    } finally {
      clearTimeout(relogio);
    }
    if (r) {
      if (r.ok) return r;
      ultimo = erro(`${rotulo} -> ${r.status}`, { status: r.status, transitorio: STATUS_TRANSITORIOS.has(r.status) });
      if (!ultimo.transitorio) throw ultimo;
    }
    if (n < tentativas) {
      const pedida = esperaRetryAfter(r?.headers?.get?.("retry-after"));
      const exponencial = baseMs * 2 ** (n - 1) * (0.5 + aleatorio());
      await dormir(Math.min(esperaMaxMs, pedida ?? exponencial));
    }
  }
  throw ultimo;
}

// Tenta cada modelo na ordem. Só troca de modelo quando o erro é transitório (sobrecarga, timeout);
// chave inválida ou requisição malformada falhariam igual no próximo modelo.
export async function comFallback(modelos, chamar, { log = (x) => console.log(JSON.stringify(x)) } = {}) {
  let ultimo;
  for (let i = 0; i < modelos.length; i++) {
    try {
      return await chamar(modelos[i]);
    } catch (e) {
      ultimo = e;
      if (!e.transitorio || i === modelos.length - 1) throw e;
      log({ fallback_de: modelos[i], para: modelos[i + 1], motivo: String(e.message).slice(0, 80) });
    }
  }
  throw ultimo;
}
