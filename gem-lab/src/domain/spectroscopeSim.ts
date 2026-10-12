import { SAMPLES } from '../data/samples';
import type { SampleDef } from '../data/types';
import type { CourseMode } from './course';
import { BENCH_METHOD_LABELS, benchMethodSetup, createBenchState, type BenchMethod, type BenchState } from './spectroscopeBench';
import {
  allComplete, configOf, COURSE_CONFIG, COURSE_SAMPLE, courseChecklist, initialCourse, isComplete,
  operate, QUESTIONS, type CourseState, type CourseVariant, type Operation, type StepId,
} from './spectroscopeCourse';
import { QUESTION_SHORT, STEP_SCREEN, STEP_SHORT } from './spectroscopeCopy';
import type { SimScreenId } from './simSession';

/**
 * 分光镜仿真的状态模型：把「屏幕场景」与「任务自有状态」合成为课程域认识的 CourseState，
 * 再把操作结果拆回去。课程步骤、完成条件与学习记录规则一律沿用 domain/spectroscopeCourse.ts，不另写一套。
 *
 * 约束（docs/整体重构规划-PhET风格-2026-10-11.md 第六节第 3 条）：
 * - 任务进度存在会话的任务状态里，换屏与「全部重置」都不动它；
 * - 两个机型（棱镜式 / 光栅式）各存一份进度，切来切去不丢已完成的步骤。
 */

export type Machine = CourseVariant;
export type ChallengeDifficulty = 'beginner' | 'intermediate' | 'advanced';

/** 挑战屏抽到的未知样品（只在本屏用：难度与样品 id，保存后由屏内揭示答案）。 */
export interface ChallengeDraw { difficulty: ChallengeDifficulty; sampleId: string }

export const DIFFICULTY_LABELS: Record<ChallengeDifficulty, string> = { beginner: '初级', intermediate: '中级', advanced: '高级' };
export const isDifficulty = (value: unknown): value is ChallengeDifficulty => value === 'beginner' || value === 'intermediate' || value === 'advanced';

/** 引导任务状态（会话的任务自有状态）。mode 为 null 表示还没选讲师演示 / 学员自学。 */
export interface SpectroscopeTaskData {
  mode: CourseMode | null;
  /** 最近所在的一步（用于深链进入与跨屏指引）；实际显示哪一步见 screenStep。 */
  step: StepId;
  hasSkipped: boolean;
  byVariant: Record<Machine, VariantTask>;
  /** 挑战屏在本轮抽到的未知样品；未抽取时为 null。 */
  challenge: ChallengeDraw | null;
}

export interface VariantTask {
  partsSeen: string[];
  casesSeen: string[];
  answers: Record<string, number>;
  continuousRecorded: boolean;
}

export const emptyVariantTask = (): VariantTask => ({ partsSeen: [], casesSeen: [], answers: {}, continuousRecorded: false });

export function emptyTaskData(): SpectroscopeTaskData {
  return { mode: null, step: 'parts', hasSkipped: false, byVariant: { prism: emptyVariantTask(), grating: emptyVariantTask() }, challenge: null };
}

const STEP_IDS = COURSE_CONFIG.prism.steps.map((item) => item.id);
export const isStepId = (value: unknown): value is StepId => typeof value === 'string' && (STEP_IDS as readonly string[]).includes(value);
export const isMachine = (value: unknown): value is Machine => value === 'prism' || value === 'grating';

/** 会话里读任务状态：缺失或残缺时回落到初值，避免旧会话或深链把页面打崩。 */
export function readTaskData(data: Record<string, unknown> | undefined): SpectroscopeTaskData {
  const base = emptyTaskData();
  if (!data || typeof data !== 'object') return base;
  const byVariant = { ...base.byVariant };
  for (const machine of ['prism', 'grating'] as const) {
    const slice = (data.byVariant as Record<string, unknown> | undefined)?.[machine] as Partial<VariantTask> | undefined;
    if (!slice || typeof slice !== 'object') continue;
    byVariant[machine] = {
      partsSeen: Array.isArray(slice.partsSeen) ? slice.partsSeen.filter((id): id is string => typeof id === 'string') : [],
      casesSeen: Array.isArray(slice.casesSeen) ? slice.casesSeen.filter((id): id is string => typeof id === 'string') : [],
      answers: slice.answers && typeof slice.answers === 'object' ? { ...slice.answers } as Record<string, number> : {},
      continuousRecorded: slice.continuousRecorded === true,
    };
  }
  const raw = data.challenge as Partial<ChallengeDraw> | undefined;
  const challenge = raw && isDifficulty(raw.difficulty) && SAMPLES.some((item) => item.id === raw.sampleId)
    ? { difficulty: raw.difficulty, sampleId: raw.sampleId as string }
    : null;
  return {
    mode: data.mode === 'student' || data.mode === 'teacher' ? data.mode : null,
    step: isStepId(data.step) ? data.step : base.step,
    hasSkipped: data.hasSkipped === true,
    byVariant,
    challenge,
  };
}

/** 认识屏的场景：光路视图与所选示例按机型分别记住；其余显示开关与拆解为屏共用。 */
export interface LearnScene extends Record<string, unknown> {
  rays: boolean; names: boolean; values: boolean; explode: number;
  byVariant: Record<Machine, { view: 'whole' | 'optics'; caseId: string | null }>;
}

/** 本屏保存过的一次观察记录；条件一变只标记为过期，不自动恢复确认。 */
export interface SavedRecord { notes: string; stale: boolean; pending: boolean }

/** 实验屏与挑战屏的场景：工作台状态、本次记录与观察记录的去向。 */
export interface LabScene extends Record<string, unknown> {
  sampleId: string;
  method: BenchMethod;
  dispersion: Machine;
  bench: BenchState;
  marks: number[]; bands: { start: number; end: number }[]; noAbsorption: boolean; notes: string; checked: boolean;
  beams: boolean; names: boolean; values: boolean;
  view: 'whole' | 'lamp' | 'sample' | 'instrument';
  saved: SavedRecord | null;
}

const VIEWS = ['whole', 'lamp', 'sample', 'instrument'] as const;

export const LEARN_INITIAL: LearnScene = {
  rays: true, names: false, values: true, explode: 0,
  byVariant: { prism: { view: 'whole', caseId: null }, grating: { view: 'whole', caseId: null } },
};

export function labInitial(machine: Machine, sampleId = 'ruby', method: BenchMethod = 'transmission'): LabScene {
  return {
    sampleId, method, dispersion: machine,
    bench: { ...createBenchState(machine), method, ...benchMethodSetup(method) },
    marks: [], bands: [], noAbsorption: false, notes: '', checked: false,
    beams: true, names: false, values: true, view: 'whole', saved: null,
  };
}

/** 场景读取：缺字段时回落到初值（旧会话、深链或结构变更都不会打崩页面）。 */
export function readLearnScene(scene: Record<string, unknown> | undefined): LearnScene {
  const raw = (scene ?? {}) as Partial<LearnScene>;
  const byVariant = { ...LEARN_INITIAL.byVariant };
  for (const key of ['prism', 'grating'] as const) {
    const slice = raw.byVariant?.[key];
    if (slice && typeof slice === 'object') byVariant[key] = { view: slice.view === 'optics' ? 'optics' : 'whole', caseId: typeof slice.caseId === 'string' ? slice.caseId : null };
  }
  return {
    rays: raw.rays !== false, names: raw.names === true, values: raw.values !== false,
    explode: typeof raw.explode === 'number' && Number.isFinite(raw.explode) ? Math.min(1, Math.max(0, raw.explode)) : 0,
    byVariant,
  };
}

export function readLabScene(scene: Record<string, unknown> | undefined, machine: Machine): LabScene {
  const raw = (scene ?? {}) as Partial<LabScene>;
  const method: BenchMethod = raw.method && raw.method in BENCH_METHOD_LABELS ? raw.method : 'transmission';
  const sampleId = SAMPLES.some((item) => item.id === raw.sampleId) ? raw.sampleId! : 'ruby';
  const bench = raw.bench && typeof raw.bench === 'object' ? raw.bench as BenchState : null;
  return {
    sampleId, method, dispersion: machine,
    bench: bench ? { ...bench, dispersion: machine } : { ...createBenchState(machine), method, ...benchMethodSetup(method) },
    marks: Array.isArray(raw.marks) ? raw.marks.filter((wl) => Number.isFinite(wl)) : [],
    bands: Array.isArray(raw.bands) ? raw.bands.filter((band) => band && Number.isFinite(band.start) && Number.isFinite(band.end)) : [],
    noAbsorption: raw.noAbsorption === true,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    checked: raw.checked === true,
    beams: raw.beams !== false, names: raw.names === true, values: raw.values !== false,
    view: (VIEWS as readonly string[]).includes(raw.view as string) ? raw.view as LabScene['view'] : 'whole',
    saved: raw.saved && typeof raw.saved === 'object' && typeof raw.saved.notes === 'string'
      ? { notes: raw.saved.notes, stale: raw.saved.stale === true, pending: raw.saved.pending === true }
      : null,
  };
}

/** 把任务切片与实验屏场景合成课程域认识的状态。 */
export function mergeCourse(task: SpectroscopeTaskData, scene: LabScene, machine: Machine): CourseState {
  const slice = task.byVariant[machine] ?? emptyVariantTask();
  return {
    ...initialCourse(task.mode ?? 'student', machine),
    mode: task.mode ?? 'student',
    step: task.step,
    hasSkipped: task.hasSkipped,
    partsSeen: [...slice.partsSeen],
    casesSeen: [...slice.casesSeen],
    answers: { ...slice.answers },
    continuousRecorded: slice.continuousRecorded,
    bench: { ...scene.bench, dispersion: machine },
    marks: [...scene.marks],
    checked: scene.checked,
  };
}

/** 把一次课程操作同时写回任务切片与场景；已完成的当前步顺延到下一步。 */
export function applyOperation(task: SpectroscopeTaskData, scene: LabScene, machine: Machine, op: Operation): { task: SpectroscopeTaskData; scene: LabScene } {
  const next = operate(mergeCourse(task, scene, machine), op);
  const bench = { ...next.bench, dispersion: machine };
  // 观察条件一变：旧标记与核对作废（课程域已处理），标带与「未见明显特征」也一并作废，已保存的记录只标为过期。
  const changed = !sameBench(scene.bench, bench);
  const sceneNext: LabScene = {
    ...scene, bench, marks: next.marks, checked: next.checked,
    ...(changed ? { bands: [] as LabScene['bands'], noAbsorption: false, saved: scene.saved ? { ...scene.saved, stale: true } : null } : {}),
  };
  const byVariant = {
    ...task.byVariant,
    [machine]: {
      partsSeen: next.partsSeen, casesSeen: next.casesSeen, continuousRecorded: next.continuousRecorded, answers: next.answers,
    },
  };
  const taskNext: SpectroscopeTaskData = { ...task, mode: next.mode, step: next.step, hasSkipped: next.hasSkipped, byVariant };
  return { task: advanceStep(taskNext, sceneNext, machine), scene: sceneNext };
}

const sameBench = (a: BenchState, b: BenchState) => (Object.keys(b) as (keyof BenchState)[]).every((key) => a[key] === b[key]);

/** 换样品：清掉旧标记、标带、核对与补充说明，已保存的记录不再适用（同练习页）。 */
export function changeLabSample(scene: LabScene, sampleId: string): LabScene {
  return { ...scene, sampleId, marks: [], bands: [], noAbsorption: false, checked: false, notes: '', saved: null };
}

/** 引导任务的起始工作台：光源已开、未放样，狭缝与焦距（光栅式为亮度与对光）按课程标准故意不合适（与课程页一致）。 */
export function courseInitialLab(machine: Machine): LabScene {
  const base = labInitial(machine, COURSE_SAMPLE.id, 'transmission');
  return { ...base, bench: initialCourse('student', machine).bench };
}

/** 当前步完成后，把「最近所在的一步」顺延到下一个未完成的步骤。 */
function advanceStep(task: SpectroscopeTaskData, scene: LabScene, machine: Machine): SpectroscopeTaskData {
  const state = mergeCourse(task, scene, machine);
  if (!isComplete(state, state.step)) return task;
  const order = configOf(state).steps.map((item) => item.id);
  const from = order.indexOf(state.step);
  const next = [...order.slice(from), ...order.slice(0, from)].find((id) => !isComplete(state, id)) ?? order[order.length - 1];
  return next === state.step ? task : { ...task, step: next };
}

/**
 * 只改场景（不经过课程域）：自由练习的滑杆、夹样、样品与显示开关。
 * 观察条件一变，旧标记与核对作废、已保存的记录只标记为过期（内容保留，不自动恢复确认）；
 * 只换视角、显示开关或补充说明时不动标记，也不让旧记录过期。
 */
export function patchLab(scene: LabScene, patch: Partial<BenchState> & Partial<Pick<LabScene, 'sampleId' | 'notes' | 'beams' | 'names' | 'values' | 'view'>>, invalidate = true): LabScene {
  const { sampleId, notes, beams, names, values, view, ...benchPatch } = patch;
  const changed = Object.keys(benchPatch).length > 0;
  const bench = { ...scene.bench, ...benchPatch };
  const cleared = invalidate && changed ? { marks: [] as number[], bands: [] as LabScene['bands'], noAbsorption: false, checked: false } : {};
  const saved = invalidate && changed && scene.saved ? { ...scene.saved, stale: true } : scene.saved;
  return {
    ...scene, ...cleared, saved,
    bench,
    sampleId: sampleId ?? scene.sampleId,
    notes: notes ?? scene.notes,
    view: view ?? scene.view,
    beams: beams ?? scene.beams, names: names ?? scene.names, values: values ?? scene.values,
  };
}

export interface CourseView {
  state: CourseState;
  config: (typeof COURSE_CONFIG)[Machine];
  /** 本步的完成清单。 */
  items: { id: string; label: string; done: boolean }[];
  /** 本步要回答的问题（「检查一下」）。 */
  questions: { id: string; label: string; done: boolean }[];
  progress: { done: number; total: number };
  /** 本屏的步骤是否都已做完。 */
  screenDone: boolean;
  /** 六个步骤全部完成（可以完成课程并写入学习进度）。 */
  allComplete: boolean;
  /** 下一处未完成步骤所在的其他屏幕（本屏做完了才用得上）。 */
  nextScreen: SimScreenId | null;
}

/** 任务卡要显示的一切：本屏当前步骤、清单、检查一下与总进度。 */
export function courseView(task: SpectroscopeTaskData, scene: LabScene, machine: Machine, screen: SimScreenId): CourseView {
  const merged = mergeCourse(task, scene, machine);
  const config = configOf(merged);
  const own = config.steps.filter((item) => STEP_SCREEN[item.id] === screen);
  const hinted = own.find((item) => item.id === task.step && !isComplete(merged, item.id));
  const step = (hinted ?? own.find((item) => !isComplete(merged, item.id)) ?? own[own.length - 1]).id;
  const state: CourseState = { ...merged, step };
  const questionIds = step === 'explain' ? [...config.explainQuestions] : [config.stepQuestions[step as 'path' | 'light' | 'tune']].filter(Boolean);
  return {
    state, config,
    items: courseChecklist(state).map((item) => ({ ...item })),
    questions: questionIds.map((id) => ({ id, label: QUESTION_SHORT[id] ?? id, done: state.answers[id] === QUESTIONS.find((q) => q.id === id)?.correct })),
    progress: { done: config.steps.filter((item) => isComplete(merged, item.id)).length, total: config.steps.length },
    screenDone: own.every((item) => isComplete(merged, item.id)),
    allComplete: allComplete(merged),
    nextScreen: config.steps.filter((item) => STEP_SCREEN[item.id] !== screen && !isComplete(merged, item.id)).map((item) => STEP_SCREEN[item.id])[0] ?? null,
  };
}

/** 引导任务里固定使用的教学样品与观察方式（与课程页一致）。 */
export const courseSample = (): SampleDef => COURSE_SAMPLE;
export { STEP_SCREEN, STEP_SHORT };

/** 会话选项里的机型；未设置或不认识时为棱镜式。 */
export const readMachine = (options: Record<string, unknown> | undefined): Machine => isMachine(options?.machine) ? options.machine : 'prism';

/**
 * 进入仿真时的初始状态：从地址读机型、样品、观察方法、讲师 / 学员与步骤（深链只在进入时生效一次）。
 * 直达中间步骤与课程页一致记为跳步（当轮不写入学习进度）。
 */
export function spectroscopeInitial(search: URLSearchParams) {
  const machine = isMachine(search.get('machine')) ? search.get('machine') as Machine : 'prism';
  const methodParam = search.get('method');
  const method: BenchMethod = methodParam && methodParam in BENCH_METHOD_LABELS ? methodParam as BenchMethod : 'transmission';
  const sampleParam = search.get('sample');
  const sampleId = SAMPLES.some((item) => item.id === sampleParam) ? sampleParam! : 'ruby';
  const modeParam = search.get('mode');
  const mode: CourseMode | null = modeParam === 'student' || modeParam === 'teacher' ? modeParam : null;
  const stepParam = search.get('step');
  const stepIndex = isStepId(stepParam) ? STEP_IDS.indexOf(stepParam) : -1;
  const task = emptyTaskData();
  task.mode = mode;
  if (stepIndex >= 0) { task.step = stepParam as StepId; task.hasSkipped = stepIndex > 0; }
  // 带样品 / 观察方法的深链（知识库与旧练习页转来）按练习起点摆好；没有参数时实验屏从课程起点开始
  // （光源已开、未夹样，棱镜式狭缝偏宽 / 光栅式灯头偏离）——引导任务与自由练习共用同一套工作台。
  const practice = search.has('sample') || search.has('method');
  return {
    scenes: { learn: LEARN_INITIAL, lab: practice ? labInitial(machine, sampleId, method) : courseInitialLab(machine), challenge: labInitial(machine, sampleId, method) },
    options: { machine },
    taskData: task as unknown as Record<string, unknown>,
    teacherUsed: mode === 'teacher',
  };
}
