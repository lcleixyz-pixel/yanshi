/** Asset-based teaching only; learning and detection retain their original state. */
export const STRUCTURE_PART_IDS = ['base', 'frame', 'light', 'polarizer', 'stage', 'analyzer', 'conoscope', 'powerSwitch'] as const;
export type StructurePartId = typeof STRUCTURE_PART_IDS[number];
export type StructureViewPreset = 'free' | '01-front' | '02-side' | '03-top' | '04-three-quarter' | '05-analyzer-close' | '06-stage-close';
export type TeachingLesson = 'components' | 'path' | 'principle' | 'sample' | 'conoscope';
export const TEACHING_LESSONS: readonly TeachingLesson[] = ['components', 'path', 'principle', 'sample', 'conoscope'];
export type SampleOrientation = 'general' | 'optic-axis' | 'off-axis' | 'acute-bisectrix';
export type PrincipleExample = 'empty' | 'half-wave';
export interface PolariscopeStructureState {
  power: boolean;
  analyzerAngle: number;
  stageAngle: number;
  mode: 'structure' | 'explode';
  explosion: number;
  selectedPart: StructurePartId | null;
  isolatedPart: StructurePartId | null;
  internalView: boolean;
  lesson: TeachingLesson;
  /** 0–4: light source, lower polarizer, stage, analyzer, complete path. */
  pathStep: number;
  principleExample: PrincipleExample;
  showAnnotations: boolean;
  /** 样品观察与干涉图讲解所用的样品（样品库 id）。 */
  sampleId: string;
  /** 样品放置取向：正光观察与干涉图共用，放上、取下干涉球前后不变。 */
  orientation: SampleOrientation;
  /** 应变（异常双折射）强度 0–1；null 表示采用样品默认值。 */
  strain: number | null;
  /** 干涉球是否已放入光路（0 = 收纳，1 = 就位；动画由场景插值）。 */
  conoscopeInserted: boolean;
  /** 锥光图教学厚度（mm）。 */
  thicknessMm: number;
  /** 水晶巴西律双晶示意。 */
  brazilTwin: boolean;
}
export function createInitialStructureState(overrides: Partial<PolariscopeStructureState> = {}): PolariscopeStructureState {
  return { power: true, analyzerAngle: 0, stageAngle: 0, mode: 'structure', explosion: 0,
    selectedPart: null, isolatedPart: null, internalView: false,
    lesson: 'components', pathStep: 4, principleExample: 'empty', showAnnotations: true,
    sampleId: 'tourmaline', orientation: 'general', strain: null, conoscopeInserted: false, thicknessMm: 2.5, brazilTwin: false,
    ...overrides };
}

export interface TeachingOptics {
  /** Whether power and the current assembly permit an optical demonstration. */
  active: boolean;
  blockedReason: 'power-off' | 'disassembled' | 'isolated' | null;
  /** Normalized to the intensity after the lower polarizer, not the lamp output. */
  relativeTransmission: number;
  analyzerDirection: number;
  stageDirection: number;
}

const normalizeDirection = (degrees: number) => ((degrees % 360) + 360) % 360;

/**
 * Ideal, monochromatic teaching model with the fixed lower polarizer as 0°.
 * Model angles are illustrative reference axes, not measured calibration.
 * An ideal half-wave plate has phase retardance π and rotates the incident
 * linear polarization to 2φ. This is not a general gemstone observation model.
 * The scene decides whether to display this result from `lesson`; camera,
 * selection, and annotation state cannot change the predicted transmission.
 */
export function deriveTeachingOptics(state: PolariscopeStructureState): TeachingOptics {
  const analyzerDirection = normalizeDirection(state.analyzerAngle);
  const stageDirection = normalizeDirection(state.stageAngle);
  const blockedReason: TeachingOptics['blockedReason'] = !state.power ? 'power-off'
    : state.mode === 'explode' || state.explosion !== 0 ? 'disassembled'
      : state.isolatedPart ? 'isolated' : null;
  if (blockedReason) return { active: false, blockedReason, relativeTransmission: 0, analyzerDirection, stageDirection };

  const outputDirection = state.principleExample === 'half-wave' && !lessonUsesSample(state.lesson) ? 2 * stageDirection : 0;
  const amplitude = Math.cos((outputDirection - analyzerDirection) * Math.PI / 180);
  const transmission = amplitude * amplitude;
  // Exact endpoints make a crossed field dark without floating-point residuals.
  const relativeTransmission = transmission < 1e-12 ? 0 : transmission > 1 - 1e-12 ? 1 : transmission;
  return { active: true, blockedReason: null, relativeTransmission, analyzerDirection, stageDirection };
}

/** 样品与干涉图讲解时，样品放在载物台上。 */
export function lessonUsesSample(lesson: TeachingLesson) { return lesson === 'sample' || lesson === 'conoscope'; }

export const STRUCTURE_ASSETS = `${import.meta.env?.BASE_URL ?? '/'}assets/3d/polariscope/structure-v1/`;
