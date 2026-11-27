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

  it("mantém ao menos os 48 postos da tabela e não perde os 965 abastecimentos originais", () => {
    expect(postos.filter((p) => !p.foraDaTabela).length).toBeGreaterThanOrEqual(48);
    expect(dados.rows.length).toBeGreaterThanOrEqual(965);
    // relatórios novos podem completar dias antigos, nunca reduzir
    expect(dados.rows.filter((r) => r.dataISO <= "2026-10-29").length).toBeGreaterThanOrEqual(965);
  });
  it("ids são únicos", () => {
    expect(new Set(postos.map((p) => p.id)).size).toBe(postos.length);
  });
  it("marca só os postos listados em avisos.json como 'não abastecemos mais'", () => {
    const { naoAbastecemos } = ler<{ naoAbastecemos: string[] }>("avisos.json");
    const marcados = montarPostos(snap, null, dados, naoAbastecemos).filter((p) => p.naoAbastece && !p.foraDaTabela);
    expect(marcados.map((p) => p.nome).sort()).toEqual(["Anel Viário", "Grande Vale", "Grão de Ouro", "MOC", "Novo Ponto", "Parceiro", "Santo Antônio", "Uirapuru"]);
    expect(postos.some((p) => p.naoAbastece)).toBe(false); // sem a lista, ninguém é marcado
  });
  it("KPIs coerentes", () => {
    const k = calcularKpis(postos);
    expect(k.total).toBe(postos.filter((p) => !p.foraDaTabela).length);
    expect(k.menor!.s10!).toBeLessThanOrEqual(k.maior!.s10!);
    expect(k.top5).toHaveLength(5);
    expect(k.top5[0].s10).toBe(k.menor!.s10);
  });
});

describe("preços da Ticketlog", () => {
  const snap: SnapshotPrecos = {
    atualizadoEm: "2026-11-27",
    origem: "ticketlog",
    ticketlogEm: "2026-11-27",
    regioes: [
      {
        sigla: "AL",
        nome: "Alagoas",
        postos: [
          { nome: "Alagoas 101", rodovia: "BR 101", cidade: "São Sebastião", s500: 7.19, s10: 6.88, bandeira: "BR", s10Fonte: "ticketlog", s10Data: "2026-11-26" },
          { nome: "Linhares", rodovia: "BR 101", cidade: "Linhares", s500: 6.57, s10: 6.77, bandeira: "BR" },
        ],
      },
    ],
    extras: [{ nome: "Reforco Ii", cidade: "Umbauba", uf: "SE", s10: 7.42, data: "2026-11-26" }],
  };
  const dados: DadosAbastecimento = {
    rows: [mk("2026-11-20", 7.5, "POSTO REFORCO II"), mk("2026-11-20", 7.5, "POSTO SEM PRECO")],
    servicos: ["S10"],
    servicoPadrao: "S10",
  };
  const postos = montarPostos(snap, null, dados);
  const por = (nome: string) => postos.find((p) => p.nome === nome)!;

  it("posto da tabela leva a fonte e a data do S-10 que a Ticketlog informou", () => {
    expect([por("Alagoas 101").s10Fonte, por("Alagoas 101").s10Data]).toEqual(["ticketlog", "2026-11-26"]);
  });
  it("posto da tabela sem leitura da Ticketlog fica com a marca nula (preço da tabela)", () => {
    expect([por("Linhares").s10Fonte, por("Linhares").s10Data]).toEqual([null, null]);
  });
  it("posto fora da tabela ganha o S-10 do 'extras' quando o nome casa", () => {
    const p = por("POSTO REFORCO II");
    expect(p.foraDaTabela).toBe(true);
    expect([p.s10, p.s10Fonte, p.s10Data, p.cidade]).toEqual([7.42, "ticketlog", "2026-11-26", "Umbauba"]);
  });
  it("posto fora da tabela sem extra continua sem preço", () => {
    const p = postos.find((x) => x.foraDaTabela && x.s10 === null)!;
    expect([p.s10, p.s10Fonte]).toEqual([null, null]);
  });
  it("os extras não entram nas contas da tabela (menor/maior S-10)", () => {
    const k = calcularKpis(postos);
    expect(k.total).toBe(2);
    expect(k.maior!.s10).toBe(6.88);
  });
});
