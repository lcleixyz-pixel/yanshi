import clsx from '@/utils/clsx';

export interface StepperItem {
  id: number;
  label: string;
}

export default function Stepper({
  steps,
  current,
  themeHex = '#1f5ba8',
}: {
  steps: StepperItem[];
  current: number;
  themeHex?: string;
}) {
  return (
    <ol className="flex items-center justify-between gap-2">
      {steps.map((s, i) => {
        const isPast = s.id < current;
        const isCurrent = s.id === current;
        const isLast = i === steps.length - 1;
        return (
          <li key={s.id} className="flex flex-1 items-center">
            <div className="flex shrink-0 flex-col items-center">
              <div
                className={clsx(
                  'flex h-9 w-9 items-center justify-center rounded-full font-mono text-sm font-semibold transition-colors',
                  isPast
                    ? 'bg-emerald-500 text-white'
                    : isCurrent
                      ? 'text-white shadow-card'
                      : 'bg-white text-ink-3 ring-1 ring-line-2',
                )}
                style={isCurrent ? { background: themeHex } : {}}
              >
                {isPast ? '✓' : s.id}
              </div>
              <div
                className={clsx(
                  'mt-1.5 whitespace-nowrap text-xs',
                  isCurrent ? 'font-semibold text-ink' : 'text-ink-3',
                )}
              >
                {s.label}
              </div>
            </div>
            {!isLast && (
              <div
                className={clsx(
                  'mx-2 h-px flex-1 transition-colors',
                  isPast ? 'bg-emerald-400' : 'bg-line-2',
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
