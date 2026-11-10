# Design e acessibilidade

## Direção

O produto é conversa no WhatsApp: o "design" principal é o tom das mensagens, definido no briefing (`briefing/briefing-v3.1.md`): curto (até 3 frases), uma pergunta por vez, no máximo um emoji, assistente virtual do Roque.

## Interface existente

Só duas páginas estáticas em `public/` (privacidade e exclusão de dados): HTML sem JavaScript, `lang="pt-BR"`, `viewport` para celular, cor da marca `#0E4D5C`. Não há sistema de componentes; critérios visuais além dessas páginas não se aplicam.

## Revisão

Ao mudar as páginas: conferir contraste do texto, títulos em ordem, leitura no celular e data de "Última atualização". Ao mudar o cartão do Roque (`cartao()` em `lib/agente.js`): manter a mensagem do lead, o rascunho, os sinais e o aviso "Modo sombra: nada foi enviado ao cliente".

## Manutenção

Mudança de tom ou de regra de conversa vai para o briefing, com OK do Roque, não para este arquivo.
