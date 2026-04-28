import type { ReactNode } from 'react';
import clsx from '@/utils/clsx';

const tones: Record<string, string> = {
  blue: 'bg-brand-50 text-brand-700 ring-brand-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export interface PillProps {
  tone?: keyof typeof tones;
  children: ReactNode;
  className?: string;
}

export default function Pill({ tone = 'blue', children, className }: PillProps) {
  return <span className={clsx('pill', tones[tone], className)}>{children}</span>;
}
