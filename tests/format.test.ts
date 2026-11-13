import { describe, expect, it } from "vitest";
import { fmtBRL, fmtDateLong, fmtDateShort, fmtDelta, fmtNum, plural } from "../src/lib/format";

describe("format", () => {
  it("formata moeda e trata ausência", () => {
    expect(fmtBRL(6.78).replace(/\s/g, " ")).toBe("R$ 6,78");
    expect(fmtBRL(null)).toBe("—");
    expect(fmtNum(undefined)).toBe("—");
  });
  it("formata datas ISO", () => {
    expect(fmtDateShort("2026-10-05")).toBe("05/10");
    expect(fmtDateLong("2026-10-05")).toBe("05/10/2026");
  });
  it("formata variação com sinal", () => {
    expect(fmtDelta(0.1)).toBe("+0,10");
    expect(fmtDelta(-0.05)).toBe("−0,05");
    expect(fmtDelta(0)).toBe("0,00");
  });
  it("pluraliza", () => {
    expect(plural(1, "posto", "postos")).toBe("1 posto");
    expect(plural(3, "posto", "postos")).toBe("3 postos");
  });
});
