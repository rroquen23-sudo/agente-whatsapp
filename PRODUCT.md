# Produto: agente comercial no WhatsApp

## Problema e objetivo

Leads de tráfego pago chegam pelo WhatsApp a qualquer hora e a equipe é enxuta. O agente responde rápido, qualifica e conduz o lead até visita ou proposta, sem nunca afirmar nada fora do briefing e sem expor a empresa juridicamente.

## Público e papéis

- **Lead:** cliente de renda média interessado em lote (Águas do Vale, Expansão, Paraíso Prime), em geral financiado.
- **Roque:** gestor; recebe rascunhos e alertas, aprova aprendizados, informa a condição da semana.
- **Bloqueados:** Ana Beatriz, Lúcia e quem pediu PARAR (`NUMEROS_BLOQUEADOS`): sem memória e sem resposta automática.

## Fluxos implementados

1. Verificação do webhook pela Meta (GET) e recebimento de eventos com assinatura HMAC (POST).
2. **Modo sombra** (`AGENT_ENABLED=true`, `AGENT_MODE=shadow`): para cada mensagem de texto, o agente consulta memória e playbook, gera um rascunho e manda um cartão só para o número do Roque (`ALERTA_WHATSAPP`), com sinais de risco.
3. Atalhos sem IA: domingo (resposta fixa), agradecimento curto, áudio ou mídia (alerta), PARAR/SAIR (opt-out e exclusão da memória), "excluir meus dados" (alerta com prazo de 15 dias).
4. Triagem com Haiku decide se a mensagem pede resposta; na dúvida ou em erro, responde.
5. Memória por lead e playbook no mem0, com hash do telefone, remoção de PII e expiração em 365 dias.
6. Ciclo semanal (`lib/aprendizado.js`): análise determinística dos eventos e candidatos a playbook que só entram com OK do Roque. O agendamento semanal ainda não está ligado.
7. Páginas públicas de privacidade e exclusão de dados (`public/`).

## Fora do escopo (hoje)

- Modo automático (envio direto ao lead): não implementado de propósito.
- Tabela de lotes do Drive e condição da semana: não conectadas; o agente não cita valor, metragem nem disponibilidade.
- Transcrição de áudio, agendamento de visitas, envio de modelos de mensagem.

## Regras

- Assistente virtual do Roque; nunca se passa por humano.
- Escritura: nunca puxar o assunto; se perguntarem, "está em regularização"; insistência vai para o Roque.
- Nunca 2ª via de boleto; CPF só na carta proposta e nunca na memória; desconto e condição de pagamento só o Roque autoriza.
- Sonnet com esforço baixo no texto ao cliente; Haiku só na triagem.

## Restrições técnicas

- Vercel Functions (plano gratuito), `maxDuration` 60 s; processamento em segundo plano com `waitUntil`.
- Sem banco próprio: memória no mem0 hospedado.
- Logs sem texto de mensagem e sem telefone completo.

## Pendências

- IPTU do Águas do Vale: confirmar se R$ 90 a R$ 120 é mensal ou anual.
- Condição da semana (perguntar toda segunda), link do Drive com tabela limpa, nome do posto, canal de alerta, pagamento na WABA, OK dos 8 modelos de mensagem.
- Modo sombra: 3 a 5 dias de validação antes de qualquer decisão sobre automático.

## Critérios de aceite do modo sombra

- Nenhuma mensagem sai para número diferente de `ALERTA_WHATSAPP` (teste "trava dura").
- Kill switch desliga tudo sem chamar nenhuma API.
- Falha de Anthropic, Meta ou mem0 não derruba o webhook nem deixa a função pendurada além do limite.

## Manutenção

Atualize este arquivo quando um fluxo entrar, sair ou mudar de regra. O briefing comercial continua em `briefing/`.
