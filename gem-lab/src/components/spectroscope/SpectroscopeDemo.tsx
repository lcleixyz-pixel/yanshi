import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import HotPoint from '@/components/demo/HotPoint';
import ObjectFitHotspotFrame from '@/components/demo/ObjectFitHotspotFrame';
import StepGuide, { type DemoStep } from '@/components/demo/StepGuide';
import RotationKnob from '@/components/refractometer/RotationKnob';
import SpectrumStrip from '@/components/spectroscope/SpectrumStrip';
import SpectroscopeIllumination from '@/components/spectroscope/SpectroscopeIllumination';
import { INSTRUMENTS } from '@/data/instruments';
import { SAMPLES, SAMPLES_BY_ID } from '@/data/samples';
import type { SampleDef } from '@/data/types';
import { useDetection, type SpectroscopeMethod } from '@/store/detectionStore';
import { useProgress } from '@/store/progressStore';
import clsx from '@/utils/clsx';

type DemoMode = 'learning' | 'detection';
type StepId = 'power' | 'place' | 'pick-method' | 'align' | 'tune' | 'observe' | 'record';
const STEP_ORDER: StepId[] = ['power', 'place', 'pick-method', 'align', 'tune', 'observe', 'record'];

const STEP_META: Record<StepId, { iconId: string; title: string; tip: string }> = {
  power: { iconId: 'power-on', title: '开启光纤灯（冷光源）', tip: '点击仪器图上的「光纤灯」开启冷光源' },
  place: { iconId: 'place-sample', title: '放置样品', tip: '点击仪器图上的「样品台」放置样品' },
  'pick-method': {
    iconId: 'align',
    title: '选择照明方法',
    tip: '系统已根据样品透明度/颜色推荐方法；错配会显示「慎用」并使光谱质量下降',
  },
  align: {
    iconId: 'align',
    title: '对准光路（按方法所需调整角度）',
    tip: '透射法须同轴；内反射 ≈ 45°；表面反射调至最强反射方向',
  },
  tune: { iconId: 'focus', title: '调节狭缝与焦距', tip: '狭缝缓慢收紧至接近闭合；焦距居中至谱线最锐' },
  observe: { iconId: 'observe', title: '观察并标记吸收线/带', tip: '点击光谱条标记吸收特征位置（nm）' },
  record: { iconId: 'record', title: '保存数据', tip: '提交本次观察结果' },
};

/**
 * 热点坐标（相对仪器图 0–1）
 */
const HOT_LAYOUT = {
  hotpoint: {
    light:    { x: 0.18, y: 0.30, side: 'left'  as const },
    sample:   { x: 0.42, y: 0.62, side: 'left'  as const },
    eyepiece: { x: 0.82, y: 0.18, side: 'right' as const },
    slit:     { x: 0.78, y: 0.32, side: 'right' as const },
    focus:    { x: 0.62, y: 0.42, side: 'right' as const },
  },
} as const;

interface DemoState {
  power: boolean;
  sampleOn: boolean;
  method: SpectroscopeMethod | null;
  /** 透射法不需要调角度，自动 done；内反射/表面反射须落在合格区间 */
  aligned: boolean;
  tuned: boolean;
  observed: boolean;
  recorded: boolean;
}

const INITIAL_STATE: DemoState = {
  power: false,
  sampleOn: false,
  method: null,
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
  const navigate = useNavigate();
  const [mode, setMode] = useState<DemoMode>(embedded ? 'detection' : 'learning');
  const [state, setState] = useState<DemoState>(INITIAL_STATE);

  // 光路 / 调节
  const [angle01, setAngle01] = useState(0.5);
  const [slitWidth, setSlitWidth] = useState(0.35);
  const [focus, setFocus] = useState(0.5);
  const [marks, setMarks] = useState<number[]>([]);
  const [dispersion, setDispersion] = useState<'prism' | 'grating'>('prism');

  // 弹窗
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [showSamplePreview, setShowSamplePreview] = useState<string | null>(null);

  // 样品
  const [learningSampleId, setLearningSampleId] = useState('ruby');
  const sampleId = forcedSampleId ?? learningSampleId;
  const sample = SAMPLES_BY_ID[sampleId];
  const features = sample?.spectrum.features ?? [];
  const recommendedMethod = sample ? recommendMethod(sample) : 'transmission';

  // 检测会话
  const setSpectroscopeData = useDetection((s) => s.setSpectroscope);
  const markInstrument = useDetection((s) => s.markInstrument);
  const markDemoComplete = useProgress((s) => s.markDemoComplete);

  // 角度
  const angleDeg = angle01 * 90;
  const angleNeeded = state.method === 'internal-reflection' || state.method === 'surface-reflection';
  const angleOk = !angleNeeded
    ? true
    : state.method === 'internal-reflection'
      ? angleDeg >= 35 && angleDeg <= 55
      : angleDeg >= 25 && angleDeg <= 65;

  // 调节合格
  const focusOk = Math.abs(focus - 0.5) < 0.12;
  const slitOk = slitWidth >= 0.18 && slitWidth <= 0.45;
  const tuneScore = (focusOk ? 1 : 0) + (slitOk ? 1 : 0);

  // 推进 aligned/tuned
  useEffect(() => {
    if (state.power && state.sampleOn && state.method && angleOk && !state.aligned) {
      setState((s) => ({ ...s, aligned: true }));
    }
  }, [state.power, state.sampleOn, state.method, angleOk, state.aligned]);

  useEffect(() => {
    if (state.aligned && focusOk && slitOk && !state.tuned) {
      setState((s) => ({ ...s, tuned: true }));
    }
  }, [state.aligned, focusOk, slitOk, state.tuned]);

  // 当前步骤
  const currentStep = computeCurrentStep(state);
  const completedCount = STEP_ORDER.filter((id) => isStepDone(id, state)).length;
  const progress = (completedCount / STEP_ORDER.length) * 100;

  const stepsData: DemoStep[] = STEP_ORDER.map((id) => ({
    id: STEP_ORDER.indexOf(id) + 1,
    iconId: STEP_META[id].iconId,
    title: STEP_META[id].title,
    done: isStepDone(id, state),
    current: id === currentStep,
  }));

  const tip = currentStep ? STEP_META[currentStep].tip : '✓ 全部步骤已完成';

  // 错配方法的光谱质量下降
  const methodMatchOk = state.method != null && state.method === recommendedMethod;
  const baseNoise = state.method === 'transmission'
    ? 0.05
    : state.method === 'internal-reflection'
      ? 0.20
      : state.method === 'surface-reflection'
        ? 0.30
        : 0.5;
  const mismatchPenalty = state.method && !methodMatchOk ? 0.30 : 0;
  const slitPenalty = slitOk ? 0 : Math.min(0.25, Math.abs(slitWidth - 0.32) * 0.6);
  const focusPenalty = focusOk ? 0 : Math.min(0.25, Math.abs(focus - 0.5) * 0.5);
  // 光栅式：透光弱，进一步抬高基础噪声
  const dispersionPenalty = dispersion === 'grating' ? 0.08 : 0;
  const noise = Math.min(0.95, baseNoise + mismatchPenalty + slitPenalty + focusPenalty + dispersionPenalty);

  const showSpectrum = state.power && state.sampleOn && !!state.method && state.aligned;
  const spectrumReady = showSpectrum && state.tuned;

  // 观察窗尺寸自适应
  const obsZoneRef = useRef<HTMLDivElement>(null);
  const [obsHeight, setObsHeight] = useState(110);
  useLayoutEffect(() => {
    const el = obsZoneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight;
      if (h < 64) return;
      const target = Math.round(Math.max(80, Math.min(180, h * 0.30)));
      setObsHeight(target);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 热点点击
  const handleHotpoint = (id: 'light' | 'sample' | 'eyepiece' | 'slit' | 'focus') => {
    if (id === 'light') {
      setState((s) => ({ ...s, power: !s.power }));
    } else if (id === 'sample') {
      if (!state.power) return;
      if (!state.sampleOn) {
        setState((s) => ({ ...s, sampleOn: true }));
        setShowMethodPicker(true);
      } else {
        setState((s) => ({ ...s, sampleOn: false, method: null, aligned: false, tuned: false }));
      }
    } else if (id === 'slit' || id === 'focus' || id === 'eyepiece') {
      // 视觉反馈：滚动到右侧调节面板（无操作）
    }
  };

  const handlePickMethod = (m: SpectroscopeMethod) => {
    setState((s) => ({ ...s, method: m, aligned: m === 'transmission', tuned: false }));
    setShowMethodPicker(false);
    setAngle01(m === 'internal-reflection' ? 0.5 : m === 'surface-reflection' ? 0.45 : 0.5);
  };

  const handleAddMark = (wl: number) => {
    if (!spectrumReady) return;
    setMarks((m) => (m.includes(wl) ? m : [...m, wl].sort((a, b) => b - a)));
    if (!state.observed) setState((s) => ({ ...s, observed: true }));
  };
  const handleRemoveMark = (wl: number) => setMarks((m) => m.filter((x) => x !== wl));

  const handleReset = () => {
    setState(INITIAL_STATE);
    setAngle01(0.5);
    setSlitWidth(0.35);
    setFocus(0.5);
    setMarks([]);
    setShowMethodPicker(false);
  };

  const handleSave = () => {
    if (mode === 'detection') {
      setSpectroscopeData({
        method: state.method,
        markedLines: marks,
        bandRanges: [],
      });
      markInstrument('spectroscope');
      onDetectionComplete?.();
    }
    setState((s) => ({ ...s, recorded: true }));
    markDemoComplete({ instrumentId: 'spectroscope', mode, completedAt: Date.now() });
  };

  // 学习模式参考特征文字
  const referenceText = useMemo(() => sample?.spectrum.description ?? '', [sample]);

  // 致色元素分析
  const elementAnalysis = useMemo(
    () => sample ? identifyChromophore(sample) : null,
    [sample],
  );

  return (
    <div className="flex h-screen flex-col bg-lab-ink text-white">
      {/* 顶栏 */}
      <header
        className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-5"
        style={{
          background: `linear-gradient(90deg, ${instrument.themeHex}30 0%, rgba(15,37,69,0.85) 60%)`,
        }}
      >
        <div className="flex items-center gap-3">
          <Link
            to={`/knowledge/${instrument.id}`}
            className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-300 hover:text-lab-cyan"
          >
            ← 知识库
          </Link>
          <span className="text-white/30">|</span>
          <span className="font-display text-base font-semibold">{instrument.name}互动演示</span>
          <span className="font-display text-base text-white/70">
            - {mode === 'learning' ? '学习模式' : '检测模式'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:bg-white/10"
        >
          ✕ 退出
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 左：仪器交互 */}
        <section className="relative flex-[3] overflow-hidden bg-gradient-to-br from-[#f6f9fd] via-white to-[#eef4fb] text-ink">
          {/* 左上：模式 + 进度 + StepGuide */}
          <div className="absolute left-3 top-3 z-20 w-[min(95%,24rem)] rounded-xl border border-line bg-white/90 p-2 shadow-card backdrop-blur">
            <div className="grid grid-cols-2 gap-1">
              <ModeBtn
                active={mode === 'learning'}
                themeHex={instrument.themeHex}
                onClick={() => setMode('learning')}
                icon="📖"
                label="学习模式"
              />
              <ModeBtn
                active={mode === 'detection'}
                themeHex={instrument.themeHex}
                onClick={() => !embedded && setMode('detection')}
                icon={embedded ? '🔒' : '🎯'}
                label="检测模式"
                disabled={embedded}
              />
            </div>
            <div className="mt-2 rounded-lg border border-line bg-white px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Progress</span>
                <span className="font-mono text-[11px] tabular-nums text-ink-2">{Math.round(progress)}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${progress}%`, background: instrument.themeHex }}
                />
              </div>
            </div>
            <div className="mt-2">
              <StepGuide steps={stepsData} themeHex={instrument.themeHex} variant="inline" />
            </div>
          </div>

          {/* 右上：演示样品 + 色散类型 */}
          {!embedded && mode === 'learning' && (
            <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-white/85 px-3 py-2 shadow-card backdrop-blur">
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink-4">演示样品</span>
                <select
                  value={learningSampleId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setLearningSampleId(nextId);
                    setShowSamplePreview(nextId);
                    handleReset();
                  }}
                  className="rounded border border-line-2 bg-white px-2 py-1 text-xs"
                >
                  {SAMPLES.filter((s) => s.spectrum.features.length > 0).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <DispersionToggle value={dispersion} onChange={setDispersion} themeHex={instrument.themeHex} />
            </div>
          )}

          {/* 检测模式也支持色散切换 */}
          {(embedded || mode === 'detection') && (
            <div className="absolute right-3 top-3 z-20">
              <DispersionToggle value={dispersion} onChange={setDispersion} themeHex={instrument.themeHex} />
            </div>
          )}

          {/* 仪器图 + 热点 + 光路示意 */}
          <div className="mx-auto flex h-full min-h-0 w-full items-center justify-center gap-4 p-3">
            <div className="relative aspect-[4/3] h-full max-h-full w-full max-w-[min(100%,min(85dvh,68vw,52vw))]">
              <ObjectFitHotspotFrame src={instrument.productImage} alt={instrument.name} className="h-full w-full">
                {/* 光纤灯 */}
                <HotPoint
                  x={HOT_LAYOUT.hotpoint.light.x}
                  y={HOT_LAYOUT.hotpoint.light.y}
                  label={state.power ? '光纤灯（已开启）' : '光纤灯（关闭）'}
                  sub={state.power ? '点击关闭' : '点击开启冷光源'}
                  side={HOT_LAYOUT.hotpoint.light.side}
                  themeHex={instrument.themeHex}
                  status={state.power ? 'done' : currentStep === 'power' ? 'active' : 'disabled'}
                  onClick={() => handleHotpoint('light')}
                />
                {/* 样品台 */}
                <HotPoint
                  x={HOT_LAYOUT.hotpoint.sample.x}
                  y={HOT_LAYOUT.hotpoint.sample.y}
                  label={state.sampleOn ? '样品已就位' : '样品台'}
                  sub={!state.power ? '请先开光源' : state.sampleOn ? '点击移除样品' : '点击放置样品'}
                  side={HOT_LAYOUT.hotpoint.sample.side}
                  themeHex={instrument.themeHex}
                  status={
                    state.sampleOn
                      ? 'done'
                      : currentStep === 'place' && state.power
                        ? 'active'
                        : 'disabled'
                  }
                  onClick={() => handleHotpoint('sample')}
                />
                {/* 目镜 */}
                <HotPoint
                  x={HOT_LAYOUT.hotpoint.eyepiece.x}
                  y={HOT_LAYOUT.hotpoint.eyepiece.y}
                  label="目镜（观察窗）"
                  sub="光谱在右侧实时显示"
                  side={HOT_LAYOUT.hotpoint.eyepiece.side}
                  themeHex={instrument.themeHex}
                  status={spectrumReady ? 'done' : 'disabled'}
                  onClick={() => handleHotpoint('eyepiece')}
                />
                {/* 狭缝 */}
                <HotPoint
                  x={HOT_LAYOUT.hotpoint.slit.x}
                  y={HOT_LAYOUT.hotpoint.slit.y}
                  label="狭缝调节"
                  sub={!state.aligned ? '对准后启用' : slitOk ? '✓ 接近闭合' : '过宽 → 模糊'}
                  side={HOT_LAYOUT.hotpoint.slit.side}
                  themeHex={instrument.themeHex}
                  status={slitOk && state.aligned ? 'done' : state.aligned ? 'active' : 'disabled'}
                  onClick={() => handleHotpoint('slit')}
                />
                {/* 焦距 */}
                <HotPoint
                  x={HOT_LAYOUT.hotpoint.focus.x}
                  y={HOT_LAYOUT.hotpoint.focus.y}
                  label="焦距调节"
                  sub={!state.aligned ? '对准后启用' : focusOk ? '✓ 已聚焦' : '调至最清晰'}
                  side={HOT_LAYOUT.hotpoint.focus.side}
                  themeHex={instrument.themeHex}
                  status={focusOk && state.aligned ? 'done' : state.aligned ? 'active' : 'disabled'}
                  onClick={() => handleHotpoint('focus')}
                />
              </ObjectFitHotspotFrame>
            </div>

            {/* 右：光路示意 + 角度旋钮 + 滑块 */}
            <div className="flex shrink-0 flex-col items-stretch gap-2 self-stretch">
              {/* 光路示意 */}
              {state.method && state.sampleOn && (
                <div className="rounded-xl border border-line bg-white/95 p-2 shadow-card backdrop-blur">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-ink-4">
                      光路示意
                    </span>
                    <span
                      className={clsx(
                        'rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                        methodMatchOk
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-800',
                      )}
                    >
                      {methodMatchOk ? '✓ 推荐方法' : '⚠ 慎用'}
                    </span>
                  </div>
                  <div className="h-[160px] w-[300px]">
                    <SpectroscopeIllumination
                      method={state.method}
                      angleDeg={angleDeg}
                      lightOn={state.power}
                      sampleOn={state.sampleOn}
                    />
                  </div>
                </div>
              )}

              {/* 角度旋钮 */}
              {state.method && angleNeeded && state.sampleOn && state.power && (
                <div className="rounded-xl border border-line bg-white/95 p-3 shadow-card backdrop-blur">
                  <RotationKnob
                    value={angle01}
                    onChange={setAngle01}
                    label={`入射角 ${angleDeg.toFixed(0)}°`}
                    hint={state.method === 'internal-reflection' ? '推荐 35°–55°' : '推荐 25°–65°'}
                    ready={angleOk}
                    size={100}
                    themeHex={instrument.themeHex}
                  />
                </div>
              )}

              {/* 狭缝 + 焦距 */}
              {state.aligned && (
                <div className="rounded-xl border border-line bg-white/95 p-3 shadow-card backdrop-blur">
                  <SliderRow
                    label="狭缝宽度"
                    leftLabel="闭合"
                    rightLabel="宽"
                    value={slitWidth}
                    onChange={setSlitWidth}
                    ok={slitOk}
                    okHint="接近闭合最清晰"
                  />
                  <div className="mt-2">
                    <SliderRow
                      label="焦距调节"
                      leftLabel="近"
                      rightLabel="远"
                      value={focus}
                      onChange={setFocus}
                      ok={focusOk}
                      okHint="居中位置"
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
              )}
            </div>
          </div>

          {/* 底部提示 */}
          {tip && (
            <div className="absolute bottom-3 left-1/2 z-20 max-w-[min(96%,32rem)] -translate-x-1/2 rounded-full border border-line-2 bg-white/90 px-3 py-1.5 text-center text-xs text-ink-2 shadow-card backdrop-blur">
              <span className="mr-1">💡</span>{tip}
            </div>
          )}

          {/* 光源状态角标 */}
          <div className="absolute bottom-3 left-3 rounded-lg border border-line bg-white/85 px-3 py-2 text-xs shadow-card backdrop-blur">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-4">光纤灯</div>
            <div className={clsx('mt-0.5 flex items-center gap-1.5 font-semibold', state.power ? 'text-emerald-600' : 'text-slate-500')}>
              <span className={clsx('h-2 w-2 rounded-full', state.power ? 'animate-soft-pulse bg-emerald-500' : 'bg-slate-400')} />
              {state.power ? '已开启' : '已关闭'}
            </div>
          </div>

          {/* 方法选择弹窗 */}
          {showMethodPicker && sample && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/35 px-4 backdrop-blur-[1px]">
              <div className="w-full max-w-[820px] rounded-2xl border border-line bg-white p-4 shadow-card">
                <div className="mb-1 text-sm font-semibold text-ink">选择照明方法</div>
                <p className="mb-3 text-xs leading-relaxed text-ink-3">
                  根据样品的<strong>透明度</strong>、<strong>颜色深浅</strong>、<strong>颗粒大小</strong>选择。
                  当前样品「<strong>{sample.name}</strong>」（{sample.characteristics.transparency}，{sample.characteristics.color}），
                  系统推荐 <strong>{methodLabel(recommendedMethod)}</strong>——{methodReasonForSample(sample, recommendedMethod)}。
                  错配方法会显示「慎用」并使光谱质量明显下降。
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <MethodCard
                    active={state.method === 'transmission'}
                    recommend={recommendedMethod === 'transmission'}
                    title="透射光法"
                    desc="光从下方穿透样品 → 进入分光镜物镜"
                    suit="透明—半透明、颜色较深、颗粒较大"
                    typicalSamples="红宝石、祖母绿、橄榄石、紫水晶"
                    onClick={() => handlePickMethod('transmission')}
                    sketch={
                      <SpectroscopeIllumination method="transmission" angleDeg={0} lightOn sampleOn />
                    }
                  />
                  <MethodCard
                    active={state.method === 'internal-reflection'}
                    recommend={recommendedMethod === 'internal-reflection'}
                    title="内反射光法"
                    desc="台面向下 + ≈ 45° 入射，亭部内反射"
                    suit="颜色较浅、颗粒较小的透明刻面"
                    typicalSamples="浅色蓝宝、海蓝宝、变石、浅色碧玺"
                    onClick={() => handlePickMethod('internal-reflection')}
                    sketch={
                      <SpectroscopeIllumination method="internal-reflection" angleDeg={45} lightOn sampleOn />
                    }
                  />
                  <MethodCard
                    active={state.method === 'surface-reflection'}
                    recommend={recommendedMethod === 'surface-reflection'}
                    title="表面反射法"
                    desc="斜射 + 表面镜面反射进入分光镜"
                    suit="不透明 / 透明度差的玉石类"
                    typicalSamples="翡翠、绿松石、孔雀石、青金石"
                    onClick={() => handlePickMethod('surface-reflection')}
                    sketch={
                      <SpectroscopeIllumination method="surface-reflection" angleDeg={40} lightOn sampleOn />
                    }
                  />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMethodPicker(false)}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 样品预览弹窗 */}
          {showSamplePreview && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]">
              <div className="w-full max-w-[340px] rounded-2xl border border-line bg-white p-4 shadow-card">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold text-ink">
                    {SAMPLES_BY_ID[showSamplePreview]?.name ?? '样品预览'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSamplePreview(null)}
                    className="btn-ghost px-2 py-1 text-xs"
                  >
                    关闭
                  </button>
                </div>
                <img
                  src={SAMPLES_BY_ID[showSamplePreview]?.image}
                  alt={SAMPLES_BY_ID[showSamplePreview]?.name ?? '样品预览'}
                  className="mx-auto h-44 w-44 rounded-xl bg-brand-50/40 object-contain p-2 ring-1 ring-line"
                  draggable={false}
                />
                <div className="mt-3 rounded-lg bg-cyan-50 px-3 py-2 text-[11px] text-cyan-800 ring-1 ring-cyan-200">
                  透明度：{SAMPLES_BY_ID[showSamplePreview]?.characteristics.transparency} ·
                  颜色：{SAMPLES_BY_ID[showSamplePreview]?.characteristics.color}
                  <div className="mt-0.5 text-ink-3">
                    建议方法：{methodLabel(recommendMethod(SAMPLES_BY_ID[showSamplePreview]!))}
                  </div>
                  {(() => {
                    const ana = identifyChromophore(SAMPLES_BY_ID[showSamplePreview]!);
                    return ana ? (
                      <div className="mt-0.5 text-ink-3">特征谱：{ana.label}</div>
                    ) : null;
                  })()}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 右：光谱观察 + 数据记录 */}
        <section className="flex min-h-0 flex-[2] flex-col border-l border-line-2/80">
          {/* 上：光谱观察 */}
          <section
            ref={obsZoneRef}
            className="flex min-h-0 flex-[3] flex-col border-b border-line-2/80 bg-gradient-to-b from-[#0c1d3a] to-[#0a172e] px-3 py-3 text-white"
          >
            <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-1 flex-col items-stretch gap-2">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs font-semibold">
                <span>📈 吸收光谱观察</span>
                <div className="flex items-center gap-2">
                  {state.method && (
                    <span className={clsx(
                      'rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest',
                      methodMatchOk
                        ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'
                        : 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40',
                    )}>
                      {methodLabel(state.method)}
                    </span>
                  )}
                  <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-cyan-200">
                    {dispersion === 'prism' ? '棱镜式' : '光栅式'}
                  </span>
                  {sample && spectrumReady && (
                    <span className="font-mono text-[9px] uppercase tracking-widest text-slate-300">
                      {sample.name}
                    </span>
                  )}
                </div>
              </div>

              {/* 错配方法提示 */}
              {state.method && !methodMatchOk && state.aligned && (
                <div className="rounded-lg border border-amber-300/60 bg-amber-500/10 px-2 py-1 text-[10px] leading-tight text-amber-200">
                  ⚠ 与推荐方法（<strong>{methodLabel(recommendedMethod)}</strong>）不一致 —— 光谱清晰度下降，吸收特征对比度被衰减。
                  仅当切实需要时才使用反射类方法（透明度差、颗粒太小或颜色过浅）。
                </div>
              )}

              <SpectrumStrip
                features={spectrumReady ? features : []}
                userMarks={marks}
                onAddMark={handleAddMark}
                onRemoveMark={handleRemoveMark}
                slitWidth={slitWidth}
                focus={focus}
                noise={spectrumReady ? noise : 0.6}
                dispersion={dispersion}
                showFeatures={spectrumReady}
                height={obsHeight}
                interactive={spectrumReady}
              />

              {!spectrumReady && (
                <div className="mt-1 text-center text-[11px] text-slate-400">
                  {!state.power
                    ? '请先点击仪器图上的「光纤灯」开启冷光源'
                    : !state.sampleOn
                      ? '请放置样品'
                      : !state.method
                        ? '请选择照明方法'
                        : !state.aligned
                          ? state.method === 'internal-reflection'
                            ? `请将入射角调至 35°–55°（当前 ${angleDeg.toFixed(0)}°）`
                            : state.method === 'surface-reflection'
                              ? `请将入射角调至 25°–65°（当前 ${angleDeg.toFixed(0)}°）`
                              : '请等待对准…'
                          : '请调节狭缝（接近闭合）与焦距至「合格」'}
                </div>
              )}
              {spectrumReady && (
                <div className="text-center text-[10px] text-slate-300">
                  点击光谱条标记吸收线 · 点击红色标记可删除
                </div>
              )}

              {/* 当前方法操作要点 */}
              {state.method && state.sampleOn && (
                <details className="group mt-1 rounded-xl border border-cyan-300/40 bg-cyan-900/30 ring-1 ring-cyan-300/30 open:pb-2">
                  <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-bold text-cyan-100 [&::-webkit-details-marker]:hidden">
                    {methodLabel(state.method)} · 操作要点
                    <span className="ml-1 text-[9px] text-cyan-300/80">▼ 展开</span>
                  </summary>
                  <p className="px-2 pb-1 text-[10px] leading-relaxed text-cyan-50/95">
                    {operationHint(state.method)}
                  </p>
                </details>
              )}

              {/* 棱镜 vs 光栅式说明 */}
              <details className="group rounded-xl border border-cyan-300/40 bg-cyan-900/30 ring-1 ring-cyan-300/30 open:pb-2">
                <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-bold text-cyan-100 [&::-webkit-details-marker]:hidden">
                  色散类型差异 · {dispersion === 'prism' ? '棱镜式' : '光栅式'}
                  <span className="ml-1 text-[9px] text-cyan-300/80">▼ 展开</span>
                </summary>
                <p className="px-2 pb-1 text-[10px] leading-relaxed text-cyan-50/95">
                  {dispersion === 'prism'
                    ? '当前为棱镜式：透光性好、视场明亮，但色区分布不均——蓝紫区被相对扩展、红光区被相对压缩。便于观察短波端吸收特征（如紫区 410 nm 等），但红区分辨率较低。教学常用此型。'
                    : '当前为光栅式：色区线性等距、红区分辨率优于棱镜式，便于精确读取锆石 653.5 nm、稀土谱密集排列的窄线等。但透光性差，需更强光源；当前已计入额外的亮度损失。'}
                </p>
              </details>
            </div>
          </section>

          {/* 下：数据记录 */}
          <aside className="flex min-h-0 flex-[2] flex-col bg-white">
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-3 text-ink">
              <div className="rounded-lg border border-line bg-white p-2 shadow-soft">
                <div className="mb-2 text-xs font-semibold text-ink">📝 数据记录</div>
                <div className="text-[10px] text-ink-3">已选方法</div>
                <div className="mt-0.5 text-xs">
                  {state.method ? (
                    <>
                      {methodLabel(state.method)}
                      {state.method && (
                        <span className={clsx(
                          'ml-2 rounded px-1.5 py-0.5 text-[10px]',
                          methodMatchOk ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                        )}>
                          {methodMatchOk ? '推荐方法' : '慎用'}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-ink-4">— 未选择 —</span>
                  )}
                </div>

                <div className="mt-2 text-[10px] text-ink-3">已标记吸收线（nm）</div>
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

                {/* 学习模式：致色元素解析 */}
                {mode === 'learning' && elementAnalysis && spectrumReady && (
                  <div className="mt-2 rounded-lg bg-violet-50 p-2 text-[11px] leading-relaxed text-violet-800 ring-1 ring-violet-200">
                    <div className="mb-0.5 font-semibold">致色元素解析</div>
                    <div className="font-mono text-[10px] text-violet-600">{elementAnalysis.label}</div>
                    <p className="mt-1 text-ink-2">{elementAnalysis.text}</p>
                  </div>
                )}

                {mode === 'learning' && spectrumReady && features.length > 0 && (
                  <div className="mt-2 rounded-lg bg-cyan-50/60 p-2 text-[11px] leading-relaxed text-ink-2 ring-1 ring-cyan-100">
                    <div className="mb-0.5 font-semibold text-cyan-700">参考特征（教学）</div>
                    {referenceText}
                  </div>
                )}

                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!state.observed && marks.length === 0}
                    className="btn-primary flex-1 text-xs"
                    style={{ background: instrument.themeHex }}
                  >
                    💾 {mode === 'detection' ? '提交检测结果' : '保存数据'}
                  </button>
                  <button type="button" onClick={handleReset} className="btn-ghost px-3 text-xs">
                    ↺ 重置
                  </button>
                </div>

                {state.recorded && mode === 'learning' && (
                  <div className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-700 ring-1 ring-emerald-200">
                    ✓ 已完成观察。可切换样品继续练习。
                  </div>
                )}
              </div>

              {/* 注意事项 */}
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] leading-relaxed text-amber-800">
                <div className="mb-1 font-semibold">通用注意事项</div>
                <ul className="space-y-0.5 pl-4 list-disc">
                  <li>使用<strong>无特征吸收的连续光源</strong>（光纤灯/冷光源），避免日光灯/节能灯。</li>
                  <li><strong>不要用手指直接持小宝石</strong>，手指血液在 <strong>592 nm</strong> 有吸收线。</li>
                  <li>狭缝<strong>由宽到窄</strong>缓慢收紧，至光谱最清晰；保持狭缝清洁（灰尘形成水平黑线易误判）。</li>
                  <li>颜色越深、透明度越好，光谱越清晰；建议在<strong>暗背景下</strong>观察。</li>
                  <li>吸收谱并非万能：天然 vs 合成红宝石的吸收谱几乎一致，需配合其他仪器。</li>
                </ul>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

// ── 推荐方法逻辑 ─────────────────────────────────────────────
function recommendMethod(sample: SampleDef): SpectroscopeMethod {
  const t = sample.characteristics.transparency;
  const color = sample.characteristics.color;
  const difficulty = sample.difficulty;

  // 不透明 / 透明度极差 → 表面反射
  if (t === '不透明' || t === '半透明-不透明' || t === '透明-不透明') {
    return 'surface-reflection';
  }
  // 半透明 → 通常仍可透射，但弱时退化为表面反射
  if (t === '半透明') {
    return 'transmission';
  }
  // 透明 / 透明-半透明
  // 颜色浅 + 颗粒小（高级样品多为小颗粒）→ 内反射延长光程
  const isLightColor = /浅|无色|白|淡|粉|黄/.test(color) && !/深|暗/.test(color);
  if (isLightColor && difficulty !== 'beginner') {
    return 'internal-reflection';
  }
  return 'transmission';
}

function methodReasonForSample(sample: SampleDef, m: SpectroscopeMethod): string {
  const t = sample.characteristics.transparency;
  switch (m) {
    case 'transmission':
      return `${t}样品中光可充分透过宝石进入分光镜，吸收特征最完整、清晰`;
    case 'internal-reflection':
      return '颜色较浅或颗粒较小时，借亭部刻面内反射延长光程，弱吸收特征更易识别';
    case 'surface-reflection':
      return `${t}样品光线无法穿透，须借抛光面镜面反射收光，玉石类常用`;
  }
}

function methodLabel(m: SpectroscopeMethod): string {
  switch (m) {
    case 'transmission': return '透射光法';
    case 'internal-reflection': return '内反射光法';
    case 'surface-reflection': return '表面反射法';
  }
}

function operationHint(m: SpectroscopeMethod): string {
  switch (m) {
    case 'transmission':
      return '将宝石置于带小孔的黑板（锁光圈）上，光从下方垂直穿透样品。光纤灯—宝石—分光镜呈一条同轴直线；不要用手指持拿小宝石（手指血液在 592 nm 有吸收线，会污染光谱）。狭缝由宽到窄缓慢收紧，至吸收线/带的边缘最实最清晰再读数。读数从红区扫到紫区，记录主要特征位置。';
    case 'internal-reflection':
      return '宝石台面向下置于黑色背景，亭部朝上；光纤灯从冠部一侧斜射，与分光镜约成 45° 夹角。光从冠部进入 → 亭部刻面全反射 → 从冠部另一侧出射进入分光镜，光程被延长 1.5–2 倍。颜色浅时狭缝可稍宽以保证亮度。该法适合识别较弱的特征吸收，但定位读数误差大于透射法，弱线建议留疑。';
    case 'surface-reflection':
      return '抛光面朝上，置于黑色背景；光纤灯调到合适角度使尽量多的白光从样品表面反射进入分光镜（入射角 = 反射角，先在 30°–60° 范围试探最强反射方向）。表面越光滑反射越强，反射光通常较弱，狭缝可稍宽换取亮度。翡翠在红光区 630–660–690 nm 处的三阶梯吸收带是经典识别特征——天然显清晰阶梯，染色仅显模糊宽带。';
  }
}

// ── 致色元素识别（基于光谱特征关键波长） ─────────────────────────
interface ChromophoreAnalysis {
  /** 谱型简称：铬谱 / 铁谱 / 钴谱 / 锰谱 / 铀谱 / 稀土谱 / V 谱 / 钻石型 */
  label: string;
  /** 教学说明 */
  text: string;
}

function identifyChromophore(sample: SampleDef): ChromophoreAnalysis | null {
  const features = sample.spectrum.features;
  if (features.length === 0) return null;
  const wls = features.map((f) => f.wavelength);

  // 锆石：653.5 nm 单条强线
  if (sample.id === 'zircon' || (wls.includes(653.5) && features.length <= 3)) {
    return {
      label: '铀谱（U）',
      text: '锆石在 653.5 nm 处有单条最具识别力的强吸收线，可能配合其他细弱线（铀的衰变产物）。这是分光镜中最易显示的吸收谱之一，是确定锆石的有效方法。',
    };
  }

  // 钻石：415.5 nm 强线
  if (sample.id === 'diamond' || wls.some((w) => Math.abs(w - 415.5) < 2)) {
    return {
      label: 'N3 色心',
      text: '天然 Cape 系列钻石在 415.5 nm 处有典型 N3 色心吸收线。该吸收线对鉴定无色至浅黄色钻石具重要意义；HPHT/CVD 合成钻石则可能缺失或减弱。',
    };
  }

  // 红宝石 / 祖母绿 / 翡翠 / 红色尖晶石：铬谱
  // 特征：680–700 nm 区有强线（R 双线/Cr³⁺ 荧光线）
  const hasRedRegionStrongLines = features.some(
    (f) => f.wavelength >= 680 && f.wavelength <= 695 && (f.intensity === 'strong' || f.intensity === 'medium'),
  );
  if (hasRedRegionStrongLines) {
    return {
      label: '铬谱（Cr³⁺）',
      text: 'Cr³⁺ 致色谱的核心是红区 680–700 nm 处的窄强线（"红荧光双线"）+ 黄绿区强吸收带 + 蓝紫区吸收。常见于红宝石、祖母绿、翡翠、铬变石、红色尖晶石等。区分要点：红宝石单条强线，红尖晶石呈"风琴管状"复合谱，祖母绿在 670 余处有较弱细线。',
    };
  }

  // 蓝宝石 / 橄榄石：铁谱
  // 特征：450 nm 附近强吸收（Fe³⁺/Fe²⁺）+ 蓝区附近三联线
  const hasFe450 = features.some((f) => Math.abs(f.wavelength - 450) <= 8 && f.intensity !== 'weak');
  const has453473493 = wls.includes(453) && wls.includes(473) && wls.includes(493);
  if (has453473493 || (hasFe450 && sample.id !== 'tanzanite')) {
    return {
      label: '铁谱（Fe）',
      text: 'Fe 致色宝石明度通常较暗。蓝宝石的特征是蓝区 450 nm 强吸收线（Fe³⁺）；橄榄石呈 453 / 473 / 493 nm 三联线（Fe²⁺）。注意：含铁也含铬的宝石（如部分泰国红宝）会同时显示铁谱与铬谱。',
    };
  }

  // 坦桑石：钒（V）谱
  if (sample.id === 'tanzanite') {
    return {
      label: 'V³⁺ / 钒致色',
      text: '坦桑石（黝帘石）的特征吸收为 595/528/455 nm 中等强度三线，由钒离子致色。配合极强的三色性（蓝/紫/黄绿）与 RI 1.691–1.700 可独立鉴定。',
    };
  }

  return {
    label: '其他特征谱',
    text: '本样品的吸收特征不属于上述典型几类。请对照"参考特征"区域，逐条对位记录吸收线/带的位置；致色离子可能为复合致色或较少见类型。',
  };
}

// ── 状态机 ─────────────────────────────────────────────────────
function computeCurrentStep(s: DemoState): StepId | null {
  if (!s.power) return 'power';
  if (!s.sampleOn) return 'place';
  if (!s.method) return 'pick-method';
  if (!s.aligned) return 'align';
  if (!s.tuned) return 'tune';
  if (!s.observed) return 'observe';
  if (!s.recorded) return 'record';
  return null;
}

function isStepDone(id: StepId, s: DemoState): boolean {
  switch (id) {
    case 'power': return s.power;
    case 'place': return s.sampleOn;
    case 'pick-method': return s.method != null;
    case 'align': return s.aligned;
    case 'tune': return s.tuned;
    case 'observe': return s.observed;
    case 'record': return s.recorded;
  }
}

// ── 子组件 ─────────────────────────────────────────────────────
function ModeBtn({
  active, themeHex, onClick, icon, label, disabled,
}: {
  active: boolean; themeHex: string; onClick: () => void;
  icon: string; label: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex items-center justify-center gap-2 rounded-md py-1.5 text-sm font-medium transition-colors',
        active
          ? 'text-white shadow-card'
          : disabled
            ? 'cursor-not-allowed text-slate-500'
            : 'text-ink-3 hover:bg-slate-100',
      )}
      style={active ? { background: themeHex } : {}}
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function DispersionToggle({
  value,
  onChange,
  themeHex,
}: {
  value: 'prism' | 'grating';
  onChange: (v: 'prism' | 'grating') => void;
  themeHex: string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-white/85 px-2 py-1.5 shadow-card backdrop-blur">
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink-4">色散</span>
      {(['prism', 'grating'] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={clsx(
            'rounded px-2 py-0.5 text-[11px] font-medium transition',
            value === v ? 'text-white shadow-card' : 'text-ink-3 hover:bg-slate-100',
          )}
          style={value === v ? { background: themeHex } : {}}
        >
          {v === 'prism' ? '棱镜式' : '光栅式'}
        </button>
      ))}
    </div>
  );
}

function SliderRow({
  label, leftLabel, rightLabel, value, onChange, ok, okHint,
}: {
  label: string; leftLabel: string; rightLabel: string;
  value: number; onChange: (v: number) => void; ok: boolean; okHint?: string;
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
          {ok ? `✓ ${okHint ?? '合格'}` : '调节中'}
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

function MethodCard({
  active, recommend, title, desc, suit, typicalSamples, sketch, onClick,
}: {
  active: boolean;
  recommend: boolean;
  title: string;
  desc: string;
  suit: string;
  typicalSamples: string;
  sketch: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'relative flex flex-col gap-2 rounded-xl border-2 p-3 text-left transition',
        active
          ? 'border-cyan-500 bg-cyan-50/60 shadow-lift'
          : recommend
            ? 'border-emerald-300 bg-emerald-50/40 hover:shadow-card'
            : 'border-amber-300/70 bg-amber-50/30 hover:shadow-card',
      )}
    >
      <span
        className={clsx(
          'absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold',
          active
            ? 'bg-cyan-500 text-white'
            : recommend
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-900',
        )}
      >
        {active ? '已选' : recommend ? '推荐' : '慎用'}
      </span>
      <div className="overflow-hidden rounded-lg bg-slate-50 ring-1 ring-line">
        <div className="h-[120px] w-full">{sketch}</div>
      </div>
      <div className="text-sm font-semibold text-ink">{title}</div>
      <div className="text-[11px] leading-snug text-ink-3">{desc}</div>
      <div className="text-[10px] leading-snug text-ink-4">
        <div>适用：{suit}</div>
        <div className="mt-0.5">典型：{typicalSamples}</div>
      </div>
    </button>
  );
}
