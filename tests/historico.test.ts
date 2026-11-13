import { describe, expect, it } from "vitest";
import { buildAgg } from "../src/lib/aggregate";
import { estatPosto, kpisHistorico, precoMedio, serieRede } from "../src/lib/historico";
import type { Abastecimento } from "../src/lib/types";

const mk = (dataISO: string, valor: number, quantidade: number | null, estabKey = "A", servico = "S10"): Abastecimento => ({
  dataISO,
  servico,
  valor,
  estabKey,
  estabNome: estabKey,
  hora: "00:00:00",
  motorista: "X",
  quantidade,
  valorTotal: quantidade === null ? null : valor * quantidade,
});

describe("precoMedio", () => {
  it("pondera pela quantidade", () => {
    expect(precoMedio([mk("2026-10-01", 6, 100), mk("2026-10-01", 8, 300)])).toBeCloseTo(7.5);
  });
  it("sem quantidade, usa média simples", () => {
    expect(precoMedio([mk("2026-10-01", 6, null), mk("2026-10-01", 8, null)])).toBeCloseTo(7);
  });
  it("ignora registros sem preço unitário e devolve null se não sobrar nada", () => {
    expect(precoMedio([mk("2026-10-01", 0, 1)])).toBeNull();
  });
});

describe("estatPosto", () => {
  const rows = [mk("2026-10-01", 6, 100), mk("2026-10-02", 7, 50), mk("2026-10-02", 8, 50), mk("2026-10-03", 7, 10)];
  const e = estatPosto(buildAgg(rows, "S10")[0]);
  it("soma registros, quantidade e gasto", () => {
    expect(e.count).toBe(4);
    expect(e.quantidade).toBe(210);
    expect(e.gasto).toBeCloseTo(600 + 350 + 400 + 70);
  });
  it("último preço e variação consideram o último valor de cada dia", () => {
    expect(e.ultimo).toBe(7);
    expect(e.ultimaData).toBe("2026-10-03");
    expect(e.variacao).toBeCloseTo(1);
    expect(e.serie).toEqual([6, 8, 7]);
  });
  it("variação é null com um só dia", () => {
    expect(estatPosto(buildAgg([mk("2026-10-01", 6, 10)], "S10")[0]).variacao).toBeNull();
  });
  it("produto sem preço unitário não inventa preços", () => {
    const l = estatPosto(buildAgg([mk("2026-10-01", 0, 0, "A", "LAV")], "LAV")[0]);
    expect([l.medio, l.min, l.max, l.ultimo, l.variacao]).toEqual([null, null, null, null, null]);
  });
});

describe("rede", () => {
  const agg = buildAgg([mk("2026-10-01", 6, 10, "A"), mk("2026-10-01", 8, 10, "B"), mk("2026-10-02", 7, 10, "A")], "S10");
  it("KPIs somam todos os postos", () => {
    const k = kpisHistorico(agg);
    expect(k).toMatchObject({ registros: 3, quantidade: 30, postos: 2 });
    expect(k.medio).toBeCloseTo(7);
  });
  it("série por dia, com null nos dias sem registro", () => {
    const s = serieRede(agg, ["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(s.media).toEqual([7, 7, null]);
    expect(s.min).toEqual([6, 7, null]);
    expect(s.max).toEqual([8, 7, null]);
  });
});
