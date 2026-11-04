// Memória do agente comercial no mem0 (plataforma hospedada, API REST, sem dependências).
// Três espaços separados:
//   1. Lead      -> user_id = "lead_<hash do telefone>"  (perfil, objeções, etapa; nunca dados pessoais sensíveis)
//   2. Playbook  -> agent_id = "comercial-playbook"      (só aprendizados APROVADOS pelo Roque, gravados sem inferência)
//   3. Eventos   -> agent_id = "comercial-eventos"       (resultado de cada contato, sem texto de mensagem; base do ciclo semanal)
import crypto from "node:crypto";

const HOST = process.env.MEM0_HOST || "https://api.mem0.ai";
export const PLAYBOOK_ID = "comercial-playbook";
export const EVENTOS_ID = "comercial-eventos";
export const RETENCAO_LEAD_DIAS = Number(process.env.MEM0_RETENCAO_LEAD_DIAS || 365);

// O que o mem0 pode extrair da conversa de um lead. Tudo fora disso é descartado.
export const INSTRUCOES_LEAD = `Você extrai fatos comerciais de conversas de WhatsApp de uma loteadora (Águas do Vale Empreendimentos).
Grave SOMENTE:
- primeiro nome do cliente e cidade onde mora;
- perfil: lazer, investimento ou moradia; o "sonho" que ele descreveu (ex.: fim de semana com a família no rio);
- empreendimento de interesse (Águas do Vale, Expansão ou Paraíso Prime; "Paraíso do Rio" = Paraíso Prime) e quadra/lote de interesse;
- se pretende pagar à vista ou financiado; faixa de parcela que cabe no mês; se já tem a entrada;
- quem decide junto (cônjuge, família, sócio) e prazo de decisão;
- objeções levantadas (preço, IGP-M, tamanho do lote, distância, documentação, indecisão, outra);
- origem do contato (Instagram, tráfego pago, indicação e quem indicou, placa/visita);
- visita: marcada, realizada, data; preferência de horário e de canal de contato;
- pedido para não ser mais contatado.
NUNCA grave: CPF, RG, CNH, dados bancários, chave PIX, cartão, endereço completo, e-mail, telefone, saldo devedor, parcelas em atraso, situação de pagamento, saúde, religião, política ou qualquer dado de terceiros.
NUNCA grave promessas, valores ou condições ditas pelo atendente: só fatos sobre o cliente.`;

export const CATEGORIAS_LEAD = [
  { perfil: "Lazer, investimento ou moradia e o sonho do cliente" },
  { interesse: "Empreendimento, quadra/lote, à vista ou financiado, parcela que cabe" },
  { decisao: "Quem decide junto e prazo de decisão" },
  { objecao: "Objeções levantadas pelo cliente" },
  { etapa: "Origem, visita e etapa do funil" },
];

// Remove dados pessoais antes de qualquer envio ao mem0 (defesa em código, não só no prompt).
export function limparPII(texto) {
  return String(texto ?? "")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf removido]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[cnpj removido]")
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[número removido]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email removido]")
    .replace(/(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, "[telefone removido]")
    .replace(/\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dxX]\b/g, "[documento removido]");
}

// Telefone nunca vai para o mem0: vira um id estável e irreversível (HMAC com segredo próprio).
export function idLead(telefone, segredo = process.env.MEM0_LEAD_SALT) {
  if (!segredo) throw new Error("MEM0_LEAD_SALT ausente");
  return "lead_" + crypto.createHmac("sha256", segredo).update(chaveTelefone(telefone)).digest("hex").slice(0, 24);
}

// Número brasileiro normalizado para DDD + 8 dígitos. A Meta às vezes entrega o wa_id sem o 9
// (5587988622718 chega como 558788622718), então a comparação ignora o 9 e o 55.
export function chaveTelefone(telefone) {
  let d = String(telefone ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d;
}

// Ana Beatriz, Lúcia e quem pediu PARAR: sem memória, sem resposta automática.
export function bloqueado(telefone, lista = process.env.NUMEROS_BLOQUEADOS) {
  const alvo = chaveTelefone(telefone);
  if (alvo.length < 10) return false;
  return (lista || "").split(",").map(chaveTelefone).some((n) => n === alvo);
}

function dataMais(dias, hoje = new Date()) {
  return new Date(hoje.getTime() + dias * 864e5).toISOString().slice(0, 10);
}

export function criarMemoria({ apiKey = process.env.MEM0_API_KEY, fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) throw new Error("MEM0_API_KEY ausente");
  const chamar = async (metodo, caminho, corpo) => {
    const r = await fetchImpl(HOST + caminho, {
      method: metodo,
      headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    if (!r.ok) throw new Error(`mem0 ${metodo} ${caminho.split("?")[0]} -> ${r.status}`);
    return r.json();
  };

  return {
    // Grava o que se aprendeu sobre o lead nesta conversa. mensagens = [{role, content}].
    async lembrarLead(telefone, mensagens, { empreendimento, etapa } = {}) {
      if (bloqueado(telefone)) return { ignorado: "bloqueado" };
      const limpas = mensagens.map((m) => ({ role: m.role, content: limparPII(m.content) }));
      return chamar("POST", "/v3/memories/add/", {
        messages: limpas,
        user_id: idLead(telefone),
        metadata: { tipo: "lead", empreendimento: empreendimento ?? null, etapa: etapa ?? null },
        custom_instructions: INSTRUCOES_LEAD,
        custom_categories: CATEGORIAS_LEAD,
        expiration_date: dataMais(RETENCAO_LEAD_DIAS),
      });
    },

    // Contexto do lead para montar a próxima resposta.
    async contextoLead(telefone, pergunta, topK = 8) {
      if (bloqueado(telefone)) return [];
      const r = await chamar("POST", "/v3/memories/search/", {
        query: limparPII(pergunta) || "perfil e interesse do cliente",
        filters: { user_id: idLead(telefone) },
        top_k: topK,
      });
      return (r.results ?? r).map((m) => m.memory);
    },

    // PARAR / exclusão de dados (LGPD): apaga tudo do lead.
    async esquecerLead(telefone) {
      return chamar("DELETE", `/v1/memories/?user_id=${encodeURIComponent(idLead(telefone))}`);
    },

    // Táticas aprovadas que servem para a situação atual (ex.: "objeção preço, perfil lazer").
    async playbook(situacao, topK = 5) {
      const r = await chamar("POST", "/v3/memories/search/", {
        query: situacao,
        filters: { agent_id: PLAYBOOK_ID },
        top_k: topK,
      });
      return (r.results ?? r).map((m) => m.memory);
    },

    // Só chamado depois da aprovação do Roque. Grava literal (infer=false), com rastro de quem aprovou e quando.
    async aprovarAprendizado({ texto, objecao = null, perfil = null, etapa = null, origem = "ciclo-semanal", aprovadoEm }) {
      if (!aprovadoEm) throw new Error("aprendizado sem data de aprovação do Roque");
      return chamar("POST", "/v3/memories/add/", {
        messages: [{ role: "user", content: texto }],
        agent_id: PLAYBOOK_ID,
        infer: false,
        metadata: { tipo: "playbook", objecao, perfil, etapa, origem, aprovado_por: "Roque", aprovado_em: aprovadoEm },
      });
    },

    // Resultado de um contato, sem texto de mensagem. Alimenta o relatório semanal.
    async registrarEvento(evento) {
      const e = { ...evento, tipo: "evento" };
      delete e.texto;
      return chamar("POST", "/v3/memories/add/", {
        messages: [{ role: "user", content: `evento ${e.acao ?? ""} ${e.abordagem ?? ""}`.trim() }],
        agent_id: EVENTOS_ID,
        infer: false,
        metadata: e,
      });
    },

    async eventosDaSemana(desdeISO) {
      const r = await chamar("POST", "/v3/memories/?page_size=1000", {
        filters: { AND: [{ agent_id: EVENTOS_ID }, { created_at: { gte: desdeISO } }] },
      });
      return (r.results ?? r).map((m) => m.metadata);
    },
  };
}
