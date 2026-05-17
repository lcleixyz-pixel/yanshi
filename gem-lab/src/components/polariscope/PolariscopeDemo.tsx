import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type CSSProperties,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import HotPoint from '@/components/demo/HotPoint';
import ObjectFitHotspotFrame from '@/components/demo/ObjectFitHotspotFrame';
import StepGuide, { type DemoStep } from '@/components/demo/StepGuide';
import RotationKnob from '@/components/refractometer/RotationKnob';
import ObservationCanvas, {
  computePhenomenonBrightness,
  type PolariscopeSampleShape,
} from '@/components/polariscope/ObservationCanvas';
import { INSTRUMENTS } from '@/data/instruments';
import { SAMPLES, SAMPLES_BY_ID } from '@/data/samples';
import { useDetection } from '@/store/detectionStore';
import { useProgress } from '@/store/progressStore';
import type { InstrumentDef, OpticalCharacter, SampleDef } from '@/data/types';
import { OPTICAL_LABEL } from '@/utils/format';
import clsx from '@/utils/clsx';

type DemoMode = 'learning' | 'detection';
type LearningView = 'overview' | 'align-upper-polar' | 'place-sample' | 'live-use' | 'result-summary';
type PolariscopeLearningResponse =
  | 'anisotropic-four-bright-dark'
  | 'isotropic-all-dark'
  | 'aggregate-continuous-bright'
  | 'opaque-not-applicable';
type PolariscopeLocatorPart = 'upper-polar' | 'sample-gap' | 'stage';
type LearningFocusTransition =
  | 'overview-to-align-upper-polar'
  | 'align-upper-polar-to-place-sample'
  | 'place-sample-to-live-use'
  | 'live-use-to-result-summary';
type LearningFocusTarget = 'upper-polar' | 'sample-gap' | 'live-observation' | 'result-summary';
type LearningTransitionCue = {
  focusLabel: string;
  key: string;
  label: string;
  target: LearningFocusTarget;
  transition: LearningFocusTransition;
};
type StepId = 'power' | 'crossed' | 'place' | 'rotate' | 'record';
const STEP_ORDER: StepId[] = ['power', 'crossed', 'place', 'rotate', 'record'];

const STEP_META: Record<StepId, { iconId: string; title: string; tip: string }> = {
  power: { iconId: 'power-on', title: '打开 LED 光源', tip: '点击仪器右侧的 LED 开关' },
  crossed: {
    iconId: 'rotate',
    title: '将上偏光片调至正交（机械校准）',
    tip: '绕竖轴旋转上偏光片环，使它与下偏光片振动方向垂直；确认后再进入放样',
  },
  place: { iconId: 'place-sample', title: '放置样品', tip: '点击载物台中央放置样品' },
  rotate: {
    iconId: 'rotate',
    title: '旋转载物台 360°，观察明暗变化',
    tip: '沿载物台外缘旋转，记录明暗交替次数',
  },
  record: { iconId: 'record', title: '记录现象与判定结果', tip: '在右侧面板填写' },
};

/**
 * 热点坐标（相对于仪器图 0–1）
 */
const POLAR_LAYOUT = {
  hotpoint: {
    power:    { x: 0.82, y: 0.72, side: 'right' as const },
    upper:    { x: 0.62, y: 0.13, side: 'right' as const },
    stage:    { x: 0.52, y: 0.38, side: 'left'  as const },
  },
} as const;

const POLAR_LOCATOR_TARGETS: Record<PolariscopeLocatorPart, { x: number; y: number }> = {
  'upper-polar': { x: 0.59, y: 0.15 },
  'sample-gap': { x: 0.59, y: 0.34 },
  stage: { x: 0.59, y: 0.50 },
};

/**
 * 载物台「自动旋转」速度（仅影响「▶ 自动旋转」按钮，不影响手动旋转载物台）。
 * 每毫秒增加的 rotation01 增量 = STAGE_AUTO_ROTATE_DEG_PER_MS / 360。
 * 调慢：减小 STAGE_AUTO_ROTATE_DEG_PER_MS；调快：增大该值（原约 0.06）。
 */
const STAGE_AUTO_ROTATE_DEG_PER_MS = 0.028;

/**
 * 观察窗口布局微调参数（手动调整入口）
 * - 调小圆形视域：减小 widthRatio / zoneHeightRatio / viewportMaxRatio
 * - 调大圆形视域：增大以上比例
 * - 调整最小/最大圆径：改 minSize / maxSize
 */
const OBS_LAYOUT = {
  viewportMaxRatio: 0.50,
  zoneHeightRatio: 0.68,
  widthRatio: 0.78,
  minSize: 210,
  maxSize: 520,
} as const;

const UPPER_POLAR_TOP_IMAGE = '/assets/observations/polariscope/upper-polar.png';

interface DemoState {
  power: boolean;
  polarPosition: 'crossed' | 'parallel';
  crossed: boolean;
  sampleOn: boolean;
  rotated: boolean;
  recorded: boolean;
}

const INITIAL_STATE: DemoState = {
  power: false,
  polarPosition: 'parallel',
  crossed: false,
  sampleOn: false,
  rotated: false,
  recorded: false,
};

export default function PolariscopeDemo({
  forcedSampleId,
  embedded = false,
  qaReady = false,
  onDetectionComplete,
}: {
  forcedSampleId?: string;
  embedded?: boolean;
  qaReady?: boolean;
  onDetectionComplete?: () => void;
}) {
  const instrument = INSTRUMENTS.polariscope;
  const navigate = useNavigate();

  const [mode, setMode] = useState<DemoMode>(embedded ? 'detection' : 'learning');
  const [state, setState] = useState<DemoState>(INITIAL_STATE);
  const [learningView, setLearningView] = useState<LearningView>('overview');
  const [upperPolarAngle, setUpperPolarAngle] = useState(0);
  const [rotation01, setRotation01] = useState(0); // RotationKnob 0–1
  const [autoRotating, setAutoRotating] = useState(false);

  // 旋转角度 0–360°
  const rotation = rotation01 * 360;

  // 旋转观察完成标记（需经历亮 + 暗各至少一次）
  const [observed, setObserved] = useState<Set<'bright' | 'dark'>>(new Set());
  const [knobReady, setKnobReady] = useState(false);
  const lastLearningStageAngle = useRef(0);
  const learningStageSweep = useRef(0);

  // 样品
  const [learningSampleId, setLearningSampleId] = useState('amethyst');
  const [previewSampleId, setPreviewSampleId] = useState<string | null>(null);
  const sampleId = forcedSampleId ?? learningSampleId;
  const sample = SAMPLES_BY_ID[sampleId];
  const sampleLabel = mode === 'detection' ? '未知样品' : sample?.name;
  const optical = sample?.characteristics.opticalCharacter;
  const opaqueForStandardPolariscope = sample?.characteristics.transparency === '不透明';
  const effectiveOptical = opaqueForStandardPolariscope ? undefined : optical;
  const learningResponse = getPolariscopeLearningResponse(sample);

  // 检测会话
  const setPolariscopeData = useDetection((s) => s.setPolariscope);
  const markInstrument = useDetection((s) => s.markInstrument);
  const markDemoComplete = useProgress((s) => s.markDemoComplete);

  // 用户判断（检测模式）
  const [userJudgement, setUserJudgement] = useState<
    'isotropic' | 'anisotropic' | 'aggregate' | ''
  >('');
  const [userPhenomena, setUserPhenomena] = useState({
    fourBright: false,
    allDark: false,
    allBright: false,
  });
  const selectedPhenomenaCount = [
    userPhenomena.fourBright,
    userPhenomena.allDark,
    userPhenomena.allBright,
  ].filter(Boolean).length;
  const opaqueDetectionReady = mode === 'detection' && opaqueForStandardPolariscope && state.sampleOn;
  const opaqueLearningReady =
    mode === 'learning' && learningResponse === 'opaque-not-applicable' && state.sampleOn;
  const canSave =
    !!sample &&
    (opaqueDetectionReady ||
      opaqueLearningReady ||
      (!opaqueForStandardPolariscope &&
        state.rotated &&
        (mode === 'learning' || (selectedPhenomenaCount === 1 && userJudgement !== ''))));

  useEffect(() => {
    if (!qaReady || !sample) return;
    const nextPhenomena = opaqueForStandardPolariscope
      ? { fourBright: false, allDark: false, allBright: false }
      : optical === 'isotropic'
        ? { fourBright: false, allDark: true, allBright: false }
        : optical === 'aggregate'
          ? { fourBright: false, allDark: false, allBright: true }
          : { fourBright: true, allDark: false, allBright: false };
    setState({
      power: true,
      polarPosition: 'crossed',
      crossed: true,
      sampleOn: true,
      rotated: true,
      recorded: false,
    });
    setObserved(new Set(['bright', 'dark']));
    setKnobReady(true);
    setAutoRotating(false);
    setUserPhenomena(nextPhenomena);
    setUserJudgement(
      opaqueForStandardPolariscope
        ? ''
        : optical === 'isotropic'
          ? 'isotropic'
          : optical === 'aggregate'
            ? 'aggregate'
            : 'anisotropic',
    );
  }, [qaReady, sample, optical, opaqueForStandardPolariscope]);

  // 观察窗尺寸自适应
  const obsZoneRef = useRef<HTMLDivElement>(null);
  const [obsSize, setObsSize] = useState(300);
  useLayoutEffect(() => {
    const el = obsZoneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w < 48) return;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
      const maxByViewport = Math.floor(vh * OBS_LAYOUT.viewportMaxRatio);
      const maxByH = h > 64 ? Math.floor(h * OBS_LAYOUT.zoneHeightRatio) : maxByViewport;
      const s = Math.min(OBS_LAYOUT.maxSize, w * OBS_LAYOUT.widthRatio, maxByViewport, maxByH);
      setObsSize(Math.round(Math.max(OBS_LAYOUT.minSize, s)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 自动旋转
  const rafRef = useRef<number>();
  useEffect(() => {
    if (!autoRotating) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setRotation01((r) => (r + (dt * STAGE_AUTO_ROTATE_DEG_PER_MS) / 360) % 1);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [autoRotating]);

  // 旋转过程中记录亮/暗
  const { view: canvasView, brightness } = computePhenomenonBrightness(
    rotation,
    effectiveOptical,
    state.polarPosition,
  );

  useEffect(() => {
    if (!state.power || !state.crossed || !state.sampleOn) return;
    if (brightness > 0.5) setObserved((s) => new Set(s).add('bright'));
    else setObserved((s) => new Set(s).add('dark'));
  }, [rotation, brightness, state.power, state.crossed, state.sampleOn]);

  useEffect(() => {
    if (observed.has('bright') && observed.has('dark') && !state.rotated) {
      setState((s) => ({ ...s, rotated: true, recorded: false }));
    }
  }, [observed, state.rotated]);

  const resetObservationState = () => {
    setRotation01(0);
    setAutoRotating(false);
    setObserved(new Set());
    setKnobReady(false);
    lastLearningStageAngle.current = 0;
    learningStageSweep.current = 0;
    setUserJudgement('');
    setUserPhenomena({ fourBright: false, allDark: false, allBright: false });
  };

  const markRotationReady = () => {
    setKnobReady(true);
    setState((s) => (
      s.power && s.crossed && s.sampleOn
        ? { ...s, rotated: true, recorded: false }
        : s
    ));
  };

  const setSinglePhenomenon = (key: 'fourBright' | 'allDark' | 'allBright', checked: boolean) => {
    setUserPhenomena({
      fourBright: key === 'fourBright' ? checked : false,
      allDark: key === 'allDark' ? checked : false,
      allBright: key === 'allBright' ? checked : false,
    });
  };

  // 步骤
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

  // 热点点击
  const handleHotpoint = (id: 'power' | 'upper' | 'stage') => {
    if (id === 'power') {
      if (state.power) {
        setState(INITIAL_STATE);
        resetObservationState();
      } else {
        setState((s) => ({ ...s, power: true, recorded: false }));
      }
    } else if (id === 'upper' && state.power) {
      const nextPolarPosition = state.polarPosition === 'crossed' ? 'parallel' : 'crossed';
      resetObservationState();
      setState((s) => ({
        ...s,
        polarPosition: nextPolarPosition,
        crossed: nextPolarPosition === 'crossed',
        rotated: false,
        recorded: false,
      }));
    } else if (id === 'stage' && state.power) {
      if (!state.sampleOn) {
        resetObservationState();
        setState((s) => ({ ...s, sampleOn: true, rotated: false, recorded: false }));
        if (mode === 'learning') {
          setPreviewSampleId(sampleId);
        }
      } else {
        resetObservationState();
        setState((s) => ({ ...s, sampleOn: false, rotated: false, recorded: false }));
      }
    }
  };

  const handleReset = () => {
    setState(INITIAL_STATE);
    setLearningView('overview');
    setUpperPolarAngle(0);
    resetObservationState();
  };

  const handleSave = () => {
    if (!canSave) return;
    if (mode === 'detection') {
      let ph: 'four-bright-four-dark' | 'all-dark' | 'all-bright' | 'anomalous' | null = null;
      if (userPhenomena.fourBright) ph = 'four-bright-four-dark';
      else if (userPhenomena.allBright) ph = 'all-bright';
      else if (userPhenomena.allDark) ph = 'all-dark';
      setPolariscopeData({
        rotation,
        phenomenon: opaqueForStandardPolariscope ? null : ph,
        optical: opaqueForStandardPolariscope ? null : userJudgement || null,
        notes: opaqueForStandardPolariscope ? '不透明样品，标准偏光镜透射法不适用' : '',
      });
      markInstrument('polariscope');
      onDetectionComplete?.();
    }
    setState((s) => ({ ...s, recorded: true }));
    markDemoComplete({ instrumentId: 'polariscope', mode, completedAt: Date.now() });
  };

  // 计算 canvas 视图状态
  const activeCanvasView = !state.power
    ? 'off'
    : !state.sampleOn
      ? (state.polarPosition === 'crossed' ? 'crossed-dark' : 'parallel')
      : canvasView;

  // 当前光性文字标注
  const opticalHint = renderOpticalHint(
    learningResponse,
    optical,
    brightness,
    state.polarPosition,
    state.sampleOn,
  );
  const upperCrossedReady = isUpperPolarCrossed(upperPolarAngle);
  const learningSampleShape = getPolariscopeSampleShape(sample);

  const beginLearningOperation = () => {
    setState((s) => ({
      ...s,
      power: true,
      polarPosition: 'parallel',
      crossed: false,
      sampleOn: false,
      rotated: false,
      recorded: false,
    }));
    resetObservationState();
    setUpperPolarAngle(0);
    setLearningView('align-upper-polar');
  };

  const commitUpperPolarAngle = (angle: number) => {
    if (!isUpperPolarCrossed(angle)) return;
    resetObservationState();
    setState((s) => ({
      ...s,
      power: true,
      polarPosition: 'crossed',
      crossed: true,
      sampleOn: false,
      rotated: false,
      recorded: false,
    }));
    setLearningView('place-sample');
  };

  const placeLearningSample = () => {
    resetObservationState();
    lastLearningStageAngle.current = 0;
    learningStageSweep.current = 0;
    setState((s) => ({
      ...s,
      power: true,
      polarPosition: 'crossed',
      crossed: true,
      sampleOn: true,
      rotated: learningResponse === 'opaque-not-applicable',
      recorded: false,
    }));
    setPreviewSampleId(null);
  };

  const startLearningStageRotation = () => {
    if (!state.sampleOn) return;
    setLearningView('live-use');
  };

  const updateLearningStageAngle = (angle: number) => {
    const previous = lastLearningStageAngle.current;
    const delta = signedAngleDelta(previous, angle);
    lastLearningStageAngle.current = angle;
    learningStageSweep.current += Math.abs(delta);
    setRotation01(angle / 360);

    const sweepAngles = sampleSweepAngles(previous, angle);
    setObserved((current) => {
      const next = new Set(current);
      for (const sweepAngle of sweepAngles) {
        const phenomenon = computePhenomenonBrightness(
          sweepAngle,
          effectiveOptical,
          state.polarPosition,
        );
        if (phenomenon.brightness > 0.5) next.add('bright');
        else next.add('dark');
      }
      return next.size === current.size ? current : next;
    });

    if (learningStageSweep.current >= 90) {
      setKnobReady(true);
      setState((s) => (
        s.power && s.crossed && s.sampleOn
          ? { ...s, rotated: true, recorded: false }
          : s
      ));
    }
  };

  const finishLearningRun = () => {
    if (!canSave) return;
    handleSave();
    setLearningView('result-summary');
  };

  if (mode === 'learning') {
    return (
      <PolariscopeLearningExperience
        activeCanvasView={activeCanvasView}
        autoRotating={autoRotating}
        beginLearningOperation={beginLearningOperation}
        brightness={brightness}
        canSave={canSave}
        embedded={embedded}
        finishLearningRun={finishLearningRun}
        handleReset={handleReset}
        instrument={instrument}
        learningSampleId={learningSampleId}
        learningView={learningView}
        mode={mode}
        navigateHome={() => navigate('/')}
        observed={observed}
        onStageAngleChange={updateLearningStageAngle}
        opticalHint={opticalHint}
        placeLearningSample={placeLearningSample}
        progress={progress}
        response={learningResponse}
        rotation={rotation}
        sample={sample}
        sampleShape={learningSampleShape}
        samplePlaced={state.sampleOn}
        sampleLabel={sampleLabel}
        startLearningStageRotation={startLearningStageRotation}
        setAutoRotating={setAutoRotating}
        setLearningSampleId={setLearningSampleId}
        setMode={setMode}
        setUpperPolarAngle={setUpperPolarAngle}
        stepsData={stepsData}
        upperPolarAngle={upperPolarAngle}
        commitUpperPolarAngle={commitUpperPolarAngle}
        crossedReady={upperCrossedReady}
      />
    );
  }

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
          <span className="font-display text-base text-white/70">- 检测模式</span>
          {sample && (
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
        {/* ── 左：仪器交互区 ── */}
        <section className="relative flex-[3] overflow-hidden bg-gradient-to-br from-[#f6f9fd] via-white to-[#eef4fb] text-ink">
          {/* 左上：模式切换 + 进度 + 步骤 */}
          <div className="absolute left-3 top-3 z-20 w-[min(95%,24rem)] rounded-xl border border-line bg-white/90 p-2 shadow-card backdrop-blur">
            <div className="grid grid-cols-2 gap-1">
              <ModeBtn
                active={false}
                themeHex={instrument.themeHex}
                onClick={() => setMode('learning')}
                icon="📖"
                label="学习模式"
              />
              <ModeBtn
                active
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

          {/* 左栏主区：仪器加宽约 68%，略向右（ml）；右侧 pr 固定预留旋钮位，避免跳动 */}
          <div className="flex h-full min-h-0 w-full flex-col pt-14 md:pt-[4.75rem]">
            <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-8 pr-32 md:pr-36">
              <div className="relative ml-10 aspect-square min-h-[220px] w-[68%] min-w-0 max-h-full max-w-[min(78dvh,96vw)] shrink-0 translate-x-3 md:ml-16 md:translate-x-7">
                <ObjectFitHotspotFrame
                  src={instrument.productImage}
                  alt={instrument.name}
                  className="h-full w-full"
                  hotspotLayerClassName="z-[28]"
                >
                  {state.power && (
                    <PolarUpperPolarHints
                      x={POLAR_LAYOUT.hotpoint.upper.x}
                      y={POLAR_LAYOUT.hotpoint.upper.y}
                      title={
                        state.polarPosition === 'crossed' ? '上偏光片（正交）' : '上偏光片（平行）'
                      }
                      sub={
                        state.polarPosition === 'crossed'
                          ? '已旋至与下偏光片正交 · 点击切回平行'
                          : '绕竖轴旋转环至正交 · 点击模拟一步到位'
                      }
                      isDone={state.polarPosition === 'crossed'}
                    />
                  )}
                  <span
                    className={clsx(
                      'absolute bottom-[26%] right-[18%] h-3 w-3 rounded-full',
                      state.power
                        ? 'animate-soft-pulse bg-emerald-400 shadow-[0_0_12px_2px_rgba(74,222,128,0.8)]'
                        : 'bg-slate-400',
                    )}
                  />
                  <HotPoint
                    x={POLAR_LAYOUT.hotpoint.power.x}
                    y={POLAR_LAYOUT.hotpoint.power.y}
                    label="LED 开关"
                    sub="点击切换电源"
                    side={POLAR_LAYOUT.hotpoint.power.side}
                    themeHex={instrument.themeHex}
                    status={state.power ? 'done' : currentStep === 'power' ? 'active' : 'disabled'}
                    onClick={() => handleHotpoint('power')}
                  />
                  <HotPoint
                    x={POLAR_LAYOUT.hotpoint.upper.x}
                    y={POLAR_LAYOUT.hotpoint.upper.y}
                    label={
                      state.polarPosition === 'crossed'
                        ? '上偏光片（正交），已旋至与下偏光片正交，点击切回平行'
                        : '上偏光片（平行），绕竖轴旋转环至正交，点击模拟一步到位'
                    }
                    showLabel={false}
                    themeHex={state.polarPosition === 'crossed' ? instrument.themeHex : '#d97706'}
                    status={
                      !state.power
                        ? 'disabled'
                        : state.crossed
                          ? 'done'
                          : currentStep === 'crossed'
                            ? 'active'
                            : 'active'
                    }
                    onClick={() => handleHotpoint('upper')}
                  />
                  <HotPoint
                    x={POLAR_LAYOUT.hotpoint.stage.x}
                    y={POLAR_LAYOUT.hotpoint.stage.y}
                    label={state.sampleOn ? '载物台（已放样品）' : '载物台'}
                    sub={state.sampleOn ? '点击取下样品' : '点击放置样品'}
                    side={POLAR_LAYOUT.hotpoint.stage.side}
                    themeHex={instrument.themeHex}
                    status={state.sampleOn ? 'done' : currentStep === 'place' ? 'active' : 'disabled'}
                    onClick={() => handleHotpoint('stage')}
                  />
                </ObjectFitHotspotFrame>
              </div>
            </div>
          </div>

          {state.sampleOn && state.power && state.crossed && (
            <div className="absolute right-3 top-1/2 z-30 max-w-[min(8.5rem,calc(100%-1rem))] -translate-y-1/2 md:right-4">
              <div className="rounded-xl border border-line bg-white/95 p-3 shadow-card backdrop-blur">
                <RotationKnob
                  value={rotation01}
                  onChange={(v) => {
                    setAutoRotating(false);
                    setRotation01(v);
                  }}
                  onReady={markRotationReady}
                  label="旋转载物台"
                  hint="旋转旋钮带动样品"
                  ready={knobReady}
                  size={110}
                  themeHex={instrument.themeHex}
                />
                <button
                  type="button"
                  onClick={() => setAutoRotating((v) => !v)}
                  className={clsx(
                    'mt-2 w-full rounded px-2 py-1 text-[11px] font-medium ring-1 transition',
                    autoRotating
                      ? 'bg-violet-600 text-white ring-violet-600'
                      : 'bg-white text-ink-2 ring-line-2 hover:bg-violet-50',
                  )}
                >
                  {autoRotating ? '⏸ 停止自动' : '▶ 自动旋转'}
                </button>
              </div>
            </div>
          )}

          {/* 底部提示 */}
          {tip && (
            <div className="absolute bottom-3 left-1/2 z-20 max-w-[min(96%,28rem)] -translate-x-1/2 rounded-full border border-line-2 bg-white/90 px-3 py-1.5 text-center text-xs text-ink-2 shadow-card backdrop-blur">
              <span className="mr-1">💡</span>{tip}
            </div>
          )}

          {/* 光源状态角标 */}
          <div className="absolute bottom-3 left-3 rounded-lg border border-line bg-white/85 px-3 py-2 text-xs shadow-card backdrop-blur">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-4">光源状态</div>
            <div className={clsx('mt-0.5 flex items-center gap-1.5 font-semibold', state.power ? 'text-emerald-600' : 'text-slate-500')}>
              <span className={clsx('h-2 w-2 rounded-full', state.power ? 'animate-soft-pulse bg-emerald-500' : 'bg-slate-400')} />
              {state.power ? '已开启' : '已关闭'}
            </div>
          </div>

          {/* 样品预览弹窗 */}
          {previewSampleId && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]">
              <div className="w-full max-w-[320px] rounded-2xl border border-line bg-white p-4 shadow-card">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold text-ink">
                    {SAMPLES_BY_ID[previewSampleId]?.name ?? '样品预览'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewSampleId(null)}
                    className="btn-ghost px-2 py-1 text-xs"
                  >
                    关闭
                  </button>
                </div>
                <img
                  src={SAMPLES_BY_ID[previewSampleId]?.image}
                  alt={SAMPLES_BY_ID[previewSampleId]?.name ?? '样品预览'}
                  className="mx-auto h-44 w-44 rounded-xl bg-brand-50/40 object-contain p-2 ring-1 ring-line"
                  draggable={false}
                />
                {SAMPLES_BY_ID[previewSampleId]?.characteristics.opticalCharacter && (
                  <div className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-[11px] text-violet-800 ring-1 ring-violet-200">
                    光性：{OPTICAL_LABEL[SAMPLES_BY_ID[previewSampleId]!.characteristics.opticalCharacter]}
                    {SAMPLES_BY_ID[previewSampleId]?.characteristics.pleochroism && (
                      <div className="mt-0.5 text-ink-3">
                        多色性：{SAMPLES_BY_ID[previewSampleId]!.characteristics.pleochroism}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── 右：观察窗 + 数据记录 ── */}
        <section className="flex min-h-0 flex-[2] flex-col border-l border-line-2/80">
          {/* 上：观察窗 */}
          <section
            ref={obsZoneRef}
            className="flex min-h-0 flex-[3] flex-col border-b border-line-2/80 bg-gradient-to-b from-[#fff9d5] to-[#fff3a6] px-3 py-3 text-ink"
          >
            <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-1 flex-col items-stretch gap-1.5">
              {/* 顶部信息行：观察位置示意 / 样品名 / 标题，均限制在观察窗口内 */}
              <div className="flex min-w-0 items-start justify-between gap-2 px-0.5">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink">
                  <span>🔍 观察窗口</span>
                  {sample && state.sampleOn && (
                    <span
                      className="font-mono text-[9px] uppercase tracking-widest text-ink-4"
                      data-testid={mode === 'detection' ? 'unknown-sample-label' : undefined}
                    >
                      {sampleLabel}
                    </span>
                  )}
                </div>
                <div className="shrink-0 max-w-[min(17rem,52%)]">
                  <ObservationPoseSchematic variant="inline" />
                </div>
              </div>

              <div className="flex min-h-0 flex-1 items-center justify-center">
                <ObservationCanvas
                  view={activeCanvasView}
                  brightness={brightness}
                  rotation={rotation}
                  sampleOn={state.sampleOn}
                  size={obsSize}
                />
              </div>

              {/* 观察姿势提示 */}
              {state.sampleOn && state.power && (
                <details className="group rounded-xl border-2 border-amber-300/80 bg-gradient-to-b from-amber-50 to-amber-50/50 ring-1 ring-amber-200/50 open:pb-2">
                  <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-bold text-amber-950 [&::-webkit-details-marker]:hidden">
                    偏光镜观察姿势
                    <span className="font-normal text-ink-2"> · 操作要点</span>
                    <span className="ml-1 text-[9px] text-brand-600">▼ 展开</span>
                  </summary>
                  <p className="max-h-24 overflow-y-auto px-2 pb-1 text-[10px] leading-relaxed text-ink-2">
                    将样品置于载物台中央，使光线从下方穿透。单眼俯视目镜，缓慢旋转载物台 360°，观察视场明暗变化次数。
                    每旋转 90° 经历一次亮暗交替（共四明四暗）通常为非均质体；始终全暗为均质体；样品持续透亮多见于可透光的多晶质集合体。
                    须从 2–3 个不同方向重复测试，以排除光轴方向导致的全暗假象。
                  </p>
                </details>
              )}
            </div>
          </section>

          {/* 下：数据记录 */}
          <aside className="flex min-h-0 flex-[2] flex-col bg-white">
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-3 text-ink">
              <div className="flex min-h-0 flex-col gap-2">
                <div className="rounded-lg border border-line bg-white p-2 shadow-soft">
                  <div className="mb-2 text-xs font-semibold text-ink">📝 数据记录</div>

                  {mode === 'detection' && opaqueForStandardPolariscope && (
                    <div
                      className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-800"
                      data-testid="polariscope-opaque-note"
                    >
                      当前未知样品不透明，标准偏光镜透射法不适用。可将本仪器记录为“不适用”，再换用折射仪点测或分光镜反射法交叉验证。
                    </div>
                  )}

                  {/* 现象勾选 */}
                  <div className="mb-1 text-[10px] text-ink-3">观察到的现象（可多选）</div>
                  <div className="space-y-1.5">
                    <Checkbox
                      label="四明四暗（非均质体）"
                      checked={
                        mode === 'detection'
                          ? userPhenomena.fourBright
                          : (!opaqueForStandardPolariscope && optical !== 'isotropic' && optical !== 'aggregate' && !!optical)
                      }
                      onChange={(v) => setSinglePhenomenon('fourBright', v)}
                      disabled={mode !== 'detection'}
                    />
                    <Checkbox
                      label="转动 360° 全暗（均质体）"
                      checked={
                        mode === 'detection'
                          ? userPhenomena.allDark
                          : (!opaqueForStandardPolariscope && optical === 'isotropic')
                      }
                      onChange={(v) => setSinglePhenomenon('allDark', v)}
                      disabled={mode !== 'detection'}
                    />
                    <Checkbox
                      label="转动 360° 样品持续亮（多晶质集合体）"
                      checked={
                        mode === 'detection'
                          ? userPhenomena.allBright
                          : (!opaqueForStandardPolariscope && optical === 'aggregate')
                      }
                      onChange={(v) => setSinglePhenomenon('allBright', v)}
                      disabled={mode !== 'detection'}
                    />
                  </div>

                  {/* 光性判定 */}
                  <div className="mt-2 mb-1 text-[10px] text-ink-3">宝石光性判定</div>
                  <select
                    value={mode === 'detection' ? userJudgement : optical ?? ''}
                    onChange={(e) => setUserJudgement(e.target.value as typeof userJudgement)}
                    disabled={mode !== 'detection'}
                    className="w-full rounded border border-line-2 bg-brand-50/30 px-2 py-1 text-xs disabled:bg-white"
                  >
                    <option value="">请选择…</option>
                    <option value="isotropic">均质体</option>
                    <option value="anisotropic">非均质体（一轴 / 二轴晶）</option>
                    <option value="aggregate">多晶质集合体</option>
                  </select>

                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!canSave}
                      data-testid="polariscope-save"
                      className="btn-primary flex-1 text-xs"
                      style={{ background: instrument.themeHex }}
                    >
                      💾 提交检测结果
                    </button>
                    <button type="button" onClick={handleReset} className="btn-ghost px-3 text-xs">
                      ↺ 重置
                    </button>
                  </div>

                  {state.recorded && (
                    <div
                      className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-700 ring-1 ring-emerald-200"
                      data-testid="polariscope-detection-recorded"
                    >
                      ✓ 已提交检测结果。
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

interface PolariscopeLearningExperienceProps {
  activeCanvasView: ReturnType<typeof computePhenomenonBrightness>['view'] | 'off' | 'crossed-dark' | 'parallel';
  autoRotating: boolean;
  beginLearningOperation: () => void;
  brightness: number;
  canSave: boolean;
  crossedReady: boolean;
  embedded: boolean;
  finishLearningRun: () => void;
  handleReset: () => void;
  instrument: InstrumentDef;
  learningSampleId: string;
  learningView: LearningView;
  mode: DemoMode;
  navigateHome: () => void;
  observed: Set<'bright' | 'dark'>;
  onStageAngleChange: (angle: number) => void;
  opticalHint: ReactNode;
  placeLearningSample: () => void;
  progress: number;
  response: PolariscopeLearningResponse | undefined;
  rotation: number;
  sample: SampleDef | undefined;
  sampleShape: PolariscopeSampleShape;
  samplePlaced: boolean;
  sampleLabel: string | undefined;
  startLearningStageRotation: () => void;
  setAutoRotating: Dispatch<SetStateAction<boolean>>;
  setLearningSampleId: Dispatch<SetStateAction<string>>;
  setMode: Dispatch<SetStateAction<DemoMode>>;
  setUpperPolarAngle: Dispatch<SetStateAction<number>>;
  stepsData: DemoStep[];
  upperPolarAngle: number;
  commitUpperPolarAngle: (angle: number) => void;
}

function PolariscopeLearningExperience({
  activeCanvasView,
  autoRotating,
  beginLearningOperation,
  brightness,
  canSave,
  crossedReady,
  embedded,
  finishLearningRun,
  handleReset,
  instrument,
  learningSampleId,
  learningView,
  mode,
  navigateHome,
  observed,
  onStageAngleChange,
  opticalHint,
  placeLearningSample,
  progress,
  response,
  rotation,
  sample,
  sampleShape,
  samplePlaced,
  sampleLabel,
  startLearningStageRotation,
  setAutoRotating,
  setLearningSampleId,
  setMode,
  setUpperPolarAngle,
  stepsData,
  upperPolarAngle,
  commitUpperPolarAngle,
}: PolariscopeLearningExperienceProps) {
  const viewLabel = getLearningViewLabel(learningView);
  const upperPolarBrightness = computeUpperPolarTransmission(upperPolarAngle);
  const upperPolarBrightnessLabel = getUpperPolarBrightnessLabel(upperPolarBrightness);
  const transitionCue = useLearningTransitionCue(learningView);
  const phenomenonState: 'bright' | 'dark' =
    brightness > 0.5 || activeCanvasView === 'parallel' ? 'bright' : 'dark';
  const phenomenonLabels = getLearningPhenomenonLabels(response);

  return (
    <div className="flex h-screen flex-col bg-[#111827] text-white">
      <header
        className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-5"
        style={{
          background: `linear-gradient(90deg, ${instrument.themeHex}30 0%, rgba(15,37,69,0.88) 60%)`,
        }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to={`/knowledge/${instrument.id}`}
            className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-300 hover:text-lab-cyan"
          >
            ← 知识库
          </Link>
          <span className="text-white/30">|</span>
          <span className="font-display text-base font-semibold">{instrument.name}互动演示</span>
          <span className="font-display text-base text-white/70">- 学习模式</span>
          <span className="hidden rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] text-cyan-100 md:inline">
            {viewLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={navigateHome}
          className="rounded border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:bg-white/10"
        >
          ✕ 退出
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-rows-[auto,1fr] bg-[#f3f6f8] text-ink lg:grid-cols-[minmax(14rem,18rem),1fr] lg:grid-rows-1">
        <aside className="flex max-h-[38dvh] min-h-0 flex-col overflow-y-auto border-b border-slate-200 bg-white/95 p-3 shadow-[0_10px_40px_rgba(15,23,42,0.08)] lg:max-h-none lg:border-b-0 lg:border-r lg:shadow-[10px_0_40px_rgba(15,23,42,0.08)]">
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

          <div className="mt-3 rounded-lg border border-line bg-white px-3 py-2">
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

          <div className="mt-3">
            <StepGuide steps={stepsData} themeHex={instrument.themeHex} variant="inline" />
          </div>

          <div className="mt-3 rounded-lg border border-line bg-slate-50 p-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-4">演示样品</div>
            <select
              value={learningSampleId}
              onChange={(e) => {
                setLearningSampleId(e.target.value);
                handleReset();
              }}
              className="mt-1 w-full rounded border border-line-2 bg-white px-2 py-1 text-xs"
            >
              {SAMPLES.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {sample && (
              <div className="mt-2 flex items-center gap-2 rounded-md bg-white p-2 ring-1 ring-line">
                <img
                  src={sample.image}
                  alt={sample.name}
                  className="h-12 w-12 rounded bg-brand-50/40 object-contain p-1"
                  draggable={false}
                />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-ink">{sampleLabel}</div>
                  <div className="mt-0.5 text-[10px] text-ink-3">
                    {OPTICAL_LABEL[sample.characteristics.opticalCharacter]}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-auto flex gap-2 pt-3">
            <button type="button" onClick={handleReset} className="btn-ghost flex-1 text-xs">
              ↺ 重置
            </button>
            {learningView === 'live-use' && (
              <button
                type="button"
                onClick={() => setAutoRotating((v) => !v)}
                className={clsx(
                  'flex-1 rounded px-2 py-1 text-xs font-medium ring-1 transition',
                  autoRotating
                    ? 'bg-violet-600 text-white ring-violet-600'
                    : 'bg-white text-ink-2 ring-line-2 hover:bg-violet-50',
                )}
              >
                {autoRotating ? '停止自动' : '自动旋转'}
              </button>
            )}
          </div>
        </aside>

        <main className="relative min-h-0 overflow-y-auto bg-[radial-gradient(circle_at_50%_20%,#ffffff_0%,#f1f5f9_42%,#d9e2ec_100%)] lg:overflow-hidden">
          <div
            key={learningView}
            data-testid="polariscope-learning-status"
            className="absolute left-5 top-5 z-20 animate-scale-in rounded-lg border border-white/70 bg-white/90 px-3 py-2 shadow-card backdrop-blur"
          >
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-4">当前状态</div>
            <div className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-ink">
              <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full" style={{ backgroundColor: instrument.themeHex }} />
              {viewLabel}
            </div>
          </div>

          {transitionCue && (
            <div
              key={transitionCue.key}
              data-testid="polariscope-transition-cue"
              className="pointer-events-none absolute left-1/2 top-5 z-30 flex -translate-x-1/2 animate-drop-in items-center gap-2 rounded-full border border-white/80 bg-white/95 px-4 py-2 text-xs font-semibold text-ink shadow-lift backdrop-blur"
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: instrument.themeHex }} />
              {transitionCue.label}
            </div>
          )}

          {transitionCue && transitionCue.transition !== 'live-use-to-result-summary' && (
            <PolariscopeFocusTransitionOverlay
              cue={transitionCue}
              themeHex={instrument.themeHex}
            />
          )}

          {learningView === 'overview' && (
            <section
              data-testid="polariscope-overview-state"
              className="flex h-full min-h-0 flex-col items-center justify-center px-8 py-8"
            >
              <div className="relative aspect-square w-[min(62vh,84vw,34rem)] lg:w-[min(66vh,48vw,34rem)]">
                <ObjectFitHotspotFrame src={instrument.productImage} alt={instrument.name} className="h-full w-full">
                  <HotPoint
                    x={POLAR_LAYOUT.hotpoint.power.x}
                    y={POLAR_LAYOUT.hotpoint.power.y}
                    label="LED 光源"
                    sub="提供自下而上的透射光"
                    side={POLAR_LAYOUT.hotpoint.power.side}
                    themeHex={instrument.themeHex}
                    status="active"
                  />
                  <HotPoint
                    x={POLAR_LAYOUT.hotpoint.upper.x}
                    y={POLAR_LAYOUT.hotpoint.upper.y}
                    label="上偏光片"
                    sub="先旋至正交"
                    side={POLAR_LAYOUT.hotpoint.upper.side}
                    themeHex={instrument.themeHex}
                    status="active"
                  />
                  <HotPoint
                    x={POLAR_LAYOUT.hotpoint.stage.x}
                    y={POLAR_LAYOUT.hotpoint.stage.y}
                    label="载物台"
                    sub="放样后边转边看"
                    side={POLAR_LAYOUT.hotpoint.stage.side}
                    themeHex={instrument.themeHex}
                    status="active"
                  />
                </ObjectFitHotspotFrame>
              </div>
              <button
                type="button"
                data-testid="polariscope-start-learning"
                onClick={beginLearningOperation}
                className="btn-primary mt-5 px-7 py-2 text-sm"
                style={{ background: instrument.themeHex }}
              >
                开始操作
              </button>
            </section>
          )}

          {learningView === 'align-upper-polar' && (
            <section
              data-testid="polariscope-align-upper-state"
              className="grid min-h-full grid-cols-1 items-center gap-6 px-5 py-8 xl:grid-cols-[1fr,minmax(16rem,22rem)] xl:gap-8 xl:px-8"
            >
              <div className="flex min-h-0 items-center justify-center">
                  <div className="relative flex aspect-square w-[min(64vh,84vw,42rem)] items-center justify-center">
                  <div className="absolute inset-[8%] rounded-full bg-[#171717] shadow-[inset_0_0_60px_rgba(255,255,255,0.08),0_24px_80px_rgba(15,23,42,0.25)]" />
                  <AngleRingControl
                    angle={upperPolarAngle}
                    dataTestId="polariscope-upper-ring-control"
                    onAngleChange={setUpperPolarAngle}
                    className="absolute inset-[2%] rounded-full"
                  >
                    <img
                      src={UPPER_POLAR_TOP_IMAGE}
                      alt="上偏光片俯视图"
                      className="h-full w-full select-none rounded-full object-contain"
                      style={{ transform: `rotate(${upperPolarAngle}deg)` }}
                      draggable={false}
                    />
                  </AngleRingControl>
                  <div
                    data-testid="polariscope-upper-alignment-observation"
                    className="pointer-events-none absolute inset-[16%] overflow-hidden rounded-full border-4 border-black bg-[#0a0a0a] shadow-[inset_0_0_35px_rgba(255,255,255,0.12)]"
                  >
                    <span className="sr-only">校准观察视域</span>
                    <ObservationCanvas
                      view="upper-polar-calibration"
                      brightness={upperPolarBrightness}
                      rotation={upperPolarAngle}
                      sampleOn={false}
                      fill
                      showLabel={false}
                    />
                    <div className="absolute inset-x-0 top-4 flex justify-center">
                      <span className="rounded-full border border-white/20 bg-black/45 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                        校准观察视域
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="self-start rounded-lg border border-line bg-white/92 p-4 shadow-card backdrop-blur">
                <div className="font-mono text-[10px] uppercase tracking-widest text-ink-4">上偏光片</div>
                <h2 className="mt-1 text-lg font-semibold text-ink">旋转刻度环至 90° 正交位</h2>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <MetricPill label="当前角度" value={`${Math.round(upperPolarAngle)}°`} />
                  <MetricPill
                    label="视域反馈"
                    value={upperPolarBrightnessLabel}
                    tone={crossedReady ? 'good' : 'warn'}
                  />
                </div>
                <PolariscopeInstrumentLocator
                  activePart="upper-polar"
                  instrumentImage={instrument.productImage}
                  themeHex={instrument.themeHex}
                />
                <div
                  data-testid="polariscope-upper-brightness-state"
                  className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-ink-2"
                >
                  视域反馈：{upperPolarBrightnessLabel}
                  <span className="mx-1 text-ink-4">|</span>
                  {crossedReady ? '正交位已对准' : '继续调至 90°'}
                </div>
                <p className="mt-4 text-xs leading-relaxed text-ink-2">
                  上偏光片位于视线最上层。旋转刻度环时，中央校准视域会随上下偏光片夹角连续变亮或变暗；到达正交范围后仍可继续微调。
                </p>
                <button
                  type="button"
                  data-testid="polariscope-confirm-upper-polar"
                  onClick={() => commitUpperPolarAngle(upperPolarAngle)}
                  disabled={!crossedReady}
                  className="btn-primary mt-4 w-full py-2 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ background: instrument.themeHex }}
                >
                  确认正交，进入放样
                </button>
                {crossedReady && (
                  <p className="mt-2 text-center text-[11px] text-emerald-700">
                    已到可用范围，仍可继续微调；点击确认后再进入放样。
                  </p>
                )}
              </div>
            </section>
          )}

          {learningView === 'place-sample' && (
            <section
              data-testid="polariscope-place-sample-state"
              className="grid min-h-full grid-cols-1 items-center gap-6 px-5 py-8 xl:grid-cols-[1fr,minmax(16rem,22rem)] xl:gap-8 xl:px-8"
            >
              <div className="relative mx-auto aspect-square w-[min(62vh,84vw,40rem)]">
                <ObjectFitHotspotFrame src={instrument.productImage} alt={instrument.name} className="h-full w-full">
                  <HotPoint
                    x={POLAR_LAYOUT.hotpoint.stage.x}
                    y={POLAR_LAYOUT.hotpoint.stage.y}
                    label="载物台"
                    sub={samplePlaced ? '点击开始旋转观察' : '点击放置样品'}
                    side={POLAR_LAYOUT.hotpoint.stage.side}
                    themeHex={instrument.themeHex}
                    status="active"
                    onClick={samplePlaced ? startLearningStageRotation : placeLearningSample}
                  />
                  {samplePlaced && (
                    <button
                      type="button"
                      data-testid="polariscope-stage-start-rotation"
                      aria-label="点击载物台开始旋转观察"
                      onClick={startLearningStageRotation}
                      className="absolute z-[3] -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-200 bg-white/85 px-3 py-1.5 text-xs font-semibold text-violet-800 shadow-card transition hover:bg-violet-50"
                      style={{
                        left: `${POLAR_LAYOUT.hotpoint.stage.x * 100}%`,
                        top: `${(POLAR_LAYOUT.hotpoint.stage.y + 0.13) * 100}%`,
                      }}
                    >
                      点击载物台开始旋转观察
                    </button>
                  )}
                  {samplePlaced && sample && (
                    <img
                      data-testid="polariscope-sample-transfer-cue"
                      src={sample.image}
                      alt=""
                      aria-hidden="true"
                      className="absolute left-[52%] top-[40%] z-[3] h-16 w-16 animate-sample-transfer rounded-full bg-white/70 object-contain p-1 shadow-card ring-1 ring-white/70 motion-reduce:animate-none"
                      draggable={false}
                    />
                  )}
                </ObjectFitHotspotFrame>
              </div>
              <div className="rounded-lg border border-line bg-white/92 p-4 shadow-card backdrop-blur">
                <div className="font-mono text-[10px] uppercase tracking-widest text-ink-4">放样</div>
                <h2 className="mt-1 text-lg font-semibold text-ink">
                  {samplePlaced ? '样品已进入光路' : '样品进入上下偏光片之间'}
                </h2>
                {sample && (
                  <img
                    src={sample.image}
                    alt={sample.name}
                    className="mt-4 h-28 w-28 rounded-lg bg-brand-50/40 object-contain p-2 ring-1 ring-line"
                    draggable={false}
                  />
                )}
                <PolariscopeInstrumentLocator
                  activePart="sample-gap"
                  instrumentImage={instrument.productImage}
                  themeHex={instrument.themeHex}
                />
                {samplePlaced && (
                  <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-[11px] font-medium text-violet-900">
                    样品已放入上偏光片与载物台之间。下一步请点击载物台开始旋转观察。
                  </div>
                )}
                <button
                  type="button"
                  data-testid="polariscope-place-sample"
                  onClick={samplePlaced ? startLearningStageRotation : placeLearningSample}
                  className={clsx(
                    'btn-primary mt-4 w-full py-2 text-sm',
                    samplePlaced && 'bg-slate-900',
                  )}
                  style={samplePlaced ? undefined : { background: instrument.themeHex }}
                >
                  {samplePlaced ? '点击载物台，进入同步观察' : '放置样品'}
                </button>
              </div>
            </section>
          )}

          {learningView === 'live-use' && (
            <section
              data-testid="polariscope-live-use-state"
              className="grid min-h-full grid-cols-1 items-center gap-6 px-5 py-8 xl:grid-cols-[1fr,minmax(16rem,23rem)] xl:gap-8 xl:px-8"
            >
              <div className="flex items-center justify-center">
                <IntegratedLiveUseControl
                  activeCanvasView={activeCanvasView}
                  brightness={brightness}
                  observed={observed}
                  onStageAngleChange={onStageAngleChange}
                  response={response}
                  rotation={rotation}
                  sampleShape={sampleShape}
                  setAutoRotating={setAutoRotating}
                  themeHex={instrument.themeHex}
                />
              </div>

              <div className="self-start rounded-lg border border-line bg-white/92 p-4 shadow-card backdrop-blur">
                <div className="font-mono text-[10px] uppercase tracking-widest text-ink-4">同步使用</div>
                <h2 className="mt-1 text-lg font-semibold text-ink">边旋转载物台，边看样品视域</h2>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <MetricPill label="载物台角度" value={`${Math.round(rotation)}°`} />
                  <PhenomenonStatusPill
                    brightLabel={phenomenonLabels.bright}
                    darkLabel={phenomenonLabels.dark}
                    phenomenon={phenomenonState}
                    themeHex={instrument.themeHex}
                  />
                </div>
                <PolariscopeInstrumentLocator
                  activePart="stage"
                  instrumentImage={instrument.productImage}
                  themeHex={instrument.themeHex}
                />
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-ink-2">
                  <div className="font-semibold text-ink">操作关系</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-slate-900" />
                    眼睛：只看圆形观察视域
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    手：沿视域外围或样品区域旋转载物台
                  </div>
                </div>
                <div
                  data-testid="polariscope-live-hint"
                  className="mt-4 min-h-[7.25rem] rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900"
                >
                  {opticalHint}
                </div>
                <button
                  type="button"
                  onClick={finishLearningRun}
                  disabled={!canSave}
                  className="btn-primary mt-4 w-full py-2 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ background: instrument.themeHex }}
                >
                  完成本轮观察
                </button>
              </div>
            </section>
          )}

          {learningView === 'result-summary' && (
            <section
              data-testid="polariscope-result-summary-state"
              className="flex h-full min-h-0 items-center justify-center px-8 py-8"
            >
              <div className="w-full max-w-xl rounded-lg border border-line bg-white p-6 text-center shadow-card">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-700 ring-1 ring-emerald-200">
                  ✓
                </div>
                <h2 className="mt-4 text-xl font-semibold text-ink">偏光镜同步观察已完成</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-2">
                  这一轮里你先调正上偏光片，再把样品放入光路，最后通过旋转下层载物台外缘同步观察中央视域的明暗变化。
                </p>
                {sample && (
                  <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
                    本样品光性：{OPTICAL_LABEL[sample.characteristics.opticalCharacter]}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleReset}
                  className="btn-primary mt-5 px-6 py-2 text-sm"
                  style={{ background: instrument.themeHex }}
                >
                  再练一次
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function useLearningTransitionCue(learningView: LearningView) {
  const previousViewRef = useRef<LearningView>(learningView);
  const timeoutRef = useRef<number | null>(null);
  const [cue, setCue] = useState<LearningTransitionCue | null>(null);

  useEffect(() => {
    const previousView = previousViewRef.current;
    if (previousView === learningView) return;
    previousViewRef.current = learningView;

    const nextCue = getLearningTransitionCue(previousView, learningView);
    if (!nextCue) return;
    if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current);
    setCue({ ...nextCue, key: `${previousView}-${learningView}-${Date.now()}` });
    timeoutRef.current = window.setTimeout(() => {
      setCue(null);
      timeoutRef.current = null;
    }, 1800);
  }, [learningView]);

  useEffect(() => (
    () => {
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current);
    }
  ), []);

  return cue;
}

function getLearningTransitionCue(
  previousView: LearningView,
  nextView: LearningView,
): Omit<LearningTransitionCue, 'key'> | null {
  if (previousView === 'overview' && nextView === 'align-upper-polar') {
    return {
      focusLabel: '视线移至上偏光片操作区',
      label: '电源已开启，开始调整上偏光片',
      target: 'upper-polar',
      transition: 'overview-to-align-upper-polar',
    };
  }
  if (previousView === 'align-upper-polar' && nextView === 'place-sample') {
    return {
      focusLabel: '视线沿光路落到放样位置',
      label: '已正交，进入放样',
      target: 'sample-gap',
      transition: 'align-upper-polar-to-place-sample',
    };
  }
  if (previousView === 'place-sample' && nextView === 'live-use') {
    return {
      focusLabel: '视线切换到上层圆形观察视域',
      label: '样品已进入光路，开始同步观察',
      target: 'live-observation',
      transition: 'place-sample-to-live-use',
    };
  }
  if (previousView === 'live-use' && nextView === 'result-summary') {
    return {
      focusLabel: '视线回到观察结论',
      label: '本轮观察完成',
      target: 'result-summary',
      transition: 'live-use-to-result-summary',
    };
  }
  return null;
}

const POLAR_FOCUS_TARGET_FRAMES: Record<LearningFocusTarget, CSSProperties> = {
  'upper-polar': {
    borderRadius: '9999px',
    height: '82%',
    left: '8%',
    top: '7%',
    width: '84%',
  },
  'sample-gap': {
    borderRadius: '9999px',
    height: '58%',
    left: '12%',
    top: '15%',
    width: '76%',
  },
  'live-observation': {
    borderRadius: '9999px',
    height: '84%',
    left: '5%',
    top: '7%',
    width: '90%',
  },
  'result-summary': {
    borderRadius: '1.5rem',
    height: '56%',
    left: '24%',
    top: '20%',
    width: '52%',
  },
};

function PolariscopeFocusTransitionOverlay({
  cue,
  themeHex,
}: {
  cue: LearningTransitionCue;
  themeHex: string;
}) {
  const frameStyle = POLAR_FOCUS_TARGET_FRAMES[cue.target];
  const isIrisTransition = cue.transition === 'place-sample-to-live-use';

  return (
    <div
      key={`focus-${cue.key}`}
      data-testid="polariscope-focus-transition"
      data-focus-transition={cue.transition}
      data-focus-target={cue.target}
      aria-label={cue.focusLabel}
      aria-live="polite"
      className="pointer-events-none absolute inset-y-0 left-0 z-10 w-full overflow-hidden xl:w-[calc(100%-24.5rem)]"
    >
      <div
        className="absolute inset-0 animate-fade-in backdrop-blur-[1px] motion-reduce:animate-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(15,23,42,0.07) 0%, rgba(15,23,42,0.055) 74%, rgba(15,23,42,0) 100%)',
        }}
      />
      <div
        className="absolute animate-focus-zoom border bg-white/[0.025] motion-reduce:animate-none"
        style={{
          ...frameStyle,
          borderColor: `${themeHex}99`,
          boxShadow: `0 0 0 5px ${themeHex}0f, 0 18px 54px rgba(15,23,42,0.14)`,
        }}
      >
        <span
          className="absolute inset-[-6%] animate-target-breathe rounded-[inherit] border border-white/45 motion-reduce:animate-none"
          style={{ boxShadow: `0 0 18px ${themeHex}30` }}
        />
      </div>
      {isIrisTransition && (
        <span
          className="absolute animate-focus-iris rounded-full border motion-reduce:animate-none"
          style={{
            ...POLAR_FOCUS_TARGET_FRAMES['live-observation'],
            borderColor: `${themeHex}78`,
            boxShadow: `inset 0 0 20px ${themeHex}16, 0 0 24px ${themeHex}22`,
          }}
        />
      )}
      <span className="sr-only">{cue.focusLabel}</span>
    </div>
  );
}

function PolariscopeInstrumentLocator({
  activePart,
  instrumentImage,
  themeHex,
}: {
  activePart: PolariscopeLocatorPart;
  instrumentImage: string;
  themeHex: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [fit, setFit] = useState({
    boxHeight: 0,
    boxWidth: 0,
    height: 0,
    left: 0,
    top: 0,
    width: 0,
  });
  const target = POLAR_LOCATOR_TARGETS[activePart];
  const activeMeta: Record<
    PolariscopeLocatorPart,
    { badge: string; label: string; tone: 'dark' | 'warm'; hint: string }
  > = {
    'upper-polar': {
      badge: '调整这里',
      hint: '旋转这里，使上下偏光片进入正交',
      label: '正在调整：上偏光片',
      tone: 'dark',
    },
    'sample-gap': {
      badge: '放在这里',
      hint: '样品进入上偏光片与载物台之间',
      label: '放置样品：载物台中心',
      tone: 'warm',
    },
    stage: {
      badge: '旋转这里',
      hint: '旋转这里，样品随载物台同步旋转',
      label: '正在旋转：载物台',
      tone: 'warm',
    },
  };
  const meta = activeMeta[activePart];

  const updateFit = useCallback(() => {
    const box = boxRef.current;
    const img = imgRef.current;
    if (!box || !img?.naturalWidth) return;

    const boxWidth = box.clientWidth;
    const boxHeight = box.clientHeight;
    if (boxWidth < 1 || boxHeight < 1) return;

    const scale = Math.min(boxWidth / img.naturalWidth, boxHeight / img.naturalHeight);
    const width = img.naturalWidth * scale;
    const height = img.naturalHeight * scale;
    setFit({
      boxHeight,
      boxWidth,
      height,
      left: (boxWidth - width) / 2,
      top: (boxHeight - height) / 2,
      width,
    });
  }, []);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const img = imgRef.current;
    if (!box) return;

    const ro = new ResizeObserver(updateFit);
    ro.observe(box);
    img?.addEventListener('load', updateFit);
    updateFit();
    return () => {
      ro.disconnect();
      img?.removeEventListener('load', updateFit);
    };
  }, [instrumentImage, updateFit]);

  const targetX = fit.boxWidth > 0 ? fit.left + target.x * fit.width : 0;
  const targetY = fit.boxHeight > 0 ? fit.top + target.y * fit.height : 0;

  return (
    <div
      data-testid="polariscope-instrument-locator"
      data-active-part={activePart}
      data-target-x={target.x}
      data-target-y={target.y}
      className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-ink-4">当前操作部件</div>
          <div className="mt-1 text-xs font-semibold text-ink">{meta.label}</div>
        </div>
        <span
          className={clsx(
            'rounded-full px-2 py-1 text-[10px] font-semibold',
            meta.tone === 'warm' ? 'bg-amber-100 text-amber-800' : 'bg-slate-900 text-white',
          )}
        >
          {meta.badge}
        </span>
      </div>

      <div ref={boxRef} className="relative mt-3 h-40 overflow-hidden rounded-lg border border-white/70 bg-white/65">
        <img
          ref={imgRef}
          data-testid="polariscope-instrument-locator-image"
          src={instrumentImage}
          alt="偏光镜仪器定位图"
          className="h-full w-full object-contain"
          draggable={false}
        />
        <div
          key={activePart}
          data-testid="polariscope-locator-target"
          className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 animate-scale-in items-center justify-center"
          style={{ left: targetX, top: targetY }}
        >
          <span
            className="absolute h-9 w-9 animate-pulse-ring rounded-full border-2"
            style={{ borderColor: themeHex }}
          />
          <span
            className="absolute h-9 w-9 rounded-full border-2 bg-white/5"
            style={{
              borderColor: themeHex,
              boxShadow: `0 0 0 5px ${themeHex}24, 0 0 18px ${themeHex}66`,
            }}
          />
          <span
            className="relative h-2.5 w-2.5 rounded-full border-2 border-white shadow-card"
            style={{ backgroundColor: themeHex }}
          />
        </div>
        <div
          key={`arrow-${activePart}`}
          data-testid="polariscope-locator-arrow-cue"
          data-arrow-count="3"
          className="pointer-events-none absolute flex -translate-y-1/2 items-center gap-1"
          style={{ left: targetX + 22, top: targetY }}
          aria-hidden="true"
        >
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="h-2.5 w-2.5 rotate-[135deg] animate-locator-arrow-cue border-b-2 border-r-2 motion-reduce:animate-none"
              style={{
                animationDelay: `${index * 120}ms`,
                borderColor: themeHex,
              }}
            />
          ))}
        </div>
      </div>

      <div className="mt-2 flex min-h-10 items-start gap-2 rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-[11px] leading-snug text-ink-3">
        <span className="mt-1 h-2 w-2 flex-none rounded-full" style={{ backgroundColor: themeHex }} />
        <span>
          <span className="font-semibold text-ink">空间提示：</span>
          <span style={{ color: themeHex }}>{meta.hint}</span>
        </span>
      </div>
    </div>
  );
}

function IntegratedLiveUseControl({
  activeCanvasView,
  brightness,
  observed,
  onStageAngleChange,
  response,
  rotation,
  sampleShape,
  setAutoRotating,
  themeHex,
}: {
  activeCanvasView: ReturnType<typeof computePhenomenonBrightness>['view'] | 'off' | 'crossed-dark' | 'parallel';
  brightness: number;
  observed: Set<'bright' | 'dark'>;
  onStageAngleChange: (angle: number) => void;
  response: PolariscopeLearningResponse | undefined;
  rotation: number;
  sampleShape: PolariscopeSampleShape;
  setAutoRotating: Dispatch<SetStateAction<boolean>>;
  themeHex: string;
}) {
  const [stageDragging, setStageDragging] = useState(false);
  const [observationCue, setObservationCue] = useState<'bright' | 'dark' | null>(null);
  const cueTimeoutRef = useRef<number | null>(null);
  const previousObservedRef = useRef({ bright: observed.has('bright'), dark: observed.has('dark') });
  const observedLabel = getLearningProgressLabel(response, observed);
  const phenomenonState = brightness > 0.5 || activeCanvasView === 'parallel' ? 'bright' : 'dark';
  const phenomenonLabels = getLearningPhenomenonLabels(response);

  useEffect(() => {
    const nextObserved = { bright: observed.has('bright'), dark: observed.has('dark') };
    const nextCue =
      nextObserved.bright && !previousObservedRef.current.bright
        ? 'bright'
        : nextObserved.dark && !previousObservedRef.current.dark
          ? 'dark'
          : null;
    previousObservedRef.current = nextObserved;
    if (!nextCue) return;
    if (cueTimeoutRef.current != null) window.clearTimeout(cueTimeoutRef.current);
    setObservationCue(nextCue);
    cueTimeoutRef.current = window.setTimeout(() => {
      setObservationCue(null);
      cueTimeoutRef.current = null;
    }, 2200);
  }, [observed]);

  useEffect(() => (
    () => {
      if (cueTimeoutRef.current != null) window.clearTimeout(cueTimeoutRef.current);
    }
  ), []);

  return (
    <div className="flex w-[min(62vh,84vw,34rem)] flex-col items-center gap-3 xl:w-[min(70vh,44vw,36rem)]">
      <div className="relative aspect-square w-full">
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,#3a3228_0%,#161514_58%,#070707_100%)] shadow-[0_30px_100px_rgba(15,23,42,0.32)]" />
        <AngleRingControl
          angle={rotation}
          dataTestId="polariscope-stage-ring-control"
          onAngleChange={(angle) => {
            setAutoRotating(false);
            onStageAngleChange(angle);
          }}
          onDragStart={() => setStageDragging(true)}
          onDragEnd={() => setStageDragging(false)}
          className="absolute inset-[0.5%] rounded-full cursor-grab active:cursor-grabbing"
        >
          <div
            className={clsx(
              'absolute inset-0 rounded-full border border-white/10 bg-[radial-gradient(circle,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.02)_42%,rgba(0,0,0,0)_56%,rgba(0,0,0,0.24)_100%)] transition',
              stageDragging && 'shadow-[0_0_0_9px_rgba(245,158,11,0.16),inset_0_0_0_1px_rgba(255,255,255,0.16)]',
            )}
            aria-hidden="true"
          />
          <div
            className={clsx(
              'absolute inset-[11%] rounded-full border border-white/10 bg-[radial-gradient(circle,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.015)_38%,rgba(0,0,0,0)_64%)] transition-opacity',
              stageDragging ? 'opacity-100' : 'opacity-60',
            )}
            aria-hidden="true"
          />
        </AngleRingControl>

        <div className="pointer-events-none absolute inset-[10%] rounded-full border-[24px] border-[#0b0c0e] bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.16),inset_0_0_34px_rgba(255,255,255,0.08)]">
          <div
            data-testid="polariscope-live-observation"
            data-sample-shape={sampleShape}
            data-stage-angle={Math.round(rotation)}
            aria-label="偏光镜实时观察视域"
            className="absolute inset-[8%] flex items-center justify-center"
          >
            <ObservationCanvas
              view={activeCanvasView}
              brightness={brightness}
              rotation={rotation}
              sampleOn
              sampleShape={sampleShape}
              fill
              showLabel={false}
              showRotationScale={false}
            />
          </div>
        </div>
      </div>

      <div className="flex min-h-8 items-center justify-center">
        {observationCue && (
          <div
            key={observationCue}
            data-testid="polariscope-first-observation-cue"
            className={clsx(
              'animate-scale-in rounded-full border px-3 py-1 text-xs font-semibold shadow-card backdrop-blur',
              observationCue === 'bright'
                ? 'border-amber-200 bg-amber-50/95 text-amber-800'
                : 'border-slate-200 bg-slate-950/90 text-white',
            )}
          >
            {observationCue === 'bright'
              ? phenomenonLabels.brightCue
              : phenomenonLabels.darkCue}
          </div>
        )}
      </div>

      <div
        data-testid="polariscope-live-progress"
        className="rounded-full border border-line bg-white/92 px-4 py-2 text-center text-xs font-semibold text-ink shadow-card backdrop-blur"
      >
        <span>{observedLabel}</span>
        <span className="mx-2 text-ink-4">|</span>
        <span style={{ color: phenomenonState === 'bright' ? '#b45309' : themeHex }}>
          {phenomenonState === 'bright' ? phenomenonLabels.bright : phenomenonLabels.dark}
        </span>
      </div>
    </div>
  );
}

function AngleRingControl({
  angle,
  children,
  className,
  dataTestId,
  onDragEnd,
  onDragStart,
  onAngleChange,
  onRelease,
}: {
  angle: number;
  children: ReactNode;
  className?: string;
  dataTestId: string;
  onDragEnd?: () => void;
  onDragStart?: () => void;
  onAngleChange: (angle: number) => void;
  onRelease?: (angle: number) => void;
}) {
  const ringRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const latestAngle = useRef(angle);
  const onAngleChangeRef = useRef(onAngleChange);
  const onDragEndRef = useRef(onDragEnd);
  const onDragStartRef = useRef(onDragStart);
  const onReleaseRef = useRef(onRelease);

  useEffect(() => {
    latestAngle.current = angle;
  }, [angle]);

  useEffect(() => {
    onAngleChangeRef.current = onAngleChange;
    onDragEndRef.current = onDragEnd;
    onDragStartRef.current = onDragStart;
    onReleaseRef.current = onRelease;
  }, [onAngleChange, onDragEnd, onDragStart, onRelease]);

  const readAngle = useCallback((clientX: number, clientY: number) => {
    const rect = ringRef.current?.getBoundingClientRect();
    if (!rect) return latestAngle.current;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return latestAngle.current;
    return (Math.atan2(dy, dx) * 180) / Math.PI + 90 < 0
      ? (Math.atan2(dy, dx) * 180) / Math.PI + 450
      : (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!dragging.current) return;
      const next = Math.round(readAngle(event.clientX, event.clientY)) % 360;
      latestAngle.current = next;
      onAngleChangeRef.current(next);
    },
    [readAngle],
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.round(readAngle(event.clientX, event.clientY)) % 360;
      latestAngle.current = next;
      onAngleChangeRef.current(next);
    },
    [readAngle],
  );

  const endDrag = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('mouseup', endDrag);
    onDragEndRef.current?.();
    onReleaseRef.current?.(latestAngle.current);
  }, [handleMouseMove, handlePointerMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('mouseup', endDrag);
    };
  }, [endDrag, handleMouseMove, handlePointerMove]);

  return (
    <div
      ref={ringRef}
      data-testid={dataTestId}
      className={clsx('touch-none select-none cursor-grab active:cursor-grabbing', className)}
      onPointerDown={(event) => {
        event.preventDefault();
        dragging.current = true;
        onDragStartRef.current?.();
        const next = Math.round(readAngle(event.clientX, event.clientY)) % 360;
        latestAngle.current = next;
        onAngleChangeRef.current(next);
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('mouseup', endDrag);
      }}
    >
      {children}
    </div>
  );
}

function MetricPill({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  return (
    <div
      className={clsx(
        'rounded-lg border px-3 py-2',
        tone === 'good'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : tone === 'warn'
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-slate-200 bg-slate-50 text-ink',
      )}
    >
      <div className="font-mono text-[9px] uppercase tracking-widest opacity-60">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function PhenomenonStatusPill({
  brightLabel = '亮位',
  darkLabel = '暗位',
  phenomenon,
  themeHex,
}: {
  brightLabel?: string;
  darkLabel?: string;
  phenomenon: 'bright' | 'dark';
  themeHex: string;
}) {
  const bright = phenomenon === 'bright';
  return (
    <div
      data-testid="polariscope-phenomenon-status"
      data-phenomenon={phenomenon}
      className={clsx(
        'rounded-lg border px-3 py-2 transition-colors',
        bright
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-slate-200 bg-slate-50 text-ink',
      )}
    >
      <div className="font-mono text-[9px] uppercase tracking-widest opacity-60">现象</div>
      <div className="mt-1 flex min-h-5 items-center gap-2 text-sm font-semibold">
        <span
          key={`${phenomenon}-dot`}
          className={clsx(
            'h-2 w-2 rounded-full animate-scale-in',
            bright ? 'bg-amber-400 shadow-[0_0_14px_rgba(245,158,11,0.75)]' : 'bg-slate-900',
          )}
          style={bright ? undefined : { backgroundColor: themeHex }}
        />
        <span key={phenomenon} className="animate-fade-in">
          {bright ? brightLabel : darkLabel}
        </span>
      </div>
    </div>
  );
}

function getLearningViewLabel(view: LearningView): string {
  switch (view) {
    case 'overview':
      return '总览态';
    case 'align-upper-polar':
      return '上偏光片操作位';
    case 'place-sample':
      return '放样状态';
    case 'live-use':
      return '同步使用状态';
    case 'result-summary':
      return '结果反馈';
  }
}

function isUpperPolarCrossed(angle: number): boolean {
  return computeUpperPolarTransmission(angle) <= 0.05;
}

function computeUpperPolarTransmission(angle: number): number {
  const normalized = ((angle % 180) + 180) % 180;
  const cosTheta = Math.cos((normalized * Math.PI) / 180);
  return cosTheta * cosTheta;
}

function getUpperPolarBrightnessLabel(brightness: number): string {
  if (brightness <= 0.05) return '接近全暗';
  if (brightness > 0.5) return '透光';
  return '过渡变暗';
}

function getPolariscopeSampleShape(sample: SampleDef | undefined): PolariscopeSampleShape {
  if (!sample) return 'faceted-rectangle';
  if (
    sample.refractometerShape === 'cabochon' ||
    sample.category === '玉石' ||
    sample.characteristics.opticalCharacter === 'aggregate'
  ) {
    return 'cabochon-oval';
  }
  if (sample.refractometerShape === 'faceted') return 'faceted-rectangle';
  return 'round';
}

function getPolariscopeLearningResponse(sample: SampleDef | undefined): PolariscopeLearningResponse | undefined {
  if (!sample) return undefined;
  if (sample.characteristics.transparency === '不透明') return 'opaque-not-applicable';
  if (sample.characteristics.opticalCharacter === 'isotropic') return 'isotropic-all-dark';
  if (sample.characteristics.opticalCharacter === 'aggregate') return 'aggregate-continuous-bright';
  return 'anisotropic-four-bright-dark';
}

function getLearningPhenomenonLabels(response: PolariscopeLearningResponse | undefined): {
  bright: string;
  dark: string;
  brightCue: string;
  darkCue: string;
} {
  if (response === 'aggregate-continuous-bright') {
    return { bright: '持续亮', dark: '暗位', brightCue: '已见持续亮', darkCue: '已见暗位' };
  }
  if (response === 'isotropic-all-dark') {
    return { bright: '亮位', dark: '持续全暗', brightCue: '已见亮位', darkCue: '已确认持续全暗' };
  }
  if (response === 'opaque-not-applicable') {
    return { bright: '亮位', dark: '不适用', brightCue: '已见亮位', darkCue: '无有效透射响应' };
  }
  return { bright: '亮位', dark: '暗位', brightCue: '已见亮位', darkCue: '已见暗位' };
}

function getLearningProgressLabel(
  response: PolariscopeLearningResponse | undefined,
  observed: Set<'bright' | 'dark'>,
): string {
  if (response === 'opaque-not-applicable') {
    return '标准透射偏光镜不适用，无有效透射响应';
  }
  if (response === 'aggregate-continuous-bright') {
    return '样品持续透亮，旋转时保持亮反应';
  }
  if (response === 'isotropic-all-dark') {
    return observed.has('dark') ? '样品持续全暗，旋转时无亮位' : '开始旋转，确认是否持续全暗';
  }
  if (observed.has('bright') && observed.has('dark')) return '已见亮位 / 暗位';
  if (observed.has('bright')) return '已见亮位，继续旋转找暗位';
  if (observed.has('dark')) return '已见暗位，继续旋转找亮位';
  return '继续旋转，观察明暗变化';
}

function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

function signedAngleDelta(from: number, to: number): number {
  const delta = normalizeAngle(to) - normalizeAngle(from);
  if (delta > 180) return delta - 360;
  if (delta < -180) return delta + 360;
  return delta;
}

function sampleSweepAngles(from: number, to: number): number[] {
  const delta = signedAngleDelta(from, to);
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / 15));
  return Array.from({ length: steps }, (_, i) => normalizeAngle(from + (delta * (i + 1)) / steps));
}

// ── 观察解析文字 ──────────────────────────────────────────────
function renderOpticalHint(
  response: PolariscopeLearningResponse | undefined,
  optical: OpticalCharacter | undefined,
  brightness: number,
  polarPosition: 'crossed' | 'parallel',
  sampleOn: boolean,
): ReactNode {
  if (!sampleOn) return <p>放置样品后即可在正交偏光下观察明暗变化。</p>;
  if (polarPosition === 'parallel') {
    return (
      <p>
        当前为<strong>平行偏光</strong>（视场全亮）：上、下偏光片振动方向一致。正交偏光需<strong>绕竖轴旋转上偏光片</strong>，使与下偏光片振动方向垂直；本演示中点击上偏光片热点模拟「已旋至正交」。平行偏光亦可观察多色性（有色非均质体不同方向颜色差异）。
      </p>
    );
  }
  if (!optical) return <p>放置样品并旋转，观察视场明暗变化。</p>;

  if (response === 'opaque-not-applicable') {
    return (
      <p>
        该样品为<strong>不透明样品</strong>，<strong>标准透射偏光镜不适用</strong>：光线无法有效穿过样品，因此不会得到可靠的四明四暗、持续亮或全暗透射响应。此时应记录为无有效透射响应，并改用反射光观察或其他检测方法。
      </p>
    );
  }
  if (response === 'isotropic-all-dark') {
    return <p>转动载物台 360°，样品与背景始终保持全暗、无亮位——这是<strong>均质体</strong>的典型特征。等轴晶系宝石（如石榴石、尖晶石）及非晶质体（玻璃、琥珀、欧泊）均可呈此特征。</p>;
  }
  if (response === 'aggregate-continuous-bright') {
    return <p>样品区域持续透亮、旋转时保持亮反应——这是<strong>多晶质集合体</strong>的典型特征。正交背景仍保持暗场；由于光线经过大量细小晶粒，偏振态被打乱，样品响应无法被上偏光片完全消光。翡翠、软玉等均属此类。</p>;
  }
  if (optical === 'uniaxial-positive' || optical === 'uniaxial-negative') {
    return (
      <p>
        旋转 360° 出现<strong>四明四暗</strong>，说明样品为非均质体。当前样品为<strong>一轴晶（{optical === 'uniaxial-positive' ? '+' : '−'}）</strong>。
        在正交偏光下找到干涉色最强的位置，加装锥光干涉球可观察到黑十字干涉图（标准牛眼图），进一步确认轴性。
        {brightness < 0.15 && ' · 当前处于消光位（暗位），旋转约 45° 可到达最亮位。'}
        {brightness > 0.85 && ' · 当前样品处于最亮位（45° 位），继续旋转约 45° 将到达下一个消光位。'}
      </p>
    );
  }
  if (optical === 'biaxial-positive' || optical === 'biaxial-negative') {
    return (
      <p>
        旋转 360° 出现<strong>四明四暗</strong>，说明样品为非均质体。当前样品为<strong>二轴晶（{optical === 'biaxial-positive' ? '+' : '−'}）</strong>。
        加装锥光干涉球，寻找干涉图最清晰的位置——二轴晶通常显示双臂或单臂黑带，可区别于一轴晶的黑十字图。
      </p>
    );
  }
  return <p>旋转载物台，观察样品区域的明暗响应规律，记录四明四暗、全暗或样品持续亮现象后进行光性判定。</p>;
}

// ── 子组件 ────────────────────────────────────────────────────

/** 上偏光片：标题在热点正上方，说明在热点右侧（避免与左上角模式/步骤卡叠在同一象限） */
function PolarUpperPolarHints({
  x,
  y,
  title,
  sub,
  isDone,
}: {
  x: number;
  y: number;
  title: string;
  sub: string;
  isDone: boolean;
}) {
  return (
    <>
      <div
        className={clsx(
          'pointer-events-none absolute z-[34] rounded-lg border px-2.5 py-1 text-center text-[11px] font-semibold leading-tight shadow-card whitespace-nowrap',
          isDone ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-line-2 bg-white text-ink',
        )}
        style={{
          left: `${x * 100}%`,
          top: `${Math.max(6, y * 100 - 7)}%`,
          transform: 'translate(-50%, -100%)',
        }}
      >
        {title}
      </div>
      <div
        className={clsx(
          'pointer-events-none absolute z-[34] w-[clamp(10.5rem,18vw,14rem)] rounded-lg border px-2 py-1 text-[10px] leading-snug shadow-card whitespace-normal break-keep',
          isDone ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-line-2 bg-white text-ink-2',
        )}
        style={{
          left: `${Math.min(86, x * 100 + 10)}%`,
          top: `${y * 100}%`,
          transform: 'translateY(-50%)',
        }}
      >
        {sub}
      </div>
    </>
  );
}

/** 观察位置示意：inline = 与标题行并排占高小；panel / window 备用 */
function ObservationPoseSchematic({ variant = 'panel' }: { variant?: 'panel' | 'window' | 'inline' }) {
  const svg = (
    <svg viewBox="0 0 72 96" className="text-current" aria-hidden>
      <ellipse cx="36" cy="14" rx="16" ry="9" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <text x="36" y="17" textAnchor="middle" fill="currentColor" fontSize="8" fontWeight="600" opacity="0.95">
        眼
      </text>
      <line x1="36" y1="24" x2="36" y2="72" stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" opacity="0.85" />
      <polygon points="36,78 32,70 40,70" fill="currentColor" opacity="0.75" />
      <ellipse cx="36" cy="86" rx="26" ry="7" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.25" />
      <text x="36" y="88" textAnchor="middle" fill="currentColor" fontSize="7" opacity="0.85">
        载物台 / 视场
      </text>
    </svg>
  );

  if (variant === 'window') {
    return (
      <div className="flex max-w-[5.5rem] flex-col items-center gap-0.5 rounded-lg border border-white/25 bg-black/50 px-1 py-1 text-white shadow-md backdrop-blur-[6px]">
        <div className="text-center text-[8px] font-semibold leading-tight text-white/95">观察姿势</div>
        <div className="w-12 shrink-0 [&_svg]:h-14 [&_svg]:w-full">{svg}</div>
        <p className="text-center text-[7px] leading-tight text-white/75">自上而下俯视</p>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="flex max-w-full flex-row items-center gap-2 rounded-lg border border-line bg-white/95 px-2 py-1 shadow-soft">
        <div className="h-8 w-6 shrink-0 text-slate-500 [&_svg]:h-full [&_svg]:w-full">{svg}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold leading-tight text-ink">观察位置示意</div>
          <p className="text-[9px] leading-snug text-ink-3 whitespace-nowrap">自上而下俯视载物台 / 视场</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[9.5rem] shrink-0 flex-col items-center gap-1 rounded-xl border border-line bg-white/90 px-2 py-2 text-ink shadow-soft backdrop-blur">
      <div className="text-center text-[10px] font-semibold leading-tight text-ink">观察位置示意</div>
      <div className="w-[4.5rem] text-slate-500 [&_svg]:h-[5.75rem] [&_svg]:w-full">{svg}</div>
      <p className="text-center text-[9px] leading-snug text-ink-3">自上而下俯视，勿侧视</p>
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={clsx('flex cursor-pointer items-center gap-2 text-xs', disabled && 'cursor-default text-ink-3')}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        readOnly={disabled}
      />
      {label}
    </label>
  );
}

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

// ── 状态机 ────────────────────────────────────────────────────

function computeCurrentStep(s: DemoState): StepId | null {
  if (!s.power) return 'power';
  if (!s.crossed) return 'crossed';
  if (!s.sampleOn) return 'place';
  if (!s.rotated) return 'rotate';
  if (!s.recorded) return 'record';
  return null;
}

function isStepDone(id: StepId, s: DemoState): boolean {
  switch (id) {
    case 'power': return s.power;
    case 'crossed': return s.crossed;
    case 'place': return s.sampleOn;
    case 'rotate': return s.rotated;
    case 'record': return s.recorded;
  }
}
