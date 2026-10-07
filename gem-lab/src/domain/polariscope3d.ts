import observations from '../../public/assets/3d/polariscope/observations.json';

export const POLARISCOPE_PART_IDS = ['base', 'frame', 'light', 'polarizer', 'stage', 'sample', 'analyzer', 'conoscope'] as const;
export type PartId = typeof POLARISCOPE_PART_IDS[number];
export type Polariscope3DMode = 'structure' | 'explode' | 'practice';

export interface PolariscopePracticeProgress {
  emptyFieldAligned: boolean;
  /** Travel observed after placing this sample; changing the camera must never update it. */
  rotationDegrees: number;
  viewedObservationIds: string[];
  interpretationAcknowledged: boolean;
}

export interface Polariscope3DState {
  power: boolean;
  /** Degrees relative to the fixed lower polarizer: 0 parallel, 90 crossed. */
  analyzerAngle: number;
  /** Independent stage angle, never an input to empty-field Malus intensity. */
  stageAngle: number;
  samplePresent: boolean;
  mode: Polariscope3DMode;
  explosion: number;
  selectedPart: PartId | null;
  isolatedPart: PartId | null;
  sampleId?: string | null;
  orientationId?: string | null;
  practiceProgress?: PolariscopePracticeProgress;
}

export interface PolariscopeObservationRecord {
  id: string;
  /** Unwrapped angle in the recorded turn; retain both 0 and 360 endpoints. */
  stageAngleDegrees: number;
  analyzerAngleDegrees: number;
  polarizerAngleDegrees: number;
  media: {
    kind: 'photo' | 'video';
    src: string;
    /** Capture time relative to the sequence origin; video uses playback seconds. */
    seconds: number;
  };
  observation: string;
}

export interface PolariscopeObservationSeries {
  id: string;
  sampleId: string;
  orientation: { id: string; description: string; mountingDescription: string };
  conditions: {
    sourceInstrumentId: string;
    illumination: string;
    analyzerAngleDegrees: number;
    polarizerAngleDegrees: number;
  };
  coverage: { startAngleDegrees: number; endAngleDegrees: number; maxGapDegrees: number };
  scope: {
    /** These records authorize media playback, not a calculated gemstone shader. */
    permittedUses: ('recorded-media-playback' | 'rotation-observation')[];
    limitations: string[];
    interpolation: 'none';
    angleToleranceDegrees: number;
  };
  review: { status: 'pending' | 'approved' | 'rejected'; reviewer?: string; reviewedAt?: string };
  records: PolariscopeObservationRecord[];
}

export interface PolariscopeObservationDataset {
  schemaVersion: 1;
  status: 'pending' | 'approved';
  metadata: {
    description: string;
    geometryBasis: string;
    dimensionsCalibrated: boolean;
    sampleOpticsModeled: false;
    lowerPolarizerStageCoupling: {
      status: 'pending' | 'verified';
      value: 'independent' | 'coupled' | null;
      note: string;
    };
    emptyFieldPrinciple: string;
    sampleObservationScope: string;
  };
  series: PolariscopeObservationSeries[];
}

export const DEFAULT_OBSERVATIONS = observations as PolariscopeObservationDataset;

export function createInitialPolariscope3DState(overrides: Partial<Polariscope3DState> = {}): Polariscope3DState {
  return {
    power: true,
    analyzerAngle: 90,
    stageAngle: 0,
    samplePresent: false,
    mode: 'structure',
    explosion: 0,
    selectedPart: null,
    isolatedPart: null,
    sampleId: null,
    orientationId: null,
    ...overrides,
    practiceProgress: {
      emptyFieldAligned: false,
      rotationDegrees: 0,
      interpretationAcknowledged: false,
      ...overrides.practiceProgress,
      viewedObservationIds: [...(overrides.practiceProgress?.viewedObservationIds ?? [])],
    },
  };
}

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const normalizeAngle = (angle: number) => ((angle % 360) + 360) % 360;
const angularDistance = (a: number, b: number) => Math.abs(((normalizeAngle(a - b) + 180) % 360) - 180);
const axisDistance = (a: number, b: number) => Math.min(angularDistance(a, b), angularDistance(a, b + 180));
const isMediaSource = (src: unknown): src is string => text(src) && /^(\/[^/]|\.\.?\/|https:\/\/)/.test(src) && !src.includes('..');

export interface ObservationValidation {
  valid: boolean;
  errors: string[];
  approvedSeries: PolariscopeObservationSeries[];
}

/** Fail closed. A declared approval is insufficient without scoped, attributed media evidence. */
export function validatePolariscopeObservations(input: unknown): ObservationValidation {
  const errors: string[] = [];
  const check = (condition: unknown, message: string) => { if (!condition) errors.push(message); };
  if (!object(input)) return { valid: false, errors: ['观察数据必须是对象。'], approvedSeries: [] };
  check(input.schemaVersion === 1, '观察数据版本必须为 1。');
  check(input.status === 'pending' || input.status === 'approved', '观察数据审核状态无效。');
  const metadata = object(input.metadata) ? input.metadata : {};
  for (const key of ['description', 'geometryBasis', 'emptyFieldPrinciple', 'sampleObservationScope']) {
    check(text(metadata[key]), `metadata.${key} 缺失。`);
  }
  check(typeof metadata.dimensionsCalibrated === 'boolean', '尺寸校准状态缺失。');
  check(metadata.sampleOpticsModeled === false, '本模块不接受计算生成的样品光学响应。');
  const coupling = object(metadata.lowerPolarizerStageCoupling) ? metadata.lowerPolarizerStageCoupling : {};
  check(text(coupling.note), '物台与下偏振片联动说明缺失。');
  check((coupling.status === 'pending' && coupling.value === null) ||
    (coupling.status === 'verified' && (coupling.value === 'independent' || coupling.value === 'coupled')),
  '物台与下偏振片联动状态无效；待核实不得给出已知联动关系。');
  if (!Array.isArray(input.series)) return { valid: false, errors: [...errors, 'series 必须为数组。'], approvedSeries: [] };
  const seriesIds = new Set<string>();
  const recordIds = new Set<string>();
  input.series.forEach((raw: unknown, index: number) => {
    const prefix = `series[${index}]`;
    if (!object(raw)) { errors.push(`${prefix} 无效。`); return; }
    check(text(raw.id) && !seriesIds.has(raw.id), `${prefix} 需要唯一编号。`);
    if (text(raw.id)) seriesIds.add(raw.id);
    check(text(raw.sampleId), `${prefix} 样品编号缺失。`);
    const orientation = object(raw.orientation) ? raw.orientation : {};
    for (const key of ['id', 'description', 'mountingDescription']) check(text(orientation[key]), `${prefix} 取向条件 ${key} 缺失。`);
    const conditions = object(raw.conditions) ? raw.conditions : {};
    check(text(conditions.sourceInstrumentId) && text(conditions.illumination), `${prefix} 仪器或照明条件缺失。`);
    check(finite(conditions.analyzerAngleDegrees) && finite(conditions.polarizerAngleDegrees), `${prefix} 偏振片角度条件缺失。`);
    const scope = object(raw.scope) ? raw.scope : {};
    check(Array.isArray(scope.permittedUses) && scope.permittedUses.includes('recorded-media-playback') &&
      scope.permittedUses.every(use => use === 'recorded-media-playback' || use === 'rotation-observation'), `${prefix} 可使用范围无效。`);
    check(Array.isArray(scope.limitations) && scope.limitations.length > 0 && scope.limitations.every(text), `${prefix} 适用限制缺失。`);
    check(scope.interpolation === 'none', `${prefix} 禁止插值推算未记录的光学响应。`);
    check(finite(scope.angleToleranceDegrees) && scope.angleToleranceDegrees >= 0 && scope.angleToleranceDegrees <= 5,
      `${prefix} 角度匹配容差须为 0..5°。`);
    const review = object(raw.review) ? raw.review : {};
    check(['pending', 'approved', 'rejected'].includes(String(review.status)), `${prefix} 审核状态无效。`);
    if (review.status === 'approved') {
      check(text(review.reviewer), `${prefix} 审核人缺失。`);
      check(text(review.reviewedAt) && /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(review.reviewedAt) && Number.isFinite(Date.parse(review.reviewedAt)), `${prefix} 审核日期无效。`);
    }
    const coverage = object(raw.coverage) ? raw.coverage : {};
    const validCoverage = finite(coverage.startAngleDegrees) && finite(coverage.endAngleDegrees) &&
      near(coverage.endAngleDegrees - coverage.startAngleDegrees, 360) &&
      finite(coverage.maxGapDegrees) && coverage.maxGapDegrees > 0 && coverage.maxGapDegrees <= 90;
    check(validCoverage, `${prefix} 必须声明完整 360° 观察范围及不大于 90° 的采样间隔。`);
    if (!Array.isArray(raw.records) || raw.records.length === 0) { errors.push(`${prefix} 缺少实际观察记录。`); return; }
    let previousAngle: number | null = null;
    let previousSeconds: number | null = null;
    const records = raw.records;
    records.forEach((record: unknown, recordIndex: number) => {
      const label = `${prefix}.records[${recordIndex}]`;
      if (!object(record)) { errors.push(`${label} 无效。`); return; }
      check(text(record.id) && !recordIds.has(record.id), `${label} 需要全数据集唯一编号。`);
      if (text(record.id)) recordIds.add(record.id);
      const angle = record.stageAngleDegrees;
      check(finite(angle), `${label} 物台角度缺失。`);
      for (const key of ['analyzerAngleDegrees', 'polarizerAngleDegrees']) {
        check(finite(record[key]) && finite(conditions[key]) && near(record[key], conditions[key]), `${label} ${key} 与声明条件不符。`);
      }
      const media = object(record.media) ? record.media : {};
      check(media.kind === 'photo' || media.kind === 'video', `${label} 必须引用照片或视频。`);
      check(isMediaSource(media.src), `${label} 媒体路径缺失或无效。`);
      check(finite(media.seconds) && media.seconds >= 0, `${label} 观察时间秒数缺失。`);
      check(text(record.observation), `${label} 观察描述缺失。`);
      if (finite(angle) && validCoverage) {
        check(angle >= (coverage.startAngleDegrees as number) && angle <= (coverage.endAngleDegrees as number), `${label} 超出声明角度范围。`);
        if (recordIndex === 0) check(near(angle, coverage.startAngleDegrees as number), `${prefix} 缺少一周起点。`);
        if (recordIndex === records.length - 1) check(near(angle, coverage.endAngleDegrees as number), `${prefix} 缺少一周终点。`);
        if (previousAngle !== null) check(angle > previousAngle && angle - previousAngle <= (coverage.maxGapDegrees as number) + 1e-6, `${label} 角度顺序或采样间隔不满足完整一周记录。`);
        previousAngle = angle;
      }
      if (finite(media.seconds)) {
        if (previousSeconds !== null) check(media.seconds > previousSeconds, `${label} 时间须沿旋转记录递增。`);
        previousSeconds = media.seconds;
      }
    });
  });
  if (input.status === 'approved') check(input.series.some(series => object(series) && object(series.review) && series.review.status === 'approved'), '已批准数据集至少需要一组审核通过的观察记录。');
  return {
    valid: errors.length === 0,
    errors,
    approvedSeries: errors.length === 0 && input.status === 'approved'
      ? (input.series as PolariscopeObservationSeries[]).filter(series => series.review.status === 'approved') : [],
  };
}

export interface Polariscope3DEvaluation {
  observationStatus: 'blocked' | 'ideal' | 'pending' | 'approved';
  reason: string;
  /** Relative to the ideal powered parallel empty field; never a gemstone reading. */
  relativeIntensity: number | null;
  canObserve: boolean;
  canShowLightPath: boolean;
  matchedObservation: PolariscopeObservationRecord | null;
  workflow: {
    step: 'align' | 'place' | 'rotate' | 'interpret';
    canComplete: boolean;
    alignmentReady: boolean;
    rotationComplete: boolean;
    evidenceReady: boolean;
    blockedReason: string | null;
  };
}

export function evaluatePolariscope3D(state: Polariscope3DState, dataset: unknown = DEFAULT_OBSERVATIONS): Polariscope3DEvaluation {
  const progress = state.practiceProgress;
  const crossed = finite(state.analyzerAngle) && axisDistance(state.analyzerAngle, 90) <= 0.5;
  const result: Polariscope3DEvaluation = {
    observationStatus: 'blocked', reason: '', relativeIntensity: null, canObserve: false, canShowLightPath: false,
    matchedObservation: null,
    workflow: {
      step: state.samplePresent ? (progress?.emptyFieldAligned ? 'rotate' : 'align') : crossed ? 'place' : 'align',
      canComplete: false, alignmentReady: false, rotationComplete: false, evidenceReady: false, blockedReason: null,
    },
  };
  const blocked = (reason: string) => {
    result.reason = reason;
    result.workflow.blockedReason = reason;
    return result;
  };
  if (!state.power) return blocked('光源关闭，不用于教学观察。');
  if (!finite(state.analyzerAngle) || !finite(state.stageAngle) || !finite(state.explosion) || state.explosion < 0 || state.explosion > 1) return blocked('仪器状态无效，请复位后操作。');
  if (state.mode === 'explode' || state.explosion > 0) return blocked('拆解仅显示零件关系，不用于教学观察。');
  if (state.isolatedPart !== null) return blocked('零件隔离仅用于结构查看，不用于教学观察。');
  result.workflow.alignmentReady = !state.samplePresent && crossed;
  if (!state.samplePresent) {
    const intensity = Math.cos(normalizeAngle(state.analyzerAngle) * Math.PI / 180) ** 2;
    result.observationStatus = 'ideal';
    result.relativeIntensity = intensity < 1e-12 ? 0 : intensity > 1 - 1e-12 ? 1 : intensity;
    result.reason = '理想空载原理：I/I_parallel = cos²(theta)，0° 平行、90° 正交；未模拟真实损耗。';
    result.canObserve = true;
    result.canShowLightPath = true;
    return result;
  }
  result.observationStatus = 'pending';
  result.reason = '样品仅作位置示意；真实观察记录待补充，不计算样品透光率或判断结果。';
  const validation = validatePolariscopeObservations(dataset);
  if (!validation.valid) { result.reason = '样品观察数据校验未通过，暂停使用；不计算或补造观察结果。'; return result; }
  const series = validation.approvedSeries.find(item => item.sampleId === state.sampleId && item.orientation.id === state.orientationId &&
    axisDistance(state.analyzerAngle, item.conditions.analyzerAngleDegrees - item.conditions.polarizerAngleDegrees) <= item.scope.angleToleranceDegrees);
  if (!series) return result;
  result.workflow.evidenceReady = true;
  const viewed = new Set(progress?.viewedObservationIds ?? []);
  result.workflow.rotationComplete = !!progress?.emptyFieldAligned && crossed &&
    finite(progress?.rotationDegrees) && progress.rotationDegrees >= 360 &&
    series.scope.permittedUses.includes('rotation-observation') && series.records.every(record => viewed.has(record.id));
  if (result.workflow.rotationComplete) result.workflow.step = 'interpret';
  // Keep a turn's 0° and 360° evidence distinct before falling back to periodic orientation.
  const matched = series.records.find(record => Math.abs(record.stageAngleDegrees - state.stageAngle) <= series.scope.angleToleranceDegrees)
    ?? series.records.find(record => angularDistance(record.stageAngleDegrees, state.stageAngle) <= series.scope.angleToleranceDegrees);
  if (!matched) { result.reason = '当前物台角度没有对应实测记录；仅允许已记录角度的媒体回放，不插值推算。'; return result; }
  result.observationStatus = 'approved';
  result.reason = '可回放相同样品、取向和角度下的已审核实测媒体；3D 样品本身未计算光学响应。';
  result.canObserve = true;
  result.matchedObservation = matched;
  result.workflow.canComplete = state.mode === 'practice' && result.workflow.rotationComplete && !!progress?.interpretationAcknowledged;
  return result;
}
