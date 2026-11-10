// Agente comercial. Hoje só existe o MODO SOMBRA: lê a mensagem, consulta a memória, escreve um rascunho
// e envia o rascunho ao Roque. Nada é enviado ao lead. O modo automático não está implementado de propósito.
//
// Variáveis: AGENT_ENABLED=true (liga), AGENT_MODE=shadow, ANTHROPIC_API_KEY, ALERTA_WHATSAPP (número do Roque
// que recebe os rascunhos), WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID (modelo e esforço são fixos: Sonnet 5.5, esforço baixo).
import { readFileSync } from "node:fs";
import { bloqueado, chaveTelefone, limparPII } from "./memoria.js";
import { ate, comFallback, fetchComResiliencia } from "./resiliencia.js";

export const MODELO = "claude-sonnet-5-5";
export const ESFORCO = "low";
// Tarefas internas simples (triagem) usam o Haiku. O texto que o cliente lê é sempre do Sonnet.
export const MODELO_TRIAGEM = "claude-haiku-5-5";
// Ordem de modelos. Rascunho: só Sonnet (o texto ao cliente nunca sai de outro modelo).
// Triagem: Haiku e, se ele estiver fora, Sonnet. Se todos caírem, a triagem responde.
export const MODELOS_RASCUNHO = [MODELO];
export const MODELOS_TRIAGEM = [MODELO_TRIAGEM, MODELO];
// Orçamento dentro dos 60 s da função (vercel.json): memória e IA têm até ORCAMENTO_MS desde o início da
// mensagem; a reserva (pior caso do envio: 8 s + 5 s de espera + 8 s) garante o cartão ou o alerta ao Roque.
export const ORCAMENTO_MS = 38000;
const LIMITES = {
  triagem: { timeoutMs: 8000, tentativas: 2 },
  rascunho: { timeoutMs: 20000, tentativas: 2 },
  // Envio não é idempotente: só repete 429 (a Meta recusou, nada foi entregue). Timeout ou 5xx não repetem.
  whatsapp: { timeoutMs: 8000, tentativas: 2, statusRepetiveis: new Set([429]), repetirRede: false },
};
const GRAPH = "https://graph.facebook.com/v21.0";
const RESPOSTA_DOMINGO = "Hoje é domingo e não estamos atendendo. Retornamos na segunda-feira. Sua mensagem está registrada.";

let briefingCache;
export function carregarBriefing() {
  briefingCache ??= readFileSync(new URL("../briefing/briefing-v3.1.md", import.meta.url), "utf8");
  return briefingCache;
}

// Petrolina/Recife: UTC-3, sem horário de verão.
export function ehDomingo(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600e3).getUTCDay() === 0;
}

export function ehPedidoParar(texto) {
  return /^\s*(parar|sair|pare|stop)\s*[.!]*\s*$/i.test(String(texto ?? ""));
}
// Agradecimentos e confirmações curtas não precisam de IA: economiza chamada e evita resposta desnecessária.
export function ehAgradecimento(texto) {
  return /^\s*(ok|okay|obrigad[oa]s?|valeu|blz|beleza|certo|combinado|tudo bem|tá bom|ta bom|👍|🙏)[\s.!]*$/i.test(String(texto ?? ""));
}
export function ehPedidoExclusao(texto) {
  return /excluir\s+(meus\s+)?dados/i.test(String(texto ?? ""));
}

// Extrai as mensagens do evento da Meta. O texto fica só em memória: nunca vai para log.
export function extrairMensagens(body) {
  const out = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      for (const m of v.messages ?? []) {
        const nome = (v.contacts ?? []).find((c) => c.wa_id === m.from)?.profile?.name ?? null;
        out.push({ id: m.id, from: String(m.from ?? ""), tipo: m.type, texto: m.type === "text" ? m.text?.body ?? "" : "", nome });
      }
    }
  }
  return out;
}

// Sinais que o Roque precisa ver antes de aprovar um rascunho. No modo automático, qualquer sinal bloquearia o envio.
export function avaliarRisco(rascunho, mensagemDoLead) {
  const r = String(rascunho ?? ""), m = String(mensagemDoLead ?? "");
  const sinais = [];
  if (/escritur|regulariz|registro de im|matr[ií]cula/i.test(r) && !/escritur|regulariz|registro|document|matr[ií]cula/i.test(m)) sinais.push("falou de escritura sem o cliente perguntar");
  if (/garant(e|o|ido|ida|imos|ia)\b|rentabilid|valoriza[çc]|lucro|retorno financeiro/i.test(r)) sinais.push("promessa de ganho ou garantia");
  if (/R\$\s?\d/.test(r)) sinais.push("citou valor: conferir com a tabela e a condição da semana");
  if (/\b(CPF|RG|CNH)\b/i.test(r)) sinais.push("citou documento pessoal");
  if (/sou (o )?roque\b|sou (uma )?pessoa|sou humano|sou (um )?atendente humano/i.test(r)) sinais.push("pode estar se passando por humano ou pelo Roque");
  if (/2[ªa]\s*via|segunda via/i.test(r) && !/n[ãa]o/i.test(r)) sinais.push("mencionou 2ª via");
  if (/desconto|parcel(a|as) de|entrada de/i.test(r)) sinais.push("condição de pagamento: só o Roque autoriza");
  return sinais;
}

export function interpretarResposta(texto) {
  const t = String(texto ?? "").trim();
  const m = t.match(/^ACAO:\s*(RESPONDER|ALERTAR_ROQUE)\s*\n+-{3,}\s*\n?([\s\S]*)$/i);
  if (!m) return { acao: "ALERTAR_ROQUE", mensagem: t, formatoInvalido: true };
  return { acao: m[1].toUpperCase(), mensagem: m[2].trim() };
}

const REGRAS_SOMBRA = `MODO SOMBRA: o que você escrever será lido pelo Roque antes de qualquer envio. Escreva exatamente a mensagem que mandaria ao cliente.
Responda SEMPRE neste formato, sem nada antes:
ACAO: RESPONDER
---
<mensagem ao cliente>

Se o caso exigir o Roque (seção 8 do briefing), use:
ACAO: ALERTAR_ROQUE
---
<mensagem de espera ao cliente, curta, e na linha seguinte "Motivo: ..." para o Roque>

Limites desta fase: a tabela de lotes do Drive AINDA NÃO está conectada e a condição da semana não foi informada. Não cite valor, metragem nem disponibilidade; diga que vai confirmar e use ALERTA_ROQUE. Mensagem curta (até 3 frases), uma pergunta só, no máximo um emoji.`;

// Duas partes: o bloco fixo (briefing + regras) vai para o cache da Anthropic e custa cerca de 10% nas
// mensagens seguintes; o bloco variável (hora, memória do lead, playbook) vem depois, fora do cache.
export function montarSistema({ briefing, memoriaLead, playbook, agora = new Date() }) {
  const bloco = (titulo, itens) => (itens?.length ? `\n\n## ${titulo}\n${itens.map((i) => `- ${i}`).join("\n")}` : "");
  const dia = new Intl.DateTimeFormat("pt-BR", { weekday: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Recife" }).format(agora);
  return [
    { type: "text", text: `${briefing}\n\n---\n${REGRAS_SOMBRA}`, cache_control: { type: "ephemeral" } },
    { type: "text", text: `Agora é ${dia} (horário de Petrolina).${bloco("O que já sabemos deste cliente (memória)", memoriaLead)}${bloco("Táticas aprovadas pelo Roque", playbook)}` },
  ];
}

export function criarAgente({ env = process.env, mem, fetchImpl = globalThis.fetch, agora = () => new Date(), briefing, dormir, orcamentoMs = ORCAMENTO_MS } = {}) {
  const modo = env.AGENT_MODE || "shadow";
  const alerta = env.ALERTA_WHATSAPP;
  const http = (rotulo, url, init, prazo) => fetchComResiliencia(fetchImpl, url, init, { rotulo, dormir, prazo, ...LIMITES[rotulo] });
  const anthropic = (rotulo, corpo, prazo) => http(rotulo, "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(corpo),
  }, prazo);
  const textoDe = ({ dados }) => (dados?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");

  async function enviar(para, texto) {
    // Trava dura: em modo sombra só o Roque recebe mensagem. O código do modo automático não existe.
    if (modo !== "shadow") throw new Error("modo automático não implementado");
    if (!alerta || chaveTelefone(para) !== chaveTelefone(alerta)) throw new Error("modo sombra: envio ao lead bloqueado");
    await http("whatsapp", `${GRAPH}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: String(para).replace(/\D/g, ""), type: "text", text: { body: String(texto).slice(0, 4000) } }),
    });
  }

  async function gerar(sistema, textoDoLead, prazo) {
    // Decisão do Roque: todo o atendimento comercial usa Sonnet com esforço baixo.
    return comFallback(MODELOS_RASCUNHO, async (model) => textoDe(await anthropic("rascunho", {
      model, max_tokens: 600, output_config: { effort: ESFORCO }, system: sistema, messages: [{ role: "user", content: textoDoLead }],
    }, prazo)));
  }

  // Haiku decide se a mensagem pede resposta. Na dúvida ou em erro, responde (nunca deixa cliente no vácuo).
  async function precisaResponder(texto, prazo) {
    try {
      const t = await comFallback(MODELOS_TRIAGEM, async (model) => textoDe(await anthropic("triagem", {
        model, max_tokens: 300, output_config: { effort: "low" },
        system: "Você faz triagem de mensagens de WhatsApp recebidas por uma loteadora. Responda com UMA palavra: RESPONDER se a mensagem faz pergunta, pede algo, demonstra interesse ou precisa de retorno; IGNORAR se for só agradecimento, confirmação, despedida ou emoji sem pedido. Na dúvida, RESPONDER.",
        messages: [{ role: "user", content: limparPII(texto) }],
      }, prazo)));
      return !/\bIGNORAR\b/.test(t.toUpperCase());
    } catch {
      return true;
    }
  }

  function cartao({ msg, rascunho, acao, sinais, extra }) {
    const quem = `${msg.nome ?? "Sem nome"} (final ${msg.from.slice(-4)})`;
    const linhas = [`📩 *${quem}* escreveu:`, msg.texto ? `“${msg.texto}”` : `[${msg.tipo}]`, ""];
    if (extra) linhas.push(extra, "");
    if (rascunho) linhas.push(acao === "ALERTAR_ROQUE" ? "🔔 *Precisa de você.* Rascunho de espera:" : "✍️ *Rascunho:*", rascunho, "");
    if (sinais?.length) linhas.push("⚠️ " + sinais.join("\n⚠️ "), "");
    linhas.push("_Modo sombra: nada foi enviado ao cliente._");
    return linhas.join("\n");
  }

  async function processar(msg) {
    const prazo = Date.now() + orcamentoMs;
    if (env.AGENT_ENABLED !== "true") return { resultado: "desligado" };
    if (bloqueado(msg.from)) return { resultado: "bloqueado" };
    if (alerta && chaveTelefone(msg.from) === chaveTelefone(alerta) && env.ALERTA_E_TESTE !== "true") return { resultado: "canal-do-roque" };

    if (await ate(prazo, mem.pediuParar(msg.from), { rotulo: "mem0 optout" })) return { resultado: "optout" };

    if (msg.tipo === "text" && ehPedidoParar(msg.texto)) {
      await mem.registrarOptOut(msg.from);
      await enviar(alerta, cartao({ msg, rascunho: "Tudo certo, não vou mais enviar mensagens. Obrigado pela atenção!", extra: "🛑 Pediu PARAR: memória apagada e bloqueio registrado." }));
      return { resultado: "parar" };
    }
    if (msg.tipo === "text" && ehPedidoExclusao(msg.texto)) {
      await enviar(alerta, cartao({ msg, extra: "🗑️ Pediu EXCLUIR MEUS DADOS. Prazo de 15 dias para atender. Abra o caso." , acao: "ALERTAR_ROQUE" }));
      return { resultado: "exclusao" };
    }
    if (ehDomingo(agora())) {
      await enviar(alerta, cartao({ msg, rascunho: RESPOSTA_DOMINGO, extra: "📅 Domingo: resposta fixa, sem follow-up." }));
      return { resultado: "domingo" };
    }
    if (msg.tipo === "text" && ehAgradecimento(msg.texto)) {
      await enviar(alerta, cartao({ msg, extra: "👍 Só uma confirmação ou agradecimento. Sem rascunho (economiza IA). Responda você se quiser." }));
      return { resultado: "agradecimento" };
    }
    if (msg.tipo !== "text") {
      const extra = msg.tipo === "audio" ? "🎙️ Áudio recebido. A transcrição ainda não está ligada: ouça e responda, ou peça para escrever." : `📎 Mensagem do tipo ${msg.tipo}: o agente só lê texto por enquanto.`;
      await enviar(alerta, cartao({ msg, extra, acao: "ALERTAR_ROQUE" }));
      return { resultado: "nao-texto" };
    }

    if (!(await precisaResponder(msg.texto, prazo))) {
      await enviar(alerta, cartao({ msg, extra: "👍 A triagem entendeu que não precisa de resposta (agradecimento ou confirmação). Responda você se quiser." }));
      return { resultado: "triagem-ignorar" };
    }

    const [memoriaLead, playbook] = await Promise.all([
      ate(prazo, mem.contextoLead(msg.from, msg.texto, 5), { rotulo: "mem0 lead" }).catch(() => []),
      ate(prazo, mem.playbook(limparPII(msg.texto), 3), { rotulo: "mem0 playbook" }).catch(() => []),
    ]);
    const sistema = montarSistema({ briefing: briefing ?? carregarBriefing(), memoriaLead, playbook, agora: agora() });
    let bruto;
    try {
      bruto = await gerar(sistema, limparPII(msg.texto), prazo);
    } catch (e) {
      // IA fora do ar ou chave inválida: o Roque assume o lead em vez de ninguém responder.
      await enviar(alerta, cartao({ msg, acao: "ALERTAR_ROQUE", extra: `🚨 IA indisponível (${String(e.message).slice(0, 60)}). Responda você este cliente.` }));
      return { resultado: "ia-indisponivel" };
    }
    const { acao, mensagem, formatoInvalido } = interpretarResposta(bruto);
    const sinais = avaliarRisco(mensagem, msg.texto);
    if (formatoInvalido) sinais.push("resposta fora do formato esperado");
    await enviar(alerta, cartao({ msg, rascunho: mensagem, acao, sinais }));

    // Só o que o cliente disse vai para a memória (nunca o rascunho), sem PII.
    await mem.lembrarLead(msg.from, [{ role: "user", content: msg.texto }]).catch(() => {});
    await mem.registrarEvento({ acao: "rascunho", abordagem: acao === "ALERTAR_ROQUE" ? "alerta" : "resposta", respondeu: true, sinais: sinais.length }).catch(() => {});
    return { resultado: "rascunho", acao, sinais };
  }

  return { processar, enviar };
}
