import { useEffect, useState } from 'react';
import clsx from '@/utils/clsx';

export interface SectionNavItem {
  id: string;
  label: string;
}

export default function SectionNav({
  items,
  themeHex = '#1f5ba8',
}: {
  items: SectionNavItem[];
  themeHex?: string;
}) {
  const [active, setActive] = useState<string>(items[0]?.id ?? '');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // 选取最靠近视口顶部的可见 section
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          visible.sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top),
          );
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: '-25% 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] },
    );
    items.forEach((it) => {
      const el = document.getElementById(it.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="sticky top-24 flex flex-col gap-1.5 text-sm">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-4">
        On this page
      </div>
      {items.map((it, i) => {
        const isActive = active === it.id;
        return (
          <a
            key={it.id}
            href={`#${it.id}`}
            className={clsx(
              'group relative flex items-center gap-3 rounded-lg py-1.5 pl-4 pr-3 transition-colors',
              isActive
                ? 'bg-brand-50 text-brand-700'
                : 'text-ink-3 hover:text-brand-700',
            )}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(it.id);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setActive(it.id);
              }
            }}
          >
            <span
              className={clsx(
                'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full transition-all',
                isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50',
              )}
              style={{ background: themeHex }}
            />
            <span className="font-mono text-[11px] tabular-nums text-ink-4">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className={clsx(isActive && 'font-semibold')}>{it.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
