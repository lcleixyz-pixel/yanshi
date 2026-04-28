/**
 * 折射仪观察窗绘制坐标工具
 *
 * 方向约定（与参考图一致）：
 *   标尺从上到下递增：1.33（视觉顶）→ 1.87（视觉底）
 *   光带阴影在边界线以上（shadow above boundary）
 */

export const RI_MIN = 1.35;
export const RI_MAX = 1.81;
export const RI_SCALE_MIN = 1.33;
export const RI_SCALE_MAX = 1.87;
export const OIL_REFRACTIVE_INDEX = 1.78;

/**
 * RI → canvas Y（标尺从上到下递增）
 * @param innerTopY  可绘制区域顶部 Y（对应 RI_SCALE_MIN）
 * @param innerBottomY 可绘制区域底部 Y（对应 RI_SCALE_MAX）
 */
export function riToY(ri: number, innerTopY: number, innerBottomY: number): number {
  const span = RI_SCALE_MAX - RI_SCALE_MIN;
  return innerTopY + ((ri - RI_SCALE_MIN) / span) * (innerBottomY - innerTopY);
}

/** 点测法样品真值 RI（取范围中值） */
export function getSpotTargetRi(ri: number | [number, number] | 'over-1.81'): number {
  if (ri === 'over-1.81') return RI_MAX + 0.1;
  if (typeof ri === 'number') return ri;
  return (ri[0] + ri[1]) / 2;
}

/**
 * 判断椭圆是否"对半"被边界平分（可估读两位小数）
 * toleranceRI：允许偏差，默认 0.009（约 0.01 精度的一半再宽一点）
 */
export function isSpotBisected(sliderRI: number, sampleRI: number, toleranceRI = 0.009): boolean {
  return Math.abs(sliderRI - sampleRI) <= toleranceRI;
}
