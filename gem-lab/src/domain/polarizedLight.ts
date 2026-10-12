/**
 * 偏振光教学物理核心（纯函数，无 DOM 依赖，可单测）。
 *
 * 统一服务两类视场：
 * - 正光（orthoscopic）：偏光镜目镜中看到的样品明暗；
 * - 锥光（conoscopic）：加干涉球后看到的干涉图。
 *
 * 模型与约定
 * - 下偏光片（起偏器）透振方向固定为 0°，检偏器角度 A 相对它计。
 * - 光强以「经过下偏光片后的光强」为 1。
 * - 线性延迟片（振动方向 ψ、光程差 Γ）在任意检偏角下：
 *     I(λ) = cos²A − sin2ψ · sin2(ψ−A) · sin²(πΓ/λ)
 *   正交（A=90°）时化为 sin²2ψ · sin²(πΓ/λ)。
 * - 干涉色：在 400–700 nm 对光源光谱 × CIE 1931 配色函数积分，转 sRGB。
 *   配色函数用 Wyman–Sloan–Shirley (2013) 多段高斯解析近似。
 * - 一轴晶：Δn(θ) ≈ (nₑ−nₒ)·sin²θ（θ 为传播方向与光轴夹角），
 *   e 光振动方向为光轴在波面上的投影。
 * - 二轴晶：Δn ≈ (nγ−nα)·sinθ₁·sinθ₂；振动方向按 Biot–Fresnel 规则，
 *   平分「传播方向与两光轴所成平面」在波面上的迹线。
 * - 水晶旋光：线性延迟与圆延迟合成为椭圆延迟器（Jones 计算），
 *   旋光率按 Drude 式 ρ(λ) = 7.27 / (λ² − 0.0127) °/mm（λ 以 µm 计）。
 *
 * 教学边界：理想平行板、单一厚度、忽略吸收色散与双折射色散、忽略刻面折射与全反射。
 * 用于建立现象与原理的对应，不作为任何具体样品的鉴定依据。
 */

const DEG = Math.PI / 180;

// ─── 光谱与颜色 ─────────────────────────────────────────────

export const WAVELENGTHS_NM: readonly number[] = Array.from({ length: 31 }, (_, i) => 400 + i * 10);

function lobe(l: number, mu: number, s1: number, s2: number) {
  const t = (l - mu) / (l < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}

/** CIE 1931 2° 配色函数的解析近似（Wyman, Sloan & Shirley 2013, JCGT 2(2)）。 */
export function cieXyz(lambdaNm: number): [number, number, number] {
  const l = lambdaNm;
  const x = 1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2);
  const y = 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
  const z = 1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8);
  return [x, y, z];
}

/** 普朗克黑体相对辐射（用作光源光谱的形状，6500 K 近似日光白）。 */
function planck(lambdaNm: number, kelvin: number) {
  const l = lambdaNm * 1e-9;
  return 1 / (l ** 5 * (Math.exp(1.4388e-2 / (l * kelvin)) - 1));
}

function xyzToLinearSrgb(x: number, y: number, z: number): [number, number, number] {
  return [
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.204 * y + 1.057 * z,
  ];
}

/**
 * 每个波长对线性 sRGB 三通道的权重，已按白光归一化：
 * Σ 权重 = (1,1,1)，即空载平行偏光的视场为中性白。
 */
export const SPECTRAL_RGB_WEIGHTS: readonly (readonly [number, number, number])[] = (() => {
  const raw = WAVELENGTHS_NM.map((l) => {
    const [x, y, z] = cieXyz(l);
    const p = planck(l, 6500);
    return xyzToLinearSrgb(x * p, y * p, z * p);
  });
  const sum = raw.reduce((acc, w) => [acc[0] + w[0], acc[1] + w[1], acc[2] + w[2]], [0, 0, 0]);
  return raw.map((w) => [w[0] / sum[0], w[1] / sum[1], w[2] / sum[2]] as const);
})();

export type Rgb = [number, number, number];

export function linearToSrgb8(value: number): number {
  const v = value <= 0 ? 0 : value >= 1 ? 1 : value;
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

/** 对任意 I(λ) 积分得线性 sRGB（白光归一）。 */
export function integrateSpectrum(intensityAt: (lambdaNm: number, index: number) => number): Rgb {
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < WAVELENGTHS_NM.length; i++) {
    const v = intensityAt(WAVELENGTHS_NM[i], i);
    const w = SPECTRAL_RGB_WEIGHTS[i];
    r += v * w[0]; g += v * w[1]; b += v * w[2];
  }
  return [r, g, b];
}

// ─── 光程差 → 干涉色查找表（含抗锯齿区间平均） ──────────────

const LUT_STEP_NM = 4;
/** 超过约 35 级后各波长 sin² 已充分混合，按高级白处理。 */
const LUT_MAX_NM = 20000;
const LUT_SIZE = LUT_MAX_NM / LUT_STEP_NM + 1;

/** 查找表用 1 nm 光谱采样（高阶色环的 sin² 随波长变化很快，10 nm 采样会混叠出假色）。 */
const FINE_SPECTRUM: { lambda: number; weight: [number, number, number] }[] = (() => {
  const raw = Array.from({ length: 301 }, (_, i) => {
    const lambda = 400 + i, [x, y, z] = cieXyz(lambda), p = planck(lambda, 6500);
    return { lambda, weight: xyzToLinearSrgb(x * p, y * p, z * p) };
  });
  const sum = raw.reduce((acc, w) => [acc[0] + w.weight[0], acc[1] + w.weight[1], acc[2] + w.weight[2]], [0, 0, 0]);
  return raw.map((w) => ({ lambda: w.lambda, weight: [w.weight[0] / sum[0], w.weight[1] / sum[1], w.weight[2] / sum[2]] }));
})();

/**
 * prefix[i] = Σ_{j<i} C(jΔ)·Δ，C(Γ) = Σ_λ w(λ)·sin²(πΓ/λ)。
 * 用前缀和可在 O(1) 内求任一光程差区间上的平均颜色，避免高阶色环在像素尺度上混叠。
 */
const RETARDATION_PREFIX: Float64Array = (() => {
  const prefix = new Float64Array((LUT_SIZE + 1) * 3);
  for (let i = 0; i < LUT_SIZE; i++) {
    const gamma = i * LUT_STEP_NM;
    let r = 0, g = 0, b = 0;
    for (const { lambda, weight } of FINE_SPECTRUM) { const v = Math.sin(Math.PI * gamma / lambda) ** 2; r += v * weight[0]; g += v * weight[1]; b += v * weight[2]; }
    prefix[(i + 1) * 3] = prefix[i * 3] + r; prefix[(i + 1) * 3 + 1] = prefix[i * 3 + 1] + g; prefix[(i + 1) * 3 + 2] = prefix[i * 3 + 2] + b;
  }
  return prefix;
})();

function prefixAt(position: number, channel: number) {
  const p = Math.max(0, Math.min(LUT_SIZE, position));
  const i = Math.floor(p), f = p - i;
  const a = RETARDATION_PREFIX[i * 3 + channel];
  const b = RETARDATION_PREFIX[Math.min(LUT_SIZE, i + 1) * 3 + channel];
  return a + (b - a) * f;
}

/**
 * C(Γ)：正交偏光、45° 位时的干涉色（线性 sRGB，白光归一）。
 * width > 0 时返回 [Γ−w/2, Γ+w/2] 上的平均值（像素足迹抗锯齿）。
 */
export function retardationColor(gammaNm: number, widthNm = 0, out: Rgb = [0, 0, 0]): Rgb {
  const gamma = Math.max(0, gammaNm);
  const w = Math.max(LUT_STEP_NM, widthNm);
  // 高阶：各波长 sin² 充分混合，趋于「高级白」——每通道恰为 0.5（白光归一）。
  if (gamma + w / 2 >= LUT_MAX_NM || w >= LUT_MAX_NM / 4) { out[0] = 0.5; out[1] = 0.5; out[2] = 0.5; return out; }
  const lo = Math.max(0, gamma - w / 2) / LUT_STEP_NM, hi = (gamma + w / 2) / LUT_STEP_NM;
  const span = hi - lo;
  for (let k = 0; k < 3; k++) out[k] = (prefixAt(hi, k) - prefixAt(lo, k)) / span;
  return out;
}

/** 线性延迟片在偏光镜中的透射色（任意检偏角）。 */
export function linearRetarderRgb(psiRad: number, gammaNm: number, analyzerRad: number, widthNm = 0, out: Rgb = [0, 0, 0]): Rgb {
  const cosA = Math.cos(analyzerRad), base = cosA * cosA;
  const factor = Math.sin(2 * psiRad) * Math.sin(2 * (psiRad - analyzerRad));
  retardationColor(gammaNm, widthNm, out);
  for (let k = 0; k < 3; k++) out[k] = base - factor * out[k];
  return out;
}

// ─── 椭圆延迟器（水晶旋光）与多层 Jones 叠加 ────────────────

/** 石英旋光率（°/mm），Drude 单项式拟合 404–656 nm 实测值。 */
export function quartzRotatoryPower(lambdaNm: number): number {
  const l = lambdaNm / 1000;
  return 7.27 / (l * l - 0.0127);
}

/** 一层椭圆延迟：线性延迟 δL（慢/快振动方向 ψ）+ 圆延迟 δC（= 2 × 旋转角；正值使偏振面在像面内由 x 转向 y，即逆时针）。 */
export interface RetarderLayer { psi: number; deltaLinear: number; deltaCircular: number }

/**
 * 多层椭圆延迟器依次作用于 0° 线偏振光，经检偏器 A 后的透射率。
 * 每层 Jones 矩阵 J = cos(Δ/2)·I − i·sin(Δ/2)·(a·σψ + b·σc)，
 * Δ = √(δL² + δC²)，a = δL/Δ，b = δC/Δ；σψ 为 ψ 方向线性分量，σc 为圆分量。
 * 单层时化为 I = (cos(Δ/2)cosA + sin(Δ/2)·b·sinA)² + sin²(Δ/2)·a²·cos²(2ψ−A)。
 */
export function retarderStackTransmission(layers: readonly RetarderLayer[], analyzerRad: number): number {
  // E = (xr + i·xi, yr + i·yi)，初始为 0° 线偏振。
  let xr = 1, xi = 0, yr = 0, yi = 0;
  for (const layer of layers) {
    const total = Math.hypot(layer.deltaLinear, layer.deltaCircular);
    if (total < 1e-12) continue;
    const a = layer.deltaLinear / total, b = layer.deltaCircular / total;
    const c = Math.cos(total / 2), s = Math.sin(total / 2);
    const c2 = Math.cos(2 * layer.psi), s2 = Math.sin(2 * layer.psi);
    // J = [[c − i·s·a·c2, −s·b − i·s·a·s2], [s·b − i·s·a·s2, c + i·s·a·c2]]
    const m00r = c, m00i = -s * a * c2, m01r = -s * b, m01i = -s * a * s2;
    const m10r = s * b, m10i = -s * a * s2, m11r = c, m11i = s * a * c2;
    const nxr = m00r * xr - m00i * xi + m01r * yr - m01i * yi;
    const nxi = m00r * xi + m00i * xr + m01r * yi + m01i * yr;
    const nyr = m10r * xr - m10i * xi + m11r * yr - m11i * yi;
    const nyi = m10r * xi + m10i * xr + m11r * yi + m11i * yr;
    xr = nxr; xi = nxi; yr = nyr; yi = nyi;
  }
  const cosA = Math.cos(analyzerRad), sinA = Math.sin(analyzerRad);
  const ar = cosA * xr + sinA * yr, ai = cosA * xi + sinA * yi;
  return ar * ar + ai * ai;
}

/** 单层椭圆延迟器（见 retarderStackTransmission）。 */
export function ellipticalRetarderTransmission(psiRad: number, deltaLinear: number, deltaCircular: number, analyzerRad: number): number {
  return retarderStackTransmission([{ psi: psiRad, deltaLinear, deltaCircular }], analyzerRad);
}

/** 各采样波长的「2 × 旋光率」（弧度/mm），避免逐像素重复计算。 */
const QUARTZ_CIRCULAR_PER_MM = WAVELENGTHS_NM.map((l) => 2 * quartzRotatoryPower(l) * DEG);
const twinLayers: RetarderLayer[] = [{ psi: 0, deltaLinear: 0, deltaCircular: 0 }, { psi: 0, deltaLinear: 0, deltaCircular: 0 }];

/**
 * 水晶某传播方向的透射色（线性 sRGB，白光归一）：
 * - 'quartz'：单一旋向，用单层闭式解；
 * - 'quartz-brazil-twin'：左右旋两层（右旋占 rightFraction），示意巴西律双晶中旋光互相抵消。
 * 线性延迟按层厚分配；旋光随与光轴夹角按 cos² 衰减（教学近似）。
 */
export function quartzRgb(activity: QuartzActivity, psi: number, gammaNm: number, pathMm: number, axisCosine: number, analyzerRad: number, rightFraction = 0.5, out: Rgb = [0, 0, 0]): Rgb {
  const circularScale = pathMm * axisCosine * axisCosine;
  const cosA = Math.cos(analyzerRad), sinA = Math.sin(analyzerRad), cross = Math.cos(2 * psi - analyzerRad);
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < WAVELENGTHS_NM.length; i++) {
    const dl = 2 * Math.PI * gammaNm / WAVELENGTHS_NM[i], dc = QUARTZ_CIRCULAR_PER_MM[i] * circularScale;
    let value: number;
    if (activity === 'quartz') {
      const total = Math.hypot(dl, dc);
      if (total < 1e-12) value = cosA * cosA;
      else {
        const c = Math.cos(total / 2), sn = Math.sin(total / 2), re = c * cosA + sn * (dc / total) * sinA, im = sn * (dl / total) * cross;
        value = re * re + im * im;
      }
    } else {
      const f = rightFraction;
      twinLayers[0].psi = psi; twinLayers[0].deltaLinear = dl * f; twinLayers[0].deltaCircular = dc * f;
      twinLayers[1].psi = psi; twinLayers[1].deltaLinear = dl * (1 - f); twinLayers[1].deltaCircular = -dc * (1 - f);
      value = retarderStackTransmission(twinLayers, analyzerRad);
    }
    const w = SPECTRAL_RGB_WEIGHTS[i];
    r += value * w[0]; g += value * w[1]; b += value * w[2];
  }
  out[0] = r; out[1] = g; out[2] = b;
  return out;
}

export type QuartzActivity = 'quartz' | 'quartz-brazil-twin';

// ─── 晶体几何 ──────────────────────────────────────────────

export type Vec3 = [number, number, number];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (a: Vec3): Vec3 => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
/** 绕竖直光轴（z）旋转，对应转动物台。 */
export function rotateZ(v: Vec3, rad: number): Vec3 {
  const c = Math.cos(rad), s = Math.sin(rad);
  return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
}
/** 由极角（自竖直方向倾斜）与方位角给出单位向量。 */
export function directionFromTilt(tiltDeg: number, azimuthDeg: number): Vec3 {
  const t = tiltDeg * DEG, a = azimuthDeg * DEG;
  return [Math.sin(t) * Math.cos(a), Math.sin(t) * Math.sin(a), Math.cos(t)];
}

/** 把向量 v 投影到与 k 垂直的波面上，返回该投影在像面（x,y）内的方位角。 */
function traceAzimuth(v: Vec3, k: Vec3): { angle: number; length: number } {
  const d = dot(v, k);
  const px = v[0] - d * k[0], py = v[1] - d * k[1];
  return { angle: Math.atan2(py, px), length: Math.hypot(px, py) };
}

export type CrystalOptics =
  | { kind: 'isotropic' }
  | { kind: 'uniaxial'; birefringence: number; axis: Vec3; opticalActivity?: QuartzActivity; twinRightFraction?: number }
  | { kind: 'biaxial'; birefringence: number; axes: [Vec3, Vec3] };

/**
 * 给定传播方向 k（实验室坐标，单位向量），求有效双折射率与快/慢光振动方向方位角。
 * axisCosine：k 与（一轴晶）光轴夹角的余弦，供旋光计算。
 */
export function propagationOptics(crystal: CrystalOptics, k: Vec3): { deltaN: number; psi: number; axisCosine: number } {
  if (crystal.kind === 'isotropic') return { deltaN: 0, psi: 0, axisCosine: 1 };
  if (crystal.kind === 'uniaxial') {
    const c = dot(k, crystal.axis);
    const trace = traceAzimuth(crystal.axis, k);
    return { deltaN: crystal.birefringence * (1 - c * c), psi: trace.length > 1e-9 ? trace.angle : 0, axisCosine: c };
  }
  const [a1, a2] = crystal.axes;
  const c1 = dot(k, a1), c2 = dot(k, a2);
  const sin1 = Math.sqrt(Math.max(0, 1 - c1 * c1)), sin2 = Math.sqrt(Math.max(0, 1 - c2 * c2));
  const t1 = traceAzimuth(a1, k), t2 = traceAzimuth(a2, k);
  // Biot–Fresnel：两条迹线的角平分线即振动方向（取任一条，透射式对 90° 互换不变）。
  const u1x = Math.cos(t1.angle), u1y = Math.sin(t1.angle), u2x = Math.cos(t2.angle), u2y = Math.sin(t2.angle);
  const sx = u1x + u2x, sy = u1y + u2y, dx = u1x - u2x, dy = u1y - u2y;
  const psi = sx * sx + sy * sy >= dx * dx + dy * dy ? Math.atan2(sy, sx) : Math.atan2(dy, dx);
  return { deltaN: crystal.birefringence * sin1 * sin2, psi, axisCosine: 1 };
}

/** 二轴晶：锐角等分线沿 bisectrix，光轴面方位为 planeAzimuthDeg，光轴半角 V。 */
export function biaxialAxes(halfAngleDeg: number, bisectrix: Vec3 = [0, 0, 1], planeAzimuthDeg = 0): [Vec3, Vec3] {
  const v = halfAngleDeg * DEG, a = planeAzimuthDeg * DEG;
  const local1: Vec3 = [Math.sin(v) * Math.cos(a), Math.sin(v) * Math.sin(a), Math.cos(v)];
  const local2: Vec3 = [-Math.sin(v) * Math.cos(a), -Math.sin(v) * Math.sin(a), Math.cos(v)];
  return [alignZTo(local1, bisectrix), alignZTo(local2, bisectrix)];
}

/** 把以 z 为参考的向量旋转到以 target 为参考（绕 z×target 轴的最短旋转）。 */
function alignZTo(v: Vec3, target: Vec3): Vec3 {
  const t = normalize(target);
  const cos = t[2];
  if (cos > 1 - 1e-12) return v;
  if (cos < -1 + 1e-12) return [v[0], -v[1], -v[2]];
  const axis = normalize([-t[1], t[0], 0]);
  const sin = Math.sqrt(1 - cos * cos);
  const d = dot(axis, v);
  const cross: Vec3 = [axis[1] * v[2] - axis[2] * v[1], axis[2] * v[0] - axis[0] * v[2], axis[0] * v[1] - axis[1] * v[0]];
  return [
    v[0] * cos + cross[0] * sin + axis[0] * d * (1 - cos),
    v[1] * cos + cross[1] * sin + axis[1] * d * (1 - cos),
    v[2] * cos + cross[2] * sin + axis[2] * d * (1 - cos),
  ];
}

/** 落在锥光视场内的光轴出露点数目（光轴方向与竖直夹角的正弦小于视场 sinθ 上限）。 */
export function visibleOpticAxes(crystal: CrystalOptics, sinThetaMax: number): number {
  if (crystal.kind === 'isotropic') return 0;
  const axes = crystal.kind === 'uniaxial' ? [crystal.axis] : crystal.axes;
  return axes.filter((a) => Math.sqrt(Math.max(0, 1 - a[2] * a[2])) < sinThetaMax).length;
}

export function rotateCrystal(crystal: CrystalOptics, stageRad: number): CrystalOptics {
  if (crystal.kind === 'isotropic') return crystal;
  if (crystal.kind === 'uniaxial') return { ...crystal, axis: rotateZ(crystal.axis, stageRad) };
  return { ...crystal, axes: [rotateZ(crystal.axes[0], stageRad), rotateZ(crystal.axes[1], stageRad)] };
}

// ─── 锥光干涉图 ────────────────────────────────────────────

export interface ConoscopeOptions {
  /** 物台角度（度）。 */
  stageDeg: number;
  /** 检偏器角度（度），90 = 正交。 */
  analyzerDeg: number;
  /** 样品厚度（mm）。 */
  thicknessMm: number;
  /** 视场边缘对应的晶体内传播方向 sinθ（干涉球的有效数值孔径 / 折射率）。 */
  sinThetaMax?: number;
  /** 输出分辨率（像素边长）。 */
  resolution: number;
  /** 体色透过率（线性 sRGB），浓色样品的干涉图更难看清。 */
  tint?: Rgb;
  /** 整体亮度系数（关灯为 0）。 */
  exposure?: number;
}

/**
 * 逐像素计算锥光干涉图，返回 RGBA（sRGB 8 位）。视场外透明。
 * 像面坐标：x 向右、y 向上；像点半径 r 与传播方向满足 sinθ = r · sinThetaMax（正弦条件）。
 */
export function renderConoscopicFigure(crystal: CrystalOptics, options: ConoscopeOptions): Uint8ClampedArray<ArrayBuffer> {
  const { resolution: n, thicknessMm } = options;
  const sinMax = options.sinThetaMax ?? 0.38;
  const analyzer = options.analyzerDeg * DEG;
  const tint = options.tint ?? [1, 1, 1], exposure = options.exposure ?? 1;
  const rotated = rotateCrystal(crystal, options.stageDeg * DEG);
  const pixels: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray(n * n * 4);
  const thicknessNm = thicknessMm * 1e6;
  const half = (n - 1) / 2;
  const gammaRow = new Float64Array(n * n), psiRow = new Float64Array(n * n), axisRow = new Float64Array(n * n);
  const inside = new Uint8Array(n * n);
  for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
    const x = (px - half) / half, y = (half - py) / half, r = Math.hypot(x, y);
    const index = py * n + px;
    if (r > 1) continue;
    inside[index] = 1;
    const sinT = r * sinMax, cosT = Math.sqrt(1 - sinT * sinT);
    const az = Math.atan2(y, x);
    const k: Vec3 = [sinT * Math.cos(az), sinT * Math.sin(az), cosT];
    const o = propagationOptics(rotated, k);
    gammaRow[index] = o.deltaN * thicknessNm / cosT;
    psiRow[index] = o.psi; axisRow[index] = o.axisCosine;
  }
  const rgb: Rgb = [0, 0, 0];
  const activity = rotated.kind === 'uniaxial' ? rotated.opticalActivity : undefined;
  const twinFraction = rotated.kind === 'uniaxial' ? rotated.twinRightFraction : undefined;
  for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
    const index = py * n + px, o4 = index * 4;
    if (!inside[index]) { pixels[o4 + 3] = 0; continue; }
    const g = gammaRow[index];
    // 相邻像素光程差之差作为像素足迹宽度，抑制高阶色环混叠。
    const gx = px + 1 < n && inside[index + 1] ? Math.abs(gammaRow[index + 1] - g) : px > 0 && inside[index - 1] ? Math.abs(g - gammaRow[index - 1]) : 0;
    const gy = py + 1 < n && inside[index + n] ? Math.abs(gammaRow[index + n] - g) : py > 0 && inside[index - n] ? Math.abs(g - gammaRow[index - n]) : 0;
    const width = Math.hypot(gx, gy);
    if (activity) {
      const cosAxis = axisRow[index];
      const pathMm = thicknessMm / Math.sqrt(1 - Math.min(0.999, (Math.hypot((px - half) / half, (half - py) / half) * sinMax) ** 2));
      quartzRgb(activity, psiRow[index], g, pathMm, cosAxis, analyzer, twinFraction, rgb);
    } else {
      linearRetarderRgb(psiRow[index], g, analyzer, width, rgb);
    }
    pixels[o4] = linearToSrgb8(rgb[0] * tint[0] * exposure); pixels[o4 + 1] = linearToSrgb8(rgb[1] * tint[1] * exposure); pixels[o4 + 2] = linearToSrgb8(rgb[2] * tint[2] * exposure); pixels[o4 + 3] = 255;
  }
  return pixels;
}

/** 单方向光强（线性亮度，Y 近似），用于测试与曲线。 */
export function conoscopicLuminanceAt(crystal: CrystalOptics, x: number, y: number, options: Omit<ConoscopeOptions, 'resolution'>): number {
  const sinMax = options.sinThetaMax ?? 0.38;
  const rotated = rotateCrystal(crystal, options.stageDeg * DEG);
  const sinT = Math.min(0.999, Math.hypot(x, y) * sinMax), cosT = Math.sqrt(1 - sinT * sinT), az = Math.atan2(y, x);
  const k: Vec3 = [sinT * Math.cos(az), sinT * Math.sin(az), cosT];
  const o = propagationOptics(rotated, k);
  const g = o.deltaN * options.thicknessMm * 1e6 / cosT;
  const analyzer = options.analyzerDeg * DEG;
  let rgb: Rgb;
  if (rotated.kind === 'uniaxial' && rotated.opticalActivity) {
    const pathMm = options.thicknessMm / cosT, activity = rotated.opticalActivity, fraction = rotated.twinRightFraction;
    rgb = quartzRgb(activity, o.psi, g, pathMm, o.axisCosine, analyzer, fraction);
  } else rgb = linearRetarderRgb(o.psi, g, analyzer);
  return luminance(rgb);
}

export function luminance(rgb: Rgb): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

// ─── 辅助 ──────────────────────────────────────────────────

/** 可复现的伪随机数（mulberry32）。 */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 空载视场亮度（线性），即马吕斯定律 cos²A。 */
export function emptyFieldTransmission(analyzerDeg: number) {
  const c = Math.cos(analyzerDeg * DEG);
  return c * c;
}
