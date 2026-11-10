# Design: setup do Vibe Coding Toolkit no agente-whatsapp

Status: **aprovado pelo Roque em 10/11/2026 (D1 a D4)** · 10/11/2026 · toolkit revisão `790a895` (fork rroquen23-sudo/vibe-coding-toolkit, prompt 12)

## 1. Entendimento

- **Objetivo:** deixar o repositório `agente-whatsapp` pronto para desenvolvimento com IA: instruções curtas, documentação confiável, checagens reproduzíveis, revisão de segurança reutilizável e harness verificado. Sem mudar o produto.
- **Você pediu:** executar o prompt 12 inteiro, começando pelo brainstorming, usando os plugins omniout, superpowers, caveman, claude-security e claude-code-setup.
- **Suposições (corrija se errado):** documentação do repo em português (o código e o briefing já são); nada vai para produção (Vercel) nem muda o comportamento do agente sem OK separado; entrega via PR em rascunho, você decide o merge.

## 2. Diagnóstico (baseline observado)

| Item | Estado |
|---|---|
| Stack | Node 22 (ESM), Vercel Functions, 1 dependência (`@vercel/functions`), npm + lockfile |
| Código | 480 linhas em `lib/` + 72 em `api/webhook.js`; nenhum arquivo acima de 350 linhas |
| Testes | `npm test` → 3 suítes próprias, **todas passando** (63 casos) |
| Auditoria | `npm audit --omit=dev` → **0 vulnerabilidades** |
| Lint / tipos / CI | inexistentes |
| Docs | `COMO-PUBLICAR.md` (desatualizado: diz que o agente não responde), `memoria/README.md`, briefing v3.1; sem README, AGENTS, CLAUDE |
| Chamadas externas | Anthropic, Graph API (Meta) e mem0 via `fetch` **sem timeout, sem retry, sem fallback de modelo** |
| Segurança já existente | assinatura HMAC com `timingSafeEqual`, kill switch `AGENT_ENABLED`, sem texto em log, hash de telefone, remoção de PII |
| Plugins na sessão | superpowers, caveman, claude-security, claude-code-setup e omniout: **todos ativos** |
| Ausentes na máquina | RTK, Graphify, Context7 (MCP), Ponytail |

## 3. Entregas (ordem por dependência e risco)

**D1. Fundação e contexto (só docs, risco zero)**
- `AGENTS.md` curto (comandos, regras de LGPD/kill switch, mapa de docs) + `CLAUDE.md` importando.
- `README.md`, `PRODUCT.md`, `docs/architecture.md`, `docs/design.md` (UI só nas 2 páginas estáticas), `docs/onboarding.md`, `docs/quality.md`, `docs/setup.md`.
- `COMO-PUBLICAR.md` corrigido para o estado real; vira referência a partir do README.
- Handoff em `docs/handoff.md` (template do toolkit).

**D2. Qualidade**
- ESLint (flat config, perfil JS do toolkit) como devDependency, medir violações antes; regra nova com violação antiga entra como `warn` com contagem.
- `npm run lint`, `npm run check` (lint + test). Sem CI novo (não existe CI hoje; criar workflow fica como proposta).

**D3. Segurança e harness**
- Rodar **claude-security** (scan do repositório inteiro), relatório privado em `/mnt/project-files/`, nunca no repo público.
- Copiar o bloco do prompt 13 para `docs/prompts/security-review.md` (revisão reutilizável).
- Harness2 nativo: smoke cases do prompt 14 (achar instruções, rodar checks, respeitar kill switch), registrar em `docs/quality.md`.
- **claude-code-setup**: rodar o recomendador de automações e incorporar só o que fizer sentido.

**D4. Resiliência das chamadas de IA com omniout (muda comportamento, decisão separada)**
- Timeout + retry com backoff em Anthropic/Graph/mem0; fallback Sonnet → Haiku só na triagem. Com testes de regressão. Afeta o modo sombra quando ligado; não liga nada.

## 4. Matriz de cobertura do toolkit

| Componente | Ação | Motivo / validação |
|---|---|---|
| 9 docs do manifest | criar (D1) | links válidos, sem placeholder |
| Superpowers | reusar plugin | rotear em AGENTS.md |
| Caveman | reusar plugin | conversa curta, docs/commits normais |
| Ponytail | equivalente | regra "menor mudança completa" em AGENTS.md; plugin não instalado |
| RTK | bloqueado | instalação global; pré-requisito de máquina |
| Context7 | bloqueado | MCP não conectado; usar docs oficiais e registrar |
| Graphify | inaplicável | ~550 linhas de código; grafo não compensa |
| Vercel skills | instalar no projeto: `vercel-optimize`, `deploy-to-vercel`, `writing-guidelines`, `find-skills` | React/Next/RN inaplicáveis; deploy não autorizado por instalar |
| next-dev-loop / bundle | inaplicável | sem Next.js |
| supabase-postgres | inaplicável | sem PostgreSQL (mem0 hospedado) |
| gh-fix-ci | inaplicável | sem GitHub Actions |
| differential-review | equivalente | claude-security + prompt 13 |
| shadcn | inaplicável | sem UI de componentes |
| Sentry MCP | inaplicável | sem conta; seria serviço novo |
| Harness2 | adotar (D3) | smoke cases registrados |
| agent-browser / DevTools | inaplicável | só 2 páginas estáticas; vercel.app bloqueado neste ambiente |
| Memória em camadas | reusar | memória do projeto + `memoria/README.md`; registrar em setup.md |
| Anthropic skills / skill-creator | reusar | já disponíveis, sem necessidade de instalar |
| omniout | adotar (D4) | único plugin com encaixe direto no código |
| claude-code-setup | adotar (D3) | recomendações viram itens da matriz |
| claude-security | adotar (D3) | scan + relatório privado |
| Hooks | inaplicável | nenhum necessário; toolkit proíbe hooks de git |

## 5. Fora do escopo
Deploy na Vercel, ligar `AGENT_ENABLED`, mudar modelo do agente, criar CI, migrar framework, mexer no briefing.
