import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../components/shared/Header';
import PolariscopeScene, { type SceneCoach } from '../components/polariscope3d/PolariscopeScene';
import EyepieceView, { EYEPIECE_RESOLUTION, type EyepieceContent } from '../components/polariscope3d/EyepieceView';
import RotationTrace from '../components/polariscope3d/RotationTrace';
import { CourseComplete, CourseGuide, CourseQuiz, type AdvancedTopic } from '../components/polariscope3d/CourseGuide';
import {
  COURSE_MINUTES,
  COURSE_STEPS,
  EMPTY_COURSE_PROGRESS,
  REORIENT_SAMPLE,
  courseChecklist,
  type CourseProgress,
  type CourseStepId,
} from '../domain/polariscopeCourse';
import {
  createInitialStructureState,
  deriveTeachingOptics,
  lessonUsesSample,
  STRUCTURE_PART_IDS,
  TEACHING_LESSONS,
  type SampleOrientation,
  type PolariscopeStructureState,
  type StructurePartId,
  type StructureViewPreset,
} from '../domain/polariscopeStructure';
import { visibleOpticAxes } from '../domain/polarizedLight';
import { buildSampleFieldMap, judgeObservation, meanSampleLuminance, parallelCheck, rotationCurve, type ParallelCheckResult, type SampleObservation } from '../domain/eyepieceField';
import {
  sampleCrystal,
  FEATURED_SAMPLE_IDS,
  getPolariscopeProfile,
  POLARISCOPE_PROFILES,
  type PolariscopeSampleProfile,
} from '../domain/polariscopeSamples';
import '../styles/polariscope-explore.css';

type SceneStatus = 'loading' | 'ready' | 'error';
type PartCopy = { id: StructurePartId; name: string; shortName: string; description: string; operation: string };
const PART_COPY: PartCopy[] = [
  { id: 'base', name: '底座主体', shortName: '底座', description: '底座与上方支架是同一块金属外壳（白色），支承整台仪器，内部容纳照明组件。上表面的通光孔与下偏光片对齐。', operation: '开启“查看内部光源”，可透过外壳查看光源的位置。拆解时，光源、侧面电源按钮和一体的支架都留在原位。' },
  { id: 'frame', name: '支架（与底座一体）', shortName: '支架', description: '支架与底座外壳一体成形、材质相同，由底座向上折出，承托上方检偏器，并为中间的样品观察区域留出空间。', operation: '它不是可拆下的独立零件，拆解演示时保持不动。切换侧面视角，查看支架轮廓、顶部支撑与上下偏光片之间的关系。' },
  { id: 'light', name: '底座内部光源', shortName: '内部光源', description: '光源位于底座内部。光向上通过底座顶部洞口，直接进入下偏光片。', operation: '当前透明外壳辅助显示光源位置；轮廓线表示外壳边界。光源不会随拆解向上漂浮，内部组件的细节为位置示意。' },
  { id: 'polarizer', name: '下偏光片 · 起偏器', shortName: '下偏光片', description: '下偏光片位于底座通光孔上方，将来自内部光源的光变成线偏振光。它固定不转，与载物台是两个分开的部件。', operation: '转动物台时，下偏光片保持原位；透振方向始终作为 0° 参考。' },
  { id: 'stage', name: '可旋转载物台', shortName: '载物台', description: '载物台位于上下偏光片之间，与下偏光片分开安装，用于承放样品，并改变样品绕光轴的方位。仪器上只有载物台和检偏器可以转动。', operation: '结构模式的整机视图中，可直接拖动物台；拆解或单独查看时，使用下方角度控件。物台与检偏器分别控制，角度以模型初始位置为零点。' },
  { id: 'analyzer', name: '上偏光片 · 检偏器', shortName: '上偏光片', description: '检偏器位于样品位置上方，安装在支架顶部的旋转环内。', operation: '结构模式的整机视图中，可直接拖动上方镜环；拆解或单独查看时，使用下方角度控件。切换“偏振原理”，可用同一镜环观察空载明暗变化；样品练习可继续进入互动学习。' },
  { id: 'conoscope', name: '锥光干涉球', shortName: '干涉球', description: '锥光干涉球是用于观察干涉图的附件，平时收纳在仪器侧边。', operation: '选择后可以近看或单独查看。在“05 干涉图”中，可以把它放到样品上方，观察一轴晶与二轴晶的干涉图。' },
  { id: 'powerSwitch', name: '底座侧面电源按钮', shortName: '电源按钮', description: '电源按钮安装在底座侧面，控制底座内部光源的开启与关闭。', operation: '点击模型上的按钮即可开关电源；右侧开关和投屏控件会同步更新。拖动查看仪器时不会误触开关。' },
];
const PARTS = STRUCTURE_PART_IDS.map((id) => PART_COPY.find((part) => part.id === id)!);
const PARTS_BY_ID = Object.fromEntries(PARTS.map((part) => [part.id, part])) as Record<StructurePartId, PartCopy>;
const STATUS_LABELS: Record<SceneStatus, string> = { loading: '载入场景', ready: '可交互', error: '场景暂不可用' };
const MODES = [
  { id: 'structure', title: '结构', caption: '转动仪器，认识每个部件。' },
  { id: 'explode', title: '拆解', caption: '展开部件，看清空间关系。' },
] as const;

type Lesson = PolariscopeStructureState['lesson'];
const LESSONS = [
  { id: 'components', title: '认识部件', caption: '转动仪器，认识各部件的位置与作用。' },
  { id: 'path', title: '跟随光路', caption: '从底座内部出发，逐步跟随光线。' },
  { id: 'principle', title: '偏振原理', caption: '转动同一台仪器，观察方向与明暗的关系。' },
  { id: 'sample', title: '样品观察', caption: '先预测，再转动一周，用目镜视场判断光性。' },
  { id: 'conoscope', title: '干涉图', caption: '放上干涉球，区分一轴晶与二轴晶。' },
] as const;
const PATH_STEPS = [
  { title: '底座内部光源', short: '内部光源', description: '光源在底座中发光。从光源出来的是自然光：振动方向在垂直于传播方向的平面内随机变化（图中快速变换方向的短杆）。' },
  { title: '顶部通光孔与起偏器', short: '通光孔 · 起偏', description: '光从底座顶孔向上，直接进入下偏光片。通过起偏器后，只剩一个振动方向：光变成线偏振光。' },
  { title: '经过样品位置', short: '样品位置', description: '这一段位于两片偏光片之间。当前光路讲解为空载状态；转动物台不会改变空载光的偏振方向。' },
  { title: '到达上方检偏器', short: '上片 · 检偏', description: '上片只让与自身透光轴方向对应的光分量通过。下一步，沿出射方向观察转动镜环带来的明暗变化。' },
  { title: '沿光路观察', short: '观察方向', description: '沿上方检偏器向下观察。振动在上片方向上的投影（振幅 cos α）才能通过，光强为 cos² α：平行时最亮，正交时理想空载消光。' },
] as const;
type Phenomenon = PolariscopeSampleProfile['expectedPhenomenon'];
const PHENOMENA: { id: Phenomenon; label: string }[] = [
  { id: 'all-dark', label: '始终暗' }, { id: 'four-bright-four-dark', label: '四明四暗' }, { id: 'all-bright', label: '始终亮' },
  { id: 'anomalous', label: '不规则明暗' }, { id: 'not-applicable', label: '几乎不透光' },
];
type Observation = SampleObservation;
/** 观察结论对应的「正确预测」：沿光轴的两种情况分别对应始终暗、始终亮。 */
const EXPECTED_PREDICTION: Record<Observation, Phenomenon> = {
  'all-dark': 'all-dark', 'axis-dark': 'all-dark', 'axis-twin-dark': 'all-dark', 'axis-rotation': 'all-bright', 'four-bright-four-dark': 'four-bright-four-dark',
  'all-bright': 'all-bright', anomalous: 'anomalous', 'not-applicable': 'not-applicable',
};
const OBSERVATION_COPY: Record<Observation, { title: string; text: string }> = {
  'all-dark': { title: '转动一周始终暗', text: '可能是均质体（单折射）：光在样品中不分成两束，偏振方向不变，被正交的上片挡住。规范做法是换 2–3 个方向复查：非均质体沿光轴放置时，同样会全暗。' },
  'axis-dark': { title: '全暗，但它其实是非均质体', text: '光沿光轴方向传播时不发生双折射，看起来和均质体一样暗。这正是要换方向复查的原因——点“换个方向放置”，再转一周。' },
  'axis-twin-dark': { title: '全暗：双晶抵消了旋光', text: '这块水晶开启了巴西律双晶示意：左旋与右旋两层沿光轴的旋光互相抵消，又没有线性双折射，所以沿光轴看近于全暗——和均质体一样。可以关掉双晶示意对比单一旋向的水晶，或换个方向放置再转一周。' },
  'axis-rotation': { title: '沿光轴：不暗，但也不闪', text: '水晶沿光轴方向没有线性双折射，所以不出现四明四暗；但它有旋光性，会把偏振方向转过一个与波长有关的角度，正交下呈现不随物台转动而改变的颜色。它既不是全暗，也不是集合体——换个方向放置再转一周，就能看到四明四暗。' },
  'four-bright-four-dark': { title: '一周四明四暗', text: '本例是非均质体（双折射）：样品把光分成振动方向互相垂直的两束。两个振动方向与上下偏光片平行时为消光位（暗），每 90° 一次；转到两者之间最亮。注意：四明四暗通常表示双折射，但均质体的异常双折射（ADR）也可能出现，单凭这一反应不能定论，有疑问时做平行复核并结合折射仪。' },
  'all-bright': { title: '转动一周始终亮', text: '多晶质集合体：大量取向各异的细小晶粒叠在一起，任何角度都有晶粒处在明亮位置，整体亮度几乎不随转动改变。' },
  'anomalous': { title: '不规则的明暗斑块', text: '异常双折射（ADR）：均质体内部有应变，局部出现弱的双折射，本例明暗呈斑块、条带或“蛇形”，转动时没有整齐的四明四暗。ADR 的表现多样，也可能出现规则的明暗交替，所以「不规则」只是本例特征，不能反过来当作排除规则；可以用平行复核加以区分。' },
  'not-applicable': { title: '几乎没有透过的光', text: '不透明样品：光无法透过，偏光镜透射观察不适用，需要改用其他检测方法。' },
};
const PROFILES_BY_GROUP = {
  anisotropic: POLARISCOPE_PROFILES.filter((p) => p.observation === 'anisotropic'),
};
const CONOSCOPE_FEATURED = ['tourmaline', 'ruby', 'citrine', 'amethyst', 'zircon', 'peridot', 'topaz', 'tanzanite'] as const;
const CATEGORY_LABEL: Record<PolariscopeSampleProfile['observation'], string> = { isotropic: '均质体', anisotropic: '非均质体', aggregate: '集合体', opaque: '不透明' };
const TRACE_STEPS = 72;

function parseLesson(value: string | null): Lesson {
  return (TEACHING_LESSONS as readonly string[]).includes(value ?? '') ? value as Lesson : 'components';
}
function lessonPatch(lesson: Lesson, sampleId?: string): Partial<PolariscopeStructureState> {
  const sample = lessonUsesSample(lesson);
  const keepSample = lesson === 'conoscope' ? (sampleId && getPolariscopeProfile(sampleId)?.observation === 'anisotropic' ? sampleId : 'tourmaline') : sampleId;
  return {
    lesson, mode: 'structure', explosion: 0, isolatedPart: null, selectedPart: null,
    internalView: lesson === 'path', pathStep: lesson === 'path' ? 0 : 4,
    ...(sample ? { analyzerAngle: 90, stageAngle: 0, principleExample: 'empty' as const, conoscopeInserted: false, sampleId: keepSample ?? 'tourmaline', orientation: lesson === 'conoscope' ? 'optic-axis' as const : 'general' as const } : {}),
    ...(lesson === 'path' ? { principleExample: 'empty' as const } : {}),
  };
}
function stateForLesson(lesson: Lesson) {
  return createInitialStructureState(lessonPatch(lesson));
}
/** 引导课程每一步进入时的场景；「解释」沿用上一步的样品画面。 */
const COURSE_SETUP: Record<CourseStepId, [Lesson, Partial<PolariscopeStructureState>] | null> = {
  parts: ['components', { power: true, analyzerAngle: 0, stageAngle: 0, internalView: false }],
  path: ['path', { power: true }],
  crossed: ['principle', { power: true, principleExample: 'empty', analyzerAngle: 0, stageAngle: 0 }],
  rotate: ['sample', { power: true, sampleId: 'spinel', strain: null, brazilTwin: false }],
  reorient: ['sample', { power: true, sampleId: REORIENT_SAMPLE, orientation: 'optic-axis', strain: null, brazilTwin: false }],
  explain: null,
};
/** 基础课程之后的进阶内容：进入自由探索中对应的讲解与样品。 */
const ADVANCED_TOPICS: (AdvancedTopic & { lesson: Lesson; patch: Partial<PolariscopeStructureState> })[] = [
  { id: 'quartz', title: '水晶旋光', text: '黄晶沿光轴放置：不暗也不闪。', lesson: 'sample', patch: { sampleId: 'citrine', orientation: 'optic-axis', strain: null, brazilTwin: false } },
  { id: 'twin', title: '巴西律双晶', text: '紫晶双层旋光互相抵消。', lesson: 'sample', patch: { sampleId: 'amethyst', orientation: 'optic-axis', strain: null, brazilTwin: true } },
  { id: 'adr', title: '异常双折射与平行复核', text: '石榴石的应变明暗，如何区分。', lesson: 'sample', patch: { sampleId: 'garnet', orientation: 'general', strain: null, brazilTwin: false } },
  { id: 'conoscope', title: '锥光干涉图', text: '放上干涉球，区分一轴晶与二轴晶。', lesson: 'conoscope', patch: { sampleId: 'tourmaline', brazilTwin: false } },
];

export default function PolariscopeExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedLesson = parseLesson(searchParams.get('lesson'));
  const courseActive = searchParams.get('course') === 'basic';
  const studentMode = courseActive && searchParams.get('mode') === 'student';
  const [state, setState] = useState(() => stateForLesson(requestedLesson));
  const [quality, setQuality] = useState<'standard' | 'high'>('high');
  const [projection, setProjection] = useState(false);
  const [resetViewKey, setResetViewKey] = useState(0);
  const [sceneStatus, setSceneStatus] = useState<SceneStatus>('loading');
  const [viewPreset, setViewPreset] = useState<StructureViewPreset>('free');
  const [fieldVersion, setFieldVersion] = useState(0);
  const [prediction, setPrediction] = useState<string | null>(null);
  const [visited, setVisited] = useState<boolean[]>(() => Array(TRACE_STEPS).fill(false));
  const [autoRotate, setAutoRotate] = useState(false);
  const [adrCheck, setAdrCheck] = useState<ParallelCheckResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [fieldCanvas, setFieldCanvas] = useState<HTMLCanvasElement | null>(null);
  const [courseStep, setCourseStep] = useState(0);
  const [courseReached, setCourseReached] = useState(0);
  const [courseProgress, setCourseProgress] = useState<CourseProgress>(EMPTY_COURSE_PROGRESS);
  const [courseFinished, setCourseFinished] = useState(false);
  const [stepTimes, setStepTimes] = useState<number[]>(() => COURSE_STEPS.map(() => 0));
  const stepEnteredAt = useRef(0);
  const [narrow, setNarrow] = useState(false);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const doneItems = useRef<Set<string> | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const projectionExit = useRef<HTMLButtonElement>(null);
  const projectionEnter = useRef<HTMLButtonElement>(null);
  const wasProjection = useRef(false);
  const previousStage = useRef(state.stageAngle);
  const selected = state.selectedPart ? PARTS_BY_ID[state.selectedPart] : null;
  const modeCopy = MODES.find((mode) => mode.id === state.mode)!;
  const lessonCopy = LESSONS.find((lesson) => lesson.id === state.lesson)!;
  const pathCopy = PATH_STEPS[state.pathStep];
  const optics = deriveTeachingOptics(state);
  const relativePercent = Math.round(optics.relativeTransmission * 100);
  const halfWave = state.principleExample === 'half-wave';
  const crossed = Math.abs((optics.analyzerDirection % 180) - 90) < .5;
  const isolatedName = state.isolatedPart ? (state.isolatedPart === 'light' ? '内部光源与底座边界' : PARTS_BY_ID[state.isolatedPart].shortName) : null;
  const update = (patch: Partial<PolariscopeStructureState>) => setState((previous) => ({ ...previous, ...patch }));
  const blockedCopy = !state.power ? '电源关闭，当前没有出射光。' : state.mode === 'explode' || state.explosion > 0 ? '请先恢复装配，再观察光路与明暗。' : '请显示整机，再观察完整光路。';
  const principleCopy = halfWave
    ? crossed ? '保持两片正交，转动物台。一周内出现四次亮、四次暗；这是一种理想条件下的规律。' : '检偏器当前未正交，明暗极值的方位随其角度移动。点击 90° 正交，可回到本节观察条件。'
    : '保持空载，转动上方检偏器。两片平行时最亮，正交时消光；物台角度不影响这一现象。';

  // ── 样品与视场 ──
  const sampleLesson = lessonUsesSample(state.lesson);
  const profile = getPolariscopeProfile(state.sampleId)!;
  const strain = state.strain ?? profile.defaultStrain;
  const settings = useMemo(() => ({ orientation: state.orientation, strain, thicknessMm: state.thicknessMm, brazilTwin: state.brazilTwin }), [state.orientation, strain, state.thicknessMm, state.brazilTwin]);
  const fieldMap = useMemo(() => sampleLesson ? buildSampleFieldMap(profile, settings, EYEPIECE_RESOLUTION) : null, [sampleLesson, profile, settings]);
  const curve = useMemo(() => fieldMap ? rotationCurve(fieldMap, state.analyzerAngle, TRACE_STEPS) : [], [fieldMap, state.analyzerAngle]);
  const sampleBrightness = fieldMap ? meanSampleLuminance(fieldMap, state.stageAngle, state.analyzerAngle, 4) : 0;
  // 与正光视场同一个晶体模型：放上、取下干涉球前后是同一块晶体、同一个方向。
  const crystal = useMemo(() => state.lesson === 'conoscope' ? sampleCrystal(profile, state.orientation, state.brazilTwin) : null, [state.lesson, profile, state.orientation, state.brazilTwin]);
  const showConoscopicFigure = state.lesson === 'conoscope' && state.conoscopeInserted && !!crystal;
  const eyepieceContent = useMemo<EyepieceContent | null>(() => {
    if (showConoscopicFigure && crystal) {
      // 锐角等分线图：2V 较大时光轴出露点在常规视场外，改用宽视场以看到双曲线黑带。
      const wide = crystal.kind === 'biaxial' && state.orientation === 'acute-bisectrix' && profile.opticAxialAngle
        ? Math.min(0.92, Math.max(0.42, Math.sin(profile.opticAxialAngle / 2 * Math.PI / 180) * 1.3)) : undefined;
      return { kind: 'conoscope', crystal, thicknessMm: state.thicknessMm, tint: profile.bodyColor.map((v) => 0.35 + 0.65 * v) as [number, number, number], sinThetaMax: wide };
    }
    if (sampleLesson) return { kind: 'field', map: fieldMap };
    if (state.lesson === 'principle') return { kind: 'field', map: null, backgroundTransmission: optics.relativeTransmission };
    if (state.lesson === 'path' && state.pathStep === 4) return { kind: 'field', map: null };
    return null;
  }, [showConoscopicFigure, crystal, state.thicknessMm, state.orientation, profile, sampleLesson, fieldMap, state.lesson, state.pathStep, optics.relativeTransmission]);
  // 结论由材料机理与同一份光学图决定（扣除散射灰底），见 domain/eyepieceField。
  const observation = useMemo<Observation>(() => fieldMap ? judgeObservation(profile, settings, fieldMap) : profile.expectedPhenomenon, [fieldMap, profile, settings]);
  const coverage = visited.filter(Boolean).length / TRACE_STEPS;
  // 只在「已预测、通电、正交」时记录观察，保证先预测后观察。
  const recording = state.lesson === 'sample' && prediction !== null && optics.active && crossed;
  const conoscopeKind = !crystal ? null : crystal.kind === 'biaxial' ? 'biaxial' : profile.quartz ? 'quartz' : 'uniaxial';
  const wideField = eyepieceContent?.kind === 'conoscope' && eyepieceContent.sinThetaMax !== undefined && eyepieceContent.sinThetaMax > 0.42;
  const conoscopeContext = {
    twin: state.brazilTwin, wideField, crossed,
    parallel: Math.min(optics.analyzerDirection % 180, 180 - optics.analyzerDirection % 180) < .5,
    blockedReason: optics.active ? null : blockedCopy,
    visibleAxes: crystal ? visibleOpticAxes(crystal, eyepieceContent?.kind === 'conoscope' ? eyepieceContent.sinThetaMax ?? 0.42 : 0.42) : 0,
  };
  const eyepieceLabel = showConoscopicFigure ? (wideField ? '目镜视场 · 扩大角域原理图' : '目镜视场 · 锥光干涉图') : sampleLesson ? `目镜视场 · ${profile.name}` : '目镜视场 · 空载';
  const onFieldRendered = useCallback(() => setFieldVersion((value) => value + 1), []);

  // 记录物台转过的角度区间（拖动可能跳过若干格，按最短路径补齐）。
  useEffect(() => {
    const from = previousStage.current, to = state.stageAngle;
    previousStage.current = to;
    if (!recording) return;
    // 只记录连续转动：单次跳变超过 15°（如按 End、PageUp 或点预设）只记录落点，中间角度没有被观察到。
    const shortest = ((to - from) % 360 + 540) % 360 - 180;
    const continuous = Math.abs(to - from) <= 15 || Math.abs(shortest) <= 15 && Math.abs(to - from) < 359;
    const delta = continuous ? shortest : 0;
    const stepDeg = 360 / TRACE_STEPS, count = continuous ? Math.max(1, Math.ceil(Math.abs(delta) / (stepDeg / 2))) : 0;
    setVisited((previous) => {
      const next = previous.slice(); let changed = false;
      for (let k = 0; k <= count; k++) {
        const angle = continuous ? (((from + (delta * k) / count) % 360) + 360) % 360 : ((to % 360) + 360) % 360, bin = Math.floor(angle / stepDeg) % TRACE_STEPS;
        if (!next[bin]) { next[bin] = true; changed = true; }
      }
      return changed ? next : previous;
    });
  }, [state.stageAngle]); // eslint-disable-line react-hooks/exhaustive-deps -- 只响应物台转动；recording 取本次渲染的值
  useEffect(() => { if (prediction !== null && coverage >= 1) setRevealed(true); }, [prediction, coverage]);
  // ── 引导课程：只记录本页内的完成情况，不写学习进度 ──
  useEffect(() => {
    if (!courseActive || !revealed) return;
    setCourseProgress((previous) => ({ ...previous, reveals: [...previous.reveals, { sampleId: state.sampleId, orientation: state.orientation, observation }] }));
    // 揭晓解释位于右侧面板下方，课程中滚动到可见处。
    requestAnimationFrame(() => document.querySelector('[data-testid="sample-reveal"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }, [revealed]); // eslint-disable-line react-hooks/exhaustive-deps -- 每次揭晓记录一次
  useEffect(() => {
    if (courseActive && state.lesson === 'path') setCourseProgress((previous) => state.pathStep > previous.pathMax ? { ...previous, pathMax: state.pathStep } : previous);
  }, [courseActive, state.lesson, state.pathStep]);
  const emptyFieldActive = courseActive && state.lesson === 'principle' && !halfWave && optics.active;
  const parallelNow = emptyFieldActive && optics.relativeTransmission > .99;
  const crossedNow = emptyFieldActive && optics.relativeTransmission === 0;
  useEffect(() => {
    if (parallelNow) setCourseProgress((previous) => previous.parallelSeen ? previous : { ...previous, parallelSeen: true });
    if (crossedNow) setCourseProgress((previous) => previous.crossedSeen ? previous : { ...previous, crossedSeen: true });
  }, [parallelNow, crossedNow]);
  // 换样品或放置方式：重新预测、重新记录。改变检偏器只重新记录曲线，已揭晓的解释保留（平行复核需要转检偏器）。
  useEffect(() => { setVisited(Array(TRACE_STEPS).fill(false)); setAdrCheck(null); setRevealed(false); }, [state.sampleId, state.orientation, strain, state.lesson, state.conoscopeInserted, state.thicknessMm, state.brazilTwin]);
  useEffect(() => { setVisited(Array(TRACE_STEPS).fill(false)); }, [state.analyzerAngle]);
  useEffect(() => { setPrediction(null); setRevealed(false); }, [state.sampleId, state.lesson]);
  // 自动转一周：约 9 秒，便于课堂投屏讲解。
  useEffect(() => {
    if (!autoRotate) return;
    // 按累计转角精确终止（不逐帧舍入），任何刷新率下都正好转满一周。
    let frame = 0, last = performance.now(), travelled = 0, start: number | null = null;
    const tick = (now: number) => {
      travelled = Math.min(360, travelled + Math.min(.05, (now - last) / 1000) * 40); last = now;
      setState((previous) => {
        if (start === null) start = previous.stageAngle;
        return { ...previous, stageAngle: travelled >= 360 ? start : (start + travelled) % 360 };
      });
      if (travelled >= 360) { setAutoRotate(false); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [autoRotate]);

  const projectionTitle = state.lesson === 'components' ? selected?.name ?? (state.mode === 'explode' ? '部件与装配关系' : '选择一个部件')
    : state.lesson === 'path' ? pathCopy.title : state.lesson === 'principle' ? (halfWave ? '理想双折射示例' : '空载：两片偏光片')
      : state.lesson === 'sample' ? `${profile.name}：${revealed ? OBSERVATION_COPY[observation].title : '先预测，再转动一周'}` : `${profile.name}：${showConoscopicFigure ? '锥光干涉图' : '放上干涉球'}`;
  const projectionDescription = state.lesson === 'components' ? selected?.description ?? '点选模型上的编号，查看部件名称与作用。'
    : state.lesson === 'path' ? pathCopy.description : state.lesson === 'principle' ? principleCopy
      : state.lesson === 'sample' ? (revealed ? OBSERVATION_COPY[observation].text : '正交偏光下转动物台，观察目镜视场中样品明暗的变化。') : conoscopeExplanation(conoscopeKind, state.orientation, showConoscopicFigure, conoscopeContext);

  const selectPart = (id: StructurePartId | null) => {
    setViewPreset('free');
    if (courseActive && id) setCourseProgress((previous) => previous.partsSeen.includes(id) ? previous : { ...previous, partsSeen: [...previous.partsSeen, id] });
    setState((previous) => ({ ...previous, selectedPart: id, isolatedPart: id === 'light' ? null : previous.isolatedPart && id ? id : null, internalView: id === 'light' ? true : previous.internalView }));
  };
  const changeLesson = (lesson: Lesson) => {
    setSearchParams((previous) => { const next = new URLSearchParams(previous); next.set('lesson', lesson); return next; }, { replace: true });
  };
  useEffect(() => {
    setState((previous) => previous.lesson === requestedLesson ? previous : { ...previous, ...lessonPatch(requestedLesson, previous.sampleId) });
    setAutoRotate(false);
    setViewPreset('free');
    setResetViewKey((value) => value + 1);
  }, [requestedLesson]);
  /** 直接切换到某一讲并套用场景（课程与进阶入口用），观察记录从头开始。 */
  const goTo = (lesson: Lesson, patch: Partial<PolariscopeStructureState>, nextParams?: (params: URLSearchParams) => void) => {
    setAutoRotate(false); setPrediction(null); setRevealed(false); setAdrCheck(null); setVisited(Array(TRACE_STEPS).fill(false));
    setState((previous) => ({ ...previous, ...lessonPatch(lesson, patch.sampleId ?? previous.sampleId), ...patch }));
    setViewPreset('free');
    setResetViewKey((value) => value + 1);
    setSearchParams((previous) => { const next = new URLSearchParams(previous); next.set('lesson', lesson); nextParams?.(next); return next; }, { replace: true });
  };
  const enterCourseStep = (index: number, mode?: 'teacher' | 'student') => {
    const setup = COURSE_SETUP[COURSE_STEPS[index].id];
    if (setup) goTo(setup[0], setup[1], (params) => {
      params.set('course', 'basic');
      if (mode === 'student') params.set('mode', 'student'); else if (mode === 'teacher') params.delete('mode');
    });
  };
  const leaveCurrentStep = () => {
    const now = performance.now(), spent = now - stepEnteredAt.current;
    stepEnteredAt.current = now;
    setStepTimes((previous) => previous.map((value, index) => index === courseStep ? value + spent : value));
  };
  /** mode 省略时保留地址中的使用方式（直接打开 ?course=basic&mode=student 时）。 */
  const startCourse = (mode?: 'teacher' | 'student') => {
    setCourseStep(0); setCourseReached(0); setCourseProgress(EMPTY_COURSE_PROGRESS); setCourseFinished(false);
    setStepTimes(COURSE_STEPS.map(() => 0)); stepEnteredAt.current = performance.now(); doneItems.current = null;
    enterCourseStep(0, mode);
  };
  const changeCourseMode = (mode: 'teacher' | 'student') => {
    setSearchParams((previous) => { const next = new URLSearchParams(previous); if (mode === 'student') next.set('mode', 'student'); else next.delete('mode'); return next; }, { replace: true });
  };
  const changeCourseStep = (index: number) => {
    if (index < 0 || index >= COURSE_STEPS.length) return;
    leaveCurrentStep();
    setCourseStep(index); setCourseReached((previous) => Math.max(previous, index));
    enterCourseStep(index);
  };
  const finishCourse = () => { leaveCurrentStep(); setCourseFinished(true); };
  const exitCourse = () => {
    setCourseFinished(false);
    setSearchParams((previous) => { const next = new URLSearchParams(previous); next.delete('course'); next.delete('mode'); return next; }, { replace: true });
  };
  const openAdvanced = (id: string) => {
    const topic = ADVANCED_TOPICS.find((item) => item.id === id);
    if (!topic) return;
    setCourseFinished(false);
    goTo(topic.lesson, topic.patch, (params) => { params.delete('course'); params.delete('mode'); });
  };
  // 直接打开 ?course=basic 时从第一步开始计时。
  useEffect(() => { if (courseActive && stepEnteredAt.current === 0) startCourse(); }, [courseActive]); // eslint-disable-line react-hooks/exhaustive-deps
  const courseStepId = COURSE_STEPS[courseStep].id;
  const courseOverlay = courseActive ? (courseFinished ? 'complete' : courseStepId === 'explain' ? 'quiz' : null) : null;
  // 学员模式：清单项完成时在展台上方给出短提示。
  useEffect(() => {
    if (!courseActive) { doneItems.current = null; return; }
    const done = new Set(COURSE_STEPS.flatMap((step) => courseChecklist(step.id, courseProgress).filter((item) => item.done).map((item) => `${step.id}:${item.id}:${item.label}`)));
    const previous = doneItems.current; doneItems.current = done;
    if (!previous || !studentMode) return;
    const fresh = [...done].find((key) => !previous.has(key));
    if (!fresh) return;
    setToast({ key: Date.now(), text: `${fresh.split(':').slice(2).join(':')} · 完成` });
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [courseActive, studentMode, courseProgress]);

  const changeMode = (mode: PolariscopeStructureState['mode']) => {
    if (state.lesson !== 'components') return;
    setViewPreset('free');
    setState((previous) => ({ ...previous, mode, explosion: mode === 'explode' ? .7 : 0, isolatedPart: null }));
    setResetViewKey((value) => value + 1);
  };
  const changeAngle = (part: 'analyzer' | 'stage', degrees: number) => {
    if (Number.isFinite(degrees)) update({ [part === 'analyzer' ? 'analyzerAngle' : 'stageAngle']: Math.max(0, Math.min(360, degrees)) });
  };
  const changePathStep = (step: number) => update({ pathStep: Math.max(0, Math.min(4, step)) });
  const changeExample = (example: PolariscopeStructureState['principleExample']) => {
    update({ principleExample: example, ...(example === 'half-wave' ? { analyzerAngle: 90, stageAngle: 0 } : {}) });
  };
  const chooseSample = (id: string) => { setAutoRotate(false); update({ sampleId: id, orientation: state.lesson === 'conoscope' ? 'optic-axis' : 'general', strain: null, stageAngle: 0, conoscopeInserted: false, brazilTwin: false }); };
  const runAdrCheck = () => {
    if (!fieldMap || !optics.active) return;
    const result = parallelCheck(profile, settings, fieldMap);
    if (result.verdict === 'strain' || result.verdict === 'double-refraction') update({ stageAngle: result.stageDeg, analyzerAngle: 0 });
    setAdrCheck(result);
  };
  const resetView = () => {
    setViewPreset('free');
    update({ selectedPart: null, isolatedPart: null });
    setResetViewKey((value) => value + 1);
  };
  const resetAll = () => {
    setAutoRotate(false); setPrediction(null); setRevealed(false); setAdrCheck(null); setVisited(Array(TRACE_STEPS).fill(false));
    setState({ ...stateForLesson(state.lesson), sampleId: sampleLesson ? state.sampleId : 'tourmaline' });
    setViewPreset('free');
    setResetViewKey((value) => value + 1);
  };
  const toggleInternal = () => {
    setViewPreset('free');
    setState((previous) => ({ ...previous, internalView: !previous.internalView, selectedPart: previous.lesson === 'components' && !previous.internalView ? 'light' : previous.selectedPart, isolatedPart: null }));
  };

  useLayoutEffect(() => {
    // This route is responsive; restore the existing fixed teaching viewport on exit.
    const existingViewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const viewport = existingViewport ?? document.createElement('meta');
    const previousContent = viewport.getAttribute('content');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width, initial-scale=1';
    if (!existingViewport) document.head.appendChild(viewport);
    const mobile = window.matchMedia('(max-width: 680px)');
    let mobileLayout = mobile.matches;
    setQuality(mobileLayout ? 'standard' : 'high'); setNarrow(mobileLayout);
    const updateBreakpoint = () => {
      if (mobile.matches === mobileLayout) return;
      mobileLayout = mobile.matches;
      setQuality(mobileLayout ? 'standard' : 'high'); setNarrow(mobileLayout);
    };
    mobile.addEventListener('change', updateBreakpoint);
    const frame = window.requestAnimationFrame(updateBreakpoint);
    return () => {
      window.cancelAnimationFrame(frame);
      mobile.removeEventListener('change', updateBreakpoint);
      if (!existingViewport) viewport.remove();
      else if (previousContent === null) viewport.removeAttribute('content');
      else viewport.setAttribute('content', previousContent);
    };
  }, []);

  useEffect(() => {
    if (projection) projectionExit.current?.focus();
    else if (wasProjection.current) projectionEnter.current?.focus();
    wasProjection.current = projection;
  }, [projection]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (projection) setProjection(false);
        else setState((previous) => ({ ...previous, isolatedPart: null, selectedPart: null }));
      }
      if (event.key !== 'Tab' || !projection) return;
      const focusable = Array.from(mainRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [projection]);

  const sceneField = useMemo(() => ({
    canvas: fieldCanvas, version: fieldVersion, show: !!eyepieceContent && state.lesson !== 'path',
    transmission: sampleLesson ? (showConoscopicFigure ? .35 : sampleBrightness) : undefined,
    sampleGlow: sampleLesson && !showConoscopicFigure ? sampleBrightness : 0,
  }), [fieldCanvas, fieldVersion, eyepieceContent, state.lesson, sampleLesson, showConoscopicFigure, sampleBrightness]);
  // ── 学员模式：动作提示指向要操作的部件，观察时目镜视场放大到展台左侧 ──
  const studentObserve = studentMode && !narrow && sampleLesson && !courseOverlay;
  const coach: SceneCoach | null = !studentMode || courseOverlay ? null : studentCoach({
    step: courseStepId, progress: courseProgress, state, active: optics.active, crossed, crossedNow, prediction, revealed, observation,
  });
  const sampleChoices = state.lesson === 'conoscope' ? CONOSCOPE_FEATURED : FEATURED_SAMPLE_IDS;
  const moreChoices = state.lesson === 'conoscope' ? PROFILES_BY_GROUP.anisotropic : POLARISCOPE_PROFILES;

  return (
    <main ref={mainRef} className={`pol-explore${projection ? ' pol-explore--projection' : ''}${courseActive ? ' pol-explore--course' : ''}${courseOverlay ? ' pol-explore--course-card' : ''}${studentMode ? ' pol-explore--student' : ''}${studentObserve ? ' pol-explore--student-observe' : ''}`} data-testid="polariscope-explore-page" data-lesson={state.lesson} data-course={courseActive ? courseStepId : undefined}>
      <div className="pol-explore__header">
        <Header title="偏光镜" subtitle="3D 仪器教学" right={<>
          <Link to={`/knowledge/polariscope#${state.lesson === 'principle' ? 'introduction' : 'structure'}`} className="pol-explore__back" data-testid="explore-back-to-knowledge">← 仪器知识库</Link>
          <button ref={projectionEnter} className="btn-ghost" onClick={() => setProjection(true)} aria-label="进入投屏模式">投屏模式</button>
        </>} />
      </div>
      <section className="pol-explore__intro" aria-labelledby="polariscope-explore-title">
        <div><span className="pol-explore__eyebrow">01 / POLARISCOPE</span><div className="pol-explore__title-row"><h1 id="polariscope-explore-title">偏光镜</h1><span className="pol-explore__status">3D 仪器教学</span></div><p>{lessonCopy.caption}</p></div>
        {courseActive ? null : <div className="pol-explore__intro-actions">
          <button className="pol-explore__button pol-explore__button--primary" onClick={() => startCourse('teacher')} data-testid="explore-course-start">引导课程 · 约 {Math.ceil(COURSE_MINUTES)} 分钟</button>
          <button className="pol-explore__button" onClick={() => startCourse('student')} data-testid="explore-student-start">学员自学</button>
          <LessonTabs value={state.lesson} onChange={changeLesson} />
        </div>}
      </section>
      {courseActive && <CourseGuide step={courseStep} reached={courseReached} progress={courseProgress} onStep={changeCourseStep} onFinish={finishCourse} onExit={exitCourse} onPickSample={chooseSample} onReorient={state.lesson === 'sample' && state.orientation === 'optic-axis' ? () => update({ orientation: 'general' }) : null} mode={studentMode ? 'student' : 'teacher'} onMode={changeCourseMode} />}
      <div className="pol-explore__workbench">
        <aside className="pol-explore__parts" aria-label="教学目录">
          {state.lesson === 'components' ? <>
            <div className="pol-explore__section-heading"><h2>部件目录</h2><span>08 PARTS</span></div>
            <div className="pol-explore__part-list">{PARTS.map((part, index) => <button key={part.id} className="pol-explore__part" aria-pressed={state.selectedPart === part.id} aria-label={`查看${part.shortName}`} onClick={() => selectPart(state.selectedPart === part.id ? null : part.id)} data-testid={`explore-part-${part.id}`}><span>{String(index + 1).padStart(2, '0')}</span><span>{part.shortName}</span><span aria-hidden="true">↗</span></button>)}</div>
            <p className="pol-explore__part-note">点击模型或部件名称，<br />自动聚焦，查看结构。</p>
          </> : state.lesson === 'path' ? <>
            <div className="pol-explore__section-heading"><h2>光的旅程</h2><span>05 STEPS</span></div>
            <div className="pol-explore__part-list">{PATH_STEPS.map((step, index) => <button key={step.title} className="pol-explore__part" aria-pressed={state.pathStep === index} onClick={() => changePathStep(index)} data-testid={`explore-path-step-${index}`}><span>0{index + 1}</span><span>{step.short}</span><span aria-hidden="true">↗</span></button>)}</div>
            <p className="pol-explore__part-note">光柱表示光经过的区域，<br />短杆表示电场振动方向。</p>
          </> : state.lesson === 'principle' ? <>
            <div className="pol-explore__section-heading"><h2>选择示例</h2><span>02 CASES</span></div>
            <div className="pol-explore__part-list">{([{ id: 'empty', label: '空载 · 两片偏光片' }, { id: 'half-wave', label: '理想双折射示例' }] as const).map((example, index) => <button key={example.id} className="pol-explore__part" aria-pressed={state.principleExample === example.id} onClick={() => changeExample(example.id)} data-testid={`explore-example-${example.id}`}><span>0{index + 1}</span><span>{example.label}</span><span aria-hidden="true">↗</span></button>)}</div>
            <p className="pol-explore__part-note">转动真实部件上的控件，<br />让方向与读数同步改变。</p>
          </> : <>
            <div className="pol-explore__section-heading"><h2>{state.lesson === 'sample' ? '选择样品' : '非均质样品'}</h2><span>{String(sampleChoices.length).padStart(2, '0')} SAMPLES</span></div>
            <div className="pol-explore__part-list">{sampleChoices.map((id, index) => { const item = getPolariscopeProfile(id)!; return <button key={id} className="pol-explore__part pol-explore__sample" aria-pressed={state.sampleId === id} onClick={() => chooseSample(id)} data-testid={`explore-sample-${id}`}><span>{String(index + 1).padStart(2, '0')}</span><span><i className="pol-explore__swatch" style={{ background: swatch(item) }} aria-hidden="true" />{item.name}{state.lesson === 'sample' ? null : <small>{item.opticAxialAngle ? '二轴' : item.quartz ? '水晶' : '一轴'}</small>}</span><span aria-hidden="true">↗</span></button>; })}</div>
            <label className="pol-explore__more-samples">更多样品<select value={state.sampleId} onChange={(event) => chooseSample(event.target.value)} aria-label="从样品库选择">{moreChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <p className="pol-explore__part-note">{state.lesson === 'sample' ? '样品的光性在揭晓前不显示。' : '只有非均质单晶才产生干涉图。'}</p>
          </>}
          <Link className="pol-explore__learning-link" to="/demo/polariscope" data-testid="explore-learning-link">进入互动学习 <span aria-hidden="true">↗</span><small>调正交 · 放样 · 旋转观察</small></Link>
        </aside>
        <section className="pol-explore__viewport" aria-label="偏光镜三维展台">
          <div className="pol-explore__scene"><PolariscopeScene state={state} quality={quality} resetViewKey={resetViewKey} viewPreset={viewPreset} onSelectPart={selectPart} onAngleChange={changeAngle} onPowerChange={(power) => update({ power })} onStatus={setSceneStatus} field={sceneField} coach={coach} viewShift={studentObserve ? .2 : 0} focusOnSelect={!studentMode} /></div>
          <div className="pol-explore__scene-caption"><div><span className="pol-explore__eyebrow">{state.lesson === 'path' ? `LIGHT PATH / 0${state.pathStep + 1}` : state.lesson === 'principle' ? 'POLARIZATION / 理想示意' : state.lesson === 'sample' ? 'SAMPLE / 正交偏光' : state.lesson === 'conoscope' ? 'CONOSCOPE / 锥光' : state.mode === 'explode' ? 'EXPLODED VIEW' : 'INSTRUMENT STUDY'}</span><h2>{state.lesson === 'components' ? modeCopy.caption : state.lesson === 'path' ? pathCopy.title : state.lesson === 'principle' ? (halfWave ? '理想半波片 · 单色 · 相位差 180°' : '空载：从平行转到正交。') : state.lesson === 'sample' ? '转动载物台，看目镜里的明暗' : showConoscopicFigure ? '干涉球就位：转动物台看图形' : '先放上干涉球'}</h2></div><span className="pol-explore__ready" data-status={sceneStatus} role="status">{STATUS_LABELS[sceneStatus]}</span></div>
          {courseOverlay && <div className="pol-course-overlay" data-testid="course-overlay">{courseOverlay === 'quiz'
            ? <CourseQuiz correct={courseProgress.correctQuestions} onCorrect={(id) => setCourseProgress((previous) => previous.correctQuestions.includes(id) ? previous : { ...previous, correctQuestions: [...previous.correctQuestions, id] })} />
            : <CourseComplete stepTimes={stepTimes} progress={courseProgress} topics={ADVANCED_TOPICS} onTopic={openAdvanced} onRestart={startCourse} onExit={exitCourse} />}</div>}
          {toast && <div className="pol-student-toast" key={toast.key} role="status" data-testid="student-toast">✓ {toast.text}</div>}
          {eyepieceContent && (studentObserve ? <div className="pol-student-observe" data-testid="student-observe">
            <EyepieceView content={eyepieceContent} stageDeg={state.stageAngle} analyzerDeg={state.analyzerAngle} active={optics.active} label={eyepieceLabel} onRendered={onFieldRendered} onCanvas={setFieldCanvas} />
            <StudentObservationCard prediction={prediction} onPredict={setPrediction} revealed={revealed} observation={observation} coverage={coverage} recording={recording}
              brightness={sampleBrightness} active={optics.active} crossed={crossed} autoRotate={autoRotate} onAutoRotate={() => setAutoRotate(!autoRotate)}
              trace={<RotationTrace curve={curve} visited={visited} current={state.stageAngle} reveal={revealed} analyzerDeg={state.analyzerAngle} />}
              onCrossed={() => changeAngle('analyzer', 90)} onPower={() => update({ power: true })}
              onReorient={profile.observation === 'anisotropic' && state.orientation === 'optic-axis' && revealed ? () => update({ orientation: 'general' }) : null} />
          </div> : <div className="pol-explore__eyepiece-dock">
            <EyepieceView content={eyepieceContent} stageDeg={state.stageAngle} analyzerDeg={state.analyzerAngle} active={optics.active} label={eyepieceLabel} onRendered={onFieldRendered} onCanvas={setFieldCanvas} />
          </div>)}
          {isolatedName && <div className="pol-explore__isolation"><span>单独查看 · {isolatedName}</span><button onClick={() => update({ isolatedPart: null })}>显示整机</button></div>}
          {(projection || studentMode && !studentObserve && !courseOverlay) && state.showAnnotations && <div className="pol-explore__projection-explainer" data-testid="projection-explainer"><span className="pol-explore__eyebrow">{lessonCopy.title}</span><h2>{projectionTitle}</h2><p>{projectionDescription}</p>{(state.lesson === 'path' || state.lesson === 'principle') && <p className="pol-explore__projection-reading">{optics.active ? `相对透过率 ${relativePercent}%（以下片后光强为 100%）` : blockedCopy}</p>}{state.lesson === 'principle' && halfWave && <small>单色 · 半波条件 · 理想薄片；非具体宝石实测。</small>}{sampleLesson && !optics.active && <p className="pol-explore__projection-reading">{blockedCopy}</p>}</div>}
          <div className="pol-explore__viewport-tools"><p>{state.mode === 'structure' && !state.isolatedPart ? (sampleLesson ? '拖动样品或物台环旋转样品 · 拖动空白旋转视角' : '拖动空白旋转视角 · 拖动圆环旋转部件') : '拖动旋转视角 · 滚轮缩放'}</p><div className="pol-explore__view-buttons">
            <button className="pol-explore__button" onClick={resetView} aria-label="恢复三维视角">恢复视角</button>
            <select className="pol-explore__quality" aria-label="观察视角" value={viewPreset} onChange={(event) => { setViewPreset(event.target.value as StructureViewPreset); update({ selectedPart: null, isolatedPart: null }); }}><option value="free">自由观察</option><option value="01-front">正面</option><option value="02-side">侧面</option><option value="03-top">俯视</option><option value="04-three-quarter">主视图</option><option value="05-analyzer-close">上环近景</option><option value="06-stage-close">物台近景</option></select>
            <select className="pol-explore__quality" aria-label="三维画质" value={quality} onChange={(event) => setQuality(event.target.value as 'standard' | 'high')}><option value="high">精细画质</option><option value="standard">流畅画质</option></select>
          </div></div>
          <div className="pol-explore__projection-controls" aria-label="投屏操作">
            {!courseActive && <select className="pol-explore__quality" aria-label="投屏讲解内容" value={state.lesson} onChange={(event) => changeLesson(event.target.value as Lesson)}>{LESSONS.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select>}
            {state.lesson === 'components' ? <>
              <button className="pol-explore__button" onClick={() => changeMode(state.mode === 'structure' ? 'explode' : 'structure')}>{state.mode === 'structure' ? '展开部件' : '整机结构'}</button>
              {state.mode === 'explode' ? <label className="pol-explore__projection-control">拆解<input className="pol-explore__range" type="range" min="0" max="1" step="0.01" value={state.explosion} aria-label="投屏拆解程度" onChange={(event) => update({ explosion: Number(event.target.value) })} /><output>{Math.round(state.explosion * 100)}%</output></label> : null}
            </> : state.lesson === 'path' ? <PathNavigation step={state.pathStep} onChange={changePathStep} compact /> : state.lesson === 'principle' ? <select className="pol-explore__quality pol-explore__example-select" aria-label="投屏原理示例" value={state.principleExample} onChange={(event) => changeExample(event.target.value as PolariscopeStructureState['principleExample'])}><option value="empty">空载</option><option value="half-wave">理想双折射示例</option></select>
              : <select className="pol-explore__quality" aria-label="投屏样品" value={state.sampleId} onChange={(event) => chooseSample(event.target.value)}>{moreChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
            {state.mode === 'structure' && <label className="pol-explore__projection-control">{(halfWave && state.lesson === 'principle') || sampleLesson ? '物台' : '检偏器'}<input className="pol-explore__range" type="range" min="0" max="360" value={(halfWave && state.lesson === 'principle') || sampleLesson ? state.stageAngle : state.analyzerAngle} aria-label={(halfWave && state.lesson === 'principle') || sampleLesson ? '投屏载物台角度' : '投屏检偏器角度'} onChange={(event) => changeAngle((halfWave && state.lesson === 'principle') || sampleLesson ? 'stage' : 'analyzer', Number(event.target.value))} /><output>{Math.round((halfWave && state.lesson === 'principle') || sampleLesson ? state.stageAngle : state.analyzerAngle)}°</output></label>}
            {state.lesson === 'principle' && halfWave && <button className="pol-explore__button" aria-pressed={crossed} onClick={() => changeAngle('analyzer', 90)}>90° 正交</button>}
            {state.lesson === 'sample' && !studentObserve && <select className="pol-explore__quality" aria-label="投屏预测" value={prediction ?? ''} disabled={revealed} onChange={(event) => setPrediction(event.target.value || null)}><option value="">先选预测…</option>{PHENOMENA.map((item) => <option key={item.id} value={item.id}>预测：{item.label}</option>)}<option value="demo">教师演示（不预测）</option></select>}
            {state.lesson === 'sample' && <button className="pol-explore__button" aria-pressed={autoRotate} onClick={() => setAutoRotate(!autoRotate)} disabled={!optics.active} aria-label={autoRotate ? '投屏停止转动' : '投屏转动一周'}>{autoRotate ? '停止转动' : '转动一周'}</button>}
            {state.lesson === 'sample' && profile.observation === 'anisotropic' && <button className="pol-explore__button" aria-pressed={state.orientation === 'optic-axis'} onClick={() => update({ orientation: state.orientation === 'optic-axis' ? 'general' : 'optic-axis' })} aria-label="投屏样品方向">{state.orientation === 'optic-axis' ? '换个方向放置' : '沿光轴放置'}</button>}
            {state.lesson === 'conoscope' && <button className="pol-explore__button" aria-pressed={state.conoscopeInserted} onClick={() => update({ conoscopeInserted: !state.conoscopeInserted, analyzerAngle: 90 })}>{state.conoscopeInserted ? '取下干涉球' : '放上干涉球'}</button>}
            {state.lesson === 'components' && <button className="pol-explore__button" aria-pressed={state.internalView} onClick={toggleInternal}>内部光源</button>}
            <PowerSwitch checked={state.power} onChange={() => update({ power: !state.power })} label="投屏电源开关" />
            <button className="pol-explore__button" aria-pressed={state.showAnnotations} onClick={() => update({ showAnnotations: !state.showAnnotations })}>{state.showAnnotations ? '隐藏辅助' : '显示辅助'}</button>
            <button className="pol-explore__button pol-explore__button--quiet" onClick={resetView}>恢复视角</button>
          </div>
        </section>
        <aside className="pol-explore__panel" aria-label={`${lessonCopy.title}说明与控制`}>
          {state.lesson === 'components' ? <>
            <div className="pol-explore__modes" role="group" aria-label="探索模式">{MODES.map((mode) => <button key={mode.id} className="pol-explore__mode" aria-pressed={state.mode === mode.id} onClick={() => changeMode(mode.id)} data-testid={`explore-mode-${mode.id}`}>{mode.title}</button>)}</div>
            <span className="pol-explore__eyebrow pol-explore__panel-heading">{selected ? `COMPONENT / ${String(PARTS.indexOf(selected) + 1).padStart(2, '0')}` : state.mode === 'explode' ? 'ASSEMBLY / 装配关系' : 'FOLLOW THE LIGHT'}</span>
            <h2>{selected ? selected.name : state.mode === 'explode' ? '展开部件，保留光源位置' : '光，从底座内部出发'}</h2>
            <p className="pol-explore__panel-intro">{selected ? selected.description : state.mode === 'explode' ? '展开上下偏光片、载物台与干涉球。底座与支架是一体外壳，内部光源和侧面电源按钮保持原位。' : '先认识部件，再跟随光路。接着转动上方检偏器，理解方向与明暗的关系。'}</p>
          </> : state.lesson === 'path' ? <>
            <span className="pol-explore__eyebrow">LIGHT PATH / 0{state.pathStep + 1} OF 05</span><h2>{pathCopy.title}</h2><p className="pol-explore__panel-intro">{pathCopy.description}</p><PathNavigation step={state.pathStep} onChange={changePathStep} />
            <div className="pol-explore__teaching-note"><p>光柱、方向线和振动短杆是讲解叠层，不代表空气中能看到的光束。当前为空载光路。</p></div>
          </> : state.lesson === 'principle' ? <>
            <span className="pol-explore__eyebrow">POLARIZATION / 理想示意</span><h2>{halfWave ? '一片理想薄片的变化' : '两片方向决定明暗'}</h2><p className="pol-explore__panel-intro">{principleCopy}</p>
            <div className="pol-explore__transmission" data-testid="principle-transmission" data-value={optics.relativeTransmission}><span>相对透过率</span><output>{optics.active ? `${relativePercent}%` : '—'}</output><div className="pol-explore__transmission-bar" aria-hidden="true"><span style={{ width: `${optics.active ? relativePercent : 0}%` }} /></div><small>以下偏光片之后的光强为 100%。</small></div>
            {halfWave && <div className="pol-explore__teaching-note"><strong>单色 · 半波条件 · 理想薄片</strong><p>双折射带来 180° 相位差。两片正交时，转动薄片得到明暗交替；不是某种宝石的实测结果。</p></div>}
          </> : state.lesson === 'sample' ? <>
            <span className="pol-explore__eyebrow">SAMPLE / 预测 · 观察 · 解释</span>
            <h2>{profile.name}{revealed ? <small className="pol-explore__category"> · {CATEGORY_LABEL[profile.observation]}</small> : null}</h2>
            {!crossed && <p className="pol-explore__blocked" role="status">检偏器未处于正交位置。<button className="pol-explore__link-button" onClick={() => changeAngle('analyzer', 90)}>转到 90° 正交</button></p>}
            <div className="pol-explore__poe" data-testid="sample-prediction">
              <span className="pol-explore__detail-label">① 预测：正交偏光下转动一周，视场里的样品会？</span>
              <div className="pol-explore__choice-grid">{PHENOMENA.map((item) => <button key={item.id} aria-pressed={prediction === item.id} onClick={() => setPrediction(item.id)} disabled={revealed}>{item.label}</button>)}<button aria-pressed={prediction === 'demo'} onClick={() => setPrediction('demo')} disabled={revealed} data-testid="sample-demo-mode">教师演示</button></div>
              <span className="pol-explore__detail-label">② 观察：转动载物台一整周</span>
              <RotationTrace curve={curve} visited={visited} current={state.stageAngle} reveal={revealed} analyzerDeg={state.analyzerAngle} />
              <div className="pol-explore__action-row"><button className="pol-explore__button" aria-pressed={autoRotate} onClick={() => setAutoRotate(!autoRotate)} data-testid="sample-auto-rotate" disabled={!optics.active}>{autoRotate ? '停止转动' : '自动转动一周'}</button></div>
              {!revealed && !recording && <p className="pol-explore__hint">{prediction === null ? '先在上面选一个预测（课堂讲解可选“教师演示”），再开始转动；连续转满一周后揭晓解释。' : !optics.active ? '电源未开启或仪器未装配，暂不记录。' : '检偏器不在正交位置，暂不记录。'}</p>}
              {revealed && <div className="pol-explore__reveal" data-testid="sample-reveal" data-observation={observation}>
                <span className="pol-explore__detail-label">③ 解释 · {prediction === 'demo' ? '教师演示' : prediction === EXPECTED_PREDICTION[observation] ? '与预测一致' : '与预测不同'}</span>
                <strong>{OBSERVATION_COPY[observation].title}</strong><p>{OBSERVATION_COPY[observation].text}</p>
                {profile.observation === 'isotropic' && profile.depolarization > 0.1 && <p className="pol-explore__hint">这块样品半透明，内部散射让少量光通过，视场呈暗灰而不是全黑；判断看的是转动时有没有规律的明暗变化。</p>}
              </div>}
            </div>
            <div className="pol-explore__sample-tools">
              {profile.quartz && <button className="pol-explore__button" aria-pressed={state.brazilTwin} onClick={() => update({ brazilTwin: !state.brazilTwin })} data-testid="sample-brazil-twin">巴西律双晶示意{state.brazilTwin ? '（已开启）' : ''}</button>}
              {profile.observation === 'anisotropic' && <button className="pol-explore__button" aria-pressed={state.orientation === 'optic-axis'} onClick={() => update({ orientation: state.orientation === 'optic-axis' ? 'general' : 'optic-axis' })} data-testid="sample-orientation">{state.orientation === 'optic-axis' ? '换个方向放置' : '沿光轴方向放置'}</button>}
              {profile.observation === 'isotropic' && <label className="pol-explore__inline-range">内部应变<input type="range" min="0" max="1" step="0.05" value={strain} onChange={(event) => update({ strain: Number(event.target.value) })} aria-label="内部应变强度" /><output>{strain > 0.05 ? '有' : '无'}</output></label>}
              {(profile.observation === 'isotropic' || profile.observation === 'anisotropic') && <button className="pol-explore__button" onClick={runAdrCheck} disabled={!optics.active} data-testid="sample-adr-check">平行复核（区分 ADR）</button>}
              {adrCheck && <p className="pol-explore__adr" data-testid="sample-adr-result" data-verdict={adrCheck.verdict}>{adrCheck.verdict === 'along-axis' ? '当前为沿光轴观察，平行复核不适用。水晶仍可能因旋光呈现颜色；请换个方向放置后复查。'
                : adrCheck.verdict === 'dark-no-check' ? (adrCheck.scatter > 0.03
                  ? `正交下最亮约 ${Math.round(adrCheck.crossed * 100)}%，其中包含散射背景。扣除背景后的明暗反应较弱，本次平行复核无法可靠确认是否存在应变双折射。请换个方向放置后复查。`
                  : `正交下最亮约 ${Math.round(adrCheck.crossed * 100)}%，明暗反应较弱，本次平行复核无法可靠确认是否存在应变双折射。请换个方向放置后复查。`)
                  : `先转到最亮位置（正交亮度 ${Math.round(adrCheck.crossed * 100)}%），再把检偏器转到平行：${Math.round(adrCheck.parallel * 100)}%。${adrCheck.verdict === 'strain' ? '明显变亮 → 应变造成的异常双折射（本质是均质体）。' : '没有明显变亮 → 真正的双折射。'}`}</p>}
            </div>
          </> : <>
            <span className="pol-explore__eyebrow">CONOSCOPE / 锥光干涉图</span>
            <h2>{profile.name}</h2>
            <p className="pol-explore__panel-intro">{conoscopeExplanation(conoscopeKind, state.orientation, showConoscopicFigure, conoscopeContext)}</p>
            <div className="pol-explore__steps">
              <button className="pol-explore__button" aria-pressed={crossed} onClick={() => changeAngle('analyzer', 90)}>① 正交偏光</button>
              <button className="pol-explore__button pol-explore__button--primary" aria-pressed={state.conoscopeInserted} onClick={() => update({ conoscopeInserted: !state.conoscopeInserted, analyzerAngle: 90 })} data-testid="conoscope-toggle">{state.conoscopeInserted ? '② 取下干涉球' : '② 放上干涉球'}</button>
            </div>
            {crystal && <div className="pol-explore__sample-tools">
              <span className="pol-explore__detail-label">样品方向</span>
              <div className="pol-explore__choice-grid" data-testid="conoscope-orientation">{profile.orientations.map((view) => <button key={view} aria-pressed={state.orientation === view} onClick={() => update({ orientation: view })}>{ORIENTATION_LABEL[view]}</button>)}</div>
              <label className="pol-explore__inline-range">样品厚度<input type="range" min="0.5" max="5" step="0.1" value={state.thicknessMm} onChange={(event) => update({ thicknessMm: Number(event.target.value) })} aria-label="样品厚度" /><output>{state.thicknessMm.toFixed(1)} mm</output></label>
              {profile.quartz && <button className="pol-explore__button" aria-pressed={state.brazilTwin} onClick={() => update({ brazilTwin: !state.brazilTwin })}>巴西律双晶示意{state.brazilTwin ? '（已开启）' : ''}</button>}
              <p className="pol-explore__hint">厚度越大、双折射率越高，色环越多越密（本样品双折射率 {profile.birefringence.toFixed(3)}）。</p>
            </div>}
            {!crystal && <p className="pol-explore__blocked" role="status">{profile.name}是{CATEGORY_LABEL[profile.observation]}，不产生干涉图。请选择非均质单晶。</p>}
          </>}
          {!optics.active && state.lesson !== 'components' && <p className="pol-explore__blocked" role="status">{blockedCopy}</p>}
          <div className="pol-explore__control pol-explore__control--compact"><div className="pol-explore__control-head"><span>电源</span><PowerSwitch checked={state.power} onChange={() => update({ power: !state.power })} /></div><p>也可直接点击底座侧面的电源按钮。</p></div>
          {state.lesson === 'components' ? <div className="pol-explore__internal-control"><button className="pol-explore__button" aria-pressed={state.internalView} onClick={toggleInternal} data-testid="explore-internal-toggle">{state.internalView ? '恢复底座外壳' : '查看内部光源'}<span aria-hidden="true">{state.internalView ? '↶' : '↗'}</span></button><p>{state.internalView ? '透明外壳与轮廓线表示底座与支架的边界。' : '透过底座外壳，查看光源与通光孔。'}</p></div> : state.lesson === 'path' || state.lesson === 'principle' ? <p className="pol-explore__teaching-footnote">为显示光路，外壳暂以透明显示。</p> : null}
          {state.lesson === 'components' && <>
            {state.mode === 'explode' && <div className="pol-explore__control"><div className="pol-explore__control-head"><label htmlFor="explosion-amount">拆解程度</label><output htmlFor="explosion-amount">{Math.round(state.explosion * 100)}%</output></div><input id="explosion-amount" aria-label="拆解程度" className="pol-explore__range" type="range" min="0" max="1" step="0.01" value={state.explosion} onChange={(event) => update({ explosion: Number(event.target.value) })} /><div className="pol-explore__range-labels"><span>装配</span><span>展开</span></div><p>拆解说明部件关系；内部光源和一体的支架始终留在原位。</p><button className="pol-explore__button" data-testid="explore-assembly-toggle" onClick={() => update({ explosion: state.explosion > 0 ? 0 : 1 })}>{state.explosion > 0 ? '收回装配' : '完整展开'}</button></div>}
            {selected ? <div className="pol-explore__detail"><span className="pol-explore__detail-label">结构与操作</span><p>{selected.operation}</p><div className="pol-explore__action-row"><button className="pol-explore__button" aria-pressed={state.isolatedPart === selected.id} data-testid="explore-isolate-toggle" onClick={() => update({ isolatedPart: state.isolatedPart === selected.id ? null : selected.id, ...(selected.id === 'light' ? { internalView: true } : {}) })}>{state.isolatedPart === selected.id ? '显示整机' : selected.id === 'light' ? '单独查看光源与底座' : '单独查看'}</button><button className="pol-explore__button pol-explore__button--quiet" onClick={() => selectPart(null)}>清除选择</button></div></div> : <div className="pol-explore__detail">{courseActive ? <p className="pol-explore__hint">按上方课程条的提示点选部件。</p> : <button className="pol-explore__button" onClick={() => changeLesson('path')}>沿光路继续认识 →</button>}</div>}
          </>}
          <div className="pol-explore__mechanical-note"><span className="pol-explore__detail-label">{state.lesson === 'components' ? '结构动作示意' : '方向与角度'}</span><p>{state.lesson === 'components' ? '只有载物台和上方检偏器可以转动；下偏光片固定。角度以模型初始位置为零点。圆环可直接拖动，也可用方向键调节控件。' : '下片透光轴固定为 0°（目镜中的 P）。角度跟随部件，不随相机视角改变。'}</p></div>
          <AngleControl id="analyzer-angle" label="上偏光片角度" value={state.analyzerAngle} onChange={(value) => changeAngle('analyzer', value)} />
          {state.lesson !== 'components' && <AnglePresets value={state.analyzerAngle} onChange={(value) => changeAngle('analyzer', value)} choices={[{ value: 0, label: '0° 平行' }, { value: 45, label: '45° 斜交' }, { value: 90, label: '90° 正交' }]} />}
          <AngleControl id="stage-angle" label="载物台角度" value={state.stageAngle} onChange={(value) => changeAngle('stage', value)} />
          {state.lesson === 'principle' && (halfWave ? <AnglePresets value={state.stageAngle} onChange={(value) => changeAngle('stage', value)} choices={[0, 45, 90, 135, 180, 225, 270, 315, 360].map((value) => ({ value, label: `${value}°` }))} /> : <p className="pol-explore__teaching-footnote">空载时，转动物台不改变透过率。</p>)}
          <button className="pol-explore__button pol-explore__annotation-toggle" aria-pressed={state.showAnnotations} onClick={() => update({ showAnnotations: !state.showAnnotations })}>{state.showAnnotations ? '隐藏辅助标记' : '显示辅助标记'}</button>
          <div className="pol-explore__panel-footer"><button className="pol-explore__button pol-explore__button--quiet" onClick={resetAll} data-testid="explore-reset-all">恢复初始状态</button><p>参考原项目仪器形态；尺寸未实测校准。</p></div>
        </aside>
      </div>
      <footer className="pol-explore__footer"><a href={`${import.meta.env.BASE_URL}assets/3d/polariscope/references/index.html`} target="_blank" rel="noreferrer">公开参考资料 ↗</a><details><summary>模型与教学说明</summary><p>同一模型用于部件、光路、偏振原理、样品观察与干涉图讲解。底座与支架为一体金属外壳；下偏光片固定，只有载物台与检偏器转动。光柱、方向线、振动短杆和理想薄片属于教学叠层。</p><p>目镜视场与干涉图由程序按晶体光学实时计算：线性延迟按 I = cos²A − sin2ψ·sin2(ψ−A)·sin²(πΓ/λ)，干涉色对 400–700 nm 光谱按 CIE 1931 配色函数积分；一轴晶 Δn·sin²θ、二轴晶 Δn·sinθ₁·sinθ₂ 与 Biot–Fresnel 振动方向；水晶旋光用 Jones 椭圆延迟器。模型为理想平行板，忽略刻面折射、吸收与色散细节；体色、2V 与厚度为示意取值。用于建立现象与原理的对应，不能作为具体宝石的鉴定或实测结果。</p><p><a href="https://github.com/skyjia/gemology-notes" target="_blank" rel="noreferrer">宝石学笔记</a> · <a href="https://openstax.org/books/university-physics-volume-3/pages/1-7-polarization" target="_blank" rel="noreferrer">OpenStax：偏振原理</a> · <a href="https://www.edmundoptics.com/knowledge-center/application-notes/optics/understanding-waveplates/" target="_blank" rel="noreferrer">Edmund Optics：波片原理</a> · <a href="https://www.gia.edu/dam/jcr%3Af7447e1e-6b07-4098-bfb6-ad728779c998/GIA-Polariscope-User-Guide-English.pdf" target="_blank" rel="noreferrer">GIA 操作指南</a> · <a href="https://pubs.geoscienceworld.org/ejm/eurjmin/article/25/1/5/69671/A-revised-Michel-Levy-interference-colour-chart" target="_blank" rel="noreferrer">Sørensen 2013：Michel-Lévy 色图</a> · <a href="https://geo.libretexts.org/Bookshelves/Geology/Mineralogy_(Perkins_et_al.)/05:_Optical_Mineralogy/5.06:_Interference_Figures" target="_blank" rel="noreferrer">LibreTexts：干涉图</a></p></details><Link to="/demo/polariscope" className="pol-explore__footer-learning">继续互动学习 →</Link></footer>
      <button ref={projectionExit} className="pol-explore__button pol-explore__projection-exit" onClick={() => setProjection(false)} aria-label="退出投屏模式">退出投屏 · Esc</button>
    </main>
  );
}

function swatch(profile: PolariscopeSampleProfile) {
  const [r, g, b] = profile.bodyColor.map((v) => Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2)));
  return `rgb(${r}, ${g}, ${b})`;
}
const ORIENTATION_LABEL: Record<SampleOrientation, string> = { general: '一般方向', 'optic-axis': '光轴直立', 'off-axis': '光轴偏斜', 'acute-bisectrix': '锐角等分线' };
interface ConoscopeContext {
  twin: boolean;
  visibleAxes: number;
  wideField: boolean;
  crossed: boolean;
  parallel: boolean;
  blockedReason: string | null;
}
/** 干涉图说明随实际状态（取向、双晶、视场内的光轴出露点、是否扩大角域）变化，不作超出当前条件的断言。 */
function conoscopeExplanation(kind: 'uniaxial' | 'quartz' | 'biaxial' | null, view: SampleOrientation, inserted: boolean, context: ConoscopeContext) {
  if (context.blockedReason) return `${context.blockedReason}当前暗场不能用于判断样品是否消光。`;
  if (!kind) return '干涉图需要非均质单晶。均质体不分光，集合体中晶粒取向杂乱，都看不到干涉图。';
  if (!context.crossed) {
    const centre = context.parallel && kind === 'quartz' && context.twin && view === 'optic-axis'
      ? '本例等厚左右旋双层沿光轴抵消旋光，两片平行时视场中心明亮。' : '黑带与颜色会随检偏器角度改变。';
    return `当前为${context.parallel ? '平行' : '斜交'}偏光。${centre}请先转到 90° 正交${inserted ? '，再按本节方法观察干涉图。' : '，再把干涉球放到样品上方观察干涉图。'}`;
  }
  if (!inserted) return `在正交偏光下，把干涉球放到样品上方，靠近或轻触合适的观察区域。光自下而上穿过样品后进入干涉球；视场中每一点对应样品中的一个传播方向。当前样品方向：${ORIENTATION_LABEL[view]}${view === 'optic-axis' ? (kind === 'quartz' && !context.twin ? '——正光下呈恒定颜色（旋光），正是找干涉图的好方向。' : '——正光下近于全暗，正是找干涉图的好方向。') : '。'}`;
  if (view === 'general') return context.visibleAxes > 0
    ? '一般方向：本例有光轴出露点落在视场内，但偏离中心，图形不完整，判断轴性仍不可靠。应调整样品方向，使光轴大致直立后再观察。'
    : '一般方向：本例光轴出露点不在视场内，只看到随物台转动扫过的黑带和色带，难以判断轴性。实际操作中要转动、翻动样品，找到合适方向后再观察。';
  if (kind === 'quartz') {
    if (context.twin) {
      const axis = view === 'off-axis'
        ? '光轴出露点已离开视场中心；正交下，该点因左右旋光互相抵消而近于消光，并随物台转动绕视场中心移动。视场中心不一定暗。'
        : '光轴出露点位于视场中心；正交下，沿光轴的左右旋光互相抵消，中心消光。';
      return `已开启巴西律双晶示意（等厚左右旋两层的理想模型）：${axis}天然双晶的层厚、分区与取向各异，实际图样更复杂，不能推广为所有双晶都呈现相同图样。`;
    }
    return view === 'off-axis'
      ? '水晶光轴偏斜：牛眼中心随光轴出露点离开视场中心；转动物台，图形绕中心平移。旋光只在光轴附近明显。'
      : '水晶的牛眼（单一旋向、光轴直立）：黑十字到不了中心，中心是彩色圆斑——这是旋光性的结果。转动检偏器，中心颜色随之改变。';
  }
  if (kind === 'uniaxial') return view === 'off-axis'
    ? '光轴偏斜：黑十字中心离开视场中心。转动物台，十字绕中心平移，但两臂始终保持横竖方向、不旋转——这是一轴晶的判断要点。'
    : '一轴晶：黑十字加同心色环。光轴居中时，转动物台十字保持不动。色环是等光程差线，越往外级次越高。';
  return view === 'acute-bisectrix'
    ? `二轴晶锐角等分线图：消光位时两条黑带合成十字；转动物台，十字分裂成两条双曲线，45° 时分得最开，每 90° 重新合拢。${context.wideField ? '本例 2V 较大，这里是「扩大角域原理图」：用超出普通干式干涉球的视场角显示两个光轴出露点，实际仪器中黑带通常会移出视场。' : ''}`
    : '二轴晶单光轴图：一条穿过中心的黑带。转动物台，黑带绕中心转动并弯曲，45° 时弯曲最明显——一轴晶的十字臂不会这样旋转。';
}

function LessonTabs({ value, onChange }: { value: Lesson; onChange: (lesson: Lesson) => void }) {
  return <div className="pol-explore__lessons" role="group" aria-label="讲解内容">{LESSONS.map((lesson, index) => <button key={lesson.id} aria-pressed={value === lesson.id} onClick={() => onChange(lesson.id)} data-testid={`explore-lesson-${lesson.id}`}><span>0{index + 1}</span>{lesson.title}</button>)}</div>;
}
function PathNavigation({ step, onChange, compact = false }: { step: number; onChange: (step: number) => void; compact?: boolean }) {
  return <div className={`pol-explore__path-navigation${compact ? ' pol-explore__path-navigation--compact' : ''}`} aria-label={compact ? '投屏光路步骤' : '光路步骤控制'}><button className="pol-explore__button" disabled={step === 0} onClick={() => onChange(step - 1)} aria-label={compact ? '投屏上一步' : '光路上一步'}>← 上一步</button><span>{step + 1} / 5</span><button className="pol-explore__button" disabled={step === 4} onClick={() => onChange(step + 1)} aria-label={compact ? '投屏下一步' : '光路下一步'}>下一步 →</button>{!compact && <button className="pol-explore__button pol-explore__button--quiet" onClick={() => onChange(4)}>查看全程</button>}</div>;
}
function AnglePresets({ value, onChange, choices }: { value: number; onChange: (value: number) => void; choices: { value: number; label: string }[] }) {
  return <div className="pol-explore__angle-presets">{choices.map((choice) => <button key={choice.value} aria-pressed={Math.abs(value - choice.value) < .5} onClick={() => onChange(choice.value)}>{choice.label}</button>)}</div>;
}
function PowerSwitch({ checked, onChange, label = '电源开关' }: { checked: boolean; onChange: () => void; label?: string }) {
  return <button role="switch" aria-checked={checked} aria-label={label} className="pol-explore__switch" onClick={onChange}><span>{checked ? '已开启' : '已关闭'}</span><span className="pol-explore__switch-track" aria-hidden="true" /></button>;
}
function AngleControl({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (value: number) => void }) {
  return <div className="pol-explore__control"><div className="pol-explore__control-head"><label htmlFor={id}>{label}</label><output htmlFor={id}>{Math.round(value)}°</output></div><input id={id} aria-label={label} aria-valuetext={`${Math.round(value)} 度`} className="pol-explore__range" type="range" min="0" max="360" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} /><div className="pol-explore__range-labels"><span>0°</span><span>360°</span></div></div>;
}

const partNumber = (id: StructurePartId) => String(STRUCTURE_PART_IDS.indexOf(id) + 1).padStart(2, '0');
const PATH_COACH_PARTS: StructurePartId[] = ['light', 'polarizer', 'stage', 'analyzer', 'analyzer'];

/**
 * 学员模式的动作提示：每一步只指向一个要操作的部件。前置条件不满足（未通电、未正交）时，
 * 先指向需要纠正的部件；预测与揭晓由展台内的观察卡片承担，这时不再另给气泡。
 */
function studentCoach({ step, progress, state, active, crossed, crossedNow, prediction, revealed, observation }: {
  step: CourseStepId; progress: CourseProgress; state: PolariscopeStructureState; active: boolean; crossed: boolean; crossedNow: boolean;
  prediction: string | null; revealed: boolean; observation: SampleObservation;
}): SceneCoach | null {
  const power: SceneCoach = { part: 'powerSwitch', text: '电源关着：点这个按钮打开光源' };
  switch (step) {
    case 'parts': {
      const next = (['polarizer', 'stage', 'analyzer'] as const).find((id) => !progress.partsSeen.includes(id));
      return next ? { part: next, text: `点这里：${PARTS_BY_ID[next].shortName}（${partNumber(next)}）` } : { part: 'analyzer', text: '三个部件都认识了，点上方「下一步」', tone: 'done' };
    }
    case 'path':
      return state.pathStep < 4
        ? { part: PATH_COACH_PARTS[state.pathStep], text: `光现在到了：${PATH_STEPS[state.pathStep].short}。点下方「下一步」继续` }
        : { part: 'analyzer', text: '光路走完了，点上方「下一步」', tone: 'done' };
    case 'crossed':
      if (!state.power) return power;
      return crossedNow ? { part: 'analyzer', text: '已正交：空载视场全暗', tone: 'done' }
        : { part: 'analyzer', text: `拖动这个镜环转到 90°，看视场变暗（现在 ${Math.round(state.analyzerAngle)}°）` };
    case 'rotate': case 'reorient':
      if (!state.power) return power;
      if (!active) return null;
      if (!crossed) return { part: 'analyzer', text: '先把上偏光片转回 90° 正交，再观察样品' };
      if (prediction === null) return null;
      if (!revealed) return { part: 'stage', text: '眼睛看左边的视场，手拖动这里转一整周' };
      if (step === 'reorient' && state.orientation === 'optic-axis' && observation === 'axis-dark') return { part: 'stage', text: '全暗不一定是均质体：换个方向放置，再转一周' };
      return null;
    default: return null;
  }
}

/** 学员模式：放大的目镜视场旁的「预测 → 观察 → 解释」卡片，学员不必去侧栏找控件。 */
function StudentObservationCard({ prediction, onPredict, revealed, observation, coverage, recording, brightness, active, crossed, autoRotate, onAutoRotate, trace, onCrossed, onPower, onReorient }: {
  prediction: string | null; onPredict: (value: string) => void; revealed: boolean; observation: SampleObservation; coverage: number; recording: boolean;
  brightness: number; active: boolean; crossed: boolean; autoRotate: boolean; onAutoRotate: () => void; trace: React.ReactNode;
  onCrossed: () => void; onPower: () => void; onReorient: (() => void) | null;
}) {
  const copy = OBSERVATION_COPY[observation];
  const match = prediction === 'demo' ? '未预测' : prediction === EXPECTED_PREDICTION[observation] ? '与预测一致' : '与预测不同';
  return (
    <div className="pol-student-card" data-testid="student-card" data-phase={revealed ? 'explain' : prediction === null ? 'predict' : 'observe'}>
      {!active ? <div className="pol-student-card__blocked"><p>电源关着，视场是暗的，这时不能判断样品。</p><button className="btn-ghost" onClick={onPower}>打开电源</button></div>
        : !crossed ? <div className="pol-student-card__blocked"><p>上偏光片不在 90° 正交，背景本身就亮，先调回正交。</p><button className="btn-ghost" onClick={onCrossed}>转到 90° 正交</button></div>
          : revealed ? <>
            <span className="pol-student-card__step">③ 解释 · {match}</span>
            <strong>{copy.title}</strong>
            <p>{copy.text}</p>
            {onReorient && <button className="btn-primary pol-student-card__primary" onClick={onReorient} data-testid="student-reorient">换个方向放置，再转一周</button>}
          </> : prediction === null ? <>
            <span className="pol-student-card__step">① 先预测</span>
            <strong>正交偏光下转动一周，视场里的样品会？</strong>
            <div className="pol-student-card__choices">{PHENOMENA.slice(0, 3).map((item) => <button key={item.id} onClick={() => onPredict(item.id)} data-testid={`student-predict-${item.id}`}>{item.label}</button>)}<button onClick={() => onPredict('demo')} data-testid="student-predict-skip">不确定，直接看</button></div>
          </> : <>
            <span className="pol-student-card__step">② 观察 · 已转过 {Math.round(coverage * 100)}%</span>
            <strong>眼睛看视场，手转载物台</strong>
            <p className="pol-student-card__live" data-testid="student-live">{!recording ? '暂未记录' : brightness < .04 ? '当前：暗位，继续转，找有没有变亮' : '当前：较亮，继续转，看会不会再变暗'}</p>
            {trace}
            <button className="btn-ghost" onClick={onAutoRotate} data-testid="student-auto-rotate">{autoRotate ? '停止转动' : '自动转一周'}</button>
          </>}
    </div>
  );
}
