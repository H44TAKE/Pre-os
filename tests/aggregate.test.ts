import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAgg, calcularKpis, datasAtivas, filtrarPeriodo, montarPostos } from "../src/lib/aggregate";
import type { Abastecimento, DadosAbastecimento, SnapshotPrecos } from "../src/lib/types";

const ler = <T,>(p: string): T => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), "utf8"));

const mk = (dataISO: string, valor: number, estabKey = "A", servico = "S10"): Abastecimento => ({
  dataISO, servico, valor, estabKey, estabNome: estabKey, hora: "00:00:00", motorista: "X", quantidade: 10, valorTotal: valor * 10,
});

describe("buildAgg", () => {
  const rows = [mk("2026-10-01", 6), mk("2026-10-02", 7), mk("2026-10-02", 8), mk("2026-10-03", 5, "B"), mk("2026-10-03", 9, "A", "ARLA")];
  it("agrega por posto e produto", () => {
    const a = buildAgg(rows, "S10");
    const pa = a.find((e) => e.key === "A")!;
    expect(pa.count).toBe(3);
    expect(pa.min).toBe(6);
    expect(pa.max).toBe(8);
    expect(pa.avg).toBeCloseTo(7);
    expect(pa.totalGasto).toBeCloseTo(210);
  });
  it("usa o último valor do dia na tabela cruzada", () => {
    const pa = buildAgg(rows, "S10").find((e) => e.key === "A")!;
    expect(pa.byDate["2026-10-02"]).toBe(8);
  });
  it("lista datas ativas ordenadas", () => {
    expect(datasAtivas(buildAgg(rows, "S10"))).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  });
  it("filtra por período inclusivo", () => {
    expect(filtrarPeriodo(rows, "2026-10-02", "2026-10-02")).toHaveLength(2);
    expect(filtrarPeriodo(rows)).toBe(rows);
  });
});

describe("dados reais", () => {
  const idx = ler<{ snapshots: string[] }>("precos/index.json");
  const snap = ler<SnapshotPrecos>(`precos/${idx.snapshots[idx.snapshots.length - 1]}.json`);
  const dados = ler<DadosAbastecimento>("abastecimentos.json");
  const postos = montarPostos(snap, null, dados);

  it("mantém 48 postos na tabela e não perde os 965 abastecimentos originais", () => {
    expect(postos.filter((p) => !p.foraDaTabela)).toHaveLength(48);
    expect(dados.rows.length).toBeGreaterThanOrEqual(965);
    expect(dados.rows.filter((r) => r.dataISO <= "2026-10-29")).toHaveLength(965);
  });
  it("ids são únicos", () => {
    expect(new Set(postos.map((p) => p.id)).size).toBe(postos.length);
  });
  it("KPIs coerentes", () => {
    const k = calcularKpis(postos);
    expect(k.total).toBe(48);
    expect(k.menor!.s10!).toBeLessThanOrEqual(k.maior!.s10!);
    expect(k.top5).toHaveLength(5);
    expect(k.top5[0].s10).toBe(k.menor!.s10);
  });
});
