import { describe, expect, it } from "vitest";
import { normalizeForMatch, slug } from "../src/lib/match";

describe("normalizeForMatch", () => {
  it("remove prefixo POSTO e converte romano em arábico", () => {
    expect(normalizeForMatch("POSTO PLANALTO 2")).toBe(normalizeForMatch("Planalto II"));
  });
  it("remove prefixo AUTO POSTO", () => {
    expect(normalizeForMatch("Auto Posto Girassol")).toBe("GIRASSOL");
  });
  it("remove sufixo de bandeira", () => {
    expect(normalizeForMatch("Posto Ravena Rede HG")).toBe(normalizeForMatch("Ravena"));
  });
  it("ignora acentos e caixa", () => {
    expect(normalizeForMatch("Posto São João")).toBe("SAO JOAO");
  });
  it("não junta nomes diferentes", () => {
    expect(normalizeForMatch("Planalto I")).not.toBe(normalizeForMatch("Planalto II"));
  });
});

describe("slug", () => {
  it("gera ids estáveis", () => {
    expect(slug("Posto São João!")).toBe("posto-sao-joao");
  });
});
