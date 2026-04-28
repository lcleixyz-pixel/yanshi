import { useState } from 'react';
import DemoLayout, { type DemoMode } from '@/components/demo/DemoLayout';
import StepGuide, { type DemoStep } from '@/components/demo/StepGuide';
import SpectrumStrip from '@/components/spectroscope/SpectrumStrip';
import { INSTRUMENTS } from '@/data/instruments';
import { SAMPLES, SAMPLES_BY_ID } from '@/data/samples';
import { useDetection } from '@/store/detectionStore';
import { useProgress } from '@/store/progressStore';
import clsx from '@/utils/clsx';

type StepId = 'place' | 'align' | 'tune' | 'observe' | 'record';
const ORDER: StepId[] = ['place', 'align', 'tune', 'observe', 'record'];
const META: Record<StepId, { iconId: string; title: string; tip: string }> = {
  place: { iconId: 'place-sample', title: '放置样品', tip: '点击样品台放置样品' },
  align: { iconId: 'align', title: '调整光源对准样品', tip: '点击"光源对准"按钮' },
  tune: { iconId: 'focus', title: '调节狭缝与焦距获得清晰光谱', tip: '使用滑块调节' },
  observe: { iconId: 'observe', title: '观察并记录吸收光谱特征', tip: '点击光谱条标记吸收线' },
  record: { iconId: 'record', title: '保存数据', tip: '提交所有标记' },
};

interface DemoState {
  sampleOn: boolean;
  aligned: boolean;
  tuned: boolean;
  observed: boolean;
  recorded: boolean;
}
const INITIAL: DemoState = {
  sampleOn: false,
  aligned: false,
  tuned: false,
  observed: false,
  recorded: false,
};

export default function SpectroscopeDemo({
  forcedSampleId,
  embedded = false,
  onDetectionComplete,
}: {
  forcedSampleId?: string;
  embedded?: boolean;
  onDetectionComplete?: () => void;
}) {
  const instrument = INSTRUMENTS.spectroscope;
  const [mode, setMode] = useState<DemoMode>(embedded ? 'detection' : 'learning');
  const [state, setState] = useState<DemoState>(INITIAL);
  const [slitWidth, setSlitWidth] = useState(0.5);
  const [focus, setFocus] = useState(0.5);
  const [marks, setMarks] = useState<number[]>([]);

  const [learningSampleId, setLearningSampleId] = useState('ruby');
  const sampleId = forcedSampleId ?? learningSampleId;
  const sample = SAMPLES_BY_ID[sampleId];
  const features = sample?.spectrum.features ?? [];

  const setSpectroscopeData = useDetection((s) => s.setSpectroscope);
  const markInstrument = useDetection((s) => s.markInstrument);
  const markDemoComplete = useProgress((s) => s.markDemoComplete);

  const stepsData: DemoStep[] = ORDER.map((id, i) => ({
    id: i + 1,
    iconId: META[id].iconId,
    title: META[id].title,
    done: isDone(id, state),
    current: id === currentStep(state),
  }));
  const tip = currentStep(state) ? META[currentStep(state)!].tip : '✓ 已完成观察';
  const completedCount = ORDER.filter((id) => isDone(id, state)).length;
  const progress = (completedCount / ORDER.length) * 100;

  // 调节合格判定：focus 接近 0.5、slit 在合理范围内
  const focusOk = Math.abs(focus - 0.5) < 0.12;
  const slitOk = slitWidth >= 0.3 && slitWidth <= 0.65;
  const tuneScore = (focusOk ? 1 : 0) + (slitOk ? 1 : 0);

  const handleAddMark = (wl: number) => {
    if (!state.sampleOn || !state.aligned) return;
    setMarks((m) => (m.includes(wl) ? m : [...m, wl].sort((a, b) => b - a)));
    if (!state.observed && state.tuned) setState((s) => ({ ...s, observed: true }));
  };
  const handleRemoveMark = (wl: number) => setMarks((m) => m.filter((x) => x !== wl));

  const handleReset = () => {
    setState(INITIAL);
    setMarks([]);
    setSlitWidth(0.5);
    setFocus(0.5);
  };

  const handleSave = () => {
    if (mode === 'detection') {
      setSpectroscopeData({ markedLines: marks, bandRanges: [] });
      markInstrument('spectroscope');
      onDetectionComplete?.();
    }
    setState((s) => ({ ...s, recorded: true }));
    markDemoComplete({ instrumentId: 'spectroscope', mode, completedAt: Date.now() });
  };

  const showSpectrum = state.sampleOn && state.aligned;
  const spectrumReady = showSpectrum && state.tuned;

  return (
    <DemoLayout
      instrument={instrument}
      mode={mode}
      onModeChange={setMode}
      progressPercent={progress}
      detectionLocked={embedded}
      bottomTip={tip}
      leftSlot={
        <div className="relative h-full w-full">
          <div className="mx-auto flex h-full max-w-[820px] items-center justify-center px-6">
            <div className="relative aspect-[4/3] w-full max-w-[660px]">
              <img
                src={instrument.productImage}
                alt={instrument.name}
                className="absolute inset-[10%] h-[80%] w-[80%] select-none object-contain"
                style={{ transform: 'rotate(-15deg)' }}
                draggable={false}
              />

              {/* 光路示意（光源 → 样品 → 入口） */}
              <div className="pointer-events-none absolute left-0 top-1/2 flex w-[40%] -translate-y-1/2 items-center gap-2 px-3">
                <span
                  className={clsx(
                    'inline-flex h-9 w-9 items-center justify-center rounded-full text-lg shadow-card',
                    'bg-gradient-to-br from-amber-200 to-amber-500',
                    state.aligned && 'animate-soft-pulse',
                  )}
                  title="光源"
                >
                  💡
                </span>
                <span
                  className={clsx(
                    'h-0.5 flex-1 rounded',
                    state.aligned ? 'bg-amber-300' : 'bg-line-2',
                  )}
                />
                <span
                  className={clsx(
                    'inline-flex h-9 w-9 items-center justify-center rounded-lg text-base shadow-card transition',
                    state.sampleOn ? 'bg-pink-100 ring-2 ring-pink-300' : 'bg-line',
                  )}
                  title="样品台"
                >
                  💎
                </span>
                <span
                  className={clsx(
                    'h-0.5 flex-1 rounded',
                    state.aligned && state.sampleOn ? 'bg-amber-300' : 'bg-line-2',
                  )}
                />
              </div>

              {/* 样品台按钮 */}
              <button
                type="button"
                onClick={() => setState((s) => ({ ...s, sampleOn: !s.sampleOn }))}
                className="absolute left-[18%] top-[55%] flex h-12 w-12 items-center justify-center rounded-full border-2 border-pink-400 bg-pink-100/70 text-2xl shadow-card transition hover:scale-110"
              >
                {state.sampleOn ? '💎' : '＋'}
              </button>
              <span className="pointer-events-none absolute left-[12%] top-[72%] rounded-lg border border-line-2 bg-white/90 px-2 py-1 text-[11px] font-medium text-ink shadow-card">
                ② 样品台
              </span>

              {/* 光源对准按钮 */}
              <button
                type="button"
                onClick={() => state.sampleOn && setState((s) => ({ ...s, aligned: !s.aligned }))}
                disabled={!state.sampleOn}
                className={clsx(
                  'absolute left-[40%] top-[28%] rounded-lg px-3 py-1.5 text-xs font-medium shadow-card transition',
                  state.aligned
                    ? 'bg-emerald-500 text-white'
                    : state.sampleOn
                      ? 'bg-white text-ink ring-1 ring-line-2 hover:bg-brand-50'
                      : 'cursor-not-allowed bg-line text-ink-4',
                )}
              >
                {state.aligned ? '✓ 已对准' : '🎯 光源对准'}
              </button>

              {/* 焦距/狭缝滑块 */}
              <div className="absolute bottom-3 left-1/2 w-[480px] -translate-x-1/2 rounded-2xl border border-line bg-white/95 p-3 shadow-card backdrop-blur">
                <div className="grid grid-cols-2 gap-4">
                  <SliderRow
                    label="狭缝宽度"
                    leftLabel="窄"
                    rightLabel="宽"
                    value={slitWidth}
                    onChange={(v) => {
                      setSlitWidth(v);
                      if (state.aligned) updateTuned();
                    }}
                    ok={slitOk}
                  />
                  <SliderRow
                    label="焦距调节"
                    leftLabel="近"
                    rightLabel="远"
                    value={focus}
                    onChange={(v) => {
                      setFocus(v);
                      if (state.aligned) updateTuned();
                    }}
                    ok={focusOk}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-ink-3">调节质量</span>
                  <div className="flex items-center gap-1">
                    {[1, 2].map((i) => (
                      <span
                        key={i}
                        className={clsx(
                          'h-1.5 w-12 rounded',
                          tuneScore >= i ? 'bg-emerald-500' : 'bg-line-2',
                        )}
                      />
                    ))}
                    <span className="ml-1 font-mono text-ink-3">{tuneScore} / 2</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 学习模式可切样品 */}
          {!embedded && mode === 'learning' && (
            <div className="absolute right-3 top-3 flex items-center gap-2 rounded-lg border border-line bg-white/85 px-3 py-2 shadow-card backdrop-blur">
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-4">
                演示样品
              </span>
              <select
                value={learningSampleId}
                onChange={(e) => {
                  setLearningSampleId(e.target.value);
                  handleReset();
                }}
                className="rounded border border-line-2 bg-white px-2 py-1 text-xs"
              >
                {SAMPLES.filter((s) => s.spectrum.features.length > 0).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      }
      rightSlot={
        <div className="space-y-3 text-ink">
          <StepGuide steps={stepsData} themeHex={instrument.themeHex} />

          {/* 光谱观察窗 */}
          <div className="rounded-2xl border border-line bg-white p-3 shadow-soft">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold text-ink">
              <span>📈 吸收光谱观察</span>
              {sample && state.observed && (
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink-4">
                  {sample.name}
                </span>
              )}
            </div>
            <SpectrumStrip
              features={spectrumReady ? features : []}
              userMarks={marks}
              onAddMark={handleAddMark}
              onRemoveMark={handleRemoveMark}
              slitWidth={slitWidth}
              focus={focus}
              showFeatures={spectrumReady}
              height={70}
              interactive={state.aligned && state.sampleOn}
            />
            {!spectrumReady && (
              <div className="mt-2 text-center text-[11px] text-ink-3">
                {!state.sampleOn
                  ? '请先放置样品'
                  : !state.aligned
                    ? '请对准光源'
                    : '调节狭缝与焦距至合适位置'}
              </div>
            )}
            {spectrumReady && (
              <div className="mt-2 text-center text-[11px] text-ink-3">
                点击光谱条标记吸收线 · 点击红色标记可删除
              </div>
            )}
          </div>

          {/* 数据记录 */}
          <div className="rounded-2xl border border-line bg-white p-3 shadow-soft">
            <div className="mb-2 text-sm font-semibold text-ink">📝 数据记录</div>
            <div className="text-xs text-ink-3">已标记吸收线（nm）</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {marks.length === 0 && <span className="text-xs text-ink-4">— 暂无标记 —</span>}
              {marks.map((wl) => (
                <span
                  key={wl}
                  className="rounded-full bg-rose-50 px-2.5 py-0.5 font-mono text-[11px] text-rose-700 ring-1 ring-rose-200"
                >
                  {wl} nm ✕
                </span>
              ))}
            </div>

            {mode === 'learning' && spectrumReady && features.length > 0 && (
              <div className="mt-3 rounded-lg bg-brand-50/40 p-2.5 text-xs leading-relaxed text-ink-2">
                <div className="mb-1 font-semibold text-brand-700">参考特征</div>
                {sample.spectrum.description}
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={!state.observed && marks.length === 0}
                className="btn-primary flex-1"
                style={{ background: instrument.themeHex }}
              >
                💾 {mode === 'detection' ? '提交检测结果' : '保存数据'}
              </button>
              <button type="button" onClick={handleReset} className="btn-ghost px-3">
                ↺ 重置
              </button>
            </div>
          </div>
        </div>
      }
    />
  );

  function updateTuned() {
    setState((s) => ({ ...s, tuned: focusOk && slitOk ? true : s.tuned }));
  }
}

function currentStep(s: DemoState): StepId | null {
  if (!s.sampleOn) return 'place';
  if (!s.aligned) return 'align';
  if (!s.tuned) return 'tune';
  if (!s.observed) return 'observe';
  if (!s.recorded) return 'record';
  return null;
}
function isDone(id: StepId, s: DemoState): boolean {
  switch (id) {
    case 'place':
      return s.sampleOn;
    case 'align':
      return s.aligned;
    case 'tune':
      return s.tuned;
    case 'observe':
      return s.observed;
    case 'record':
      return s.recorded;
  }
}

function SliderRow({
  label,
  leftLabel,
  rightLabel,
  value,
  onChange,
  ok,
}: {
  label: string;
  leftLabel: string;
  rightLabel: string;
  value: number;
  onChange: (v: number) => void;
  ok: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-medium text-ink-2">{label}</span>
        <span
          className={clsx(
            'rounded px-1.5 py-0.5 font-mono text-[10px]',
            ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
          )}
        >
          {ok ? '✓ 合格' : '调节中'}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
      <div className="flex justify-between font-mono text-[10px] text-ink-4">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}
