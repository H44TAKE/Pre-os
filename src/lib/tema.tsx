import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { aplicarTema, lerTema, type Tema } from "./storage";

interface TemaCtx {
  tema: Tema;
  alternar: () => void;
}
const Ctx = createContext<TemaCtx>({ tema: "light", alternar: () => {} });

export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(lerTema);
  const alternar = useCallback(() => {
    setTema((t) => {
      const next: Tema = t === "light" ? "dark" : "light";
      aplicarTema(next);
      return next;
    });
  }, []);
  return <Ctx.Provider value={{ tema, alternar }}>{children}</Ctx.Provider>;
}

export function useTema() {
  return useContext(Ctx);
}
