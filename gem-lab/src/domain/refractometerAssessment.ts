import type { GemCharacteristics } from '../data/types';
import type { RefractometerData } from '../store/detectionStore';
import { formatRI } from '../utils/format';

type RefractiveIndex = GemCharacteristics['refractiveIndex'];
type Method = RefractometerData['method'];

function isOverRange(standard: RefractiveIndex): boolean {
  return standard === 'over-1.78'
    || (typeof standard === 'number' ? standard > 1.78 : Math.max(...standard) > 1.78);
}

/** 点测只有一个近似读数；刻面法仍分别核对最小值和最大值。 */
export function checkRI(
  userMin: number | null,
  userMax: number | null,
  standard: RefractiveIndex,
  method: Method,
): boolean {
  // 保持超量程样品只记录“> 1.780”、不填写数值的既有规则。
  if (standard === 'over-1.78' || isOverRange(standard)) return userMin === null;
  if (userMin === null || !Number.isFinite(userMin)) return false;
  const TOL = 0.005;
  if (method === 'spot') {
    const [min, max] = typeof standard === 'number' ? [standard, standard] : standard;
    // 点测保留两位小数，允许半个末位单位的舍入误差；不据此测定双折射率。
    const precision = 0.01 / 2;
    return userMin >= min - precision - Number.EPSILON
      && userMin <= max + precision + Number.EPSILON;
  }
  if (typeof standard === 'number') return Math.abs(userMin - standard) <= TOL;
  const u = userMax ?? userMin;
  return Math.abs(userMin - standard[0]) <= TOL && Math.abs(u - standard[1]) <= TOL;
}

export function formatRIReference(standard: RefractiveIndex, method: Method): string {
  if (method !== 'spot') return formatRI(standard);
  if (standard === 'over-1.78' || isOverRange(standard)) return '点测参考 > 1.780（超折射油）';
  if (typeof standard === 'number') return `点测参考 ${standard.toFixed(2)}（近似值）`;
  const min = standard[0].toFixed(2), max = standard[1].toFixed(2);
  const range = min === max ? min : `${min} – ${max}`;
  return `点测参考 ${range}（单次近似读数范围，不代表双折射率）`;
}
