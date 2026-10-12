import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Difficulty, InstrumentId } from '@/data/types';
import { addPracticeResult, masteryFromHistory, type SampleMastery } from '@/domain/practice';

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
  /** 本次命名时选择的主要依据；旧记录可能没有此字段 */
  evidence?: 'ri' | 'optical' | 'spectrum';
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
  /** 不受最近 50 条历史截断影响的每样品练习摘要 */
  sampleMastery: Record<string, SampleMastery>;
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
  sampleMastery: {},
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
          sampleMastery: addPracticeResult(s.sampleMastery, r),
          totalPoints: s.totalPoints + r.score,
        })),
      reset: () => set({ ...initial }),
    }),
    {
      name: 'gem-lab-progress-v1',
      version: 2,
      migrate: (persisted, version) => {
        if (version !== 1 || !persisted || typeof persisted !== 'object') return persisted as ProgressState;
        const old = persisted as Partial<ProgressState>;
        return {
          ...old,
          sampleMastery: masteryFromHistory(old.detectionHistory ?? []),
        } as ProgressState;
      },
    },
  ),
);
