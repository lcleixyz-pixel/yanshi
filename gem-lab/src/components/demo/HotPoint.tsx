import clsx from '@/utils/clsx';

/** 仪器图上可点击的发光圆点 + 标签连线 */
export default function HotPoint({
  x,
  y,
  label,
  sub,
  side = 'right',
  status = 'active',
  themeHex = '#e8a93a',
  onClick,
  showLabel = true,
  emphasis = 'normal',
}: {
  /** 0-1 相对于父容器 */
  x: number;
  y: number;
  label: string;
  sub?: string;
  side?: 'left' | 'right' | 'top' | 'bottom';
  status?: 'active' | 'done' | 'disabled';
  themeHex?: string;
  onClick?: () => void;
  /** 为 false 时仅渲染热点圆点（说明由外部绝对定位自行排版） */
  showLabel?: boolean;
  /** quiet 用于检测模式中保留可点热区，但避免和当前主动引导抢视觉焦点 */
  emphasis?: 'normal' | 'quiet';
}) {
  const isDone = status === 'done';
  const isDisabled = status === 'disabled';
  const isQuiet = emphasis === 'quiet' && !isDone && !isDisabled;

  const labelOffsets: Record<typeof side, string> = {
    right: 'left-12 top-1/2 -translate-y-1/2',
    left: 'right-12 top-1/2 -translate-y-1/2',
    top: 'left-1/2 -translate-x-1/2 bottom-12',
    bottom: 'left-1/2 -translate-x-1/2 top-12',
  };

  return (
    <div
      className="absolute z-[2] -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    >
      <button
        type="button"
        disabled={isDisabled}
        onClick={onClick}
        className={clsx(
          'relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-white outline-none',
          'shadow-card transition-transform',
          !isDisabled && 'hover:scale-110 active:scale-95',
          isQuiet && 'opacity-70 shadow-none',
        )}
        style={{
          background: isDone
            ? 'radial-gradient(circle, #34d399 0%, #059669 100%)'
            : isDisabled
              ? '#cbd5e1'
              : isQuiet
                ? '#f8fafc'
                : `radial-gradient(circle, ${shade(themeHex, 0.25)} 0%, ${themeHex} 100%)`,
          color: '#fff',
          boxShadow: isQuiet ? `0 0 0 1px ${themeHex}55` : undefined,
        }}
        aria-label={label}
      >
        {isDone ? (
          <span className="text-sm font-bold">✓</span>
        ) : isDisabled ? (
          <span className="h-2.5 w-2.5 rounded-full bg-white/50" />
        ) : (
          <>
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: isQuiet ? themeHex : '#fff' }}
            />
            {/* 脉动环 */}
            {!isQuiet && (
              <span
                className="pointer-events-none absolute inset-[-6px] animate-pulse-ring rounded-full border-2"
                style={{ borderColor: themeHex }}
              />
            )}
          </>
        )}
      </button>

      {showLabel && (
        <div
          className={clsx(
            'pointer-events-none absolute z-[40] min-w-max rounded-lg border bg-white px-3 py-1.5 shadow-card',
            labelOffsets[side],
            isDone ? 'border-emerald-200 bg-emerald-50' : 'border-line-2',
          )}
        >
          <div
            className={clsx(
              'text-[12px] font-semibold leading-tight',
              isDone ? 'text-emerald-700' : 'text-ink',
            )}
          >
            {label}
          </div>
          {sub && <div className="mt-0.5 text-[10px] text-ink-3">{sub}</div>}
          <span
            className={clsx(
              'absolute h-2 w-2 rotate-45 border bg-white',
              isDone && 'border-emerald-200 bg-emerald-50',
              !isDone && 'border-line-2',
              side === 'right' && '-left-1 top-1/2 -translate-y-1/2 border-r-0 border-t-0',
              side === 'left' && '-right-1 top-1/2 -translate-y-1/2 border-l-0 border-b-0',
              side === 'top' && '-bottom-1 left-1/2 -translate-x-1/2 border-l-0 border-t-0',
              side === 'bottom' && '-top-1 left-1/2 -translate-x-1/2 border-r-0 border-b-0',
            )}
          />
        </div>
      )}
    </div>
  );
}

function shade(hex: string, percent: number): string {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const adj = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c + (255 - c) * percent)));
  r = adj(r);
  g = adj(g);
  b = adj(b);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
