import { useRef, useState, useEffect } from 'react';
import clsx from '@/utils/clsx';
import type { AbsorptionFeature } from '@/data/types';

const MIN_WL = 400;
const MAX_WL = 700;

/**
 * 光谱条：背景为连续光谱（CSS 渐变模拟），叠加吸收特征（黑线/黑带）。
 * 支持点击添加用户标记线（拖动）。
 */
export default function SpectrumStrip({
  features = [],
  userMarks = [],
  onAddMark,
  onRemoveMark,
  slitWidth = 0.5, // 0-1，越大越亮但模糊
  focus = 0.5, // 0-1，越接近 0.5 越清晰
  showWavelengthScale = true,
  showFeatures = true,
  height = 80,
  interactive = true,
}: {
  features?: AbsorptionFeature[];
  userMarks?: number[];
  onAddMark?: (wl: number) => void;
  onRemoveMark?: (wl: number) => void;
  slitWidth?: number;
  focus?: number;
  showWavelengthScale?: boolean;
  showFeatures?: boolean;
  height?: number;
  interactive?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverWL, setHoverWL] = useState<number | null>(null);

  const blur = Math.abs(focus - 0.5) * 6; // 焦距偏离 0.5 越多越模糊
  const brightness = 0.6 + slitWidth * 0.6; // 0.6 ~ 1.2

  const xToWL = (xRatio: number): number => MIN_WL + (1 - xRatio) * (MAX_WL - MIN_WL); // 注意红区在左，紫区在右
  const wlToX = (wl: number): number => 1 - (wl - MIN_WL) / (MAX_WL - MIN_WL);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || !onAddMark) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const wl = Math.round(xToWL(xRatio));
    onAddMark(wl);
  };

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    setHoverWL(Math.round(xToWL(xRatio)));
  };

  return (
    <div className="select-none">
      <div
        ref={containerRef}
        className={clsx(
          'relative w-full overflow-hidden rounded-lg ring-1 ring-line-2',
          interactive && 'cursor-crosshair',
        )}
        style={{ height }}
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverWL(null)}
      >
        {/* 背景光谱：从红（左）到紫（右） */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to right, #2d0a14 0%, #8b0000 5%, #ff0000 14%, #ff7300 26%, #ffd000 38%, #c9ff00 47%, #00ff44 56%, #00d4ff 70%, #0044ff 82%, #4b0082 92%, #2d0040 100%)',
            filter: `blur(${blur}px) brightness(${brightness})`,
          }}
        />

        {/* 吸收特征 */}
        {showFeatures &&
          features.map((f, i) => {
            const xCenter = wlToX(f.wavelength) * 100;
            const widthPct = f.type === 'band' ? ((f.width ?? 10) / (MAX_WL - MIN_WL)) * 100 : 0.4;
            const opacity =
              f.intensity === 'strong' ? 0.95 : f.intensity === 'medium' ? 0.7 : 0.45;
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
                title={`${f.wavelength}nm · ${f.description ?? ''}`}
              />
            );
          })}

        {/* 用户标记 */}
        {userMarks.map((wl, i) => (
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
        {hoverWL !== null && (
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

      {/* 波长刻度 */}
      {showWavelengthScale && (
        <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-3">
          {[700, 650, 600, 550, 500, 450, 400].map((wl) => (
            <span key={wl}>{wl}</span>
          ))}
        </div>
      )}
      <div className="mt-0.5 text-center font-mono text-[10px] text-ink-4">波长（nm）</div>
    </div>
  );
}
