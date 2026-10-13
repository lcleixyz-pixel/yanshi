/**
 * 偏光镜仿真的状态模型：把「屏幕场景」与「任务进度」分开保存，
 * 合成课程域认识的状态（`domain/polariscopeCourse.ts` 的清单与完成条件）。
 *
 * 约束（docs/整体重构规划-PhET风格-2026-10-11.md 第六节第 3 条）：
 * - 换屏只换当前屏，各屏场景与任务进度都保留；
 * - 「全部重置」只恢复当前屏场景；「重新开始任务」只清任务进度。
 *
 * 讲次与场景初值沿用旧页面的同一套规则（`lessonPatch` / `COURSE_SETUP` 原样搬到这里），
 * 页面与新三屏都从这里取，避免两套口径。
 */

import type { CourseMode } from './course';
import { COURSE_STEPS, EMPTY_COURSE_PROGRESS, courseChecklist, isStepComplete, REORIENT_SAMPLE, type CourseProgress, type CourseReveal, type CourseStepId } from './polariscopeCourse';
import { getPolariscopeProfile } from './polariscopeSamples';
import { createInitialStructureState, deriveTeachingOptics, lessonUsesSample, TEACHING_LESSONS, type PolariscopeStructureState, type StructurePartId, type StructureViewPreset, type TeachingLesson } from './polariscopeStructure';
import { PARTS_BY_ID, PATH_STEPS } from './polariscopeCopy';
import type { SimScreenId } from './simSession';
import { emptyCoverage, TRACE_STEPS } from './rotationCoverage';
import type { ParallelCheckResult, SampleObservation } from './eyepieceField';

export type Lesson = TeachingLesson;

/** 课程六步分别在哪块屏完成。 */
export const STEP_SCREEN: Record<CourseStepId, SimScreenId> = {
  parts: 'learn', path: 'learn', crossed: 'learn',
  rotate: 'lab', reorient: 'lab', explain: 'lab',
};
export const STEP_SHORT: Record<CourseStepId, string> = Object.fromEntries(COURSE_STEPS.map((step) => [step.id, step.title])) as Record<CourseStepId, string>;
/** 任务卡上本步的一句话（仿真屏的说法：部件用短名称，「下一步」在面板里）。 */
export const STEP_TASK: Record<CourseStepId, string> = {
  parts: '在模型上或「结构与部件」里依次点选下偏光片、载物台、上偏光片，看清它们从下到上的顺序。',
  path: '在「光路」面板里用「下一步」跟着光走完 5 步，注意下偏光片之后振动只剩一个方向。',
  crossed: '不放样品，转动上偏光片：先在 0° 平行时看到最亮，再转到 90° 让视场全暗——这就是正交。',
  rotate: COURSE_STEPS[3].task,
  reorient: COURSE_STEPS[4].task,
  explain: COURSE_STEPS[5].task,
};
const STEP_IDS = COURSE_STEPS.map((step) => step.id);
export const isStepId = (value: unknown): value is CourseStepId => typeof value === 'string' && (STEP_IDS as readonly string[]).includes(value);
const LESSON_IDS = TEACHING_LESSONS as readonly string[];
export const isLesson = (value: unknown): value is Lesson => typeof value === 'string' && LESSON_IDS.includes(value);
export const parseLesson = (value: string | null): Lesson => (isLesson(value) ? value : 'components');

/** 进入某一讲时的场景初值（与旧页面同一套规则）。 */
export function lessonPatch(lesson: Lesson, sampleId?: string): Partial<PolariscopeStructureState> {
  const sample = lessonUsesSample(lesson);
  const keepSample = lesson === 'conoscope' ? (sampleId && getPolariscopeProfile(sampleId)?.observation === 'anisotropic' ? sampleId : 'tourmaline') : sampleId;
  return {
    lesson, mode: 'structure', explosion: 0, isolatedPart: null, selectedPart: null,
    internalView: lesson === 'path', pathStep: lesson === 'path' ? 0 : 4,
    ...(sample ? { analyzerAngle: 90, stageAngle: 0, principleExample: 'empty' as const, conoscopeInserted: false, sampleId: keepSample ?? 'tourmaline', orientation: lesson === 'conoscope' ? 'optic-axis' as const : 'general' as const } : {}),
    ...(lesson === 'path' ? { principleExample: 'empty' as const } : {}),
  };
}
export const stateForLesson = (lesson: Lesson, sampleId?: string) => createInitialStructureState(lessonPatch(lesson, sampleId));

/** 引导课程每一步进入时的场景；「解释」沿用上一步的样品画面。 */
export const COURSE_SETUP: Record<CourseStepId, [Lesson, Partial<PolariscopeStructureState>] | null> = {
  parts: ['components', { power: true, analyzerAngle: 0, stageAngle: 0, internalView: false }],
  path: ['path', { power: true }],
  crossed: ['principle', { power: true, principleExample: 'empty', analyzerAngle: 0, stageAngle: 0 }],
  rotate: ['sample', { power: true, sampleId: 'spinel', strain: null, brazilTwin: false }],
  reorient: ['sample', { power: true, sampleId: REORIENT_SAMPLE, orientation: 'optic-axis', strain: null, brazilTwin: false }],
  explain: null,
};

/** 引导任务的进度（存在会话的任务状态里；场景不动它）。 */
export interface PolariscopeTaskData {
  mode: CourseMode | null;
  step: CourseStepId;
  hasSkipped: boolean;
  progress: CourseProgress;
  /** 本轮真正做完过的步骤：场景变化不把已完成的进度退回去。 */
  completed: CourseStepId[];
}

export const emptyTaskData = (): PolariscopeTaskData => ({
  mode: null, step: 'parts', hasSkipped: false,
  progress: { ...EMPTY_COURSE_PROGRESS, partsSeen: [], reveals: [], correctQuestions: [] },
  completed: [],
});

export function readTaskData(data: Record<string, unknown> | undefined): PolariscopeTaskData {
  const base = emptyTaskData();
  if (!data || typeof data !== 'object') return base;
  const progress = (data.progress ?? {}) as Partial<CourseProgress>;
  return {
    mode: data.mode === 'student' || data.mode === 'teacher' ? data.mode : null,
    step: isStepId(data.step) ? data.step : base.step,
    hasSkipped: data.hasSkipped === true,
    progress: {
      partsSeen: Array.isArray(progress.partsSeen) ? progress.partsSeen.filter((id): id is CourseProgress['partsSeen'][number] => typeof id === 'string') : [],
      pathMax: Number.isInteger(progress.pathMax) ? Math.min(4, Math.max(0, Number(progress.pathMax))) : 0,
      parallelSeen: progress.parallelSeen === true,
      crossedSeen: progress.crossedSeen === true,
      reveals: Array.isArray(progress.reveals) ? progress.reveals.filter((item): item is CourseReveal => !!item && typeof item === 'object' && typeof (item as CourseReveal).sampleId === 'string') : [],
      correctQuestions: Array.isArray(progress.correctQuestions) ? progress.correctQuestions.filter((id): id is string => typeof id === 'string') : [],
    },
    completed: Array.isArray(data.completed) ? data.completed.filter(isStepId) : [],
  };
}

/** 认识屏场景：结构与光路（讲次限于 components / path / principle）。 */
export interface LearnScene extends Record<string, unknown> {
  structure: PolariscopeStructureState;
  viewPreset: StructureViewPreset;
  resetViewKey: number;
  /** 已套过开场场景的课程步骤：同一步回到本屏不再重摆场景（换屏不清场景）；全部重置后重新套用。 */
  enteredStep: CourseStepId | null;
  /** 显示名称（短标签，默认关）与显示数值（相对透过率）。 */
  names: boolean;
  values: boolean;
}

/** 实验屏场景：放样与观察（讲次限于 sample / conoscope），另存观察记录。 */
export interface LabScene extends Record<string, unknown> {
  structure: PolariscopeStructureState;
  viewPreset: StructureViewPreset;
  resetViewKey: number;
  /** 先预测后观察：预测选项（含 demo）、是否已揭晓、平行复核结果。 */
  prediction: string | null;
  revealed: boolean;
  /** 转一周覆盖的 72 格；换屏与「全部重置」不清任务进度，但重置当前屏会清它。 */
  visited: boolean[];
  /** 平行复核（区分 ADR）的结果；换样品或放置方式后作废。 */
  adr: ParallelCheckResult | null;
  /** 已套过开场场景的课程步骤（同认识屏）。 */
  enteredStep: CourseStepId | null;
  /** 显示名称（短标签，默认关）。 */
  names: boolean;
  /** 挑战屏抽样的难度（只在该屏用）；抽到的样品就是场景里的 sampleId。 */
  difficulty: ChallengeDifficulty | null;
}

export type ChallengeDifficulty = 'beginner' | 'intermediate' | 'advanced';
export const DIFFICULTY_LABELS: Record<ChallengeDifficulty, string> = { beginner: '初级', intermediate: '中级', advanced: '高级' };
export const isDifficulty = (value: unknown): value is ChallengeDifficulty => value === 'beginner' || value === 'intermediate' || value === 'advanced';

export const LEARN_INITIAL: LearnScene = { structure: stateForLesson('components'), viewPreset: 'free', resetViewKey: 0, enteredStep: null, names: false, values: true };

export function labInitial(sampleId = 'tourmaline'): LabScene {
  return {
    structure: stateForLesson('sample', sampleId),
    viewPreset: 'free', resetViewKey: 0,
    prediction: null, revealed: false, visited: emptyCoverage(), adr: null, enteredStep: null, names: false,
    difficulty: null,
  };
}

export function readLearnScene(scene: Record<string, unknown> | undefined): LearnScene {
  const raw = (scene ?? {}) as Partial<LearnScene>;
  const structure = raw.structure as PolariscopeStructureState | undefined;
  const lesson = structure && isLesson(structure.lesson) && ['components', 'path', 'principle'].includes(structure.lesson) ? structure.lesson : 'components';
  return {
    ...LEARN_INITIAL,
    structure: { ...stateForLesson(lesson as Lesson), ...(structure ?? {}), lesson },
    viewPreset: raw.viewPreset ?? 'free',
    resetViewKey: Number.isFinite(raw.resetViewKey) ? Number(raw.resetViewKey) : 0,
    enteredStep: isStepId(raw.enteredStep) ? raw.enteredStep : null,
    names: raw.names === true,
    values: raw.values !== false,
  };
}

export function readLabScene(scene: Record<string, unknown> | undefined): LabScene {
  const raw = (scene ?? {}) as Partial<LabScene>;
  const structure = raw.structure as PolariscopeStructureState | undefined;
  const lesson = structure && isLesson(structure.lesson) && ['sample', 'conoscope'].includes(structure.lesson) ? structure.lesson : 'sample';
  const sampleId = structure?.sampleId && getPolariscopeProfile(structure.sampleId) ? structure.sampleId : 'tourmaline';
  const base = labInitial(sampleId);
  return {
    ...base,
    structure: { ...stateForLesson(lesson as Lesson, sampleId), ...(structure ?? {}), lesson, sampleId },
    viewPreset: raw.viewPreset ?? 'free',
    resetViewKey: Number.isFinite(raw.resetViewKey) ? Number(raw.resetViewKey) : 0,
    prediction: typeof raw.prediction === 'string' ? raw.prediction : null,
    revealed: raw.revealed === true,
    visited: Array.isArray(raw.visited) && raw.visited.length === TRACE_STEPS ? raw.visited.map((item) => item === true) : emptyCoverage(),
    adr: raw.adr && typeof raw.adr === 'object' ? raw.adr as ParallelCheckResult : null,
    enteredStep: isStepId(raw.enteredStep) ? raw.enteredStep : null,
    names: raw.names === true,
    difficulty: isDifficulty(raw.difficulty) ? raw.difficulty : null,
  };
}

/** 认识屏或实验屏的讲次切换：换讲等于换复位后的场景（与旧页面 changeLesson 的效果一致）。 */
export function lessonScene<S extends LearnScene | LabScene>(scene: S, lesson: Lesson): S {
  return {
    ...scene,
    structure: { ...stateForLesson(lesson, scene.structure.sampleId), power: scene.structure.power },
    viewPreset: 'free',
    resetViewKey: scene.resetViewKey + 1,
  };
}

/** 进入课程的某一步：套该步的讲次与场景补丁。 */
export function enterStep<S extends LearnScene | LabScene>(scene: S, step: CourseStepId): S {
  const setup = COURSE_SETUP[step];
  if (!setup) return scene;
  const [lesson, patch] = setup;
  return {
    ...lessonScene(scene, lesson),
    structure: { ...stateForLesson(lesson, scene.structure.sampleId), ...patch },
  } as S;
}

export interface CourseView {
  step: CourseStepId;
  items: { id: string; label: string; done: boolean; sampleId?: string; reorient?: boolean }[];
  progress: { done: number; total: number };
  screenDone: boolean;
  allComplete: boolean;
  nextScreen: SimScreenId | null;
  completed: CourseStepId[];
}

/** 某一步的完成清单（仿真里部件不编号，去掉旧页的部件编号前缀）。 */
export function stepChecklist(task: PolariscopeTaskData, step: CourseStepId): CourseView['items'] {
  return courseChecklist(step, task.progress).map((item) => ({ id: item.id, label: item.label.replace(/^\d{2} /, ''), done: item.done, sampleId: item.sampleId, reorient: item.reorient }));
}

/**
 * 刚做完、还停在画面上的那一步：本屏已套过它的开场场景、它已完成，而课程已走到本屏的下一步。
 * 这时不立刻换场景，先让学员看完结果与「为什么」，点「下一步」再套下一步的场景。
 */
export function pendingStep(view: CourseView, entered: CourseStepId | null): CourseStepId | null {
  return entered !== null && entered !== view.step && view.completed.includes(entered) && STEP_SCREEN[entered] === STEP_SCREEN[view.step] ? entered : null;
}

/** 任务卡要显示的一切：本屏当前步骤、完成清单与总进度。 */
export function courseView(task: PolariscopeTaskData, screen: SimScreenId): CourseView {
  const own = COURSE_STEPS.filter((step) => STEP_SCREEN[step.id] === screen);
  const hinted = own.find((step) => step.id === task.step && !isStepComplete(step.id, task.progress));
  const step = (hinted ?? own.find((item) => !isStepComplete(item.id, task.progress)) ?? own[own.length - 1]).id;
  const done = (id: CourseStepId) => task.completed.includes(id) || isStepComplete(id, task.progress);
  return {
    step,
    items: stepChecklist(task, step),
    progress: { done: COURSE_STEPS.filter((item) => done(item.id)).length, total: COURSE_STEPS.length },
    screenDone: own.every((item) => done(item.id)),
    allComplete: COURSE_STEPS.every((item) => done(item.id)),
    nextScreen: COURSE_STEPS.filter((item) => STEP_SCREEN[item.id] !== screen && !done(item.id)).map((item) => STEP_SCREEN[item.id])[0] ?? null,
    completed: [...task.completed],
  };
}

/** 把新的完成证据并入任务进度；本步因此完成时记入 completed（之后场景变化不把它退回去）。没有变化时返回原对象。 */
export function recordProgress(task: PolariscopeTaskData, patch: Partial<CourseProgress>): PolariscopeTaskData {
  const progress = { ...task.progress, ...patch };
  const changed = (Object.keys(patch) as (keyof CourseProgress)[]).some((key) => JSON.stringify(task.progress[key]) !== JSON.stringify(progress[key]));
  if (!changed) return task;
  const completed = [...task.completed, ...COURSE_STEPS.map((step) => step.id).filter((id) => !task.completed.includes(id) && isStepComplete(id, progress))];
  return { ...task, progress, completed };
}

/** 点选部件：选了任务里的部件就记为已看（讲师 / 学员都记，与旧页一致；没选身份时不记）。 */
export function seePart(task: PolariscopeTaskData, id: StructurePartId): PolariscopeTaskData {
  if (task.mode === null || task.progress.partsSeen.includes(id)) return task;
  return recordProgress(task, { partsSeen: [...task.progress.partsSeen, id] });
}

/** 正交判断与旧页一致：检偏器方向与 90° 相差不到半度。 */
export const isCrossed = (structure: PolariscopeStructureState) => Math.abs((deriveTeachingOptics(structure).analyzerDirection % 180) - 90) < 0.5;

/**
 * 认识屏场景里自然产生的完成证据：走到光路第几步；空载时转到平行最亮、正交全暗。
 * 只在已选讲师 / 学员时记录（自由探索不写任务进度）。
 */
export function learnEvidence(task: PolariscopeTaskData, structure: PolariscopeStructureState): PolariscopeTaskData {
  if (task.mode === null) return task;
  if (structure.lesson === 'path' && structure.pathStep > task.progress.pathMax) return recordProgress(task, { pathMax: structure.pathStep });
  if (structure.lesson !== 'principle' || structure.principleExample !== 'empty') return task;
  const optics = deriveTeachingOptics(structure);
  if (!optics.active) return task;
  if (optics.relativeTransmission > 0.99 && !task.progress.parallelSeen) return recordProgress(task, { parallelSeen: true });
  if (optics.relativeTransmission === 0 && !task.progress.crossedSeen) return recordProgress(task, { crossedSeen: true });
  return task;
}

const PATH_COACH_PARTS: StructurePartId[] = ['light', 'polarizer', 'stage', 'analyzer', 'analyzer'];

/**
 * 学员的「点这里」提示（认识屏三步）：每一步只指向一个要操作的部件；未通电时先指向电源按钮。
 * 文案与旧页的学员提示一致，只把「上方课程条」改为任务卡。
 */
export function learnCoach(step: CourseStepId, progress: CourseProgress, structure: PolariscopeStructureState): { part: StructurePartId; text: string; tone?: 'action' | 'done' } | null {
  switch (step) {
    case 'parts': {
      const next = (['polarizer', 'stage', 'analyzer'] as const).find((id) => !progress.partsSeen.includes(id));
      return next ? { part: next, text: `点这里：${PARTS_BY_ID[next].shortName}` } : { part: 'analyzer', text: '三个部件都认识了', tone: 'done' };
    }
    case 'path':
      return structure.pathStep < 4
        ? { part: PATH_COACH_PARTS[structure.pathStep], text: `光现在到了：${PATH_STEPS[structure.pathStep].short}。点「下一步」继续` }
        : { part: 'analyzer', text: '光路走完了', tone: 'done' };
    case 'crossed': {
      if (!structure.power) return { part: 'powerSwitch', text: '电源关着：点这个按钮打开光源' };
      const optics = deriveTeachingOptics(structure);
      return optics.active && optics.relativeTransmission === 0 && structure.principleExample === 'empty'
        ? { part: 'analyzer', text: '已正交：空载视场全暗', tone: 'done' }
        : { part: 'analyzer', text: `拖动这个镜环转到 90°，看视场变暗（现在 ${Math.round(structure.analyzerAngle)}°）` };
    }
    default: return null;
  }
}

/**
 * 进入偏光镜仿真时的初始状态：从地址读讲次、讲师 / 学员与步骤（深链只在进入时生效一次）。
 * 直达中间步骤记为跳步（当轮不写入学习进度），与课程页一致。
 */
export function polariscopeInitial(search: URLSearchParams) {
  const lesson = parseLesson(search.get('lesson'));
  const modeParam = search.get('mode');
  const mode: CourseMode | null = modeParam === 'student' || modeParam === 'teacher' ? modeParam : null;
  const stepParam = search.get('step');
  const task = emptyTaskData();
  task.mode = mode;
  if (isStepId(stepParam)) { task.step = stepParam; task.hasSkipped = STEP_IDS.indexOf(stepParam) > 0; }
  const learnLesson = (['components', 'path', 'principle'] as const).find((item) => item === lesson) ?? 'components';
  const labLesson = lesson === 'conoscope' ? 'conoscope' : 'sample';
  const sampleParam = search.get('sample');
  const sampleId = sampleParam && getPolariscopeProfile(sampleParam) ? sampleParam : undefined;
  const lab = labInitial(sampleId);
  return {
    scenes: {
      learn: { ...LEARN_INITIAL, structure: stateForLesson(learnLesson) } as unknown as Record<string, unknown>,
      lab: { ...lab, structure: stateForLesson(labLesson, lab.structure.sampleId) } as unknown as Record<string, unknown>,
      challenge: labInitial() as unknown as Record<string, unknown>,
    },
    options: {},
    taskData: task as unknown as Record<string, unknown>,
    teacherUsed: mode === 'teacher',
  };
}

/** 改变这些会换一次观察：重新记录一周、收起揭晓与平行复核（与旧页同一套规则）。 */
const OBSERVATION_KEYS = ['sampleId', 'orientation', 'strain', 'lesson', 'conoscopeInserted', 'thicknessMm', 'brazilTwin'] as const;

/**
 * 实验屏改仪器状态：换样品或放置方式要重新预测、重新记录；只改检偏器则重新记录曲线，
 * 已揭晓的解释保留（平行复核需要转检偏器）。
 */
export function patchLab(scene: LabScene, patch: Partial<PolariscopeStructureState>): LabScene {
  const changed = (key: keyof PolariscopeStructureState) => key in patch && patch[key] !== scene.structure[key];
  const observation = OBSERVATION_KEYS.some(changed);
  const fresh = changed('sampleId') || changed('lesson');
  return {
    ...scene,
    structure: { ...scene.structure, ...patch },
    visited: observation || changed('analyzerAngle') ? emptyCoverage() : scene.visited,
    revealed: observation ? false : scene.revealed,
    prediction: fresh ? null : scene.prediction,
    adr: observation ? null : scene.adr,
  };
}

/** 实验屏换讲 / 进入课程步骤：场景复位，观察记录从头开始。 */
export function labLessonScene(scene: LabScene, lesson: Lesson): LabScene {
  return { ...lessonScene(scene, lesson), prediction: null, revealed: false, visited: emptyCoverage(), adr: null };
}
export function labEnterStep(scene: LabScene, step: CourseStepId): LabScene {
  const entered = enterStep(scene, step);
  return entered === scene ? { ...scene, enteredStep: step } : { ...entered, prediction: null, revealed: false, visited: emptyCoverage(), adr: null, enteredStep: step };
}

/** 揭晓一次（预测 → 转满一周）：记入任务进度，换方向复核按发生顺序判断。没选身份时不记。 */
export function recordReveal(task: PolariscopeTaskData, structure: PolariscopeStructureState, observation: SampleObservation): PolariscopeTaskData {
  if (task.mode === null) return task;
  return recordProgress(task, { reveals: [...task.progress.reveals, { sampleId: structure.sampleId, orientation: structure.orientation, observation }] });
}

/** 解释一步答对一道题。 */
export function recordAnswer(task: PolariscopeTaskData, id: string): PolariscopeTaskData {
  if (task.mode === null || task.progress.correctQuestions.includes(id)) return task;
  return recordProgress(task, { correctQuestions: [...task.progress.correctQuestions, id] });
}

/** 正交偏光下才记录：已预测、通电装配完整、检偏器正交（先预测后观察）。 */
export const isRecording = (scene: LabScene) => scene.structure.lesson === 'sample' && scene.prediction !== null && deriveTeachingOptics(scene.structure).active && isCrossed(scene.structure);

/**
 * 学员的「点这里」提示（实验屏两步）：前置条件不满足时先指向要纠正的部件；
 * 预测与揭晓由观察面板承担，这时不再另给气泡。
 */
export function labCoach(step: CourseStepId, scene: LabScene, observation: SampleObservation): { part: StructurePartId; text: string; tone?: 'action' | 'done' } | null {
  if (step !== 'rotate' && step !== 'reorient') return null;
  const structure = scene.structure;
  if (!structure.power) return { part: 'powerSwitch', text: '电源关着：点这个按钮打开光源' };
  if (!deriveTeachingOptics(structure).active) return null;
  if (!isCrossed(structure)) return { part: 'analyzer', text: '先把上偏光片转回 90° 正交，再观察样品' };
  if (scene.prediction === null) return null;
  if (!scene.revealed) return { part: 'stage', text: '眼睛看目镜视场，手拖动这里转一整周' };
  if (step === 'reorient' && structure.orientation === 'optic-axis' && observation === 'axis-dark') return { part: 'stage', text: '全暗不一定是均质体：换个方向放置，再转一周' };
  return null;
}
