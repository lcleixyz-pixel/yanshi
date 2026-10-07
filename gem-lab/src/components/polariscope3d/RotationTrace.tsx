/**
 * 转动一周的明暗记录：只画学生已经转过的角度（观察到的数据），
 * 揭晓后叠加完整理论曲线。纵轴以下偏光片后光强为 100%。
 */
export default function RotationTrace({ curve, visited, current, reveal, analyzerDeg }: {
  /** 0–360° 等间隔采样（含 360°）。 */
  curve: number[];
  visited: boolean[];
  current: number;
  reveal: boolean;
  analyzerDeg: number;
}) {
  const steps = curve.length - 1, width = 300, height = 112, left = 30, right = 8, top = 10, bottom = 22;
  const peak = Math.max(0.55, ...curve);
  const x = (deg: number) => left + (deg / 360) * (width - left - right);
  const y = (value: number) => top + (1 - value / peak) * (height - top - bottom);
  const segments: string[] = [];
  let open = false;
  curve.forEach((value, index) => {
    const seen = visited[index % steps] || (index === steps && visited[0] && visited[steps - 1]);
    if (!seen) { open = false; return; }
    segments.push(`${open ? 'L' : 'M'}${x((index * 360) / steps).toFixed(1)},${y(value).toFixed(1)}`); open = true;
  });
  const full = curve.map((value, index) => `${index ? 'L' : 'M'}${x((index * 360) / steps).toFixed(1)},${y(value).toFixed(1)}`).join('');
  const angle = ((current % 360) + 360) % 360;
  const nearest = curve[Math.round((angle / 360) * steps)];
  const coverage = Math.round((visited.filter(Boolean).length / steps) * 100);
  return (
    <figure className="pol-trace" data-testid="rotation-trace" data-coverage={coverage}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`转动一周的明暗记录，已覆盖 ${coverage}%`}>
        {[0, 90, 180, 270, 360].map((deg) => <g key={deg}><line x1={x(deg)} x2={x(deg)} y1={top} y2={height - bottom} className="pol-trace__grid" /><text x={x(deg)} y={height - 6} textAnchor="middle">{deg}°</text></g>)}
        <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="pol-trace__axis" />
        <text x={left - 5} y={y(0) + 3} textAnchor="end">暗</text><text x={left - 5} y={y(peak * .9) + 3} textAnchor="end">亮</text>
        {reveal && <path d={full} className="pol-trace__theory" />}
        <path d={segments.join('')} className="pol-trace__seen" />
        <line x1={x(angle)} x2={x(angle)} y1={top} y2={height - bottom} className="pol-trace__cursor" />
        <circle cx={x(angle)} cy={y(nearest)} r="3.6" className="pol-trace__dot" />
      </svg>
      <figcaption>{coverage < 100 ? `已转过 ${coverage}%：继续转动物台，记录一整周。` : '已记录完整一周。'}{analyzerDeg % 180 !== 90 ? '（当前不是正交位置）' : ''}</figcaption>
    </figure>
  );
}
