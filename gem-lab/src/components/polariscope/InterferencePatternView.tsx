import { useEffect, useRef } from 'react';
import { classifyInterferencePattern, interferenceLabel, renderSampleInterference } from './polariscopeInterference';
import type { OpticalCharacter } from '@/data/types';

const RESOLUTION = 200;

/**
 * 锥光干涉图观察窗（实验性）。正交偏光 + 锥光干涉球条件下，按样品光性实时计算。
 * 未模拟加球操作步骤；默认取「光轴大致直立」的方向，便于认识图形。
 */
export default function InterferencePatternView({
  optical,
  sampleId,
  rotation,
  size = 240,
}: {
  optical: OpticalCharacter | undefined;
  sampleId?: string;
  /** 物台角度（度）。 */
  rotation: number;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const kind = classifyInterferencePattern(optical, sampleId);

  useEffect(() => {
    if (!kind || !sampleId) return;
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    const frame = requestAnimationFrame(() => {
      const pixels = renderSampleInterference({ sampleId, stageDeg: rotation, resolution: RESOLUTION });
      if (pixels) context.putImageData(new ImageData(pixels, RESOLUTION, RESOLUTION), 0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [kind, sampleId, rotation]);

  if (!kind) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl bg-slate-900/95 px-6 text-center text-xs leading-relaxed text-slate-400">
        当前样品不产生锥光干涉图
        <br />
        （均质体 / 集合体不适用；需非均质体）
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative overflow-hidden rounded-full border-4 border-[#1a1a1a] shadow-card" style={{ width: size, height: size, background: '#050507' }}>
        <canvas
          ref={canvasRef}
          width={RESOLUTION}
          height={RESOLUTION}
          className="absolute inset-0 h-full w-full"
          style={{ width: size, height: size }}
          aria-label={`锥光干涉图：${interferenceLabel(kind)}`}
          role="img"
        />
      </div>
      <div className="rounded-full bg-violet-50 px-3 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-violet-200">{interferenceLabel(kind)}</div>
      <div className="max-w-[260px] text-center text-[10px] leading-relaxed text-ink-3">
        {kind === 'biaxial'
          ? `转动载物台（当前 ${Math.round(rotation)}°）：黑带绕中心转动，45° 附近弯曲最明显。`
          : kind === 'uniaxial-bullseye'
            ? '水晶有旋光性：中心色斑的颜色随检偏器角度改变；紫晶常见双晶，图形可能扭曲。'
            : `转动载物台（当前 ${Math.round(rotation)}°）：光轴居中时黑十字保持不动。`}
      </div>
    </div>
  );
}
