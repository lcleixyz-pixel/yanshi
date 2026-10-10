import clsx from '@/utils/clsx';
import type { SpectroscopeMethod } from '@/store/detectionStore';

/**
 * 三种照明方法的 SVG 光路示意图（共用同一画板）。
 *
 * - transmission         透射光法：黑板 + 中央小孔，光源从下方垂直入射，分光镜从上方收光
 * - internal-reflection  内反射法：黑色背景 + 样品台面向下，光源与收光方向各同台面约 45°，光经底部台面内侧反射后从对侧亭部出射
 * - surface-reflection   表面反射法：黑色背景 + 样品待测面朝上，光源与分光镜在两侧斜上方照明和收光
 */
export default function SpectroscopeIllumination({
  method,
  angleDeg,
  lightOn,
  sampleOn,
  className,
}: {
  method: SpectroscopeMethod;
  /** 0–90，反射场景中光线与水平台面的夹角，非统一最佳角度 */
  angleDeg: number;
  lightOn: boolean;
  sampleOn: boolean;
  className?: string;
}) {
  const W = 360;
  const H = 240;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={clsx('h-full w-full select-none', className)}
      role="img"
      aria-label={`${method} 光路示意图`}
    >
      <defs>
        <linearGradient id="bgFloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1a1a" />
          <stop offset="1" stopColor="#0a0a0a" />
        </linearGradient>
        <linearGradient id="rayGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fde68a" stopOpacity="0.25" />
          <stop offset="0.5" stopColor="#fcd34d" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fde68a" stopOpacity="0.25" />
        </linearGradient>
        <radialGradient id="bulbGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fffbe6" />
          <stop offset="0.5" stopColor="#facc15" />
          <stop offset="1" stopColor="#facc15" stopOpacity="0" />
        </radialGradient>
        <marker id="rayArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#f59e0b" />
        </marker>
        <marker id="reflectionArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#f59e0b" />
        </marker>
      </defs>

      {/* 背景 */}
      <rect x="0" y="0" width={W} height={H} fill="#f8fafc" />

      {/* 桌面 */}
      <rect x="0" y={H * 0.78} width={W} height={H * 0.22} fill="#e2e8f0" />

      {method === 'transmission' && (
        <TransmissionScene W={W} H={H} lightOn={lightOn} sampleOn={sampleOn} />
      )}
      {method === 'internal-reflection' && (
        <InternalReflectionScene W={W} H={H} lightOn={lightOn} sampleOn={sampleOn} angleDeg={angleDeg} />
      )}
      {method === 'surface-reflection' && (
        <SurfaceReflectionScene W={W} H={H} lightOn={lightOn} sampleOn={sampleOn} angleDeg={angleDeg} />
      )}

      {/* 透射场景沿用原仪器；反射场景各自将入光口与出射光同轴。 */}
      {method === 'transmission' && <Spectroscope x={W * 0.78} y={H * 0.18} angleDeg={90} />}

      {/* 角标 */}
      <text x="10" y="16" fontSize="11" fill="#475569" fontFamily="ui-monospace, monospace">
        {labelOf(method)}
      </text>
    </svg>
  );
}

function labelOf(method: SpectroscopeMethod): string {
  switch (method) {
    case 'transmission': return '透射光法 · Transmission';
    case 'internal-reflection': return '内反射法 · Internal Reflection';
    case 'surface-reflection': return '表面反射法 · Surface Reflection';
  }
}

// ─── 透射光法 ─────────────────────────────────────────────────────
function TransmissionScene({
  W, H, lightOn, sampleOn,
}: { W: number; H: number; lightOn: boolean; sampleOn: boolean }) {
  const cx = W * 0.42;
  const blackBoardY = H * 0.55;

  return (
    <>
      {/* 黑板（带中央小孔，"锁光圈"） */}
      <rect x={cx - 80} y={blackBoardY} width={160} height={10} fill="url(#bgFloor)" />
      <text x={cx + 50} y={blackBoardY - 4} fontSize="9" fill="#475569">黑板</text>
      {/* 小孔（露出底光） */}
      <circle cx={cx} cy={blackBoardY + 5} r={6} fill="#fef3c7" stroke="#92400e" strokeWidth="0.6" />
      <line x1={cx + 8} y1={blackBoardY + 5} x2={cx + 28} y2={blackBoardY + 5} stroke="#475569" strokeDasharray="2 2" strokeWidth="0.7" />
      <text x={cx + 30} y={blackBoardY + 8} fontSize="9" fill="#475569">小孔（锁光圈）</text>

      {/* 光纤灯（下方） */}
      <Bulb x={cx} y={H * 0.88} on={lightOn} />
      <text x={cx + 16} y={H * 0.90} fontSize="9" fill="#475569">光纤灯</text>

      {/* 入射光线（下→上，垂直） */}
      {lightOn && (
        <line
          x1={cx} y1={H * 0.86}
          x2={cx} y2={blackBoardY + 6}
          stroke="url(#rayGrad)" strokeWidth="6" strokeLinecap="round" opacity="0.9"
          markerEnd="url(#rayArrow)"
        />
      )}

      {/* 样品（小孔正上方） */}
      {sampleOn && (
        <Gem cx={cx} cy={blackBoardY - 8} kind="faceted-up" />
      )}

      {/* 样品 → 分光镜 透射光线 */}
      {lightOn && sampleOn && (
        <line
          x1={cx} y1={blackBoardY - 14}
          x2={W * 0.78} y2={H * 0.30}
          stroke="url(#rayGrad)" strokeWidth="5" strokeLinecap="round" opacity="0.9"
          markerEnd="url(#rayArrow)"
        />
      )}

      {sampleOn && (
        <text x={cx - 32} y={blackBoardY - 22} fontSize="9" fill="#0c4a6e" fontWeight="600">样品</text>
      )}
      <text x={cx - 60} y={blackBoardY + 36} fontSize="9" fill="#64748b">光垂直穿透样品</text>
    </>
  );
}

// ─── 内反射光法 ────────────────────────────────────────────────────
function InternalReflectionScene({
  W, H, lightOn, sampleOn, angleDeg,
}: { W: number; H: number; lightOn: boolean; sampleOn: boolean; angleDeg: number }) {
  const cx = W * 0.47;
  const tableY = H * 0.66;
  const a = (angleDeg * Math.PI) / 180;
  // 对称截面示意：亭部朝上，较小的台面在底部接触黑底。
  const entry = { x: cx - 13, y: tableY - 38 + 26 * 13 / 22 };
  const exit = { x: cx + 13, y: entry.y };
  const lamp = { x: entry.x - Math.cos(a) * 70, y: entry.y - Math.sin(a) * 70 };
  const mouth = { x: exit.x + Math.cos(a) * 62, y: exit.y - Math.sin(a) * 62 };

  return (
    <>
      <rect x={cx - 76} y={tableY} width={152} height={8} fill="url(#bgFloor)" />
      {sampleOn && (
        <>
          <Gem cx={cx} cy={tableY - 10} kind="table-down" />
          <line x1={cx - 10} y1={tableY - 0.8} x2={cx + 10} y2={tableY - 0.8} stroke="#831843" strokeWidth="1.2" />
        </>
      )}

      {/* 入射和出射都在背景上方；约 45° 是教学起点，不作角度合格判断。 */}
      <Bulb x={lamp.x} y={lamp.y} on={lightOn} />
      <text x={lamp.x - 20} y={lamp.y - 16} fontSize="9" fill="#475569">光纤灯</text>
      <Spectroscope x={mouth.x} y={mouth.y} angleDeg={180 - angleDeg} showLabel={false} />
      <text x={mouth.x + Math.cos(a) * 50 + 12} y={mouth.y - Math.sin(a) * 50 + 8} fontSize="9" fill="#1e293b" fontWeight="600">分光镜</text>

      {lightOn && sampleOn && (
        <>
          <line
            x1={lamp.x} y1={lamp.y} x2={entry.x} y2={entry.y}
            stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" opacity="0.95"
            markerEnd="url(#reflectionArrow)"
          />
          {/* 折线始终在石内，底部转向点位于台面内侧，不进入桌面。 */}
          <polyline
            points={`${entry.x},${entry.y} ${cx},${tableY - 0.8} ${exit.x},${exit.y}`}
            stroke="#f59e0b" strokeWidth="1.6" fill="none" strokeDasharray="2 1.5"
          />
          {/* 从样品出射点到狭缝是一条直线，与镜筒轴线一致。 */}
          <line
            x1={exit.x} y1={exit.y} x2={mouth.x} y2={mouth.y}
            stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" opacity="0.95"
            markerEnd="url(#reflectionArrow)"
          />
        </>
      )}

      <text x={cx} y={tableY + 23} textAnchor="middle" fontSize="10" fill="#0c4a6e" fontWeight="600">台面向下贴黑底 · 亭部朝上</text>
      <text x={cx} y={tableY + 39} textAnchor="middle" fontSize="9" fill="#64748b">两侧光线各与台面 {angleDeg.toFixed(0)}° · 按亮点微调</text>
      <text x={cx} y={tableY + 54} textAnchor="middle" fontSize="9" fill="#64748b">石内路径为示意，不代表精确光线追迹</text>
    </>
  );
}

// ─── 表面反射法 ────────────────────────────────────────────────────
function SurfaceReflectionScene({
  W, H, lightOn, sampleOn, angleDeg,
}: { W: number; H: number; lightOn: boolean; sampleOn: boolean; angleDeg: number }) {
  const cx = W * 0.47;
  const tableY = H * 0.66;
  const surfaceY = tableY - 24;
  const a = (angleDeg * Math.PI) / 180;
  const lamp = { x: cx - Math.cos(a) * 76, y: surfaceY - Math.sin(a) * 76 };
  const mouth = { x: cx + Math.cos(a) * 70, y: surfaceY - Math.sin(a) * 70 };

  return (
    <>
      <rect x={cx - 76} y={tableY} width={152} height={8} fill="url(#bgFloor)" />
      {/* 弧面样品底部接触黑底，反射点取实际上表面的最高点。 */}
      {sampleOn && (
        <>
          <path
            d={`M ${cx - 28},${tableY} A 28 24 0 0 1 ${cx + 28},${tableY} Z`}
            fill="#34d399" stroke="#065f46" strokeWidth="1"
          />
          <line x1={cx} y1={surfaceY} x2={cx} y2={surfaceY - 33} stroke="#94a3b8" strokeDasharray="2 2" strokeWidth="0.8" />
        </>
      )}

      <Bulb x={lamp.x} y={lamp.y} on={lightOn} />
      <text x={lamp.x - 20} y={lamp.y - 16} fontSize="9" fill="#475569">光纤灯</text>
      <Spectroscope x={mouth.x} y={mouth.y} angleDeg={180 - angleDeg} showLabel={false} />
      <text x={mouth.x + Math.cos(a) * 50 + 12} y={mouth.y - Math.sin(a) * 50 + 8} fontSize="9" fill="#1e293b" fontWeight="600">分光镜</text>

      {lightOn && sampleOn && (
        <>
          <line
            x1={lamp.x} y1={lamp.y} x2={cx} y2={surfaceY}
            stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" opacity="0.95"
            markerEnd="url(#reflectionArrow)"
          />
          <line
            x1={cx} y1={surfaceY} x2={mouth.x} y2={mouth.y}
            stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" opacity="0.95"
            markerEnd="url(#reflectionArrow)"
          />
        </>
      )}

      <text x={cx} y={tableY + 23} textAnchor="middle" fontSize="10" fill="#0c4a6e" fontWeight="600">样品放在黑底 · 待测上表面受照</text>
      <text x={cx} y={tableY + 39} textAnchor="middle" fontSize="9" fill="#64748b">两侧光线各与台面 {angleDeg.toFixed(0)}° · 收集最亮区域</text>
      <text x={cx} y={tableY + 54} textAnchor="middle" fontSize="9" fill="#64748b">约 45° 起调，实际方向随表面与亮点调整</text>
    </>
  );
}

// ─── 通用元件 ─────────────────────────────────────────────────────
function Bulb({ x, y, on }: { x: number; y: number; on: boolean }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {on && <circle cx="0" cy="0" r="14" fill="url(#bulbGlow)" opacity="0.85" />}
      <circle cx="0" cy="0" r="6" fill={on ? '#fde68a' : '#cbd5e1'} stroke="#475569" strokeWidth="1" />
      <rect x="-4" y="4" width="8" height="6" fill="#475569" rx="1" />
    </g>
  );
}

function Gem({ cx, cy, kind }: { cx: number; cy: number; kind: 'faceted-up' | 'table-down' }) {
  if (kind === 'faceted-up') {
    return (
      <g>
        <polygon
          points={`${cx - 12},${cy} ${cx + 12},${cy} ${cx + 6},${cy + 12} ${cx - 6},${cy + 12}`}
          fill="#f9a8d4" stroke="#9d174d" strokeWidth="1"
        />
        <polygon
          points={`${cx - 12},${cy} ${cx + 12},${cy} ${cx + 8},${cy - 8} ${cx - 8},${cy - 8}`}
          fill="#fbcfe8" stroke="#9d174d" strokeWidth="1"
        />
      </g>
    );
  }
  // table-down: 台面向下、亭部朝上
  return (
    <g>
      <polygon
        points={`${cx - 10},${cy + 10} ${cx + 10},${cy + 10} ${cx + 22},${cy - 2} ${cx - 22},${cy - 2}`}
        fill="#fbcfe8" stroke="#9d174d" strokeWidth="1"
      />
      <polygon
        points={`${cx - 22},${cy - 2} ${cx + 22},${cy - 2} ${cx},${cy - 28}`}
        fill="#f9a8d4" stroke="#9d174d" strokeWidth="1"
      />
    </g>
  );
}

function Spectroscope({ x, y, angleDeg, showLabel = true }: { x: number; y: number; angleDeg: number; showLabel?: boolean }) {
  return (
    <g transform={`translate(${x},${y}) rotate(${angleDeg - 90})`}>
      {/* 镜筒 */}
      <rect x="-12" y="-46" width="24" height="46" rx="3" fill="#1e293b" stroke="#0f172a" strokeWidth="1" />
      {/* 物镜端 */}
      <rect x="-14" y="-4" width="28" height="6" rx="2" fill="#0f172a" />
      {/* 目镜端 */}
      <rect x="-8" y="-50" width="16" height="6" rx="2" fill="#475569" />
      {showLabel && <text x="-26" y="-54" fontSize="9" fill="#1e293b" fontWeight="600">分光镜</text>}
    </g>
  );
}
