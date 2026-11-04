process.env.MEM0_LEAD_SALT = "sal-teste";
process.env.NUMEROS_BLOQUEADOS = "87999990001,87999990002";
const m = await import(new URL("../lib/memoria.js", import.meta.url));
const a = await import(new URL("../lib/aprendizado.js", import.meta.url));
const ok = (c, msg) => { if (!c) { console.error("FAIL", msg); process.exit(1); } console.log("ok", msg); };

// PII
const sujo = "meu cpf é 123.456.789-09, email joao@x.com, fone (87) 99999-1234, cartão 4111 1111 1111 1111";
const limpo = m.limparPII(sujo);
ok(!/123\.456|joao@|99999-1234|4111/.test(limpo), "limparPII remove CPF, email, telefone e cartão");
ok(m.limparPII("quero lote de 10x20 e parcela de 500 reais").includes("10x20"), "limparPII preserva texto comercial");

// id do lead
ok(m.idLead("+55 87 98888-7777") === m.idLead("5587988887777"), "idLead estável independente de formatação");
ok(!m.idLead("5587988887777").includes("8887777"), "idLead não expõe o telefone");
ok(m.bloqueado("5587999990001") && !m.bloqueado("5587988887777"), "lista de bloqueio (Ana Beatriz e Lúcia)");

// chamadas ao mem0 com fetch simulado
const chamadas = [];
const fetchImpl = async (url, init) => { chamadas.push({ url, ...init, corpo: init.body && JSON.parse(init.body) }); return { ok: true, json: async () => ({ results: [{ memory: "perfil lazer" }] }) }; };
const mem = m.criarMemoria({ apiKey: "k", fetchImpl });

await mem.lembrarLead("5587988887777", [{ role: "user", content: "meu cpf 123.456.789-09, quero lazer com a família" }], { empreendimento: "Águas do Vale" });
let c = chamadas.at(-1);
ok(c.url.endsWith("/v3/memories/add/") && c.corpo.user_id.startsWith("lead_"), "lembrarLead grava por lead");
ok(!JSON.stringify(c.corpo).includes("123.456") && !JSON.stringify(c.corpo).includes("88887777"), "nada de CPF ou telefone no payload");
ok(c.corpo.custom_instructions && c.corpo.expiration_date, "instruções de extração e retenção enviadas");
ok(c.headers.Authorization === "Token k", "autenticação no formato do mem0");

const n = chamadas.length;
ok((await mem.lembrarLead("5587999990001", [{ role: "user", content: "oi filho" }])).ignorado === "bloqueado" && chamadas.length === n, "bloqueado não vai para a memória");

ok((await mem.contextoLead("5587988887777", "quanto custa"))[0] === "perfil lazer", "contextoLead devolve memórias");
ok(chamadas.at(-1).corpo.filters.user_id.startsWith("lead_"), "busca filtrada pelo lead");

await mem.esquecerLead("5587988887777");
ok(chamadas.at(-1).method === "DELETE" && chamadas.at(-1).url.includes("user_id=lead_"), "PARAR apaga a memória do lead");

let erro = null; try { await mem.aprovarAprendizado({ texto: "x" }); } catch (e) { erro = e; }
ok(erro, "playbook recusa aprendizado sem aprovação");
await mem.aprovarAprendizado({ texto: "Na objeção preço, perguntar quanto cabe por mês", objecao: "preço", aprovadoEm: "2026-11-09" });
c = chamadas.at(-1);
ok(c.corpo.agent_id === m.PLAYBOOK_ID && c.corpo.infer === false && c.corpo.metadata.aprovado_por === "Roque", "playbook grava literal com rastro de aprovação");

await mem.registrarEvento({ acao: "follow_up", abordagem: "d2", texto: "segredo" });
ok(!JSON.stringify(chamadas.at(-1).corpo).includes("segredo"), "evento não leva texto de mensagem");

// ciclo semanal
const ev = [];
for (let i = 0; i < 6; i++) ev.push({ abordagem: "quanto-cabe-por-mes", objecao: "preço", etapa_antes: "Proposta", etapa_depois: i < 4 ? "Visita" : "Proposta", respondeu: true });
for (let i = 0; i < 6; i++) ev.push({ abordagem: "mostrar-valor-total", objecao: "preço", etapa_antes: "Proposta", etapa_depois: "Proposta", respondeu: i < 2 });
for (let i = 0; i < 10; i++) ev.push({ acao: "follow_up", abordagem: "d10-encerramento", etapa_antes: "Proposta", etapa_depois: i < 2 ? "Perdido" : "Proposta", motivo_perda: "Sem retorno", respondeu: false });
const an = a.analisarSemana(ev);
ok(an.candidatos.some((x) => x.tipo === "playbook" && x.abordagem === "quanto-cabe-por-mes"), "detecta abordagem que converte melhor na objeção");
ok(an.candidatos.some((x) => x.tipo === "aposentar" && x.abordagem === "d10-encerramento"), "detecta abordagem sem resposta");
ok(an.candidatos.some((x) => x.tipo === "regua"), "sugere ajuste de régua com baixa resposta");
ok(!an.candidatos.some((x) => x.abordagem === "mostrar-valor-total" && x.tipo === "playbook"), "não promove abordagem fraca");
ok(a.analisarSemana(ev.slice(0, 3)).candidatos.length === 0, "amostra pequena não gera aprendizado");
const txt = a.relatorioTexto(an, "09/11 a 15/11");
ok(txt.includes("aprovo") && txt.includes("Perdas: Sem retorno 2"), "relatório com funil, perdas e pedido de aprovação");
ok(JSON.stringify(a.lerAprovacao("Aprovo 1, 3", 3)) === "[1,3]" && a.lerAprovacao("aprovo todos", 2).length === 2 && a.lerAprovacao("nenhum", 3).length === 0 && a.lerAprovacao("aprovo 9", 3).length === 0, "lê a aprovação do Roque");
