import type { Dispersion } from './spectrumDisplay';

export const SPECTRUM_MIN_NM = 400;
export const SPECTRUM_MAX_NM = 700;
const SPAN_NM = SPECTRUM_MAX_NM - SPECTRUM_MIN_NM;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * 共享的 nm → 视场坐标：左红、右紫。
 * 光栅近似线性；棱镜以平方根示意蓝紫端扩展，不代表已标定的实际仪器色散。
 * 样品数据、用户标记始终保存 nm，仅显示位置随机型变化。
 */
export function wavelengthToPosition(wavelength: number, dispersion: Dispersion): number {
  const t = (clamp(wavelength, SPECTRUM_MIN_NM, SPECTRUM_MAX_NM) - SPECTRUM_MIN_NM) / SPAN_NM;
  return 1 - (dispersion === 'prism' ? Math.sqrt(t) : t);
}

/** 点击位置反算为 nm；调用方决定读数精度，此处不舍入。 */
export function positionToWavelength(position: number, dispersion: Dispersion): number {
  const t = 1 - clamp(position, 0, 1);
  return SPECTRUM_MIN_NM + (dispersion === 'prism' ? t * t : t) * SPAN_NM;
}

/**
 * 吸收带先裁到可见范围，再分别映射两端。
 * 棱镜非线性映射下，不能用“中心坐标 ± 像素宽度一半”代替真实端点。
 */
export function wavelengthRangeToPositions(startNm: number, endNm: number, dispersion: Dispersion): { left: number; width: number } | null {
  if (!Number.isFinite(startNm) || !Number.isFinite(endNm)) return null;
  const low = Math.min(startNm, endNm), high = Math.max(startNm, endNm);
  if (high < SPECTRUM_MIN_NM || low > SPECTRUM_MAX_NM) return null;
  const left = wavelengthToPosition(high, dispersion);
  const right = wavelengthToPosition(low, dispersion);
  return { left, width: right - left };
}
