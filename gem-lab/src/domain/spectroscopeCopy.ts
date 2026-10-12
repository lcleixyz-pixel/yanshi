import { SAMPLES_BY_ID } from '../data/samples';
import type { BenchEvaluation } from './spectroscopeBench';
import { COURSE_CONFIG, COURSE_SAMPLE, type CourseVariant, type StepId } from './spectroscopeCourse';
import { displaySpectrum, IDEAL_CONDITIONS, type SpectrumProblem } from './spectrumDisplay';
import type { SimScreenId } from './simSession';

/**
 * 分光镜的文案与教学常量：从课程页与照明夹样页原样抽出（零行为变更），
 * 供仿真外壳的认识屏、实验屏与挑战屏共用。文字被测试逐字断言，改动需同步用例。
 */

/** 观察条件 → 目镜里看到的问题说明。 */
export const PROBLEM_TEXT: Record<SpectrumProblem, string> = {
  'not-through-sample': '光没有穿过样品：只看到光源的连续光谱。',
  'weak-light': '透光太弱：整体偏暗，蓝紫端先变黑。',
  'slit-wide': '狭缝过宽：谱线发糊，相邻细线并在一起，弱线消失。',
  'slit-narrow': '狭缝过窄：视场变暗，紫端和弱线看不清。',
  defocus: '焦距偏离：所有谱线都发虚。',
};

/** 两种机型共用课程流程，差别集中在这里与 COURSE_CONFIG。 */
export const VARIANT_TEXT = {
  prism: {
    instrument: 'prism-spectroscope', title: '分光镜基础观察课', minutes: 8, scale: '棱镜式刻度', poster: '棱镜式分光镜静态预览',
    opticsParts: ['collimator', 'prismTrain'], ok: '光穿过样品，狭缝与焦距合适。',
    finish: '你已完成对光、调节狭缝与焦距、标记吸收特征和解释。学习完成与独立检测掌握分别记录。',
    scope: '狭缝、焦距、对光与透光条件对光谱的影响为显示变换模拟，不是实拍；三维模型的内部处方和尺寸未经实物标定。光栅式另有观察课。',
  },
  grating: {
    instrument: 'grating-spectroscope', title: '光栅式分光镜观察课', minutes: 7, scale: '光栅式刻度（近似线性）', poster: '光栅式分光镜静态预览',
    opticsParts: ['collimator', 'grating'], ok: '光穿过样品，光强与对准足够。',
    finish: '你已完成对光、调整亮度与对准、在线性刻度上标记吸收特征和解释。学习完成与独立检测掌握分别记录。',
    scope: '手持光栅式按固定狭缝、固定焦距处理；对光与光强对光谱的影响为显示变换模拟，不是实拍；刻度为教学用线性映射，未按某台仪器标定。三维模型的光栅线密度与尺寸未经实物标定。',
  },
} as const;

/**
 * 目镜视场此刻的状态：谱进来了没有、范围与特征数怎么说、一行状态文字。
 * 读数的分寸：没光、旁路、偏轴、反射布置时不报「吸收特征 无」，也不报 400–700 nm 的假范围；
 * 参考谱待核时写明待核，不把空白谱当成「未见吸收」。
 */
export function fieldChecks(evaluation: BenchEvaluation, dispersion: CourseVariant) {
  const mode = evaluation.spectrumMode;
  const unverified = mode === 'unverified' || mode === 'method-unverified';
  /** 目镜里真的看得到光谱：穿样后看参考谱，或光绕过样品时看到光源的连续谱。其余（无光、偏轴、布置练习）都没有谱。 */
  const visible = mode === 'reference-simulation' || mode === 'continuous-light';
  return {
    scale: VARIANT_TEXT[dispersion].scale,
    /** 待核时不画空白光谱条，改为说明；其余情况照常显示（暗场就是暗的）。 */
    showSpectrum: !unverified,
    noSpectrumText: mode === 'method-unverified'
      ? '本方法先做布置练习：尚无该样品对应方法的参考谱，这里不显示推定谱图，也不把它当成「未见吸收」。'
      : '本样品的参考谱尚未核定：这里不显示空白光谱，也不把它当成「未见吸收」；可先练习摆样与照明。',
    range: visible && !unverified ? '400–700 nm' : '—',
    features: mode === 'reference-simulation'
      ? (evaluation.display.features.length ? `${evaluation.display.features.length} 条` : '无')
      : unverified ? '参考谱待核定' : '未显示',
  };
}

/** 目镜视场下面的一行状态：先用工作台自己的问题（无光、未放样、偏轴…），再落到光谱显示问题与「合适」。 */
export function yardstickStatus(evaluation: BenchEvaluation, dispersion: CourseVariant): string {
  if (evaluation.problems.length) return evaluation.problems.slice(0, 2).join(' ');
  if (evaluation.display.problems.length) return evaluation.display.problems.map((problem) => PROBLEM_TEXT[problem]).join(' ');
  return VARIANT_TEXT[dispersion].ok;
}

/** 工作台的观察视角。 */
export const BENCH_VIEWS = [['whole', '整体'], ['lamp', '灯头'], ['sample', '样品与镊子'], ['instrument', '分光镜']] as const;
export type BenchView = (typeof BENCH_VIEWS)[number][0];

/** 用于「透光太弱」问题的对照：同一份参考光谱，只把光强降下来。 */
export const WEAK_LIGHT = { prism: displaySpectrum(COURSE_SAMPLE.spectrum.features, { ...IDEAL_CONDITIONS, light: 'weak' }), grating: displaySpectrum(COURSE_SAMPLE.spectrum.features, { ...IDEAL_CONDITIONS, dispersion: 'grating', light: 'weak' }) };
/** 光栅课对照：同一份参考光谱在两种刻度上的位置。 */
export const IDEAL = { prism: displaySpectrum(COURSE_SAMPLE.spectrum.features, IDEAL_CONDITIONS), grating: displaySpectrum(COURSE_SAMPLE.spectrum.features, { ...IDEAL_CONDITIONS, dispersion: 'grating' }) };

/** 机型名（界面用）。 */
export const MACHINE_LABELS: Record<CourseVariant, string> = { prism: '棱镜式', grating: '光栅式' };

/**
 * 部件短名称：勾「显示名称」时显示在模型上（PhET 式短标签，不用编号）。
 * 与 COURSE_CONFIG[机型].parts 的 id 对应。
 */
export const PART_SHORT: Record<CourseVariant, Record<string, string>> = {
  prism: { slitHousing: '狭缝', slitControl: '狭缝环', collimator: '准直透镜', prismTrain: '棱镜组', focusTube: '目镜套筒' },
  grating: { slitHousing: '固定狭缝', collimator: '准直透镜', grating: '光栅', eyepiece: '固定目镜' },
};

/** 引导任务的每一步在哪块屏上完成（阶段 2：认识屏两处、实验屏四处）。 */
export const STEP_SCREEN: Record<StepId, SimScreenId> = {
  parts: 'learn', path: 'learn', light: 'lab', tune: 'lab', observe: 'lab', explain: 'lab',
};

/** 屏上引导任务的标题。 */
export const SCREEN_TASK_TITLE: Record<SimScreenId, string> = { learn: '认识结构与光路', lab: '照明、调节与记录', challenge: '未知样品检测' };

/** 步骤短名：任务卡收起行与步骤之间互相指引时用。 */
export const STEP_SHORT: Record<StepId, string> = {
  parts: '认识部件', path: '跟随光路', light: '对光与照明', tune: '调节与对准', observe: '标记吸收特征', explain: '解释与适用条件',
};

/** 问答题在任务卡里的短标题（「检查一下」条目）。 */
export const QUESTION_SHORT: Record<string, string> = {
  dispersion: '光谱怎样形成', continuous: '连续光谱说明什么', slit: '狭缝过宽会怎样',
  dark: '透光太弱怎么处理', grating: '光栅式有何不同', evidence: '能下什么结论',
  diffraction: '光栅式光谱怎样形成', fixed: '偏暗先怎么做', scale: '两种刻度有何不同',
};

/** 每个机型当前机型的步骤表（供任务卡与屏内指引共用）。 */
export const stepsOf = (variant: CourseVariant) => COURSE_CONFIG[variant].steps;

/** 课程用教学样品（固定透明红宝石）。 */
export const courseSample = () => COURSE_SAMPLE;
export const courseSampleOf = (id: string) => SAMPLES_BY_ID[id];
