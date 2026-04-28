import { useNavigate } from 'react-router-dom';
import clsx from '@/utils/clsx';

export interface HotspotProps {
  id: string;
  /** 热区位置（相对于父容器的百分比） */
  rect: { left: string; top: string; width: string; height: string };
  /** hover 显示的徽章位置 */
  badgePosition: 'top' | 'right' | 'bottom' | 'left';
  to: string;
  title: string;
  subtitle?: string;
  themeHex?: string;
  /** 是否已访问（在徽章上展示对勾） */
  visited?: boolean;
  /** 主题：仪器/样品 */
  variant?: 'instrument' | 'sample';
}

export default function Hotspot({
  rect,
  badgePosition,
  to,
  title,
  subtitle,
  themeHex = '#67d4f0',
  visited = false,
  variant = 'instrument',
}: HotspotProps) {
  const navigate = useNavigate();

  const badgeOffsets: Record<HotspotProps['badgePosition'], string> = {
    top: 'left-1/2 -translate-x-1/2 -top-3 -translate-y-full',
    right: 'top-1/2 -translate-y-1/2 -right-3 translate-x-full',
    bottom: 'left-1/2 -translate-x-1/2 -bottom-3 translate-y-full',
    left: 'top-1/2 -translate-y-1/2 -left-3 -translate-x-full',
  };

  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={clsx(
        'group absolute z-10 cursor-pointer rounded-2xl outline-none transition-all',
        'focus-visible:ring-2 focus-visible:ring-lab-cyan',
      )}
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
      aria-label={title}
    >
      {/* 透明热区主体（hover 时显示高亮光圈） */}
      <span
        className={clsx(
          'absolute inset-0 rounded-2xl transition-all duration-300',
          'ring-0 ring-offset-0',
          'group-hover:bg-white/5',
          'group-hover:shadow-[0_0_60px_rgba(103,212,240,0.35)]',
        )}
        style={{
          boxShadow:
            'inset 0 0 0 0 transparent',
        }}
      ></span>

      {/* 持续脉动的小光点（吸引点击） */}
      <span
        className={clsx(
          'absolute h-3 w-3 rounded-full',
          'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
          'animate-soft-pulse',
        )}
        style={{
          background: `radial-gradient(circle, ${themeHex} 0%, ${themeHex}55 60%, transparent 100%)`,
          boxShadow: `0 0 24px 8px ${themeHex}55`,
        }}
      />

      {/* 徽章 */}
      <span
        className={clsx(
          'absolute z-20 flex min-w-max items-center gap-2 rounded-xl px-3 py-2 text-left',
          'border border-white/15 bg-lab-navy/85 text-white shadow-lift backdrop-blur',
          'opacity-0 transition-all duration-300 ease-out',
          'group-hover:opacity-100 group-focus-visible:opacity-100',
          variant === 'sample' ? 'group-hover:translate-y-0' : '',
          badgeOffsets[badgePosition],
        )}
      >
        {visited && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/90 text-[11px]">
            ✓
          </span>
        )}
        <span className="leading-tight">
          <span className="block font-display text-sm font-semibold tracking-wide">{title}</span>
          {subtitle && (
            <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-lab-cyan/80">
              {subtitle}
            </span>
          )}
        </span>
        <span
          className="ml-1 text-xs"
          style={{ color: themeHex }}
        >
          →
        </span>
      </span>
    </button>
  );
}
