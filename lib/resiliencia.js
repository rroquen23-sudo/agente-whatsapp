// Timeout, retry e fallback de modelo para as chamadas externas (Anthropic, Meta, mem0).
// Repete só o que é transitório: 429, 5xx de sobrecarga e falha de rede ou timeout. 4xx definitivos sobem na hora.

export const STATUS_TRANSITORIOS = new Set([429, 500, 502, 503, 504, 529]);
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
// Abaixo disso não vale começar uma tentativa nova antes do prazo.
const MINIMO_POR_TENTATIVA_MS = 1000;

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

async function descartarCorpo(r) {
  try { await r.body?.cancel?.(); } catch { /* corpo já consumido ou indisponível */ }
}

// Faz a chamada e lê o corpo JSON dentro do mesmo timeout. Devolve { status, dados } ou lança Error
// com .status e .transitorio.
// prazo: instante (ms desde a época) que nenhuma tentativa pode ultrapassar; encurta timeouts e esperas.
// statusRepetiveis/repetirRede: para chamadas que não podem duplicar (ex.: envio no WhatsApp).
export async function fetchComResiliencia(fetchImpl, url, init = {}, {
  rotulo = "http", timeoutMs = 15000, tentativas = 2, baseMs = 500, esperaMaxMs = 5000, prazo = Infinity,
  statusRepetiveis = STATUS_TRANSITORIOS, repetirRede = true,
  dormir = esperar, aleatorio = Math.random, agora = Date.now,
} = {}) {
  let ultimo;
  for (let n = 1; n <= tentativas; n++) {
    const resta = prazo - agora();
    if (resta < MINIMO_POR_TENTATIVA_MS) {
      throw ultimo ?? erro(`${rotulo} -> sem tempo no prazo`, { transitorio: true });
    }
    const limite = Math.min(timeoutMs, resta);
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(erro(`${rotulo} -> timeout ${limite}ms`, { transitorio: true })), limite);
    let r;
    let repetivel;
    try {
      r = await fetchImpl(url, { ...init, signal: controle.signal });
      if (r.ok) {
        const texto = typeof r.text === "function" ? await r.text() : JSON.stringify(await r.json());
        return { status: r.status ?? 200, dados: texto ? JSON.parse(texto) : null };
      }
      await descartarCorpo(r);
      ultimo = erro(`${rotulo} -> ${r.status}`, { status: r.status, transitorio: STATUS_TRANSITORIOS.has(r.status) });
      repetivel = statusRepetiveis.has(r.status);
      if (!ultimo.transitorio) throw ultimo;
    } catch (e) {
      if (e === ultimo) throw e;
      if (e instanceof SyntaxError) throw erro(`${rotulo} -> resposta inválida`, { status: r?.status ?? null, transitorio: false, causa: e });
      ultimo = controle.signal.aborted
        ? erro(`${rotulo} -> timeout ${limite}ms`, { transitorio: true, causa: e })
        : erro(`${rotulo} -> falha de rede`, { transitorio: true, causa: e });
      repetivel = repetirRede;
    } finally {
      clearTimeout(relogio);
    }
    if (!repetivel || n === tentativas) break;
    const pedida = esperaRetryAfter(r?.headers?.get?.("retry-after"));
    const exponencial = baseMs * 2 ** (n - 1) * (0.5 + aleatorio());
    const espera = Math.min(esperaMaxMs, pedida ?? exponencial);
    if (agora() + espera + MINIMO_POR_TENTATIVA_MS > prazo) break;
    await dormir(espera);
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

// Rejeita se a promessa não terminar até o prazo (para chamadas que não aceitam prazo próprio).
export function ate(prazo, promessa, { rotulo = "etapa", agora = Date.now } = {}) {
  const resta = prazo - agora();
  if (!Number.isFinite(resta)) return promessa;
  let relogio;
  const limite = new Promise((_, rej) => {
    relogio = setTimeout(() => rej(erro(`${rotulo} -> prazo esgotado`, { transitorio: true })), Math.max(0, resta));
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(relogio));
}
