import { useEffect, useMemo, useRef } from "react";
import { Ban, X } from "lucide-react";
import { useDataset } from "../lib/data";
import { buildAgg } from "../lib/aggregate";
import { fmtBRL, fmtDateLong, fmtDateShort } from "../lib/format";
import type { Posto } from "../lib/types";
import { useFiltroHist } from "../hooks/useFiltroHist";
import { BandeiraTag, Delta } from "./ui";
import { LineChart } from "./LineChart";
import { RecordsList } from "./RecordsList";

function Stat({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: "min" | "max" }) {
  return (
    <div className={`stat ${tom ? `stat-${tom}` : ""}`}>
      <div className="stat-rotulo">{rotulo}</div>
      <div className="stat-valor num">{valor}</div>
    </div>
  );
}

function Historico({ posto }: { posto: Posto }) {
  const { servico, rows } = useFiltroHist();
  const agg = useMemo(() => (posto.histKey ? buildAgg(rows, servico).find((e) => e.key === posto.histKey) ?? null : null), [rows, servico, posto.histKey]);
  const rotulos = useMemo(() => agg?.records.map((r) => fmtDateShort(r.dataISO)) ?? [], [agg]);
  const series = useMemo(() => (agg ? [{ rotulo: posto.nome, dados: agg.records.map((r) => r.valor) }] : []), [agg, posto.nome]);

  if (!posto.histKey) {
    return <p className="aviso">Este posto não aparece no histórico de abastecimentos da frota.</p>;
  }
  if (!agg) {
    return (
      <>
        <div className="stats">
          <Stat rotulo="Abastecimentos" valor="0" />
        </div>
        <p className="aviso">Nenhum registro deste posto para {servico.toLowerCase()} no período escolhido.</p>
      </>
    );
  }
  return (
    <>
      <div className="stats">
        <Stat rotulo="Abastecimentos" valor={String(agg.count)} />
        <Stat rotulo="Menor preço" valor={fmtBRL(agg.min)} tom="min" />
        <Stat rotulo="Maior preço" valor={fmtBRL(agg.max)} tom="max" />
        <Stat rotulo="Preço médio" valor={fmtBRL(agg.avg)} />
        <Stat rotulo="Total gasto" valor={fmtBRL(agg.totalGasto)} />
      </div>
      <LineChart rotulos={rotulos} series={series} altura={210} legenda={false} />
      <RecordsList records={agg.records} />
    </>
  );
}

/** Painel lateral com os detalhes de um posto (preço atual + histórico). Abre com ?posto=<id>. */
export function PostoDrawer({ posto, onClose }: { posto: Posto | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { atual, anterior } = useDataset();
  const { servico } = useFiltroHist();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (posto && !d.open) d.showModal();
    if (!posto && d.open) d.close();
  }, [posto]);

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-labelledby="drawer-titulo"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {posto && (
        <div className="drawer-corpo">
          <header className="drawer-head">
            <div>
              <h2 id="drawer-titulo">{posto.nome}</h2>
              <p className="muted">
                {posto.foraDaTabela ? "Fora da tabela de preços" : [posto.cidade, posto.regiaoNome].filter(Boolean).join(" · ")}
              </p>
            </div>
            <button type="button" className="btn-icone" onClick={onClose} aria-label="Fechar">
              <X size={18} aria-hidden="true" />
            </button>
          </header>

          {posto.naoAbastece && (
            <p className="aviso-posto">
              <Ban size={16} aria-hidden="true" /> A rede não abastece mais neste posto.
            </p>
          )}

          {posto.foraDaTabela ? (
            <p className="aviso">Este posto aparece no histórico de abastecimentos, mas não está na tabela de preços atual. Sem preço de referência.</p>
          ) : (
            <section className="drawer-precos" aria-label="Preço atual">
              <div className="drawer-precos-linha">
                <div>
                  <div className="stat-rotulo">S-500</div>
                  <div className="preco-grande num">{posto.s500 === null ? "—" : fmtBRL(posto.s500)}</div>
                </div>
                <div>
                  <div className="stat-rotulo">S-10</div>
                  <div className="preco-grande preco-s10 num">{posto.s10 === null ? "—" : fmtBRL(posto.s10)}</div>
                </div>
                {anterior && (
                  <div>
                    <div className="stat-rotulo">Variação S-10</div>
                    <div className="preco-grande preco-delta">
                      <Delta valor={posto.deltaS10} />
                    </div>
                  </div>
                )}
              </div>
              <dl className="drawer-meta">
                <div>
                  <dt>Rodovia</dt>
                  <dd>{posto.rodovia}</dd>
                </div>
                <div>
                  <dt>Bandeira</dt>
                  <dd>
                    <BandeiraTag bandeira={posto.bandeira} />
                  </dd>
                </div>
                <div>
                  <dt>Atualizado em</dt>
                  <dd>{fmtDateLong(atual.atualizadoEm)}</dd>
                </div>
              </dl>
            </section>
          )}

          <section aria-label="Histórico de abastecimentos">
            <h3 className="drawer-secao">
              Histórico de abastecimentos <span className="muted">· {servico}</span>
            </h3>
            <Historico posto={posto} />
          </section>
        </div>
      )}
    </dialog>
  );
}
