import { SAMPLES_BY_ID } from '../data/samples';
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

/** 每个机型当前机型的步骤表（供任务卡与屏内指引共用）。 */
export const stepsOf = (variant: CourseVariant) => COURSE_CONFIG[variant].steps;

/** 课程用教学样品（固定透明红宝石）。 */
export const courseSample = () => COURSE_SAMPLE;
export const courseSampleOf = (id: string) => SAMPLES_BY_ID[id];
