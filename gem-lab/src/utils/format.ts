import type { GemCharacteristics, OpticalCharacter } from '@/data/types';

export function formatRI(ri: GemCharacteristics['refractiveIndex']): string {
  if (ri === 'over-1.81') return '> 1.81（超量程）';
  if (typeof ri === 'number') return ri.toFixed(3);
  return `${ri[0].toFixed(3)} – ${ri[1].toFixed(3)}`;
}

export function formatDR(dr?: number): string {
  if (dr === undefined || dr === null) return '—';
  if (dr === 0) return '0（均质体）';
  return dr.toFixed(3);
}

export const OPTICAL_LABEL: Record<OpticalCharacter, string> = {
  isotropic: '均质体',
  'uniaxial-positive': '一轴晶（+）',
  'uniaxial-negative': '一轴晶（-）',
  'biaxial-positive': '二轴晶（+）',
  'biaxial-negative': '二轴晶（-）',
  aggregate: '多晶质集合体',
};

export function isAnisotropic(c: OpticalCharacter): boolean {
  return c !== 'isotropic' && c !== 'aggregate';
}
