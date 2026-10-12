import type { OpticalCharacter } from '@/data/types';
import { SAMPLES_BY_ID } from '@/data/samples';
import { renderConoscopicFigure } from '@/domain/polarizedLight';
import { conoscopeCrystal, getPolariscopeProfile, type ConoscopeOrientation } from '@/domain/polariscopeSamples';

/**
 * 锥光干涉图（互动学习页「高级观察」）。
 *
 * 画面由 `domain/polarizedLight` 逐方向计算：一轴晶 Δn·sin²θ 与径向/切向振动方向，
 * 二轴晶 Δn·sinθ₁·sinθ₂ 与 Biot–Fresnel 振动方向，水晶叠加旋光（Jones 椭圆延迟），
 * 干涉色按 CIE 1931 光谱积分。由此自然得到：
 * - 一轴晶光轴居中：黑十字 + 同心色环，转动物台十字不动；
 * - 水晶：十字到不了中心，中心为彩色圆斑（牛眼）；
 * - 二轴晶单光轴图：一条穿过中心的黑带，随物台转动而转动、弯曲；
 * - 二轴晶锐角等分线图：消光位合成十字，转 45° 分开成两条双曲线。
 * 理想平行板模型，不模拟刻面折射；只用于认识图形，不作具体样品的鉴定依据。
 */

export type InterferencePatternKind = 'uniaxial-cross' | 'uniaxial-bullseye' | 'biaxial';

/** 由光性 + 样品 id 推断干涉图类型。 */
export function classifyInterferencePattern(optical: OpticalCharacter | undefined, sampleId?: string): InterferencePatternKind | null {
  if (!optical) return null;
  const quartz = sampleId != null && SAMPLES_BY_ID[sampleId]?.category === '石英族';
  if (optical === 'uniaxial-positive' || optical === 'uniaxial-negative') return quartz ? 'uniaxial-bullseye' : 'uniaxial-cross';
  if (optical === 'biaxial-positive' || optical === 'biaxial-negative') return 'biaxial';
  return null; // 均质体 / 集合体：无干涉图
}

export function interferenceLabel(kind: InterferencePatternKind): string {
  switch (kind) {
    case 'uniaxial-cross': return '黑十字 + 同心色环 → 一轴晶';
    case 'uniaxial-bullseye': return '牛眼：十字到不了中心，中心为彩色圆斑 → 水晶（石英）';
    case 'biaxial': return '单条黑带随物台转动而转动、弯曲 → 二轴晶';
  }
}

export interface ConoscopicFigureRequest {
  sampleId: string;
  stageDeg: number;
  analyzerDeg?: number;
  orientation?: ConoscopeOrientation;
  thicknessMm?: number;
  brazilTwin?: boolean;
  resolution: number;
}

/** 返回 RGBA 像素（视场外透明）；样品不产生干涉图时返回 null。 */
export function renderSampleInterference(request: ConoscopicFigureRequest): Uint8ClampedArray<ArrayBuffer> | null {
  const profile = getPolariscopeProfile(request.sampleId);
  if (!profile) return null;
  const crystal = conoscopeCrystal(profile, request.orientation ?? 'optic-axis', request.brazilTwin);
  if (!crystal) return null;
  return renderConoscopicFigure(crystal, {
    stageDeg: request.stageDeg, analyzerDeg: request.analyzerDeg ?? 90,
    thicknessMm: request.thicknessMm ?? 2.5, sinThetaMax: 0.42, resolution: request.resolution,
  });
}
