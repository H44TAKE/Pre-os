import type { Abastecimento, AggPosto, Posto, SnapshotPrecos, DadosAbastecimento } from "./types";
import { normalizeForMatch, slug } from "./match";

export function filtrarPeriodo(rows: Abastecimento[], de?: string | null, ate?: string | null): Abastecimento[] {
  if (!de && !ate) return rows;
  return rows.filter((r) => (!de || r.dataISO >= de) && (!ate || r.dataISO <= ate));
}

export function buildAgg(rows: Abastecimento[], servico: string): AggPosto[] {
  const map = new Map<string, AggPosto>();
  for (const r of rows) {
    if (r.servico !== servico) continue;
    let e = map.get(r.estabKey);
    if (!e) {
      e = { key: r.estabKey, nome: r.estabNome, records: [], count: 0, min: 0, max: 0, avg: 0, totalGasto: 0, byDate: {}, tableMin: 0, tableMax: 0 };
      map.set(r.estabKey, e);
    }
    e.records.push(r);
  }
  const list = [...map.values()];
  for (const e of list) {
    e.records.sort((a, b) => (a.dataISO < b.dataISO ? -1 : a.dataISO > b.dataISO ? 1 : 0));
    e.count = e.records.length;
    const vals = e.records.map((r) => r.valor);
    e.min = Math.min(...vals);
    e.max = Math.max(...vals);
    e.avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    e.totalGasto = e.records.reduce((s, r) => s + (r.valorTotal !== null ? r.valorTotal : r.valor), 0);
    for (const r of e.records) e.byDate[r.dataISO] = r.valor;
    const bd = Object.values(e.byDate);
    e.tableMin = Math.min(...bd);
    e.tableMax = Math.max(...bd);
  }
  return list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export interface EstabResumo {
  key: string;
  nome: string;
  count: number;
}
/** Todos os postos presentes no histórico (qualquer produto) */
export function resumoEstabelecimentos(rows: Abastecimento[]): EstabResumo[] {
  const map = new Map<string, EstabResumo>();
  for (const r of rows) {
    const e = map.get(r.estabKey) ?? { key: r.estabKey, nome: r.estabNome, count: 0 };
    e.count++;
    map.set(r.estabKey, e);
  }
  return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function datasAtivas(agg: AggPosto[]): string[] {
  const set = new Set<string>();
  for (const e of agg) for (const d of Object.keys(e.byDate)) set.add(d);
  return [...set].sort();
}

/** Lista unificada: tabela de preços + postos que só existem no histórico. */
export function montarPostos(atual: SnapshotPrecos, anterior: SnapshotPrecos | null, dados: DadosAbastecimento, naoAbastecemos: string[] = []): Posto[] {
  const bloqueados = new Set(naoAbastecemos.map(normalizeForMatch));
  const extras = new Map((atual.extras ?? []).map((x) => [normalizeForMatch(x.nome), x] as const));
  const estabs = resumoEstabelecimentos(dados.rows);
  const porMatch = new Map<string, EstabResumo>();
  for (const e of estabs) porMatch.set(normalizeForMatch(e.nome), e);

  const antes = new Map<string, number | null>();
  anterior?.regioes.forEach((r) => r.postos.forEach((p) => antes.set(`${r.sigla}|${normalizeForMatch(p.nome)}`, p.s10)));

  const usados = new Set<string>();
  const postos: Posto[] = [];
  for (const r of atual.regioes) {
    for (const p of r.postos) {
      const m = porMatch.get(normalizeForMatch(p.nome));
      if (m) usados.add(m.key);
      const prev = antes.get(`${r.sigla}|${normalizeForMatch(p.nome)}`);
      postos.push({
        id: `${r.sigla.toLowerCase()}-${slug(p.nome)}`,
        nome: p.nome,
        regiaoSigla: r.sigla,
        regiaoNome: r.nome,
        cidade: p.cidade,
        rodovia: p.rodovia,
        bandeira: p.bandeira,
        s500: p.s500,
        s10: p.s10,
        s10Fonte: p.s10Fonte ?? null,
        s10Data: p.s10Data ?? null,
        deltaS10: prev != null && p.s10 != null ? Math.round((p.s10 - prev) * 100) / 100 : null,
        histKey: m?.key ?? null,
        foraDaTabela: false,
        naoAbastece: bloqueados.has(normalizeForMatch(p.nome)),
      });
    }
  }
  for (const e of estabs) {
    if (usados.has(e.key)) continue;
    const extra = extras.get(normalizeForMatch(e.nome));
    postos.push({
      id: `hist-${slug(e.key)}`,
      nome: e.nome,
      regiaoSigla: null,
      regiaoNome: null,
      cidade: extra?.cidade ?? null,
      rodovia: null,
      bandeira: null,
      s500: null,
      s10: extra?.s10 ?? null,
      s10Fonte: extra ? "ticketlog" : null,
      s10Data: extra?.data ?? null,
      deltaS10: null,
      histKey: e.key,
      foraDaTabela: true,
      naoAbastece: bloqueados.has(normalizeForMatch(e.nome)),
    });
  }
  return postos;
}

export interface Kpis {
  total: number;
  menor: Posto | null;
  maior: Posto | null;
  mediaPorRegiao: { sigla: string; nome: string; media: number; n: number }[];
  top5: Posto[];
  semPreco: number;
}
export function calcularKpis(postos: Posto[]): Kpis {
  const tabela = postos.filter((p) => !p.foraDaTabela);
  const comS10 = tabela.filter((p) => p.s10 !== null);
  let menor: Posto | null = null;
  let maior: Posto | null = null;
  for (const p of comS10) {
    if (!menor || p.s10! < menor.s10!) menor = p;
    if (!maior || p.s10! > maior.s10!) maior = p;
  }
  const regs = new Map<string, { sigla: string; nome: string; soma: number; n: number }>();
  for (const p of comS10) {
    const r = regs.get(p.regiaoSigla!) ?? { sigla: p.regiaoSigla!, nome: p.regiaoNome!, soma: 0, n: 0 };
    r.soma += p.s10!;
    r.n++;
    regs.set(p.regiaoSigla!, r);
  }
  const top5 = [...comS10].sort((a, b) => a.s10! - b.s10! || a.nome.localeCompare(b.nome, "pt-BR")).slice(0, 5);
  return {
    total: tabela.length,
    menor,
    maior,
    mediaPorRegiao: [...regs.values()].map((r) => ({ sigla: r.sigla, nome: r.nome, media: r.soma / r.n, n: r.n })),
    top5,
    semPreco: tabela.length - comS10.length,
  };
}
