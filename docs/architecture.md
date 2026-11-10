# Código e arquitetura

## Stack real

Node.js 22 (ESM) em Vercel Functions. `fetch` nativo para Meta Graph API (v21.0), Anthropic Messages API e mem0 (`api.mem0.ai`). Dependência de produção: `@vercel/functions` (`waitUntil`). Dev: ESLint. Sem banco, sem build.

## Mapa do código

| Arquivo | Responsabilidade |
|---|---|
| `api/webhook.js` | GET de verificação; POST valida assinatura `x-hub-signature-256`, registra só o resumo do evento e, com `AGENT_ENABLED=true`, agenda o processamento com `waitUntil` |
| `lib/agente.js` | Regras de entrada (bloqueio, PARAR, domingo, agradecimento, mídia), triagem (Haiku), rascunho (Sonnet), sinais de risco, cartão ao Roque e trava de envio |
| `lib/memoria.js` | Cliente mem0: memória do lead, playbook, eventos, opt-out; hash do telefone, `limparPII`, `bloqueado` |
| `lib/aprendizado.js` | Análise semanal determinística e candidatos a playbook |
| `lib/resiliencia.js` | `fetchComResiliencia` (timeout por tentativa incluindo a leitura do corpo, retry com backoff só em transitórios, prazo), `comFallback` (troca de modelo) e `ate` (corta etapa no prazo) |
| `scripts/semear-playbook.mjs` | Grava o playbook inicial no mem0 (execução manual) |
| `briefing/` | Manual do agente; entra no prompt e no bundle (`vercel.json` → `includeFiles`) |
| `public/` | Páginas estáticas de privacidade e exclusão de dados |
| `test/` | Testes com `fetch` falso, um arquivo por módulo |

## Fronteiras e fluxo

```
Meta ──POST──▶ api/webhook.js ──assinatura ok──▶ 200 imediato
                     │ AGENT_ENABLED=true
                     ▼ waitUntil
               lib/agente.js ──▶ lib/memoria.js ──▶ mem0
                     │  triagem (Haiku) / rascunho (Sonnet) ──▶ Anthropic
                     ▼
               enviar() ──só ALERTA_WHATSAPP──▶ Graph API ──▶ WhatsApp do Roque
```

Fronteiras de confiança: o corpo da Meta só é lido depois da assinatura; o texto do lead é limpo de PII antes de ir para IA ou memória; a saída da IA é tratada como rascunho e passa por `avaliarRisco` antes de chegar ao Roque.

Todas as chamadas externas passam por `fetchComResiliencia`. Cada mensagem tem um prazo de 38 s (`ORCAMENTO_MS`) para memória e IA; timeouts e esperas encolhem para caber nele. O envio ao Roque fica fora do prazo, com reserva de até 21 s, e só repete em 429 (5xx ou timeout podem já ter entregue). Pior caso: cerca de 59 s, dentro dos 60 s da função. Mensagens em lote são processadas em série e podem não caber (achado F4 da revisão de segurança).

## Dados

Sem migrações. Dados pessoais ficam só no mem0, indexados por `lead_<hash>`; expiração de 365 dias; opt-out apaga a memória do lead. Detalhes em `memoria/README.md`.

## Decisões

- 04/11/2026: Vercel gratuita para o webhook (escolha do Roque); migrar se o tempo por requisição apertar.
- 04/11/2026: número novo só do agente via Cloud API; número pessoal do Roque intacto.
- 05/11/2026: Sonnet esforço baixo no atendimento; Haiku na triagem.
- 10/11/2026: timeout e retry centralizados em `lib/resiliencia.js`; sem fallback de modelo no rascunho (o texto ao cliente é sempre Sonnet). Na triagem, erro continua significando "responder".

## Manutenção

Atualize o mapa e o fluxo quando um módulo, uma integração externa ou uma fronteira mudar.
