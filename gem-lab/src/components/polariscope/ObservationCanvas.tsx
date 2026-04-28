import { useLayoutEffect, useRef } from 'react';
import clsx from '@/utils/clsx';
import type { OpticalCharacter } from '@/data/types';

export type PolariscopeCanvasView =
  | 'off'
  | 'crossed-dark'
  | 'crossed-sample'
  | 'parallel';

/**
 * 根据旋转角度 + 样品光性 + 偏光位置计算当前现象。
 * bright 值域 [0,1]，0=全暗，1=全亮，中间值表示过渡态。
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
    return { view: 'crossed-sample', brightness: 1, label: '全亮（集合体）' };
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
  },
) {
  const { view, brightness, rotation, sampleOn } = params;
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
      drawSampleOverlay(ctx, cx, cy, r, 1.0);
    }
  } else if (view === 'crossed-sample') {
    // 正交偏光 + 样品：亮度由 brightness 控制
    // 底色先铺暗
    ctx.fillStyle = FIELD_BG_BASE;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);

    if (sampleOn) {
      drawSampleOverlay(ctx, cx, cy, r, brightness);
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
  if (sampleOn) {
    drawRotationScale(ctx, cx, cy, r, rotation, dpr);
  }

  ctx.restore();
}

/**
 * 绘制样品在偏光镜下的明暗叠加效果。
 * brightness=0 → 全暗遮罩，brightness=1 → 全亮透明。
 */
function drawSampleOverlay(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  brightness: number,
) {
  // 样品区域（约占视场 40%）
  const sampleR = r * 0.42;

  if (brightness >= 0.99) {
    // 全亮：暖白色透射光
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, sampleR);
    grad.addColorStop(0, 'rgba(255, 251, 230, 0.92)');
    grad.addColorStop(0.4, 'rgba(254, 243, 199, 0.85)');
    grad.addColorStop(0.75, 'rgba(253, 230, 138, 0.70)');
    grad.addColorStop(1, 'rgba(212, 160, 23, 0.30)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, sampleR, 0, Math.PI * 2);
    ctx.fill();
  } else if (brightness <= 0.01) {
    // 全暗：几乎无透射光
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, sampleR);
    grad.addColorStop(0, 'rgba(30, 20, 25, 0.90)');
    grad.addColorStop(0.5, 'rgba(20, 12, 18, 0.85)');
    grad.addColorStop(1, 'rgba(10, 5, 10, 0.60)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, sampleR, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 过渡态：部分亮部分暗，模拟干涉色
    // 亮区用暖白/黄色，暗区用深紫/棕色
    const alpha = brightness;

    // 先画暗底
    ctx.fillStyle = 'rgba(25, 15, 20, 0.80)';
    ctx.beginPath();
    ctx.arc(cx, cy, sampleR, 0, Math.PI * 2);
    ctx.fill();

    // 再叠加亮区（透明度由 brightness 控制）
    const brightGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, sampleR);
    const r255 = Math.round(200 + 55 * alpha);
    const g255 = Math.round(180 + 75 * alpha);
    const b255 = Math.round(80 + 140 * alpha);
    brightGrad.addColorStop(0, `rgba(${r255}, ${g255}, ${b255}, ${0.15 + 0.75 * alpha})`);
    brightGrad.addColorStop(0.5, `rgba(${r255 - 20}, ${g255 - 20}, ${b255 - 30}, ${0.10 + 0.65 * alpha})`);
    brightGrad.addColorStop(1, `rgba(${r255 - 60}, ${g255 - 60}, ${b255 - 50}, ${0.05 + 0.30 * alpha})`);
    ctx.fillStyle = brightGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, sampleR, 0, Math.PI * 2);
    ctx.fill();

    // 在中等亮度时添加微弱的干涉色（蓝紫/橙色）
    if (alpha > 0.2 && alpha < 0.8) {
      const hueShift = alpha * 30;
      ctx.fillStyle = `rgba(${120 + hueShift}, ${80 + hueShift * 0.5}, ${200 - hueShift}, ${0.08 * (1 - Math.abs(alpha - 0.5) * 2)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, sampleR * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
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
  size = 280,
}: {
  view: PolariscopeCanvasView;
  brightness: number;
  rotation: number;
  sampleOn: boolean;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const pixelSize = Math.round(size * dpr);

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
    });
  }, [view, brightness, rotation, sampleOn, pixelSize, dpr]);

  const info = computePhenomenonLabel(view, brightness, rotation);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative overflow-hidden rounded-full border-4 border-[#1a1a1a] shadow-card"
        style={{ width: size, height: size, background: '#0a0a0a' }}
      >
        {view === 'off' ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-center">
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
            className="absolute inset-0 h-full w-full"
            style={{ width: size, height: size }}
          />
        )}
      </div>

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
  if (view === 'parallel') return { label: '平行偏光（全亮）' };

  if (brightness >= 0.99) return { label: '全亮（集合体）' };
  if (brightness <= 0.01) return { label: '全暗（均质体）' };
  if (brightness > 0.5) return { label: '明位' };
  return { label: '暗位' };
}
