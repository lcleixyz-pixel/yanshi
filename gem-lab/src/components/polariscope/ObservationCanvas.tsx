import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import clsx from '@/utils/clsx';
import type { OpticalCharacter } from '@/data/types';

export type PolariscopeCanvasView =
  | 'off'
  | 'crossed-dark'
  | 'crossed-sample'
  | 'parallel'
  | 'upper-polar-calibration';
export type PolariscopeSampleShape = 'round' | 'faceted-rectangle' | 'cabochon-oval';

/**
 * 根据旋转角度 + 样品光性 + 偏光位置计算当前现象。
 * bright 值域 [0,1]，0=样品响应全暗，1=样品响应最亮，中间值表示过渡态。
 */
export function computePhenomenonBrightness(
  rotation: number,
  optical: OpticalCharacter | undefined,
  polarPosition: 'crossed' | 'parallel',
): { view: PolariscopeCanvasView; brightness: number; label: string } {
  if (polarPosition === 'parallel') {
    return { view: 'parallel', brightness: 1, label: '平行偏光（全亮）' };
  }
  if (!optical) return { view: 'crossed-dark', brightness: 0, label: '全暗' };

  if (optical === 'isotropic') {
    return { view: 'crossed-sample', brightness: 0, label: '全暗（均质体）' };
  }
  if (optical === 'aggregate') {
    return { view: 'crossed-sample', brightness: 1, label: '样品持续亮（集合体）' };
  }

  // 非均质体：四明四暗。每 90° 一个完整明暗周期。
  // 0°/90°/180°/270° = 消光位（暗），45°/135°/225°/315° = 最亮位。
  // brightness = |sin(2θ)|² = sin²(2θ)
  const theta = ((rotation % 360) + 360) % 360;
  const sin2t = Math.sin((2 * theta * Math.PI) / 180);
  const brightness = sin2t * sin2t;

  const isBright = brightness > 0.5;
  const label = isBright ? '明位' : '暗位';

  return { view: 'crossed-sample', brightness, label };
}

// ─── 绘制参数 ──────────────────────────────────────────────
const FIELD_BG_OFF = '#0a0a0a';
const FIELD_BG_BASE = '#1a1816';
const TICK_COUNT = 72;
const TICK_MAJOR_EVERY = 9;

function drawPolariscopeCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  dpr: number,
  params: {
    view: PolariscopeCanvasView;
    brightness: number;
    rotation: number;
    sampleOn: boolean;
    sampleShape: PolariscopeSampleShape;
    showRotationScale: boolean;
  },
) {
  const { view, brightness, rotation, sampleOn, sampleShape, showRotationScale } = params;
  const cx = w / 2;
  const cy = w / 2;
  const r = w / 2 - 2 * dpr;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, w);

  // 外框黑色圆
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = FIELD_BG_OFF;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  if (view === 'off') {
    ctx.restore();
    return;
  }

  // ── 视场底色（模拟透过下偏光片的均匀照明） ──
  if (view === 'crossed-dark') {
    // 正交偏光无样品：几乎全暗
    ctx.fillStyle = FIELD_BG_BASE;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);

    // 极微弱的暗红色环境光（模拟真实偏光镜漏光）
    const ambientGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    ambientGrad.addColorStop(0, 'rgba(40, 20, 30, 0.25)');
    ambientGrad.addColorStop(0.6, 'rgba(20, 10, 15, 0.15)');
    ambientGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = ambientGrad;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  } else if (view === 'upper-polar-calibration') {
    // 上偏光片校准：无样品，视域亮度由上下偏光片夹角连续控制。
    const alpha = Math.max(0, Math.min(1, brightness));
    ctx.fillStyle = FIELD_BG_BASE;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);

    const brightGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    brightGrad.addColorStop(0, `rgba(255, 251, 230, ${0.18 + 0.82 * alpha})`);
    brightGrad.addColorStop(0.5, `rgba(254, 243, 199, ${0.10 + 0.72 * alpha})`);
    brightGrad.addColorStop(0.85, `rgba(253, 230, 138, ${0.06 + 0.52 * alpha})`);
    brightGrad.addColorStop(1, `rgba(212, 160, 23, ${0.03 + 0.34 * alpha})`);
    ctx.fillStyle = brightGrad;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  } else if (view === 'parallel') {
    // 平行偏光：底光全透，明亮暖白色
    const brightGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    brightGrad.addColorStop(0, '#fffbe6');
    brightGrad.addColorStop(0.5, '#fef3c7');
    brightGrad.addColorStop(0.85, '#fde68a');
    brightGrad.addColorStop(1, '#d4a017');
    ctx.fillStyle = brightGrad;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);

    // 样品色（偏光片平行时样品透射光）
    if (sampleOn) {
      drawSampleOverlay(ctx, cx, cy, r, 1.0, rotation, sampleShape);
    }
  } else if (view === 'crossed-sample') {
    // 正交偏光 + 样品：亮度由 brightness 控制
    // 底色先铺暗
    ctx.fillStyle = FIELD_BG_BASE;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);

    if (sampleOn) {
      drawSampleOverlay(ctx, cx, cy, r, brightness, rotation, sampleShape);
    } else {
      // 无样品：暗场 + 微弱漏光
      const ambientGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      ambientGrad.addColorStop(0, 'rgba(40, 20, 30, 0.25)');
      ambientGrad.addColorStop(0.6, 'rgba(20, 10, 15, 0.15)');
      ambientGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = ambientGrad;
      ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
  }

  // ── 载物台旋转刻度环 ──
  if (sampleOn && showRotationScale) {
    drawRotationScale(ctx, cx, cy, r, rotation, dpr);
  }

  ctx.restore();
}

/**
 * 绘制样品在偏光镜下的明暗叠加效果。
 * brightness=0 → 样品响应暗，brightness=1 → 样品响应最亮。
 */
function drawSampleOverlay(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  brightness: number,
  rotation: number,
  sampleShape: PolariscopeSampleShape,
) {
  if (sampleShape === 'faceted-rectangle') {
    drawFacetedRectangleSample(ctx, cx, cy, r, brightness, rotation);
    return;
  }
  if (sampleShape === 'cabochon-oval') {
    drawCabochonOvalSample(ctx, cx, cy, r, brightness, rotation);
    return;
  }

  // 样品区域（约占视场 40%）
  const sampleR = r * 0.42;
  // 视觉平滑：避免 brightness 在阈值附近发生“分支跳变”
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const smoothstep = (edge0: number, edge1: number, x: number) => {
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  };
  const alpha = clamp01(Math.pow(brightness, 0.9)); // 轻微 gamma，过渡更柔和

  // 暗底始终存在，再连续叠加亮层
  const darkBase = ctx.createRadialGradient(cx, cy, 0, cx, cy, sampleR);
  darkBase.addColorStop(0, `rgba(30, 20, 25, ${0.90 - 0.40 * alpha})`);
  darkBase.addColorStop(0.5, `rgba(20, 12, 18, ${0.85 - 0.35 * alpha})`);
  darkBase.addColorStop(1, `rgba(10, 5, 10, ${0.60 - 0.25 * alpha})`);
  ctx.fillStyle = darkBase;
  ctx.beginPath();
  ctx.arc(cx, cy, sampleR, 0, Math.PI * 2);
  ctx.fill();

  const brightMix = smoothstep(0.03, 0.97, alpha);
  const r255 = Math.round(200 + 55 * brightMix);
  const g255 = Math.round(180 + 75 * brightMix);
  const b255 = Math.round(80 + 140 * brightMix);
  const brightGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, sampleR);
  brightGrad.addColorStop(0, `rgba(${r255}, ${g255}, ${b255}, ${0.08 + 0.84 * brightMix})`);
  brightGrad.addColorStop(0.5, `rgba(${r255 - 20}, ${g255 - 20}, ${b255 - 30}, ${0.06 + 0.70 * brightMix})`);
  brightGrad.addColorStop(1, `rgba(${r255 - 60}, ${g255 - 60}, ${b255 - 50}, ${0.03 + 0.35 * brightMix})`);
  ctx.fillStyle = brightGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, sampleR, 0, Math.PI * 2);
  ctx.fill();

  // 中段干涉色改为连续权重，避免 0.2/0.8 附近突变
  const midBand = smoothstep(0.12, 0.5, alpha) * (1 - smoothstep(0.5, 0.88, alpha));
  if (midBand > 0.001) {
    const hueShift = alpha * 30;
    ctx.fillStyle = `rgba(${120 + hueShift}, ${80 + hueShift * 0.5}, ${200 - hueShift}, ${0.12 * midBand})`;
    ctx.beginPath();
    ctx.arc(cx, cy, sampleR * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCabochonOvalSample(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  brightness: number,
  rotation: number,
) {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const alpha = clamp01(Math.pow(brightness, 0.85));
  const brightMix = alpha * alpha * (3 - 2 * alpha);
  const width = r * 0.78;
  const height = r * 0.46;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(1, height / width);

  const ovalR = width / 2;
  ctx.beginPath();
  ctx.arc(0, 0, ovalR, 0, Math.PI * 2);
  ctx.closePath();

  ctx.save();
  ctx.clip();

  ctx.fillStyle = `rgba(78, 220, 164, ${0.04 + 0.42 * brightMix})`;
  ctx.fill();

  const glow = ctx.createRadialGradient(-ovalR * 0.12, -ovalR * 0.16, 0, 0, 0, ovalR * 0.92);
  glow.addColorStop(0, `rgba(214,255,232,${0.01 + 0.41 * brightMix})`);
  glow.addColorStop(0.48, `rgba(82,224,169,${0.02 + 0.24 * brightMix})`);
  glow.addColorStop(1, 'rgba(25,92,68,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-ovalR, -ovalR, ovalR * 2, ovalR * 2);

  const dome = ctx.createLinearGradient(0, -ovalR, 0, ovalR);
  dome.addColorStop(0, `rgba(230,255,238,${0.01 + 0.23 * brightMix})`);
  dome.addColorStop(0.55, 'rgba(255,255,255,0)');
  dome.addColorStop(1, `rgba(7,36,27,${0.02 + 0.10 * brightMix})`);
  ctx.fillStyle = dome;
  ctx.fillRect(-ovalR, -ovalR, ovalR * 2, ovalR * 2);

  ctx.beginPath();
  ctx.ellipse(-ovalR * 0.26, -ovalR * 0.32, ovalR * 0.28, ovalR * 0.11, -0.55, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(238,255,244,${0.01 + 0.20 * brightMix})`;
  ctx.fill();

  ctx.restore();

  const guideAlpha = 0.14 + 0.42 * brightMix;
  ctx.strokeStyle = `rgba(214,255,232,${guideAlpha})`;
  ctx.lineWidth = Math.max(1.2, r * 0.004);

  ctx.beginPath();
  ctx.arc(0, 0, ovalR * 0.58, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(214,255,232,${guideAlpha * 0.82})`;
  for (const y of [-0.28, 0.28]) {
    ctx.beginPath();
    ctx.moveTo(-ovalR * 0.58, ovalR * y);
    ctx.bezierCurveTo(
      -ovalR * 0.24,
      ovalR * y * 0.54,
      ovalR * 0.24,
      ovalR * y * 0.54,
      ovalR * 0.58,
      ovalR * y,
    );
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(0, 0, ovalR, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(198,255,224,${0.22 + 0.74 * brightMix})`;
  ctx.lineWidth = Math.max(2.2, r * 0.01);
  ctx.stroke();

  ctx.restore();
}

function traceEmeraldCutPath(ctx: CanvasRenderingContext2D, width: number, height: number, corner: number) {
  const hw = width / 2;
  const hh = height / 2;

  ctx.beginPath();
  ctx.moveTo(-hw + corner, -hh);
  ctx.lineTo(hw - corner, -hh);
  ctx.lineTo(hw, -hh + corner);
  ctx.lineTo(hw, hh - corner);
  ctx.lineTo(hw - corner, hh);
  ctx.lineTo(-hw + corner, hh);
  ctx.lineTo(-hw, hh - corner);
  ctx.lineTo(-hw, -hh + corner);
  ctx.closePath();
}

function strokeFacetLine(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
) {
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
}

function drawFacetedRectangleSample(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  brightness: number,
  rotation: number,
) {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const alpha = clamp01(Math.pow(brightness, 0.9));
  const brightMix = alpha * alpha * (3 - 2 * alpha);
  const width = r * 0.82;
  const height = r * 0.42;
  const corner = height * 0.24;
  const tableWidth = width * 0.58;
  const tableHeight = height * 0.46;
  const tableCorner = tableHeight * 0.28;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotation * Math.PI) / 180);

  traceEmeraldCutPath(ctx, width, height, corner);
  ctx.save();
  ctx.clip();

  const darkBase = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
  darkBase.addColorStop(0, `rgba(18, 14, 24, ${0.94 - 0.42 * alpha})`);
  darkBase.addColorStop(0.48, `rgba(30, 20, 34, ${0.90 - 0.36 * alpha})`);
  darkBase.addColorStop(1, `rgba(9, 8, 14, ${0.82 - 0.28 * alpha})`);
  ctx.fillStyle = darkBase;
  ctx.fillRect(-width / 2, -height / 2, width, height);

  const brightLayer = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
  brightLayer.addColorStop(0, `rgba(100, 190, 255, ${0.04 + 0.34 * brightMix})`);
  brightLayer.addColorStop(0.42, `rgba(255, 236, 164, ${0.05 + 0.78 * brightMix})`);
  brightLayer.addColorStop(0.62, `rgba(255, 160, 214, ${0.03 + 0.42 * brightMix})`);
  brightLayer.addColorStop(1, `rgba(111, 213, 195, ${0.03 + 0.30 * brightMix})`);
  ctx.fillStyle = brightLayer;
  ctx.fillRect(-width / 2, -height / 2, width, height);

  const facetAlpha = 0.07 + 0.28 * brightMix;
  ctx.strokeStyle = `rgba(255,255,255,${facetAlpha})`;
  ctx.lineWidth = Math.max(1, r * 0.006);
  ctx.beginPath();

  // Step-cut facet seams: connect corresponding outer and inner octagon corners.
  // Avoid decorative cross-lines through the table; the center should read as one clean facet.
  strokeFacetLine(ctx, -width / 2 + corner, -height / 2, -tableWidth / 2 + tableCorner, -tableHeight / 2);
  strokeFacetLine(ctx, width / 2 - corner, -height / 2, tableWidth / 2 - tableCorner, -tableHeight / 2);
  strokeFacetLine(ctx, width / 2, -height / 2 + corner, tableWidth / 2, -tableHeight / 2 + tableCorner);
  strokeFacetLine(ctx, width / 2, height / 2 - corner, tableWidth / 2, tableHeight / 2 - tableCorner);
  strokeFacetLine(ctx, width / 2 - corner, height / 2, tableWidth / 2 - tableCorner, tableHeight / 2);
  strokeFacetLine(ctx, -width / 2 + corner, height / 2, -tableWidth / 2 + tableCorner, tableHeight / 2);
  strokeFacetLine(ctx, -width / 2, height / 2 - corner, -tableWidth / 2, tableHeight / 2 - tableCorner);
  strokeFacetLine(ctx, -width / 2, -height / 2 + corner, -tableWidth / 2, -tableHeight / 2 + tableCorner);

  const stepInset = height * 0.13;
  strokeFacetLine(ctx, -width / 2 + corner * 1.35, -height / 2 + stepInset, width / 2 - corner * 1.35, -height / 2 + stepInset);
  strokeFacetLine(ctx, -width / 2 + corner * 1.35, height / 2 - stepInset, width / 2 - corner * 1.35, height / 2 - stepInset);
  strokeFacetLine(ctx, -width / 2 + stepInset, -height / 2 + corner * 1.25, -width / 2 + stepInset, height / 2 - corner * 1.25);
  strokeFacetLine(ctx, width / 2 - stepInset, -height / 2 + corner * 1.25, width / 2 - stepInset, height / 2 - corner * 1.25);
  ctx.stroke();

  ctx.restore();

  traceEmeraldCutPath(ctx, width, height, corner);
  ctx.strokeStyle = `rgba(255,255,255,${0.16 + 0.30 * brightMix})`;
  ctx.lineWidth = Math.max(1.5, r * 0.01);
  ctx.stroke();

  traceEmeraldCutPath(ctx, tableWidth, tableHeight, tableCorner);
  ctx.strokeStyle = `rgba(255,255,255,${0.13 + 0.24 * brightMix})`;
  ctx.lineWidth = Math.max(1, r * 0.006);
  ctx.stroke();

  ctx.restore();
}

/**
 * 绘制载物台旋转刻度环 + 当前角度指示线
 */
function drawRotationScale(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  rotation: number,
  dpr: number,
) {
  const scaleR = r * 0.92;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotation * Math.PI) / 180);

  // 刻度线
  for (let i = 0; i < TICK_COUNT; i++) {
    const angle = (i / TICK_COUNT) * 2 * Math.PI;
    const isMajor = i % TICK_MAJOR_EVERY === 0;
    const innerR = isMajor ? scaleR - 10 * dpr : scaleR - 5 * dpr;
    const outerR = scaleR;

    const x1 = Math.cos(angle) * innerR;
    const y1 = Math.sin(angle) * innerR;
    const x2 = Math.cos(angle) * outerR;
    const y2 = Math.sin(angle) * outerR;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = isMajor ? 'rgba(200, 185, 160, 0.6)' : 'rgba(160, 150, 130, 0.3)';
    ctx.lineWidth = isMajor ? 1.2 * dpr : 0.5 * dpr;
    ctx.stroke();
  }

  // 角度指示线（12点方向，固定在旋转坐标系中）
  const pointerLen = r * 0.18;
  const pointerStart = scaleR - pointerLen;
  ctx.beginPath();
  ctx.moveTo(0, -pointerStart);
  ctx.lineTo(0, -scaleR);
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
  ctx.lineWidth = 2 * dpr;
  ctx.lineCap = 'round';
  ctx.stroke();

  // 指针顶端圆点
  ctx.beginPath();
  ctx.arc(0, -scaleR, 3 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.90)';
  ctx.fill();

  ctx.restore();
}

export default function ObservationCanvas({
  view,
  brightness,
  rotation,
  sampleOn,
  sampleShape = 'round',
  size = 280,
  fill = false,
  showLabel = true,
  showRotationScale = true,
  children,
}: {
  view: PolariscopeCanvasView;
  brightness: number;
  rotation: number;
  sampleOn: boolean;
  sampleShape?: PolariscopeSampleShape;
  size?: number;
  /** 填满父级正方形/圆形区域，适合嵌入拟真仪器内环 */
  fill?: boolean;
  showLabel?: boolean;
  showRotationScale?: boolean;
  /** 叠在圆形观察区内的浮层（如观察姿势示意），建议 pointer-events-none */
  children?: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const [measuredSize, setMeasuredSize] = useState(size);
  const effectiveSize = fill ? measuredSize : size;
  const pixelSize = Math.round(effectiveSize * dpr);

  useLayoutEffect(() => {
    if (!fill) {
      setMeasuredSize(size);
      return;
    }
    const el = hostRef.current;
    if (!el) return;
    const updateSize = () => {
      const next = Math.floor(Math.min(el.clientWidth, el.clientHeight));
      if (next > 0) setMeasuredSize(next);
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill, size]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (view === 'off') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawPolariscopeCanvas(ctx, pixelSize, dpr, {
      view,
      brightness,
      rotation,
      sampleOn,
      sampleShape,
      showRotationScale,
    });
  }, [view, brightness, rotation, sampleOn, sampleShape, showRotationScale, pixelSize, dpr]);

  const info = computePhenomenonLabel(view, brightness, rotation);

  return (
    <div ref={hostRef} className={fill ? 'h-full w-full' : 'flex flex-col items-center gap-2'}>
      <div
        className="relative overflow-hidden rounded-full border-4 border-[#1a1a1a] shadow-card"
        style={{
          width: fill ? '100%' : size,
          height: fill ? '100%' : size,
          background: '#0a0a0a',
        }}
      >
        {view === 'off' ? (
          <div className="relative z-[1] flex h-full w-full flex-col items-center justify-center gap-1.5 text-center">
            <div className="text-3xl opacity-60">💡</div>
            <div className="text-xs font-medium text-slate-300">观察窗口已锁定</div>
            <div className="px-6 text-[10px] leading-relaxed text-slate-500">
              请打开 LED 光源
              <br />
              并放置样品
            </div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={pixelSize}
            height={pixelSize}
            className="absolute inset-0 z-0 h-full w-full"
            style={{
              width: fill ? '100%' : size,
              height: fill ? '100%' : size,
            }}
          />
        )}
        {children != null && (
          <div className="pointer-events-none absolute inset-0 z-20 flex justify-end p-1">
            <div className="max-h-full max-w-[42%] shrink-0 overflow-hidden">{children}</div>
          </div>
        )}
      </div>

      {showLabel && (
        <div
          className={clsx(
            'rounded-full px-3 py-0.5 text-[11px] font-mono uppercase tracking-widest',
            brightness > 0.5 || view === 'parallel'
              ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
              : view === 'off'
                ? 'bg-slate-100 text-slate-500'
                : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
          )}
        >
          {info.label} · {rotation.toFixed(0)}°
        </div>
      )}
    </div>
  );
}

function computePhenomenonLabel(
  view: PolariscopeCanvasView,
  brightness: number,
  _rotation: number,
): { label: string } {
  if (view === 'off') return { label: 'POWER OFF' };
  if (view === 'crossed-dark') return { label: '正交暗场' };
  if (view === 'upper-polar-calibration') {
    if (brightness <= 0.05) return { label: '校准视域接近全暗' };
    if (brightness > 0.5) return { label: '校准视域透光' };
    return { label: '校准视域过渡' };
  }
  if (view === 'parallel') return { label: '平行偏光（全亮）' };

  if (brightness >= 0.99) return { label: '样品最亮位' };
  if (brightness <= 0.01) return { label: '暗位 / 全暗' };
  if (brightness > 0.5) return { label: '明位' };
  return { label: '暗位' };
}
