import clsx from '@/utils/clsx';
import type { SpectroscopeMethod } from '@/store/detectionStore';

/**
 * 三种照明方法的 SVG 光路示意图（共用同一画板）。
 *
 * - transmission         透射光法：黑板 + 中央小孔，光源从下方垂直入射，分光镜从上方收光
 * - internal-reflection  内反射法：黑色背景 + 样品台面向下，光源以 ≈ 45° 入射，光在亭部反射后从冠部出射
 * - surface-reflection   表面反射法：黑色背景 + 样品抛光面朝上，光源斜射在表面反射后被分光镜接收
 */
export default function SpectroscopeIllumination({
  method,
  angleDeg,
  lightOn,
  sampleOn,
  className,
}: {
  method: SpectroscopeMethod;
  /** 0–90，仅用于 internal-reflection / surface-reflection 显示入射角 */
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

      {/* 顶部分光镜（共用） */}
      <Spectroscope x={W * 0.78} y={H * 0.18} angleDeg={90} />

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
  const cx = W * 0.42;
  const tableY = H * 0.62;
  const sampleY = tableY - 4;

  // 入射角：以"垂直方向"为 0°，向左偏离 angleDeg
  const a = (angleDeg * Math.PI) / 180;
  const len = 80;
  const startX = cx - Math.sin(a) * len;
  const startY = sampleY - Math.cos(a) * len;
  // 出射光：向右上方偏出，分光镜在右上
  const outAng = (-angleDeg * Math.PI) / 180;
  const outLen = 60;
  const outX = cx - Math.sin(outAng) * outLen;
  const outY = sampleY - Math.cos(outAng) * outLen;

  // 角度合格区间（35°–55°）
  const angleOk = angleDeg >= 35 && angleDeg <= 55;

  return (
    <>
      {/* 黑色背景 */}
      <rect x={cx - 70} y={tableY} width={140} height={8} fill="url(#bgFloor)" />
      <text x={cx + 18} y={tableY + 6} fontSize="9" fill="#475569">黑色背景</text>

      {/* 样品（台面向下，亭部朝上） */}
      {sampleOn && <Gem cx={cx} cy={sampleY - 6} kind="table-down" />}
      {sampleOn && (
        <text x={cx + 14} y={sampleY - 14} fontSize="9" fill="#0c4a6e" fontWeight="600">台面 ↓</text>
      )}

      {/* 法线（虚线） */}
      {sampleOn && (
        <line
          x1={cx} y1={sampleY - 8} x2={cx} y2={sampleY - 50}
          stroke="#94a3b8" strokeDasharray="2 2" strokeWidth="0.8"
        />
      )}

      {/* 光纤灯（左上斜入射） */}
      <Bulb x={startX} y={startY} on={lightOn} />
      <text x={startX - 28} y={startY - 10} fontSize="9" fill="#475569">光纤灯</text>

      {/* 入射光线 */}
      {lightOn && sampleOn && (
        <line
          x1={startX + 4} y1={startY + 4}
          x2={cx - 6} y2={sampleY - 8}
          stroke="url(#rayGrad)" strokeWidth="5" strokeLinecap="round" opacity="0.95"
          markerEnd="url(#rayArrow)"
        />
      )}

      {/* 样品内部折线（光程示意：进入冠部 → 亭部反射 → 冠部出射） */}
      {lightOn && sampleOn && (
        <>
          <polyline
            points={`${cx - 6},${sampleY - 8} ${cx - 1},${sampleY + 4} ${cx + 6},${sampleY - 8}`}
            stroke="#fbbf24" strokeWidth="2" fill="none" strokeDasharray="3 2" opacity="0.95"
          />
          {/* 亭部反射"V"标注 */}
          <text x={cx - 4} y={sampleY + 18} fontSize="8" fill="#0c4a6e">亭部内反射</text>

          {/* 出射光线 */}
          <line
            x1={cx + 6} y1={sampleY - 10}
            x2={outX} y2={outY}
            stroke="url(#rayGrad)" strokeWidth="5" strokeLinecap="round" opacity="0.95"
          />
          {/* 续射至分光镜 */}
          <line
            x1={outX} y1={outY}
            x2={W * 0.78} y2={H * 0.30}
            stroke="url(#rayGrad)" strokeWidth="5" strokeLinecap="round" opacity="0.9"
            markerEnd="url(#rayArrow)"
          />
        </>
      )}

      {/* 角度标注 */}
      {sampleOn && (
        <text
          x={cx - 24} y={sampleY - 36}
          fontSize="10"
          fill={angleOk ? '#059669' : '#d97706'}
          fontWeight="700"
        >
          {angleDeg.toFixed(0)}°
          {angleOk ? ' ✓' : ' ⚠'}
        </text>
      )}

      <text x={cx - 70} y={tableY + 22} fontSize="9" fill="#64748b">推荐 35°–55° · 光程被延长</text>
    </>
  );
}

// ─── 表面反射法 ────────────────────────────────────────────────────
function SurfaceReflectionScene({
  W, H, lightOn, sampleOn, angleDeg,
}: { W: number; H: number; lightOn: boolean; sampleOn: boolean; angleDeg: number }) {
  const cx = W * 0.42;
  const tableY = H * 0.62;
  const sampleY = tableY - 4;

  // 镜面反射：入射角 = 反射角
  const a = (angleDeg * Math.PI) / 180;
  const len = 75;
  const startX = cx - Math.sin(a) * len;
  const startY = sampleY - Math.cos(a) * len;
  const reflX = cx + Math.sin(a) * len;
  const reflY = sampleY - Math.cos(a) * len;

  // 角度合格区间（25°–65°）
  const angleOk = angleDeg >= 25 && angleDeg <= 65;

  return (
    <>
      {/* 黑色背景 */}
      <rect x={cx - 70} y={tableY} width={140} height={8} fill="url(#bgFloor)" />
      <text x={cx + 18} y={tableY + 6} fontSize="9" fill="#475569">黑色背景</text>

      {/* 样品（玉石抛光面朝上） */}
      {sampleOn && (
        <g>
          <ellipse cx={cx} cy={sampleY - 4} rx={26} ry={6} fill="#10b981" stroke="#065f46" strokeWidth="1" />
          <ellipse cx={cx} cy={sampleY - 6} rx={24} ry={4} fill="#34d399" opacity="0.85" />
          <text x={cx + 28} y={sampleY - 6} fontSize="9" fill="#0c4a6e" fontWeight="600">抛光面</text>
        </g>
      )}

      {/* 法线（虚线） */}
      {sampleOn && (
        <line
          x1={cx} y1={sampleY - 6} x2={cx} y2={sampleY - 56}
          stroke="#94a3b8" strokeDasharray="2 2" strokeWidth="0.8"
        />
      )}

      {/* 光纤灯（左上） */}
      <Bulb x={startX} y={startY} on={lightOn} />
      <text x={startX - 28} y={startY - 10} fontSize="9" fill="#475569">光纤灯</text>

      {/* 入射光 → 表面 */}
      {lightOn && sampleOn && (
        <line
          x1={startX + 4} y1={startY + 4}
          x2={cx - 4} y2={sampleY - 6}
          stroke="url(#rayGrad)" strokeWidth="5" strokeLinecap="round" opacity="0.95"
          markerEnd="url(#rayArrow)"
        />
      )}

      {/* 反射光 → 分光镜 */}
      {lightOn && sampleOn && (
        <>
          <line
            x1={cx + 4} y1={sampleY - 6}
            x2={reflX} y2={reflY}
            stroke="url(#rayGrad)" strokeWidth="5" strokeLinecap="round" opacity="0.95"
          />
          <line
            x1={reflX} y1={reflY}
            x2={W * 0.78} y2={H * 0.30}
            stroke="url(#rayGrad)" strokeWidth="5" strokeLinecap="round" opacity="0.9"
            markerEnd="url(#rayArrow)"
          />
        </>
      )}

      {/* 入射角 / 反射角 标注弧 */}
      {sampleOn && (
        <>
          <path
            d={`M ${cx - Math.sin(a) * 22},${sampleY - Math.cos(a) * 22}
               A 22 22 0 0 1 ${cx},${sampleY - 22}`}
            stroke="#0c4a6e"
            strokeWidth="0.9"
            fill="none"
          />
          <path
            d={`M ${cx},${sampleY - 22}
               A 22 22 0 0 1 ${cx + Math.sin(a) * 22},${sampleY - Math.cos(a) * 22}`}
            stroke="#0c4a6e"
            strokeWidth="0.9"
            fill="none"
          />
          <text
            x={cx} y={sampleY - 36}
            fontSize="10"
            textAnchor="middle"
            fill={angleOk ? '#059669' : '#d97706'}
            fontWeight="700"
          >
            ±{angleDeg.toFixed(0)}°
            {angleOk ? ' ✓' : ' ⚠'}
          </text>
        </>
      )}

      <text x={cx - 70} y={tableY + 22} fontSize="9" fill="#64748b">入射角 = 反射角 · 推荐 25°–65°</text>
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
        points={`${cx - 14},${cy + 10} ${cx + 14},${cy + 10} ${cx + 10},${cy + 2} ${cx - 10},${cy + 2}`}
        fill="#fbcfe8" stroke="#9d174d" strokeWidth="1"
      />
      <polygon
        points={`${cx - 10},${cy + 2} ${cx + 10},${cy + 2} ${cx},${cy - 12}`}
        fill="#f9a8d4" stroke="#9d174d" strokeWidth="1"
      />
    </g>
  );
}

function Spectroscope({ x, y, angleDeg }: { x: number; y: number; angleDeg: number }) {
  return (
    <g transform={`translate(${x},${y}) rotate(${angleDeg - 90})`}>
      {/* 镜筒 */}
      <rect x="-12" y="-46" width="24" height="46" rx="3" fill="#1e293b" stroke="#0f172a" strokeWidth="1" />
      {/* 物镜端 */}
      <rect x="-14" y="-4" width="28" height="6" rx="2" fill="#0f172a" />
      {/* 目镜端 */}
      <rect x="-8" y="-50" width="16" height="6" rx="2" fill="#475569" />
      <text x="-26" y="-54" fontSize="9" fill="#1e293b" fontWeight="600">分光镜</text>
    </g>
  );
}
