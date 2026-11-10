# Setup e evidências

## Fonte e contexto

- Toolkit: Vibe Coding Toolkit, fork `rroquen23-sudo/vibe-coding-toolkit`, revisão `790a895` (18/10/2026), prompt 12 (setup de projeto existente). Todos os guias e templates vieram dessa mesma revisão.
- Data: 10/11/2026. Cliente: Claude Code em sessão de nuvem (Linux, Node 22.23.4, npm 10.9.9). Spec aprovado: `docs/superpowers/specs/2026-11-10-setup-toolkit-design.md`.
- Plugins do Claude Code na sessão: superpowers, caveman, claude-security, claude-code-setup, omniout (instalados na conta, carregados e listados na sessão).

## Decisões e fontes

- Docs em português, como o código e o briefing.
- ESLint 10.14 (versão estável atual no npm em 10/11/2026; exige Node ^22.13). Perfil JS do toolkit sem TypeScript; só `quality/max-lines` das regras do toolkit (`no-direct-console` e `no-direct-data-access` não se aplicam: o log é o console da Vercel e não há banco).
- Resiliência com omniout: wrapper próprio (`lib/resiliencia.js`) porque o projeto usa `fetch` direto, sem SDK nem gateway. Ordem de modelos: rascunho só `claude-sonnet-5-5` (regra do Roque: texto ao cliente sempre Sonnet); triagem `claude-haiku-5-5` → `claude-sonnet-5-5`. Timeouts: triagem 8 s, rascunho 20 s, Meta 8 s, mem0 8 s; 1 retry em 429/500/502/503/504/529/rede/timeout; `retry-after` respeitado com teto de 5 s; prazo de 38 s por mensagem para memória e IA. Gravação e exclusão no mem0 não repetem; envio no WhatsApp só repete em 429.
- Sem CI novo, sem hooks, sem mudança de deploy.

## Componentes (matriz final)

| Componente | Estado | Evidência / motivo |
|---|---|---|
| 9 docs do manifest | **validado** | README, PRODUCT, AGENTS, CLAUDE, docs/{architecture,design,onboarding,quality,setup}.md; `COMO-PUBLICAR.md` mantido e corrigido; `memoria/README.md` continua canônico da memória |
| Superpowers | reusado (plugin) | brainstorming → spec aprovado; TDD na resiliência; verificação antes de concluir |
| Caveman | reusado (plugin) | regra de conversa em AGENTS.md |
| Ponytail | equivalente | plugin não instalado; regra "menor mudança completa" em AGENTS.md |
| omniout | **validado** | `lib/resiliencia.js` + 41 testes novos (retry, timeout, corpo travado, prazo, fallback, envio não duplicado, alerta ao Roque) |
| claude-code-setup | executado | recomendador rodado; resultado abaixo |
| claude-security | **bloqueado** | pipeline exige a ferramenta Workflow, ausente na sessão; substituído pela revisão manual do prompt 13 |
| Revisão de segurança (prompt 13) | **validado** | `docs/prompts/security-review.md`; baseline privado gerado |
| differential-review | inaplicável agora | skill não instalada; prompt 13 cobre diff com rastreamento manual |
| Vercel skills | instalado (projeto) | `.claude/skills/` + `skills-lock.json`: `vercel-optimize`, `deploy-to-vercel`, `writing-guidelines`, `find-skills` (cópia, `--agent claude-code`). React/Next/RN e `vercel-cli-with-tokens` inaplicáveis (sem React; login da Vercel é interativo pelo Roque). Descoberta numa sessão nova: não observada |
| ESLint / quality gates | **validado** | 0 violações; `npm run lint:rules` ok |
| RTK | bloqueado | ausente na máquina; instalação global é pré-requisito de máquina |
| Context7 | bloqueado | MCP não conectado; usada documentação oficial e `npm view` |
| Graphify | inaplicável | ~800 linhas de código; grafo não compensa |
| next-dev-loop / next-bundle-optimizer | inaplicável | sem Next.js |
| supabase-postgres-best-practices | inaplicável | sem PostgreSQL |
| gh-fix-ci | inaplicável | sem GitHub Actions |
| shadcn | inaplicável | sem UI de componentes |
| Sentry MCP | inaplicável | sem conta; seria serviço novo |
| agent-browser / Chrome DevTools MCP | inaplicável | só 2 páginas estáticas; `*.vercel.app` bloqueado no ambiente de nuvem |
| Harness2 (método nativo) | **validado** | smoke cases abaixo; 1 melhoria adotada |
| Memória em camadas | reusado | memória do projeto no Claude (índice curto + arquivos por assunto) e docs versionadas; handoff em `docs/handoff.md` |
| Anthropic skills / skill-creator | reusado | disponíveis na conta; nada a instalar |
| Hooks do cliente | inaplicável | `npm run check` explícito basta; toolkit proíbe hooks de git |

### Recomendações do claude-code-setup (decisão)

- MCP context7 para Anthropic, Graph API e mem0: adotar quando a máquina tiver Context7 (bloqueado aqui).
- Hook PostToolUse rodando `npm run lint` ao editar `lib/`: não adotado (projeto pequeno, `npm run check` cobre).
- Subagente revisor de segurança: coberto pelo claude-security e pelo prompt 13.
- Skill de projeto extra: nenhuma; `AGENTS.md` cobre as convenções.

## Checagens

| Checagem | Antes (10/11) | Depois (10/11) |
|---|---|---|
| `npm test` | 63 ok | 104 ok (4 suítes) |
| Lint | inexistente | `npm run lint` 0 erros |
| `npm run lint:rules` | inexistente | ok |
| `npm audit --omit=dev` | 0 | 0 |
| `npm audit` | 0 | 4 moderadas dev (minimatch no ESLint 10; ver `docs/quality.md`) |

## Memória e harness

- Smoke cases (prompt 14) com subagente novo (modelo leve, só leitura), 10/11/2026: 6 casos. Passaram: comando de verificação (rodou `npm run check`, exit 0), recusa a ligar o agente, padrão para chamada externa, prompt de segurança, skills e limite de deploy. Falhou: handoff (o subagente rodou antes de `docs/handoff.md`, `quality.md` e `setup.md` existirem). Lacunas apontadas: AGENTS.md não citava `lint:rules` nem que teste novo precisa entrar no script `test`.
- Melhoria adotada (1 candidato): AGENTS.md agora lista `npm run lint:rules` e a regra do script `test`; os arquivos faltantes foram criados. Reexecução numa sessão nova: não rodada.
- Um subagente novo não prova reinício do cliente nem carregamento das skills de projeto.

## Revisão independente

- 10/11/2026, subagente revisor só leitura sobre `lib/` (resiliência). 5 achados, todos corrigidos com teste: orçamento de pior caso acima de 60 s (agora prazo de 38 s + reserva do envio), timeout não cobria a leitura do corpo, corpo de resposta com erro não era descartado, envio no WhatsApp repetia em 5xx/timeout (podia duplicar cartão), teste da triagem fraco.
- Revisão de segurança: manual (prompt 13), relatório privado; claude-security bloqueado.

## Manutenção e repetição

- Rodar `npm run check` antes de cada commit.
- Atualizar skills: `npx --yes skills@latest update --project --yes` e registrar aqui.
- Repetir o setup: prompt 12 do toolkit na revisão nova; preservar estas decisões e não duplicar seções.
- Revisar quando: ESLint atualizar o minimatch (auditoria dev); antes de qualquer modo automático (achado F1 da revisão de segurança); quando o Context7 ou o RTK estiverem disponíveis.

## Pendências

- claude-security completo numa sessão com a ferramenta Workflow (e seu OK de custo).
- Corrigir F1 (memória do lead no bloco de sistema) antes do modo automático.
- Reexecutar smoke cases numa sessão nova do Claude Code.
