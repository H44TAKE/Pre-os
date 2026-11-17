import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Search, TrendingUp } from "lucide-react";
import { useDataset } from "../lib/data";
import { buildAgg, datasAtivas, resumoEstabelecimentos } from "../lib/aggregate";
import { estatPosto, kpisHistorico, serieRede, type EstatPosto } from "../lib/historico";
import { fmtBRL, fmtDateLong, fmtDateShort, fmtLitros, fmtNum, plural } from "../lib/format";
import { norm } from "../lib/match";
import { useVisibilidade } from "../lib/storage";
import { useFiltroHist } from "../hooks/useFiltroHist";
import { useParams2 } from "../hooks/useParam";
import { AvisoNaoAbastece, Chips, Delta, PageHead, Switch, Vazio } from "../components/ui";
import { LineChart } from "../components/LineChart";
import { Sparkline } from "../components/Sparkline";

const MAX_DESTAQUES = 6;

type Coluna = "nome" | "count" | "quantidade" | "gasto" | "medio" | "min" | "max" | "ultimo" | "variacao";
interface Ordem {
  col: Coluna;
  dir: 1 | -1;
}

function addDias(iso: string, dias: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function ordenar(lista: EstatPosto[], { col, dir }: Ordem): EstatPosto[] {
  return [...lista].sort((a, b) => {
    if (col === "nome") return dir * a.nome.localeCompare(b.nome, "pt-BR");
    const va = a[col];
    const vb = b[col];
    if (va === null && vb === null) return 0;
    if (va === null) return 1; // sem valor vai sempre para o fim
    if (vb === null) return -1;
    return dir * (va - vb) || a.nome.localeCompare(b.nome, "pt-BR");
  });
}

const CABECALHOS: { col: Coluna; rotulo: string; num: boolean; opc?: boolean }[] = [
  { col: "nome", rotulo: "Posto", num: false },
  { col: "count", rotulo: "Abast.", num: true, opc: true },
  { col: "quantidade", rotulo: "Quantidade", num: true, opc: true },
  { col: "gasto", rotulo: "Gasto total", num: true, opc: true },
  { col: "medio", rotulo: "Preço médio", num: true },
  { col: "min", rotulo: "Menor", num: true, opc: true },
  { col: "max", rotulo: "Maior", num: true, opc: true },
  { col: "ultimo", rotulo: "Último", num: true, opc: true },
  { col: "variacao", rotulo: "Variação", num: true },
];

function Kpi({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-rotulo">{rotulo}</span>
      <strong className="kpi-valor num">{valor}</strong>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

export function HistoricoPage() {
  const { abastecimentos, postos } = useDataset();
  const { servico, de, ate, minData, maxData, rows, setServico, setPeriodo } = useFiltroHist();
  const { set } = useParams2();
  const vis = useVisibilidade();
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>({ col: "count", dir: -1 });
  const [destaques, setDestaques] = useState<string[]>([]);
  const [tabelaAberta, setTabelaAberta] = useState(false);

  const abrirPosto = (histKey: string) => {
    const p = postos.find((x) => x.histKey === histKey);
    if (p) set({ posto: p.id }, { push: true });
  };

  const bloqueados = useMemo(() => new Set(postos.filter((p) => p.naoAbastece && p.histKey).map((p) => p.histKey as string)), [postos]);
  const agg = useMemo(() => buildAgg(rows, servico), [rows, servico]);
  const todosPostos = useMemo(() => resumoEstabelecimentos(abastecimentos.rows), [abastecimentos]);
  const visiveis = useMemo(() => agg.filter((e) => !vis.ocultos.has(e.key)), [agg, vis.ocultos]);
  const datas = useMemo(() => datasAtivas(visiveis), [visiveis]);
  const kpis = useMemo(() => kpisHistorico(visiveis), [visiveis]);
  const rede = useMemo(() => serieRede(visiveis, datas), [visiveis, datas]);
  const stats = useMemo(() => agg.map(estatPosto), [agg]);

  const q = norm(busca);
  const linhas = useMemo(() => ordenar(stats.filter((s) => !q || norm(s.nome).includes(q)), ordem), [stats, q, ordem]);

  const destaquesAtivos = destaques.filter((k) => visiveis.some((v) => v.key === k));
  const rotulos = useMemo(() => datas.map(fmtDateShort), [datas]);
  const series = useMemo(
    () => [
      { rotulo: "Média da rede", dados: rede.media, tipo: "media" as const },
      { rotulo: "Mais barato do dia", dados: rede.min, tipo: "min" as const },
      { rotulo: "Mais caro do dia", dados: rede.max, tipo: "max" as const },
      ...destaquesAtivos.flatMap((k) => {
        const e = visiveis.find((v) => v.key === k);
        return e ? [{ rotulo: e.nome, dados: datas.map((d) => (d in e.byDate ? e.byDate[d] : null)), tipo: "posto" as const }] : [];
      }),
    ],
    [rede, destaquesAtivos, visiveis, datas],
  );

  const temPreco = kpis.medio !== null;
  const periodoAtivo: "tudo" | "7" | "14" | "custom" = !de && !ate ? "tudo" : ate === null && de === addDias(maxData, -6) ? "7" : ate === null && de === addDias(maxData, -13) ? "14" : "custom";

  const alternarDestaque = (key: string) => setDestaques((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev.length < MAX_DESTAQUES ? [...prev, key] : prev));
  const ordenarPor = (col: Coluna) => setOrdem((o) => (o.col === col ? { col, dir: (o.dir * -1) as 1 | -1 } : { col, dir: col === "nome" ? 1 : -1 }));

  const linhasTabela = visiveis.filter((e) => !q || norm(e.nome).includes(q));

  return (
    <>
      <PageHead titulo="Histórico de abastecimentos">
        {fmtDateLong(minData)} a {fmtDateLong(maxData)} · {plural(todosPostos.length, "posto", "postos")} na base
      </PageHead>

      <section className="filtros" aria-label="Filtros">
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
      </section>

      <section className="kpis" aria-label="Resumo do período">
        <Kpi rotulo="Abastecimentos" valor={String(kpis.registros)} sub={plural(kpis.postos, "posto", "postos")} />
        <Kpi rotulo="Quantidade" valor={kpis.quantidade > 0 ? fmtLitros(kpis.quantidade) : "—"} />
        <Kpi rotulo="Gasto total" valor={fmtBRL(kpis.gasto)} />
        <Kpi rotulo="Preço médio" valor={temPreco ? fmtBRL(kpis.medio) : "—"} sub={temPreco ? "ponderado pela quantidade" : "produto sem preço unitário"} />
      </section>

      <section className="bloco" aria-label="Evolução do preço">
        <div className="bloco-topo">
          <div>
            <h2>Evolução do preço · {servico}</h2>
            <p className="muted">
              {destaquesAtivos.length
                ? `Média da rede com ${plural(destaquesAtivos.length, "posto destacado", "postos destacados")}.`
                : "Média da rede e faixa do dia. Use o botão de gráfico na tabela abaixo para destacar postos (até 6)."}
            </p>
          </div>
          {destaquesAtivos.length > 0 && (
            <button type="button" className="link" onClick={() => setDestaques([])}>
              Limpar destaques
            </button>
          )}
        </div>
        {temPreco && datas.length > 0 ? <LineChart rotulos={rotulos} series={series} altura={340} /> : <Vazio>{visiveis.length === 0 ? "Nenhum posto visível. Ative ao menos um posto na tabela abaixo." : "Este produto não tem preço unitário para mostrar no gráfico."}</Vazio>}
      </section>

      <section className="bloco" aria-label="Postos">
        <div className="bloco-topo">
          <div>
            <h2>Postos</h2>
            <p className="muted">Clique no nome para ver os detalhes. A chave liga ou desliga o posto no gráfico, nos totais e na tabela diária; a escolha fica salva neste navegador.</p>
          </div>
          <label className="busca busca-pequena">
            <Search size={16} aria-hidden="true" />
            <span className="visually-hidden">Filtrar postos</span>
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar postos…" autoComplete="off" />
          </label>
        </div>

        {linhas.length === 0 ? (
          <Vazio>{stats.length === 0 ? "Nenhum abastecimento deste produto no período." : "Nenhum posto encontrado para essa busca."}</Vazio>
        ) : (
          <div className="tabela-wrap tabela-rolagem tabela-rank-wrap">
            <table className="tabela tabela-rank">
              <thead>
                <tr>
                  {CABECALHOS.map((c) => (
                    <th key={c.col} scope="col" className={`${c.num ? "col-num" : ""} ${c.opc ? "col-opc" : ""}`} aria-sort={ordem.col === c.col ? (ordem.dir === 1 ? "ascending" : "descending") : "none"}>
                      <button type="button" className="th-ordem" onClick={() => ordenarPor(c.col)}>
                        {c.rotulo}
                        {ordem.col === c.col && (ordem.dir === 1 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="col-opc">
                    Tendência
                  </th>
                  <th scope="col" className="col-acoes">
                    <span className="visually-hidden">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((s) => {
                  const on = vis.visivel(s.key);
                  const destacado = destaques.includes(s.key);
                  const cheio = !destacado && destaques.length >= MAX_DESTAQUES;
                  return (
                    <tr key={s.key} className={on ? "" : "linha-off"}>
                      <th scope="row">
                        <button type="button" className="link-posto" onClick={() => abrirPosto(s.key)} title={`Ver detalhes de ${s.nome}`}>
                          {s.nome}
                        </button>
                        {bloqueados.has(s.key) && <AvisoNaoAbastece />}
                        <span className="sub">último em {fmtDateShort(s.ultimaData)}</span>
                      </th>
                      <td className="col-num col-opc num">{s.count}</td>
                      <td className="col-num col-opc num">{s.quantidade > 0 ? fmtLitros(s.quantidade) : "—"}</td>
                      <td className="col-num col-opc num">{fmtBRL(s.gasto)}</td>
                      <td className="col-num num c-medio">{s.medio !== null ? fmtNum(s.medio) : "—"}</td>
                      <td className="col-num col-opc num min">{s.min !== null ? fmtNum(s.min) : "—"}</td>
                      <td className="col-num col-opc num max">{s.max !== null ? fmtNum(s.max) : "—"}</td>
                      <td className="col-num col-opc num">{s.ultimo !== null ? fmtNum(s.ultimo) : "—"}</td>
                      <td className="col-num c-var">{s.variacao !== null ? <Delta valor={Math.round(s.variacao * 100) / 100} contra="no período" /> : <span className="muted">—</span>}</td>
                      <td className="col-opc spark-cel">{s.ultimo !== null ? <Sparkline valores={s.serie} /> : <span className="muted">—</span>}</td>
                      <td className="col-acoes">
                        <button type="button" className="btn-icone btn-mini" aria-pressed={destacado} disabled={cheio || !on} title={destacado ? "Tirar do gráfico" : cheio ? `Máximo de ${MAX_DESTAQUES} destaques` : "Destacar no gráfico"} aria-label={`${destacado ? "Tirar" : "Destacar"} ${s.nome} no gráfico`} onClick={() => alternarDestaque(s.key)}>
                          <TrendingUp size={15} aria-hidden="true" />
                        </button>
                        <Switch ligado={on} onChange={() => vis.alternar(s.key)} rotulo={`${on ? "Ocultar" : "Mostrar"} ${s.nome}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="rank-rodape">
          <div className="acoes">
            <button type="button" className="link" onClick={vis.mostrarTodos}>
              Mostrar todos
            </button>
            <button type="button" className="link" onClick={() => vis.ocultarTodos(todosPostos.map((e) => e.key))}>
              Ocultar todos
            </button>
          </div>
          <span className="muted">
            {visiveis.length} de {stats.length} postos visíveis neste produto
          </span>
        </div>
      </section>

      <section className="bloco" aria-label="Tabela diária">
        <div className="bloco-topo">
          <div>
            <h2>Preço por dia</h2>
            <p className="muted">Preço unitário registrado em cada dia, para os postos visíveis.</p>
          </div>
          <button type="button" className="btn" aria-expanded={tabelaAberta} onClick={() => setTabelaAberta((v) => !v)}>
            {tabelaAberta ? "Ocultar tabela" : "Ver tabela diária"}
            <ChevronDown size={16} aria-hidden="true" className={tabelaAberta ? "girar" : ""} />
          </button>
        </div>
        {tabelaAberta &&
          (linhasTabela.length === 0 ? (
            <Vazio>Nenhum posto visível para esta busca ou produto.</Vazio>
          ) : (
            <>
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
                    {linhasTabela.map((e) => (
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
              <div className="legenda">
                <span><i className="sw sw-min" /> Menor preço do posto no período</span>
                <span><i className="sw sw-max" /> Maior preço do posto no período</span>
                <span>— Sem abastecimento registrado no dia</span>
              </div>
            </>
          ))}
      </section>
    </>
  );
}
