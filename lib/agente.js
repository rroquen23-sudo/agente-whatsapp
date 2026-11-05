// Agente comercial. Hoje só existe o MODO SOMBRA: lê a mensagem, consulta a memória, escreve um rascunho
// e envia o rascunho ao Roque. Nada é enviado ao lead. O modo automático não está implementado de propósito.
//
// Variáveis: AGENT_ENABLED=true (liga), AGENT_MODE=shadow, ANTHROPIC_API_KEY, ALERTA_WHATSAPP (número do Roque
// que recebe os rascunhos), WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID (modelo e esforço são fixos: Sonnet 5.5, esforço baixo).
import { readFileSync } from "node:fs";
import { bloqueado, chaveTelefone, limparPII } from "./memoria.js";

export const MODELO = "claude-sonnet-5-5";
export const ESFORCO = "low";
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

Limites desta fase: a tabela de lotes do Drive AINDA NÃO está conectada e a condição da semana não foi informada. Não cite valor, metragem nem disponibilidade; diga que vai confirmar e use ALERTA_ROQUE. Mensagem curta, uma pergunta só, no máximo um emoji.`;

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

export function criarAgente({ env = process.env, mem, fetchImpl = globalThis.fetch, agora = () => new Date(), briefing } = {}) {
  const modo = env.AGENT_MODE || "shadow";
  const alerta = env.ALERTA_WHATSAPP;

  async function enviar(para, texto) {
    // Trava dura: em modo sombra só o Roque recebe mensagem. O código do modo automático não existe.
    if (modo !== "shadow") throw new Error("modo automático não implementado");
    if (!alerta || chaveTelefone(para) !== chaveTelefone(alerta)) throw new Error("modo sombra: envio ao lead bloqueado");
    const r = await fetchImpl(`${GRAPH}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: String(para).replace(/\D/g, ""), type: "text", text: { body: String(texto).slice(0, 4000) } }),
    });
    if (!r.ok) throw new Error(`whatsapp envio -> ${r.status}`);
  }

  async function gerar(sistema, textoDoLead) {
    const r = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      // Decisão do Roque: todo o atendimento comercial usa Sonnet com esforço baixo.
      body: JSON.stringify({ model: MODELO, max_tokens: 1500, output_config: { effort: ESFORCO }, system: sistema, messages: [{ role: "user", content: textoDoLead }] }),
    });
    if (!r.ok) throw new Error(`anthropic -> ${r.status}`);
    const j = await r.json();
    return (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
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
    if (env.AGENT_ENABLED !== "true") return { resultado: "desligado" };
    if (bloqueado(msg.from)) return { resultado: "bloqueado" };
    if (alerta && chaveTelefone(msg.from) === chaveTelefone(alerta) && env.ALERTA_E_TESTE !== "true") return { resultado: "canal-do-roque" };

    if (await mem.pediuParar(msg.from)) return { resultado: "optout" };

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
    if (msg.tipo !== "text") {
      const extra = msg.tipo === "audio" ? "🎙️ Áudio recebido. A transcrição ainda não está ligada: ouça e responda, ou peça para escrever." : `📎 Mensagem do tipo ${msg.tipo}: o agente só lê texto por enquanto.`;
      await enviar(alerta, cartao({ msg, extra, acao: "ALERTAR_ROQUE" }));
      return { resultado: "nao-texto" };
    }

    const [memoriaLead, playbook] = await Promise.all([
      mem.contextoLead(msg.from, msg.texto).catch(() => []),
      mem.playbook(limparPII(msg.texto)).catch(() => []),
    ]);
    const sistema = montarSistema({ briefing: briefing ?? carregarBriefing(), memoriaLead, playbook, agora: agora() });
    const { acao, mensagem, formatoInvalido } = interpretarResposta(await gerar(sistema, limparPII(msg.texto)));
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
