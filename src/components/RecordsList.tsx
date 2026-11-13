import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Abastecimento } from "../lib/types";
import { fmtBRL, fmtDateLong, fmtLitros, plural } from "../lib/format";

function Linha({ r }: { r: Abastecimento }) {
  const quando = fmtDateLong(r.dataISO) + (r.hora ? ` · ${r.hora.slice(0, 5)}` : "");
  const temTotal = r.valorTotal !== null;
  return (
    <li className="reg">
      <div className="reg-top">
        <span className="reg-quando">{quando}</span>
        <span className="reg-total num">{fmtBRL(temTotal ? r.valorTotal : r.valor)}</span>
      </div>
      {r.motorista && <div className="reg-motorista">{r.motorista}</div>}
      {temTotal && (
        <div className="reg-sub num">
          {r.quantidade !== null && `${fmtLitros(r.quantidade)} · `}
          {fmtBRL(r.valor)}/L
        </div>
      )}
    </li>
  );
}

/** Lista de abastecimentos, recolhida por padrão (mais recente primeiro). */
export function RecordsList({ records }: { records: Abastecimento[] }) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const rotulo = `Ver ${plural(records.length, "abastecimento", "abastecimentos")}`;
  return (
    <div className="records">
      <button type="button" className="btn btn-block" aria-expanded={aberto} aria-controls={id} onClick={() => setAberto((a) => !a)}>
        {aberto ? "Ocultar abastecimentos" : rotulo}
        <ChevronDown size={16} aria-hidden="true" className={aberto ? "girar" : ""} />
      </button>
      {aberto && (
        <ul className="records-list" id={id}>
          {records
            .slice()
            .reverse()
            .map((r, i) => (
              <Linha key={`${r.dataISO}-${r.hora}-${i}`} r={r} />
            ))}
        </ul>
      )}
    </div>
  );
}
