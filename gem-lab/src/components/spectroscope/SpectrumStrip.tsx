import { useRef, useState } from 'react';
import clsx from '@/utils/clsx';
import type { AbsorptionFeature } from '@/data/types';

const MIN_WL = 400;
const MAX_WL = 700;

/**
 * 光谱条：背景为连续光谱（CSS 渐变模拟），叠加吸收特征（黑线/黑带）。
 * 支持点击添加用户标记线。
 *
 * 色散模式：
 *  - prism   棱镜式：蓝紫区扩展、红光区压缩（非线性映射，用 sqrt 弯曲）
 *  - grating 光栅式：波长—位置近似线性
 *
 * 信噪：noise（0–1）越大表示光谱越糊（透射>内反射>表面反射，错配方法再衰减）
 */
export default function SpectrumStrip({
  features = [],
  userMarks = [],
  onAddMark,
  onRemoveMark,
  slitWidth = 0.5,
  focus = 0.5,
  noise = 0,
  dispersion = 'prism',
  showWavelengthScale = true,
  showFeatures = true,
  showFeatureDescriptions = true,
  height = 80,
  interactive = true,
  locked = false,
}: {
  features?: AbsorptionFeature[];
  userMarks?: number[];
  onAddMark?: (wl: number) => void;
  onRemoveMark?: (wl: number) => void;
  /** 0–1，越宽越亮但越糊 */
  slitWidth?: number;
  /** 0–1，越接近 0.5 越清晰 */
  focus?: number;
  /** 0–1：综合质量损失 = noise；进一步增加模糊与降低吸收线对比度 */
  noise?: number;
  dispersion?: 'prism' | 'grating';
  showWavelengthScale?: boolean;
  showFeatures?: boolean;
  showFeatureDescriptions?: boolean;
  height?: number;
  interactive?: boolean;
  locked?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverWL, setHoverWL] = useState<number | null>(null);
  const isInteractive = interactive && !locked;

  // 综合模糊
  const focusBlur = Math.abs(focus - 0.5) * 6;
  const noiseBlur = noise * 4;
  const blur = focusBlur + noiseBlur;

  // 综合亮度：狭缝越宽越亮（基础亮度），但 noise 会降低对比度
  const brightness = (0.6 + slitWidth * 0.6) * (1 - noise * 0.25);

  // 吸收线对比度：noise 越大越衰减
  const featureContrast = 1 - noise * 0.5;

  // 波长↔位置 映射
  // 注意红区在左、紫区在右（教学常用方向）
  const wlToX = (wl: number): number => {
    const t = (wl - MIN_WL) / (MAX_WL - MIN_WL); // 0 紫 → 1 红
    if (dispersion === 'grating') return 1 - t; // 线性
    // prism：用平方根弯曲，使蓝紫端（小 t）位置变化更快 → 视觉上扩展
    // 红区（大 t）变化变慢 → 视觉上压缩
    const bent = Math.sqrt(t);
    return 1 - bent;
  };
  const xToWL = (xRatio: number): number => {
    // 反向求解，xRatio 已经是 0(左,红)–1(右,紫)
    const tBent = 1 - xRatio;
    const t = dispersion === 'grating' ? tBent : tBent * tBent;
    return Math.round(MIN_WL + t * (MAX_WL - MIN_WL));
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isInteractive || !onAddMark) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    onAddMark(xToWL(xRatio));
  };

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isInteractive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    setHoverWL(xToWL(xRatio));
  };

  // 背景光谱：用 30 段渐变 stops 来支持棱镜式非线性映射
  const stopCount = 32;
  const stops: string[] = [];
  for (let i = 0; i <= stopCount; i++) {
    const xRatio = i / stopCount;
    const wl = xToWL(xRatio);
    stops.push(`${wlToColor(wl)} ${(xRatio * 100).toFixed(2)}%`);
  }
  const spectrumGradient = `linear-gradient(to right, ${stops.join(', ')})`;

  return (
    <div
      className="select-none"
      data-testid="spectroscope-spectrum-strip"
      data-spectrum-state={locked ? 'locked' : 'ready'}
    >
      <div
        ref={containerRef}
        data-testid="spectroscope-spectrum-visual"
        className={clsx(
          'relative w-full overflow-hidden rounded-lg ring-1 ring-line-2',
          isInteractive && 'cursor-crosshair',
        )}
        style={{ height }}
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverWL(null)}
      >
        {/* 背景光谱 */}
        <div
          className="absolute inset-0"
          style={{
            background: spectrumGradient,
            filter: `blur(${blur}px) brightness(${brightness})`,
          }}
        />

        {/* 吸收特征 */}
        {!locked && showFeatures &&
          features.map((f, i) => {
            const xCenter = wlToX(f.wavelength) * 100;
            // band 宽度按棱镜映射换算
            const widthPct =
              f.type === 'band'
                ? Math.abs(wlToX(f.wavelength + (f.width ?? 10) / 2) - wlToX(f.wavelength - (f.width ?? 10) / 2)) * 100
                : 0.4;
            const baseOpacity =
              f.intensity === 'strong' ? 0.95 : f.intensity === 'medium' ? 0.7 : 0.45;
            const opacity = baseOpacity * featureContrast;
            return (
              <div
                key={i}
                className="absolute top-0 h-full"
                style={{
                  left: `${xCenter - widthPct / 2}%`,
                  width: `${widthPct}%`,
                  background: '#000',
                  opacity,
                  pointerEvents: 'none',
                }}
                title={
                  showFeatureDescriptions && f.description
                    ? `${f.wavelength}nm · ${f.description}`
                    : `${f.wavelength}nm`
                }
              />
            );
          })}

        {/* 用户标记 */}
        {!locked && userMarks.map((wl, i) => (
          <div
            key={i}
            className="absolute top-0 h-full"
            style={{ left: `${wlToX(wl) * 100}%`, transform: 'translateX(-1px)' }}
            onClick={(ev) => {
              ev.stopPropagation();
              onRemoveMark?.(wl);
            }}
            title={`${wl}nm（点击删除）`}
          >
            <div className="h-full w-0.5 bg-red-500" />
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-red-500 px-1 py-0.5 font-mono text-[9px] font-bold text-white">
              {wl}
            </div>
          </div>
        ))}

        {/* 悬浮光标 */}
        {!locked && hoverWL !== null && (
          <div
            className="pointer-events-none absolute top-0 h-full w-px bg-white/60"
            style={{ left: `${wlToX(hoverWL) * 100}%` }}
          >
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-white px-1 py-0.5 font-mono text-[9px] font-bold text-ink ring-1 ring-line-2">
              {hoverWL}
            </div>
          </div>
        )}
      </div>

      {/* 波长刻度（位置同样按当前 dispersion 映射） */}
      {showWavelengthScale && (
        <div className="relative mt-1 h-3">
          {[700, 650, 600, 550, 500, 450, 400].map((wl) => (
            <span
              key={wl}
              className="absolute -translate-x-1/2 font-mono text-[10px] text-ink-3"
              style={{ left: `${wlToX(wl) * 100}%` }}
            >
              {wl}
            </span>
          ))}
        </div>
      )}
      <div className="mt-0.5 text-center font-mono text-[10px] text-ink-4">
        波长（nm）· {dispersion === 'prism' ? '棱镜式色散' : '光栅式色散'}
      </div>
    </div>
  );
}

/** 简化的可见光波长 → CSS 颜色（用于背景渐变） */
function wlToColor(wl: number): string {
  // 分段近似（粗略，足够教学用途）
  if (wl < 410) return '#2d0a40';
  if (wl < 440) return '#4b0082';
  if (wl < 470) return '#0044ff';
  if (wl < 500) return '#00d4ff';
  if (wl < 530) return '#00ff44';
  if (wl < 565) return '#c9ff00';
  if (wl < 590) return '#ffd000';
  if (wl < 625) return '#ff7300';
  if (wl < 670) return '#ff0000';
  if (wl < 700) return '#8b0000';
  return '#2d0a14';
}
