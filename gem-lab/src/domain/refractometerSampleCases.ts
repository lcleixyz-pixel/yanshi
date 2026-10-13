/**
 * 折射仪：教学样品 → 三维光路案例的映射。
 *
 * 案例数据由 `tools/3d-assets/instruments-optics-2026-10-08/refractometer/generate_sample_cases.py`
 * 离线算好（与已复核的 `paper-optics-v2` 案例同一套 optics.py 计算），随网页发布；
 * 这里只负责「选哪一条」，不在浏览器里重算光学。
 */

import { requiredRefractometerMethod } from '../data/refractometerSampleMethod';
import type { SampleDef } from '../data/types';

/** 接触液可测上限；与 domain/refractometerCourse.ts 的教学参数一致。 */
export const CONTACT_INDEX = 1.78;

/** 超出接触液上限：只能记为「> 1.780」，三维沿用「样品超过接触液上限」案例。 */
export function isOverContactLimit(sample: SampleDef): boolean {
  const ri = sample.characteristics.refractiveIndex;
  if (ri === 'over-1.78') return true;
  return typeof ri === 'number' ? ri > CONTACT_INDEX : Math.max(ri[0], ri[1]) > CONTACT_INDEX;
}

/**
 * 三维光路按哪个折射率示意：
 * - 刻面法（刻面型样品）取区间下限，即目镜里先看到的那条边界；
 * - 点测法（弧面 / 异形 / 雕刻）取两位小数的近似读数，与目镜视场一致；
 * - 超出接触液上限时没有可读边界，返回 null。
 */
export function displayRiForSample(sample: SampleDef): number | null {
  const ri = sample.characteristics.refractiveIndex;
  if (ri === 'over-1.78') return null;
  const spot = requiredRefractometerMethod(sample) === 'spot';
  const raw = spot
    ? (typeof ri === 'number' ? ri : (ri[0] + ri[1]) / 2)
    : (typeof ri === 'number' ? ri : ri[0]);
  const value = spot ? Math.round(raw * 100) / 100 : raw;
  return value > CONTACT_INDEX ? null : value;
}

/** 接触状态与样品 → 光路案例 id。空气间隙与超量程沿用主案例包里的固定案例。 */
export function caseIdForSample(sample: SampleDef, contact: 'good' | 'air-gap'): string {
  if (contact === 'air-gap') return 'air-gap';
  const ri = displayRiForSample(sample);
  return ri === null ? 'over-liquid' : `sample-${ri.toFixed(3)}`;
}

/** 逐样品案例包（附加在主案例之后，取不到时只用主案例）。 */
export const SAMPLE_CASES_PATH = 'assets/3d/refractometer/sample-cases-v1/sample-cases.json';
