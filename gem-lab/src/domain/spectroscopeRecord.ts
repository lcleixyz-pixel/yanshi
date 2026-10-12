import type { SpectroscopeData } from '../store/detectionStore';
import { BENCH_METHOD_LABELS, type BenchEvaluation, type BenchState } from './spectroscopeBench';

/**
 * 观察记录的文本与门控：从照明夹样练习页原样抽出（零行为变更），
 * 供实验屏的自由练习、引导任务与挑战屏共用。字符串被浏览器测试逐字断言，改动需同步用例。
 */

export interface BandRange { start: number; end: number }

export interface RecordInput {
  state: BenchState;
  evaluation: BenchEvaluation;
  marks: readonly number[];
  bands: readonly BandRange[];
  noAbsorption: boolean;
  notes: string;
  /** 引导任务里用的是教学样品；记录里写样品名便于比对（涂层屏用不到）。 */
  sampleName?: string;
}

/** 位置一律给 0–10 相对刻度：狭缝、调焦未标定，灯位与样品横移也不写毫米（规划第六节）。 */
const relative = (value: number) => (value * 10).toFixed(1);

/** 反射法（内反射 / 表面反射）只练布置：谱图待核，记录为「仅布置练习」。 */
export const isSetupOnly = (state: BenchState) => state.method !== 'transmission';
/** 待核：本方法的参考谱待补充，或样品资料未核定。 */
export const isPendingReference = (state: BenchState, evaluation: BenchEvaluation) =>
  evaluation.referenceStatus === 'unverified' || isSetupOnly(state);

export function observationText({ state, evaluation, marks, bands, noAbsorption }: RecordInput): string {
  if (isSetupOnly(state)) return '照明布置练习：缺少该样品对应方法的参考谱，未作有效吸收观察';
  if (evaluation.referenceStatus === 'unverified') return '教学谱图未核定，无法判断吸收情况';
  if (noAbsorption) return '本次条件下未见明显特征吸收';
  return [...marks.map((wl) => `${wl} nm 线`), ...bands.map((band) => `${band.start}–${band.end} nm 带`)].join('；');
}

export function recordNotes(input: RecordInput): string {
  const { state, evaluation, notes, sampleName } = input;
  const setupOnly = isSetupOnly(state);
  return [observationText(input), `三维教学观察；${state.dispersion === 'prism' ? '棱镜式' : '光栅式'}；${BENCH_METHOD_LABELS[state.method]}${sampleName ? `；样品：${sampleName}` : ''}`,
    `亮度 ${Math.round(state.brightness * 100)}%；灯位 ${relative(state.lampLateral)} / 10（${setupOnly ? '相对台面俯角' : '水平偏转'} ${state.lampAngle}°）；样品横移 ${relative(state.sampleOffset)} / 10、转角 ${state.sampleRotation}°`,
    state.dispersion === 'prism' ? `狭缝 ${relative(state.slit)} / 10；调焦 ${relative(state.focus)} / 10` : '本机型狭缝与焦距固定',
    evaluation.lightPath === 'weak' ? '收光较弱：受限观察，需改善条件复核' : '',
    setupOnly ? '仅保存布置条件，未显示或推定该样品的反射光谱' : '', notes.trim()].filter(Boolean).join('；');
}

/** 写入检测记录或本屏记录的数据；待核与布置练习不带标记，避免被当成有效吸收观察。 */
export function recordData(input: RecordInput): SpectroscopeData {
  const { state, evaluation, marks, bands } = input;
  const setupOnly = isSetupOnly(state);
  const pending = isPendingReference(state, evaluation);
  return {
    observationStatus: setupOnly ? 'setup-only' : evaluation.referenceStatus === 'unverified' ? 'pending-reference' : 'observed',
    method: state.method,
    markedLines: pending ? [] : [...marks],
    bandRanges: pending ? [] : [...bands],
    notes: recordNotes(input),
  };
}

/** 本次是否已有可保存的内容（标线、标带或「未见明显特征」）。 */
export const hasObservation = ({ marks, bands, noAbsorption }: Pick<RecordInput, 'marks' | 'bands' | 'noAbsorption'>) =>
  marks.length > 0 || bands.length > 0 || noAbsorption;

/** 是否允许保存：观察器就绪，且要么属于待核/布置练习，要么条件可用并已留下观察内容。 */
export function canSaveRecord(input: Pick<RecordInput, 'state' | 'evaluation' | 'marks' | 'bands' | 'noAbsorption'>, viewerReady: boolean): boolean {
  if (!viewerReady) return false;
  if (isPendingReference(input.state, input.evaluation)) return true;
  return input.evaluation.canRecord && hasObservation(input);
}
