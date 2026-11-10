<!-- Fonte: vibe-coding-toolkit docs/prompts/13-security-review.md, revisão 790a895 (fork rroquen23-sudo). Atualizar: copiar de novo o bloco "Prompt" da revisão nova e registrar em docs/quality.md. -->

# Revisão de segurança (prompt reutilizável)

Cole o bloco abaixo no agente, na raiz deste repositório. Padrão: revisão do repositório inteiro. Para um diff, informe base e head. Relatório privado fora do repositório (sugestão: `/mnt/project-files/agente-whatsapp/security/` ou pasta do usuário).

Pontos deste projeto para priorizar: assinatura do webhook (`api/webhook.js`), trava de envio do modo sombra (`enviar()` em `lib/agente.js`), injeção de prompt vinda do lead, PII em logs e no mem0 (`lib/memoria.js`), segredos nas variáveis da Vercel.


```markdown
# Review this project's security

Perform an evidence-based security review of the open repository. Default mode: repository baseline review. If I supplied a diff range, review that precise change and its connected code. Complete the review and report; do not automatically fix findings.

