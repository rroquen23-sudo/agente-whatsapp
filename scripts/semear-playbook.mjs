// Grava no mem0 o playbook inicial aprovado pelo Roque (memoria/playbook-semente.json).
// Uso: MEM0_API_KEY=... node scripts/semear-playbook.mjs
import { readFile } from "node:fs/promises";
import { criarMemoria } from "../lib/memoria.js";

const semente = JSON.parse(await readFile(new URL("../memoria/playbook-semente.json", import.meta.url), "utf8"));
const mem = criarMemoria();
for (const item of semente.itens) {
  await mem.aprovarAprendizado({ texto: item.texto, objecao: item.objecao, origem: "briefing-v3.1", aprovadoEm: semente.aprovado_em });
  console.log("gravado:", item.objecao ?? "geral");
}
