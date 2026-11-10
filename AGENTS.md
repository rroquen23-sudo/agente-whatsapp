# Agente WhatsApp comercial · Águas do Vale

Webhook do WhatsApp Cloud API na Vercel que lê mensagens de leads, consulta a memória (mem0) e escreve rascunhos para o Roque aprovar. Hoje só existe o **modo sombra**: nada é enviado ao lead.

## Produto e stack

- Escopo e regras de negócio: `PRODUCT.md`. Manual do agente (fonte de verdade comercial): `briefing/briefing-v3.1.md`.
- Stack: Node.js 22 (ESM, `"type": "module"`), Vercel Functions, `fetch` nativo, npm com `package-lock.json`. Única dependência de produção: `@vercel/functions`.
- Mapa: `api/webhook.js` (entrada), `lib/agente.js` (decisão e rascunho), `lib/memoria.js` (mem0 + LGPD), `lib/aprendizado.js` (ciclo semanal), `lib/resiliencia.js` (timeout e retry). Detalhes: `docs/architecture.md`.

## Comandos

- Instalar: `npm ci`
- Testes: `npm test` (scripts em `test/`, saída `ok ...` por caso; falha encerra com código 1)
- Lint: `npm run lint`
- Verificação completa: `npm run check` (lint + testes). Rode antes de todo commit.
- Desenvolvimento local: não há servidor local; teste por `test/` com `fetchImpl` falso. Publicação: `COMO-PUBLICAR.md`.
- Tipos e build: inexistentes (JavaScript puro, sem etapa de build).

## Regras inegociáveis

- `AGENT_ENABLED=false` é o kill switch. Nunca mude o padrão, nunca remova a trava de `enviar()` que só manda ao `ALERTA_WHATSAPP`. Modo automático não existe de propósito.
- LGPD: texto de mensagem nunca vai para log; telefone nunca vai para o mem0 nem para a IA (hash com `MEM0_LEAD_SALT`, `limparPII`). CPF nunca na memória.
- Modelo do atendimento: Sonnet com esforço baixo (decisão do Roque); Haiku só em tarefas internas (triagem). Não troque sem pedido explícito.
- Nada fora do briefing é afirmado ao cliente. Mudanças no briefing, na régua ou no playbook só com OK do Roque.
- Segredos só em variáveis de ambiente (Vercel). Nunca em código, teste, doc ou chat. `.env.example` lista os nomes.
- Publicar na Vercel, mandar mensagem real ou ligar o agente exige pedido explícito do Roque.

## Como trabalhar

- Leia o código e este arquivo antes de editar. Separe fato observado de suposição.
- Menor mudança completa (regra Ponytail `full`): reuse padrões e módulos existentes, sem dependência nova sem motivo.
- Defina critério de aceite e teste antes de implementar. Correção de bug: teste que falha antes e passa depois.
- Toda chamada externa recebe `fetchImpl` por injeção e passa por `lib/resiliencia.js`; teste com `fetch` falso, nunca com a API real.
- Atualize o documento responsável junto com a mudança: escopo em `PRODUCT.md`, estrutura em `docs/architecture.md`, checagens em `docs/quality.md`, ferramentas e decisões de setup em `docs/setup.md`.
- Trabalho inacabado entre sessões: `docs/handoff.md`. Ao retomar, confira git, arquivos e `npm run check` antes de confiar nele.
- Conversa no idioma do usuário (português), direta (Caveman). Código, docs e commits com redação normal; commits em Conventional Commits.

## Ferramentas

- Superpowers: brainstorming antes de mudar comportamento; TDD em correções; verificação antes de dizer que terminou.
- Revisão de segurança: `docs/prompts/security-review.md` ou o plugin claude-security. Relatório fica privado, fora do repositório.
- omniout: referência para retries, timeouts e fallback de modelo nas chamadas de IA.
- Context7, RTK e Graphify não estão disponíveis neste projeto (ver `docs/setup.md`); use documentação oficial.
- Delegação: só quando isolar contexto ou paralelizar compensa. Buscas e mudanças mecânicas em modelo leve; segurança, LGPD e revisão crítica com capacidade maior. Um escritor por arquivo; revisores só leem.
