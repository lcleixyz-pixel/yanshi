import { Link, useLocation } from 'react-router-dom';
import clsx from '@/utils/clsx';

export interface HeaderProps {
  /** 在头部正中显示的标题（页面名称） */
  title?: string;
  /** 副标题 */
  subtitle?: string;
  /** 主题：内页（白底）/ 仪器演示（深色） */
  variant?: 'light' | 'dark';
  right?: React.ReactNode;
}

export default function Header({
  title,
  subtitle,
  variant = 'light',
  right,
}: HeaderProps) {
  const isDark = variant === 'dark';
  const location = useLocation();
  const isHome = location.pathname === '/';
  return (
    <header
      className={clsx(
        'flex h-14 shrink-0 items-center justify-between px-6 backdrop-blur',
        isDark
          ? 'border-b border-white/10 bg-lab-navy/80 text-white'
          : 'border-b border-line bg-white/85 text-ink',
      )}
    >
      <Link
        to="/"
        className={clsx(
          'flex items-center gap-2 transition-colors',
          isDark ? 'hover:text-lab-cyan' : 'hover:text-brand',
        )}
      >
        <svg viewBox="0 0 64 64" className="h-7 w-7">
          <defs>
            <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={isDark ? '#67d4f0' : '#3d7ed0'} />
              <stop offset="100%" stopColor={isDark ? '#3d7ed0' : '#1f5ba8'} />
            </linearGradient>
          </defs>
          <path
            d="M32 6 L54 22 L32 58 L10 22 Z"
            fill="url(#logo-g)"
            stroke={isDark ? '#0a1628' : '#fff'}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M32 6 L20 22 L44 22 Z M20 22 L32 58 M44 22 L32 58"
            fill="none"
            stroke={isDark ? '#0a1628' : '#fff'}
            strokeWidth="1.4"
            opacity="0.7"
          />
        </svg>
        <div className="leading-tight">
          <div
            className={clsx(
              'font-display text-base font-semibold',
              isDark ? 'text-white' : 'text-ink',
            )}
          >
            宝石检测实训系统
          </div>
          <div
            className={clsx(
              'font-mono text-[10px] uppercase tracking-[0.25em]',
              isDark ? 'text-lab-cyan/80' : 'text-ink-4',
            )}
          >
            Gemological Laboratory
          </div>
        </div>
      </Link>

      {!isHome && (title || subtitle) && (
        <div className="flex items-center gap-2 truncate">
          {title && (
            <span
              className={clsx(
                'truncate font-display text-base font-semibold',
                isDark ? 'text-white' : 'text-ink',
              )}
            >
              {title}
            </span>
          )}
          {subtitle && (
            <span
              className={clsx(
                'truncate text-xs',
                isDark ? 'text-slate-400' : 'text-ink-3',
              )}
            >
              · {subtitle}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">{right}</div>
    </header>
  );
}
