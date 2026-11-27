import { Fragment, useMemo } from "react";
import { Search } from "lucide-react";
import { useDataset } from "../lib/data";
import { fmtBRL, fmtNum, plural } from "../lib/format";
import { norm } from "../lib/match";
import type { Posto } from "../lib/types";
import { useParams2 } from "../hooks/useParam";
import { AvisoNaoAbastece, BandeiraTag, Chips, Delta, FonteTabela, PageHead, Vazio } from "../components/ui";

type Ordem = "regiao" | "menor" | "maior" | "nome";
const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: "regiao", rotulo: "Por região" },
  { valor: "menor", rotulo: "Menor S-10" },
  { valor: "maior", rotulo: "Maior S-10" },
  { valor: "nome", rotulo: "Nome (A–Z)" },
];

function Resumo() {
  const { kpis, atual } = useDataset();
  const { get, set } = useParams2();
  const abrir = (p: Posto) => set({ posto: p.id }, { push: true });
  return (
    <section className="resumo" aria-label="Resumo da rede">
      <div className="resumo-col">
        <h2 className="resumo-tit">Faixa de S-10 na rede</h2>
        <div className="faixa">
          {kpis.menor && (
            <button type="button" className="faixa-item faixa-min" onClick={() => abrir(kpis.menor!)}>
              <span className="faixa-rotulo">Menor</span>
              <span className="faixa-valor num">{fmtBRL(kpis.menor.s10)}</span>
              <span className="faixa-posto">
                {kpis.menor.nome} · {kpis.menor.regiaoNome}
              </span>
            </button>
          )}
          {kpis.maior && (
            <button type="button" className="faixa-item faixa-max" onClick={() => abrir(kpis.maior!)}>
              <span className="faixa-rotulo">Maior</span>
              <span className="faixa-valor num">{fmtBRL(kpis.maior.s10)}</span>
              <span className="faixa-posto">
                {kpis.maior.nome} · {kpis.maior.regiaoNome}
              </span>
            </button>
          )}
        </div>
        <p className="muted resumo-nota">
          {plural(kpis.total, "posto", "postos")} em {atual.regioes.length} regiões
          {kpis.semPreco > 0 && ` · ${plural(kpis.semPreco, "sem S-10", "sem S-10")}`}
        </p>
      </div>

      <div className="resumo-col">
        <h2 className="resumo-tit">Média de S-10 por região</h2>
        <ul className="media-lista">
          {kpis.mediaPorRegiao.map((r) => (
            <li key={r.sigla}>
              <button
                type="button"
                className="media-linha"
                aria-pressed={get("regiao") === r.sigla}
                onClick={() => set({ regiao: get("regiao") === r.sigla ? null : r.sigla })}
                title={`Filtrar por ${r.nome}`}
              >
                <span className="media-sigla">{r.sigla}</span>
                <span className="media-nome">{r.nome}</span>
                <span className="media-valor num">{fmtNum(r.media)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="resumo-col">
        <h2 className="resumo-tit">5 mais baratos · S-10</h2>
        <ol className="top5">
          {kpis.top5.map((p) => (
            <li key={p.id}>
              <button type="button" className="top5-linha" onClick={() => abrir(p)}>
                <span className="top5-nome">{p.nome}</span>
                <span className="top5-reg">{p.regiaoSigla}</span>
                <span className="top5-valor num">{fmtNum(p.s10)}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Linha({ p, mostrarRegiao, melhor, comVariacao, marcarFonte }: { p: Posto; mostrarRegiao: boolean; melhor: boolean; comVariacao: boolean; marcarFonte: boolean }) {
  const { set } = useParams2();
  const abrir = () => set({ posto: p.id }, { push: true });
  return (
    <tr className={`linha-posto${p.naoAbastece ? " nao-abastece" : ""}`} onClick={abrir}>
      <th scope="row" className="col-posto">
        <button type="button" className="link-posto" onClick={(e) => { e.stopPropagation(); abrir(); }} aria-label={`Ver detalhes de ${p.nome}`}>
          {p.nome}
        </button>
        {p.naoAbastece && <AvisoNaoAbastece />}
        <span className="sub">
          {p.cidade}
          {mostrarRegiao && ` · ${p.regiaoSigla}`}
        </span>
      </th>
      <td className="col-rodovia">{p.rodovia}</td>
      <td className="col-bandeira">
        <BandeiraTag bandeira={p.bandeira} />
      </td>
      <td className="col-preco num">{p.s500 === null ? <span className="muted">—</span> : fmtNum(p.s500)}</td>
      <td className="col-preco col-s10 num">
        {p.s10 === null ? <span className="muted">—</span> : fmtNum(p.s10)}
        {marcarFonte && p.s10 !== null && p.s10Fonte !== "ticketlog" && <FonteTabela />}
        {melhor && !p.naoAbastece && <span className="selo-barato">mais barato</span>}
      </td>
      {comVariacao && (
        <td className="col-delta">
          <Delta valor={p.deltaS10} />
        </td>
      )}
    </tr>
  );
}

export function PrecosPage() {
  const { postos, atual, anterior } = useDataset();
  const marcarFonte = Boolean(atual.ticketlogEm);
  const { get, set } = useParams2();
  const regiao = get("regiao") ?? "TODAS";
  const bandeira = get("bandeira") ?? "TODAS";
  const ordem = (ORDENS.some((o) => o.valor === get("ordem")) ? get("ordem") : "regiao") as Ordem;
  const q = get("q") ?? "";

  const bandeiras = useMemo(() => [...new Set(postos.filter((p) => p.bandeira).map((p) => p.bandeira!))].sort(), [postos]);

  const menorPorRegiao = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of atual.regioes) {
      if (r.postos.length < 2) continue;
      const v = r.postos.filter((p) => p.s10 !== null).map((p) => p.s10!);
      if (v.length) m.set(r.sigla, Math.min(...v));
    }
    return m;
  }, [atual]);

  const filtrados = useMemo(() => {
    const nq = norm(q);
    return postos.filter((p) => {
      if (p.foraDaTabela) return false;
      if (regiao !== "TODAS" && p.regiaoSigla !== regiao) return false;
      if (bandeira !== "TODAS" && p.bandeira !== bandeira) return false;
      if (!nq) return true;
      return [p.nome, p.cidade, p.bandeira, p.rodovia].some((c) => norm(c).includes(nq));
    });
  }, [postos, regiao, bandeira, q]);

  const ordenados = useMemo(() => {
    if (ordem === "regiao") return filtrados;
    const nulo = ordem === "menor" ? Infinity : -Infinity;
    return [...filtrados].sort((a, b) => {
      if (ordem === "nome") return a.nome.localeCompare(b.nome, "pt-BR");
      const va = a.s10 ?? nulo;
      const vb = b.s10 ?? nulo;
      return ordem === "menor" ? va - vb : vb - va;
    });
  }, [filtrados, ordem]);

  const comVariacao = anterior !== null;
  const agrupar = ordem === "regiao";

  return (
    <>
      <PageHead titulo="Preços atuais">Diesel por posto da rede credenciada. Clique em um posto para ver o histórico de abastecimentos.</PageHead>
      <Resumo />

      <div className="toolbar">
        <label className="busca">
          <Search size={16} aria-hidden="true" />
          <span className="visually-hidden">Buscar posto, cidade, rodovia ou bandeira</span>
          <input type="search" value={q} onChange={(e) => set({ q: e.target.value })} placeholder="Buscar posto, cidade, rodovia ou bandeira…" autoComplete="off" />
        </label>
        <Chips
          rotulo="Região"
          valor={regiao}
          onChange={(v) => set({ regiao: v === "TODAS" ? null : v })}
          opcoes={[{ valor: "TODAS", rotulo: "Todas" }, ...atual.regioes.map((r) => ({ valor: r.sigla, rotulo: r.sigla, titulo: r.nome }))]}
        />
        <label className="campo">
          <span>Bandeira</span>
          <select value={bandeira} onChange={(e) => set({ bandeira: e.target.value === "TODAS" ? null : e.target.value })}>
            <option value="TODAS">Todas</option>
            {bandeiras.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Ordenar</span>
          <select value={ordem} onChange={(e) => set({ ordem: e.target.value === "regiao" ? null : e.target.value })}>
            {ORDENS.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      {ordenados.length === 0 ? (
        <Vazio>Nenhum posto encontrado com esses filtros.</Vazio>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela tabela-precos">
            <thead>
              <tr>
                <th scope="col">Posto</th>
                <th scope="col" className="col-rodovia">Rodovia</th>
                <th scope="col">Bandeira</th>
                <th scope="col" className="col-preco">S-500</th>
                <th scope="col" className="col-preco">S-10</th>
                {comVariacao && <th scope="col" className="col-delta" title="Variação do S-10 desde a atualização anterior">Var. S-10</th>}
              </tr>
            </thead>
            <tbody>
              {agrupar
                ? atual.regioes.map((r) => {
                    const doGrupo = ordenados.filter((p) => p.regiaoSigla === r.sigla);
                    if (!doGrupo.length) return null;
                    return (
                      <Fragment key={r.sigla}>
                        <tr className="grupo">
                          <th colSpan={comVariacao ? 6 : 5} scope="colgroup">
                            {r.nome} <span className="muted">· {plural(doGrupo.length, "posto", "postos")}</span>
                          </th>
                        </tr>
                        {doGrupo.map((p) => (
                          <Linha key={p.id} p={p} mostrarRegiao={false} melhor={p.s10 !== null && menorPorRegiao.get(r.sigla) === p.s10} comVariacao={comVariacao} marcarFonte={marcarFonte} />
                        ))}
                      </Fragment>
                    );
                  })
                : ordenados.map((p) => <Linha key={p.id} p={p} mostrarRegiao melhor={p.s10 !== null && menorPorRegiao.get(p.regiaoSigla!) === p.s10} comVariacao={comVariacao} marcarFonte={marcarFonte} />)}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
