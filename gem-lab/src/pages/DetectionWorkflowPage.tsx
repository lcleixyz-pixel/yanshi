import { lazy, Suspense, useState } from 'react';
import { reactionLabel } from '@/domain/polariscopeRules';
import { Link, useNavigate } from 'react-router-dom';
import Header from '@/components/shared/Header';
import Stepper from '@/components/workflow/Stepper';
import Pill from '@/components/shared/Pill';
import RefractometerDemo from '@/components/refractometer/RefractometerDemo';
import PolariscopeDemo from '@/components/polariscope/PolariscopeDemo';
// 偏光镜检测默认使用 3D；三维依赖按需加载，WebGL 不可用或加载失败时回退到 2D 检测模式。
const PolariscopeDetection3D = lazy(() => import('@/components/polariscope3d/PolariscopeDetection3D'));
const SpectroscopeDetectionChallenge = lazy(() => import('@/components/sim/spectroscope/SpectroscopeDetectionChallenge'));
const RefractometerDetectionChallenge = lazy(() => import('@/components/sim/refractometer/RefractometerDetectionChallenge'));
function supportsWebGL() {
  try { const canvas = document.createElement('canvas'); return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl')); } catch { return false; }
}
import SpectroscopeDemo from '@/components/spectroscope/SpectroscopeDemo';
import { INSTRUMENT_LIST, INSTRUMENTS } from '@/data/instruments';
import { SAMPLES_BY_DIFFICULTY, SAMPLES_BY_ID } from '@/data/samples';
import type { Difficulty, InstrumentId } from '@/data/types';
import { selectPracticeSample } from '@/domain/practice';
import { countValidObservations, isLegacyDetectionSample, isSpectroscopeObservationPending, useDetection } from '@/store/detectionStore';
import { useProgress } from '@/store/progressStore';
import { formatDR, OPTICAL_LABEL } from '@/utils/format';
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
  const history = useProgress((s) => s.detectionHistory);
  const mastery = useProgress((s) => s.sampleMastery);
  const chooseDifficulty = useDetection((s) => s.chooseDifficulty);
  const startSession = useDetection((s) => s.startSession);
  const resetSession = useDetection((s) => s.resetSession);
  const legacySample = isLegacyDetectionSample(session.sampleId);
  const validObservationCount = countValidObservations(session);
  const spectrumUnverified = isSpectroscopeObservationPending(session);

  const [step, setStep] = useState(() =>
    legacySample ? 5 : session.sampleId ? (session.instrumentsUsed.length > 0 ? 5 : 3) : session.difficulty ? 2 : 1,
  );
  const [activeInstrument, setActiveInstrument] = useState<InstrumentId | null>(null);
  const drawnSample = session.sampleId;

  const handlePickDifficulty = (d: Difficulty) => {
    chooseDifficulty(d);
    setActiveInstrument(null);
    setStep(2);
  };

  const handleDrawSample = () => {
    const diff = session.difficulty;
    if (!diff) return;
    if (drawnSample && session.instrumentsUsed.length > 0 &&
      !window.confirm('换样会清空本次已记录的检测数据。确定换一个样品吗？')) return;
    const pool = SAMPLES_BY_DIFFICULTY[diff];
    const sample = selectPracticeSample(pool, history, drawnSample, Math.random, mastery);
    if (!sample) return;
    startSession(diff, sample.id);
    setStep(3);
  };

  const handleSelectInstrument = (id: InstrumentId) => {
    if (legacySample) return;
    setActiveInstrument(id);
    setStep(4);
  };

  const [polariscope2D, setPolariscope2D] = useState(() => !supportsWebGL());
  const [spectroscope2D, setSpectroscope2D] = useState(() => !supportsWebGL());
  const [refractometer2D, setRefractometer2D] = useState(() => !supportsWebGL());
  const handleDetectionComplete = () => {
    setActiveInstrument(null);
    setStep(countValidObservations(useDetection.getState()) >= 2 ? 5 : 3);
  };

  const handleReset = () => {
    if (drawnSample && !window.confirm(legacySample
      ? '重新练习将清空这次旧版会话的检测记录；历史成绩仍保留。确定使用已拆分的新样品重新开始吗？'
      : '确定清空当前检测并重新开始吗？')) return;
    resetSession();
    setActiveInstrument(null);
    setStep(1);
  };

  const allDone = validObservationCount >= 2;

  // 检测模式下打开演示，全屏渲染（覆盖 Stepper）
  if (step === 4 && activeInstrument === 'polariscope' && drawnSample && !polariscope2D) {
    return (
      <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-ink-3">正在载入 3D 偏光镜…</div>}>
        <PolariscopeDetection3D sampleId={drawnSample} onDetectionComplete={handleDetectionComplete} onUse2D={() => setPolariscope2D(true)} />
      </Suspense>
    );
  }
  if (step === 4 && activeInstrument === 'spectroscope' && drawnSample && !spectroscope2D) {
    return (
      <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-ink-3">正在载入分光镜三维工作台…</div>}>
        <SpectroscopeDetectionChallenge sampleId={drawnSample} onDetectionComplete={handleDetectionComplete} onUse2D={() => setSpectroscope2D(true)} />
      </Suspense>
    );
  }
  // 折射仪检测默认使用三维操作台；三维依赖按需加载，WebGL 不可用或加载失败时回退到 2D 检测模式。
  if (step === 4 && activeInstrument === 'refractometer' && drawnSample && !refractometer2D) {
    return (
      <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-ink-3">正在载入折射仪三维操作台…</div>}>
        <RefractometerDetectionChallenge sampleId={drawnSample} onDetectionComplete={handleDetectionComplete} onUse2D={() => setRefractometer2D(true)} />
      </Suspense>
    );
  }
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
        right={<div className="flex flex-wrap gap-2">
          {session.difficulty && <button type="button" onClick={handleReset} className="btn-ghost text-xs">重新开始</button>}
          <Link to="/" className="btn-ghost text-xs">返回工作台</Link>
        </div>}
      />

      {/* Stepper */}
      <div className="border-b border-line bg-white">
        <div className="mx-auto max-w-[1200px] overflow-x-auto px-4 py-6 sm:px-8 lg:px-10">
          <Stepper steps={STEPS} current={step} themeHex="#1f5ba8" />
        </div>
      </div>

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_320px] lg:px-10">
        <main className="space-y-6">
          {legacySample && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5" data-testid="legacy-sample-notice">
              <h2 className="font-semibold text-amber-900">旧版石榴石记录已保留</h2>
              <p className="mt-2 text-sm leading-6 text-amber-900">旧版混合数据已拆分为铁铝榴石和镁铝榴石。本次记录仅供查看；已有评估可复盘，尚未评估的记录不再评分，也不会转为新样品的掌握度。</p>
              <button type="button" onClick={handleReset} className="btn-ghost mt-3 text-xs">使用新样品重新练习</button>
            </section>
          )}
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
                      data-testid={`difficulty-${d}`}
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
          {step >= 2 && !legacySample && (
            <Card stepNo={2} title="抽取未知样品" disabled={step < 2}>
              {!drawnSample ? (
                <div className="flex flex-col items-center justify-center gap-4 py-6">
                  <div className="text-sm text-ink-3">
                    系统将从【{DIFFICULTY_INFO[session.difficulty ?? 'beginner'].title}】样品池抽取一个未知宝石，优先复习未测和答错的样品。
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
          {step >= 3 && drawnSample && !legacySample && (
            <Card stepNo={3} title="选择检测仪器">
              <p className="mb-4 text-sm text-ink-3">
                请完成至少两项有效仪器观察再进入命名评估。待核定的教学谱只保留尝试记录，不计入有效观察。
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {INSTRUMENT_LIST.map((it) => {
                  const used = session.instrumentsUsed.includes(it.id);
                  const pending = used && it.id === 'spectroscope' && spectrumUnverified;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => handleSelectInstrument(it.id)}
                      className={clsx(
                        'group relative flex flex-col gap-2 rounded-2xl border-2 p-4 text-left transition-all',
                        pending ? 'border-amber-300 bg-amber-50/40' : used
                          ? 'border-emerald-400 bg-emerald-50/40'
                          : 'border-line bg-white hover:-translate-y-1 hover:border-brand-400 hover:shadow-lift',
                      )}
                    >
                      {used && !pending && (
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
                      {pending && <p className="text-xs text-amber-800">已记录尝试 · 教学谱图待核定</p>}
                    </button>
                  );
                })}
              </div>

              {session.instrumentsUsed.length > 0 && (
                <div className="mt-5 flex items-center justify-between rounded-xl bg-brand-50/60 px-4 py-3">
                  <div className="text-sm">
                    <span className="font-semibold text-brand-700">
                      已完成 {validObservationCount} / 3 项有效观察
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
                  onJumpBack={legacySample ? undefined : handleSelectInstrument}
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
                  onJumpBack={legacySample ? undefined : handleSelectInstrument}
                  body={
                    <div className="space-y-1">
                      <DataLine
                        label="正交现象"
                        value={
                          reactionLabel(session.polariscope.phenomenon, '—')
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
                  onJumpBack={legacySample ? undefined : handleSelectInstrument}
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

              {legacySample && (
                <div className="mt-4 space-y-2 rounded-xl bg-brand-50/50 p-4 text-xs leading-6" data-testid="legacy-record-details">
                  <p>记录样品：{sample?.name}；开始时间：{session.startedAt ? new Date(session.startedAt).toLocaleString('zh-CN') : '未记录'}；已评估次数：{session.assessmentAttemptCount}</p>
                  <p>折射仪：方法 {session.refractometer.method === 'facet' ? '刻面法' : session.refractometer.method === 'spot' ? '点测法' : '未记录'}；备注：{session.refractometer.notes || '无'}</p>
                  <p>偏光镜：旋转 {session.polariscope.rotation}°；备注：{session.polariscope.notes || '无'}</p>
                  <p>分光镜：方法 {session.spectroscope.method === 'transmission' ? '透射法' : session.spectroscope.method === 'internal-reflection' ? '内反射法' : session.spectroscope.method === 'surface-reflection' ? '表面反射法' : '未记录'}；吸收带：{session.spectroscope.bandRanges.map((band) => `${band.start}–${band.end} nm`).join(' / ') || '未标记'}；备注：{session.spectroscope.notes || '无'}</p>
                </div>
              )}

              <div className="mt-6 flex items-center justify-between rounded-xl border border-line bg-white p-4">
                <div className="text-sm text-ink-2">
                  {legacySample ? '旧版记录仅供查看，不再产生新的评分或掌握度。' : allDone
                    ? '✓ 已完成至少两项有效观察，可以进入命名评估了'
                    : `还需完成 ${2 - validObservationCount} 项有效观察才能进入评估`}
                  {!legacySample && spectrumUnverified && session.instrumentsUsed.includes('spectroscope') && (
                    <p className="mt-1 text-xs text-amber-800">本次方法的教学谱图未核定：已保留分光镜尝试记录，不计入有效观察。</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {!legacySample && <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="btn-ghost text-xs"
                  >
                    继续检测其他仪器
                  </button>}
                  <button
                    type="button"
                    onClick={() => navigate('/assessment')}
                    disabled={legacySample ? !session.assessment : !allDone}
                    className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {legacySample ? '查看已有评估 →' : '进入命名评估 →'}
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
                const pending = used && it.id === 'spectroscope' && spectrumUnverified;
                return (
                  <div
                    key={it.id}
                    className="flex items-center justify-between rounded-lg bg-brand-50/30 px-3 py-2 text-xs"
                  >
                    <span>{it.name}</span>
                    {pending ? <span className="text-amber-800">已记录，待核定</span> : used ? (
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
