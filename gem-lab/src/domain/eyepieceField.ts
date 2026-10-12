import {
  emptyFieldTransmission,
  linearRetarderRgb,
  linearToSrgb8,
  luminance,
  propagationOptics,
  quartzRgb,
  seededRandom,
  type QuartzActivity,
  type Rgb,
} from './polarizedLight';
import { sampleCrystal, type PolariscopeSampleProfile, type SampleViewSettings } from './polariscopeSamples';

/**
 * 目镜视场（正光）：从检偏器向下看到的圆形视场与其中的样品。
 * 样品光学图在「样品自身坐标」中预先生成一次，随物台旋转时只做坐标旋转与查表，
 * 每像素颜色按 I = cos²A − sin2ψ·sin2(ψ−A)·sin²(πΓ/λ) 的干涉色积分得出。
 */

const DEG = Math.PI / 180;

export interface SampleFieldMap {
  size: number;
  /** 样品覆盖：0 = 空，1 = 样品。 */
  inside: Uint8Array;
  /** 样品自身坐标下的振动方向（弧度）。 */
  psi: Float32Array;
  /** 光程差（nm）。 */
  gamma: Float32Array;
  /** 退偏比例。 */
  depolarization: Float32Array;
  /** 刻面/圆顶明暗与边线（0–1）。 */
  shade: Float32Array;
  bodyColor: Rgb;
  opaque: boolean;
  /** 样品在视场中的半径（视场半径为 1）。 */
  radius: number;
  /** 水晶旋光：每像素旋光路径（mm × cos²(与光轴夹角)）；非水晶为 null。 */
  rotaryPath: Float32Array | null;
  activity: QuartzActivity | null;
}

function hash(seed: number, index: number) {
  return seededRandom(seed * 7919 + index * 104729)();
}

/** 平滑噪声（若干随机方向正弦叠加），用于应变场。 */
function smoothField(seed: number, terms: number, frequency: number) {
  const random = seededRandom(seed);
  const waves = Array.from({ length: terms }, () => ({ dir: random() * Math.PI * 2, freq: frequency * (0.6 + random() * 0.9), phase: random() * Math.PI * 2 }));
  return (x: number, y: number) => waves.reduce((sum, w) => sum + Math.sin((x * Math.cos(w.dir) + y * Math.sin(w.dir)) * w.freq + w.phase), 0) / terms;
}

interface Silhouette { inside: (x: number, y: number) => boolean; shade: (x: number, y: number) => number; facet: (x: number, y: number) => number }

function silhouette(shape: PolariscopeSampleProfile['shape'], radius: number, seed: number): Silhouette {
  if (shape === 'faceted') {
    // 圆明亮琢型俯视：台面八边形、星刻面/风筝面、上腰小面三圈。
    const table = radius * 0.53, star = radius * 0.74;
    return {
      inside: (x, y) => Math.hypot(x, y) <= radius,
      facet: (x, y) => {
        const r = Math.hypot(x, y), a = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
        const octagon = table / Math.cos(((a % (Math.PI / 4)) - Math.PI / 8));
        if (r < octagon) return Math.floor(a / (Math.PI / 8)); // 透过台面看到的亭部主刻面
        if (r < star) return 16 + Math.floor(a / (Math.PI / 8));
        return 32 + Math.floor(a / (Math.PI / 16));
      },
      shade: (x, y) => {
        const r = Math.hypot(x, y), a = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
        const octagon = table / Math.cos(((a % (Math.PI / 4)) - Math.PI / 8));
        const sectorEdge = (step: number) => { const t = (a / step) % 1; return Math.min(t, 1 - t) * r * step; };
        let edge = Math.min(Math.abs(r - octagon), Math.abs(r - star), radius - r);
        edge = Math.min(edge, r < octagon ? sectorEdge(Math.PI / 4) : r < star ? sectorEdge(Math.PI / 8) : sectorEdge(Math.PI / 16));
        const line = edge < radius * 0.012 ? 0.55 : 1;
        return line * (r > radius * 0.97 ? 0.6 : 1);
      },
    };
  }
  if (shape === 'cabochon') {
    const rx = radius, ry = radius * 0.8;
    return {
      inside: (x, y) => (x / rx) ** 2 + (y / ry) ** 2 <= 1,
      facet: () => 0,
      shade: (x, y) => { const d = (x / rx) ** 2 + (y / ry) ** 2; return 0.72 + 0.28 * Math.sqrt(Math.max(0, 1 - d)) - (d > 0.92 ? 0.25 : 0); },
    };
  }
  // 雕件/异形：带起伏的圆角轮廓。
  const wobble = smoothField(seed + 3, 4, 3);
  return {
    inside: (x, y) => { const a = Math.atan2(y, x), r = Math.hypot(x, y); return r <= radius * (0.86 + 0.12 * wobble(Math.cos(a), Math.sin(a))); },
    facet: () => 0,
    shade: (x, y) => { const a = Math.atan2(y, x), r = Math.hypot(x, y), edge = radius * (0.86 + 0.12 * wobble(Math.cos(a), Math.sin(a))); return 0.78 + 0.22 * (1 - r / edge) - (edge - r < radius * 0.05 ? 0.22 : 0); },
  };
}

/** 集合体晶粒尺度（视场单位）与纤维拉长比：翡翠粒状、软玉纤维、玉髓类隐晶质。 */
const GRAIN: Record<string, { size: number; stretch: number }> = {
  jadeite: { size: 0.075, stretch: 1 }, nephrite: { size: 0.05, stretch: 4 }, 'nephrite-jasper': { size: 0.05, stretch: 4 },
  marble: { size: 0.11, stretch: 1 }, serpentine: { size: 0.035, stretch: 2 }, agate: { size: 0.022, stretch: 1 },
  chalcedony: { size: 0.022, stretch: 1 }, 'jinsi-jade': { size: 0.022, stretch: 1 }, prehnite: { size: 0.045, stretch: 3 },
};

export function buildSampleFieldMap(profile: PolariscopeSampleProfile, settings: SampleViewSettings, size: number): SampleFieldMap {
  let seed = 11;
  for (const ch of profile.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const radius = 0.56;
  const shape = silhouette(profile.shape, radius, seed);
  const n = size, half = (n - 1) / 2;
  const map: SampleFieldMap = {
    size: n, inside: new Uint8Array(n * n), psi: new Float32Array(n * n), gamma: new Float32Array(n * n),
    depolarization: new Float32Array(n * n), shade: new Float32Array(n * n), bodyColor: profile.bodyColor,
    opaque: profile.observation === 'opaque', radius, rotaryPath: null, activity: null,
  };
  // 非均质单晶：与锥光干涉图用同一个晶体模型，取竖直传播方向的有效双折射与振动方向。
  const crystal = sampleCrystal(profile, settings.orientation, settings.brazilTwin);
  const vertical = crystal ? propagationOptics(crystal, [0, 0, 1]) : null;
  if (crystal?.kind === 'uniaxial' && crystal.opticalActivity) { map.activity = crystal.opticalActivity; map.rotaryPath = new Float32Array(n * n); }
  const random = seededRandom(seed);
  const thicknessMm = settings.thicknessMm ?? 2.5, thicknessNm = thicknessMm * 1e6;
  const grain = GRAIN[profile.id] ?? { size: 0.06, stretch: 1 };
  const seeds = profile.observation === 'aggregate'
    ? Array.from({ length: Math.ceil((2 * radius / grain.size) ** 2 * 1.3) }, () => ({ x: (random() * 2 - 1) * radius * 1.1, y: (random() * 2 - 1) * radius * 1.1, psi: random() * Math.PI, mottle: random() }))
    : [];
  const strainPsi = smoothField(seed + 1, 5, 9), strainGamma = smoothField(seed + 2, 6, 7);
  for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
    const x = (px - half) / half, y = (half - py) / half, i = py * n + px;
    if (!shape.inside(x, y)) continue;
    map.inside[i] = 1;
    map.shade[i] = shape.shade(x, y);
    map.depolarization[i] = profile.depolarization;
    switch (profile.observation) {
      case 'anisotropic': {
        // 同一单晶：消光方向一致；各刻面路径长度不同，因此光程差（及水晶的旋光量）不同。
        const facet = shape.facet(x, y), path = 0.6 + 0.8 * hash(seed, facet);
        map.psi[i] = vertical!.psi;
        map.gamma[i] = vertical!.deltaN * thicknessNm * path;
        if (map.rotaryPath) map.rotaryPath[i] = thicknessMm * path * vertical!.axisCosine * vertical!.axisCosine;
        break;
      }
      case 'aggregate': {
        let best = Infinity, chosen = seeds[0];
        for (const s of seeds) { const dx = (x - s.x) / grain.stretch, dy = y - s.y, d = dx * dx + dy * dy; if (d < best) { best = d; chosen = s; } }
        // 光穿过数毫米集合体要经过大量取向各异的晶粒：整体近于退偏、高级白，
        // 只留下晶粒尺度的明暗起伏，且总体亮度不随物台转动改变。
        map.psi[i] = chosen.psi; map.gamma[i] = 25000;
        map.depolarization[i] = Math.max(0.72, profile.depolarization);
        map.shade[i] *= 0.82 + 0.18 * chosen.mottle;
        break;
      }
      case 'isotropic': {
        // 应变：低阶、方位随位置平滑变化的延迟（异常双折射的蛇形/斑块状明暗）。
        map.psi[i] = (strainPsi(x, y) * 0.5 + 0.5) * Math.PI;
        map.gamma[i] = settings.strain * Math.max(0, 0.15 + 0.85 * Math.abs(strainGamma(x, y))) * 420;
        break;
      }
      default: break;
    }
  }
  return map;
}

/**
 * 样品某像素的透射色（线性 sRGB，未乘体色）。水晶按线性 + 圆延迟（旋光）合成，
 * 同一刻面的结果相同，按光程差缓存，避免逐像素重复的光谱积分。
 */
function samplePixelRgb(map: SampleFieldMap, i: number, stage: number, analyzer: number, rgb: Rgb, cache: Map<number, Rgb>): Rgb {
  if (map.activity && map.rotaryPath) {
    const key = map.gamma[i] * 1e3 + map.rotaryPath[i];
    let hit = cache.get(key);
    if (!hit) { hit = quartzRgb(map.activity, map.psi[i] + stage, map.gamma[i], map.rotaryPath[i], 1, analyzer); cache.set(key, hit); }
    rgb[0] = hit[0]; rgb[1] = hit[1]; rgb[2] = hit[2];
    return rgb;
  }
  return linearRetarderRgb(map.psi[i] + stage, map.gamma[i], analyzer, 0, rgb);
}

export interface EyepieceRenderOptions {
  stageDeg: number;
  analyzerDeg: number;
  /** 电源与装配允许观察。 */
  active: boolean;
  /** 白光光源色（线性 sRGB），默认中性略暖。 */
  lamp?: Rgb;
  /** 视场背景透过率覆盖（理想半波片等均匀视场）；默认按马吕斯定律 cos²A。 */
  backgroundTransmission?: number;
  /**
   * 显示曝光：人眼在暗视场中会适应，正交下的明亮位置看起来远比 50% 亮。
   * 只影响显示，不影响 meanSampleLuminance 等定量结果。
   */
  exposure?: number;
}

const DEFAULT_LAMP: Rgb = [1, 0.97, 0.9];

/**
 * 渲染正光视场为 RGBA（sRGB 8 位），size 与 map.size 相同；map 为 null 时为空载视场。
 * 样品随物台旋转：像点 (x,y) 对应样品自身坐标 R(−stage)·(x,y)。
 */
export function renderEyepieceField(map: SampleFieldMap | null, size: number, options: EyepieceRenderOptions, out?: Uint8ClampedArray<ArrayBuffer>): Uint8ClampedArray<ArrayBuffer> {
  const n = size, half = (n - 1) / 2, pixels: Uint8ClampedArray<ArrayBuffer> = out ?? new Uint8ClampedArray(n * n * 4);
  const exposure = options.exposure ?? 1.7;
  const lampBase = options.lamp ?? DEFAULT_LAMP, lamp: Rgb = [lampBase[0] * exposure, lampBase[1] * exposure, lampBase[2] * exposure];
  const analyzer = options.analyzerDeg * DEG, stage = options.stageDeg * DEG;
  const background = options.active ? options.backgroundTransmission ?? emptyFieldTransmission(options.analyzerDeg) : 0;
  const cos = Math.cos(-stage), sin = Math.sin(-stage);
  const rgb: Rgb = [0, 0, 0], cache = new Map<number, Rgb>();
  for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
    const x = (px - half) / half, y = (half - py) / half, r = Math.hypot(x, y), o = (py * n + px) * 4;
    if (r > 1) { pixels[o + 3] = 0; continue; }
    const vignette = r > 0.86 ? Math.max(0, 1 - (r - 0.86) / 0.14 * 0.55) : 1;
    let cr = background, cg = background, cb = background;
    if (map) {
      const lx = cos * x - sin * y, ly = sin * x + cos * y;
      const mx = Math.round(lx * half + half), my = Math.round(half - ly * half);
      const i = my * n + mx;
      if (mx >= 0 && my >= 0 && mx < n && my < n && map.inside[i]) {
        const shade = map.shade[i];
        if (map.opaque) {
          // 不透明：没有透射光，只剩环境中微弱的表面反光。
          const surface = options.active ? 0.05 * shade : 0.01;
          cr = surface * map.bodyColor[0]; cg = surface * map.bodyColor[1]; cb = surface * map.bodyColor[2];
        } else if (options.active) {
          samplePixelRgb(map, i, stage, analyzer, rgb, cache);
          const d = map.depolarization[i];
          cr = ((1 - d) * rgb[0] + d * 0.5) * map.bodyColor[0] * shade;
          cg = ((1 - d) * rgb[1] + d * 0.5) * map.bodyColor[1] * shade;
          cb = ((1 - d) * rgb[2] + d * 0.5) * map.bodyColor[2] * shade;
        } else { cr = 0; cg = 0; cb = 0; }
      }
    }
    pixels[o] = linearToSrgb8(cr * lamp[0] * vignette);
    pixels[o + 1] = linearToSrgb8(cg * lamp[1] * vignette);
    pixels[o + 2] = linearToSrgb8(cb * lamp[2] * vignette);
    pixels[o + 3] = 255;
  }
  return pixels;
}

/**
 * 样品区域的平均亮度（线性 Y，以下片后光强为 1），用于明暗曲线与判定。
 * 与旋转后的像素映射无关：直接在样品自身坐标上统计（stride 抽样）。
 */
export function meanSampleLuminance(map: SampleFieldMap, stageDeg: number, analyzerDeg: number, stride = 3, polarizedOnly = false): number {
  if (map.opaque) return 0;
  const analyzer = analyzerDeg * DEG, stage = stageDeg * DEG, rgb: Rgb = [0, 0, 0], cache = new Map<number, Rgb>();
  let sum = 0, count = 0;
  for (let i = 0; i < map.inside.length; i += stride) {
    if (!map.inside[i]) continue;
    samplePixelRgb(map, i, stage, analyzer, rgb, cache);
    // polarizedOnly：扣除散射退偏造成的恒定亮度，只留下随偏振变化的部分（用于判定）。
    const d = polarizedOnly ? 0 : map.depolarization[i];
    sum += luminance([(1 - d) * rgb[0] + d * 0.5, (1 - d) * rgb[1] + d * 0.5, (1 - d) * rgb[2] + d * 0.5]); count++;
  }
  return count ? sum / count : 0;
}

/** 一周的明暗曲线（未乘体色，便于不同颜色样品对比现象本身）。 */
export function rotationCurve(map: SampleFieldMap, analyzerDeg: number, steps = 72, polarizedOnly = false): number[] {
  return Array.from({ length: steps + 1 }, (_, k) => meanSampleLuminance(map, (k * 360) / steps, analyzerDeg, 5, polarizedOnly));
}

export type ParallelCheckVerdict = 'dark-no-check' | 'along-axis' | 'strain' | 'double-refraction';

export type SampleObservation =
  | 'all-dark' | 'four-bright-four-dark' | 'all-bright' | 'anomalous' | 'not-applicable'
  | 'axis-dark' | 'axis-rotation' | 'axis-twin-dark';

/** 判定只看随偏振变化的光：低于此值视为正交下没有亮位。 */
const POLARIZED_SIGNAL = 0.05;

/**
 * 观察结论：材料机理 + 本次画面所用的同一份光学图共同决定。
 * - 判定扣除散射退偏的恒定亮度（半透明样品的灰底不是双折射，也不是旋光）；
 * - 旋光只属于水晶；应变只属于设置了应变的均质体。
 */
export function judgeObservation(profile: PolariscopeSampleProfile, settings: SampleViewSettings, map: SampleFieldMap): SampleObservation {
  switch (profile.observation) {
    case 'opaque': return 'not-applicable';
    case 'aggregate': return 'all-bright';
    case 'isotropic': return settings.strain > 0.05 ? 'anomalous' : 'all-dark';
    default: break;
  }
  const curve = rotationCurve(map, 90, 36, true);
  const max = Math.max(...curve), range = max - Math.min(...curve);
  if (range > 0.08) return 'four-bright-four-dark';
  if (profile.quartz && max > POLARIZED_SIGNAL) return 'axis-rotation';
  return profile.quartz && settings.brazilTwin ? 'axis-twin-dark' : 'axis-dark';
}

export interface ParallelCheckResult {
  verdict: ParallelCheckVerdict;
  /** 最亮位置的物台角。 */
  stageDeg: number;
  /** 画面上看到的亮度（含散射），正交最亮位与平行。 */
  crossed: number;
  parallel: number;
  /** 其中与偏振无关的散射底值。 */
  scatter: number;
}

/**
 * GIA 平行复核：先把样品转到正交下最亮的位置，再把检偏器转到平行。
 * 明显变亮 → 应变造成的异常双折射；不变或变暗 → 真正的双折射。
 * 判断依据只取随偏振变化的部分；正交下没有这样的亮位（均质体、沿光轴、只有散射灰底）时，复核不适用。
 */
export function parallelCheck(profile: PolariscopeSampleProfile, settings: SampleViewSettings, map: SampleFieldMap): ParallelCheckResult {
  let best = -1, stageDeg = 0;
  for (let a = 0; a < 90; a++) { const v = meanSampleLuminance(map, a, 90, 4, true); if (v > best) { best = v; stageDeg = a; } }
  const crossed = meanSampleLuminance(map, stageDeg, 90, 4), parallel = meanSampleLuminance(map, stageDeg, 0, 4);
  const scatter = Math.max(0, crossed - best);
  let verdict: ParallelCheckVerdict;
  if (profile.observation === 'anisotropic' && settings.orientation === 'optic-axis') verdict = 'along-axis';
  else if (best < POLARIZED_SIGNAL) verdict = 'dark-no-check';
  else {
    const parallelPolarized = meanSampleLuminance(map, stageDeg, 0, 4, true);
    const brightens = parallelPolarized > best * 1.6;
    // 机理约束：只有设置了应变的均质体才可能是 ADR。
    verdict = brightens && profile.observation === 'isotropic' && settings.strain > 0.05 ? 'strain' : 'double-refraction';
  }
  return { verdict, stageDeg, crossed, parallel, scatter };
}
