import type { SampleDef } from '../data/types';
import {
  displaySpectrum,
  FOCUS_TOLERANCE,
  SLIT_OK,
  type Dispersion,
  type SpectrumConditions,
  type SpectrumDisplay,
} from './spectrumDisplay';

export type BenchMethod = 'transmission' | 'internal-reflection' | 'surface-reflection';

export interface BenchState {
  dispersion: Dispersion;
  power: boolean;
  brightness: number;
  /** 灯头横移范围 -1…1，乘 lateralScale 得到米。 */
  lampLateral: number;
  /** 透射：绕 Y 轴水平转角。反射：相对水平的向下俯角，绕 X 轴；单位度。 */
  lampAngle: number;
  samplePlaced: boolean;
  /** 样品台横移范围 -1…1，乘 sampleLateralScale 得到米。 */
  sampleOffset: number;
  sampleRotation: number;
  method: BenchMethod;
  slit: number;
  focus: number;
}

/**
 * 与 3D 场景共用的教学几何参数，单位 m。
 * 透射按水平转角求落点；反射按俯角求 z=0 截面的高度，灯与观察镜在台面上方分居两侧。
 * 接收范围及角度容差是交互教学参数，未经实物测定，不代表仪器性能指标。
 */
export const BENCH_GEOMETRY = {
  lampPivotZ: -0.09,
  sampleCenterY: 0.12,
  reflectionLampPivotY: 0.21,
  reflectionLampPivotZ: -0.09,
  scopeEntryDistance: 0.06,
  reflectionElevationDegrees: 45,
  lateralScale: 0.11,
  sampleLateralScale: 0.035,
  samplePlaneZ: 0,
  sampleCatchRadius: 0.026,
  clearRadius: 0.012,
} as const;

export const BENCH_METHOD_LABELS: Record<BenchMethod, string> = {
  transmission: '透射观察',
  'internal-reflection': '内反射观察',
  'surface-reflection': '表面反射观察',
};

export interface BenchSpecimenProfile {
  transmission: 'clear' | 'limited' | 'opaque';
  note: string;
}

/** 品种的宽泛透明度范围不是每颗样品的实测值；中间情况保留弱信号练习。 */
export function benchSpecimenProfile(sample: SampleDef): BenchSpecimenProfile {
  const transparency = sample.characteristics.transparency;
  if (transparency === '不透明') return {
    transmission: 'opaque',
    note: '本教学样品按不透明设置；透射时无法形成可用观察，不能据此记为吸收不特征。',
  };
  if (transparency === '透明') return {
    transmission: 'clear',
    note: '本教学样品采用可透光状态；亮度与方向的变化是观察条件示意，非实物测量。',
  };
  return {
    transmission: 'limited',
    note: `资料中的透明度为“${transparency}”；本例按有限透光状态演示。品种范围不能替代该颗样品的透光测试。`,
  };
}

export function createBenchState(dispersion: Dispersion = 'prism'): BenchState {
  return {
    dispersion,
    power: false,
    brightness: 0.82,
    lampLateral: 0,
    lampAngle: 0,
    samplePlaced: false,
    sampleOffset: 0,
    sampleRotation: 0,
    method: 'transmission',
    slit: 0.32,
    focus: 0.5,
  };
}

/** 纯方法状态更新；场景界面可同时应用 benchMethodSetup 作为布局起点。 */
export function setBenchMethod(state: BenchState, method: BenchMethod): BenchState {
  return { ...state, method };
}

/** 方法布局的示意起点；切换后仍由学员调整灯头和样品位置。 */
export function benchMethodSetup(method: BenchMethod): Pick<BenchState, 'lampLateral' | 'lampAngle'> {
  return { lampAngle: method === 'transmission' ? 0 : BENCH_GEOMETRY.reflectionElevationDegrees, lampLateral: 0 };
}

/** 反射灯头位于台面上方的 −Z 侧，以向下俯角照向样品；不是水平同侧照明。 */
export function benchLampPose(state: BenchState) {
  const reflected = state.method !== 'transmission';
  const angle = state.lampAngle * Math.PI / 180;
  const pivotY = reflected ? BENCH_GEOMETRY.reflectionLampPivotY : BENCH_GEOMETRY.sampleCenterY;
  const pivotZ = reflected ? BENCH_GEOMETRY.reflectionLampPivotZ : BENCH_GEOMETRY.lampPivotZ;
  return {
    pivotY, pivotZ,
    worldYaw: reflected ? 0 : angle,
    worldPitch: reflected ? angle : 0,
    direction: reflected ? [0, -Math.sin(angle), Math.cos(angle)] as const : [Math.sin(angle), 0, Math.cos(angle)] as const,
    beamXAtSample: state.lampLateral * BENCH_GEOMETRY.lateralScale - (reflected ? 0 : pivotZ * Math.tan(angle)),
    beamYAtSample: pivotY + (reflected ? pivotZ * Math.tan(angle) : 0),
    beamZAtSample: BENCH_GEOMETRY.samplePlaneZ,
  };
}

/** 镜身局部 +Z 从入光口延向眼端。反射时在 +Z 上方，观察轴向下看实际出光区。 */
export function benchScopePose(state: BenchState, target: readonly [number, number, number] = [0, BENCH_GEOMETRY.sampleCenterY, 0]) {
  const elevation = state.method === 'transmission' ? 0 : BENCH_GEOMETRY.reflectionElevationDegrees * Math.PI / 180;
  const axis = [0, Math.sin(elevation), Math.cos(elevation)] as const;
  return {
    axis, elevation,
    entry: [target[0], target[1] + axis[1] * BENCH_GEOMETRY.scopeEntryDistance, target[2] + axis[2] * BENCH_GEOMETRY.scopeEntryDistance] as const,
  };
}

export type BenchLightPath = 'off' | 'missed' | 'bypass' | 'blocked' | 'aligned' | 'weak';
export type BenchProblemCode =
  | 'power-off' | 'brightness-zero' | 'sample-absent' | 'lamp-missed' | 'sample-off-axis' | 'method-angle'
  | 'opaque-transmission' | 'opaque-internal-reflection' | 'method-evidence-pending'
  | 'weak-signal' | 'slit-wide' | 'slit-narrow' | 'defocus' | 'unverified-reference';

export interface BenchEvaluation {
  conditions: SpectrumConditions;
  display: SpectrumDisplay;
  lightPath: BenchLightPath;
  /** 主光束在样品平面的横向位置（m），用于场景显示和核验。 */
  beamXAtSample: number;
  beamYAtSample: number;
  beamZAtSample: number;
  sampleX: number;
  specimenTransmission: BenchSpecimenProfile['transmission'];
  signal: 'none' | 'weak' | 'adequate';
  referenceStatus: 'characteristic' | 'non-diagnostic' | 'unverified';
  methodEvidence: 'reference-absorption' | 'setup-only';
  /** 已显示参考谱、连续白光，或者本次根本没有可观察的样品光谱。 */
  spectrumMode: 'reference-simulation' | 'continuous-light' | 'no-signal' | 'unverified' | 'method-unverified';
  problems: string[];
  problemCodes: BenchProblemCode[];
  notices: string[];
  canRecord: boolean;
  recordStatus: 'ready' | 'adjust' | 'unverified' | 'setup-only';
  /** 必须在学员按下记录时保存。任何设置或参考资料变化都会使其失效。 */
  signature: string;
}

const clamp = (value: number, min: number, max: number, fallback: number) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

/** 只收敛越界输入；不自动改善观察条件。 */
export function normalizeBenchState(state: BenchState): BenchState {
  return {
    ...state,
    brightness: clamp(state.brightness, 0, 1, 0),
    lampLateral: clamp(state.lampLateral, -1, 1, 0),
    lampAngle: clamp(state.lampAngle, -75, 75, 0),
    sampleOffset: clamp(state.sampleOffset, -1, 1, 0),
    sampleRotation: Number.isFinite(state.sampleRotation) ? ((state.sampleRotation % 360) + 360) % 360 : 0,
    slit: clamp(state.slit, 0, 1, 0.32),
    focus: clamp(state.focus, 0, 1, 0.5),
  };
}

function referenceStatus(sample: SampleDef): BenchEvaluation['referenceStatus'] {
  return sample.spectrum.diagnosticStatus ?? (sample.spectrum.features.length ? 'characteristic' : 'non-diagnostic');
}

/** 无时间戳/随机数；可用来使本地记录失效，不是防篡改或专业审核凭据。 */
export function benchObservationSignature(sample: SampleDef, state: BenchState): string {
  const s = normalizeBenchState(state);
  return JSON.stringify([
    'spectroscope-reflection-v3', sample.id, sample.characteristics.transparency, sample.refractometerShape,
    referenceStatus(sample), sample.spectrum.features, sample.spectrum.description, sample.spectrum.observationNote ?? '',
    s.dispersion, s.power, s.brightness, s.lampLateral, s.lampAngle, s.samplePlaced,
    s.sampleOffset, s.sampleRotation, s.method, s.slit, s.focus,
  ]);
}

export function benchObservationIsCurrent(sample: SampleDef, state: BenchState, recordedSignature: string | null | undefined): boolean {
  return !!recordedSignature && recordedSignature === benchObservationSignature(sample, state);
}

/**
 * 确定性教学条件判断：保留一套 nm 参考数据，条件仅改变可见性。
 * 反射方式只练习布置；缺少对应样品和方法的参考资料时不复制透射参考谱。
 * 本函数不替学员判断“有/无吸收”；canRecord 只说明条件与资料允许记录。
 */
export function evaluateBench(sample: SampleDef, rawState: BenchState): BenchEvaluation {
  const state = normalizeBenchState(rawState);
  const reflected = state.method !== 'transmission';
  const profile = benchSpecimenProfile(sample);
  const status = referenceStatus(sample);
  const problems: string[] = [];
  const problemCodes: BenchProblemCode[] = [];
  const notices: string[] = [profile.note];
  const problem = (code: BenchProblemCode, text: string) => {
    problemCodes.push(code);
    problems.push(text);
  };
  const lampPose = benchLampPose(state);
  const beamXAtSample = lampPose.beamXAtSample;
  const sampleX = state.sampleOffset * BENCH_GEOMETRY.sampleLateralScale;
  const beamOffset = Math.hypot(beamXAtSample - sampleX, lampPose.beamYAtSample - BENCH_GEOMETRY.sampleCenterY);
  const sampleAxisOffset = Math.abs(sampleX);
  const methodAngleOffset = Math.abs(state.lampAngle - benchMethodSetup(state.method).lampAngle);
  const directAxis = !reflected && Math.abs(state.lampAngle) <= 12 && Math.abs(beamXAtSample) <= BENCH_GEOMETRY.sampleCatchRadius;
  let lightPath: BenchLightPath;

  if (!state.power) {
    lightPath = 'off';
    problem('power-off', '光源尚未开启；先打开光源再判断观察结果。');
  } else if (state.brightness <= 0.025) {
    lightPath = 'off';
    problem('brightness-zero', '入射光量不足以观察；暗场不能记录为“未见吸收特征”。');
  } else if (!state.samplePlaced) {
    lightPath = directAxis ? 'bypass' : 'missed';
    problem('sample-absent', directAxis
      ? '样品尚未放入光路；当前连续光谱来自光源，不能作为样品的观察记录。'
      : '样品尚未放入光路，斜向灯光也未进入分光镜；先放样并对光。');
  } else if (beamOffset > BENCH_GEOMETRY.sampleCatchRadius) {
    lightPath = 'missed';
    problem('lamp-missed', reflected ? '灯束没有照中样品；调整俯角，让光从斜上方落到样品，再配合横移对光。' : '灯头的主光束没有照中样品；配合调整灯头位置与角度。');
  } else if (sampleAxisOffset > BENCH_GEOMETRY.sampleCatchRadius) {
    lightPath = 'missed';
    problem('sample-off-axis', '样品离开分光镜的接收轴；即使灯光照中样品，仍需把样品移回观察孔附近。');
  } else if (methodAngleOffset > 25) {
    lightPath = 'missed';
    problem('method-angle', '当前照明方向没有形成所选方法的观察光路；请配合调整灯头角度与横向位置。');
  } else if (profile.transmission === 'opaque' && state.method === 'transmission') {
    lightPath = 'blocked';
    problem('opaque-transmission', '本样品按不透明状态设置，无法完成透射观察；请换用适合的照明方式，不能记为“不特征”。');
  } else if (profile.transmission === 'opaque' && state.method === 'internal-reflection') {
    lightPath = 'blocked';
    problem('opaque-internal-reflection', '本样品按不透明状态设置，当前内部光路无法观察；可尝试表面反射的教学操作。');
  } else {
    // 所有系数/阈值均为教学可见性档位，不是辐照度或反射率计算。
    const edgeOnFacet = sample.refractometerShape === 'faceted'
      && Math.abs(Math.sin(state.sampleRotation * Math.PI / 180)) > 0.86;
    const limitedTransmission = profile.transmission === 'limited' && state.method === 'transmission';
    const weak = state.brightness < 0.45 || beamOffset > BENCH_GEOMETRY.clearRadius
      || sampleAxisOffset > BENCH_GEOMETRY.clearRadius || methodAngleOffset > 12
      || edgeOnFacet || limitedTransmission;
    lightPath = weak ? 'weak' : 'aligned';
    if (weak) problem('weak-signal', reflected ? '当前布置收光受限；可继续调整光位，但本方法的样品光谱仍待补充资料。' : '当前收光较弱，蓝紫区与弱带可能看不清；可以记录受限观察，但应改善条件再复核。');
    if (edgeOnFacet) notices.push('本例刻面朝向降低了收光；转动样品可比较变化，旋转不生成新的吸收波长。');
    if (limitedTransmission) notices.push('此处保留有限透光的观察，不把整类样品判成不能测；可尝试另一照明方向复核。');
  }

  if (reflected) {
    notices.push('样品置于黑色台面；光源与分光镜从台面上方两侧斜向照明、观察。约 45° 仅为示意起点，并非实物固定角度。');
    notices.push(state.method === 'internal-reflection' ? '刻面样品台面向下；示意光由一侧亭部进入，经底部台面内侧反射后从对侧亭部出射，不代表精确光线追迹。' : '照亮样品实际上表面，分光镜从另一侧斜上方观察同一照明区；不把光线画成从石心发出。');
    if (state.method === 'surface-reflection' && sample.refractometerShape === 'faceted' && profile.transmission !== 'opaque') notices.push('表面反射法通常用于低透明度或不透明材料；透明刻面石的表面返回光不能当作内部吸收谱。');
    problem('method-evidence-pending', '尚无该教学样品在本反射方法下的参考光谱；保留布置练习，不显示透射参考谱，也不计为有效吸收观察。');
  }
  if (sample.spectrum.observationNote) notices.push(sample.spectrum.observationNote);
  if (status === 'non-diagnostic') notices.push('本样品资料标为吸收不具独立诊断价值；在资料适用的方法中可记录观察，但不可单凭有无吸收给出品种结论。');
  if (status === 'unverified') problem('unverified-reference', '该样品的参考谱尚未核定；可练习摆样与照明，不能把空白谱图记成有效的“未见吸收”。');

  const throughSample = !reflected && (lightPath === 'aligned' || lightPath === 'weak');
  const conditions: SpectrumConditions = {
    dispersion: state.dispersion,
    slit: state.slit,
    focus: state.focus,
    light: lightPath === 'weak' ? 'weak' : 'ok',
    throughSample,
  };
  let opticsNeedAdjustment = false;
  if (throughSample && state.dispersion === 'prism') {
    if (state.slit > SLIT_OK[1]) {
      problem('slit-wide', '狭缝过宽，细线可能并成模糊的带；收窄后再记录。');
      opticsNeedAdjustment = true;
    }
    if (state.slit < SLIT_OK[0]) {
      problem('slit-narrow', '狭缝过窄，光谱变暗且弱带可能消失；适当放宽后再记录。');
      opticsNeedAdjustment = true;
    }
    if (Math.abs(state.focus - 0.5) > FOCUS_TOLERANCE) {
      // 指明方向（与焦距滑杆两端的「缩回 / 拉出」一致），学员不必来回试。
      problem('defocus', `焦距偏离清晰位置：目镜套筒往「${state.focus < 0.5 ? '拉出' : '缩回'}」方向调，谱线变锐后再记录。`);
      opticsNeedAdjustment = true;
    }
  }

  const display = displaySpectrum(status === 'unverified' ? [] : sample.spectrum.features, conditions);
  const dark = lightPath === 'off' || lightPath === 'missed' || lightPath === 'blocked';
  if (dark || status === 'unverified' || reflected) {
    display.features = [];
    display.brightness = 0;
    display.violetDim = 0;
    display.blurPx = 0;
  } else {
    // 只做显示亮度，不把滑杆值标成照度或绝对透过率。
    display.brightness *= state.brightness;
  }
  const canRecord = throughSample && !opticsNeedAdjustment && status !== 'unverified';
  return {
    conditions,
    display,
    lightPath,
    beamXAtSample,
    beamYAtSample: lampPose.beamYAtSample,
    beamZAtSample: lampPose.beamZAtSample,
    sampleX,
    specimenTransmission: profile.transmission,
    signal: dark || status === 'unverified' ? 'none' : lightPath === 'weak' ? 'weak' : 'adequate',
    referenceStatus: status,
    methodEvidence: reflected ? 'setup-only' : 'reference-absorption',
    spectrumMode: reflected ? 'method-unverified' : status === 'unverified' ? 'unverified' : dark ? 'no-signal'
      : lightPath === 'bypass' ? 'continuous-light' : 'reference-simulation',
    problems,
    problemCodes,
    notices,
    canRecord,
    recordStatus: reflected ? 'setup-only' : status === 'unverified' ? 'unverified' : canRecord ? 'ready' : 'adjust',
    signature: benchObservationSignature(sample, state),
  };
}
