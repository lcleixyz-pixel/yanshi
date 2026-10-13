/**
 * 折射仪仿真的状态模型：把「屏幕场景」与「任务自有状态」合成为课程域认识的 CourseState，
 * 再把操作结果拆回去。课程步骤、完成条件与学习记录规则一律沿用 `domain/refractometerCourse.ts`，不另写一套。
 *
 * 约束（docs/整体重构规划-PhET风格-2026-10-11.md 第六节第 3 条）：
 * - 任务进度存在会话的任务状态里，换屏与「全部重置」都不动它；
 * - 场景变化（换样品、进出空气间隙、转动方向）只让「已保存的记录」过期，不清任务进度。
 */

import { SAMPLES_BY_ID } from '../data/samples';
import { requiredRefractometerMethod } from '../data/refractometerSampleMethod';
import type { SampleDef } from '../data/types';
import type { RefractometerView } from '../components/refractometer/ObservationWindow';
import type { CourseMode } from './course';
import {
  COURSE_SAMPLE, courseChecklist, deriveCourse, initialCourse, isComplete, operate, STEPS,
  type CourseState, type Operation, type Reading, type StepId,
} from './refractometerCourse';
import { caseIdForSample, CONTACT_INDEX, displayRiForSample, isOverContactLimit, SAMPLE_CASES_PATH } from './refractometerSampleCases';
import { checkRI } from './refractometerAssessment';
import type { SimScreenId } from './simSession';

export type ChallengeDifficulty = 'beginner' | 'intermediate' | 'advanced';
export const DIFFICULTY_LABELS: Record<ChallengeDifficulty, string> = { beginner: '初级', intermediate: '中级', advanced: '高级' };
export const isDifficulty = (value: unknown): value is ChallengeDifficulty => value === 'beginner' || value === 'intermediate' || value === 'advanced';

/** 步骤属于哪块屏幕：前两步在认识屏，其余六步在实验屏。 */
export const STEP_SCREEN: Record<StepId, SimScreenId> = {
  parts: 'learn', path: 'learn',
  prepare: 'lab', contact: 'lab', observe: 'lab', verify: 'lab', explain: 'lab', cleanup: 'lab',
};
export const STEP_SHORT: Record<StepId, string> = Object.fromEntries(STEPS.map((step) => [step.id, step.title])) as Record<StepId, string>;
const STEP_IDS = STEPS.map((step) => step.id);
export const isStepId = (value: unknown): value is StepId => typeof value === 'string' && (STEP_IDS as readonly string[]).includes(value);

/** 引导任务的进度（存在会话的任务状态里；场景不动它）。 */
export interface RefractometerTaskData {
  mode: CourseMode | null;
  step: StepId;
  hasSkipped: boolean;
  partsSeen: string[];
  pathSeen: number[];
  answers: Record<string, number>;
  scaleSeen: boolean;
  placedCorrectly: boolean;
  invalidRecorded: boolean;
  recovered: boolean;
  readings: Reading[];
  stageClean: boolean;
  sampleClean: boolean;
  /** 本轮真正做完过的步骤：条件变化不把已完成的进度退回去。 */
  completed: StepId[];
}

export function emptyTaskData(): RefractometerTaskData {
  const base = initialCourse('student');
  return {
    mode: null, step: base.step, hasSkipped: false,
    partsSeen: [], pathSeen: [], answers: {},
    scaleSeen: false, placedCorrectly: false, invalidRecorded: false, recovered: false,
    readings: [], stageClean: false, sampleClean: false, completed: [],
  };
}

/** 会话里读任务状态：缺失或残缺时回落到初值，避免旧会话或深链把页面打崩。 */
export function readTaskData(data: Record<string, unknown> | undefined): RefractometerTaskData {
  const base = emptyTaskData();
  if (!data || typeof data !== 'object') return base;
  return {
    mode: data.mode === 'student' || data.mode === 'teacher' ? data.mode : null,
    step: isStepId(data.step) ? data.step : base.step,
    hasSkipped: data.hasSkipped === true,
    partsSeen: Array.isArray(data.partsSeen) ? data.partsSeen.filter((id): id is string => typeof id === 'string') : [],
    pathSeen: Array.isArray(data.pathSeen) ? data.pathSeen.filter((index): index is number => Number.isInteger(index)) : [],
    answers: data.answers && typeof data.answers === 'object' ? { ...data.answers } as Record<string, number> : {},
    scaleSeen: data.scaleSeen === true,
    placedCorrectly: data.placedCorrectly === true,
    invalidRecorded: data.invalidRecorded === true,
    recovered: data.recovered === true,
    readings: Array.isArray(data.readings)
      ? data.readings.filter((item): item is Reading => !!item && typeof item === 'object' && Number.isFinite((item as Reading).value) && Number.isFinite((item as Reading).angle))
        .map((item) => ({ value: item.value, angle: item.angle, epoch: Number.isFinite(item.epoch) ? item.epoch : 0, correct: item.correct === true, ...(Number.isFinite(item.max) ? { max: item.max } : {}), ...(item.overLimit === true ? { overLimit: true } : {}) }))
      : [],
    stageClean: data.stageClean === true,
    sampleClean: data.sampleClean === true,
    completed: Array.isArray(data.completed) ? data.completed.filter(isStepId) : [],
  };
}

/** 认识屏场景：结构 / 光路显示。 */
export interface LearnScene extends Record<string, unknown> {
  rays: boolean; names: boolean; values: boolean; explode: number; view: 'whole' | 'optics';
}
export const LEARN_INITIAL: LearnScene = { rays: true, names: false, values: true, explode: 0, view: 'whole' };
export function readLearnScene(scene: Record<string, unknown> | undefined): LearnScene {
  const raw = (scene ?? {}) as Partial<LearnScene>;
  return {
    rays: raw.rays !== false,
    names: raw.names === true,
    values: raw.values !== false,
    explode: typeof raw.explode === 'number' && Number.isFinite(raw.explode) ? Math.min(1, Math.max(0, raw.explode)) : 0,
    view: raw.view === 'optics' ? 'optics' : 'whole',
  };
}

/** 本屏保存过的一次记录：条件一变只标为过期，不自动恢复确认。 */
export interface SavedRecord { summary: string; stale: boolean }

/** 实验屏与挑战屏场景：操作台上的仪器状态、当前样品与记录去向。 */
export interface LabScene extends Record<string, unknown> {
  sampleId: string;
  power: boolean; cover: 'open' | 'closed'; liquid: 'none' | 'drop'; sample: 'none' | 'placed'; contact: 'good' | 'air-gap';
  angle: number; epoch: number; explode: number; isolated: boolean;
  rays: boolean; names: boolean; values: boolean; view: 'whole' | 'optics';
  note: string; saved: SavedRecord | null;
  /** 挑战屏抽样的难度；抽到的样品就是场景的 sampleId。 */
  difficulty: ChallengeDifficulty | null;
}

export function labInitial(sampleId = COURSE_SAMPLE.id): LabScene {
  return {
    sampleId,
    power: false, cover: 'open', liquid: 'none', sample: 'none', contact: 'air-gap',
    angle: 0, epoch: 0, explode: 0, isolated: false,
    rays: false, names: false, values: true, view: 'whole',
    note: '', saved: null, difficulty: null,
  };
}

export function readLabScene(scene: Record<string, unknown> | undefined): LabScene {
  const raw = (scene ?? {}) as Partial<LabScene>;
  const base = labInitial();
  return {
    ...base,
    sampleId: typeof raw.sampleId === 'string' && SAMPLES_BY_ID[raw.sampleId] ? raw.sampleId : base.sampleId,
    power: raw.power === true,
    cover: raw.cover === 'closed' ? 'closed' : 'open',
    liquid: raw.liquid === 'drop' ? 'drop' : 'none',
    sample: raw.sample === 'placed' ? 'placed' : 'none',
    contact: raw.contact === 'good' ? 'good' : 'air-gap',
    angle: Number.isFinite(raw.angle) ? Number(raw.angle) : 0,
    epoch: Number.isFinite(raw.epoch) ? Number(raw.epoch) : 0,
    explode: typeof raw.explode === 'number' && Number.isFinite(raw.explode) ? Math.min(1, Math.max(0, raw.explode)) : 0,
    isolated: raw.isolated === true,
    rays: raw.rays === true,
    names: raw.names === true,
    values: raw.values !== false,
    view: raw.view === 'optics' ? 'optics' : 'whole',
    note: typeof raw.note === 'string' ? raw.note : '',
    saved: raw.saved && typeof raw.saved === 'object' && typeof raw.saved.summary === 'string'
      ? { summary: raw.saved.summary, stale: raw.saved.stale === true }
      : null,
    difficulty: isDifficulty(raw.difficulty) ? raw.difficulty : null,
  };
}

/** 课程域认识的操作状态（认识屏只有拆解，实验屏是完整操作台）。 */
export interface SceneFields {
  power: boolean; cover: 'open' | 'closed'; liquid: 'none' | 'drop'; sample: 'none' | 'placed'; contact: 'good' | 'air-gap';
  angle: number; epoch: number; explode: number; isolated: boolean;
}
export const EMPTY_SCENE_FIELDS: SceneFields = { power: false, cover: 'open', liquid: 'none', sample: 'none', contact: 'air-gap', angle: 0, epoch: 0, explode: 0, isolated: false };
export const sceneFields = (scene: LabScene): SceneFields => ({
  power: scene.power, cover: scene.cover, liquid: scene.liquid, sample: scene.sample, contact: scene.contact,
  angle: scene.angle, epoch: scene.epoch, explode: scene.explode, isolated: scene.isolated,
});

/** 把任务进度与场景合成课程域认识的状态。 */
export function mergeCourse(task: RefractometerTaskData, fields: SceneFields, mode: CourseMode = 'student'): CourseState {
  return {
    ...initialCourse(task.mode ?? mode),
    ...fields,
    mode: task.mode ?? mode,
    step: task.step,
    hasSkipped: task.hasSkipped,
    partsSeen: [...task.partsSeen],
    pathSeen: [...task.pathSeen],
    answers: { ...task.answers },
    scaleSeen: task.scaleSeen,
    placedCorrectly: task.placedCorrectly,
    invalidRecorded: task.invalidRecorded,
    recovered: task.recovered,
    readings: [...task.readings],
    stageClean: task.stageClean,
    sampleClean: task.sampleClean,
  };
}

export type SimOperation =
  | { type: Operation }
  | { type: 'see-part'; id: string }
  | { type: 'see-stage'; index: number }
  | { type: 'answer'; id: string; option: number }
  | { type: 'record-invalid' }
  | { type: 'reading'; min: number | null; max: number | null };

/** 一次操作同时写回任务进度与场景；条件变化让旧记录过期。 */
export function applyOperation(task: RefractometerTaskData, scene: LabScene, sample: SampleDef, op: SimOperation): { task: RefractometerTaskData; scene: LabScene } {
  const state = mergeCourse(task, sceneFields(scene));
  let next: CourseState = state;
  let sceneNext = scene;
  switch (op.type) {
    case 'see-part': next = { ...state, partsSeen: state.partsSeen.includes(op.id) ? state.partsSeen : [...state.partsSeen, op.id] }; break;
    case 'see-stage': next = { ...state, pathSeen: state.pathSeen.includes(op.index) ? state.pathSeen : [...state.pathSeen, op.index] }; break;
    case 'answer': next = { ...state, answers: { ...state.answers, [op.id]: op.option } }; break;
    case 'record-invalid': next = { ...state, invalidRecorded: true }; break;
    case 'reading': next = submitReading(state, sample, op.min, op.max); break;
    default: {
      next = operate(state, op.type);
      sceneNext = { ...scene, ...sceneFrom(next, scene) };
    }
  }
  const taskNext: RefractometerTaskData = {
    ...task,
    step: next.step, hasSkipped: next.hasSkipped,
    partsSeen: next.partsSeen, pathSeen: next.pathSeen, answers: next.answers,
    scaleSeen: next.scaleSeen, placedCorrectly: next.placedCorrectly, invalidRecorded: next.invalidRecorded,
    recovered: next.recovered, readings: next.readings, stageClean: next.stageClean, sampleClean: next.sampleClean,
  };
  return { task: recordProgress(taskNext, sceneNext, sample), scene: sceneNext };
}

/** 只改场景的操作（挑战屏与检测流程没有引导任务）：与实验屏共用同一套课程域操作规则。 */
export function applySceneOperation(scene: LabScene, op: SimOperation): LabScene {
  const state = mergeCourse(emptyTaskData(), sceneFields(scene));
  const next = op.type === 'reading' || op.type === 'record-invalid' || op.type === 'see-part' || op.type === 'see-stage' || op.type === 'answer'
    ? state
    : operate(state, op.type);
  return { ...scene, ...sceneFrom(next, scene) };
}

/** 从课程状态取回属于场景的那部分（操作可能改动力度、接触、角度等）。 */
function sceneFrom(state: CourseState, scene: LabScene): Partial<LabScene> {
  return {
    power: state.power, cover: state.cover, liquid: state.liquid, sample: state.sample, contact: state.contact,
    angle: state.angle, epoch: state.epoch,
    // 操作带来条件变化：旧记录只标为过期，内容保留。
    ...(scene.saved && (state.epoch !== scene.epoch) ? { saved: { ...scene.saved, stale: true } } : {}),
  };
}

/**
 * 提交一次读数：刻面法可带区间上限（双折射样品），点测法只有单值。
 * 超出接触液上限的样品按既有规则只记「> 1.780」，不填写数值。
 */
export function submitReading(state: CourseState, sample: SampleDef, min: number | null, max: number | null): CourseState {
  if (!deriveCourse(state).validReading || !['observe', 'verify'].includes(state.step)) return state;
  const standard = sample.characteristics.refractiveIndex;
  if (isOverContactLimit(sample)) {
    if (min !== null) return state;
    return { ...state, readings: [...state.readings, { value: CONTACT_READING, angle: state.angle, epoch: state.epoch, correct: true, overLimit: true }] };
  }
  if (min === null || !Number.isFinite(min) || min < 1.3 || min > 1.78) return state;
  const upper = max !== null && Number.isFinite(max) ? max : null;
  return {
    ...state,
    readings: [...state.readings, {
      value: min, ...(upper !== null ? { max: upper } : {}), angle: state.angle, epoch: state.epoch,
      correct: checkRI(min, upper, standard, sample.refractometerShape === 'faceted' ? 'facet' : 'spot'),
    }],
  };
}
/** 超量程记录的占位数值：只用于显示「> 1.780」，不参与比较。 */
const CONTACT_READING = 1.78;

/** 每次操作都收集本轮证据：先做题、最后放样的顺序也能记上。 */
function recordProgress(task: RefractometerTaskData, scene: LabScene, sample: SampleDef): RefractometerTaskData {
  const state = mergeCourse(task, sceneFields(scene));
  const done = STEPS.filter((step) => isComplete(state, step.id)).map((step) => step.id);
  const next: RefractometerTaskData = { ...task, completed: [...new Set([...task.completed, ...done])] };
  return advanceStep(next, scene, sample);
}

/** 当前步做完后，把「最近所在的一步」顺延到下一个未完成的步骤。 */
function advanceStep(task: RefractometerTaskData, scene: LabScene, sample: SampleDef): RefractometerTaskData {
  const state = mergeCourse(task, sceneFields(scene));
  if (!isComplete(state, state.step)) return task;
  const order = STEPS.map((step) => step.id);
  const from = order.indexOf(state.step);
  const next = [...order.slice(from), ...order.slice(0, from)].find((id) => !isComplete(state, id)) ?? order[order.length - 1];
  return next === state.step ? task : { ...task, step: next };
}

/**
 * 自由练习：只改场景（换样品、视角、显示开关），不经过课程域。
 * 换样品等于换一颗石头：样品先取下（接触状态一并复位），旧记录只标为过期。
 */
export function patchLab(scene: LabScene, patch: Partial<LabScene>): LabScene {
  const next = { ...scene, ...patch };
  if (scene.sampleId !== next.sampleId) {
    return {
      ...next, sample: 'none', contact: 'air-gap', angle: 0, epoch: scene.epoch + 1,
      saved: scene.saved ? { ...scene.saved, stale: true } : null,
    };
  }
  if (scene.epoch !== next.epoch) return { ...next, saved: scene.saved ? { ...scene.saved, stale: true } : null };
  return next;
}

export interface CourseView {
  state: CourseState;
  /** 本轮真正做完过的步骤（证据）：条件变化不把进度退回去。 */
  completed: StepId[];
  items: { id: string; label: string; done: boolean }[];
  questions: { id: string; label: string; done: boolean }[];
  progress: { done: number; total: number };
  screenDone: boolean;
  allComplete: boolean;
  nextScreen: SimScreenId | null;
}

/** 任务卡要显示的一切：本屏当前步骤、完成清单、检查一下与总进度。 */
export function courseView(task: RefractometerTaskData, fields: SceneFields, screen: SimScreenId): CourseView {
  const state = mergeCourse(task, fields);
  const own = STEPS.filter((step) => STEP_SCREEN[step.id] === screen);
  const hinted = own.find((step) => step.id === task.step && !isComplete(state, step.id));
  const step = (hinted ?? own.find((step) => !isComplete(state, step.id)) ?? own[own.length - 1]).id;
  const current: CourseState = { ...state, step };
  const done = (id: StepId) => task.completed.includes(id) || isComplete(state, id);
  const answers = current.answers;
  const questions = QUESTION_IDS[step] ?? [];
  return {
    state: current,
    completed: [...task.completed],
    items: courseChecklist(current).map((item) => ({ ...item })),
    questions: questions.map((id) => ({ id, label: QUESTION_LABELS[id] ?? id, done: answers[id] === QUESTION_ANSWER[id] })),
    progress: { done: STEPS.filter((item) => done(item.id)).length, total: STEPS.length },
    screenDone: own.every((item) => done(item.id)),
    allComplete: STEPS.every((item) => done(item.id)),
    nextScreen: STEPS.filter((item) => STEP_SCREEN[item.id] !== screen && !done(item.id)).map((item) => STEP_SCREEN[item.id])[0] ?? null,
  };
}

/** 各步的「检查一下」题目；与课程页共用题目与答案。 */
const QUESTION_IDS: Partial<Record<StepId, string[]>> = {
  path: ['boundary'], contact: ['gap'], verify: ['repeat'], explain: ['critical', 'air', 'limit'],
};
const QUESTION_LABELS: Record<string, string> = { boundary: '明暗边界从哪里来', gap: '空气间隙为什么不能读数', repeat: '换方向后边界为什么不动', critical: '边界对应什么', air: '接触不良怎么办', limit: '超上限怎么记' };
const QUESTION_ANSWER: Record<string, number> = { boundary: 0, gap: 1, repeat: 0, critical: 1, air: 2, limit: 0 };

export { COURSE_SAMPLE, displayRiForSample, isOverContactLimit, caseIdForSample, CONTACT_INDEX, SAMPLE_CASES_PATH };

/**
 * 目镜视场该显示什么：与 2D 演示的 resolveView 同一套判断
 * （关机 → 空载刻度 → 未放样 → 超量程 → 点测 → 均质体单边界 / 双折射两条边界）。
 */
export function observationView(scene: LabScene, sample: SampleDef): RefractometerView {
  if (!scene.power) return 'off';
  if (scene.liquid === 'none') return 'scale-only';
  if (scene.sample === 'none') return 'oil-empty';
  if (scene.contact === 'air-gap') return 'scale-only';
  if (isOverContactLimit(sample)) return 'over-range';
  if (requiredRefractometerMethod(sample) === 'spot') return 'spot';
  return sample.characteristics.opticalCharacter === 'isotropic' ? 'single' : 'double';
}

/** 三维场景里的操作条件：与课程页同一组字段（开关、翻盖、样品姿态、部件可见性），光路案例按样品选。 */
export function viewerState(scene: LabScene, sample: SampleDef) {
  const derived = deriveCourse(mergeCourse(emptyTaskData(), sceneFields(scene)));
  return {
    caseId: caseIdForSample(sample, scene.contact),
    angle: scene.angle,
    cover: scene.cover,
    power: scene.power,
    rays: scene.rays,
    partVisibility: derived.partVisibility,
  };
}
