# Qualidade

## Comandos

| Comando | O que prova |
|---|---|
| `npm run lint` | ESLint 10 (`eslint.config.mjs`): `js.configs.recommended`, `eqeqeq`, variáveis sem uso e `quality/max-lines` (350 linhas) |
| `npm run lint:rules` | Autoteste das regras `quality/*` copiadas do toolkit (`eslint-rules/verify.mjs`) |
| `npm test` | 4 suítes em `test/` com `fetch` falso: webhook, memória/LGPD, agente (modo sombra, trava de envio, resiliência) e `lib/resiliencia.js` |
| `npm run check` | Os três acima. Rode antes de todo commit e depois de qualquer mudança em `lib/` ou `api/` |

Não há tipos nem build (JavaScript puro, Vercel sem etapa de build). Não há CI: as checagens são comandos explícitos; criar um workflow do GitHub Actions é proposta pendente, não requisito.

## Regras de base

- Arquivo com mais de 350 linhas é erro de lint. Hoje o maior é `lib/agente.js` (~230).
- Sem `console` de texto de mensagem ou telefone completo: os logs usam só tipo, id e os 4 últimos dígitos.
- Toda chamada externa usa `fetchComResiliencia` (timeout + retry só em transitórios) e recebe `fetchImpl` por injeção.
- Regra nova com violação antiga entra como `warn` com contagem e plano; sem violação, `error`. Na adoção (10/11/2026) havia 0 violações, por isso tudo está em `error`.

## Estratégia de testes

- Teste o comportamento e as travas: kill switch, envio só ao Roque, bloqueados, PARAR, domingo, sinais de risco, PII fora da IA e da memória, retry/fallback.
- Correção de bug começa com o teste que falha.
- Nada de API real em teste. Os testes simulam respostas (200, 429, 5xx, 401, timeout) no `fetchImpl`.
- Teste ponta a ponta com a Meta real só pelo navegador do Roque (o ambiente de nuvem não alcança `*.vercel.app`).

## Harness (método nativo inspirado no Harness2)

- Modo: adaptação nativa (prompt 15 do toolkit, revisão 790a895). Não executa o framework Harness2 nem benchmarks.
- Smoke cases (prompt 14) rodados em 10/11/2026 por um subagente novo, só lendo o repositório: resultados em `docs/setup.md`. Um subagente novo não prova reinício do cliente.
- Quando repetir: depois de mudar `AGENTS.md`, `CLAUDE.md`, skills de `.claude/skills/` ou o fluxo de comandos. Uma comparação baseline × candidato por falha observada, em cópia descartável, sem afrouxar travas.
- Invocação: `docs/prompts/` do toolkit (`14-harness-evaluation.md` e `15-harness-improvement.md`) na mesma revisão registrada em `docs/setup.md`.

## Revisão depois de implementar

Escopo pelo risco do diff. Mudança em `lib/agente.js`, `lib/memoria.js` ou `api/webhook.js` é sensível (LGPD, envio, assinatura): revisão independente quando disponível (`/code-review` ou subagente revisor só leitura) e revisão de segurança do diff. Termina quando os achados relevantes forem resolvidos ou decididos e `npm run check` passar.

## Revisão de segurança

- Prompt reutilizável: `docs/prompts/security-review.md` (bloco do prompt 13 do toolkit, revisão 790a895). Modo repositório ou diff (base e head explícitos).
- Alternativa com plugin: claude-security (scan multiagente com verificação; gera patches, nunca aplica). Exige a ferramenta Workflow e consentimento explícito de custo; não rodou em 10/11/2026 por falta da ferramenta na sessão de nuvem.
- Relatório sempre privado e fora do repositório. Baseline manual de 10/11/2026 (prompt 13): `/mnt/project-files/agente-whatsapp/setup-toolkit/security/` (pasta do projeto no Claude). Achado principal: memória do lead entra no bloco de sistema (injeção de prompt persistente); corrigir antes de qualquer modo automático.
- Somente leitura por padrão; correção exige pedido separado. Nenhum achado não significa projeto seguro.

## Dependências e entrega

- `npm audit --omit=dev`: 0 vulnerabilidades (10/11/2026).
- `npm audit` completo: 4 moderadas só de desenvolvimento, todas pelo `minimatch` 10.x dentro do ESLint 10 (GHSA-g3hv-75wg-m249, DoS por padrão glob). Os padrões vêm só da nossa config, não de entrada externa; a correção exige `minimatch` 11, fora da faixa aceita pelo ESLint. Reavaliar quando o ESLint atualizar a dependência. Não usar `npm audit fix --force`.
- Atualize este arquivo junto com scripts e regras.
