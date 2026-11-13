import { useEffect, useRef } from "react";
import { CategoryScale, Chart, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip } from "chart.js";
import { fmtBRL } from "../lib/format";
import { useTema } from "../lib/tema";

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

export interface Serie {
  rotulo: string;
  dados: (number | null)[];
  /** media/min/max são linhas da rede (destacada e tracejadas); posto usa a paleta */
  tipo?: "media" | "min" | "max" | "posto";
}

const CORES_CLARO = ["#0a5cc7", "#d99a00", "#7a4fd0", "#0e8a96", "#c2418a", "#5b6f8a", "#8a5a2b", "#e07b00"];
const CORES_ESCURO = ["#5aa2ff", "#ffc83d", "#b196ff", "#4fd0dc", "#f27cc0", "#9fb3cf", "#c9996a", "#ff9a3d"];
const BOM = { claro: "#1b8a42", escuro: "#4cd380" };
const RUIM = { claro: "#d93a30", escuro: "#ff7b6f" };

export function LineChart({ rotulos, series, altura = 320, legenda = true }: { rotulos: string[]; series: Serie[]; altura?: number; legenda?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { tema } = useTema();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const escuro = tema === "dark";
    const cores = escuro ? CORES_ESCURO : CORES_CLARO;
    const grade = escuro ? "rgba(255,255,255,0.08)" : "rgba(15,42,77,0.08)";
    const texto = escuro ? "#a9b8cc" : "#4a5a70";

    let nPosto = series.some((x) => x.tipo && x.tipo !== "posto") ? 1 : 0;
    const chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: rotulos,
        datasets: series.map((s) => {
          const tipo = s.tipo ?? "posto";
          if (tipo === "posto") {
            const cor = cores[nPosto++ % cores.length];
            return { label: s.rotulo, data: s.dados, borderColor: cor, backgroundColor: cor, spanGaps: true, tension: 0.25, borderWidth: 2, pointRadius: series.length > 1 ? 2.5 : 3.5, pointHoverRadius: 5, pointBorderWidth: 0 };
          }
          const cor = tipo === "media" ? cores[0] : tipo === "min" ? (escuro ? BOM.escuro : BOM.claro) : escuro ? RUIM.escuro : RUIM.claro;
          return { label: s.rotulo, data: s.dados, borderColor: cor, backgroundColor: cor, spanGaps: true, tension: 0.3, borderWidth: tipo === "media" ? 3.5 : 1.5, borderDash: tipo === "media" ? [] : [5, 4], pointRadius: 0, pointHoverRadius: 4, pointBorderWidth: 0, order: tipo === "media" ? 0 : 1 };
        }),
      },
      options: {
        responsive: true,
        layout: { padding: { left: 6, right: 6 } },
        maintainAspectRatio: false,
        animation: { duration: 200 },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: legenda
            ? { position: "bottom", labels: { color: texto, boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "circle", font: { size: 12, family: "Inter Variable" }, padding: 14 } }
            : { display: false },
          tooltip: {
            callbacks: {
              label: (c) => (c.raw === null || c.raw === undefined ? `${c.dataset.label}: sem registro` : `${c.dataset.label}: ${fmtBRL(c.raw as number)}`),
            },
          },
        },
        scales: {
          x: { grid: { color: grade }, ticks: { color: texto, font: { size: 11, family: "Inter Variable" } } },
          y: { grid: { color: grade }, ticks: { color: texto, font: { size: 11, family: "Inter Variable" }, callback: (v) => `R$ ${Number(v).toFixed(2).replace(".", ",")}` } },
        },
      },
    });
    return () => chart.destroy();
  }, [rotulos, series, tema, legenda]);

  return (
    <div className="chart-wrap" style={{ height: altura }}>
      <canvas ref={ref} role="img" aria-label="Gráfico de evolução de preços" />
    </div>
  );
}
