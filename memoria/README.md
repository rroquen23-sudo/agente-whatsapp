# Memória e aprendizado do agente comercial

Código: `lib/memoria.js` (mem0) e `lib/aprendizado.js` (ciclo semanal). Testes: `npm test`.

## Três espaços no mem0

| Espaço | Chave | O que guarda | Quem escreve |
|---|---|---|---|
| Lead | `user_id = lead_<hash>` | Perfil (lazer, investimento, moradia), sonho, empreendimento e lote de interesse, à vista ou financiado, parcela que cabe, quem decide junto, prazo, objeções, origem, visita | O mem0 extrai da conversa, com instruções fechadas |
| Playbook | `agent_id = comercial-playbook` | Táticas de venda que funcionaram, por objeção, perfil e etapa | **Só depois do OK do Roque**, gravado literal |
| Eventos | `agent_id = comercial-eventos` | Resultado de cada contato: abordagem, objeção, etapa antes e depois, se respondeu, motivo de perda | O agente, sem texto de mensagem |

## Blindagem (LGPD)
- O telefone nunca vai ao mem0: vira um hash irreversível (`MEM0_LEAD_SALT`).
- CPF, CNPJ, cartão, e-mail, telefone e RG são removidos em código antes do envio. As instruções de extração também proíbem esses dados.
- Memória do lead expira em 365 dias (`MEM0_RETENCAO_LEAD_DIAS`).
- PARAR ou pedido de exclusão: `esquecerLead` apaga tudo do lead.
- Ana Beatriz, Lúcia e quem pediu PARAR ficam em `NUMEROS_BLOQUEADOS`: sem memória e sem resposta automática. A comparação aceita o número com ou sem o 9 e com ou sem o 55.
- O número de teste do Roque só entra na lista depois que o agente estiver validado.

## Como o agente usa a memória em cada mensagem
1. `contextoLead`: o que já se sabe do cliente.
2. `playbook`: táticas aprovadas para a situação (ex.: "objeção preço, perfil lazer").
3. Monta a resposta com o briefing consolidado + tabela do Drive.
4. `lembrarLead` e `registrarEvento` ao fim da troca.

## Ciclo semanal (toda segunda, 8h)
1. Lê os eventos da semana (`eventosDaSemana`).
2. `analisarSemana`: funil, perdas por motivo, objeções mais frequentes, abordagens que mais avançam de etapa e tempo de resposta.
3. Gera candidatos só com amostra mínima (5 casos) e resultado 10 pontos acima da média:
   - **playbook:** abordagem que mais converte numa objeção;
   - **aposentar:** abordagem sem nenhuma resposta;
   - **régua:** follow-up com menos de 10% de resposta.
4. Manda o relatório ao Roque. Ele responde "aprovo 1,3", "aprovo todos" ou "nenhum".
5. Só os aprovados entram no playbook (`aprovarAprendizado`). Régua e briefing só mudam com o mesmo OK.

## Semente do playbook
`playbook-semente.json`: as objeções do briefing que não estão em conflito. Entra no mem0 depois da decisão do Roque sobre os 12 conflitos.

## Para ligar
Variáveis na Vercel: `MEM0_API_KEY` (app.mem0.ai, plano gratuito serve para começar), `MEM0_LEAD_SALT` (texto aleatório longo, nunca muda), `NUMEROS_BLOQUEADOS` (números da Ana Beatriz e da Lúcia, separados por vírgula).
