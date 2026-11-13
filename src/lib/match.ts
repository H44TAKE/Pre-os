/** Normalização usada para cruzar o nome de um posto entre a tabela de preços e o histórico. */

export const BANDEIRAS_CONHECIDAS = ["BR", "IPIRANGA", "SHELL", "REDE HG", "TOTAL", "RIO BRANCO"];

const ROMAN_TO_ARABIC: Record<string, string> = { I: "1", II: "2", III: "3", IV: "4", V: "5", VI: "6" };

export function accentFold(s: unknown): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}
export function norm(s: unknown): string {
  return accentFold(s).toLowerCase();
}
export function slug(s: string): string {
  return norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Remove prefixos ("POSTO", "AUTO POSTO"), sufixo de bandeira e acentos, e
 * converte numeral romano em arábico no último termo. Dois nomes só "casam"
 * se ficarem idênticos depois disso: conservador de propósito.
 */
export function normalizeForMatch(raw: string): string {
  let s = accentFold(raw).toUpperCase().trim();
  s = s.replace(/^AUTO\s+POSTO\s+/, "").replace(/^POSTO\s+/, "");
  for (const w of BANDEIRAS_CONHECIDAS) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`\\s+${esc}$`), "");
  }
  const parts = s.replace(/\s+/g, " ").trim().split(" ");
  const last = parts[parts.length - 1];
  if (ROMAN_TO_ARABIC[last]) parts[parts.length - 1] = ROMAN_TO_ARABIC[last];
  return parts.join(" ");
}
