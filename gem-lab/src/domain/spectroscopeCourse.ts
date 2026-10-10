import { SAMPLES_BY_ID } from '../data/samples';
import type { AbsorptionFeature } from '../data/types';
import { mayRecordLearning, type ChoiceQuestion, type CourseMode, type CourseStep } from './course';
import { displaySpectrum, markMatches, spectrumProblems, type SpectrumConditions } from './spectrumDisplay';

/** 棱镜式分光镜基础课：固定红宝石教学样品（Cr 吸收谱特征明显，资料一致）。 */
export const COURSE_SAMPLE = SAMPLES_BY_ID.ruby;

export type StepId = 'parts' | 'path' | 'light' | 'tune' | 'observe' | 'explain';
export const STEPS: readonly CourseStep<StepId>[] = [
  { id: 'parts', title: '认识部件', task: '点选五个关键部件，看清光从狭缝进入、经准直和棱镜分光、到目镜观察的顺序。' },
  { id: 'path', title: '跟随光路', task: '依次查看白光和 400 / 550 / 700 nm 单色光的路径，再回答光谱从哪里来。' },
  { id: 'light', title: '对光与照明', task: '本次先让光绕过样品直接进入狭缝。记录看到的现象，再改为透射照明，让光穿过样品。' },
  { id: 'tune', title: '调节狭缝与焦距', task: '狭缝开得太宽、焦距也偏了。先慢慢收紧狭缝，再调焦，直到谱线变锐、弱线重新出现。' },
  { id: 'observe', title: '标记吸收特征', task: '在光谱条上点出你看到的吸收线和吸收带，然后核对。点已有标记可以删除。' },
  { id: 'explain', title: '解释与适用条件', task: '回答三道问题，说明观察结果的依据和限制。' },
];

export const KEY_PARTS = [
  { id: 'slitHousing', label: '入光端与狭缝', note: '光从狭缝进入。狭缝越窄谱线越锐，但也越暗；手持棱镜式的狭缝可调。' },
  { id: 'slitControl', label: '狭缝调节环', note: '转动调节环改变狭缝宽度。观察时从宽处慢慢收紧，到谱线清楚、亮度够用为止。' },
  { id: 'collimator', label: '准直透镜', note: '把通过狭缝的光变成平行光再送入棱镜组。模型中的透镜处方为教学示意。' },
  { id: 'prismTrain', label: '直视棱镜组', note: '不同波长折射程度不同而分开，形成光谱；中间波长近似沿原方向出射。' },
  { id: 'focusTube', label: '目镜抽拉套筒', note: '前后抽拉调焦。焦距不对时所有谱线都发虚。光栅式通常为固定焦距。' },
] as const;

export const PATH_CASES = [
  { id: 'white-light', label: '白光' },
  { id: 'wavelength-400', label: '400 nm' },
  { id: 'wavelength-550', label: '550 nm' },
  { id: 'wavelength-700', label: '700 nm' },
] as const;

export const QUESTIONS = [
  {
    id: 'dispersion',
    prompt: '目镜里的彩色光谱是怎样形成的？',
    options: ['棱镜对不同波长的折射程度不同，把白光按波长分开', '样品把颜色直接投进镜筒', '狭缝本身带有颜色'],
    correct: 0,
    feedback: '棱镜组的色散把各波长分开；样品只是在其中「拿走」部分波长，形成暗线或暗带。',
  },
  {
    id: 'continuous',
    prompt: '光绕过样品时看到完整的连续光谱，能说明什么？',
    options: ['样品没有吸收特征', '只说明光源正常，光没有穿过样品，不能据此下结论', '样品一定是无色的'],
    correct: 1,
    feedback: '连续光谱只代表进入狭缝的是光源的白光。先检查对光，让光确实穿过样品再观察。',
  },
  {
    id: 'slit',
    prompt: '狭缝开得太宽时，红宝石红区的细吸收线会怎样？',
    options: ['变得更清楚', '变宽变模糊、相邻的线并在一起，弱线先消失', '移动到别的波长'],
    correct: 1,
    feedback: '狭缝越宽分辨率越低，相邻细线并在一起、弱线消失；位置不会变，但细节会丢失。红区 694 / 692 nm 本来就只差约 2 nm，手持分光镜在合适设置下也只看到一条细线。',
  },
  {
    id: 'dark',
    prompt: '样品很深或很厚、透光太弱，蓝紫端一片黑，应怎么处理？',
    options: ['记录为蓝紫区强吸收', '加强照明或换个方向、换照明方法后再看，不要把「暗」直接当吸收', '把狭缝开到最大就能下结论'],
    correct: 1,
    feedback: '光太弱时整体变暗、蓝紫端先变黑，这不是样品的吸收特征。改善照明后再判断。',
  },
  {
    id: 'grating',
    prompt: '换成手持光栅式分光镜时，哪一点不同？',
    options: ['狭缝和焦距通常固定，刻度近似线性，整体较暗', '光栅式可以调狭缝和焦距，与棱镜式完全一样', '光栅式看不到吸收线'],
    correct: 0,
    feedback: '手持光栅式多为固定狭缝、固定焦距，刻度近似等距；棱镜式蓝紫端展宽、红端压缩。',
  },
  {
    id: 'evidence',
    prompt: '看到与红宝石一致的吸收谱后，可以怎样下结论？',
    options: ['一定是天然红宝石', '支持含铬致色，需结合折射率、偏光镜等其他证据综合判断', '可以不再做其他检测'],
    correct: 1,
    feedback: '铬吸收谱说明致色元素，不能单独区分天然、合成或其他含铬宝石，需结合其他证据。',
  },
] as const satisfies readonly ChoiceQuestion[];

/** 观察核对按诊断特征分组：每组点中任意一处即算找到。 */
export const FEATURE_GROUPS: readonly { label: string; features: readonly AbsorptionFeature[] }[] = groupFeatures(COURSE_SAMPLE.spectrum.features);
export const REQUIRED_GROUPS = 3;

function groupFeatures(features: readonly AbsorptionFeature[]) {
  const pick = (...wls: number[]) => features.filter((f) => wls.includes(f.wavelength));
  return [
    { label: '红区 694 nm 细线（694 / 692 双线，手持镜下呈一条）', features: pick(694, 692) },
    { label: '红区 668 / 659 nm 吸收线', features: pick(668, 659) },
    { label: '黄绿区宽吸收带（约 620–540 nm）', features: pick(580) },
    { label: '蓝区 476 nm 细线（476 / 475，手持镜下呈一条）', features: pick(476, 475) },
    { label: '紫区吸收', features: pick(410) },
  ].filter((group) => group.features.length);
}

export interface CourseState {
  mode: CourseMode;
  step: StepId;
  hasSkipped: boolean;
  partsSeen: string[];
  casesSeen: string[];
  answers: Record<string, number>;
  throughSample: boolean;
  continuousRecorded: boolean;
  slit: number;
  focus: number;
  marks: number[];
  checked: boolean;
}

/** 初始故意设置不合适：光绕过样品、狭缝过宽、焦距偏离。 */
export function initialCourse(mode: CourseMode): CourseState {
  return { mode, step: 'parts', hasSkipped: false, partsSeen: [], casesSeen: [], answers: {}, throughSample: false, continuousRecorded: false, slit: 0.72, focus: 0.2, marks: [], checked: false };
}

export function conditions(s: CourseState): SpectrumConditions {
  return { dispersion: 'prism', slit: s.slit, focus: s.focus, light: 'ok', throughSample: s.throughSample };
}

export const display = (s: CourseState) => displaySpectrum(COURSE_SAMPLE.spectrum.features, conditions(s));
export const answerCorrect = (s: CourseState, id: string) => {
  const q = QUESTIONS.find((item) => item.id === id);
  return !!q && s.answers[id] === q.correct;
};

/** 每组诊断特征是否被至少一个标记点中；以及没有落在任何特征上的标记。 */
export function checkMarks(marks: readonly number[]) {
  const found = FEATURE_GROUPS.map((group) => marks.some((mark) => group.features.some((f) => markMatches(mark, f))));
  const stray = marks.filter((mark) => !COURSE_SAMPLE.spectrum.features.some((f) => markMatches(mark, f)));
  return { found, foundCount: found.filter(Boolean).length, stray };
}

export function isComplete(s: CourseState, id: StepId): boolean {
  switch (id) {
    case 'parts': return KEY_PARTS.every((p) => s.partsSeen.includes(p.id));
    case 'path': return PATH_CASES.every((c) => s.casesSeen.includes(c.id)) && answerCorrect(s, 'dispersion');
    case 'light': return s.continuousRecorded && s.throughSample && answerCorrect(s, 'continuous');
    case 'tune': return s.throughSample && spectrumProblems(conditions(s)).length === 0 && answerCorrect(s, 'slit');
    case 'observe': return s.checked && checkMarks(s.marks).foundCount >= REQUIRED_GROUPS;
    case 'explain': return ['dark', 'grating', 'evidence'].every((q) => answerCorrect(s, q));
  }
}

export const allComplete = (s: CourseState) => STEPS.every((step) => isComplete(s, step.id));
export const maySaveProgress = (s: CourseState) => mayRecordLearning(s.mode, s.hasSkipped, allComplete(s));

export function navigateCourse(s: CourseState, step: StepId, skip = false): CourseState {
  return { ...s, step, hasSkipped: s.hasSkipped || skip };
}

export type Operation =
  | { type: 'see-part'; id: string }
  | { type: 'see-case'; id: string }
  | { type: 'answer'; id: string; option: number }
  | { type: 'record-continuous' }
  | { type: 'through-sample'; on: boolean }
  | { type: 'slit'; value: number }
  | { type: 'focus'; value: number }
  | { type: 'mark'; wavelength: number }
  | { type: 'unmark'; wavelength: number }
  | { type: 'check' };

export function operate(s: CourseState, op: Operation): CourseState {
  switch (op.type) {
    case 'see-part': return s.partsSeen.includes(op.id) || !KEY_PARTS.some((p) => p.id === op.id) ? s : { ...s, partsSeen: [...s.partsSeen, op.id] };
    case 'see-case': return s.casesSeen.includes(op.id) ? s : { ...s, casesSeen: [...s.casesSeen, op.id] };
    case 'answer': return { ...s, answers: { ...s.answers, [op.id]: op.option } };
    // 只有光确实绕过样品、看到连续光谱时才能记录这一现象。
    case 'record-continuous': return s.throughSample ? s : { ...s, continuousRecorded: true };
    // 观察条件变了，之前的标记不再对应当前视场，需要重新标记、重新核对。
    case 'through-sample': return { ...s, throughSample: op.on, marks: [], checked: false };
    case 'slit': return { ...s, slit: clamp(op.value), marks: [], checked: false };
    case 'focus': return { ...s, focus: clamp(op.value), marks: [], checked: false };
    case 'mark': return s.marks.includes(op.wavelength) ? s : { ...s, marks: [...s.marks, op.wavelength].sort((a, b) => b - a), checked: false };
    case 'unmark': return { ...s, marks: s.marks.filter((m) => m !== op.wavelength), checked: false };
    case 'check': return s.marks.length && display(s).problems.length === 0 ? { ...s, checked: true } : s;
  }
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
