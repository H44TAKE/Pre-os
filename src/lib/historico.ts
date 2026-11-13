import type { Abastecimento, AggPosto } from "./types";

/** Preço médio ponderado pela quantidade; sem quantidade, média simples. Ignora registros sem preço unitário. */
export function precoMedio(rs: Abastecimento[]): number | null {
  const comPreco = rs.filter((r) => r.valor > 0);
  if (!comPreco.length) return null;
  const comQtd = comPreco.filter((r) => (r.quantidade ?? 0) > 0);
  if (comQtd.length) {
    const litros = comQtd.reduce((s, r) => s + r.quantidade!, 0);
    return comQtd.reduce((s, r) => s + r.valor * r.quantidade!, 0) / litros;
  }
  return comPreco.reduce((s, r) => s + r.valor, 0) / comPreco.length;
}

const somaQtd = (rs: Abastecimento[]) => rs.reduce((s, r) => s + (r.quantidade ?? 0), 0);
const gastoDe = (r: Abastecimento) => (r.valorTotal !== null ? r.valorTotal : r.valor);

export interface EstatPosto {
  key: string;
  nome: string;
  count: number;
  quantidade: number;
  gasto: number;
  /** null quando o produto não tem preço unitário (ex.: lavagem) */
  medio: number | null;
  min: number | null;
  max: number | null;
  ultimo: number | null;
  ultimaData: string;
  /** último preço menos o primeiro do período; null com menos de 2 dias de registro */
  variacao: number | null;
  /** último valor de cada dia, em ordem de data (para o gráfico em miniatura) */
  serie: number[];
}

export function estatPosto(e: AggPosto): EstatPosto {
  const temPreco = e.max > 0;
  const datas = Object.keys(e.byDate).sort();
  const serie = datas.map((d) => e.byDate[d]);
  const ultimo = e.records[e.records.length - 1];
  return {
    key: e.key,
    nome: e.nome,
    count: e.count,
    quantidade: somaQtd(e.records),
    gasto: e.totalGasto,
    medio: precoMedio(e.records),
    min: temPreco ? e.min : null,
    max: temPreco ? e.max : null,
    ultimo: temPreco ? ultimo.valor : null,
    ultimaData: ultimo.dataISO,
    variacao: temPreco && serie.length > 1 ? serie[serie.length - 1] - serie[0] : null,
    serie,
  };
}

export interface KpisHist {
  registros: number;
  quantidade: number;
  gasto: number;
  medio: number | null;
  postos: number;
}

export function kpisHistorico(postos: AggPosto[]): KpisHist {
  const rs = postos.flatMap((p) => p.records);
  return { registros: rs.length, quantidade: somaQtd(rs), gasto: rs.reduce((s, r) => s + gastoDe(r), 0), medio: precoMedio(rs), postos: postos.length };
}

export interface SerieRede {
  media: (number | null)[];
  min: (number | null)[];
  max: (number | null)[];
}

/** Por dia: preço médio, menor e maior da rede, considerando os postos informados. */
export function serieRede(postos: AggPosto[], datas: string[]): SerieRede {
  const porDia = new Map<string, Abastecimento[]>();
  for (const p of postos) for (const r of p.records) if (r.valor > 0) porDia.set(r.dataISO, [...(porDia.get(r.dataISO) ?? []), r]);
  const pega = (fn: (rs: Abastecimento[]) => number | null) => datas.map((d) => (porDia.has(d) ? fn(porDia.get(d)!) : null));
  return {
    media: pega(precoMedio),
    min: pega((rs) => Math.min(...rs.map((r) => r.valor))),
    max: pega((rs) => Math.max(...rs.map((r) => r.valor))),
  };
}
