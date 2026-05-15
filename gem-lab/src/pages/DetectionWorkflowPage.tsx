import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '@/components/shared/Header';
import Stepper from '@/components/workflow/Stepper';
import Pill from '@/components/shared/Pill';
import RefractometerDemo from '@/components/refractometer/RefractometerDemo';
import PolariscopeDemo from '@/components/polariscope/PolariscopeDemo';
import SpectroscopeDemo from '@/components/spectroscope/SpectroscopeDemo';
import { INSTRUMENT_LIST, INSTRUMENTS } from '@/data/instruments';
import { SAMPLES_BY_DIFFICULTY, SAMPLES_BY_ID } from '@/data/samples';
import type { Difficulty, InstrumentId } from '@/data/types';
import { useDetection } from '@/store/detectionStore';
import { formatDR, formatRI, OPTICAL_LABEL } from '@/utils/format';
import clsx from '@/utils/clsx';

const STEPS = [
  { id: 1, label: '难度选择' },
  { id: 2, label: '抽取样品' },
  { id: 3, label: '选择仪器' },
  { id: 4, label: '检测操作' },
  { id: 5, label: '记录汇总' },
];

const DIFFICULTY_INFO: Record<
  Difficulty,
  { title: string; sub: string; emoji: string; tone: 'green' | 'blue' | 'amber' }
> = {
  beginner: { title: '初级', sub: '入门推荐', emoji: '🌱', tone: 'green' },
  intermediate: { title: '中级', sub: '进阶挑战', emoji: '⛰', tone: 'blue' },
  advanced: { title: '高级', sub: '专家挑战', emoji: '👑', tone: 'amber' },
};

export default function DetectionWorkflowPage() {
  const navigate = useNavigate();
  const session = useDetection();
  const startSession = useDetection((s) => s.startSession);
  const resetSession = useDetection((s) => s.resetSession);

  const [step, setStep] = useState(1);
  const [drawnSample, setDrawnSample] = useState<string | null>(null);
  const [activeInstrument, setActiveInstrument] = useState<InstrumentId | null>(null);

  // 进入页面时不自动重置（允许刷新继续）
  useEffect(() => {
    if (session.sampleId) {
      setDrawnSample(session.sampleId);
      // 根据已用仪器推断步骤
      if (session.instrumentsUsed.length > 0) setStep(5);
      else setStep(3);
    }
  }, [session.sampleId, session.instrumentsUsed.length]);

  const handlePickDifficulty = (d: Difficulty) => {
    resetSession();
    setDrawnSample(null);
    setActiveInstrument(null);
    setStep(2);
    // 注意：startSession 会清空，所以先选难度，等抽样后再 startSession
    setTimeout(() => useDetection.setState({ difficulty: d }), 0);
  };

  const handleDrawSample = () => {
    const diff = session.difficulty;
    if (!diff) return;
    const pool = SAMPLES_BY_DIFFICULTY[diff];
    const sample = pool[Math.floor(Math.random() * pool.length)];
    setDrawnSample(sample.id);
    startSession(diff, sample.id);
    setTimeout(() => setStep(3), 700);
  };

  const handleSelectInstrument = (id: InstrumentId) => {
    setActiveInstrument(id);
    setStep(4);
  };

  const handleDetectionComplete = () => {
    setActiveInstrument(null);
    setStep(3);
    // 如果已经测过 ≥ 2 件仪器，提示可进入汇总
    if (session.instrumentsUsed.length >= 1) {
      setTimeout(() => setStep(5), 200);
    }
  };

  const allDone = session.instrumentsUsed.length >= 2;

  // 检测模式下打开演示，全屏渲染（覆盖 Stepper）
  if (step === 4 && activeInstrument && drawnSample) {
    const Demo =
      activeInstrument === 'refractometer'
        ? RefractometerDemo
        : activeInstrument === 'polariscope'
          ? PolariscopeDemo
          : SpectroscopeDemo;
    return (
      <Demo
        forcedSampleId={drawnSample}
        embedded
        onDetectionComplete={handleDetectionComplete}
      />
    );
  }

  const sample = drawnSample ? SAMPLES_BY_ID[drawnSample] : null;

  return (
    <div className="min-h-screen bg-brand-50/40">
      <Header
        title="检测流程"
        subtitle="实训演练"
        right={
          <Link to="/" className="btn-ghost text-xs">
            返回工作台
          </Link>
        }
      />

      {/* Stepper */}
      <div className="border-b border-line bg-white">
        <div className="mx-auto max-w-[1200px] px-10 py-6">
          <Stepper steps={STEPS} current={step} themeHex="#1f5ba8" />
        </div>
      </div>

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 px-10 py-8 lg:grid-cols-[1fr_320px]">
        <main className="space-y-6">
          {/* Step 1 */}
          {step === 1 && (
            <Card stepNo={1} title="选择检测难度">
              <p className="mb-4 text-sm text-ink-3">根据你的学习进度选择合适的难度级别。</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {(['beginner', 'intermediate', 'advanced'] as const).map((d) => {
                  const info = DIFFICULTY_INFO[d];
                  const count = SAMPLES_BY_DIFFICULTY[d].length;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handlePickDifficulty(d)}
                      className={clsx(
                        'flex flex-col gap-2 rounded-2xl border-2 p-5 text-left transition',
                        'hover:border-brand-300 hover:shadow-card',
                        session.difficulty === d ? 'border-brand bg-brand-50/50' : 'border-line bg-white',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl">
                          {info.emoji}
                        </div>
                        <Pill tone={info.tone}>{info.sub}</Pill>
                      </div>
                      <div className="font-display text-xl font-semibold">{info.title}</div>
                      <div className="text-xs text-ink-3">
                        包含 {count} 种宝石 · 预计 {d === 'beginner' ? '15–20' : d === 'intermediate' ? '25–35' : '40–60'} 分钟
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 rounded-lg bg-brand-50/60 px-4 py-2.5 text-xs text-brand-700">
                💡 难度越高，包含的宝石种类越多，检测特征也越复杂。
              </div>
            </Card>
          )}

          {/* Step 2: 抽样 */}
          {step >= 2 && (
            <Card stepNo={2} title="抽取未知样品" disabled={step < 2}>
              {!drawnSample ? (
                <div className="flex flex-col items-center justify-center gap-4 py-6">
                  <div className="text-sm text-ink-3">
                    系统将从【{DIFFICULTY_INFO[session.difficulty ?? 'beginner'].title}】难度样品池中随机抽取一个未知宝石。
                  </div>
                  <button
                    type="button"
                    onClick={handleDrawSample}
                    className="btn-primary px-6 py-2.5 text-sm"
                  >
                    🎲 抽取样品
                  </button>
                </div>
              ) : (
                <div className="animate-bounce-in relative flex items-center gap-6 overflow-hidden rounded-xl border-2 border-brand-300 p-4 shadow-[0_8px_30px_-8px_rgba(31,91,168,0.35)]">
                  {/* 渐变背景层 */}
                  <span
                    className="pointer-events-none absolute inset-0 -z-10"
                    style={{
                      background:
                        'linear-gradient(135deg, #f6f9fd 0%, #ffffff 50%, #eef4fb 100%)',
                    }}
                  />
                  {/* 左上"未知样品"角标 */}
                  <span className="absolute left-4 top-0 -translate-y-1/2 rounded-full bg-brand px-3 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white shadow-card">
                    未知样品
                  </span>

                  <div className="relative ml-2 mt-2">
                    <img
                      src={sample?.image}
                      alt=""
                      className="h-24 w-24 rounded-xl bg-white object-contain p-2 shadow-card ring-1 ring-line"
                      draggable={false}
                    />
                    <span className="absolute -right-2 -top-2 flex h-7 w-7 animate-soft-pulse items-center justify-center rounded-full bg-amber-400 text-base shadow-card">
                      ?
                    </span>
                  </div>
                  <div className="mt-2 flex-1">
                    <div className="font-display text-base font-semibold text-ink">
                      未知宝石样品
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-3">
                      <span>身份：未知</span>
                      <span>颜色：未知</span>
                      <span>形态：未知</span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={handleDrawSample}
                        className="btn-ghost text-xs"
                      >
                        🔄 换一个
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Step 3: 选择仪器 */}
          {step >= 3 && drawnSample && (
            <Card stepNo={3} title="选择检测仪器">
              <p className="mb-4 text-sm text-ink-3">
                建议至少使用两种仪器以获得可靠判定。已使用仪器会标记为绿色。
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {INSTRUMENT_LIST.map((it) => {
                  const used = session.instrumentsUsed.includes(it.id);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => handleSelectInstrument(it.id)}
                      className={clsx(
                        'group relative flex flex-col gap-2 rounded-2xl border-2 p-4 text-left transition-all',
                        used
                          ? 'border-emerald-400 bg-emerald-50/40'
                          : 'border-line bg-white hover:-translate-y-1 hover:border-brand-400 hover:shadow-lift',
                      )}
                    >
                      {used && (
                        <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-sm text-white shadow-card">
                          ✓
                        </span>
                      )}
                      <img
                        src={it.productImage}
                        alt={it.name}
                        className="h-24 w-full rounded-lg bg-brand-50/30 object-contain p-2 transition-transform group-hover:scale-105"
                        draggable={false}
                      />
                      <div className="flex items-center justify-between">
                        <div className="font-display text-base font-semibold text-ink">
                          {it.name}
                        </div>
                        <span
                          className="text-base opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100"
                          style={{ color: it.themeHex }}
                        >
                          →
                        </span>
                      </div>
                      <div className="text-xs text-ink-3">{it.intro.tagline}</div>
                    </button>
                  );
                })}
              </div>

              {session.instrumentsUsed.length > 0 && (
                <div className="mt-5 flex items-center justify-between rounded-xl bg-brand-50/60 px-4 py-3">
                  <div className="text-sm">
                    <span className="font-semibold text-brand-700">
                      已完成 {session.instrumentsUsed.length} / 3 项检测
                    </span>
                    <span className="ml-2 text-xs text-ink-3">
                      可继续使用其他仪器，或进入数据汇总
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(5)}
                    className="btn-primary text-xs"
                  >
                    进入数据汇总 →
                  </button>
                </div>
              )}
            </Card>
          )}

          {/* Step 5: 数据汇总 */}
          {step === 5 && drawnSample && (
            <Card stepNo={5} title="检测数据汇总">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <SummaryCard
                  instrumentId="refractometer"
                  title="折射仪数据"
                  used={session.instrumentsUsed.includes('refractometer')}
                  onJumpBack={handleSelectInstrument}
                  body={
                    <div className="space-y-1">
                      <DataLine
                        label="折射率（nD）"
                        value={
                          session.refractometer.riMin
                            ? session.refractometer.riMax !== null && session.refractometer.riMax !== session.refractometer.riMin
                              ? `${session.refractometer.riMin.toFixed(3)} – ${session.refractometer.riMax.toFixed(3)}`
                              : session.refractometer.riMin.toFixed(3)
                            : session.refractometer.notes.includes('> 1.780')
                              ? '> 1.780'
                            : '—'
                        }
                      />
                      <DataLine
                        label="双折射率"
                        value={
                          session.refractometer.birefringence !== null
                            ? formatDR(session.refractometer.birefringence)
                            : '—'
                        }
                      />
                      <DataLine
                        label="光性"
                        value={
                          session.refractometer.opticalCharacter
                            ? OPTICAL_LABEL[session.refractometer.opticalCharacter]
                            : '—'
                        }
                      />
                    </div>
                  }
                />
                <SummaryCard
                  instrumentId="polariscope"
                  title="偏光镜数据"
                  used={session.instrumentsUsed.includes('polariscope')}
                  onJumpBack={handleSelectInstrument}
                  body={
                    <div className="space-y-1">
                      <DataLine
                        label="正交现象"
                        value={
                          session.polariscope.phenomenon === 'four-bright-four-dark'
                            ? '四明四暗'
                            : session.polariscope.phenomenon === 'all-dark'
                              ? '全暗'
                              : session.polariscope.phenomenon === 'all-bright'
                                ? '全亮'
                                : '—'
                        }
                      />
                      <DataLine
                        label="光性判定"
                        value={
                          session.polariscope.notes
                            ? session.polariscope.notes
                            : session.polariscope.optical === 'isotropic'
                            ? '均质体'
                            : session.polariscope.optical === 'anisotropic'
                              ? '非均质体'
                              : session.polariscope.optical === 'aggregate'
                                ? '多晶质集合体'
                                : '—'
                        }
                      />
                    </div>
                  }
                />
                <SummaryCard
                  instrumentId="spectroscope"
                  title="分光镜数据"
                  used={session.instrumentsUsed.includes('spectroscope')}
                  onJumpBack={handleSelectInstrument}
                  body={
                    <div className="space-y-1">
                      <DataLine
                        label="标记吸收线"
                        value={
                          session.spectroscope.markedLines.length > 0
                            ? session.spectroscope.markedLines.map((w) => `${w}nm`).join(' / ')
                            : session.spectroscope.notes
                              ? session.spectroscope.notes
                            : '—'
                        }
                      />
                    </div>
                  }
                />
              </div>

              <div className="mt-6 flex items-center justify-between rounded-xl border border-line bg-white p-4">
                <div className="text-sm text-ink-2">
                  {allDone
                    ? '✓ 已完成至少两项检测，可以进入命名评估了'
                    : `还需完成 ${2 - session.instrumentsUsed.length} 项检测才建议进入评估`}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="btn-ghost text-xs"
                  >
                    继续检测其他仪器
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/assessment')}
                    disabled={!allDone}
                    className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    进入命名评估 →
                  </button>
                </div>
              </div>
            </Card>
          )}
        </main>

        {/* 侧边栏：当前样品 + 检测记录 */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-line bg-white p-4 shadow-soft">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-ink-4">
              当前样品
            </div>
            {sample ? (
              <div className="flex items-center gap-3">
                <img
                  src={sample.image}
                  alt=""
                  className="h-14 w-14 rounded-lg bg-brand-50/30 object-contain p-1"
                  draggable={false}
                />
                <div>
                  <div className="font-display text-sm font-semibold">未知样品</div>
                  <div className="text-[10px] text-ink-4">
                    难度：{DIFFICULTY_INFO[session.difficulty ?? 'beginner'].title}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-ink-3">— 尚未抽取 —</div>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-white p-4 shadow-soft">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-ink-4">
              检测进度
            </div>
            <div className="space-y-2">
              {INSTRUMENT_LIST.map((it) => {
                const used = session.instrumentsUsed.includes(it.id);
                return (
                  <div
                    key={it.id}
                    className="flex items-center justify-between rounded-lg bg-brand-50/30 px-3 py-2 text-xs"
                  >
                    <span>{it.name}</span>
                    {used ? (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        已完成
                      </span>
                    ) : (
                      <span className="text-ink-4">未检测</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Card({
  stepNo,
  title,
  disabled,
  children,
}: {
  stepNo: number;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={clsx(
        'rounded-3xl border bg-white p-6 shadow-soft',
        disabled ? 'border-line opacity-50' : 'border-line',
      )}
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white">
          {stepNo}
        </span>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SummaryCard({
  instrumentId,
  title,
  used,
  body,
  onJumpBack,
}: {
  instrumentId: InstrumentId;
  title: string;
  used: boolean;
  body: React.ReactNode;
  onJumpBack?: (id: InstrumentId) => void;
}) {
  const it = INSTRUMENTS[instrumentId];
  return (
    <div
      className={clsx(
        'group rounded-2xl border p-4 transition-all',
        used
          ? 'border-line bg-white shadow-soft hover:-translate-y-0.5 hover:shadow-card'
          : 'border-dashed border-line-2 bg-brand-50/30 hover:bg-brand-50/60',
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-sm font-semibold text-ink">{title}</span>
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-white shadow-soft transition-transform group-hover:scale-110"
          style={{ background: it.themeHex }}
        >
          <span className="text-xs">●</span>
        </span>
      </div>
      <div className="text-xs text-ink-2">
        {used ? (
          body
        ) : (
          <div className="flex flex-col items-start gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 ring-1 ring-amber-200">
              <span>⚠️</span> 尚未检测
            </span>
            {onJumpBack && (
              <button
                type="button"
                onClick={() => onJumpBack(instrumentId)}
                className="rounded-lg px-2 py-1 text-[11px] font-medium ring-1 ring-line-2 transition hover:bg-white"
                style={{ color: it.themeHex }}
              >
                ↩ 返回测量
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DataLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-ink-4">{label}</span>
      <span className="font-mono font-semibold text-ink">{value}</span>
    </div>
  );
}

// 让 ts 不警告 formatRI 未使用
void formatRI;
