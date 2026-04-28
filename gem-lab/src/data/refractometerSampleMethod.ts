import type { SampleDef, SampleRefractometerShape } from './types';

/** 与样品 `refractometerShape` 对应：仅刻面型 → 刻面法，其它 → 点测法 */
export function requiredRefractometerMethod(sample: SampleDef): 'facet' | 'spot' {
  return sample.refractometerShape === 'faceted' ? 'facet' : 'spot';
}

export function shapeLabelCn(shape: SampleRefractometerShape): string {
  const m: Record<SampleRefractometerShape, string> = {
    faceted: '刻面型',
    cabochon: '弧面型',
    fancy: '异形',
    carved: '雕刻件',
  };
  return m[shape];
}
