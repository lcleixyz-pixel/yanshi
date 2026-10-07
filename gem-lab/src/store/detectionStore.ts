import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { SAMPLES_BY_ID } from '@/data/samples';
import type { Difficulty, InstrumentId, OpticalCharacter } from '@/data/types';

export interface RefractometerData {
  method: 'facet' | 'spot' | null;
  riMin: number | null;
  riMax: number | null;
  birefringence: number | null;
  opticalCharacter: OpticalCharacter | null;
  notes: string;
}

export interface PolariscopeData {
  rotation: number;
  phenomenon: 'four-bright-four-dark' | 'all-dark' | 'all-bright' | 'anomalous' | null;
  optical: 'isotropic' | 'anisotropic' | 'aggregate' | null;
  notes: string;
}

export type SpectroscopeMethod = 'transmission' | 'internal-reflection' | 'surface-reflection';

export interface SpectroscopeData {
  /** 选用的照明方法 */
  method: SpectroscopeMethod | null;
  markedLines: number[]; // 用户标记的吸收线波长
  bandRanges: Array<{ start: number; end: number }>;
  notes: string;
}

export interface DetectionSession {
  difficulty: Difficulty | null;
  sampleId: string | null;
  instrumentsUsed: InstrumentId[];
  refractometer: RefractometerData;
  polariscope: PolariscopeData;
  spectroscope: SpectroscopeData;
  startedAt: number | null;
  assessment: AssessmentAttempt | null;
  assessmentAttemptCount: number;
}

export interface AssessmentAttempt {
  selectedSampleId: string;
  evidence: 'ri' | 'optical' | 'spectrum';
  confidence: number;
  hintUsed: boolean;
  attemptNumber: number;
  score: number;
  completedAt: number;
}

interface DetectionState extends DetectionSession {
  chooseDifficulty: (difficulty: Difficulty) => void;
  startSession: (difficulty: Difficulty, sampleId: string) => void;
  resetSession: () => void;
  markInstrument: (id: InstrumentId) => void;
  setRefractometer: (data: Partial<RefractometerData>) => void;
  setPolariscope: (data: Partial<PolariscopeData>) => void;
  setSpectroscope: (data: Partial<SpectroscopeData>) => void;
  recordAssessment: (attempt: AssessmentAttempt) => boolean;
  clearAssessment: () => void;
}

const blank: DetectionSession = {
  difficulty: null,
  sampleId: null,
  instrumentsUsed: [],
  refractometer: {
    method: null,
    riMin: null,
    riMax: null,
    birefringence: null,
    opticalCharacter: null,
    notes: '',
  },
  polariscope: {
    rotation: 0,
    phenomenon: null,
    optical: null,
    notes: '',
  },
  spectroscope: {
    method: null,
    markedLines: [],
    bandRanges: [],
    notes: '',
  },
  startedAt: null,
  assessment: null,
  assessmentAttemptCount: 0,
};

function sessionFromState(state: DetectionState): DetectionSession {
  return {
    difficulty: state.difficulty,
    sampleId: state.sampleId,
    instrumentsUsed: state.instrumentsUsed,
    refractometer: state.refractometer,
    polariscope: state.polariscope,
    spectroscope: state.spectroscope,
    startedAt: state.startedAt,
    assessment: state.assessment,
    assessmentAttemptCount: state.assessmentAttemptCount,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSavedSession(value: unknown): value is DetectionSession {
  if (!isRecord(value)) return false;
  const { difficulty, sampleId, instrumentsUsed, refractometer, polariscope, spectroscope, startedAt, assessment, assessmentAttemptCount } = value;
  if (difficulty !== null && difficulty !== 'beginner' && difficulty !== 'intermediate' && difficulty !== 'advanced') return false;
  if (sampleId !== null && (typeof sampleId !== 'string' || !SAMPLES_BY_ID[sampleId])) return false;
  if (sampleId !== null && difficulty === null) return false;
  if (!Array.isArray(instrumentsUsed) || !instrumentsUsed.every((id) =>
    id === 'refractometer' || id === 'polariscope' || id === 'spectroscope')) return false;
  if (!isRecord(refractometer) || !isRecord(polariscope) || !isRecord(spectroscope)) return false;
  if (!Array.isArray(spectroscope.markedLines) || !Array.isArray(spectroscope.bandRanges)) return false;
  if (typeof refractometer.notes !== 'string' || typeof polariscope.notes !== 'string' || typeof spectroscope.notes !== 'string') return false;
  if (startedAt !== null && (typeof startedAt !== 'number' || !Number.isFinite(startedAt))) return false;
  if (typeof assessmentAttemptCount !== 'number' || !Number.isInteger(assessmentAttemptCount) || assessmentAttemptCount < 0) return false;
  if (assessment !== null) {
    if (!isRecord(assessment) || typeof assessment.selectedSampleId !== 'string' || !SAMPLES_BY_ID[assessment.selectedSampleId]) return false;
    if (assessment.evidence !== 'ri' && assessment.evidence !== 'optical' && assessment.evidence !== 'spectrum') return false;
    if (typeof assessment.confidence !== 'number' || typeof assessment.hintUsed !== 'boolean' || typeof assessment.score !== 'number') return false;
    if (typeof assessment.attemptNumber !== 'number' || typeof assessment.completedAt !== 'number') return false;
  }
  return true;
}

export const useDetection = create<DetectionState>()(
  persist(
    (set, get) => ({
      ...blank,
      chooseDifficulty: (difficulty) => set({ ...blank, difficulty }),
      startSession: (difficulty, sampleId) =>
        set({ ...blank, difficulty, sampleId, startedAt: Date.now() }),
      resetSession: () => set({ ...blank }),
      markInstrument: (id) =>
        set((s) => ({
          instrumentsUsed: s.instrumentsUsed.includes(id)
            ? s.instrumentsUsed
            : [...s.instrumentsUsed, id],
          assessment: null,
        })),
      setRefractometer: (data) =>
        set((s) => ({ refractometer: { ...s.refractometer, ...data }, assessment: null })),
      setPolariscope: (data) => set((s) => ({ polariscope: { ...s.polariscope, ...data }, assessment: null })),
      setSpectroscope: (data) =>
        set((s) => ({ spectroscope: { ...s.spectroscope, ...data }, assessment: null })),
      recordAssessment: (attempt) => {
        if (get().assessment) return false;
        set((s) => ({ assessment: attempt, assessmentAttemptCount: s.assessmentAttemptCount + 1 }));
        return true;
      },
      clearAssessment: () => set({ assessment: null }),
    }),
    {
      name: 'gem-lab-detection-v1',
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      partialize: sessionFromState,
      merge: (persisted, current) => ({
        ...current,
        ...(isSavedSession(persisted) ? persisted : blank),
      }),
    },
  ),
);
