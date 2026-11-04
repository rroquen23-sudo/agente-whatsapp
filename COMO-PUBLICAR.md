# Publicar o webhook do agente na Vercel

O que este servidor faz hoje: responde à verificação da Meta, recebe mensagens e status, confere a assinatura da Meta e registra só o tipo do evento, sem o texto (LGPD). Ele ainda não responde aos leads: o modo sombra é a próxima etapa. `AGENT_ENABLED=false` é o botão de desligar.

## 1. Subir o código no GitHub (sem terminal)
1. github.com → **New repository** → nome `agente-whatsapp` → **Private** → Create.
2. Na página do repositório vazio: **uploading an existing file**.
3. Descompacte `webhook-vercel.zip` e arraste **o conteúdo** da pasta (a pasta `api`, `package.json`, `.gitignore`, `.env.example`, este arquivo) → **Commit changes**.

## 2. Importar na Vercel
1. vercel.com → entrar com o GitHub → **Add New… → Project** → escolher `agente-whatsapp` → **Import**.
2. Framework Preset: **Other**. Não mexer no resto.
3. Abrir **Environment Variables** e cadastrar:
   - `WHATSAPP_VERIFY_TOKEN` = uma senha longa que você inventa (ex.: 30 caracteres aleatórios)
   - `META_APP_SECRET` = Meta for Developers → app "Agente Aguas do Vale" → **Configurações do app → Básico → Chave secreta do app** (Mostrar)
   - `WHATSAPP_ACCESS_TOKEN` = token permanente do Usuário do Sistema
   - `WHATSAPP_PHONE_NUMBER_ID` = 1382741554929528
   - `WHATSAPP_WABA_ID` = 1744070573516424
   - `AGENT_ENABLED` = false
4. **Deploy**. Anote o domínio, ex.: `agente-whatsapp-xxxx.vercel.app`.

## 3. Preencher a tela da Meta (Configurar webhooks)
- **URL de callback:** `https://SEU-DOMINIO.vercel.app/api/webhook`
- **Verificar token:** a mesma senha do `WHATSAPP_VERIFY_TOKEN`
- **Verificar e salvar** → depois, em Campos do webhook, assinar **messages**.

## 4. Avisar o Claude
Me mande só a URL (nada de senha ou token no chat). Eu inscrevo o app na WABA e testo.

Se der erro em "Verificar e salvar": confira se a senha é idêntica nos dois lugares e se você fez **Redeploy** depois de criar as variáveis.
