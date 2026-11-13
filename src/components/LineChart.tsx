import { useEffect, useRef } from "react";
import { CategoryScale, Chart, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip } from "chart.js";
import { fmtBRL } from "../lib/format";
import { useTema } from "../lib/tema";

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

export interface Serie {
  rotulo: string;
  dados: (number | null)[];
}

const CORES_CLARO = ["#17498a", "#d99a00", "#00873f", "#c4372b", "#7a4fd0", "#0e8a96", "#d9622b", "#5b6f8a"];
const CORES_ESCURO = ["#6fa8ff", "#ffc83d", "#3ecf7e", "#ff7b6e", "#b196ff", "#4fd0dc", "#ff9a63", "#9fb3cf"];

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

    const chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: rotulos,
        datasets: series.map((s, i) => ({
          label: s.rotulo,
          data: s.dados,
          borderColor: cores[i % cores.length],
          backgroundColor: cores[i % cores.length],
          spanGaps: true,
          tension: 0.25,
          borderWidth: 2,
          pointRadius: series.length > 1 ? 2.5 : 3.5,
          pointHoverRadius: 5,
          pointBorderWidth: 0,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 200 },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: legenda
            ? { position: "bottom", labels: { color: texto, boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "circle", font: { size: 12, family: "Barlow" }, padding: 14 } }
            : { display: false },
          tooltip: {
            callbacks: {
              label: (c) => (c.raw === null || c.raw === undefined ? `${c.dataset.label}: sem registro` : `${c.dataset.label}: ${fmtBRL(c.raw as number)}`),
            },
          },
        },
        scales: {
          x: { grid: { color: grade }, ticks: { color: texto, font: { size: 11, family: "Barlow" } } },
          y: { grid: { color: grade }, ticks: { color: texto, font: { size: 11, family: "Barlow" }, callback: (v) => `R$ ${Number(v).toFixed(2).replace(".", ",")}` } },
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
