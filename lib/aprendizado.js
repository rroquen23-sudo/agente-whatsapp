// Ciclo semanal de aprendizado. Determinístico: números da semana -> candidatos -> Roque aprova -> playbook.
// Nada aqui altera a régua ou o playbook sozinho.
//
// Evento (um por contato do agente, sem texto de mensagem):
// { acao, abordagem, objecao, perfil, empreendimento, origem, etapa_antes, etapa_depois,
//   respondeu: bool, horas_ate_resposta, motivo_perda }

export const AMOSTRA_MINIMA = 5;
const ORDEM = ["Novo", "Proposta", "Visita", "Aguardando sinal", "Fechou"];
const avancou = (e) => ORDEM.indexOf(e.etapa_depois) > ORDEM.indexOf(e.etapa_antes) && ORDEM.indexOf(e.etapa_antes) >= 0;
const pct = (a, n) => (n ? Math.round((100 * a) / n) : 0);

function agrupar(eventos, chave) {
  const g = new Map();
  for (const e of eventos) {
    const k = e[chave];
    if (!k) continue;
    const s = g.get(k) ?? { n: 0, respostas: 0, avancos: 0 };
    s.n++; if (e.respondeu) s.respostas++; if (avancou(e)) s.avancos++;
    g.set(k, s);
  }
  return g;
}

export function analisarSemana(eventos) {
  const total = eventos.length;
  const avancos = eventos.filter(avancou).length;
  const funil = Object.fromEntries(ORDEM.map((et) => [et, eventos.filter((e) => e.etapa_depois === et && e.etapa_antes !== et).length]));
  funil.Perdido = eventos.filter((e) => e.etapa_depois === "Perdido").length;

  const motivos = {};
  for (const e of eventos) if (e.etapa_depois === "Perdido") motivos[e.motivo_perda || "Outro"] = (motivos[e.motivo_perda || "Outro"] ?? 0) + 1;

  const objecoes = [...agrupar(eventos, "objecao")].sort((a, b) => b[1].n - a[1].n);
  const abordagens = [...agrupar(eventos, "abordagem")].sort((a, b) => pct(b[1].avancos, b[1].n) - pct(a[1].avancos, a[1].n));

  const tempos = eventos.map((e) => e.horas_ate_resposta).filter((h) => typeof h === "number").sort((a, b) => a - b);
  const medianaHoras = tempos.length ? tempos[Math.floor(tempos.length / 2)] : null;

  return { total, taxaAvanco: pct(avancos, total), funil, motivos, objecoes, abordagens, medianaHoras, candidatos: candidatos(eventos, pct(avancos, total)) };
}

// Candidatos a aprendizado. Só com amostra mínima e diferença clara sobre a média.
export function candidatos(eventos, base) {
  const out = [];
  const porObjecao = new Map();
  for (const e of eventos) if (e.objecao && e.abordagem) {
    const l = porObjecao.get(e.objecao) ?? []; l.push(e); porObjecao.set(e.objecao, l);
  }
  for (const [objecao, evs] of porObjecao) {
    const melhor = [...agrupar(evs, "abordagem")].filter(([, s]) => s.n >= AMOSTRA_MINIMA)
      .sort((a, b) => pct(b[1].avancos, b[1].n) - pct(a[1].avancos, a[1].n))[0];
    if (melhor && pct(melhor[1].avancos, melhor[1].n) >= base + 10) {
      out.push({ tipo: "playbook", objecao, abordagem: melhor[0],
        texto: `Objeção "${objecao}": usar a abordagem "${melhor[0]}" (avançou ${melhor[1].avancos} de ${melhor[1].n}, média geral ${base}%).` });
    }
  }
  for (const [abordagem, s] of agrupar(eventos, "abordagem")) {
    if (s.n >= AMOSTRA_MINIMA && s.respostas === 0) {
      out.push({ tipo: "aposentar", abordagem, texto: `Abordagem "${abordagem}": ${s.n} envios e nenhuma resposta. Sugiro parar de usar ou reescrever.` });
    }
  }
  for (const [passo, s] of agrupar(eventos.filter((e) => e.acao === "follow_up"), "abordagem")) {
    if (s.n >= 2 * AMOSTRA_MINIMA && pct(s.respostas, s.n) < 10) {
      out.push({ tipo: "regua", abordagem: passo, texto: `Régua: o follow-up "${passo}" teve ${pct(s.respostas, s.n)}% de resposta em ${s.n} envios. Sugiro mudar o texto ou o dia.` });
    }
  }
  return out;
}

export function relatorioTexto(a, semana) {
  const linhas = [`*Agente comercial · semana ${semana}*`, ""];
  linhas.push(`Contatos: ${a.total} · avançaram de etapa: ${a.taxaAvanco}%` + (a.medianaHoras != null ? ` · resposta do cliente (mediana): ${a.medianaHoras}h` : ""));
  linhas.push(`Funil: ${Object.entries(a.funil).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  if (Object.keys(a.motivos).length) linhas.push(`Perdas: ${Object.entries(a.motivos).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  if (a.objecoes.length) linhas.push(`Objeções: ${a.objecoes.slice(0, 5).map(([k, s]) => `${k} ${s.n}`).join(" · ")}`);
  if (a.abordagens.length) linhas.push(`Melhores abordagens: ${a.abordagens.slice(0, 3).map(([k, s]) => `${k} ${pct(s.avancos, s.n)}% (${s.n})`).join(" · ")}`);
  linhas.push("");
  if (!a.candidatos.length) {
    linhas.push("Sem aprendizado novo com amostra suficiente esta semana. Nada muda.");
  } else {
    linhas.push("*Ajustes sugeridos (só entram com o seu OK):*");
    a.candidatos.forEach((c, i) => linhas.push(`${i + 1}. ${c.texto}`));
    linhas.push("", 'Responda "aprovo 1,3" (ou "aprovo todos" / "nenhum").');
  }
  return linhas.join("\n");
}

// "aprovo 1, 3" -> [1,3]; "aprovo todos" -> todos; qualquer outra coisa -> [].
export function lerAprovacao(texto, quantidade) {
  const t = String(texto ?? "").toLowerCase().trim();
  if (!t.startsWith("aprovo")) return [];
  if (/\btodos\b/.test(t)) return Array.from({ length: quantidade }, (_, i) => i + 1);
  return [...new Set((t.match(/\d+/g) ?? []).map(Number).filter((n) => n >= 1 && n <= quantidade))];
}
