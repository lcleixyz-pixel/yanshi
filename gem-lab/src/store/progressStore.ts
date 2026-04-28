import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Difficulty, InstrumentId } from '@/data/types';

export interface DemoProgress {
  instrumentId: InstrumentId;
  mode: 'learning' | 'detection';
  completedAt: number;
}

export interface DetectionRecord {
  id: string;
  sampleId: string;
  difficulty: Difficulty;
  userAnswer: string | null;
  correct: boolean;
  attempts: number;
  score: number;
  completedAt: number;
}

interface ProgressState {
  /** 是否完成新手引导 */
  onboarded: boolean;
  /** 已访问过的知识库（id 集合） */
  visitedKnowledgeBases: InstrumentId[];
  /** 已完成的演示 */
  completedDemos: DemoProgress[];
  /** 历史检测记录 */
  detectionHistory: DetectionRecord[];
  /** 累计积分 */
  totalPoints: number;

  setOnboarded: (v: boolean) => void;
  markVisited: (id: InstrumentId) => void;
  markDemoComplete: (p: DemoProgress) => void;
  pushDetection: (r: DetectionRecord) => void;
  reset: () => void;
}

const initial: Omit<
  ProgressState,
  'setOnboarded' | 'markVisited' | 'markDemoComplete' | 'pushDetection' | 'reset'
> = {
  onboarded: false,
  visitedKnowledgeBases: [],
  completedDemos: [],
  detectionHistory: [],
  totalPoints: 0,
};

export const useProgress = create<ProgressState>()(
  persist(
    (set) => ({
      ...initial,
      setOnboarded: (v) => set({ onboarded: v }),
      markVisited: (id) =>
        set((s) => ({
          visitedKnowledgeBases: s.visitedKnowledgeBases.includes(id)
            ? s.visitedKnowledgeBases
            : [...s.visitedKnowledgeBases, id],
        })),
      markDemoComplete: (p) =>
        set((s) => ({
          completedDemos: [
            ...s.completedDemos.filter(
              (d) => !(d.instrumentId === p.instrumentId && d.mode === p.mode),
            ),
            p,
          ],
        })),
      pushDetection: (r) =>
        set((s) => ({
          detectionHistory: [r, ...s.detectionHistory].slice(0, 50),
          totalPoints: s.totalPoints + r.score,
        })),
      reset: () => set({ ...initial }),
    }),
    {
      name: 'gem-lab-progress-v1',
      version: 1,
    },
  ),
);
