import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import HotPoint from '@/components/demo/HotPoint';
import ObjectFitHotspotFrame from '@/components/demo/ObjectFitHotspotFrame';
import StepGuide, { type DemoStep } from '@/components/demo/StepGuide';
import ObservationWindow, {
  type RefractometerView,
} from '@/components/refractometer/ObservationWindow';
import {
  getSpotDisplayRi,
  RI_MAX,
  RI_MIN,
} from '@/components/refractometer/refractometerObsUtils';
import { INSTRUMENTS } from '@/data/instruments';
import { requiredRefractometerMethod, shapeLabelCn } from '@/data/refractometerSampleMethod';
import { SAMPLES_BY_ID, SAMPLES } from '@/data/samples';
import type { SampleDef } from '@/data/types';
import { isAnisotropic, OPTICAL_LABEL } from '@/utils/format';
import { useDetection } from '@/store/detectionStore';
import { useProgress } from '@/store/progressStore';
import clsx from '@/utils/clsx';
import './spotSlider.css';
import RotationKnob from './RotationKnob';

type DemoMode = 'learning' | 'detection';
type StepId = 'power' | 'oil' | 'sample' | 'observe' | 'record';
const STEP_ORDER: StepId[] = ['power', 'oil', 'sample', 'observe', 'record'];

const STEP_META: Record<StepId, { iconId: string; title: string; tip: string }> = {
  power: { iconId: 'power-on', title: '打开光源', tip: '点击仪器右侧的电源开关' },
  oil: { iconId: 'liquid-drop', title: '滴加折射油', tip: '点击油瓶后再点击棱镜测台' },
  sample: { iconId: 'place-sample', title: '放置样品', tip: '点击棱镜台中央放置样品' },
  observe: { iconId: 'observe', title: '观察读数', tip: '点击目镜进入观察' },
  record: { iconId: 'record', title: '记录数据', tip: '在右侧「数据记录」中填写读数' },
};

/**
 * 交互层布局微调锚点（百分比基于仪器图容器）
 *
 * 手动微调方法：
 * - 热区位置：修改 hotpoint.x / hotpoint.y（范围 0~1，建议每次步进 0.01）
 */
const REFRACT_LAYOUT = {
  hotpoint: {
    power: { x: 0.66, y: 0.72, side: 'bottom' as const },
    oil: { x: 0.90, y: 0.58, side: 'left' as const },
    sample: { x: 0.56, y: 0.45, side: 'right' as const },
    observe: { x: 0.16, y: 0.60, side: 'left' as const },
  },
} as const;

interface DemoState {
  power: boolean;
  oil: boolean;
  sampleOn: boolean;
  observed: boolean;
  recorded: boolean;
}

const INITIAL_STATE: DemoState = {
  power: false,
  oil: false,
  sampleOn: false,
  observed: false,
  recorded: false,
};

export default function RefractometerDemo({
  /** 检测模式锁定的样品 id */
  forcedSampleId,
  /** 检测流程内嵌时锁定模式与流程 */
  embedded = false,
  qaReady = false,
  onDetectionComplete,
}: {
  forcedSampleId?: string;
  embedded?: boolean;
  qaReady?: boolean;
  onDetectionComplete?: () => void;
}) {
  const instrument = INSTRUMENTS.refractometer;
  const navigate = useNavigate();
  const [mode, setMode] = useState<DemoMode>(embedded ? 'detection' : 'learning');
  const [state, setState] = useState<DemoState>(INITIAL_STATE);
  const [method, setMethod] = useState<'facet' | 'spot'>('facet');
  const [usePolarizer, setUsePolarizer] = useState(false);
  const markDemoComplete = useProgress((s) => s.markDemoComplete);

  // 学习模式默认演示样品（红宝石），检测模式由外部传入
  const [learningSampleId, setLearningSampleId] = useState<string>('ruby');
  const [previewSampleId, setPreviewSampleId] = useState<string | null>(null);
  const sampleId = forcedSampleId ?? learningSampleId;
  const sample = SAMPLES_BY_ID[sampleId];
  const sampleLabel = mode === 'detection' ? '未知样品' : sample?.name;
  const isOverOilSample = sample ? isOverOilLimit(sample.characteristics.refractiveIndex) : false;

  // 检测会话
  const setRefractometerData = useDetection((s) => s.setRefractometer);
  const markInstrument = useDetection((s) => s.markInstrument);

  // 用户输入（检测模式）
  const [userRiMin, setUserRiMin] = useState('');
  const [userRiMax, setUserRiMax] = useState('');
  const [userBire, setUserBire] = useState('');
  /** 点测法：0–1 控制椭圆在量程内垂直位置 */
  const [spotSlider, setSpotSlider] = useState(0.38);
  /** 刻面法观察后：测台旋转样品 / 偏光片示意向量与完成标志 */
  const [facetSample01, setFacetSample01] = useState(0.5);
  const [facetPol01, setFacetPol01] = useState(0.5);
  const [facetSampleReady, setFacetSampleReady] = useState(false);
  const [facetPolReady, setFacetPolReady] = useState(false);
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [showPolarizerPicker, setShowPolarizerPicker] = useState(false);
  const [showSampleSliderPanel, setShowSampleSliderPanel] = useState(false);
  const [showPolarizerSliderPanel, setShowPolarizerSliderPanel] = useState(false);

  const currentStep = computeCurrentStep(state);
  const completedCount = STEP_ORDER.filter((s) => isStepDone(s, state)).length;
  const progress = (completedCount / STEP_ORDER.length) * 100;

  const view = computeView(state, sample, method);
  const requiredMethod = sample ? requiredRefractometerMethod(sample) : 'facet';
  const aniso = sample ? isAnisotropic(sample.characteristics.opticalCharacter) : false;
  const facetRecordUnlocked =
    isOverOilSample
      ? state.observed
      : method !== 'facet'
      ? true
      : !state.observed
        ? false
        : !facetSampleReady
          ? false
          : aniso && usePolarizer
            ? facetPolReady
            : true;

  /** 刻面法宜加偏光片；点测法宜裸眼（与常见教学一致） */
  const recommendedPolarizer = method === 'facet';
  const polarizerMatchesRecommend = usePolarizer === recommendedPolarizer;

  const showSampleKnob = method === 'facet' && state.sampleOn && showSampleSliderPanel;
  const showPolarizerKnob = method === 'facet' && state.observed && aniso && usePolarizer && view !== 'over-range' && showPolarizerSliderPanel;

  useEffect(() => {
    if (!qaReady || !sample) return;
    const nextMethod = requiredRefractometerMethod(sample);
    const spotRi = getSpotDisplayRi(sample.characteristics.refractiveIndex);
    const nextUsesPolarizer = nextMethod === 'facet';
    const nextAniso = isAnisotropic(sample.characteristics.opticalCharacter);
    setMethod(nextMethod);
    setUsePolarizer(nextUsesPolarizer);
    setShowMethodPicker(false);
    setShowPolarizerPicker(false);
    setShowSampleSliderPanel(nextMethod === 'facet');
    setShowPolarizerSliderPanel(nextMethod === 'facet');
    setSpotSlider(Math.max(0, Math.min(1, (spotRi - RI_MIN) / (RI_MAX - RI_MIN))));
    setFacetSample01(0.82);
    setFacetPol01(0.72);
    setFacetSampleReady(nextMethod === 'facet');
    setFacetPolReady(nextUsesPolarizer && nextAniso);
    setState({ power: true, oil: true, sampleOn: true, observed: true, recorded: false });
  }, [qaReady, sample]);

  const stepsData: DemoStep[] = STEP_ORDER.map((id) => ({
    id: STEP_ORDER.indexOf(id) + 1,
    iconId: STEP_META[id].iconId,
    title: STEP_META[id].title,
    done: isStepDone(id, state),
    current: id === currentStep,
  }));

  const tip =
    state.observed &&
    !state.recorded &&
    method === 'facet' &&
    !facetRecordUnlocked
      ? !facetSampleReady
        ? '请先在「观察窗口」下拖动「旋转样品」滑条，体会在测台上多方向进光、边界相对标尺的变化，再保存数据'
        : aniso && usePolarizer
          ? '请再拖动「旋转偏光片」，使两条阴影边界交替更清晰，再保存数据'
          : STEP_META.record.tip
      : currentStep
        ? STEP_META[currentStep].tip
        : '✓ 全部步骤已完成';

  const handleHotpoint = (id: StepId) => {
    if (id === 'power') {
      setState((s) => ({ ...s, power: !s.power }));
    } else if (id === 'oil' && state.power) {
      setState((s) => ({ ...s, oil: true }));
    } else if (id === 'sample' && state.oil) {
      if (!state.sampleOn) {
        if (sample) {
          setMethod(requiredRefractometerMethod(sample));
        }
        setShowMethodPicker(true);
      }
    } else if (id === 'observe' && state.sampleOn) {
      if (!state.observed) {
        setUsePolarizer(method === 'facet');
        setShowPolarizerPicker(true);
      }
    }
  };

  const handlePickMethodAndPlace = (picked: 'facet' | 'spot') => {
    if (sample && picked !== requiredRefractometerMethod(sample)) {
      return;
    }
    setMethod(picked);
    setShowMethodPicker(false);
    setShowSampleSliderPanel(picked === 'facet');
    setShowPolarizerSliderPanel(false);
    setState((s) => ({ ...s, sampleOn: true }));
  };

  const handleObserveConfirm = (use: boolean) => {
    setUsePolarizer(use);
    setShowPolarizerPicker(false);
    setShowSampleSliderPanel(method === 'facet');
    setShowPolarizerSliderPanel(method === 'facet' && use);
    setFacetSample01(0.5);
    setFacetPol01(0.5);
    setFacetSampleReady(false);
    setFacetPolReady(false);
    setState((s) => ({ ...s, observed: true }));
  };

  const handleReset = () => {
    setState(INITIAL_STATE);
    setUserRiMin('');
    setUserRiMax('');
    setUserBire('');
    setSpotSlider(0.38);
    setFacetSample01(0.5);
    setFacetPol01(0.5);
    setFacetSampleReady(false);
    setFacetPolReady(false);
    setShowMethodPicker(false);
    setShowPolarizerPicker(false);
    setShowSampleSliderPanel(false);
    setShowPolarizerSliderPanel(false);
  };

  const handleSave = () => {
    if (method === 'facet' && state.observed && !facetRecordUnlocked) return;
    if (mode === 'detection') {
      const spotRi = sample && method === 'spot'
        ? getSpotDisplayRi(sample.characteristics.refractiveIndex)
        : null;
      const riMin = spotRi ?? parseFloat(userRiMin);
      const riMax = method === 'spot' ? riMin : parseFloat(userRiMax) || riMin;
      const bire = method === 'spot' ? 0 : parseFloat(userBire) || 0;
      setRefractometerData({
        method,
        riMin: isOverOilSample ? null : isFinite(riMin) ? riMin : null,
        riMax: isOverOilSample ? null : isFinite(riMax) ? riMax : null,
        birefringence: isOverOilSample ? null : isFinite(bire) ? bire : null,
        opticalCharacter: sample?.characteristics.opticalCharacter ?? null,
        notes: isOverOilSample ? '折射率仅可判定为 > 1.780（超折射油）' : '',
      });
      markInstrument('refractometer');
      onDetectionComplete?.();
    }
    setState((s) => ({ ...s, recorded: true }));
    markDemoComplete({
      instrumentId: 'refractometer',
      mode,
      completedAt: Date.now(),
    });
  };

  // 学习模式真实读数（用作占位 / 自动填充提示）
  const truthRI = useMemo<{ min: number; max: number; dr: number }>(() => {
    if (!sample) return { min: 0, max: 0, dr: 0 };
    const ri = sample.characteristics.refractiveIndex;
    if (ri === 'over-1.78') return { min: 1.78, max: 1.78, dr: 0 };
    if (typeof ri === 'number') {
      if (ri > 1.78) return { min: 1.78, max: 1.78, dr: 0 };
      return { min: ri, max: ri, dr: 0 };
    }
    if (Math.max(ri[0], ri[1]) > 1.78) return { min: 1.78, max: 1.78, dr: 0 };
    return { min: ri[0], max: ri[1], dr: sample.characteristics.birefringence ?? 0 };
  }, [sample]);

  const obsZoneRef = useRef<HTMLDivElement>(null);
  const [obsSize, setObsSize] = useState(360);
  useLayoutEffect(() => {
    const el = obsZoneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w < 48) return;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
      const maxByViewport = Math.floor(vh * 0.62);
      const maxByPanelH = h > 64 ? Math.floor(h * 0.64) : maxByViewport;
      const hardMax = 720;
      const s = Math.min(hardMax, w * 0.92, maxByViewport, maxByPanelH);
      setObsSize(Math.round(Math.max(280, s)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex h-screen flex-col bg-lab-ink text-white">
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
          {mode === 'detection' && sample && (
            <span
              className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-cyan-100"
              data-testid="unknown-sample-label"
            >
              未知样品
            </span>
          )}
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
        <section className="relative flex-[3] overflow-hidden bg-gradient-to-br from-[#f6f9fd] via-white to-[#eef4fb] text-ink">
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
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink-4">
                  Progress
                </span>
                <span className="font-mono text-[11px] tabular-nums text-ink-2">
                  {Math.round(progress)}%
                </span>
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

          {!embedded && mode === 'learning' && (
            <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-lg border border-line bg-white/85 px-3 py-2 shadow-card backdrop-blur">
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-4">演示样品</span>
              <select
                value={learningSampleId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setLearningSampleId(nextId);
                  setPreviewSampleId(nextId);
                  handleReset();
                }}
                className="rounded border border-line-2 bg-white px-2 py-1 text-xs"
              >
                {SAMPLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mx-auto flex h-full min-h-0 w-full items-center justify-center gap-2 p-3">
            <div className="relative aspect-square h-full max-h-full w-full max-w-[min(100%,min(90dvh,70vw,56vw))]">
              <ObjectFitHotspotFrame src={instrument.productImage} alt={instrument.name} className="h-full w-full">
                <span
                  className={clsx(
                    'absolute bottom-[18%] left-[44%] h-2.5 w-2.5 rounded-full',
                    state.power
                      ? 'animate-soft-pulse bg-emerald-400 shadow-[0_0_12px_2px_rgba(74,222,128,0.8)]'
                      : 'bg-slate-400',
                  )}
                />
                <HotPoint
                  x={REFRACT_LAYOUT.hotpoint.power.x}
                  y={REFRACT_LAYOUT.hotpoint.power.y}
                  label="开关"
                  sub="点击切换电源"
                  side={REFRACT_LAYOUT.hotpoint.power.side}
                  themeHex={instrument.themeHex}
                  status={state.power ? 'done' : currentStep === 'power' ? 'active' : 'disabled'}
                  onClick={() => handleHotpoint('power')}
                />
                <HotPoint
                  x={REFRACT_LAYOUT.hotpoint.oil.x}
                  y={REFRACT_LAYOUT.hotpoint.oil.y}
                  label="滴折射油"
                  sub="点击添加"
                  side={REFRACT_LAYOUT.hotpoint.oil.side}
                  themeHex={instrument.themeHex}
                  status={state.oil ? 'done' : currentStep === 'oil' ? 'active' : 'disabled'}
                  onClick={() => handleHotpoint('oil')}
                />
                <HotPoint
                  x={REFRACT_LAYOUT.hotpoint.sample.x}
                  y={REFRACT_LAYOUT.hotpoint.sample.y}
                  label="放置样品"
                  sub="点击放置"
                  side={REFRACT_LAYOUT.hotpoint.sample.side}
                  themeHex={instrument.themeHex}
                  status={state.sampleOn ? 'done' : currentStep === 'sample' ? 'active' : 'disabled'}
                  onClick={() => handleHotpoint('sample')}
                />
                <HotPoint
                  x={REFRACT_LAYOUT.hotpoint.observe.x}
                  y={REFRACT_LAYOUT.hotpoint.observe.y}
                  label="观察读数"
                  sub="点击观察"
                  side={REFRACT_LAYOUT.hotpoint.observe.side}
                  themeHex={instrument.themeHex}
                  status={state.observed ? 'done' : currentStep === 'observe' ? 'active' : 'disabled'}
                  onClick={() => handleHotpoint('observe')}
                />
              </ObjectFitHotspotFrame>
            </div>

            {(showSampleKnob || showPolarizerKnob) && (
              <div className="flex shrink-0 flex-col items-center gap-3">
                {showSampleKnob && (
                  <div className="rounded-xl border border-line bg-white/95 p-3 shadow-card backdrop-blur">
                    <RotationKnob
                      value={facetSample01}
                      onChange={(v) => {
                        setFacetSample01(v);
                        if (Math.abs(v - 0.5) > 0.18) setFacetSampleReady(true);
                      }}
                      onReady={() => setFacetSampleReady(true)}
                      label="旋转样品（测台）"
                      hint="拖动旋钮旋转样品"
                      ready={facetSampleReady}
                      size={110}
                      themeHex={instrument.themeHex}
                    />
                  </div>
                )}
                {showPolarizerKnob && (
                  <div className="rounded-xl border border-line bg-white/95 p-3 shadow-card backdrop-blur">
                    <RotationKnob
                      value={facetPol01}
                      onChange={(v) => {
                        setFacetPol01(v);
                        if (Math.abs(v - 0.5) > 0.18) setFacetPolReady(true);
                      }}
                      onReady={() => setFacetPolReady(true)}
                      label="旋转偏光片（目镜外）"
                      hint="拖动旋钮调节偏光角度"
                      ready={facetPolReady}
                      size={110}
                      themeHex={instrument.themeHex}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="absolute bottom-3 left-3 rounded-lg border border-line bg-white/85 px-3 py-2 text-xs shadow-card backdrop-blur">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-4">光源状态</div>
            <div
              className={clsx(
                'mt-0.5 flex items-center gap-1.5 font-semibold',
                state.power ? 'text-emerald-600' : 'text-slate-500',
              )}
            >
              <span
                className={clsx('h-2 w-2 rounded-full', state.power ? 'animate-soft-pulse bg-emerald-500' : 'bg-slate-400')}
              />
              {state.power ? '已开启' : '已关闭'}
            </div>
          </div>

          {tip && (
            <div className="absolute bottom-3 left-1/2 z-20 max-w-[min(96%,28rem)] -translate-x-1/2 rounded-full border border-line-2 bg-white/90 px-3 py-1.5 text-center text-xs text-ink-2 shadow-card backdrop-blur">
              <span className="mr-1">💡</span>
              {tip}
            </div>
          )}

          {previewSampleId && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]">
              <div className="w-full max-w-[320px] rounded-2xl border border-line bg-white p-4 shadow-card">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold text-ink">{SAMPLES_BY_ID[previewSampleId]?.name ?? '样品预览'}</div>
                  <button type="button" onClick={() => setPreviewSampleId(null)} className="btn-ghost px-2 py-1 text-xs">
                    关闭
                  </button>
                </div>
                <img
                  src={SAMPLES_BY_ID[previewSampleId]?.image}
                  alt={SAMPLES_BY_ID[previewSampleId]?.name ?? '样品预览'}
                  className="mx-auto h-44 w-44 rounded-xl bg-brand-50/40 object-contain p-2 ring-1 ring-line"
                  draggable={false}
                />
              </div>
            </div>
          )}

          {showMethodPicker && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 px-4 backdrop-blur-[1px]">
              <div className="w-full max-w-[520px] rounded-2xl border border-line bg-white p-4 shadow-card">
                <div className="mb-1 text-sm font-semibold text-ink">放置样品前选择测量方法</div>
                <p className="mb-3 text-xs leading-relaxed text-ink-3">
                  已按当前样品的图例形态，自动锁定匹配的测量法。灰色项与当前形态不符，无法选用。
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <MethodPickCard
                    active={method === 'facet' && requiredMethod === 'facet'}
                    disabled={requiredMethod === 'spot'}
                    disabledNote={
                      requiredMethod === 'spot' && sample
                        ? `本样品为${shapeLabelCn(sample.refractometerShape)}，应使用点测法（远视法）。`
                        : undefined
                    }
                    title="刻面法"
                    desc="平整刻面朝下贴合棱镜"
                    onClick={() => handlePickMethodAndPlace('facet')}
                    sketch={
                      <svg viewBox="0 0 140 90" className="h-16 w-full">
                        <rect x="8" y="62" width="124" height="12" rx="2" fill="#d5dde7" />
                        <rect x="46" y="48" width="48" height="10" rx="2" fill="#f3b5cc" />
                        <path d="M46 48 L70 34 L94 48 Z" fill="#f8d0e0" />
                        <line x1="20" y1="22" x2="120" y2="22" stroke="#9aa6b2" strokeWidth="2" />
                        <text x="20" y="18" fontSize="9" fill="#6b7280">平面贴合</text>
                      </svg>
                    }
                  />
                  <MethodPickCard
                    active={method === 'spot' && requiredMethod === 'spot'}
                    disabled={requiredMethod === 'facet'}
                    disabledNote={requiredMethod === 'facet' ? '本样品为刻面型，应使用刻面法。' : undefined}
                    title="点测法"
                    desc="弧面接触，读取影点明暗交界"
                    onClick={() => handlePickMethodAndPlace('spot')}
                    sketch={
                      <svg viewBox="0 0 140 90" className="h-16 w-full">
                        <rect x="8" y="62" width="124" height="12" rx="2" fill="#d5dde7" />
                        <ellipse cx="70" cy="54" rx="26" ry="10" fill="#f4c98b" />
                        <ellipse cx="70" cy="54" rx="26" ry="10" fill="none" stroke="#a16207" strokeWidth="1.5" />
                        <line x1="44" y1="54" x2="96" y2="54" stroke="#111827" strokeWidth="1" strokeDasharray="3 2" />
                        <text x="18" y="18" fontSize="9" fill="#6b7280">弧面点测</text>
                      </svg>
                    }
                  />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setShowMethodPicker(false)} className="btn-ghost px-3 py-1.5 text-xs">
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {showPolarizerPicker && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 px-4 backdrop-blur-[1px]">
              <div className="w-full max-w-[520px] rounded-2xl border border-line bg-white p-4 shadow-card">
                <div className="mb-1 text-sm font-semibold text-ink">观察前：是否使用偏光片</div>
                <p className="mb-3 text-xs leading-relaxed text-ink-3">
                  {method === 'facet' ? (
                    <>
                      刻面法大平面进光，<strong>加偏光片</strong>常使明暗界更利落实线，便于
                      <strong>精确到三位</strong>；若不加，边界易毛、半影变宽，<strong>难精准读数</strong>。已按本流程默认
                      勾选“使用偏光片”，可按实际转动偏光至最清晰位。
                    </>
                  ) : (
                    <>
                      点测法为远视小圆影，<strong>加偏光片常干扰偏振态与亮暗分布</strong>，小影与半影易虚、易漂，课堂与教材中多提示
                      <strong>易造成读数不清</strong>。一般 <strong>不用偏光片、裸眼对影点</strong> 更稳；已默认
                      不选偏光，两位小数为点测常用近似值。
                    </>
                  )}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <MethodPickCard
                    active={usePolarizer}
                    title="使用偏光片"
                    desc={method === 'facet' ? '套于目镜外缘并转动，多为教学推荐，交界更实' : '点测场景慎用：小影与交界易发虚、读数易漂'}
                    actionLabel="确认并进入观察"
                    tone={method === 'facet' ? 'recommend' : 'caution'}
                    badge={method === 'facet' ? '推荐' : '慎用'}
                    onClick={() => handleObserveConfirm(true)}
                    sketch={
                      <svg viewBox="0 0 140 90" className="h-16 w-full">
                        <rect x="6" y="20" width="32" height="50" rx="4" fill="#94a3b8" />
                        <rect x="12" y="32" width="20" height="20" rx="2" fill="#1e293b" />
                        <circle cx="88" cy="42" r="20" fill="none" stroke="#0f172a" strokeWidth="2" />
                        <line x1="88" y1="22" x2="88" y2="62" stroke="#0f172a" strokeWidth="1.2" />
                        <line x1="68" y1="42" x2="108" y2="42" stroke="#0f172a" strokeWidth="1.2" />
                        <text x="8" y="14" fontSize="9" fill="#64748b">套在目镜外</text>
                      </svg>
                    }
                  />
                  <MethodPickCard
                    active={!usePolarizer}
                    title="不使用偏光片"
                    desc={method === 'spot' ? '远视点测常规：影点与交界相对稳定，两小数更可靠' : '刻面法可选，但无偏光时边界常不够实，精读更吃力'}
                    actionLabel="确认并进入观察"
                    tone={method === 'spot' ? 'recommend' : 'caution'}
                    badge={method === 'spot' ? '推荐' : '慎用'}
                    onClick={() => handleObserveConfirm(false)}
                    sketch={
                      <svg viewBox="0 0 140 90" className="h-16 w-full">
                        <rect x="6" y="20" width="32" height="50" rx="4" fill="#94a3b8" />
                        <rect x="12" y="32" width="20" height="20" rx="2" fill="#1e293b" />
                        <text x="48" y="40" fontSize="9" fill="#64748b">无附加偏光</text>
                        <path d="M48 50 L100 32 L100 58 Z" fill="none" stroke="#9ca3af" strokeWidth="1.2" strokeDasharray="3 2" />
                        <line x1="100" y1="44" x2="120" y2="44" stroke="#9ca3af" strokeWidth="1" />
                      </svg>
                    }
                  />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setShowPolarizerPicker(false)} className="btn-ghost px-3 py-1.5 text-xs">
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-[2] flex-col border-l border-line-2/80">
          <section
            ref={obsZoneRef}
            className="flex min-h-0 flex-[3] flex-col border-b border-line-2/80 bg-gradient-to-b from-[#fff9d5] to-[#fff3a6] px-3 py-3 text-ink"
          >
            <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-1 flex-col items-stretch gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-0.5 text-xs font-semibold text-ink">
                  <span>🔍 观察窗口</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {sample && state.observed && (
                      <span
                        className="font-mono text-[9px] uppercase tracking-widest text-ink-4"
                        data-testid={mode === 'detection' ? 'unknown-sample-label' : undefined}
                      >
                        {sampleLabel}
                      </span>
                    )}
                  </div>
                </div>
              {!state.sampleOn && !forcedSampleId && (
                <p className="px-0.5 text-[9px] text-ink-4">方法在「放置样品」弹窗中确认。</p>
              )}
              {state.observed && !polarizerMatchesRecommend && (
                <p className="px-0.5 text-[9px] leading-tight text-amber-800">
                  与常规建议{method === 'facet' ? '（刻面宜加偏光）' : '（点测宜关偏光）'}不一致，读数可能
                  {method === 'facet' ? '难取准' : '发虚'}。
                </p>
              )}

              <div className="flex items-center justify-center gap-3">
                {view === 'spot' && state.observed && (
                  <div
                    className="flex w-14 shrink-0 items-center justify-center rounded-xl bg-white/35 px-2 py-3 shadow-soft backdrop-blur-[1px]"
                    style={{ height: `${Math.max(220, Math.round(obsSize * 0.78))}px` }}
                  >
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.001}
                      value={spotSlider}
                      onChange={(e) => setSpotSlider(parseFloat(e.target.value))}
                      className="spot-vertical-slider h-full w-8 cursor-pointer appearance-none bg-transparent"
                      style={{ writingMode: 'vertical-rl', direction: 'rtl' }}
                      aria-label="点测影点纵向滑动"
                    />
                  </div>
                )}
                <ObservationWindow
                  view={view}
                  sample={sample}
                  size={obsSize}
                  spotSlider={spotSlider}
                  facetSample01={facetSample01}
                  facetPol01={facetPol01}
                  usePolarizer={usePolarizer}
                  showReading={method === 'facet' ? facetRecordUnlocked : (view === 'spot' ? true : state.observed)}
                />
              </div>

              {state.observed && (
                <details className="group mt-0.5 rounded-xl border-2 border-amber-300/80 bg-gradient-to-b from-amber-50 to-amber-50/50 ring-1 ring-amber-200/50 open:pb-2">
                  <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-bold text-amber-950 [&::-webkit-details-marker]:hidden">
                    {method === 'facet' ? '刻面法' : '点测法（远视法）'}
                    <span className="font-normal text-ink-2"> · 观察姿势</span>
                    <span className="ml-1.5 text-[9px] font-medium text-amber-800/90">
                      {method === 'facet' ? '（单眼同轴、目距至边界最实）' : '（眼距约 30–35cm、对正影点）'}
                    </span>
                    <span className="ml-1 text-[9px] text-brand-600">▼ 展开全文</span>
                  </summary>
                  <p className="px-2 pb-1 text-[10px] leading-relaxed text-ink-2">
                    {method === 'facet' ? (
                      <>
                        单眼观察。眼部自然靠近目镜头端，使视轴与光轴同轴，直至视域中明暗边界与刻线最清晰。可微动头部轻调眼距、找到最清晰工作距，避免用力压迫镜筒导致虚焦。
                      </>
                    ) : (
                      <>
                        正坐、头位稳。对光轴，单眼对向目镜。眼睛与目镜头端保持
                        <strong> 约 30–35cm </strong>
                        的“远视法”工作距，与《珠宝首饰鉴定》类教材/常见培训中点测法眼距类同。在头位前后、上下小范围移动，使点状影与半明半暗交界对正刻度后再读数，结果两位小数为常用近似值。
                      </>
                    )}
                  </p>
                </details>
              )}
            </div>
          </section>

          <aside className="flex min-h-0 flex-[2] bg-[#0c1d3a] text-ink">
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-white px-2 py-2 text-ink">
              <div className="flex min-h-0 flex-col gap-1.5 text-ink">
                <div className="rounded-lg border border-line bg-white p-2 shadow-soft">
                  <div className="mb-1 text-xs font-semibold text-ink">📝 数据记录</div>
                  {mode === 'detection' && state.observed ? (
                    isOverOilSample ? (
                      <div
                        className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] leading-relaxed text-amber-800"
                        data-testid="refractometer-over-oil-note"
                      >
                        视场仅见截止于 1.780 的阴影边界。该样品在折射仪下的记录与结论应为：
                        <strong> 折射率 {'>'} 1.780</strong>（超折射油，无法直接给出 RI 精确值）。
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <DataInputRow
                          label="折射率读数"
                          value={method === 'spot' && sample ? getSpotDisplayRi(sample.characteristics.refractiveIndex).toFixed(2) : userRiMin}
                          onChange={setUserRiMin}
                          unit="nD"
                          placeholder={method === 'spot' && sample ? getSpotDisplayRi(sample.characteristics.refractiveIndex).toFixed(2) : truthRI.min.toFixed(3)}
                          readOnly={method === 'spot'}
                          testId="refractometer-record-ri"
                        />
                        {method === 'facet' && (
                          <DataInputRow
                            label="高值（双折射）"
                            value={userRiMax}
                            onChange={setUserRiMax}
                            unit="nD"
                            placeholder={truthRI.max.toFixed(3)}
                          />
                        )}
                        <DataInputRow
                          label="双折射率"
                          value={userBire}
                          onChange={setUserBire}
                          unit=""
                          placeholder={truthRI.dr ? truthRI.dr.toFixed(3) : '0.000'}
                        />
                      </div>
                    )
                  ) : (
                    <div className="space-y-1.5">
                      <DataReadOnly
                        label="折射率"
                        value={
                          state.observed
                            ? isOverOilSample
                              ? '> 1.780'
                              : truthRI.min === truthRI.max
                              ? truthRI.min.toFixed(3)
                              : `${truthRI.min.toFixed(3)} – ${truthRI.max.toFixed(3)}`
                            : '—'
                        }
                        unit="nD"
                      />
                      <DataReadOnly
                        label="双折射率"
                        value={state.observed ? (isOverOilSample ? '—' : truthRI.dr.toFixed(3)) : '—'}
                      />
                      <DataReadOnly
                        label="光性"
                        value={
                          state.observed && sample
                            ? OPTICAL_LABEL[sample.characteristics.opticalCharacter]
                            : '—'
                        }
                      />
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!state.observed || (method === 'facet' && !facetRecordUnlocked)}
                      data-testid="refractometer-save"
                      className="btn-primary flex-1"
                      style={{ background: instrument.themeHex }}
                    >
                      💾 {mode === 'detection' ? '提交检测结果' : '保存数据'}
                    </button>
                    <button type="button" onClick={handleReset} className="btn-ghost px-3">
                      ↺ 重置
                    </button>
                  </div>
                  {state.recorded && mode === 'learning' && (
                    <div className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700 ring-1 ring-emerald-200">
                      ✓ 已完成本次实验，可切换样品继续练习。
                    </div>
                  )}
                </div>

                {!isAnisotropicHint(sample) && state.observed && mode === 'learning' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] leading-relaxed text-amber-800">
                    <div className="mb-1 font-semibold">观察解析</div>
                    {sample && renderHint(sample, view, method)}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

function isAnisotropicHint(sample?: SampleDef) {
  if (!sample) return true;
  return !isAnisotropic(sample.characteristics.opticalCharacter);
}

function renderHint(sample: SampleDef, view: RefractometerView, method: 'facet' | 'spot') {
  const ri = sample.characteristics.refractiveIndex;
  const optical = sample.characteristics.opticalCharacter;
  if (ri === 'over-1.78' || view === 'over-range') {
    return <p>当前样品 RI 高于折射油，仅见截止于 1.780 的阴影边界；记录与结论应为“折射率 &gt; 1.780”。</p>;
  }
  if (method === 'spot') {
    return <p>点测法读取上半圆暗、下半圆亮的圆形影像点交界处对应的刻度值，结果保留两位小数。</p>;
  }
  if (optical === 'isotropic') {
    return <p>转动样品时阴影边界位置不变，可初步判断为均质体。</p>;
  }
  if (optical === 'uniaxial-positive' || optical === 'uniaxial-negative') {
    return (
      <p>
        一轴晶在刻面法中常见“单动单静”：转动样品时一条边界基本稳定，另一条在真值区间内往返；配合偏光可交替突出高值边界，便于分别取读。
      </p>
    );
  }
  if (optical === 'biaxial-positive' || optical === 'biaxial-negative') {
    return (
      <p>
        二轴晶表现为“两条都动”：转动样品时两条边界均在主折射率区间内变化；配合偏光调节高值层暗度，可分离两条边界并分别读取极值。
      </p>
    );
  }
  if (optical === 'aggregate') {
    return (
      <p>
        多晶集合体在折射仪下常不呈稳定可分的标准双边界。本演示保守处理为油层参考，避免误判为一轴或二轴的典型模式。
      </p>
    );
  }
  return (
    <p>
      转动样品 360°，观察两条阴影边界的运动情况。两条都移动 → 二轴晶；一条移动一条不动 → 一轴晶。
    </p>
  );
}

// ----- 子组件 -----
function ModeBtn({
  active,
  themeHex,
  onClick,
  icon,
  label,
  disabled,
}: {
  active: boolean;
  themeHex: string;
  onClick: () => void;
  icon: string;
  label: string;
  disabled?: boolean;
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

function MethodPickCard({
  active,
  disabled = false,
  disabledNote,
  title,
  desc,
  sketch,
  actionLabel = '选择并放置样品',
  tone = 'default',
  badge,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  disabledNote?: string;
  title: string;
  desc: string;
  sketch: JSX.Element;
  actionLabel?: string;
  tone?: 'default' | 'recommend' | 'caution';
  badge?: string;
  onClick: () => void;
}) {
  const toneClass =
    !disabled && tone === 'recommend'
      ? 'ring-1 ring-emerald-300/90 bg-emerald-50/35'
      : !disabled && tone === 'caution'
        ? 'ring-1 ring-amber-400/80 bg-amber-50/40'
        : '';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'relative rounded-xl border p-3 text-left transition',
        disabled
          ? 'cursor-not-allowed border-line/60 bg-slate-50/50 opacity-55'
          : active
            ? 'border-brand bg-brand-50/40'
            : 'border-line hover:border-brand-200',
        toneClass,
      )}
    >
      {badge && !disabled && (
        <span
          className={clsx(
            'absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold',
            tone === 'recommend' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900',
          )}
        >
          {badge}
        </span>
      )}
      <div className="overflow-hidden rounded-lg border border-line bg-slate-50/70 px-2 py-1">
        {sketch}
      </div>
      <div className="mt-2 text-sm font-semibold text-ink">{title}</div>
      <div className="mt-0.5 text-xs text-ink-3">{desc}</div>
      {disabled && disabledNote && (
        <p className="mt-1.5 text-[10px] leading-snug text-amber-800/90">{disabledNote}</p>
      )}
      <div className="mt-2 text-xs font-medium text-brand">{actionLabel}</div>
    </button>
  );
}

function DataInputRow({
  label,
  value,
  onChange,
  unit,
  placeholder,
  readOnly = false,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  placeholder?: string;
  readOnly?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-ink-3">{label}</span>
      <input
        type="number"
        step="0.001"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        data-testid={testId}
        className={clsx(
          'flex-1 rounded border border-line-2 px-2 py-1 font-mono text-sm focus:border-brand focus:outline-none',
          readOnly && 'bg-slate-50 text-ink-2',
        )}
      />
      {unit && <span className="w-6 text-right text-ink-4">{unit}</span>}
    </div>
  );
}

function DataReadOnly({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-ink-3">{label}</span>
      <div className="flex-1 rounded border border-line bg-brand-50/30 px-2 py-1 font-mono text-sm text-ink">
        {value}
      </div>
      {unit && <span className="w-6 text-right text-ink-4">{unit}</span>}
    </div>
  );
}

// ============================================================
// 状态机：根据当前 state 决定 currentStep / view
// ============================================================
function computeCurrentStep(s: DemoState): StepId | null {
  if (!s.power) return 'power';
  if (!s.oil) return 'oil';
  if (!s.sampleOn) return 'sample';
  if (!s.observed) return 'observe';
  if (!s.recorded) return 'record';
  return null;
}

function isStepDone(id: StepId, s: DemoState): boolean {
  switch (id) {
    case 'power':
      return s.power;
    case 'oil':
      return s.oil;
    case 'sample':
      return s.sampleOn;
    case 'observe':
      return s.observed;
    case 'record':
      return s.recorded;
  }
}

function computeView(
  s: DemoState,
  sample: SampleDef | undefined,
  method: 'facet' | 'spot',
): RefractometerView {
  if (!s.power) return 'off';
  if (!s.oil) return 'scale-only';
  if (!s.observed) return 'oil-empty';
  if (!sample) return 'oil-empty';
  const ri = sample.characteristics.refractiveIndex;
  if (isOverOilLimit(ri)) return 'over-range';
  if (method === 'spot') return 'spot';
  if (sample.characteristics.opticalCharacter === 'isotropic') return 'single';
  return 'double';
}

function isOverOilLimit(ri: SampleDef['characteristics']['refractiveIndex']): boolean {
  if (ri === 'over-1.78') return true;
  if (typeof ri === 'number') return ri > 1.78;
  return Math.max(ri[0], ri[1]) > 1.78;
}
