import { Link } from 'react-router-dom';
import clsx from '@/utils/clsx';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export default function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav
      aria-label="breadcrumb"
      className={clsx(
        'flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-4',
        className,
      )}
    >
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {it.to && !last ? (
              <Link to={it.to} className="hover:text-brand">
                {it.label}
              </Link>
            ) : (
              <span className={clsx(last && 'font-semibold text-brand-700')}>{it.label}</span>
            )}
            {!last && <span className="text-line-2">/</span>}
          </span>
        );
      })}
    </nav>
  );
}
