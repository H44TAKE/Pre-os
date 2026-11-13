/** Mini-gráfico de linha sem eixos, só para mostrar a tendência numa célula de tabela. */
export function Sparkline({ valores }: { valores: number[] }) {
  if (valores.length < 2) return <span className="muted">—</span>;
  const w = 84;
  const h = 26;
  const p = 3;
  const min = Math.min(...valores);
  const span = Math.max(...valores) - min || 1;
  const pontos = valores
    .map((v, i) => `${(p + (i * (w - 2 * p)) / (valores.length - 1)).toFixed(1)},${(h - p - ((v - min) / span) * (h - 2 * p)).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pontos} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
