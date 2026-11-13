import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Estado guardado na URL. `set(chave, valor)` com valor vazio/nulo remove o parâmetro.
 * Por padrão substitui a entrada do histórico; `push: true` cria uma nova (útil para abrir o painel de um posto).
 */
export function useParams2() {
  const [sp, setSp] = useSearchParams();

  const get = useCallback((k: string) => sp.get(k), [sp]);

  const set = useCallback(
    (patch: Record<string, string | null | undefined>, opts?: { push?: boolean }) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === undefined || v === "") next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: !opts?.push },
      );
    },
    [setSp],
  );

  return { get, set, sp };
}
