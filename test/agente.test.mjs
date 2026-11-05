process.env.MEM0_LEAD_SALT = "sal"; process.env.NUMEROS_BLOQUEADOS = "87988622718,87988275024";
const a = await import(new URL("../lib/agente.js", import.meta.url));
const ok = (c, msg) => { if (!c) { console.error("FAIL", msg); process.exit(1); } console.log("ok", msg); };

const ENV = { AGENT_ENABLED: "true", AGENT_MODE: "shadow", ALERTA_WHATSAPP: "5587981446598", ANTHROPIC_API_KEY: "k", WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "123" };
function montar({ env = ENV, llm = "ACAO: RESPONDER\n---\nOlá! Sou o assistente virtual do Roque. Você procura lote para lazer, investimento ou moradia?", optout = false, agora = new Date("2026-11-04T15:00:00Z") } = {}) {
  const chamadas = [];
  const fetchImpl = async (url, init) => {
    const corpo = init?.body ? JSON.parse(init.body) : null;
    chamadas.push({ url, corpo, headers: init?.headers });
    if (url.includes("anthropic")) return { ok: true, json: async () => ({ content: [{ type: "text", text: corpo?.model === "claude-haiku-5-5" ? (globalThis.TRIAGEM ?? "RESPONDER") : llm }] }) };
    return { ok: true, json: async () => ({}) };
  };
  const mem = { pediuParar: async () => optout, contextoLead: async () => ["quer lazer"], playbook: async () => ["perguntar quanto cabe por mês"], lembrarLead: async (...x) => { chamadas.push({ mem: "lembrar", x }); }, registrarEvento: async () => {}, registrarOptOut: async (t) => { chamadas.push({ mem: "optout", t }); } };
  return { chamadas, agente: a.criarAgente({ env, mem, fetchImpl, agora: () => agora, briefing: "BRIEFING" }) };
}
const lead = { id: "w1", from: "5587988887777", tipo: "text", texto: "Oi, quanto custa o lote?", nome: "João" };
const enviosWhats = (c) => c.filter((x) => x.url?.includes("graph.facebook.com"));

// kill switch
let t = montar({ env: { ...ENV, AGENT_ENABLED: "false" } });
ok((await t.agente.processar(lead)).resultado === "desligado" && t.chamadas.length === 0, "AGENT_ENABLED=false não faz nada");

// rascunho vai só ao Roque
t = montar();
let r = await t.agente.processar(lead);
const w = enviosWhats(t.chamadas);
ok(r.resultado === "rascunho" && w.length === 1 && w[0].corpo.to === "5587981446598", "rascunho enviado só ao Roque");
ok(w[0].corpo.text.body.includes("nada foi enviado ao cliente") && w[0].corpo.text.body.includes("Oi, quanto custa"), "cartão mostra a mensagem do lead e o aviso de sombra");
const ia = t.chamadas.find((c) => c.url.includes("anthropic") && c.corpo.model !== "claude-haiku-5-5");
const tri = t.chamadas.find((c) => c.corpo?.model === "claude-haiku-5-5");
ok(tri && tri.corpo.max_tokens <= 300, "triagem usa o Haiku");
ok(ia.corpo.model === "claude-sonnet-5-5" && ia.corpo.output_config.effort === "low", "Sonnet 5.5 com esforço baixo");
const sis = JSON.stringify(ia.corpo.system);
ok(sis.includes("BRIEFING") && sis.includes("quer lazer") && sis.includes("quanto cabe"), "prompt leva briefing, memória do lead e playbook");
ok(ia.corpo.system[0].cache_control && !ia.corpo.system[0].text.includes("quer lazer"), "parte fixa vai para o cache; memória fica fora dele");
ok(!JSON.stringify(ia.corpo.messages).includes("5587988887777"), "telefone não vai para a IA");
ok(t.chamadas.some((c) => c.mem === "lembrar" && c.x[1][0].role === "user"), "memória grava só o que o cliente disse");

// trava dura
t = montar();
let erro = null; try { await t.agente.enviar("5587988887777", "oi"); } catch (e) { erro = e; }
ok(erro && enviosWhats(t.chamadas).length === 0, "envio direto a lead é bloqueado no modo sombra");
t = montar({ env: { ...ENV, AGENT_MODE: "auto" } });
erro = null; try { await t.agente.enviar("5587981446598", "oi"); } catch (e) { erro = e; }
ok(erro, "modo automático não existe");

// bloqueados e canal do Roque
t = montar();
ok((await t.agente.processar({ ...lead, from: "5587988622718" })).resultado === "bloqueado" && t.chamadas.length === 0, "Ana Beatriz não recebe nada");
ok((await t.agente.processar({ ...lead, from: "558788275024" })).resultado === "bloqueado", "Lúcia sem o 9 também bloqueada");
ok((await t.agente.processar({ ...lead, from: "5587981446598" })).resultado === "canal-do-roque", "mensagens do Roque não geram rascunho (evita laço)");
t = montar({ env: { ...ENV, ALERTA_E_TESTE: "true" } });
ok((await t.agente.processar({ ...lead, from: "5587981446598" })).resultado === "rascunho", "modo teste deixa o Roque agir como lead");

// opt-out, PARAR, exclusão
t = montar({ optout: true });
ok((await t.agente.processar(lead)).resultado === "optout" && t.chamadas.length === 0, "quem pediu PARAR não recebe mais nada");
t = montar();
r = await t.agente.processar({ ...lead, texto: "PARAR" });
ok(r.resultado === "parar" && t.chamadas.some((c) => c.mem === "optout") && !t.chamadas.some((c) => c.url?.includes("anthropic")), "PARAR registra bloqueio sem chamar a IA");
r = await montar().agente.processar({ ...lead, texto: "quero EXCLUIR MEUS DADOS" });
ok(r.resultado === "exclusao", "pedido de exclusão vira alerta");

// domingo e tipos
t = montar({ agora: new Date("2026-11-08T15:00:00Z") });
r = await t.agente.processar(lead);
ok(r.resultado === "domingo" && !t.chamadas.some((c) => c.url.includes("anthropic")) && enviosWhats(t.chamadas)[0].corpo.text.body.includes("Hoje é domingo"), "domingo: resposta fixa, sem IA");
t = montar();
r = await t.agente.processar({ ...lead, tipo: "audio", texto: "" });
ok(r.resultado === "nao-texto" && enviosWhats(t.chamadas)[0].corpo.text.body.includes("Áudio"), "áudio vira alerta");

// risco
ok(a.avaliarRisco("Esse terreno tem escritura registrada", "oi").length > 0, "escritura sem o cliente perguntar é sinalizada");
ok(a.avaliarRisco("Sobre a escritura: está em regularização.", "e a escritura?").length === 0, "escritura quando perguntam não é sinalizada");
ok(a.avaliarRisco("Investimento garantido, valorização certa", "oi").length > 0, "promessa de ganho é sinalizada");
ok(a.avaliarRisco("O lote custa R$ 55.000", "oi").some((s) => s.includes("valor")), "valor citado é sinalizado");
ok(a.avaliarRisco("Sou o Roque, tudo bem?", "oi").length > 0, "fingir ser o Roque é sinalizado");
ok(a.avaliarRisco("Olá! Sou o assistente virtual do Roque. Qual seu objetivo?", "oi").length === 0, "mensagem limpa passa");

// formato da IA
ok(a.interpretarResposta("ACAO: ALERTAR_ROQUE\n---\nVou levar ao Roque.\nMotivo: desconto").acao === "ALERTAR_ROQUE", "interpreta alerta");
ok(a.interpretarResposta("texto solto").formatoInvalido === true, "formato inválido vira alerta");
ok(a.extrairMensagens({ entry: [{ changes: [{ value: { contacts: [{ wa_id: "55", profile: { name: "Ana" } }], messages: [{ id: "x", from: "55", type: "text", text: { body: "oi" } }] } }] }] })[0].nome === "Ana", "extrai nome e texto");
ok(a.ehDomingo(new Date("2026-11-08T12:00:00Z")) && !a.ehDomingo(new Date("2026-11-08T02:00:00Z")), "domingo no fuso de Petrolina");

t = montar();
r = await t.agente.processar({ ...lead, texto: "Obrigado!" });
ok(r.resultado === "agradecimento" && !t.chamadas.some((c) => c.url.includes("anthropic")), "agradecimento não chama a IA");
ok(!a.ehAgradecimento("ok, mas quanto custa?") && a.ehAgradecimento("ok"), "só confirmação curta conta como agradecimento");

globalThis.TRIAGEM = "IGNORAR";
t = montar();
r = await t.agente.processar({ ...lead, texto: "tá certo, até amanhã então" });
ok(r.resultado === "triagem-ignorar" && !t.chamadas.some((c) => c.corpo?.model === "claude-sonnet-5-5"), "triagem IGNORAR não chama o Sonnet");
globalThis.TRIAGEM = "RESPONDER";
