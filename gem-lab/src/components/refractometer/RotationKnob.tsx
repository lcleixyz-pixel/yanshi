import { useCallback, useRef } from 'react';
import clsx from '@/utils/clsx';

interface RotationKnobProps {
  value: number;
  onChange: (v: number) => void;
  onReady?: () => void;
  label: string;
  hint: string;
  ready?: boolean;
  size?: number;
  themeHex?: string;
}

const UNLOCK_THRESHOLD = 0.18;

export default function RotationKnob({
  value,
  onChange,
  onReady,
  label,
  hint,
  ready = false,
  size = 120,
  themeHex = '#1e3a5f',
}: RotationKnobProps) {
  const knobRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current || !knobRef.current) return;
      const rect = knobRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      const angle = Math.atan2(dy, dx);
      const v = ((angle / (2 * Math.PI)) + 1) % 1;
      onChange(v);
      if (Math.abs(v - 0.5) > UNLOCK_THRESHOLD) {
        onReady?.();
      }
    },
    [onChange, onReady],
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [handlePointerMove, handlePointerUp],
  );

  const r = size / 2;
  const pointerAngleRad = (value - 0.25) * 2 * Math.PI;
  const pointerLen = r * 0.72;
  const px = r + Math.cos(pointerAngleRad) * pointerLen;
  const py = r + Math.sin(pointerAngleRad) * pointerLen;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[11px] font-semibold text-ink">{label}</div>
      <svg
        ref={knobRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={clsx(
          'touch-none select-none',
          ready ? 'cursor-grab' : 'cursor-grab animate-[soft-pulse_2s_ease-in-out_infinite]',
        )}
        onPointerDown={handlePointerDown}
      >
        {/* 外圈刻度 */}
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * 2 * Math.PI - Math.PI / 2;
          const isMajor = i % 9 === 0;
          const inner = r - (isMajor ? 14 : 8);
          const outer = r - 3;
          return (
            <line
              key={i}
              x1={r + Math.cos(a) * inner}
              y1={r + Math.sin(a) * inner}
              x2={r + Math.cos(a) * outer}
              y2={r + Math.sin(a) * outer}
              stroke={isMajor ? '#475569' : '#cbd5e1'}
              strokeWidth={isMajor ? 2 : 1}
              strokeLinecap="round"
            />
          );
        })}

        {/* 四个主刻度数字 */}
        {['0°', '90°', '180°', '270°'].map((text, i) => {
          const a = (i / 4) * 2 * Math.PI - Math.PI / 2;
          const labelR = r - 22;
          return (
            <text
              key={text}
              x={r + Math.cos(a) * labelR}
              y={r + Math.sin(a) * labelR}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={9}
              fill="#64748b"
              fontFamily="ui-monospace, monospace"
            >
              {text}
            </text>
          );
        })}

        {/* 旋钮底盘 */}
        <circle cx={r} cy={r} r={r * 0.48} fill="#f1f5f9" stroke="#e2e8f0" strokeWidth={1.5} />

        {/* 指针 */}
        <line
          x1={r}
          y1={r}
          x2={px}
          y2={py}
          stroke={ready ? '#16a34a' : themeHex}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle cx={px} cy={py} r={4} fill={ready ? '#16a34a' : themeHex} />

        {/* 中心圆 */}
        <circle cx={r} cy={r} r={5} fill={ready ? '#16a34a' : themeHex} />
        <circle cx={r} cy={r} r={2.5} fill="white" />
      </svg>
      <div className={clsx('text-[10px]', ready ? 'text-emerald-700 font-semibold' : 'text-ink-2')}>
        {ready ? '已完成旋转练习' : hint}
      </div>
    </div>
  );
}
