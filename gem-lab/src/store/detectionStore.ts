import { create } from 'zustand';
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

export interface SpectroscopeData {
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
}

interface DetectionState extends DetectionSession {
  startSession: (difficulty: Difficulty, sampleId: string) => void;
  resetSession: () => void;
  markInstrument: (id: InstrumentId) => void;
  setRefractometer: (data: Partial<RefractometerData>) => void;
  setPolariscope: (data: Partial<PolariscopeData>) => void;
  setSpectroscope: (data: Partial<SpectroscopeData>) => void;
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
    markedLines: [],
    bandRanges: [],
    notes: '',
  },
  startedAt: null,
};

export const useDetection = create<DetectionState>((set) => ({
  ...blank,
  startSession: (difficulty, sampleId) =>
    set({ ...blank, difficulty, sampleId, startedAt: Date.now() }),
  resetSession: () => set({ ...blank }),
  markInstrument: (id) =>
    set((s) => ({
      instrumentsUsed: s.instrumentsUsed.includes(id)
        ? s.instrumentsUsed
        : [...s.instrumentsUsed, id],
    })),
  setRefractometer: (data) =>
    set((s) => ({ refractometer: { ...s.refractometer, ...data } })),
  setPolariscope: (data) => set((s) => ({ polariscope: { ...s.polariscope, ...data } })),
  setSpectroscope: (data) =>
    set((s) => ({ spectroscope: { ...s.spectroscope, ...data } })),
}));
