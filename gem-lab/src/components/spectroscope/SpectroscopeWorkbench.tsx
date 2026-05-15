import HotPoint from '@/components/demo/HotPoint';
import type { SpectroscopeMethod } from '@/store/detectionStore';
import clsx from '@/utils/clsx';

export type SpectroscopeHotpoint = 'light' | 'sample' | 'eyepiece' | 'slit' | 'focus';

type WorkbenchPoint = { x: number; y: number };

type WorkbenchScene = {
  light: WorkbenchPoint;
  sample: WorkbenchPoint;
  rayStart: WorkbenchPoint;
  raySample: WorkbenchPoint;
  rayReceive: WorkbenchPoint;
  lampAngleDeg: number;
};

const INSTRUMENT_AXIS = {
  entry: { x: 463, y: 387 },
  eyepiece: { x: 718, y: 165 },
};
const INSTRUMENT_AXIS_UNIT = normalize({
  x: INSTRUMENT_AXIS.eyepiece.x - INSTRUMENT_AXIS.entry.x,
  y: INSTRUMENT_AXIS.eyepiece.y - INSTRUMENT_AXIS.entry.y,
});
const LAMP_TIP_OFFSET = 76;
const SAMPLE_AXIS_DISTANCE = 70;
const TRANSMISSION_SOURCE_DISTANCE = 24;
const REFLECTION_SOURCE_DISTANCE = 130;

export default function SpectroscopeWorkbench({
  instrumentImage,
  method,
  angleDeg,
  power,
  sampleOn,
  aligned,
  spectrumReady,
  slitOk,
  focusOk,
  currentStep,
  lightSourceLabel,
  validLightSource,
  themeHex,
  onHotpoint,
}: {
  instrumentImage: string;
  method: SpectroscopeMethod | null;
  angleDeg: number;
  power: boolean;
  sampleOn: boolean;
  aligned: boolean;
  spectrumReady: boolean;
  slitOk: boolean;
  focusOk: boolean;
  currentStep: string | null;
  lightSourceLabel: string;
  validLightSource: boolean;
  themeHex: string;
  onHotpoint: (id: SpectroscopeHotpoint) => void;
}) {
  const scene = getScene(method, angleDeg);

  return (
    <div className="relative h-full min-h-[360px] overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-[#f7fbff] to-[#eef5fb] shadow-soft">
      <svg
        viewBox="0 0 900 560"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="分光镜实操台布置示意图"
      >
        <defs>
          <linearGradient id="benchSurface" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e2e8f0" />
            <stop offset="1" stopColor="#cbd5e1" />
          </linearGradient>
          <linearGradient id="rayWorkbench" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fef3c7" stopOpacity="0.20" />
            <stop offset="0.45" stopColor="#facc15" stopOpacity="0.95" />
            <stop offset="1" stopColor="#f59e0b" stopOpacity="0.45" />
          </linearGradient>
          <radialGradient id="lampGlow" cx="0.5" cy="0.5" r="0.55">
            <stop offset="0" stopColor="#fff7ed" stopOpacity="0.95" />
            <stop offset="0.45" stopColor="#fde68a" stopOpacity="0.42" />
            <stop offset="1" stopColor="#facc15" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="fiberLampMetal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f8fafc" />
            <stop offset="0.18" stopColor="#cbd5e1" />
            <stop offset="0.48" stopColor="#64748b" />
            <stop offset="0.68" stopColor="#e2e8f0" />
            <stop offset="1" stopColor="#334155" />
          </linearGradient>
          <linearGradient id="fiberLampTip" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#e2e8f0" />
            <stop offset="0.55" stopColor="#f8fafc" />
            <stop offset="1" stopColor="#94a3b8" />
          </linearGradient>
          <linearGradient id="fiberLampBeam" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fef3c7" stopOpacity="0.62" />
            <stop offset="1" stopColor="#facc15" stopOpacity="0" />
          </linearGradient>
          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.20" />
          </filter>
          <marker id="workbenchArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#f59e0b" />
          </marker>
        </defs>

        <rect x="0" y="0" width="900" height="560" fill="transparent" />
        <path d="M40 454 C210 422 720 422 860 456 L860 560 L40 560 Z" fill="url(#benchSurface)" />
        <path d="M70 462 C250 438 650 438 830 462" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="6 8" opacity="0.35" />

        <WorkbenchLamp
          x={scene.light.x}
          y={scene.light.y}
          angleDeg={scene.lampAngleDeg}
          on={power && validLightSource}
          invalid={power && !validLightSource}
        />
        <WorkbenchStage method={method} sampleOn={sampleOn} x={scene.sample.x} y={scene.sample.y} />
        <WorkbenchSpectroscope imageHref={instrumentImage} />

        {power && sampleOn && method && (
          <WorkbenchRays scene={scene} method={method} validLightSource={validLightSource} />
        )}
        <line
          data-instrument-axis="spectroscope"
          x1={INSTRUMENT_AXIS.entry.x}
          y1={INSTRUMENT_AXIS.entry.y}
          x2={INSTRUMENT_AXIS.eyepiece.x}
          y2={INSTRUMENT_AXIS.eyepiece.y}
          stroke="transparent"
          pointerEvents="none"
        />
      </svg>

      <HotPoint
        x={scene.light.x / 900}
        y={scene.light.y / 560}
        label={power ? `${lightSourceLabel}（已开启）` : `${lightSourceLabel}（关闭）`}
        sub={
          power
            ? validLightSource ? '点击关闭' : '当前光源不适合读吸收谱'
            : validLightSource ? '点击开启冷光源' : '请切换回连续冷光源'
        }
        side="top"
        themeHex={themeHex}
        status={power ? 'done' : currentStep === 'power' ? 'active' : 'disabled'}
        showLabel={currentStep === 'power'}
        onClick={() => onHotpoint('light')}
      />
      <HotPoint
        x={scene.sample.x / 900}
        y={scene.sample.y / 560}
        label={sampleOn ? '样品已就位' : '样品 / 背景板'}
        sub={
          !power
            ? '请先开光源'
            : sampleOn
              ? method ? '点击移除样品' : '点击选择照明方法'
              : '点击放置样品'
        }
        side="left"
        themeHex={themeHex}
        status={!power ? 'disabled' : sampleOn && method ? 'done' : sampleOn || currentStep === 'place' ? 'active' : 'disabled'}
        showLabel={currentStep === 'place' || currentStep === 'pick-method'}
        onClick={() => onHotpoint('sample')}
      />
      <HotPoint
        x={0.80}
        y={0.33}
        label="目镜（观察端）"
        sub="从此端观察光谱"
        side="left"
        themeHex={themeHex}
        status={spectrumReady ? 'done' : 'disabled'}
        showLabel={currentStep === 'observe'}
        onClick={() => onHotpoint('eyepiece')}
      />
      <HotPoint
        x={0.54}
        y={0.56}
        label="狭缝 / 入光端"
        sub={!aligned ? '对准后启用' : slitOk ? '接近闭合' : '过宽会变模糊'}
        side="bottom"
        themeHex={themeHex}
        status={slitOk && aligned ? 'done' : aligned ? 'active' : 'disabled'}
        showLabel={false}
        onClick={() => onHotpoint('slit')}
      />
      <HotPoint
        x={0.65}
        y={0.47}
        label="焦距 / 标尺调节"
        sub={!aligned ? '对准后启用' : focusOk ? '已聚焦' : '调至谱线最清晰'}
        side="left"
        themeHex={themeHex}
        status={focusOk && aligned ? 'done' : aligned ? 'active' : 'disabled'}
        showLabel={false}
        onClick={() => onHotpoint('focus')}
      />
    </div>
  );
}

function getScene(method: SpectroscopeMethod | null, angleDeg: number): WorkbenchScene {
  const rayReceive = INSTRUMENT_AXIS.entry;
  if (method === 'transmission') {
    const raySample = add(rayReceive, INSTRUMENT_AXIS_UNIT, -SAMPLE_AXIS_DISTANCE);
    const rayStart = add(raySample, INSTRUMENT_AXIS_UNIT, -TRANSMISSION_SOURCE_DISTANCE);
    return makeScene({
      sample: { x: raySample.x, y: raySample.y - 16 },
      rayStart,
      raySample,
      rayReceive,
    });
  }
  const displayAngle = Math.max(8, Math.min(75, angleDeg));
  const a = (displayAngle * Math.PI) / 180;
  const raySample = add(rayReceive, INSTRUMENT_AXIS_UNIT, -SAMPLE_AXIS_DISTANCE);
  const rayStart = {
    x: raySample.x - Math.sin(a) * REFLECTION_SOURCE_DISTANCE,
    y: raySample.y - Math.cos(a) * REFLECTION_SOURCE_DISTANCE,
  };
  return makeScene({
    sample: { x: raySample.x, y: raySample.y - 4 },
    rayStart,
    raySample,
    rayReceive,
  });
}

function makeScene({
  sample,
  rayStart,
  raySample,
  rayReceive,
}: {
  sample: WorkbenchPoint;
  rayStart: WorkbenchPoint;
  raySample: WorkbenchPoint;
  rayReceive: WorkbenchPoint;
}): WorkbenchScene {
  const lampAngleDeg = angleTo(rayStart, raySample);
  const lampDirection = normalize({
    x: raySample.x - rayStart.x,
    y: raySample.y - rayStart.y,
  });

  return {
    light: {
      x: rayStart.x - lampDirection.x * LAMP_TIP_OFFSET,
      y: rayStart.y - lampDirection.y * LAMP_TIP_OFFSET,
    },
    sample,
    rayStart,
    raySample,
    rayReceive,
    lampAngleDeg,
  };
}

function normalize(point: WorkbenchPoint): WorkbenchPoint {
  const length = Math.hypot(point.x, point.y) || 1;
  return { x: point.x / length, y: point.y / length };
}

function add(point: WorkbenchPoint, direction: WorkbenchPoint, distance: number): WorkbenchPoint {
  return {
    x: point.x + direction.x * distance,
    y: point.y + direction.y * distance,
  };
}

function angleTo(from: WorkbenchPoint, to: WorkbenchPoint): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

function WorkbenchLamp({
  x,
  y,
  angleDeg,
  on,
  invalid,
}: {
  x: number;
  y: number;
  angleDeg: number;
  on: boolean;
  invalid: boolean;
}) {
  return (
    <g
      data-light-source="fiber-pen"
      data-lamp-angle={angleDeg.toFixed(1)}
      transform={`translate(${x} ${y}) rotate(${angleDeg})`}
      filter="url(#softShadow)"
    >
      {on && <ellipse cx="80" cy="0" rx="46" ry="21" fill="url(#lampGlow)" opacity="0.9" />}
      {on && <path d="M78 -9 L132 -20 L132 20 L78 9 Z" fill="url(#fiberLampBeam)" opacity="0.6" />}
      {invalid && <circle cx="70" cy="0" r="32" fill="#f97316" opacity="0.12" />}

      <rect x="-74" y="-14" width="146" height="28" rx="14" fill="url(#fiberLampMetal)" stroke="#64748b" strokeWidth="1.4" />
      <path d="M-70 -11 L-55 -11 Q-64 0 -55 11 L-70 11 Q-82 0 -70 -11Z" fill="#94a3b8" stroke="#64748b" strokeWidth="1" />
      <path d="M-46 -9 L42 -9" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.48" />
      <path d="M-40 9 L42 9" stroke="#0f172a" strokeWidth="2.4" strokeLinecap="round" opacity="0.22" />
      <path d="M60 -13 L80 -9 L80 9 L60 13 Z" fill="url(#fiberLampTip)" stroke="#64748b" strokeWidth="1.2" />
      <ellipse cx="80" cy="0" rx="5" ry="8.5" fill={invalid ? '#fdba74' : on ? '#fde68a' : '#e2e8f0'} stroke="#475569" strokeWidth="1" />
      <path d="M-6 -3 L34 -3" stroke="#f8fafc" strokeWidth="1.2" opacity="0.55" />
    </g>
  );
}

function WorkbenchStage({
  method,
  sampleOn,
  x,
  y,
}: {
  method: SpectroscopeMethod | null;
  sampleOn: boolean;
  x: number;
  y: number;
}) {
  const isTransmission = method === 'transmission';
  return (
    <g transform={`translate(${x} ${y})`} filter="url(#softShadow)">
      <ellipse cx="0" cy="48" rx="104" ry="18" fill="#94a3b8" opacity="0.28" />
      <rect x="-92" y="26" width="184" height="16" rx="8" fill={isTransmission ? '#1f2937' : '#050505'} />
      {isTransmission && <circle cx="0" cy="34" r="8" fill="#fef3c7" stroke="#92400e" strokeWidth="1" />}
      {sampleOn ? (
        isTransmission ? <FacetedGem x={0} y={14} /> : <FacetedGemTableDown x={0} y={12} />
      ) : (
        <g opacity="0.45">
          <circle cx="0" cy="16" r="18" fill="#cbd5e1" stroke="#94a3b8" strokeDasharray="4 4" />
          <text x="-26" y="9" fontSize="9" fill="#64748b">放置样品</text>
        </g>
      )}
    </g>
  );
}

function WorkbenchSpectroscope({ imageHref }: { imageHref: string }) {
  return (
    <g filter="url(#softShadow)">
      <image
        href={imageHref}
        x="372"
        y="72"
        width="430"
        height="430"
        preserveAspectRatio="xMidYMid meet"
      />
    </g>
  );
}

function WorkbenchRays({
  scene,
  method,
  validLightSource,
}: {
  scene: WorkbenchScene;
  method: SpectroscopeMethod;
  validLightSource: boolean;
}) {
  const colorClass = validLightSource ? '' : 'opacity-40';
  const start = scene.rayStart;
  const sample = scene.raySample;
  const receive = scene.rayReceive;
  return (
    <g className={clsx(colorClass)}>
      {method === 'transmission' ? (
        <>
          <line data-ray-segment="source-to-sample" x1={start.x} y1={start.y} x2={sample.x} y2={sample.y} stroke="url(#rayWorkbench)" strokeWidth="4" strokeLinecap="round" opacity="0.64" />
          <line data-ray-segment="sample-to-instrument" x1={sample.x} y1={sample.y} x2={receive.x} y2={receive.y} stroke="url(#rayWorkbench)" strokeWidth="4.5" strokeLinecap="round" opacity="0.74" markerEnd="url(#workbenchArrow)" />
        </>
      ) : (
        <>
          <line data-ray-segment="source-to-sample" x1={start.x} y1={start.y} x2={sample.x} y2={sample.y} stroke="url(#rayWorkbench)" strokeWidth="4.5" strokeLinecap="round" opacity="0.68" />
          {method === 'internal-reflection' && (
            <polyline points={`${sample.x - 9},${sample.y - 2} ${sample.x - 2},${sample.y + 19} ${sample.x + 13},${sample.y - 1}`} fill="none" stroke="#fbbf24" strokeWidth="3" strokeDasharray="5 4" opacity="0.7" />
          )}
          <line data-ray-segment="sample-to-instrument" x1={sample.x} y1={sample.y} x2={receive.x} y2={receive.y} stroke="url(#rayWorkbench)" strokeWidth="4.5" strokeLinecap="round" opacity="0.74" markerEnd="url(#workbenchArrow)" />
        </>
      )}
      {!validLightSource && (
        <g transform={`translate(${scene.light.x + 72} ${scene.light.y - 72})`}>
          <rect x="-8" y="-24" width="108" height="38" rx="10" fill="#fff7ed" stroke="#fdba74" />
          <text x="5" y="-9" fontSize="9" fontWeight="700" fill="#9a3412">光源线谱污染</text>
          {[14, 28, 46, 72].map((x) => (
            <line key={x} x1={x} y1="-2" x2={x} y2="10" stroke="#f97316" strokeWidth="2" />
          ))}
        </g>
      )}
    </g>
  );
}

function FacetedGem({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <polygon points="-24,4 24,4 14,26 -14,26" fill="#be123c" stroke="#881337" strokeWidth="1.4" />
      <polygon points="-24,4 24,4 12,-14 -12,-14" fill="#fda4af" stroke="#881337" strokeWidth="1.4" />
      <line x1="-12" y1="-14" x2="0" y2="26" stroke="#fecdd3" strokeWidth="1" opacity="0.7" />
      <line x1="12" y1="-14" x2="0" y2="26" stroke="#fecdd3" strokeWidth="1" opacity="0.7" />
    </g>
  );
}

function FacetedGemTableDown({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <polygon points="-27,18 27,18 18,4 -18,4" fill="#fda4af" stroke="#881337" strokeWidth="1.4" />
      <polygon points="-18,4 18,4 0,-24" fill="#be123c" stroke="#881337" strokeWidth="1.4" />
      <text x="26" y="-12" fontSize="9" fill="#0c4a6e" fontWeight="700">台面向下</text>
    </g>
  );
}
