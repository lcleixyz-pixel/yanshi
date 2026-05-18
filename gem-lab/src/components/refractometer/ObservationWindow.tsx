import clsx from '@/utils/clsx';
import type { OpticalCharacter, SampleDef } from '@/data/types';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  OIL_REFRACTIVE_INDEX,
  RI_MAX,
  RI_MIN,
  getSpotDisplayRi,
  getSpotTargetRi,
  isSpotBisected,
  riToY,
} from '@/components/refractometer/refractometerObsUtils';

export type RefractometerView =
  | 'off'
  | 'scale-only'
  | 'oil-empty'
  | 'spot'
  | 'single'
  | 'double'
  | 'over-range';

const FACET_IMG_OVER: string = '/assets/observations/refractometer/empty.png';

// ─── 绘制参数（比例相对于圆半径 r） ──────────────────────────────────────
// 参考图分析：
//   圆心处水平中线 cx,cy
//   竖向光带：加宽但不压标尺，保持右边缘基本不变
//   标尺起点（tick左边）约 cx - 0.04r（紧靠光带右边）
//   标尺数字约 cx + 0.13r
//   可绘制纵向范围：cy ± 0.90r  对应 RI_SCALE_MIN / RI_SCALE_MAX

const BAND_CX_OFFSET = -0.31; // 光带中心 x = cx + BAND_CX_OFFSET * r（向左挪，给加宽留空间）
const BAND_HALF_W = 0.24;     // 光带半宽（变宽）
const TICK_START_X = -0.03;   // 标尺 tick 起始 x offset（相对 cx）
const TICK_MAJOR_LEN = 0.12;  // 主刻度线长
const TICK_MINOR_LEN = 0.06;
const LABEL_X_OFFSET = 0.15;  // 数字 x offset（相对 cx）
const INNER_Y_MARGIN = 0.90;  // 可见区竖向比例（cy ± r * 0.90）

const BAND_COLOR_FULL = 'rgba(255, 210, 90, 1)';
const SHADOW_ALPHA = 0.15; // 光带内阴影遮罩透明度
const ELLIPSE_SHADOW_ALPHA = 0.50; // 点测椭圆内部暗部透明度
const ELLIPSE_STROKE_ALPHA = 0.58; // 点测椭圆轮廓透明度
const OIL_MASK_ALPHA = 0.18;
const OIL_EDGE_MID_RATIO = 0.35;
const OIL_EDGE_WIDTH_RATIO = 0.010;
const OIL_MASK_CFG = {
  alpha: OIL_MASK_ALPHA,
  edgeMidRatio: OIL_EDGE_MID_RATIO,
  edgeWidthRatio: OIL_EDGE_WIDTH_RATIO,
} as const;

const GEM_MASK_ALPHA = 0.30;
const GEM_EDGE_MID_RATIO = 0.24;
const GEM_EDGE_WIDTH_RATIO = 0.0065;
const GEM_SINGLE_CFG = {
  alpha: GEM_MASK_ALPHA,
  edgeMidRatio: GEM_EDGE_MID_RATIO,
  edgeWidthRatio: GEM_EDGE_WIDTH_RATIO,
} as const;
/**
 * 双折射两层遮罩独立参数（仅 mode==='double' 生效）
 *
 * 命名说明：
 * - LO: 低 RI 边界（数值较小，画面更靠上）
 * - HI: 高 RI 边界（数值较大，画面更靠下）
 *
 * 参数含义：
 * - *_MASK_ALPHA: 遮罩暗度，越大越暗
 * - *_EDGE_MID_RATIO: 边缘过渡中点强度，越大边界越“实”
 * - *_EDGE_WIDTH_RATIO: 过渡宽度，越大越糊、越小越锐
 */
const GEM_LO_MASK_ALPHA = 0.34;
const GEM_LO_EDGE_MID_RATIO = 0.20;
const GEM_LO_EDGE_WIDTH_RATIO = 0.0072;
const GEM_LO_CFG = {
  alpha: GEM_LO_MASK_ALPHA,
  edgeMidRatio: GEM_LO_EDGE_MID_RATIO,
  edgeWidthRatio: GEM_LO_EDGE_WIDTH_RATIO,
} as const;

const GEM_HI_MASK_ALPHA = 0.38;
const GEM_HI_MASK_ALPHA_MIN = 0.0;
const GEM_HI_MASK_ALPHA_MAX = 0.54;
const GEM_HI_EDGE_MID_RATIO = 0.10;
const GEM_HI_EDGE_WIDTH_RATIO = 0.0058;
const GEM_HI_CFG_BASE = {
  edgeMidRatio: GEM_HI_EDGE_MID_RATIO,
  edgeWidthRatio: GEM_HI_EDGE_WIDTH_RATIO,
} as const;

function drawCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  dpr: number,
  phase: 'scale-only' | 'oil-empty' | 'spot',
  shadowBoundaryRI: number | null,
  spot: { show: false } | { show: true; centerRi: number; boundsRi: number },
) {
  const cx = w / 2;
  const cy = w / 2;
  const r = w / 2 - 2 * dpr;

  const innerTopY = cy - r * INNER_Y_MARGIN;
  const innerBottomY = cy + r * INNER_Y_MARGIN;

  const bandCX = cx + BAND_CX_OFFSET * r;
  const bandHW = BAND_HALF_W * r;
  const bandLeft = bandCX - bandHW;
  const bandRight = bandCX + bandHW;

  const tickStartX = cx + TICK_START_X * r;
  const tickMajorRight = tickStartX + TICK_MAJOR_LEN * r;
  const tickMinorRight = tickStartX + TICK_MINOR_LEN * r;
  const labelX = cx + LABEL_X_OFFSET * r;

  const toY = (ri: number) => riToY(ri, innerTopY, innerBottomY);

  // ── 清空 + 背景 ──
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, w);

  // 圆形外框（黑色背景）
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#0d0b09';
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // ── 竖向光带（环境渐变，模拟光源透射） ──
  const bandGrad = ctx.createLinearGradient(bandLeft - r * 0.04, 0, bandRight + r * 0.04, 0);
  bandGrad.addColorStop(0, 'rgba(255, 210, 80, 0)');
  bandGrad.addColorStop(0.12, 'rgba(255, 205, 75, 0.75)');
  bandGrad.addColorStop(0.35, BAND_COLOR_FULL);
  bandGrad.addColorStop(0.65, BAND_COLOR_FULL);
  bandGrad.addColorStop(0.88, 'rgba(255, 205, 75, 0.75)');
  bandGrad.addColorStop(1, 'rgba(255, 210, 80, 0)');
  ctx.fillStyle = bandGrad;
  ctx.fillRect(bandLeft - r * 0.04, cy - r, (bandRight - bandLeft + r * 0.08), 2 * r);

  // ── 光带内阴影（边界以上） ──
  if (shadowBoundaryRI !== null) {
    const yB = toY(shadowBoundaryRI);

    // 阴影主体：从光带顶部到边界
    ctx.fillStyle = `rgba(0, 0, 0, ${SHADOW_ALPHA})`;
    ctx.fillRect(bandLeft - r * 0.04, cy - r, bandRight - bandLeft + r * 0.08, yB - (cy - r));

    // 边界处软化渐变（避免硬边）
    const fade = r * 0.001;
    const edgeGrad = ctx.createLinearGradient(0, yB - fade, 0, yB + fade);
    edgeGrad.addColorStop(0, `rgba(0, 0, 0, ${SHADOW_ALPHA})`);
    edgeGrad.addColorStop(0.5, `rgba(0, 0, 0, ${SHADOW_ALPHA * 0.2})`);
    edgeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(bandLeft - r * 0.04, yB - fade, bandRight - bandLeft + r * 0.08, 2 * fade);
  }

  // ── 标尺刻度与数字 ──
  const riStep = 0.01;
  for (let ri = 1.35; ri <= 1.85 + 0.001; ri += riStep) {
    // 浮点精度修正
    const riRounded = Math.round(ri * 1000) / 1000;
    const y = toY(riRounded);
    if (y < cy - r || y > cy + r) continue;

    const isMajor = Math.round(riRounded * 100) % 5 === 0;
    const isLabeled = Math.round(riRounded * 100) % 5 === 0;

    ctx.beginPath();
    ctx.moveTo(tickStartX, y);
    ctx.lineTo(isMajor ? tickMajorRight : tickMinorRight, y);
    ctx.strokeStyle = isMajor ? 'rgba(200, 185, 160, 0.85)' : 'rgba(180, 165, 140, 0.5)';
    ctx.lineWidth = isMajor ? 1.4 * dpr : 0.7 * dpr;
    ctx.stroke();

    if (isLabeled) {
      ctx.fillStyle = '#c88820';
      ctx.font = `${Math.round(r * 0.13)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(riRounded.toFixed(2), labelX, y + r * 0.045);
    }
  }

  // ── 点测椭圆 ──
  if (phase === 'spot' && spot.show) {
    const ellCY = toY(spot.centerRi);
    const ellCX = bandCX;
    const ellRX = r * 0.13;
    const ellRY = r * 0.085;
    const elTop = ellCY - ellRY;
    const elBottom = ellCY + ellRY;

    if (shadowBoundaryRI !== null) {
      const yB = toY(spot.boundsRi);

      ctx.save();
      ctx.beginPath();
      ctx.ellipse(ellCX, ellCY, ellRX, ellRY, 0, 0, Math.PI * 2);
      ctx.clip();

      if (yB >= elBottom) {
        // 椭圆完全在阴影区：内部全暗
        ctx.fillStyle = `rgba(0, 0, 0, ${ELLIPSE_SHADOW_ALPHA})`;
        ctx.fillRect(ellCX - ellRX, elTop, ellRX * 2, ellRY * 2);
      } else if (yB > elTop) {
        // 椭圆横跨边界：上暗下透
        ctx.fillStyle = `rgba(0, 0, 0, ${ELLIPSE_SHADOW_ALPHA})`;
        ctx.fillRect(ellCX - ellRX, elTop, ellRX * 2, yB - elTop);
      }
      // yB <= elTop：椭圆完全在亮区，不加遮罩

      ctx.restore();
    }

    // 椭圆轮廓线（深色）
    ctx.beginPath();
    ctx.ellipse(ellCX, ellCY, ellRX, ellRY, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(18, 14, 10, ${ELLIPSE_STROKE_ALPHA})`;
    ctx.lineWidth = 1.8 * dpr;
    ctx.stroke();
  }

  ctx.restore();
}

/** 折射油 nD≈1.78；主折射率大于此值的刻面视场中不绘制样品遮罩，仅保留油遮罩 */
const GEM_MASK_MAX_RI = OIL_REFRACTIVE_INDEX;

type FacetBoundaryResult = {
  yLo: number | null;
  yHi: number | null;
  showGemMasks: boolean;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function isUniaxial(c: OpticalCharacter): boolean {
  return c === 'uniaxial-positive' || c === 'uniaxial-negative';
}

function isBiaxial(c: OpticalCharacter): boolean {
  return c === 'biaxial-positive' || c === 'biaxial-negative';
}

function resolveFacetBoundaries({
  opticalCharacter,
  mode,
  ri,
  riPair,
  sample01,
  toY,
}: {
  opticalCharacter: OpticalCharacter;
  mode: 'single' | 'double';
  ri: number;
  riPair: [number, number] | null;
  sample01: number;
  toY: (n: number) => number;
}): FacetBoundaryResult {
  if (mode === 'single') {
    return {
      yLo: ri <= GEM_MASK_MAX_RI ? toY(ri) : null,
      yHi: null,
      showGemMasks: ri <= GEM_MASK_MAX_RI,
    };
  }
  if (!riPair) return { yLo: null, yHi: null, showGemMasks: false };

  const [rLo, rHi] = riPair[0] < riPair[1] ? riPair : [riPair[1], riPair[0]];
  if (Math.max(rLo, rHi) > GEM_MASK_MAX_RI) {
    return { yLo: null, yHi: null, showGemMasks: false };
  }
  // 多晶集合体在折射仪中不模拟标准可分双边界，避免误导为一轴/二轴。
  if (opticalCharacter === 'aggregate') return { yLo: null, yHi: null, showGemMasks: false };

  const theta = 2 * Math.PI * sample01;
  const span = rHi - rLo;
  const c = (rLo + rHi) * 0.5;

  let nLo = rLo;
  let nHi: number | null = null;
  if (opticalCharacter === 'isotropic') {
    nLo = rLo;
    nHi = null;
  } else if (isUniaxial(opticalCharacter)) {
    const nFixed = rLo;
    const nMove = rLo + span * (0.5 + 0.5 * Math.cos(theta));
    nLo = Math.min(nFixed, nMove);
    nHi = Math.max(nFixed, nMove);
  } else if (isBiaxial(opticalCharacter)) {
    const sep01 = 0.45 + 0.55 * (0.5 + 0.5 * Math.cos(theta));
    const skew = 0.22 * Math.sin(theta);
    const center = c + span * skew * 0.25;
    const half = (span * sep01) * 0.5;
    let n1 = clamp(center - half, rLo, rHi);
    let n2 = clamp(center + half, rLo, rHi);
    if (n1 > n2) [n1, n2] = [n2, n1];
    nLo = n1;
    nHi = n2;
  }

  return {
    yLo: toY(nLo),
    yHi: nHi === null ? null : toY(nHi),
    showGemMasks: true,
  };
}

/**
 * 刻面法：光带 → 折射油 1.780 遮罩（全程）→ 单/双样品遮罩（RI≤油时）→ 标尺 → 交界线。
 * 双折射：两边界 RI 始终在 [nω, nε] 内；绕样旋转表现为两线从「向中靠拢」到「贴齐两端极值」，
 * 用 cos(2π·sample01) 驱动分离度，极值位时 n1=rLo、n2=rHi，绝不会画出区间外读数。
 */
function drawFacetCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  dpr: number,
  mode: 'single' | 'double',
  {
    sample01,
    pol01,
    usePolarizer,
    opticalCharacter,
    ri,
    riPair,
  }: {
    sample01: number;
    pol01: number;
    usePolarizer: boolean;
    opticalCharacter: OpticalCharacter;
    ri: number;
    riPair: [number, number] | null;
  },
) {
  const cx = w / 2;
  const cy = w / 2;
  const r = w / 2 - 2 * dpr;
  const innerTopY = cy - r * INNER_Y_MARGIN;
  const innerBottomY = cy + r * INNER_Y_MARGIN;
  const toY = (n: number) => riToY(n, innerTopY, innerBottomY);

  const bandCX = cx + BAND_CX_OFFSET * r;
  const bandHW = BAND_HALF_W * r;
  const bandLeft = bandCX - bandHW;
  const bandRight = bandCX + bandHW;

  const tickStartX = cx + TICK_START_X * r;
  const tickMajorRight = tickStartX + TICK_MAJOR_LEN * r;
  const tickMinorRight = tickStartX + TICK_MINOR_LEN * r;
  const labelX = cx + LABEL_X_OFFSET * r;

  const bandW = bandRight - bandLeft + r * 0.08;
  const bandPadL = r * 0.04;
  const fillBandLeft = bandLeft - bandPadL;
  const bandTop = cy - r;
  const drawMaskAbove = (
    yBoundary: number,
    {
      alpha,
      edgeMidRatio,
      edgeWidthRatio,
    }: {
      alpha: number;
      edgeMidRatio: number;
      edgeWidthRatio: number;
    },
  ) => {
    if (yBoundary <= bandTop) return;
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillRect(fillBandLeft, bandTop, bandW, yBoundary - bandTop);
    const fade = Math.max(r * 0.0008, r * edgeWidthRatio);
    const edgeGrad = ctx.createLinearGradient(0, yBoundary - fade, 0, yBoundary + fade);
    edgeGrad.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
    edgeGrad.addColorStop(0.5, `rgba(0, 0, 0, ${alpha * edgeMidRatio})`);
    edgeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(fillBandLeft, yBoundary - fade, bandW, 2 * fade);
  };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, w);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#0d0b09';
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  const bandGrad = ctx.createLinearGradient(
    fillBandLeft - r * 0.04,
    0,
    fillBandLeft + bandW,
    0,
  );
  bandGrad.addColorStop(0, 'rgba(255, 210, 80, 0)');
  bandGrad.addColorStop(0.12, 'rgba(255, 205, 75, 0.75)');
  bandGrad.addColorStop(0.35, BAND_COLOR_FULL);
  bandGrad.addColorStop(0.65, BAND_COLOR_FULL);
  bandGrad.addColorStop(0.88, 'rgba(255, 205, 75, 0.75)');
  bandGrad.addColorStop(1, 'rgba(255, 210, 80, 0)');
  ctx.fillStyle = bandGrad;
  ctx.fillRect(fillBandLeft, bandTop, bandW, 2 * r);

  const yOil = toY(OIL_REFRACTIVE_INDEX);
  drawMaskAbove(yOil, OIL_MASK_CFG);

  const boundaries = resolveFacetBoundaries({
    opticalCharacter,
    mode,
    ri,
    riPair,
    sample01,
    toY,
  });
  if (boundaries.showGemMasks && boundaries.yLo !== null) {
    if (mode === 'single' || boundaries.yHi === null) {
      drawMaskAbove(boundaries.yLo, GEM_SINGLE_CFG);
    } else {
      const hiMaskAlpha = usePolarizer
        ? GEM_HI_MASK_ALPHA_MIN + (GEM_HI_MASK_ALPHA_MAX - GEM_HI_MASK_ALPHA_MIN) * pol01
        : GEM_HI_MASK_ALPHA;
      drawMaskAbove(boundaries.yLo, GEM_LO_CFG);
      drawMaskAbove(boundaries.yHi, {
        alpha: hiMaskAlpha,
        ...GEM_HI_CFG_BASE,
      });
    }
  }

  const riStep = 0.01;
  for (let v = 1.35; v <= 1.85 + 0.001; v += riStep) {
    const vRounded = Math.round(v * 1000) / 1000;
    const y = toY(vRounded);
    if (y < cy - r || y > cy + r) continue;
    const isMajor = Math.round(vRounded * 100) % 5 === 0;
    const isLabeled = Math.round(vRounded * 100) % 5 === 0;
    ctx.beginPath();
    ctx.moveTo(tickStartX, y);
    ctx.lineTo(isMajor ? tickMajorRight : tickMinorRight, y);
    ctx.strokeStyle = isMajor ? 'rgba(200, 185, 160, 0.85)' : 'rgba(180, 165, 140, 0.5)';
    ctx.lineWidth = isMajor ? 1.4 * dpr : 0.7 * dpr;
    ctx.stroke();
    if (isLabeled) {
      ctx.fillStyle = '#c88820';
      ctx.font = `${Math.round(r * 0.13)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(vRounded.toFixed(2), labelX, y + r * 0.045);
    }
  }

  // 按教学要求：所有遮罩层不绘制描边，仅通过层叠暗度显示边界关系
  ctx.restore();
}

export default function ObservationWindow({
  view,
  sample,
  size = 260,
  spotSlider = 0.5,
  facetSample01 = 0.5,
  facetPol01 = 0.5,
  usePolarizer = false,
  showReading = false,
  hideChrome = false,
}: {
  view: RefractometerView;
  sample?: SampleDef;
  size?: number;
  spotSlider?: number;
  /** 0–1：刻面法测台旋转样品；双折射时驱动两边界在极值间摆动 */
  facetSample01?: number;
  /** 0–1：目镜头偏光片绕轴旋转（双折射时控制高 RI 遮罩层暗度） */
  facetPol01?: number;
  usePolarizer?: boolean;
  /** 操作门槛满足后才揭晓读数 */
  showReading?: boolean;
  /** 嵌入实物目镜环时只保留干净读数视野，避免状态胶囊外溢。 */
  hideChrome?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const pixelSize = Math.round(size * dpr);

  // 点测滑条 RI
  const sliderRI = RI_MIN + spotSlider * (RI_MAX - RI_MIN);

  // 样品边界 RI（点测用）
  const sampleBoundsRi: number | null = (() => {
    if (!sample) return null;
    const ri = sample.characteristics.refractiveIndex;
    if (ri === 'over-1.78') return null;
    return getSpotDisplayRi(ri);
  })();

  // 是否处于"对半"可估读状态
  const bisected =
    view === 'spot' && sampleBoundsRi != null && isSpotBisected(sliderRI, sampleBoundsRi);

  // 学习模式 facet 读数
  const facetReading = computeFacetReading(view, sample);

  const facetRiParams: {
    singleRi: number;
    pair: [number, number] | null;
  } | null = useMemo(() => {
    if (!sample || (view !== 'single' && view !== 'double')) return null;
    const r = sample.characteristics.refractiveIndex;
    if (r === 'over-1.78') return null;
    if (typeof r === 'number') return { singleRi: r, pair: null };
    return { singleRi: r[0], pair: r };
  }, [sample, view]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (view === 'off' || view === 'over-range') return;
    const opticalCharacter: OpticalCharacter = sample?.characteristics.opticalCharacter ?? 'isotropic';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (view === 'single' && facetRiParams) {
      drawFacetCanvas(ctx, pixelSize, dpr, 'single', {
        sample01: facetSample01,
        pol01: facetPol01,
        usePolarizer,
        opticalCharacter,
        ri: facetRiParams.singleRi,
        riPair: null,
      });
      return;
    }
    if (view === 'double' && facetRiParams?.pair) {
      drawFacetCanvas(ctx, pixelSize, dpr, 'double', {
        sample01: facetSample01,
        pol01: facetPol01,
        usePolarizer,
        opticalCharacter,
        ri: facetRiParams.singleRi,
        riPair: facetRiParams.pair,
      });
      return;
    }
    if (view === 'single' || view === 'double') return;

    const phase: 'scale-only' | 'oil-empty' | 'spot' =
      view === 'spot' ? 'spot' : view === 'oil-empty' ? 'oil-empty' : 'scale-only';

    const shadowBoundaryRI =
      phase === 'oil-empty'
        ? OIL_REFRACTIVE_INDEX
        : phase === 'spot' && sampleBoundsRi != null
          ? sampleBoundsRi
          : null;

    const spot =
      phase === 'spot' && sampleBoundsRi != null
        ? { show: true as const, centerRi: sliderRI, boundsRi: sampleBoundsRi }
        : { show: false as const };

    drawCanvas(ctx, pixelSize, dpr, phase, shadowBoundaryRI, spot);
  }, [
    view,
    sample,
    sliderRI,
    sampleBoundsRi,
    pixelSize,
    dpr,
    facetSample01,
    facetPol01,
    usePolarizer,
    facetRiParams,
  ]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <div
          className="relative overflow-hidden rounded-full border-4 border-[#1a1a1a] shadow-card"
          style={{ width: size, height: size, background: '#0d0b09' }}
        >
          {view === 'off' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center">
              <div className="text-3xl opacity-60">🔌</div>
              <div className="text-xs font-medium text-slate-300">观察窗口已锁定</div>
              <div className="px-3 text-[10px] leading-relaxed text-slate-500">
                💡 请先点击仪器右侧的电源开关
              </div>
            </div>
          )}

          {(view === 'scale-only' ||
            view === 'oil-empty' ||
            view === 'spot' ||
            view === 'single' ||
            view === 'double') && (
            <canvas
              ref={canvasRef}
              width={pixelSize}
              height={pixelSize}
              className="absolute inset-0 h-full w-full"
              style={{ width: size, height: size }}
            />
          )}

          {view === 'over-range' && (
            <>
              <img
                src={FACET_IMG_OVER}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />
            </>
          )}
        </div>
      </div>

      {!hideChrome && (
        <>
          <div className={clsx(
            'whitespace-nowrap rounded bg-black/70 px-2.5 py-1 font-mono text-xs font-bold text-amber-300',
            !(
              ((view === 'single' || view === 'double') && facetReading && showReading) ||
              (view === 'over-range' && showReading) ||
              (view === 'spot' && bisected && sampleBoundsRi != null)
            ) && 'invisible',
          )}>
            {((view === 'single' || view === 'double') && facetReading && showReading)
              ? <>{facetReading}<span className="ml-1 text-[9px] text-amber-300/70">nD</span></>
              : view === 'over-range' && showReading
                ? <>&gt; 1.780<span className="ml-1 text-[9px] text-amber-300/70">nD</span></>
                : view === 'spot' && bisected && sampleBoundsRi != null
                  ? <span data-testid="refractometer-spot-reading">{sampleBoundsRi.toFixed(2)}<span className="ml-1 text-[9px] text-amber-300/70">nD</span></span>
                  : <>&nbsp;</>
            }
          </div>

          <div
            className={clsx(
              'rounded-full px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-widest',
              view === 'off'
                ? 'bg-slate-100 text-slate-500'
                : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
            )}
          >
            {view === 'off' ? 'POWER OFF' : `OBSERVING · ${view.toUpperCase()}`}
          </div>

          <p
            className={clsx(
              'min-h-[15px] text-center text-[10px] font-medium transition-opacity',
              view === 'spot' && bisected ? 'text-emerald-600 opacity-100' : 'opacity-0',
            )}
          >
            明暗各半 — 可读两位小数
          </p>
        </>
      )}
    </div>
  );
}

function computeFacetReading(view: RefractometerView, sample?: SampleDef): string | null {
  if (!sample) return null;
  const ri = sample.characteristics.refractiveIndex;
  const isOverOil =
    ri === 'over-1.78' || (typeof ri === 'number' ? ri > OIL_REFRACTIVE_INDEX : Math.max(ri[0], ri[1]) > OIL_REFRACTIVE_INDEX);
  if (isOverOil || view === 'over-range') return null;
  if (view === 'single') {
    const v = typeof ri === 'number' ? ri : ri[0];
    return v.toFixed(3);
  }
  if (view === 'double' && typeof ri !== 'number') {
    return `${ri[0].toFixed(3)}-${ri[1].toFixed(3)}`;
  }
  return null;
}

// ─── 供 RefractometerDemo 使用的辅助函数 ─────────────────────────────────
export { isSpotBisected, getSpotTargetRi };
export type { RI_MIN, RI_MAX };
