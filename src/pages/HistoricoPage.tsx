import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useDataset } from "../lib/data";
import { buildAgg, datasAtivas, resumoEstabelecimentos } from "../lib/aggregate";
import { fmtBRL, fmtDateLong, fmtDateShort, plural } from "../lib/format";
import { norm } from "../lib/match";
import { useVisibilidade } from "../lib/storage";
import { useFiltroHist } from "../hooks/useFiltroHist";
import { useParams2 } from "../hooks/useParam";
import { Chips, PageHead, Switch, Vazio } from "../components/ui";
import { LineChart } from "../components/LineChart";

const MAX_LINHAS = 8;

function addDias(iso: string, dias: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function HistoricoPage() {
  const { abastecimentos, postos } = useDataset();
  const { servico, de, ate, minData, maxData, rows, setServico, setPeriodo } = useFiltroHist();
  const { set } = useParams2();
  const vis = useVisibilidade();
  const [busca, setBusca] = useState("");

  const abrirPosto = (histKey: string) => {
    const p = postos.find((x) => x.histKey === histKey);
    if (p) set({ posto: p.id }, { push: true });
  };

  const todos = useMemo(() => resumoEstabelecimentos(rows), [rows]);
  const agg = useMemo(() => buildAgg(rows, servico), [rows, servico]);
  const datas = useMemo(() => datasAtivas(agg), [agg]);

  const q = norm(busca);
  const painel = todos.filter((e) => !q || norm(e.nome).includes(q));
  const visiveis = useMemo(() => agg.filter((e) => !vis.ocultos.has(e.key)), [agg, vis.ocultos]);
  const plotados = useMemo(() => [...visiveis].sort((a, b) => b.count - a.count).slice(0, MAX_LINHAS), [visiveis]);
  const rotulos = useMemo(() => datas.map(fmtDateShort), [datas]);
  const series = useMemo(() => plotados.map((e) => ({ rotulo: e.nome, dados: datas.map((d) => (d in e.byDate ? e.byDate[d] : null)) })), [plotados, datas]);
  const linhas = visiveis.filter((e) => !q || norm(e.nome).includes(q));

  const periodoAtivo: "tudo" | "7" | "14" | "custom" = !de && !ate ? "tudo" : ate === null && de === addDias(maxData, -6) ? "7" : ate === null && de === addDias(maxData, -13) ? "14" : "custom";

  const nPostos = new Set(abastecimentos.rows.map((r) => r.estabKey)).size;

  return (
    <>
      <PageHead titulo="Histórico de abastecimentos">
        <strong className="num">{rows.length}</strong> abastecimentos no período · <strong className="num">{todos.length}</strong> de {nPostos} postos · {fmtDateLong(minData)} a {fmtDateLong(maxData)}
      </PageHead>

      <div className="toolbar toolbar-hist">
        <div className="campo-grupo">
          <span className="campo-rotulo">Produto</span>
          <Chips rotulo="Produto" valor={servico} onChange={setServico} opcoes={abastecimentos.servicos.map((s) => ({ valor: s, rotulo: s }))} />
        </div>
        <div className="campo-grupo">
          <span className="campo-rotulo">Período</span>
          <Chips
            rotulo="Período"
            valor={periodoAtivo}
            onChange={(v) => {
              if (v === "tudo") setPeriodo(null, null);
              if (v === "7") setPeriodo(addDias(maxData, -6), null);
              if (v === "14") setPeriodo(addDias(maxData, -13), null);
            }}
            opcoes={[
              { valor: "tudo", rotulo: "Tudo" },
              { valor: "14", rotulo: "Últimos 14 dias" },
              { valor: "7", rotulo: "Últimos 7 dias" },
              ...(periodoAtivo === "custom" ? [{ valor: "custom" as const, rotulo: "Personalizado" }] : []),
            ]}
          />
          <label className="campo campo-data">
            <span>De</span>
            <input type="date" value={de ?? ""} min={minData} max={ate ?? maxData} onChange={(e) => setPeriodo(e.target.value || null, ate)} />
          </label>
          <label className="campo campo-data">
            <span>Até</span>
            <input type="date" value={ate ?? ""} min={de ?? minData} max={maxData} onChange={(e) => setPeriodo(de, e.target.value || null)} />
          </label>
        </div>
      </div>

      <section className="painel" aria-label="Postos monitorados">
        <div className="painel-topo">
          <div>
            <h2>Postos monitorados</h2>
            <p className="muted">Ligue ou desligue os postos que aparecem no gráfico e na tabela. A escolha fica salva neste navegador.</p>
          </div>
          <label className="busca busca-pequena">
            <Search size={16} aria-hidden="true" />
            <span className="visually-hidden">Filtrar postos</span>
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar postos…" autoComplete="off" />
          </label>
        </div>
        <ul className="painel-grade">
          {painel.map((e) => {
            const on = vis.visivel(e.key);
            return (
              <li key={e.key} className={`painel-item ${on ? "" : "off"}`}>
                <button type="button" className="painel-nome" onClick={() => abrirPosto(e.key)}>
                  <span className="nm">{e.nome}</span>
                  <span className="cnt">{plural(e.count, "registro", "registros")}</span>
                </button>
                <Switch ligado={on} onChange={() => vis.alternar(e.key)} rotulo={`${on ? "Ocultar" : "Mostrar"} ${e.nome}`} />
              </li>
            );
          })}
          {painel.length === 0 && <li className="vazio-li">Nenhum posto encontrado para essa busca.</li>}
        </ul>
        <div className="painel-rodape">
          <div className="acoes">
            <button type="button" className="link" onClick={vis.mostrarTodos}>
              Mostrar todos
            </button>
            <button type="button" className="link" onClick={() => vis.ocultarTodos(resumoEstabelecimentos(abastecimentos.rows).map((e) => e.key))}>
              Ocultar todos
            </button>
          </div>
          <span className="muted">
            {todos.filter((e) => vis.visivel(e.key)).length} de {todos.length} postos visíveis
          </span>
        </div>
      </section>

      <section className="bloco" aria-label="Evolução do preço">
        <div className="bloco-topo">
          <h2>Evolução do preço · {servico}</h2>
          <p className="muted">
            {visiveis.length === 0
              ? "Nenhum posto visível para este produto."
              : visiveis.length > MAX_LINHAS
                ? `Mostrando os ${MAX_LINHAS} postos com mais registros, de ${visiveis.length} visíveis. Oculte outros no painel acima para focar.`
                : "Valor unitário por data, para os postos visíveis."}
          </p>
        </div>
        {plotados.length ? <LineChart rotulos={rotulos} series={series} /> : <Vazio>Nenhum posto visível. Ative ao menos um posto no painel acima.</Vazio>}
      </section>

      <section className="bloco" aria-label="Tabela cruzada">
        <div className="bloco-topo">
          <h2>Estabelecimento × Data</h2>
          <p className="muted">Preço unitário registrado em cada dia, para os postos visíveis.</p>
        </div>
        {linhas.length === 0 ? (
          <Vazio>Nenhum posto visível para esta busca ou produto.</Vazio>
        ) : (
          <div className="tabela-wrap tabela-rolagem">
            <table className="tabela tabela-cruzada">
              <thead>
                <tr>
                  <th scope="col">Estabelecimento</th>
                  {datas.map((d) => (
                    <th scope="col" key={d} className="num">
                      {fmtDateShort(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((e) => (
                  <tr key={e.key}>
                    <th scope="row">
                      <button type="button" className="link-posto" onClick={() => abrirPosto(e.key)} title={`Ver detalhes de ${e.nome}`}>
                        {e.nome}
                      </button>
                    </th>
                    {datas.map((d) => {
                      if (!(d in e.byDate)) return <td key={d} className="vazia">—</td>;
                      const v = e.byDate[d];
                      const cls = e.count > 1 && v === e.tableMin ? "min" : e.count > 1 && v === e.tableMax ? "max" : "";
                      return (
                        <td key={d} className={`num ${cls}`}>
                          {fmtBRL(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="legenda">
          <span><i className="sw sw-min" /> Menor preço do posto no período</span>
          <span><i className="sw sw-max" /> Maior preço do posto no período</span>
          <span>— Sem abastecimento registrado no dia</span>
        </div>
      </section>
    </>
  );
}
