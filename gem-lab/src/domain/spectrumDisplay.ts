import type { AbsorptionFeature } from '../data/types';

/**
 * 分光镜观察条件 → 目镜里看到的光谱（教学模拟）。
 *
 * 参考光谱只有一份（样品数据里的吸收特征）；条件变化只作为显示时的变换叠加上去，不另画一套光谱。
 * 依据：docs/仪器课程素材清单-2026-10-08.md「条件不合适时的对照」（用户 10-08 确认先用合理模拟）。
 * - 合适设置：手持分光镜分辨率有限，相距不到 3 nm 的细线（如红宝石 694 / 692、476 / 475）本来就看成一条细线；
 * - 狭缝过宽：分辨率下降，相距更远的细线也并成模糊的带，对比度降低，弱线先消失；
 * - 狭缝过窄：整体变暗、紫端先暗，弱线看不清；
 * - 焦距偏离（仅棱镜式）：随偏离量变模糊，弱线先消失；
 * - 透光太弱：整体变暗、蓝紫端先变黑，「暗」不等于吸收；
 * - 光没有穿过样品：只见连续光谱，看不到样品的吸收；
 * - 光栅式：狭缝和焦距固定，只受对光与光强影响，整体比棱镜式暗。
 */

export type Dispersion = 'prism' | 'grating';

export interface SpectrumConditions {
  dispersion: Dispersion;
  /** 0–1；仅棱镜式可调。合适区间见 SLIT_OK。 */
  slit: number;
  /** 0–1；仅棱镜式可调，0.5 为清晰。 */
  focus: number;
  /** 透过样品进入狭缝的光是否足够。 */
  light: 'ok' | 'weak';
  /** 光是否穿过样品再进入分光镜。 */
  throughSample: boolean;
}

export interface DisplayedFeature extends AbsorptionFeature {
  /** 0–1，显示的黑度。 */
  opacity: number;
}

export interface SpectrumDisplay {
  features: DisplayedFeature[];
  blurPx: number;
  /** 整体亮度倍数。 */
  brightness: number;
  /** 0–1，蓝紫端额外变暗的程度。 */
  violetDim: number;
  /** 当前影响观察的条件，按优先顺序。 */
  problems: SpectrumProblem[];
}

export type SpectrumProblem = 'not-through-sample' | 'weak-light' | 'slit-wide' | 'slit-narrow' | 'defocus';

export const SLIT_OK: readonly [number, number] = [0.22, 0.42];
export const FOCUS_TOLERANCE = 0.06;
/** 合适设置下能分开的最小波长间隔（nm）：红宝石 694 / 692、476 / 475 在手持分光镜下各呈一条细线（用户 10-09 确认）。 */
const BASE_RESOLUTION = 3;
/** 低于此黑度的特征视为看不见。 */
const VISIBLE = 0.25;
const BASE_OPACITY = { strong: 0.95, medium: 0.7, weak: 0.45 } as const;

export const IDEAL_CONDITIONS: SpectrumConditions = { dispersion: 'prism', slit: 0.32, focus: 0.5, light: 'ok', throughSample: true };

export function spectrumProblems(c: SpectrumConditions): SpectrumProblem[] {
  const problems: SpectrumProblem[] = [];
  if (!c.throughSample) return ['not-through-sample'];
  if (c.light === 'weak') problems.push('weak-light');
  if (c.dispersion === 'prism') {
    if (c.slit > SLIT_OK[1]) problems.push('slit-wide');
    if (c.slit < SLIT_OK[0]) problems.push('slit-narrow');
    if (Math.abs(c.focus - 0.5) > FOCUS_TOLERANCE) problems.push('defocus');
  }
  return problems;
}

export function displaySpectrum(reference: readonly AbsorptionFeature[], c: SpectrumConditions): SpectrumDisplay {
  const problems = spectrumProblems(c);
  const prism = c.dispersion === 'prism';
  if (!c.throughSample) return { features: [], blurPx: 0, brightness: 1, violetDim: 0, problems };

  const wide = prism ? Math.max(0, c.slit - SLIT_OK[1]) : 0;
  const narrow = prism ? Math.max(0, SLIT_OK[0] - c.slit) : 0;
  const defocus = prism ? Math.max(0, Math.abs(c.focus - 0.5) - FOCUS_TOLERANCE) : 0;
  const weak = c.light === 'weak';

  // 分辨率（nm）：狭缝越宽、越失焦，能分开的间隔越大。
  const resolution = BASE_RESOLUTION + wide * 40 + defocus * 30;
  // 各条件相乘：同时有几项不合适时强特征仍隐约可见，不会被误认为连续光谱。
  const contrast = Math.max(0, (1 - wide * 1.6) * (1 - defocus * 2) * (1 - narrow * 4) * (weak ? 0.5 : 1));
  const brightness = (prism ? 1 : 0.82) * (1 - narrow * 2.5) * (weak ? 0.45 : 1);
  const violetDim = Math.min(1, narrow * 3 + (weak ? 0.7 : 0));
  const blurPx = Math.min(8, wide * 14 + defocus * 22);

  const merged = mergeUnresolved(reference, resolution);
  const features = merged
    .map((f) => ({ ...f, opacity: BASE_OPACITY[f.intensity] * contrast * (f.wavelength < 470 ? 1 - violetDim * 0.6 : 1) }))
    .filter((f) => f.opacity >= VISIBLE);
  return { features, blurPx, brightness, violetDim, problems };
}

/** 间隔小于分辨率的相邻吸收线并成一条，强度取较强者：本来就分不开的仍是一条细线，因狭缝或失焦才并在一起的显示为模糊的带。吸收带不参与合并。 */
function mergeUnresolved(reference: readonly AbsorptionFeature[], resolution: number): AbsorptionFeature[] {
  const order = { weak: 0, medium: 1, strong: 2 } as const;
  const lines = reference.filter((f) => f.type === 'line').sort((a, b) => a.wavelength - b.wavelength);
  const out: AbsorptionFeature[] = reference.filter((f) => f.type === 'band');
  let group: AbsorptionFeature[] = [];
  const flush = () => {
    if (!group.length) return;
    if (group.length === 1) out.push(group[0]);
    else {
      // 同样强时取数据中先列出的主线（如 476 / 475 取 476）。
      const strongest = group.reduce((a, b) => (order[b.intensity] > order[a.intensity] || (order[b.intensity] === order[a.intensity] && reference.indexOf(b) < reference.indexOf(a)) ? b : a));
      const low = group[0].wavelength, high = group[group.length - 1].wavelength;
      if (high - low < BASE_RESOLUTION) out.push(strongest);
      else out.push({ ...strongest, type: 'band', wavelength: (low + high) / 2, width: high - low + resolution });
    }
    group = [];
  };
  for (const line of lines) {
    if (group.length && line.wavelength - group[group.length - 1].wavelength >= resolution) flush();
    group.push(line);
  }
  flush();
  return out.sort((a, b) => a.wavelength - b.wavelength);
}

/** 两个波长在当前显示中是否能分开看见。 */
export function resolvedApart(display: SpectrumDisplay, a: number, b: number): boolean {
  const hit = (wl: number) => display.features.findIndex((f) => (f.type === 'line' ? f.wavelength === wl : Math.abs(f.wavelength - wl) <= (f.width ?? 0) / 2));
  const ia = hit(a), ib = hit(b);
  return ia >= 0 && ib >= 0 && ia !== ib;
}

/** 学员标记的位置与参考吸收特征的匹配：线 ±4 nm，带在带宽内。 */
export function markMatches(mark: number, f: AbsorptionFeature): boolean {
  return f.type === 'line' ? Math.abs(mark - f.wavelength) <= 4 : Math.abs(mark - f.wavelength) <= (f.width ?? 10) / 2;
}
