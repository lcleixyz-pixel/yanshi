import clsx from '@/utils/clsx';

export interface DemoStep {
  id: number;
  iconId: string;
  title: string;
  /** 是否已完成 */
  done: boolean;
  /** 是否当前步骤 */
  current: boolean;
}

export default function StepGuide({
  title = '操作步骤',
  steps,
  themeHex,
  variant = 'default',
}: {
  title?: string;
  steps: DemoStep[];
  themeHex: string;
  /** inline：一行横排，节省高度 */
  variant?: 'default' | 'inline';
}) {
  if (variant === 'inline') {
    return (
      <div className="rounded-2xl border border-line bg-white p-2.5 shadow-soft">
        <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold text-ink">
          <span style={{ color: themeHex }}>📋</span>
          {title}
        </div>
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {steps.map((s) => (
            <li
              key={s.id}
              className={clsx(
                'inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 pl-1 text-[10px] transition',
                s.current && 'border-brand-300 bg-brand-50/70 ring-1 ring-brand-200/80',
                s.done && !s.current && 'border-transparent bg-slate-50/80 text-ink-3',
                !s.done && !s.current && 'border-line bg-white text-ink-2',
              )}
            >
              <span
                className={clsx(
                  'inline-flex h-4 min-w-4 items-center justify-center rounded-full text-[9px] font-bold',
                  s.done
                    ? 'bg-emerald-500 text-white'
                    : s.current
                      ? 'text-white'
                      : 'bg-line text-ink-3',
                )}
                style={s.current && !s.done ? { background: themeHex } : {}}
              >
                {s.done ? '✓' : s.id}
              </span>
              <span
                className={clsx(
                  'whitespace-nowrap',
                  s.current ? 'font-semibold text-ink' : 'text-ink-2',
                  s.done && !s.current && 'text-ink-3',
                )}
              >
                {s.title}
              </span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-3 shadow-soft">
      <div className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-ink">
        <span style={{ color: themeHex }}>📋</span>
        {title}
      </div>
      <ol className="space-y-1.5">
        {steps.map((s) => (
          <li
            key={s.id}
            className={clsx(
              'flex items-center gap-3 rounded-lg px-2.5 py-2 transition',
              s.current && 'bg-brand-50/60 ring-1 ring-brand-200',
              s.done && !s.current && 'opacity-70',
            )}
          >
            <span
              className={clsx(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                s.done
                  ? 'bg-emerald-500 text-white'
                  : s.current
                    ? 'text-white'
                    : 'bg-line text-ink-3',
              )}
              style={s.current && !s.done ? { background: themeHex } : {}}
            >
              {s.done ? '✓' : s.id}
            </span>
            <span
              className={clsx(
                'text-xs',
                s.current ? 'font-semibold text-ink' : 'text-ink-2',
                s.done && !s.current && 'text-ink-3',
              )}
            >
              {s.title}
            </span>
            {s.current && (
              <span className="ml-auto h-2 w-2 animate-soft-pulse rounded-full" style={{ background: themeHex }} />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
