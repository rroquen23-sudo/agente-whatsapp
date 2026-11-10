# Agente WhatsApp comercial · Águas do Vale

Webhook do WhatsApp Cloud API (Vercel) para o atendimento comercial da Águas do Vale. Recebe mensagens de leads, consulta a memória no mem0 e prepara rascunhos que o Roque lê antes de qualquer envio (**modo sombra**). O agente fica desligado por padrão (`AGENT_ENABLED=false`).

## Rodar

```bash
npm ci
npm run check   # lint + testes
```

Não há servidor local: os testes simulam Meta, Anthropic e mem0 com `fetch` falso. Publicação na Vercel: [COMO-PUBLICAR.md](COMO-PUBLICAR.md).

## Documentação

| Documento | Conteúdo |
|---|---|
| [PRODUCT.md](PRODUCT.md) | Objetivo, escopo, regras e o que está fora |
| [AGENTS.md](AGENTS.md) | Comandos e regras para agentes de IA (o `CLAUDE.md` importa) |
| [docs/architecture.md](docs/architecture.md) | Fluxo, módulos e decisões |
| [docs/design.md](docs/design.md) | Páginas públicas e tom das mensagens |
| [docs/onboarding.md](docs/onboarding.md) | Preparar a máquina e o ambiente |
| [docs/quality.md](docs/quality.md) | Checagens, testes e revisão de segurança |
| [docs/setup.md](docs/setup.md) | Ferramentas, decisões do setup e matriz de cobertura |
| [memoria/README.md](memoria/README.md) | Memória no mem0, LGPD e ciclo semanal |
| [briefing/briefing-v3.1.md](briefing/briefing-v3.1.md) | Manual do agente (fonte de verdade comercial) |

## Próxima entrega

Modo sombra rodando 3 a 5 dias com rascunhos revisados pelo Roque, depois decisão sobre o modo automático. Pendências em [PRODUCT.md](PRODUCT.md#pendências).
