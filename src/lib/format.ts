const brl = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtBRL(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return "R$ " + brl.format(v);
}
/** Valor sem o símbolo, para colunas de tabela */
export function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return brl.format(v);
}
export function fmtLitros(v: number): string {
  return brl.format(v) + " L";
}
export function fmtDateShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
export function fmtDateLong(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
export function fmtDelta(v: number): string {
  const s = v > 0 ? "+" : v < 0 ? "−" : "";
  return s + brl.format(Math.abs(v));
}
export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}
