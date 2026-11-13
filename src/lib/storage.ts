import { useCallback, useState } from "react";

/** Mesma chave do site antigo, para preservar a escolha de quem já usava. */
const LS_KEY_VISIBILIDADE = "painelPrecos.visibilidadePostos.v1";
const LS_KEY_TEMA = "painel.tema";

function lerOcultos(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY_VISIBILIDADE);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
function gravarOcultos(set: Set<string>) {
  try {
    localStorage.setItem(LS_KEY_VISIBILIDADE, JSON.stringify([...set]));
  } catch {
    /* sem localStorage: vale só nesta sessão */
  }
}

/** Só guardamos as exceções (postos ocultos); o resto é visível por padrão. */
export function useVisibilidade() {
  const [ocultos, setOcultos] = useState<Set<string>>(lerOcultos);

  const atualizar = useCallback((fn: (s: Set<string>) => void) => {
    setOcultos((prev) => {
      const next = new Set(prev);
      fn(next);
      gravarOcultos(next);
      return next;
    });
  }, []);

  return {
    ocultos,
    visivel: (key: string) => !ocultos.has(key),
    alternar: (key: string) => atualizar((s) => (s.has(key) ? s.delete(key) : s.add(key))),
    mostrarTodos: () => atualizar((s) => s.clear()),
    ocultarTodos: (keys: string[]) => atualizar((s) => keys.forEach((k) => s.add(k))),
  };
}

export type Tema = "light" | "dark";
export function lerTema(): Tema {
  try {
    return localStorage.getItem(LS_KEY_TEMA) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}
export function aplicarTema(t: Tema) {
  if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  try {
    localStorage.setItem(LS_KEY_TEMA, t);
  } catch {
    /* ignora */
  }
}
