import { SAMPLES, SAMPLES_BY_ID } from '../data/samples';
import type { SampleDef, SampleRefractometerShape } from '../data/types';
import {
  biaxialAxes,
  directionFromTilt,
  type CrystalOptics,
  type Rgb,
} from './polarizedLight';

export type ObservationClass = 'isotropic' | 'anisotropic' | 'aggregate' | 'opaque';

/**
 * 样品库 → 偏光镜教学光学参数。
 * 双折射率、光性、透明度直接取样品库；体色、2V 与教学厚度为示意取值（见各字段注释），
 * 只用于建立现象与原理的对应，不代表具体样品的实测。
 */

/** 体色（线性 sRGB 透过率），按样品库颜色描述取代表色。 */
const BODY_COLOR: Record<string, Rgb> = {
  ruby: [0.78, 0.05, 0.09], sapphire: [0.08, 0.17, 0.72], emerald: [0.08, 0.58, 0.24], amethyst: [0.48, 0.18, 0.7],
  citrine: [0.95, 0.66, 0.16], garnet: [0.58, 0.04, 0.07], peridot: [0.52, 0.74, 0.1], topaz: [0.55, 0.76, 0.95],
  tourmaline: [0.18, 0.58, 0.32], spinel: [0.84, 0.14, 0.34], tanzanite: [0.34, 0.28, 0.86], aquamarine: [0.55, 0.85, 0.95],
  zircon: [0.58, 0.85, 0.92], moonstone: [0.9, 0.93, 0.98], amber: [0.95, 0.52, 0.07], pearl: [0.94, 0.9, 0.86],
  turquoise: [0.22, 0.72, 0.72], jadeite: [0.33, 0.78, 0.38], nephrite: [0.86, 0.86, 0.72], 'nephrite-jasper': [0.13, 0.42, 0.18],
  opal: [0.9, 0.9, 0.95], agate: [0.76, 0.55, 0.4], chalcedony: [0.74, 0.8, 0.9], diamond: [0.98, 0.98, 0.98],
  marble: [0.95, 0.95, 0.93], prehnite: [0.74, 0.88, 0.48], serpentine: [0.68, 0.8, 0.42], 'jinsi-jade': [0.95, 0.72, 0.33],
};

/** 光轴角 2V 的代表值（度），用于锥光图；取常见文献范围的中段。 */
const OPTIC_AXIAL_ANGLE: Record<string, number> = { peridot: 86, topaz: 56, tanzanite: 40, moonstone: 60 };

/** 教学默认的应变强度：样品库已注明「常见异常消光」者默认开启。 */
const DEFAULT_STRAIN: Record<string, number> = { garnet: 0.55, amber: 0.85 };

const DEPOLARIZATION: Record<SampleDef['characteristics']['transparency'], number> = {
  '透明': 0.03, '透明-半透明': 0.14, '半透明': 0.38, '透明-不透明': 0.3, '半透明-不透明': 0.55, '不透明': 1,
};

/**
 * 样品在载物台上的空间取向。正光观察与锥光干涉图共用同一取向，
 * 放上、取下干涉球前后是同一块晶体、同一个方向。
 * - general：一般方向（光轴明显倾斜，看不到光轴出露点）；
 * - optic-axis：一条光轴竖直（沿光轴观察）；
 * - off-axis：一轴晶光轴略偏（约 13°）；
 * - acute-bisectrix：二轴晶锐角等分线竖直。
 */
export type SampleOrientation = 'general' | 'optic-axis' | 'off-axis' | 'acute-bisectrix';
/** @deprecated 旧名，等同 SampleOrientation。 */
export type ConoscopeOrientation = SampleOrientation;

export interface PolariscopeSampleProfile {
  id: string;
  name: string;
  observation: ObservationClass;
  shape: SampleRefractometerShape;
  bodyColor: Rgb;
  birefringence: number;
  depolarization: number;
  defaultStrain: number;
  /** 可选的放置取向（非均质单晶才有）。 */
  orientations: SampleOrientation[];
  quartz: boolean;
  opticAxialAngle?: number;
  expectedPhenomenon: 'all-dark' | 'four-bright-four-dark' | 'all-bright' | 'anomalous' | 'not-applicable';
}

function classify(sample: SampleDef): ObservationClass {
  const c = sample.characteristics;
  if (c.transparency === '不透明') return 'opaque';
  if (c.opticalCharacter === 'aggregate') return 'aggregate';
  if (c.opticalCharacter === 'isotropic') return 'isotropic';
  return 'anisotropic';
}

export function polariscopeProfile(sample: SampleDef): PolariscopeSampleProfile {
  const c = sample.characteristics, observation = classify(sample);
  const uniaxial = c.opticalCharacter.startsWith('uniaxial'), biaxial = c.opticalCharacter.startsWith('biaxial');
  const defaultStrain = DEFAULT_STRAIN[sample.id] ?? 0;
  return {
    id: sample.id, name: sample.name, observation, shape: sample.refractometerShape,
    bodyColor: BODY_COLOR[sample.id] ?? [0.85, 0.85, 0.85],
    birefringence: c.birefringence ?? 0,
    depolarization: DEPOLARIZATION[c.transparency],
    defaultStrain,
    orientations: observation !== 'anisotropic' ? [] : uniaxial ? ['general', 'optic-axis', 'off-axis'] : ['general', 'optic-axis', 'acute-bisectrix'],
    quartz: sample.category === '石英族',
    opticAxialAngle: biaxial ? OPTIC_AXIAL_ANGLE[sample.id] ?? 60 : undefined,
    expectedPhenomenon: observation === 'opaque' ? 'not-applicable' : observation === 'aggregate' ? 'all-bright'
      : observation === 'anisotropic' ? 'four-bright-four-dark' : defaultStrain > 0 ? 'anomalous' : 'all-dark',
  };
}

export const POLARISCOPE_PROFILES: PolariscopeSampleProfile[] = SAMPLES.map(polariscopeProfile);
export const POLARISCOPE_PROFILES_BY_ID: Record<string, PolariscopeSampleProfile> = Object.fromEntries(POLARISCOPE_PROFILES.map((p) => [p.id, p]));
export const getPolariscopeProfile = (id: string | null | undefined) => (id ? POLARISCOPE_PROFILES_BY_ID[id] ?? (SAMPLES_BY_ID[id] ? polariscopeProfile(SAMPLES_BY_ID[id]) : null) : null);

/** 课堂首选样品：每类现象一颗，便于对比。 */
export const FEATURED_SAMPLE_IDS = ['spinel', 'tourmaline', 'peridot', 'jadeite', 'garnet', 'amber', 'citrine', 'turquoise'] as const;

export interface SampleViewSettings {
  /** 样品放置取向（沿光轴时普通非均质体全暗，水晶因旋光呈不随转动改变的颜色）。 */
  orientation: SampleOrientation;
  /** 应变强度 0–1（异常双折射）。 */
  strain: number;
  /** 样品厚度（mm），正光与锥光共用。 */
  thicknessMm?: number;
  brazilTwin?: boolean;
}

/** 一般方向时晶体消光方向的方位（度），正光与锥光一致。 */
export const GENERAL_AZIMUTH_DEG = 25;

/** 样品的晶体模型（实验室坐标，物台 0°）；正光视场与锥光干涉图共用。 */
export function sampleCrystal(profile: PolariscopeSampleProfile, orientation: SampleOrientation, brazilTwin = false): CrystalOptics | null {
  if (profile.observation !== 'anisotropic') return null;
  const dn = profile.birefringence;
  if (profile.opticAxialAngle === undefined) {
    const axis = orientation === 'off-axis' ? directionFromTilt(13, 30) : orientation === 'general' ? directionFromTilt(62, GENERAL_AZIMUTH_DEG) : directionFromTilt(0, 0);
    return profile.quartz
      ? { kind: 'uniaxial', birefringence: dn, axis, opticalActivity: brazilTwin ? 'quartz-brazil-twin' : 'quartz', twinRightFraction: brazilTwin ? 0.5 : undefined }
      : { kind: 'uniaxial', birefringence: dn, axis };
  }
  const v = profile.opticAxialAngle / 2;
  // 单光轴图：让一条光轴竖直；锐角等分线图：锐角等分线竖直，光轴面沿 0° 方向；一般方向：锐角等分线倾斜 55°。
  const axes = orientation === 'acute-bisectrix' ? biaxialAxes(v)
    : orientation === 'general' ? biaxialAxes(v, directionFromTilt(55, GENERAL_AZIMUTH_DEG), GENERAL_AZIMUTH_DEG)
      : biaxialAxes(v, directionFromTilt(v, 180));
  return { kind: 'biaxial', birefringence: dn, axes };
}

/** 旧名：锥光干涉图的晶体模型。 */
export const conoscopeCrystal = sampleCrystal;
