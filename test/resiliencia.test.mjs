const r = await import(new URL("../lib/resiliencia.js", import.meta.url));
const ok = (c, msg) => { if (!c) { console.error("FAIL", msg); process.exit(1); } console.log("ok", msg); };

const resp = (status, headers = {}) => ({ ok: status < 400, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => ({}) });
function roteiro(...passos) {
  const chamadas = [];
  const fetchImpl = async (url, init) => {
    chamadas.push({ url, init });
    const p = passos[Math.min(chamadas.length - 1, passos.length - 1)];
    if (p === "rede") throw new TypeError("fetch failed");
    if (p === "trava") return new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason)));
    return resp(...[].concat(p));
  };
  return { chamadas, fetchImpl };
}
const esperas = [];
const dormir = async (ms) => { esperas.push(ms); };
const opts = (o = {}) => ({ dormir, aleatorio: () => 0.5, ...o });

// retry em transitório
let t = roteiro(529, 200);
let res = await r.fetchComResiliencia(t.fetchImpl, "u", {}, opts());
ok(res.status === 200 && t.chamadas.length === 2, "529 é repetido e a segunda tentativa vale");
for (const s of [429, 500, 502, 503, 504]) {
  t = roteiro(s, 200);
  await r.fetchComResiliencia(t.fetchImpl, "u", {}, opts());
  ok(t.chamadas.length === 2, `${s} é repetido`);
}
t = roteiro("rede", 200);
ok((await r.fetchComResiliencia(t.fetchImpl, "u", {}, opts())).status === 200, "erro de rede é repetido");

// não repete erro definitivo
for (const s of [400, 401, 403, 404]) {
  t = roteiro(s, 200);
  let e = null; try { await r.fetchComResiliencia(t.fetchImpl, "u", {}, opts()); } catch (x) { e = x; }
  ok(e && e.status === s && e.transitorio === false && t.chamadas.length === 1, `${s} não é repetido`);
}

// esgota tentativas
t = roteiro(503);
let e = null; try { await r.fetchComResiliencia(t.fetchImpl, "u", {}, opts({ tentativas: 3 })); } catch (x) { e = x; }
ok(e && e.transitorio && e.status === 503 && t.chamadas.length === 3, "para depois do número de tentativas e marca como transitório");

// backoff exponencial com jitter e retry-after
esperas.length = 0;
t = roteiro(503, 503, 200);
await r.fetchComResiliencia(t.fetchImpl, "u", {}, opts({ tentativas: 3, baseMs: 400 }));
ok(esperas.length === 2 && esperas[1] > esperas[0], "espera cresce a cada tentativa");
esperas.length = 0;
t = roteiro([429, { "retry-after": "2" }], 200);
await r.fetchComResiliencia(t.fetchImpl, "u", {}, opts());
ok(esperas[0] === 2000, "respeita retry-after em segundos");
esperas.length = 0;
t = roteiro([429, { "retry-after": "120" }], 200);
await r.fetchComResiliencia(t.fetchImpl, "u", {}, opts({ esperaMaxMs: 5000 }));
ok(esperas[0] === 5000, "retry-after longo é limitado ao teto");

// timeout
t = roteiro("trava", 200);
res = await r.fetchComResiliencia(t.fetchImpl, "u", {}, opts({ timeoutMs: 20 }));
ok(res.status === 200 && t.chamadas.length === 2, "timeout aborta a tentativa e repete");
t = roteiro("trava");
e = null; try { await r.fetchComResiliencia(t.fetchImpl, "u", {}, opts({ timeoutMs: 20, tentativas: 1 })); } catch (x) { e = x; }
ok(e && e.transitorio && /timeout/i.test(e.message), "timeout sem tentativa restante vira erro transitório");

// fallback entre modelos
const log = [];
let usados = [];
let out = await r.comFallback(["haiku", "sonnet"], async (m) => { usados.push(m); if (m === "haiku") throw Object.assign(new Error("anthropic -> 529"), { transitorio: true }); return "ok:" + m; }, { log: (x) => log.push(x) });
ok(out === "ok:sonnet" && usados.join() === "haiku,sonnet", "esgotou o primeiro modelo, passa ao próximo");
ok(log.some((x) => x.fallback_de === "haiku" && x.para === "sonnet") && !JSON.stringify(log).includes("prompt"), "registra a troca de modelo sem conteúdo");
usados = [];
e = null; try { await r.comFallback(["haiku", "sonnet"], async (m) => { usados.push(m); throw Object.assign(new Error("anthropic -> 401"), { transitorio: false }); }, { log: () => {} }); } catch (x) { e = x; }
ok(e && usados.length === 1, "erro definitivo (chave inválida) não troca de modelo");
e = null; try { await r.comFallback(["sonnet"], async () => { throw Object.assign(new Error("x"), { transitorio: true }); }, { log: () => {} }); } catch (x) { e = x; }
ok(e && e.transitorio, "sem próximo modelo, o erro sobe");

// corpo: resposta não-OK é descartada; corpo travado conta no timeout; JSON inválido não repete
{
  let cancelados = 0;
  let n = 0;
  const f = async () => (++n === 1 ? { ok: false, status: 503, headers: { get: () => null }, body: { cancel: async () => { cancelados++; } } } : { ok: true, status: 200, text: async () => '{"a":1}' });
  const out = await r.fetchComResiliencia(f, "u", {}, opts());
  ok(cancelados === 1 && out.dados.a === 1, "corpo da resposta com erro é descartado e o JSON da boa é lido");
  let m = 0;
  const trava = async (url, init) => ({ ok: true, status: 200, text: () => (++m === 1 ? new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason))) : Promise.resolve("{}")) });
  await r.fetchComResiliencia(trava, "u", {}, opts({ timeoutMs: 20 }));
  ok(m === 2, "corpo que trava depois dos cabeçalhos cai no timeout e repete");
  let k = 0;
  let e = null; try { await r.fetchComResiliencia(async () => { k++; return { ok: true, status: 200, text: async () => "<html>" }; }, "u", {}, opts()); } catch (x) { e = x; }
  ok(e && e.transitorio === false && k === 1, "JSON inválido não é repetido");
}

// prazo e chamadas não idempotentes
{
  let n = 0;
  let e = null; try { await r.fetchComResiliencia(async () => { n++; return { ok: false, status: 503, headers: { get: () => null } }; }, "u", {}, opts({ statusRepetiveis: new Set([429]) })); } catch (x) { e = x; }
  ok(e && n === 1, "status fora da lista de repetíveis não repete");
  n = 0;
  e = null; try { await r.fetchComResiliencia(async () => { n++; throw new TypeError("fetch failed"); }, "u", {}, opts({ repetirRede: false })); } catch (x) { e = x; }
  ok(e && e.transitorio && n === 1, "erro de rede não repete quando a chamada pode ter sido entregue");
  n = 0;
  e = null; try { await r.fetchComResiliencia(async () => { n++; return { ok: true, status: 200, text: async () => "{}" }; }, "u", {}, opts({ prazo: Date.now() + 500 })); } catch (x) { e = x; }
  ok(e && n === 0 && /prazo/.test(e.message), "sem tempo no prazo, nem começa");
  t = roteiro("trava");
  const inicio = Date.now();
  e = null; try { await r.fetchComResiliencia(t.fetchImpl, "u", {}, opts({ timeoutMs: 60000, tentativas: 3, prazo: Date.now() + 1200 })); } catch (x) { e = x; }
  ok(e && Date.now() - inicio < 1500 && t.chamadas.length === 1, "timeout encolhe para caber no prazo e não repete sem tempo");
  e = null;
  try { await r.ate(Date.now() + 30, new Promise(() => {})); } catch (x) { e = x; }
  ok(e && e.transitorio, "ate() corta promessa que passa do prazo");
}
