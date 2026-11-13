import { useMemo } from "react";
import { useDataset } from "../lib/data";
import { filtrarPeriodo } from "../lib/aggregate";
import { useParams2 } from "./useParam";

/** Produto e período do histórico, guardados na URL (?produto=&de=&ate=). */
export function useFiltroHist() {
  const { abastecimentos } = useDataset();
  const { get, set } = useParams2();

  const produtoUrl = get("produto");
  const servico = produtoUrl && abastecimentos.servicos.includes(produtoUrl) ? produtoUrl : abastecimentos.servicoPadrao;

  const { minData, maxData } = useMemo(() => {
    const ds = abastecimentos.rows.map((r) => r.dataISO).sort();
    return { minData: ds[0] ?? "", maxData: ds[ds.length - 1] ?? "" };
  }, [abastecimentos]);

  const de = get("de");
  const ate = get("ate");
  const rows = useMemo(() => filtrarPeriodo(abastecimentos.rows, de, ate), [abastecimentos, de, ate]);

  return { servico, de, ate, minData, maxData, rows, setServico: (s: string) => set({ produto: s === abastecimentos.servicoPadrao ? null : s }), setPeriodo: (d: string | null, a: string | null) => set({ de: d, ate: a }) };
}
