import { STRUCTURE_PART_IDS, type SampleOrientation, type StructurePartId, type TeachingLesson } from './polariscopeStructure';
import type { SampleObservation } from './eyepieceField';

/**
 * 偏光镜基础引导课程（约 5–8 分钟）：认识部件 → 跟随光路 → 空载调正 → 放样旋转 → 换方向复核 → 解释。
 * 只描述步骤、完成条件与讲解规则；画面与观察结论仍由 eyepieceField 的同一套判定给出。
 * 课程不写学习进度或计分。
 */

export type CourseStepId = 'parts' | 'path' | 'crossed' | 'rotate' | 'reorient' | 'explain';

/** 课程中用到的讲解规则：步骤说明与问答反馈共用这一份文字。 */
export const COURSE_RULES = {
  crossedWhy: '正交时空载视场全暗。放上样品后视场变亮，说明是样品改变了光的振动方向；不先调到正交，就分不清亮是样品造成的，还是仪器没调好。',
  reorientWhy: '非均质体沿光轴方向传播时不发生双折射，看起来和均质体一样暗。所以「转一周始终暗」要换 2–3 个方向复查，才能初步判断为均质体。',
  inactive: '电源关闭或仪器未装配时视场本来就暗，这种暗不能说明样品是否消光。',
  notCrossed: '检偏器不在正交位置时，空载背景本身就亮，样品的明暗变化无法按正交规则解释。',
  singleDirection: '只在一个方向看到始终暗，也可能是非均质体沿光轴放置，需要换方向复查。',
  opaque: '不透明样品没有透射光，偏光镜透射观察不适用，需要改用其他方法。',
  multiDirection: '正交下换了 2–3 个方向、每次转满一周都始终暗，可以初步判断为均质体；最终定名仍需结合折射仪等其他检测。',
  adrCaveat: '四明四暗通常表示双折射，但均质体的异常双折射（ADR）也可能出现，有疑问时做平行复核并结合折射仪。',
} as const;

export interface CourseStep {
  id: CourseStepId;
  title: string;
  /** 预计用时（分钟），用于课堂节奏，不作限时。 */
  minutes: number;
  lesson: TeachingLesson;
  task: string;
  /** 完成后显示的「为什么」。 */
  why: string;
}

export const COURSE_STEPS: readonly CourseStep[] = [
  { id: 'parts', title: '认识部件', minutes: 1, lesson: 'components',
    task: '在模型热点或部件目录中依次点选下偏光片（04）、载物台（05）、上偏光片（06），看清它们从下到上的顺序。',
    why: '光从底座内部出发，依次经过下偏光片、载物台上的样品、上偏光片。只有载物台和上偏光片能转动。' },
  { id: 'path', title: '跟随光路', minutes: 1, lesson: 'path',
    task: '用「下一步」跟着光走完 5 步，注意振动短杆在下偏光片之后只剩一个方向。',
    why: '下偏光片把自然光变成线偏振光；上偏光片只放过与自身方向一致的分量。' },
  { id: 'crossed', title: '空载调正', minutes: 1, lesson: 'principle',
    task: '不放样品，转动上偏光片：先在 0° 平行时看到最亮，再转到 90°，让视场变成全暗——这就是正交。',
    why: COURSE_RULES.crossedWhy },
  { id: 'rotate', title: '放样旋转', minutes: 2, lesson: 'sample',
    task: '正交下依次观察尖晶石、碧玺、翡翠：每块先选预测，再转动载物台一整周（可点「自动转动一周」）。',
    why: '三种典型反应：均质体始终暗，非均质体一周四明四暗，多晶质集合体始终亮。' },
  { id: 'reorient', title: '换方向复核', minutes: 1.5, lesson: 'sample',
    task: '同一块碧玺改为沿光轴放置。先预测并转一周，再点「换个方向放置」，重新转一周。',
    why: COURSE_RULES.reorientWhy },
  { id: 'explain', title: '解释', minutes: 1, lesson: 'sample',
    task: '回答三个问题，说清楚为什么要调正交、为什么要换方向、什么时候不能下结论。',
    why: '会解释判断依据，才算完成本课。' },
];

/** 放样旋转一步要观察的三块样品与对应的典型反应。 */
export const ROTATE_TARGETS: readonly { sampleId: string; name: string; observation: SampleObservation }[] = [
  { sampleId: 'spinel', name: '尖晶石', observation: 'all-dark' },
  { sampleId: 'tourmaline', name: '碧玺', observation: 'four-bright-four-dark' },
  { sampleId: 'jadeite', name: '翡翠', observation: 'all-bright' },
];

export const REORIENT_SAMPLE = 'tourmaline';

export interface CourseQuestion {
  id: string;
  prompt: string;
  multiple: boolean;
  options: { id: string; text: string; correct: boolean; feedback: string }[];
}

export const COURSE_QUESTIONS: readonly CourseQuestion[] = [
  { id: 'why-crossed', prompt: '观察样品前，为什么要先把上下偏光片调到正交？', multiple: false, options: [
    { id: 'a', text: '正交时空载视场全暗，样品造成的明暗变化才能看清，也说明仪器已调好', correct: true, feedback: COURSE_RULES.crossedWhy },
    { id: 'b', text: '正交时视场最亮，便于看清样品的颜色', correct: false, feedback: '两片平行时最亮，正交时空载消光。' },
    { id: 'c', text: '正交能让所有宝石都出现四明四暗', correct: false, feedback: '四明四暗来自样品的双折射，与是否正交无关；均质体在正交下始终暗。' },
  ] },
  { id: 'why-reorient', prompt: '碧玺沿光轴放置时转一周始终暗，为什么还要换个方向再转？', multiple: false, options: [
    { id: 'a', text: '灯光不够亮，换方向可以多透过一些光', correct: false, feedback: '亮度不是原因：沿光轴时光不发生双折射，与灯光强弱无关。' },
    { id: 'b', text: '非均质体沿光轴不发生双折射，看起来和均质体一样暗，换方向才能排除', correct: true, feedback: COURSE_RULES.reorientWhy },
    { id: 'c', text: '换方向能把均质体变成非均质体', correct: false, feedback: '放置方向不会改变材料本身的光性，只改变光在晶体中的传播方向。' },
  ] },
  { id: 'no-conclusion', prompt: '下列哪些情况下，还不能根据偏光镜下结论？（可多选）', multiple: true, options: [
    { id: 'a', text: '电源关闭或仪器未装好，视场一片暗', correct: true, feedback: COURSE_RULES.inactive },
    { id: 'b', text: '上偏光片没转到正交就开始判断', correct: true, feedback: COURSE_RULES.notCrossed },
    { id: 'c', text: '只在一个方向转过一周，看到始终暗', correct: true, feedback: COURSE_RULES.singleDirection },
    { id: 'd', text: '样品不透明，几乎没有光透过', correct: true, feedback: COURSE_RULES.opaque },
    { id: 'e', text: '正交下换了 3 个方向，每次转满一周都始终暗', correct: false, feedback: COURSE_RULES.multiDirection },
  ] },
];

export function isAnswerCorrect(question: CourseQuestion, selected: readonly string[]) {
  const wanted = question.options.filter((option) => option.correct).map((option) => option.id).sort();
  const chosen = [...new Set(selected)].sort();
  return wanted.length === chosen.length && wanted.every((id, index) => id === chosen[index]);
}

/** 一次完整的「预测 → 转满一周 → 揭晓」记录。 */
export interface CourseReveal { sampleId: string; orientation: SampleOrientation; observation: SampleObservation }

export interface CourseProgress {
  partsSeen: readonly StructurePartId[];
  /** 光路讲解到过的最远一步（0–4）。 */
  pathMax: number;
  /** 空载、通电、装配完整时看到过平行最亮与正交消光。 */
  parallelSeen: boolean;
  crossedSeen: boolean;
  /** 按发生顺序排列。 */
  reveals: readonly CourseReveal[];
  correctQuestions: readonly string[];
}

export const EMPTY_COURSE_PROGRESS: CourseProgress = { partsSeen: [], pathMax: 0, parallelSeen: false, crossedSeen: false, reveals: [], correctQuestions: [] };

export interface ChecklistItem {
  id: string; label: string; done: boolean;
  /** 未完成时可直接在课程条上执行的操作：换到该样品，或改为一般方向放置。 */
  sampleId?: string; reorient?: boolean;
}

const KEY_PARTS: readonly { id: StructurePartId; label: string }[] = [
  { id: 'polarizer', label: '下偏光片' }, { id: 'stage', label: '载物台' }, { id: 'analyzer', label: '上偏光片' },
];

function revealIndex(reveals: readonly CourseReveal[], match: Partial<CourseReveal>, after = -1) {
  return reveals.findIndex((reveal, index) => index > after
    && (match.sampleId === undefined || reveal.sampleId === match.sampleId)
    && (match.orientation === undefined || reveal.orientation === match.orientation)
    && (match.observation === undefined || reveal.observation === match.observation));
}

export function courseChecklist(step: CourseStepId, progress: CourseProgress): ChecklistItem[] {
  switch (step) {
    // 编号与模型热点、部件目录一致，便于对照查找。
    case 'parts': return KEY_PARTS.map((part) => ({ id: part.id, label: `${String(STRUCTURE_PART_IDS.indexOf(part.id) + 1).padStart(2, '0')} ${part.label}`, done: progress.partsSeen.includes(part.id) }));
    case 'path': return [{ id: 'path-end', label: `走完光路（${Math.min(progress.pathMax, 4) + 1} / 5）`, done: progress.pathMax >= 4 }];
    case 'crossed': return [
      { id: 'parallel', label: '0° 平行：最亮', done: progress.parallelSeen },
      { id: 'crossed', label: '90° 正交：全暗', done: progress.crossedSeen },
    ];
    case 'rotate': return ROTATE_TARGETS.map((target) => ({
      id: target.sampleId, sampleId: target.sampleId, label: `${target.name}转一周`,
      done: revealIndex(progress.reveals, { sampleId: target.sampleId, observation: target.observation }) >= 0,
    }));
    case 'reorient': {
      const axis = revealIndex(progress.reveals, { sampleId: REORIENT_SAMPLE, orientation: 'optic-axis', observation: 'axis-dark' });
      const general = axis < 0 ? -1 : revealIndex(progress.reveals, { sampleId: REORIENT_SAMPLE, orientation: 'general', observation: 'four-bright-four-dark' }, axis);
      return [
        { id: 'axis', label: '沿光轴转一周', done: axis >= 0 },
        { id: 'general', label: '换个方向放置，再转一周', done: general >= 0, reorient: axis >= 0 },
      ];
    }
    case 'explain': return COURSE_QUESTIONS.map((question, index) => ({ id: question.id, label: `问题 ${index + 1}`, done: progress.correctQuestions.includes(question.id) }));
  }
}

export const isStepComplete = (step: CourseStepId, progress: CourseProgress) => courseChecklist(step, progress).every((item) => item.done);

export const COURSE_MINUTES = COURSE_STEPS.reduce((sum, step) => sum + step.minutes, 0);
