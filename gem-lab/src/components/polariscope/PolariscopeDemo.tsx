import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import HotPoint from '@/components/demo/HotPoint';
import ObjectFitHotspotFrame from '@/components/demo/ObjectFitHotspotFrame';
import StepGuide, { type DemoStep } from '@/components/demo/StepGuide';
import RotationKnob from '@/components/refractometer/RotationKnob';
import ObservationCanvas, {
  computePhenomenonBrightness,
} from '@/components/polariscope/ObservationCanvas';
import { INSTRUMENTS } from '@/data/instruments';
import { SAMPLES, SAMPLES_BY_ID } from '@/data/samples';
import { useDetection } from '@/store/detectionStore';
import { useProgress } from '@/store/progressStore';
import type { OpticalCharacter } from '@/data/types';
import { OPTICAL_LABEL } from '@/utils/format';
import clsx from '@/utils/clsx';

type DemoMode = 'learning' | 'detection';
type StepId = 'power' | 'crossed' | 'place' | 'rotate' | 'record';
const STEP_ORDER: StepId[] = ['power', 'crossed', 'place', 'rotate', 'record'];

const STEP_META: Record<StepId, { iconId: string; title: string; tip: string }> = {
  power: { iconId: 'power-on', title: '打开 LED 光源', tip: '点击仪器右侧的 LED 开关' },
  crossed: {
    iconId: 'rotate',
    title: '将上偏光片调至正交（视域全黑）',
    tip: '绕竖轴旋转上偏光片环，使与下偏光片振动方向垂直——此处点击一次模拟「已旋至正交」',
  },
  place: { iconId: 'place-sample', title: '放置样品', tip: '点击载物台中央放置样品' },
  rotate: {
    iconId: 'rotate',
    title: '旋转载物台 360°，观察明暗变化',
    tip: '拖动旋转旋钮，记录明暗交替次数',
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

/**
 * 载物台「自动旋转」速度（仅影响「▶ 自动旋转」按钮，不影响手动拖动旋钮）。
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
  onDetectionComplete,
}: {
  forcedSampleId?: string;
  embedded?: boolean;
  onDetectionComplete?: () => void;
}) {
  const instrument = INSTRUMENTS.polariscope;
  const navigate = useNavigate();

  const [mode, setMode] = useState<DemoMode>(embedded ? 'detection' : 'learning');
  const [state, setState] = useState<DemoState>(INITIAL_STATE);
  const [rotation01, setRotation01] = useState(0); // RotationKnob 0–1
  const [autoRotating, setAutoRotating] = useState(false);

  // 旋转角度 0–360°
  const rotation = rotation01 * 360;

  // 旋转观察完成标记（需经历亮 + 暗各至少一次）
  const [observed, setObserved] = useState<Set<'bright' | 'dark'>>(new Set());
  const [knobReady, setKnobReady] = useState(false);

  // 样品
  const [learningSampleId, setLearningSampleId] = useState('amethyst');
  const [previewSampleId, setPreviewSampleId] = useState<string | null>(null);
  const sampleId = forcedSampleId ?? learningSampleId;
  const sample = SAMPLES_BY_ID[sampleId];
  const optical = sample?.characteristics.opticalCharacter;

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
    optical,
    state.polarPosition,
  );

  useEffect(() => {
    if (!state.power || !state.crossed || !state.sampleOn) return;
    if (brightness > 0.5) setObserved((s) => new Set(s).add('bright'));
    else setObserved((s) => new Set(s).add('dark'));
  }, [rotation, brightness, state.power, state.crossed, state.sampleOn]);

  useEffect(() => {
    if (observed.has('bright') && observed.has('dark') && !state.rotated) {
      setState((s) => ({ ...s, rotated: true }));
    }
  }, [observed, state.rotated]);

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
      setState((s) => ({ ...s, power: !s.power }));
    } else if (id === 'upper' && state.power) {
      setState((s) => ({
        ...s,
        polarPosition: s.polarPosition === 'crossed' ? 'parallel' : 'crossed',
        crossed: s.polarPosition === 'parallel' ? true : s.crossed,
      }));
    } else if (id === 'stage' && state.power) {
      if (!state.sampleOn) {
        setState((s) => ({ ...s, sampleOn: true }));
        setPreviewSampleId(sampleId);
      } else {
        setState((s) => ({ ...s, sampleOn: false }));
      }
    }
  };

  const handleReset = () => {
    setState(INITIAL_STATE);
    setRotation01(0);
    setAutoRotating(false);
    setObserved(new Set());
    setKnobReady(false);
    setUserJudgement('');
    setUserPhenomena({ fourBright: false, allDark: false, allBright: false });
  };

  const handleSave = () => {
    if (mode === 'detection') {
      let ph: 'four-bright-four-dark' | 'all-dark' | 'all-bright' | 'anomalous' | null = null;
      if (userPhenomena.fourBright) ph = 'four-bright-four-dark';
      else if (userPhenomena.allBright) ph = 'all-bright';
      else if (userPhenomena.allDark) ph = 'all-dark';
      setPolariscopeData({ rotation, phenomenon: ph, optical: userJudgement || null });
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
  const opticalHint = renderOpticalHint(optical, brightness, state.polarPosition, state.sampleOn);

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
        {/* ── 左：仪器交互区 ── */}
        <section className="relative flex-[3] overflow-hidden bg-gradient-to-br from-[#f6f9fd] via-white to-[#eef4fb] text-ink">
          {/* 左上：模式切换 + 进度 + 步骤 */}
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

          {/* 右上：演示样品切换（学习模式） */}
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
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

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
                  onReady={() => setKnobReady(true)}
                  label="旋转载物台"
                  hint="拖动旋钮旋转样品"
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
                    <span className="font-mono text-[9px] uppercase tracking-widest text-ink-4">
                      {sample.name}
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
                    每旋转 90° 经历一次亮暗交替（共四明四暗）为非均质体；始终全暗为均质体；始终全亮为多晶质集合体。
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

                  {/* 现象勾选 */}
                  <div className="mb-1 text-[10px] text-ink-3">观察到的现象（可多选）</div>
                  <div className="space-y-1.5">
                    <Checkbox
                      label="四明四暗（非均质体）"
                      checked={
                        mode === 'detection'
                          ? userPhenomena.fourBright
                          : (optical !== 'isotropic' && optical !== 'aggregate' && !!optical)
                      }
                      onChange={(v) => setUserPhenomena({ ...userPhenomena, fourBright: v })}
                      disabled={mode !== 'detection'}
                    />
                    <Checkbox
                      label="转动 360° 全暗（均质体）"
                      checked={
                        mode === 'detection'
                          ? userPhenomena.allDark
                          : optical === 'isotropic'
                      }
                      onChange={(v) => setUserPhenomena({ ...userPhenomena, allDark: v })}
                      disabled={mode !== 'detection'}
                    />
                    <Checkbox
                      label="转动 360° 全亮（多晶质集合体）"
                      checked={
                        mode === 'detection'
                          ? userPhenomena.allBright
                          : optical === 'aggregate'
                      }
                      onChange={(v) => setUserPhenomena({ ...userPhenomena, allBright: v })}
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
                      disabled={!state.rotated && mode === 'learning'}
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
                      ✓ 已完成观察。{sample && `本样品光性：${OPTICAL_LABEL[sample.characteristics.opticalCharacter]}`}
                    </div>
                  )}
                </div>

                {/* 学习模式：观察解析 */}
                {mode === 'learning' && state.sampleOn && sample && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] leading-relaxed text-amber-800">
                    <div className="mb-1 font-semibold">观察解析</div>
                    {opticalHint}
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

// ── 观察解析文字 ──────────────────────────────────────────────
function renderOpticalHint(
  optical: OpticalCharacter | undefined,
  brightness: number,
  polarPosition: 'crossed' | 'parallel',
  sampleOn: boolean,
): React.ReactNode {
  if (!sampleOn) return <p>放置样品后即可在正交偏光下观察明暗变化。</p>;
  if (polarPosition === 'parallel') {
    return (
      <p>
        当前为<strong>平行偏光</strong>（视场全亮）：上、下偏光片振动方向一致。正交偏光需<strong>绕竖轴旋转上偏光片</strong>，使与下偏光片振动方向垂直；本演示中点击上偏光片热点模拟「已旋至正交」。平行偏光亦可观察多色性（有色非均质体不同方向颜色差异）。
      </p>
    );
  }
  if (!optical) return <p>放置样品并旋转，观察视场明暗变化。</p>;

  if (optical === 'isotropic') {
    return <p>转动载物台 360°，视场始终保持全暗——这是<strong>均质体</strong>的典型特征。等轴晶系宝石（如石榴石、尖晶石）及非晶质体（玻璃、琥珀）均呈此特征。</p>;
  }
  if (optical === 'aggregate') {
    return <p>视场呈全亮状态——这是<strong>多晶质集合体</strong>的典型特征。由于光线经过大量细小晶粒，偏振态被打乱，无法被上偏光片消光。翡翠、软玉等均属此类。</p>;
  }
  if (optical === 'uniaxial-positive' || optical === 'uniaxial-negative') {
    return (
      <p>
        旋转 360° 出现<strong>四明四暗</strong>，说明样品为非均质体。当前样品为<strong>一轴晶（{optical === 'uniaxial-positive' ? '+' : '−'}）</strong>。
        在正交偏光下找到干涉色最强的位置，加装锥光干涉球可观察到黑十字干涉图（标准牛眼图），进一步确认轴性。
        {brightness < 0.15 && ' · 当前处于消光位（暗位），旋转约 45° 可到达最亮位。'}
        {brightness > 0.85 && ' · 当前处于最亮位（45° 位），继续旋转约 45° 将到达下一个消光位。'}
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
  return <p>旋转载物台，观察视场明暗交替规律，记录四明四暗、全暗或全亮现象后进行光性判定。</p>;
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
