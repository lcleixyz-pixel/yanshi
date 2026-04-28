import { useState } from 'react';
import clsx from '@/utils/clsx';
import type { InstrumentMethod } from '@/data/types';

export default function MethodTabs({
  methods,
  themeHex = '#1f5ba8',
}: {
  methods: InstrumentMethod[];
  themeHex?: string;
}) {
  const [activeId, setActiveId] = useState(methods[0]?.id);
  const active = methods.find((m) => m.id === activeId)!;

  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-line">
      {/* Tab 头 */}
      <div className="flex border-b border-line">
        {methods.map((m) => {
          const isActive = m.id === activeId;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setActiveId(m.id)}
              className={clsx(
                'relative flex-1 px-5 py-4 text-left text-sm transition-colors',
                isActive
                  ? 'bg-brand-50/40 text-ink'
                  : 'text-ink-3 hover:bg-brand-50/30 hover:text-ink',
              )}
            >
              <div className="font-display text-base font-semibold">{m.name}</div>
              <div className="mt-0.5 text-xs text-ink-4">适用：{m.suitableFor}</div>
              {isActive && (
                <span
                  className="absolute inset-x-5 -bottom-px h-0.5 rounded-t"
                  style={{ background: themeHex }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* 步骤列表 */}
      <ol className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2">
        {active.steps.map((step) => (
          <li
            key={step.id}
            className="flex items-start gap-3 rounded-xl border border-line bg-brand-50/30 p-3"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
              style={{ background: themeHex }}
            >
              {step.id}
            </span>
            <img
              src={`/assets/icons/steps/${step.iconId}.png`}
              alt=""
              className="h-10 w-10 shrink-0 rounded-lg bg-white p-1 ring-1 ring-line"
              draggable={false}
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-ink">{step.title}</div>
              {step.hint && <div className="mt-0.5 text-xs text-ink-3">{step.hint}</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
