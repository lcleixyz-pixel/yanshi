import type { OpticalCharacter } from '@/data/types';

/**
 * 根据 rotation / optical / polarPosition 决定当前现象（离散版本）。
 * 供 detectionStore / 旧代码向后兼容使用。
 * 新 Canvas 渲染请使用 ObservationCanvas 中的 computePhenomenonBrightness。
 */
export function computePhenomenon(
  rotation: number,
  optical: OpticalCharacter | undefined,
  polarPosition: 'crossed' | 'parallel',
):
  | 'all-bright'
  | 'all-dark'
  | 'four-bright-four-dark-bright'
  | 'four-bright-four-dark-dark'
  | 'parallel' {
  if (polarPosition === 'parallel') return 'parallel';
  if (!optical) return 'all-dark';
  if (optical === 'isotropic') return 'all-dark';
  if (optical === 'aggregate') return 'all-bright';

  // 非均质体：四明四暗
  const r = ((rotation % 360) + 360) % 360;
  const phase = r % 90;
  const inDarkBand = phase < 25 || phase > 65;
  return inDarkBand ? 'four-bright-four-dark-dark' : 'four-bright-four-dark-bright';
}
