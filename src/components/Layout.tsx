import { Moon, Sun } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useEstadoDados } from "../lib/data";
import { fmtDateLong } from "../lib/format";
import { useTema } from "../lib/tema";
import { useParams2 } from "../hooks/useParam";
import { PostoDrawer } from "./PostoDrawer";
import { usePostoPorId } from "../lib/data";

function Drawer() {
  const { get, set } = useParams2();
  const id = get("posto");
  const posto = usePostoPorId(id);
  return <PostoDrawer posto={posto} onClose={() => set({ posto: null })} />;
}

export function Layout() {
  const estado = useEstadoDados();
  const { tema, alternar } = useTema();

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-in">
          <NavLink to="/" className="marca" aria-label="Painel de Preços, página inicial">
            <span className="marca-logo">
              <img src="/brand/gota.png" alt="" width="28" height="28" />
            </span>
            <span className="marca-texto">
              <strong>Painel de Preços</strong>
              <span>Diesel S-500 · S-10</span>
            </span>
          </NavLink>

          <nav className="nav" aria-label="Seções">
            <NavLink to="/" end>
              Preços atuais
            </NavLink>
            <NavLink to="/historico">Histórico</NavLink>
            <NavLink to="/comparar">Comparar postos</NavLink>
          </nav>

          <div className="topbar-meta">
            {estado.status === "ok" && (
              <span className="atualizado">
                <span className="atualizado-ponto" aria-hidden="true" />
                Preços de <strong className="num">{fmtDateLong(estado.dataset.atual.atualizadoEm)}</strong>
                {estado.dataset.atual.ticketlogEm && (
                  <>
                    {" "}· Ticketlog <strong className="num">{fmtDateLong(estado.dataset.atual.ticketlogEm)}</strong>
                  </>
                )}
              </span>
            )}
            <button type="button" className="btn-icone btn-tema" onClick={alternar} aria-label={tema === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}>
              {tema === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        {estado.status === "carregando" && (
          <div className="carregando" role="status" aria-live="polite">
            <div className="skel skel-linha" />
            <div className="skel skel-bloco" />
            <div className="skel skel-bloco" />
            <span className="visually-hidden">Carregando dados…</span>
          </div>
        )}
        {estado.status === "erro" && (
          <div className="erro" role="alert">
            <h1>Não foi possível carregar os dados</h1>
            <p>{estado.mensagem}</p>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Tentar novamente
            </button>
          </div>
        )}
        {estado.status === "ok" && (
          <>
            <Outlet />
            <Drawer />
          </>
        )}
      </main>

      <footer className="rodape">Preços e abastecimentos atualizados periodicamente a partir dos relatórios da frota · Rede HG Transportadora</footer>
    </div>
  );
}
