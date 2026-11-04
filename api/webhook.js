// Webhook do WhatsApp Cloud API (Vercel Function, sem dependências).
// GET  = verificação da Meta (hub.challenge).
// POST = eventos (mensagens recebidas, status). Valida assinatura e responde 200 rápido.
import crypto from "node:crypto";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const APP_SECRET = process.env.META_APP_SECRET;
const AGENT_ENABLED = process.env.AGENT_ENABLED === "true"; // kill switch: padrão desligado

export function GET(request) {
  const p = new URL(request.url).searchParams;
  if (VERIFY_TOKEN && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === VERIFY_TOKEN) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export function validSignature(raw, header, secret) {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from("sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex"));
  const got = Buffer.from(header);
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

// Extrai só o necessário; não registra o texto das mensagens (LGPD).
export function summarize(body) {
  const out = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      for (const m of v.messages ?? []) out.push({ kind: "message", id: m.id, type: m.type, from_suffix: String(m.from ?? "").slice(-4) });
      for (const s of v.statuses ?? []) out.push({ kind: "status", id: s.id, status: s.status });
    }
  }
  return out;
}

export async function POST(request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"), APP_SECRET)) {
    return new Response("Invalid signature", { status: 401 });
  }
  let body;
  try { body = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
  const events = summarize(body);
  console.log(JSON.stringify({ agent_enabled: AGENT_ENABLED, events }));
  // Próxima etapa: modo sombra (gera resposta sugerida e avisa o Roque, sem enviar ao lead).
  return new Response("OK", { status: 200 });
}
