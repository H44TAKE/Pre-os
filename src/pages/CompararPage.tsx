import { useMemo } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useDataset } from "../lib/data";
import { buildAgg } from "../lib/aggregate";
import { fmtBRL, fmtNum } from "../lib/format";
import type { AggPosto, Posto } from "../lib/types";
import { useParams2 } from "../hooks/useParam";
import { AvisoNaoAbastece, BandeiraTag, PageHead } from "../components/ui";
import { RecordsList } from "../components/RecordsList";

function Seletor({ id, rotulo, valor, onChange }: { id: string; rotulo: string; valor: string; onChange: (v: string) => void }) {
  const { postos } = useDataset();
  const grupos = useMemo(() => {
    const m = new Map<string, Posto[]>();
    for (const p of postos) {
      const g = p.regiaoNome ?? "Fora da tabela de preços";
      m.set(g, [...(m.get(g) ?? []), p]);
    }
    for (const [k, v] of m) m.set(k, [...v].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    return [...m.entries()];
  }, [postos]);
  return (
    <div className="seletor">
      <label htmlFor={id}>{rotulo}</label>
      <select id={id} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione um posto…</option>
        {grupos.map(([nome, lista]) => (
          <optgroup key={nome} label={nome}>
            {lista.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

function Lado({ lado, posto, agg }: { lado: "A" | "B"; posto: Posto; agg: AggPosto | null }) {
  return (
    <article className={`cmp-card cmp-${lado}`} aria-label={`Posto ${lado}: ${posto.nome}`}>
      <header>
        <span className="cmp-lado">Posto {lado}</span>
        <h2>{posto.nome}</h2>
        {posto.naoAbastece && <AvisoNaoAbastece />}
        <p className="muted">{posto.foraDaTabela ? "Fora da tabela de preços" : `${posto.cidade} · ${posto.regiaoNome}`}</p>
      </header>

      {posto.foraDaTabela ? (
        <p className="aviso">Sem preço de referência atual para este posto.</p>
      ) : (
        <>
          <div className="cmp-precos">
            <div>
              <div className="stat-rotulo">S-500</div>
              <div className="preco-grande num">{posto.s500 === null ? "—" : fmtBRL(posto.s500)}</div>
            </div>
            <div>
              <div className="stat-rotulo">S-10</div>
              <div className="preco-grande preco-s10 num">{posto.s10 === null ? "—" : fmtBRL(posto.s10)}</div>
            </div>
          </div>
          <div className="cmp-meta">
            <BandeiraTag bandeira={posto.bandeira} />
            <span className="muted">{posto.rodovia}</span>
          </div>
        </>
      )}

      <div className="cmp-hist">
        {agg ? (
          <>
            <div className="cmp-linha"><span>Abastecimentos registrados</span><strong className="num">{agg.count}</strong></div>
            <div className="cmp-linha"><span>Preço médio pago</span><strong className="num">{fmtBRL(agg.avg)}</strong></div>
            <div className="cmp-linha"><span>Total gasto</span><strong className="num">{fmtBRL(agg.totalGasto)}</strong></div>
          </>
        ) : (
          <p className="muted">Sem abastecimentos registrados para este posto.</p>
        )}
      </div>
      {agg && <RecordsList records={agg.records} />}
    </article>
  );
}

function Diferenca({ rotulo, a, b, fmt, menorEMelhor, vence }: { rotulo: string; a: number | null; b: number | null; fmt: (v: number) => string; menorEMelhor: boolean; vence: string }) {
  if (a === null || b === null) {
    return (
      <div className="dif">
        <span className="dif-rotulo">{rotulo}</span>
        <span className="dif-res muted">Dado insuficiente para comparar</span>
      </div>
    );
  }
  const d = a - b;
  const venceA = menorEMelhor ? d < 0 : d > 0;
  const lado = d === 0 ? null : venceA ? "A" : "B";
  const pct = Math.abs(d) / Math.max(Math.abs(a), Math.abs(b)) * 100;
  return (
    <div className="dif">
      <span className="dif-rotulo">{rotulo}</span>
      {lado === null ? (
        <span className="dif-res muted">Empate · <span className="num">{fmt(a)}</span></span>
      ) : (
        <span className="dif-res">
          <strong className={`lado-${lado}`}>Posto {lado}</strong> {vence} · diferença de <span className="num">{fmt(Math.abs(d))}</span> (<span className="num">{pct.toFixed(1).replace(".", ",")}%</span>)
        </span>
      )}
    </div>
  );
}

export function CompararPage() {
  const { postos, abastecimentos } = useDataset();
  const { get, set } = useParams2();
  const idA = get("a") ?? "";
  const idB = get("b") ?? "";
  const pA = postos.find((p) => p.id === idA) ?? null;
  const pB = postos.find((p) => p.id === idB) ?? null;

  const agg = useMemo(() => buildAgg(abastecimentos.rows, abastecimentos.servicoPadrao), [abastecimentos]);
  const aggDe = (p: Posto | null) => (p?.histKey ? agg.find((e) => e.key === p.histKey) ?? null : null);
  const aA = aggDe(pA);
  const aB = aggDe(pB);

  return (
    <>
      <PageHead titulo="Comparar postos">Escolha dois postos para ver preços e histórico de {abastecimentos.servicoPadrao.toLowerCase()} lado a lado.</PageHead>

      <div className="seletores">
        <Seletor id="cmp-a" rotulo="Posto A" valor={idA} onChange={(v) => set({ a: v })} />
        <button type="button" className="btn-icone btn-troca" aria-label="Trocar A e B" disabled={!idA && !idB} onClick={() => set({ a: idB, b: idA })}>
          <ArrowLeftRight size={18} aria-hidden="true" />
        </button>
        <Seletor id="cmp-b" rotulo="Posto B" valor={idB} onChange={(v) => set({ b: v })} />
      </div>

      {!pA || !pB ? (
        <div className="vazio vazio-grande">
          <ArrowLeftRight size={28} aria-hidden="true" />
          <p>Escolha dois postos acima para ver a comparação.</p>
        </div>
      ) : pA.id === pB.id ? (
        <div className="vazio vazio-grande">
          <p>Escolha dois postos diferentes para comparar.</p>
        </div>
      ) : (
        <>
          <div className="cmp-grade">
            <Lado lado="A" posto={pA} agg={aA} />
            <Lado lado="B" posto={pB} agg={aB} />
          </div>
          <section className="cmp-resumo" aria-label="Resumo da comparação">
            <h2>Comparação</h2>
            <Diferenca rotulo="Preço S-500" a={pA.s500} b={pB.s500} fmt={fmtBRL} menorEMelhor vence="mais barato" />
            <Diferenca rotulo="Preço S-10" a={pA.s10} b={pB.s10} fmt={fmtBRL} menorEMelhor vence="mais barato" />
            {aA && aB && (
              <>
                <Diferenca rotulo="Preço médio pago (histórico)" a={aA.avg} b={aB.avg} fmt={fmtBRL} menorEMelhor vence="pagou menos" />
                <Diferenca rotulo="Total de abastecimentos" a={aA.count} b={aB.count} fmt={(v) => `${fmtNum(v).replace(",00", "")}x`} menorEMelhor={false} vence="com mais abastecimentos" />
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
