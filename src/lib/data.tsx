import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DadosAbastecimento, Posto, SnapshotPrecos } from "./types";
import { calcularKpis, montarPostos, type Kpis } from "./aggregate";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Falha ao carregar ${path} (${res.status})`);
  return (await res.json()) as T;
}

export interface Dataset {
  atual: SnapshotPrecos;
  anterior: SnapshotPrecos | null;
  abastecimentos: DadosAbastecimento;
  postos: Posto[];
  kpis: Kpis;
}

type Estado = { status: "carregando" } | { status: "erro"; mensagem: string } | { status: "ok"; dataset: Dataset };

const Ctx = createContext<Estado>({ status: "carregando" });

export function DataProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ status: "carregando" });

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const idx = await getJson<{ snapshots: string[] }>("/data/precos/index.json");
        const datas = [...idx.snapshots].sort();
        if (!datas.length) throw new Error("Nenhum snapshot de preços encontrado.");
        const [atual, anterior, abastecimentos] = await Promise.all([
          getJson<SnapshotPrecos>(`/data/precos/${datas[datas.length - 1]}.json`),
          datas.length > 1 ? getJson<SnapshotPrecos>(`/data/precos/${datas[datas.length - 2]}.json`) : Promise.resolve(null),
          getJson<DadosAbastecimento>("/data/abastecimentos.json"),
        ]);
        const postos = montarPostos(atual, anterior, abastecimentos);
        if (!cancelado) setEstado({ status: "ok", dataset: { atual, anterior, abastecimentos, postos, kpis: calcularKpis(postos) } });
      } catch (e) {
        if (!cancelado) setEstado({ status: "erro", mensagem: e instanceof Error ? e.message : "Erro desconhecido ao carregar os dados." });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return <Ctx.Provider value={estado}>{children}</Ctx.Provider>;
}

export function useEstadoDados(): Estado {
  return useContext(Ctx);
}

/** Só pode ser usado dentro de telas renderizadas depois do carregamento. */
export function useDataset(): Dataset {
  const e = useContext(Ctx);
  if (e.status !== "ok") throw new Error("useDataset usado antes dos dados carregarem");
  return e.dataset;
}

export function usePostoPorId(id: string | null): Posto | null {
  const { postos } = useDataset();
  return useMemo(() => (id ? postos.find((p) => p.id === id) ?? null : null), [postos, id]);
}
