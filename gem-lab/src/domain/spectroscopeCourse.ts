import { SAMPLES_BY_ID } from '../data/samples';
import type { AbsorptionFeature, SampleDef } from '../data/types';
import { mayRecordLearning, type ChoiceQuestion, type CourseCheckItem, type CourseMode, type CourseStep } from './course';
import { createBenchState, evaluateBench, type BenchState } from './spectroscopeBench';
import { markMatches, spectrumProblems, type Dispersion, type SpectrumConditions } from './spectrumDisplay';

/**
 * 棱镜式分光镜基础课：固定红宝石教学样品（Cr 吸收谱特征明显，资料一致）。
 * 品种透明度为“透明-半透明”；本课选定一颗透明刻面样品，使透射对光后能看清谱线。工作台练习仍按品种范围演示有限透光。
 */
export const COURSE_SAMPLE: SampleDef = {
  ...SAMPLES_BY_ID.ruby,
  characteristics: { ...SAMPLES_BY_ID.ruby.characteristics, transparency: '透明' },
};

export type StepId = 'parts' | 'path' | 'light' | 'tune' | 'observe' | 'explain';
export type CourseVariant = Dispersion;

const PRISM_STEPS: readonly CourseStep<StepId>[] = [
  { id: 'parts', title: '认识部件', task: '点选五个关键部件，看清光从狭缝进入、经准直和棱镜分光、到目镜观察的顺序。', why: '光依次经过狭缝、准直透镜、直视棱镜组到目镜；能调的只有狭缝宽度和目镜焦距。' },
  { id: 'path', title: '跟随光路', task: '依次查看白光和 400 / 550 / 700 nm 单色光的路径，再回答光谱从哪里来。', why: '不同波长折射程度不同，棱镜把白光按波长展开；样品吸收掉的波长在光谱上留下暗线或暗带。' },
  { id: 'light', title: '对光与照明', task: '光源已开，镊子上还没有样品，灯光直接射入狭缝。记录看到的现象，再用镊子把样品夹到灯头与入光端之间，让光穿过样品。', why: '只有光穿过样品，光谱里才有样品的吸收；光绕过样品时看到的只是光源的连续光谱，不能据此下结论。' },
  { id: 'tune', title: '调节狭缝与焦距', task: '狭缝开得太宽、焦距也偏了。先慢慢收紧狭缝，再调焦，直到谱线变锐、弱线重新出现。', why: '狭缝越窄谱线越锐、但越暗；焦距对准后谱线才清楚。合适的设置在锐度和亮度之间取平衡。' },
  { id: 'observe', title: '标记吸收特征', task: '在光谱条上点出你看到的吸收线和吸收带，然后核对。点已有标记可以删除。', why: '按诊断特征成组核对：红区细线、黄绿区宽带、蓝区细线同时出现，才支持铬致色的判断。' },
  { id: 'explain', title: '解释与适用条件', task: '回答三道问题，说明观察结果的依据和限制。', why: '吸收谱说明致色元素，不能单独区分天然、合成或其他含同种元素的宝石，要结合其他检测综合判断。' },
];

/** 手持光栅式：狭缝与焦距固定，排查只剩对光位置与光强；刻度近似线性，整体比棱镜式暗。 */
const GRATING_STEPS: readonly CourseStep<StepId>[] = [
  { id: 'parts', title: '认识部件', task: '点选四个关键部件，看清光从固定狭缝进入、经准直到光栅衍射分光、再到固定目镜的顺序。', why: '狭缝和目镜焦距出厂固定，光栅靠衍射分光；手上能调的只有照明和对光。' },
  { id: 'path', title: '跟随光路', task: '依次查看零级与 ±1 级光谱，再回答光栅式的光谱从哪里来。', why: '光栅刻线使不同波长衍射到不同角度：零级仍是白光，一级光谱按波长近似均匀展开，目镜对准的是一级光谱。' },
  PRISM_STEPS[2],
  { id: 'tune', title: '对准与亮度', task: '光栅式没有狭缝环和调焦套筒。现在灯头偏离光轴、亮度也偏低，谱线发暗、蓝紫区看不清：调亮光源，把灯头移回光轴，直到亮度足够。', why: '固定狭缝和焦距时，视场偏暗多半是光不够或没对准；先改善照明和对光，不把“暗”当成吸收。' },
  { id: 'observe', title: '在线性刻度上标记', task: '光栅式刻度近似等距。在光谱条上点出你看到的吸收线和吸收带，然后核对。点已有标记可以删除。', why: '线性刻度上各波段间距近似均匀，红区几条线比棱镜式分得更开，更容易读出波长。' },
  { id: 'explain', title: '解释与适用条件', task: '对照同一份光谱在两种刻度上的位置，回答三道问题。', why: '两种机型读的是同一组波长，只是刻度疏密不同；吸收谱仍只说明致色元素，要结合其他检测判断。' },
];

const PRISM_PARTS = [
  { id: 'slitHousing', label: '入光端与狭缝', note: '光从狭缝进入。狭缝越窄谱线越锐，但也越暗；手持棱镜式的狭缝可调。' },
  { id: 'slitControl', label: '狭缝调节环', note: '转动调节环改变狭缝宽度。观察时从宽处慢慢收紧，到谱线清楚、亮度够用为止。' },
  { id: 'collimator', label: '准直透镜', note: '把通过狭缝的光变成平行光再送入棱镜组。模型中的透镜处方为教学示意。' },
  { id: 'prismTrain', label: '直视棱镜组', note: '不同波长折射程度不同而分开，形成光谱；中间波长近似沿原方向出射。' },
  { id: 'focusTube', label: '目镜抽拉套筒', note: '前后抽拉调焦。焦距不对时所有谱线都发虚。光栅式通常为固定焦距。' },
] as const;

const GRATING_PARTS = [
  { id: 'slitHousing', label: '入光端与固定狭缝', note: '狭缝宽度出厂固定，没有调节环。视场暗时只能从照明和对光入手。' },
  { id: 'collimator', label: '准直透镜', note: '把通过狭缝的光变成平行光再照到光栅上。模型中的透镜处方为教学示意。' },
  { id: 'grating', label: '透射复制光栅', note: '密排刻线使不同波长衍射到不同角度：零级仍是白光，±1 级向两侧展开光谱。模型刻线已放大，线密度未标定。' },
  { id: 'eyepiece', label: '固定目镜', note: '焦距固定，不能抽拉调焦；手持光栅式通常整体比棱镜式暗。' },
] as const;

const PRISM_CASES = [
  { id: 'white-light', label: '白光' },
  { id: 'wavelength-400', label: '400 nm' },
  { id: 'wavelength-550', label: '550 nm' },
  { id: 'wavelength-700', label: '700 nm' },
] as const;

const GRATING_CASES = [
  { id: 'order-0', label: '零级' },
  { id: 'order-1', label: '+1 级' },
  { id: 'order--1', label: '−1 级' },
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
  {
    id: 'diffraction',
    prompt: '光栅式分光镜里的彩色光谱是怎样形成的？',
    options: ['光栅刻线使不同波长衍射到不同角度；零级不分色，±1 级展开成光谱', '光栅和棱镜一样只靠折射分光', '狭缝本身带有颜色'],
    correct: 0,
    feedback: '光栅靠衍射分光：零级各波长重合，仍是白光；±1 级里波长越长偏得越远，向两侧展开。目镜对准的是一级光谱。',
  },
  {
    id: 'fixed',
    prompt: '光栅式视场偏暗、蓝紫区看不清时，应先怎么做？',
    options: ['转动狭缝环、抽拉目镜调焦', '加强照明，把光对准样品与入光口，必要时换方向或换照明方法', '直接记录为蓝紫区强吸收'],
    correct: 1,
    feedback: '手持光栅式狭缝和焦距固定，没有这两样可调；偏暗多半是光不够或没对准。改善照明后再判断，不能把暗当成吸收。',
  },
  {
    id: 'scale',
    prompt: '同一颗红宝石，在光栅式刻度上看红区的 694、668、659 nm 吸收线，与棱镜式相比有何不同？',
    options: ['波长不变；光栅式刻度近似等距，红区不被压缩，这几条线彼此分得更开', '光栅式把吸收线移到了别的波长', '光栅式看不到红区吸收线'],
    correct: 0,
    feedback: '两种机型读的是同一组波长。棱镜式红端压缩、紫端展开；光栅式近似线性，红区的线更容易分开读数，蓝紫区则不如棱镜式展开。',
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

export interface CourseConfig {
  variant: CourseVariant;
  steps: readonly CourseStep<StepId>[];
  parts: readonly { id: string; label: string; note: string }[];
  cases: readonly { id: string; label: string }[];
  /** 各步需要答对的问题。 */
  stepQuestions: Record<'path' | 'light' | 'tune', string>;
  explainQuestions: readonly string[];
  /** 初始故意不合适的工作台状态：光源已开、未放样（光直接进入狭缝）。 */
  initialBench: Partial<BenchState>;
}

export const COURSE_CONFIG: Record<CourseVariant, CourseConfig> = {
  prism: {
    variant: 'prism', steps: PRISM_STEPS, parts: PRISM_PARTS, cases: PRISM_CASES,
    stepQuestions: { path: 'dispersion', light: 'continuous', tune: 'slit' },
    explainQuestions: ['dark', 'grating', 'evidence'],
    // 狭缝过宽、焦距偏离；灯头已对准入光端。
    initialBench: { slit: 0.72, focus: 0.2 },
  },
  grating: {
    variant: 'grating', steps: GRATING_STEPS, parts: GRATING_PARTS, cases: GRATING_CASES,
    stepQuestions: { path: 'diffraction', light: 'continuous', tune: 'fixed' },
    explainQuestions: ['scale', 'dark', 'evidence'],
    // 灯头横移 0.15 × 110 mm ≈ 16.5 mm：仍照到样品，但偏离清晰区；亮度低于足够档位。
    initialBench: { brightness: 0.35, lampLateral: 0.15 },
  },
};

/** 兼容既有引用：棱镜式基础课的步骤、部件与光路。 */
export const STEPS = PRISM_STEPS;
export const KEY_PARTS = PRISM_PARTS;
export const PATH_CASES = PRISM_CASES;

export interface CourseState {
  variant: CourseVariant;
  mode: CourseMode;
  step: StepId;
  hasSkipped: boolean;
  partsSeen: string[];
  casesSeen: string[];
  answers: Record<string, number>;
  /** 对光、狭缝与焦距共用照明与夹样工作台的状态与判断，课程只固定样品和机型。 */
  bench: BenchState;
  continuousRecorded: boolean;
  marks: number[];
  checked: boolean;
}

/** 初始故意设置不合适，见各机型的 initialBench。 */
export function initialCourse(mode: CourseMode, variant: CourseVariant = 'prism'): CourseState {
  const bench = { ...createBenchState(variant), power: true, samplePlaced: false, ...COURSE_CONFIG[variant].initialBench };
  return { variant, mode, step: 'parts', hasSkipped: false, partsSeen: [], casesSeen: [], answers: {}, bench, continuousRecorded: false, marks: [], checked: false };
}

export const evaluation = (s: CourseState) => evaluateBench(COURSE_SAMPLE, s.bench);
export const conditions = (s: CourseState): SpectrumConditions => evaluation(s).conditions;
export const throughSample = (s: CourseState) => conditions(s).throughSample;
export const display = (s: CourseState) => evaluation(s).display;
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

export const configOf = (s: CourseState) => COURSE_CONFIG[s.variant];

export function isComplete(s: CourseState, id: StepId): boolean {
  const c = configOf(s);
  switch (id) {
    case 'parts': return c.parts.every((p) => s.partsSeen.includes(p.id));
    case 'path': return c.cases.every((x) => s.casesSeen.includes(x.id)) && answerCorrect(s, c.stepQuestions.path);
    case 'light': return s.continuousRecorded && throughSample(s) && answerCorrect(s, c.stepQuestions.light);
    // 棱镜式：狭缝与焦距合适；光栅式：光强与对准足够。两者都以显示条件没有问题为准。
    case 'tune': return throughSample(s) && spectrumProblems(conditions(s)).length === 0 && answerCorrect(s, c.stepQuestions.tune);
    case 'observe': return s.checked && checkMarks(s.marks).foundCount >= REQUIRED_GROUPS;
    case 'explain': return c.explainQuestions.every((q) => answerCorrect(s, q));
  }
}

/** 课程条上的本步完成清单；与 isComplete 使用同一组条件。 */
export function courseChecklist(s: CourseState): CourseCheckItem[] {
  const c = configOf(s);
  const answered = (id: string, label: string): CourseCheckItem => ({ id, label, done: answerCorrect(s, id) });
  const problems = spectrumProblems(conditions(s));
  const short: Record<string, string> = { dark: '透光太弱怎么处理', grating: '光栅式有何不同', evidence: '能下什么结论', scale: '两种刻度有何不同' };
  switch (s.step) {
    case 'parts': return [{ id: 'parts', label: `点选关键部件 ${c.parts.filter((p) => s.partsSeen.includes(p.id)).length} / ${c.parts.length}`, done: isComplete(s, 'parts') }];
    case 'path': return [{ id: 'cases', label: `查看光路 ${c.cases.filter((x) => s.casesSeen.includes(x.id)).length} / ${c.cases.length}`, done: c.cases.every((x) => s.casesSeen.includes(x.id)) }, answered(c.stepQuestions.path, '回答：光谱怎样形成')];
    case 'light': return [{ id: 'continuous', label: '记录：只见连续光谱', done: s.continuousRecorded }, { id: 'placed', label: '用镊子夹样放入光路', done: throughSample(s) }, answered(c.stepQuestions.light, '回答：连续光谱说明什么')];
    case 'tune': return s.variant === 'prism'
      ? [{ id: 'slit', label: '狭缝宽度合适', done: throughSample(s) && !problems.some((p) => p === 'slit-wide' || p === 'slit-narrow') }, { id: 'focus', label: '焦距清晰', done: throughSample(s) && !problems.includes('defocus') }, answered(c.stepQuestions.tune, '回答：狭缝过宽会怎样')]
      : [{ id: 'light', label: '亮度足够、灯头对准', done: throughSample(s) && problems.length === 0 }, answered(c.stepQuestions.tune, '回答：偏暗先怎么做')];
    case 'observe': return [{ id: 'groups', label: `核对后找到诊断特征 ${s.checked ? Math.min(checkMarks(s.marks).foundCount, REQUIRED_GROUPS) : 0} / ${REQUIRED_GROUPS} 组`, done: isComplete(s, 'observe') }];
    case 'explain': return c.explainQuestions.map((id) => answered(id, short[id] ?? id));
  }
}

export const allComplete = (s: CourseState) => configOf(s).steps.every((step) => isComplete(s, step.id));
export const maySaveProgress = (s: CourseState) => mayRecordLearning(s.mode, s.hasSkipped, allComplete(s));

export function navigateCourse(s: CourseState, step: StepId, skip = false): CourseState {
  return { ...s, step, hasSkipped: s.hasSkipped || skip };
}

export type Operation =
  | { type: 'see-part'; id: string }
  | { type: 'see-case'; id: string }
  | { type: 'answer'; id: string; option: number }
  | { type: 'record-continuous' }
  | { type: 'place-sample'; on: boolean }
  | { type: 'slit'; value: number }
  | { type: 'focus'; value: number }
  | { type: 'brightness'; value: number }
  | { type: 'lamp-lateral'; value: number }
  | { type: 'mark'; wavelength: number }
  | { type: 'unmark'; wavelength: number }
  | { type: 'check' };

export function operate(s: CourseState, op: Operation): CourseState {
  // 观察条件变了，之前的标记不再对应当前视场，需要重新标记、重新核对。
  const adjust = (patch: Partial<BenchState>): CourseState => ({ ...s, bench: { ...s.bench, ...patch }, marks: [], checked: false });
  switch (op.type) {
    case 'see-part': return s.partsSeen.includes(op.id) || !configOf(s).parts.some((p) => p.id === op.id) ? s : { ...s, partsSeen: [...s.partsSeen, op.id] };
    case 'see-case': return s.casesSeen.includes(op.id) ? s : { ...s, casesSeen: [...s.casesSeen, op.id] };
    case 'answer': return { ...s, answers: { ...s.answers, [op.id]: op.option } };
    // 只有光未经样品直接进入狭缝、看到连续光谱时才能记录这一现象。
    case 'record-continuous': return evaluation(s).spectrumMode === 'continuous-light' ? { ...s, continuousRecorded: true } : s;
    case 'place-sample': return adjust({ samplePlaced: op.on });
    case 'slit': return adjust({ slit: clamp(op.value) });
    case 'focus': return adjust({ focus: clamp(op.value) });
    case 'brightness': return adjust({ brightness: clamp(op.value) });
    case 'lamp-lateral': return adjust({ lampLateral: Math.min(1, Math.max(-1, op.value)) });
    case 'mark': return s.marks.includes(op.wavelength) ? s : { ...s, marks: [...s.marks, op.wavelength].sort((a, b) => b - a), checked: false };
    case 'unmark': return { ...s, marks: s.marks.filter((m) => m !== op.wavelength), checked: false };
    case 'check': return s.marks.length && display(s).problems.length === 0 ? { ...s, checked: true } : s;
  }
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
