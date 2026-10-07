import { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '@/components/shared/Header';
import { SAMPLES, SAMPLES_BY_ID } from '@/data/samples';
import { masteryLevel, type MasteryLevel } from '@/domain/practice';
import { useProgress } from '@/store/progressStore';
import clsx from '@/utils/clsx';

type Filter = 'all' | MasteryLevel;

const STATUS: Record<MasteryLevel, { label: string; tone: string; detail: string }> = {
  new: { label: '待探索', tone: 'bg-slate-100 text-slate-600', detail: '还没有命名记录' },
  review: { label: '待复习', tone: 'bg-rose-100 text-rose-700', detail: '最近一次判断有误' },
  practicing: { label: '练习中', tone: 'bg-amber-100 text-amber-800', detail: '已答对一次' },
  mastered: { label: '已掌握', tone: 'bg-emerald-100 text-emerald-700', detail: '至少答对两次，且最近一次正确' },
};

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'review', label: '待复习' },
  { id: 'practicing', label: '练习中' },
  { id: 'mastered', label: '已掌握' },
  { id: 'new', label: '待探索' },
];

export default function ProgressPage() {
  const mastery = useProgress((s) => s.sampleMastery);
  const history = useProgress((s) => s.detectionHistory);
  const totalPoints = useProgress((s) => s.totalPoints);
  const [filter, setFilter] = useState<Filter>('all');

  const counts = SAMPLES.reduce<Record<MasteryLevel, number>>((result, sample) => {
    result[masteryLevel(mastery[sample.id])] += 1;
    return result;
  }, { new: 0, review: 0, practicing: 0, mastered: 0 });
  const explored = SAMPLES.length - counts.new;
  const visible = filter === 'all'
    ? SAMPLES
    : SAMPLES.filter((sample) => masteryLevel(mastery[sample.id]) === filter);

  return (
    <div className="min-h-screen bg-brand-50/40">
      <Header
        title="学习图鉴"
        subtitle="本地学习进度"
        right={<Link to="/" className="btn-ghost text-xs">返回工作台</Link>}
      />
      <main className="mx-auto max-w-[1200px] space-y-7 px-4 py-8 sm:px-8 lg:px-10">
        <section className="relative overflow-hidden rounded-3xl bg-lab-navy p-6 text-white shadow-lift sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-lab-cyan/10 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_300px] lg:items-end">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-lab-cyan">Practice atlas</p>
              <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">把每次判断，变成下一次进步</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                练习会优先抽取未测和最近答错的样品，同时保留其他样品的随机机会。图鉴只记录本浏览器中的教学练习。
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/detection" className="btn rounded-xl bg-lab-cyan px-5 py-2.5 font-semibold text-lab-ink hover:bg-white">开始一轮练习 →</Link>
                <Link to="/knowledge/refractometer" className="btn rounded-xl border border-white/25 bg-white/10 px-5 py-2.5 text-white hover:bg-white/20">复习仪器知识</Link>
              </div>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-slate-300">样品掌握</span>
                <strong className="font-display text-3xl">{counts.mastered}<span className="text-base font-normal text-slate-400"> / {SAMPLES.length}</span></strong>
              </div>
              <div
                className="mt-4 h-2 overflow-hidden rounded-full bg-white/15"
                role="progressbar"
                aria-label="样品掌握进度"
                aria-valuemin={0}
                aria-valuemax={SAMPLES.length}
                aria-valuenow={counts.mastered}
              >
                <div className="h-full rounded-full bg-lab-cyan" style={{ width: `${counts.mastered / SAMPLES.length * 100}%` }} />
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-300">判定为掌握：同一样品至少答对两次，且最近一次判断正确。各难度始终可自由进入。</p>
            </div>
          </div>
        </section>

        <section aria-label="练习概览" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="已探索样品" value={`${explored} / ${SAMPLES.length}`} hint="至少完成过一次命名" />
          <Stat label="待复习" value={String(counts.review)} hint="最近一次判断有误" />
          <Stat label="最近记录" value={String(history.length)} hint="最多保留 50 条明细" />
          <Stat label="累计积分" value={String(totalPoints)} hint="只用于记录个人进步" />
        </section>

        <section className="rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink">样品图鉴</h2>
              <p className="mt-1 text-sm text-ink-3">按最近一次结果更新状态；点击筛选查看下一步练习重点。</p>
            </div>
            <div className="text-xs text-ink-4">当前显示 {visible.length} 种</div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2" aria-label="筛选样品状态">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={clsx(
                  'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                  filter === item.id ? 'bg-brand text-white' : 'bg-brand-50 text-ink-2 hover:bg-brand-100',
                )}
              >
                {item.label} <span className="opacity-75">{item.id === 'all' ? SAMPLES.length : counts[item.id]}</span>
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-line-2 bg-brand-50/40 p-8 text-center text-sm text-ink-3">这里暂时没有样品，开始练习后会自动更新。</div>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {visible.map((sample) => {
                const progress = mastery[sample.id];
                const status = STATUS[masteryLevel(progress)];
                return (
                  <article key={sample.id} className="flex min-w-0 gap-3 rounded-2xl border border-line bg-white p-3 transition-shadow hover:shadow-card">
                    <img src={sample.image} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl bg-brand-50 object-contain p-1.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1">
                        <h3 className="truncate font-display text-sm font-semibold text-ink">{sample.name}</h3>
                        <span className={clsx('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium', status.tone)} title={status.detail}>{status.label}</span>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-ink-3">{sample.category}</p>
                      <p className="mt-2 text-[11px] text-ink-4">{progress ? `答对 ${progress.correct} / ${progress.attempts} 次` : '尚未练习'}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {history.length > 0 && (
          <section className="rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-6">
            <h2 className="font-display text-xl font-semibold">最近练习</h2>
            <div className="mt-4 divide-y divide-line">
              {history.slice(0, 5).map((record) => (
                <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <span className={clsx('flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold', record.correct ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>{record.correct ? '✓' : '×'}</span>
                    <span className="font-medium">{SAMPLES_BY_ID[record.sampleId]?.name ?? '历史样品'}</span>
                    <span className="text-xs text-ink-3">{record.correct ? '判断正确' : '需要复习'}</span>
                  </div>
                  <span className="font-mono text-xs text-ink-4">{new Date(record.completedAt).toLocaleString('zh-CN')}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-soft">
      <p className="text-xs text-ink-3">{label}</p>
      <strong className="mt-2 block font-display text-2xl font-semibold text-ink">{value}</strong>
      <p className="mt-1 text-[11px] text-ink-4">{hint}</p>
    </div>
  );
}
