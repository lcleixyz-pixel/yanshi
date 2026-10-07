import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '@/components/shared/Header';
import Pill from '@/components/shared/Pill';
import PracticeReport from '@/components/report/PracticeReport';
import { SAMPLES, SAMPLES_BY_DIFFICULTY, SAMPLES_BY_ID } from '@/data/samples';
import { computeScore } from '@/domain/assessment';
import { checkRI, formatRIReference } from '@/domain/refractometerAssessment';
import { useDetection } from '@/store/detectionStore';
import { useProgress } from '@/store/progressStore';
import { formatDR, formatRI, OPTICAL_LABEL } from '@/utils/format';
import clsx from '@/utils/clsx';

type Evidence = 'ri' | 'optical' | 'spectrum';

const EVIDENCE: Array<{ id: Evidence; title: string; instrument: 'refractometer' | 'polariscope' | 'spectroscope'; detail: string }> = [
  { id: 'ri', title: '折射率', instrument: 'refractometer', detail: '比较读数和候选宝石范围' },
  { id: 'optical', title: '光性现象', instrument: 'polariscope', detail: '辨认均质、非均质或集合体' },
  { id: 'spectrum', title: '吸收光谱', instrument: 'spectroscope', detail: '寻找具有区分力的吸收特征' },
];

export default function NamingAssessmentPage() {
  const navigate = useNavigate();
  const session = useDetection();
  const resetSession = useDetection((s) => s.resetSession);
  const recordAssessment = useDetection((s) => s.recordAssessment);
  const clearAssessment = useDetection((s) => s.clearAssessment);
  const pushDetection = useProgress((s) => s.pushDetection);

  const [selected, setSelected] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [confidence, setConfidence] = useState(70);
  const [showHint, setShowHint] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);

  const correctSample = session.sampleId ? SAMPLES_BY_ID[session.sampleId] : null;
  const assessment = session.assessment;
  const attempts = assessment?.attemptNumber ?? session.assessmentAttemptCount + 1;

  // 没有进行中的检测会话，引导回去
  useEffect(() => {
    if (!correctSample) {
      // 给一个温和提示，2s 后回工作台
      const t = setTimeout(() => navigate('/detection'), 2500);
      return () => clearTimeout(t);
    }
  }, [correctSample, navigate]);

  // 6 个候选项：正确答案 + 5 个干扰项（同难度池中随机）
  const options = useMemo(() => {
    if (!correctSample) return [];
    const pool = [
      ...SAMPLES_BY_DIFFICULTY[correctSample.difficulty],
      ...SAMPLES.filter((s) => s.id !== correctSample.id).slice(0, 8),
    ];
    const others = Array.from(
      new Set(pool.filter((s) => s.id !== correctSample.id).map((s) => s.id)),
    )
      .sort(() => Math.random() - 0.5)
      .slice(0, 5)
      .map((id) => SAMPLES_BY_ID[id]);
    const all = [correctSample, ...others].sort(() => Math.random() - 0.5);
    return all;
  }, [correctSample]);

  const answerId = assessment?.selectedSampleId ?? selected;
  const isCorrect = answerId !== null && answerId === correctSample?.id;

  const handleSubmit = () => {
    if (!selected || !evidence || !correctSample || !session.difficulty || assessment) return;
    const score = computeScore(
      isCorrect,
      session.difficulty,
      attempts,
      confidence,
      hintUsed,
    );
    const completedAt = Date.now();
    if (!recordAssessment({
      selectedSampleId: selected,
      evidence,
      confidence,
      hintUsed,
      attemptNumber: attempts,
      score,
      completedAt,
    })) return;
    pushDetection({
      id: `${completedAt}-${correctSample.id}-${attempts}`,
      sampleId: correctSample.id,
      difficulty: session.difficulty,
      userAnswer: SAMPLES_BY_ID[selected]?.name ?? null,
      correct: isCorrect,
      attempts,
      score,
      completedAt,
      evidence,
    });
  };

  const handleRetry = () => {
    clearAssessment();
    setSelected(null);
    setEvidence(null);
  };

  const handleNext = () => {
    resetSession();
    navigate('/detection');
  };

  if (!correctSample) {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-50/40">
        <div className="rounded-2xl bg-white p-8 text-center shadow-card">
          <div className="text-3xl">🤔</div>
          <h2 className="mt-2 font-display text-lg font-semibold">尚未开始检测</h2>
          <p className="mt-1 text-sm text-ink-3">即将带你回到检测流程…</p>
          <Link to="/detection" className="btn-primary mt-4 inline-block text-xs">
            立即跳转
          </Link>
        </div>
      </div>
    );
  }

  if (session.instrumentsUsed.length < 2 && !assessment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-50/40 px-4">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-card">
          <div className="text-3xl">🔎</div>
          <h2 className="mt-2 font-display text-lg font-semibold">检测数据尚不充分</h2>
          <p className="mt-2 text-sm leading-6 text-ink-3">请先完成至少两项仪器观察，再根据记录进行命名。</p>
          <Link to="/detection" className="btn-primary mt-5 inline-flex text-xs">返回检测流程</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="assessment-screen min-h-screen bg-brand-50/40">
      <Header
        title="命名评估"
        subtitle="实训系统"
        right={
          <div className="flex items-center gap-2 text-xs">
            <Pill tone="amber">⏱ 用时 {formatDuration(session.startedAt)}</Pill>
            <Pill tone="blue">尝试 {attempts}</Pill>
          </div>
        }
      />

      <div className="mx-auto max-w-[1100px] space-y-6 px-10 py-8">
        {/* Stage 1: 数据回顾 */}
        <section className="rounded-3xl border border-line bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white">
              1
            </span>
            <h2 className="font-display text-lg font-semibold">未知样品检测数据汇总</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <DataReviewCard title="折射仪数据" themeHex="#e8a93a" emoji="🔬">
              <Row
                label="折射率（nD）"
                value={
                  session.refractometer.riMin
                    ? session.refractometer.riMax !== null && session.refractometer.riMax !== session.refractometer.riMin
                      ? `${session.refractometer.riMin.toFixed(3)} – ${session.refractometer.riMax.toFixed(3)}`
                      : session.refractometer.riMin.toFixed(3)
                    : session.refractometer.notes.includes('> 1.780')
                      ? '> 1.780'
                    : '未测'
                }
                large
              />
              <Row
                label="双折射率"
                value={
                  session.refractometer.birefringence !== null
                    ? formatDR(session.refractometer.birefringence)
                    : '未测'
                }
              />
            </DataReviewCard>

            <DataReviewCard title="偏光镜数据" themeHex="#7c3aed" emoji="🔁">
              <Row
                label="光性"
                value={
                  session.polariscope.notes
                    ? session.polariscope.notes
                    : session.polariscope.optical === 'isotropic'
                    ? '均质体'
                    : session.polariscope.optical === 'anisotropic'
                      ? '非均质体'
                      : session.polariscope.optical === 'aggregate'
                        ? '多晶质集合体'
                        : '未测'
                }
                large
              />
              <Row
                label="正交现象"
                value={
                  session.polariscope.phenomenon === 'four-bright-four-dark'
                    ? '四明四暗'
                    : session.polariscope.phenomenon === 'all-dark'
                      ? '全暗'
                      : session.polariscope.phenomenon === 'all-bright'
                        ? '全亮'
                        : '未观察'
                }
              />
            </DataReviewCard>

            <DataReviewCard title="分光镜数据" themeHex="#0ea5e9" emoji="📈">
              <Row
                label="特征吸收（nm）"
                value={
                  session.spectroscope.markedLines.length > 0
                    ? session.spectroscope.markedLines.join(', ')
                    : session.spectroscope.notes
                      ? session.spectroscope.notes
                    : '未观察'
                }
                large
              />
            </DataReviewCard>
          </div>
          <div className="mt-4 rounded-lg bg-brand-50/60 px-4 py-2.5 text-xs text-brand-700">
            ℹ️ 请综合以上所有检测数据，结合宝石学知识进行分析判断。
          </div>
        </section>

        {/* Stage 2: 命名 */}
        {!assessment && (
          <section className="rounded-3xl border border-line bg-white p-6 shadow-soft">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white">
                  2
                </span>
                <h2 className="font-display text-lg font-semibold">请根据检测数据对样品进行命名</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowHint(!showHint);
                  setHintUsed(true);
                }}
                className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
              >
                💡 {showHint ? '隐藏提示' : '查看提示（-2 分）'}
              </button>
            </div>

            <fieldset className="mt-5 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
              <legend className="px-1 text-sm font-semibold text-brand-800">你命名时最依赖哪一项检测依据？</legend>
              <p className="mb-3 text-xs text-ink-3">先选依据，再提交判断；仅显示本次已使用的仪器。</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {EVIDENCE.filter((item) => session.instrumentsUsed.includes(item.instrument)).map((item) => (
                  <label key={item.id} className={clsx('flex cursor-pointer gap-2 rounded-lg border p-3 text-left transition-colors', evidence === item.id ? 'border-brand bg-white shadow-soft' : 'border-line bg-white/70 hover:border-brand-300')}>
                    <input type="radio" name="evidence" value={item.id} checked={evidence === item.id} onChange={() => setEvidence(item.id)} className="mt-0.5 accent-brand" />
                    <span><strong className="block text-xs text-ink">{item.title}</strong><span className="mt-1 block text-[11px] leading-4 text-ink-3">{item.detail}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>

            {showHint && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-800">
                <strong>💡 鉴定线索：</strong>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {correctSample.detectionTips.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 中央未知样品 */}
            <div className="mb-5 flex justify-center">
              <div className="relative">
                <img
                  src={correctSample.image}
                  alt=""
                  className="h-28 w-28 rounded-full bg-brand-50/30 object-contain p-2 ring-4 ring-brand-100"
                  draggable={false}
                />
                <span className="absolute -right-1 -top-1 flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-xl shadow-card">
                  ?
                </span>
              </div>
            </div>

            {/* 6 选项 */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {options.map((opt) => {
                const isSelected = selected === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid="answer-option"
                    data-sample-id={opt.id}
                    onClick={() => setSelected(opt.id)}
                    className={clsx(
                      'group relative flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all duration-200',
                      isSelected
                        ? 'border-brand shadow-lift'
                        : 'border-line bg-white hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card',
                    )}
                    style={
                      isSelected
                        ? {
                            background:
                              'linear-gradient(135deg, #dbe8f6 0%, #eef4fb 60%, #ffffff 100%)',
                          }
                        : undefined
                    }
                  >
                    {isSelected && (
                      <span className="animate-bounce-in absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-base font-bold text-white shadow-card">
                        ✓
                      </span>
                    )}
                    <img
                      src={opt.image}
                      alt={opt.name}
                      className={clsx(
                        'h-12 w-12 rounded-lg bg-brand-50/30 object-contain p-1 transition-transform',
                        isSelected
                          ? 'scale-110 ring-2 ring-brand-200'
                          : 'group-hover:scale-105',
                      )}
                      draggable={false}
                    />
                    <div className="flex-1">
                      <div
                        className={clsx(
                          'font-display text-sm transition-colors',
                          isSelected ? 'font-bold text-brand-700' : 'font-semibold text-ink',
                        )}
                      >
                        {opt.name}
                      </div>
                      <div className="text-[10px] text-ink-4">{opt.category}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 置信度 */}
            {(() => {
              const confTone =
                confidence >= 70
                  ? { label: '非常确定', color: '#22a86a', bg: 'bg-emerald-50' }
                  : confidence >= 40
                    ? { label: '一般', color: '#f59e0b', bg: 'bg-amber-50' }
                    : { label: '不太确定', color: '#d35454', bg: 'bg-rose-50' };
              return (
                <div className={clsx('mt-5 rounded-xl p-4 transition-colors', confTone.bg)}>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-ink-3">你的确信程度</span>
                    <span
                      className="rounded-full px-2.5 py-0.5 font-mono text-sm font-bold text-white shadow-soft transition-colors"
                      style={{ background: confTone.color }}
                    >
                      {confidence}% · {confTone.label}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={confidence}
                    onChange={(e) => setConfidence(parseInt(e.target.value))}
                    className="w-full transition-all"
                    style={{ accentColor: confTone.color }}
                  />
                  <div className="flex justify-between text-[10px] font-medium text-ink-4">
                    <span>不确定</span>
                    <span>一般</span>
                    <span>非常确定</span>
                  </div>
                </div>
              );
            })()}

            <div className="mt-5 flex items-center justify-between">
              <Link to="/detection" className="btn-ghost text-xs">
                ← 返回继续检测
              </Link>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!selected || !evidence}
                className="btn-primary px-6 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ✈ 提交答案
              </button>
            </div>
          </section>
        )}

        {/* Stage 3: 反馈 */}
        {assessment && correctSample && (
          <section
            className={clsx(
              'animate-fade-in-up relative overflow-hidden rounded-3xl border-2 p-6 shadow-card',
              isCorrect ? 'border-emerald-300 bg-emerald-50/40' : 'border-rose-300 bg-rose-50/40',
            )}
          >
            {/* 答对时的 Sparkle 装饰 */}
            {isCorrect && (
              <>
                <span
                  className="pointer-events-none absolute left-[8%] top-6 text-3xl"
                  style={{ animation: 'sparkle 1.4s ease-in-out infinite', animationDelay: '0s' }}
                >
                  ✨
                </span>
                <span
                  className="pointer-events-none absolute right-[10%] top-12 text-2xl"
                  style={{ animation: 'sparkle 1.4s ease-in-out infinite', animationDelay: '0.3s' }}
                >
                  ⭐
                </span>
                <span
                  className="pointer-events-none absolute left-[15%] top-32 text-xl"
                  style={{ animation: 'sparkle 1.4s ease-in-out infinite', animationDelay: '0.6s' }}
                >
                  ✨
                </span>
                <span
                  className="pointer-events-none absolute right-[6%] top-28 text-2xl"
                  style={{ animation: 'sparkle 1.4s ease-in-out infinite', animationDelay: '0.9s' }}
                >
                  💫
                </span>
              </>
            )}

            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white">
                3
              </span>
              <h2 className="font-display text-lg font-semibold">反馈结果</h2>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <div className="flex items-center gap-3">
                  <span
                    className={clsx(
                      'flex h-14 w-14 items-center justify-center rounded-full text-3xl text-white',
                      isCorrect
                        ? 'animate-bounce-in bg-emerald-500 shadow-[0_8px_24px_-4px_rgba(34,168,106,0.6)]'
                        : 'animate-shake bg-rose-500 shadow-[0_8px_24px_-4px_rgba(211,84,84,0.5)]',
                    )}
                  >
                    {isCorrect ? '✓' : '✕'}
                  </span>
                  <div>
                    <div
                      className={clsx(
                        'font-display text-2xl font-semibold',
                        isCorrect ? 'animate-fade-in-up' : '',
                      )}
                    >
                      {isCorrect ? '回答正确！🎉' : '回答错误'}
                    </div>
                    <div className="text-sm text-ink-3">
                      {isCorrect ? '正确答案：' : '正确答案应为：'}
                      <span className="font-semibold text-brand-700">{correctSample.name}</span>
                    </div>
                  </div>
                </div>

                <div
                  className={clsx(
                    'animate-scale-in mt-3 inline-block rounded-full px-4 py-1.5 font-mono text-lg font-bold shadow-soft',
                    isCorrect
                      ? 'bg-emerald-500 text-white'
                      : 'bg-rose-100 text-rose-700',
                  )}
                  style={{ animationDelay: '0.3s' }}
                >
                  {assessment.score > 0 ? '+' : ''}
                  {assessment.score} 分
                </div>

                <div className="mt-4 rounded-xl border border-brand-200 bg-white px-4 py-3 text-xs leading-6 text-ink-2">
                  <strong className="text-brand-800">你的主要判断依据：</strong>{EVIDENCE.find((item) => item.id === assessment.evidence)?.title}
                  <span className="ml-1 text-ink-3">请对照右侧特征表，复盘这项依据是否足以区分候选宝石。</span>
                  {assessment.attemptNumber > 1 && <p className="text-amber-700">本次为答案揭晓后的复盘练习，不再计分或提升掌握度。</p>}
                </div>

                <div className="mt-5">
                  <h4 className="mb-2 text-sm font-semibold text-ink">为什么是 {correctSample.name}？</h4>
                  <ul className="space-y-2">
                    {correctSample.detectionTips.map((t, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs"
                      >
                        <span
                          className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: '#1f5ba8' }}
                        />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* 特征对比表 */}
              <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
                <div className="mb-3 text-sm font-semibold text-ink">关键特征对比</div>
                <table className="w-full border-separate border-spacing-y-1.5 text-xs">
                  <thead>
                    <tr className="text-ink-4">
                      <th className="pb-2 pl-2 text-left font-normal">特征</th>
                      <th className="pb-2 text-left font-normal">你的检测</th>
                      <th className="pb-2 text-left font-normal">标准值</th>
                      <th className="pb-2 pr-2 text-right font-normal">结果</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    <CompareRow
                      feature="折射率"
                      userValue={
                        session.refractometer.riMin
                          ? session.refractometer.riMax && session.refractometer.riMax !== session.refractometer.riMin
                            ? `${session.refractometer.riMin} – ${session.refractometer.riMax}`
                            : `${session.refractometer.riMin}`
                          : session.refractometer.notes.includes('> 1.780')
                            ? '> 1.780'
                          : '—'
                      }
                      standardValue={formatRIReference(correctSample.characteristics.refractiveIndex, session.refractometer.method)}
                      ok={checkRI(
                        session.refractometer.riMin,
                        session.refractometer.riMax,
                        correctSample.characteristics.refractiveIndex,
                        session.refractometer.method,
                      )}
                      onRetry={() => navigate('/detection')}
                    />
                    <CompareRow
                      feature="光性"
                      userValue={
                        session.polariscope.optical === 'isotropic'
                          ? '均质体'
                          : session.polariscope.optical === 'anisotropic'
                            ? '非均质体'
                            : session.polariscope.optical === 'aggregate'
                              ? '多晶质集合体'
                              : '—'
                      }
                      standardValue={OPTICAL_LABEL[correctSample.characteristics.opticalCharacter]}
                      ok={
                        session.polariscope.optical === null
                          ? null
                          : checkOptical(
                              session.polariscope.optical,
                              correctSample.characteristics.opticalCharacter,
                            )
                      }
                      onRetry={() => navigate('/detection')}
                    />
                    <CompareRow
                      feature="特征吸收"
                      userValue={
                        session.spectroscope.markedLines.length > 0
                          ? session.spectroscope.markedLines.join(',') + 'nm'
                          : session.spectroscope.notes
                            ? session.spectroscope.notes
                          : '—'
                      }
                      standardValue={
                        correctSample.spectrum.features.length > 0
                          ? correctSample.spectrum.features
                              .filter((f) => f.intensity === 'strong')
                              .map((f) => `${f.wavelength}nm`)
                              .join(',') || '无显著'
                          : '无显著'
                      }
                      ok={null}
                      onRetry={
                        session.spectroscope.markedLines.length === 0 && !session.spectroscope.notes
                          ? () => navigate('/detection')
                          : undefined
                      }
                    />
                  </tbody>
                </table>

                {!isCorrect && answerId && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <strong>你可能混淆的原因：</strong>
                    <p className="mt-1">{generateConfusionAnalysis(answerId, correctSample.id)}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
              <Link to="/" className="btn-ghost text-xs">
                ← 返回工作台
              </Link>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => window.print()} className="btn-ghost text-xs">
                  打印练习记录
                </button>
                {!isCorrect && (
                  <button type="button" onClick={handleRetry} className="btn-ghost text-xs">
                    🔄 原题复盘（不计分）
                  </button>
                )}
                <button type="button" onClick={handleNext} className="btn-primary text-xs">
                  检测下一个样品 →
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
      {assessment && correctSample && <PracticeReport session={session} sample={correctSample} attempt={assessment} />}
    </div>
  );
}

// ===== 子组件 =====
function DataReviewCard({
  title,
  themeHex,
  emoji,
  children,
}: {
  title: string;
  themeHex: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-display text-sm font-semibold">{title}</span>
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-base"
          style={{ background: `${themeHex}22` }}
        >
          {emoji}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-4">{label}</div>
      <div
        className={clsx(
          'mt-0.5 font-mono font-semibold text-ink',
          large ? 'text-xl' : 'text-sm',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function CompareRow({
  feature,
  userValue,
  standardValue,
  ok,
  onRetry,
}: {
  feature: string;
  userValue: string;
  standardValue: string;
  ok: boolean | null;
  onRetry?: () => void;
}) {
  const notTested = userValue === '—';
  const tone = notTested
    ? 'bg-amber-50/80 ring-amber-200'
    : ok === true
      ? 'bg-emerald-50/80 ring-emerald-200'
      : ok === false
        ? 'bg-rose-50/80 ring-rose-200'
        : 'bg-slate-50/60 ring-line';
  return (
    <tr className="font-mono text-xs">
      <td
        className={clsx('rounded-l-lg py-2 pl-3 font-sans text-ink-3 ring-1', tone)}
        style={{ ringInset: 'inset' } as React.CSSProperties}
      >
        {feature}
      </td>
      <td className={clsx('py-2 ring-1 ring-l-0', tone)}>
        {notTested && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-full bg-amber-200/60 px-2 py-0.5 text-[10px] font-semibold text-amber-800 transition hover:bg-amber-300/70"
          >
            ↩ 返回测量
          </button>
        ) : (
          <span className={notTested ? 'italic text-amber-700' : 'text-ink'}>{userValue}</span>
        )}
      </td>
      <td className={clsx('py-2 text-ink ring-1 ring-l-0', tone)}>{standardValue}</td>
      <td className={clsx('rounded-r-lg py-2 pr-3 text-right ring-1 ring-l-0', tone)}>
        {notTested ? (
          <span className="text-amber-600">—</span>
        ) : ok === null ? (
          <span className="text-ink-4">—</span>
        ) : ok ? (
          <span className="font-bold text-emerald-600">✓</span>
        ) : (
          <span className="font-bold text-rose-500">✕</span>
        )}
      </td>
    </tr>
  );
}

// ===== 工具函数 =====
function formatDuration(start: number | null): string {
  if (!start) return '00:00';
  const sec = Math.floor((Date.now() - start) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function checkOptical(
  user: import('@/store/detectionStore').PolariscopeData['optical'],
  standard: import('@/data/types').OpticalCharacter,
): boolean {
  if (!user) return false;
  if (standard === 'isotropic') return user === 'isotropic';
  if (standard === 'aggregate') return user === 'aggregate';
  return user === 'anisotropic';
}

function generateConfusionAnalysis(userId: string, correctId: string): string {
  const u = SAMPLES_BY_ID[userId];
  const c = SAMPLES_BY_ID[correctId];
  if (!u || !c) return '请仔细对比检测数据，特别关注折射率和光性两个核心指标的差异。';
  const reasons: string[] = [];
  if (u.characteristics.opticalCharacter !== c.characteristics.opticalCharacter) {
    reasons.push(
      `${u.name}是${OPTICAL_LABEL[u.characteristics.opticalCharacter]}，而${c.name}是${OPTICAL_LABEL[c.characteristics.opticalCharacter]}`,
    );
  }
  if (
    typeof u.characteristics.refractiveIndex !== 'string' &&
    typeof c.characteristics.refractiveIndex !== 'string'
  ) {
    const um =
      typeof u.characteristics.refractiveIndex === 'number'
        ? u.characteristics.refractiveIndex
        : (u.characteristics.refractiveIndex[0] + u.characteristics.refractiveIndex[1]) / 2;
    const cm =
      typeof c.characteristics.refractiveIndex === 'number'
        ? c.characteristics.refractiveIndex
        : (c.characteristics.refractiveIndex[0] + c.characteristics.refractiveIndex[1]) / 2;
    if (Math.abs(um - cm) > 0.05) {
      reasons.push(
        `折射率差异显著：${u.name} ≈ ${um.toFixed(2)}，${c.name} ≈ ${cm.toFixed(2)}`,
      );
    }
  }
  if (reasons.length === 0) {
    reasons.push(
      `两者外观或部分特征相似，但${c.name}的特征光谱和${u.name}有明显不同，建议下次重点关注分光镜数据`,
    );
  }
  return reasons.join('；') + '。';
}
