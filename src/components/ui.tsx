import { ArrowDownRight, ArrowUpRight, Ban, Equal } from "lucide-react";
import type { ReactNode } from "react";
import { fmtDelta } from "../lib/format";

const CORES_BANDEIRA: Record<string, string> = {
  BR: "#0c8a3e",
  IPIRANGA: "#d9531e",
  SHELL: "#c8272d",
  "REDE HG": "#17498a",
  TOTAL: "#0b3d91",
  "RIO BRANCO": "#0e7c86",
};
export function corBandeira(b: string | null): string {
  return (b && CORES_BANDEIRA[b]) || "#5b6b82";
}

export function BandeiraTag({ bandeira }: { bandeira: string | null }) {
  if (!bandeira) return <span className="muted">—</span>;
  return (
    <span className="bandeira">
      <span className="bandeira-dot" style={{ background: corBandeira(bandeira) }} aria-hidden="true" />
      {bandeira}
    </span>
  );
}

/** Etiqueta de aviso para postos em que a rede não abastece mais. */
export function AvisoNaoAbastece() {
  return (
    <span className="selo-aviso" title="A rede não abastece mais neste posto">
      <Ban size={12} aria-hidden="true" />
      Não abastecemos mais
    </span>
  );
}

/** Marca discreta: o S-10 veio da tabela (portal/PDF) e não da leitura da Ticketlog. */
export function FonteTabela() {
  return (
    <span className="fonte-tabela" title="Preço da tabela (portal/PDF): a Ticketlog não tinha um preço recente deste posto">
      tabela
    </span>
  );
}

/** Variação de preço: queda é boa (verde), alta é ruim (vermelho). */
export function Delta({ valor, contra = "desde a atualização anterior" }: { valor: number | null; contra?: string }) {
  if (valor === null) return <span className="muted">—</span>;
  if (valor === 0)
    return (
      <span className="delta delta-zero" title={`Sem variação ${contra}`}>
        <Equal size={14} aria-hidden="true" />
        <span className="num">0,00</span>
      </span>
    );
  const sobe = valor > 0;
  const Icone = sobe ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`delta ${sobe ? "delta-up" : "delta-down"}`} title={`${sobe ? "Subiu" : "Caiu"} ${contra}`}>
      <Icone size={14} aria-hidden="true" />
      <span className="num">{fmtDelta(valor)}</span>
    </span>
  );
}

export interface Opcao<T extends string> {
  valor: T;
  rotulo: string;
  titulo?: string;
}
export function Chips<T extends string>({
  opcoes,
  valor,
  onChange,
  rotulo,
}: {
  opcoes: Opcao<T>[];
  valor: T;
  onChange: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div className="chips" role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.valor} type="button" className="chip" aria-pressed={valor === o.valor} title={o.titulo} onClick={() => onChange(o.valor)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function Switch({ ligado, onChange, rotulo }: { ligado: boolean; onChange: () => void; rotulo: string }) {
  return <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} className="switch" onClick={onChange} />;
}

export function PageHead({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <h1>{titulo}</h1>
      {children && <div className="page-head-sub">{children}</div>}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="vazio">{children}</div>;
}
