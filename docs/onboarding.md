# Preparação local

## Pré-requisitos

- Node.js 22 e npm (a Vercel usa `22.x`, ver `package.json`).
- Acesso ao repositório. Contas Meta, Vercel, Anthropic e mem0 só para quem publica (ver `COMO-PUBLICAR.md`).

## Primeira execução

```bash
npm ci
npm run check
```

Saída esperada: `ok ...` para cada caso de teste e lint sem erros. Nenhuma variável de ambiente é necessária para os testes.

## Banco de dados

Não há. Memória no mem0 hospedado (`MEM0_API_KEY`).

## Variáveis de ambiente

Nomes em `.env.example`. Valores reais só na Vercel; para rodar algo contra APIs reais localmente, crie `.env` (ignorado pelo git) e nunca cole valores no chat ou em commits.

## Agentes

Abra o agente na raiz do repositório. Ele lê `AGENTS.md` (Claude Code via `CLAUDE.md`). Para retomar trabalho de outra sessão, veja `docs/handoff.md`.

## Problemas conhecidos

- O ambiente de nuvem do Claude não acessa `*.vercel.app`: testes do webhook publicado são feitos pelo navegador do Roque.
- O ciclo semanal de aprendizado ainda não tem agendamento.
