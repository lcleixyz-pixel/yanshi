export interface PracticeResult {
  sampleId: string;
  correct: boolean;
  completedAt: number;
  attempts?: number;
}

function independentCorrect(result: PracticeResult): boolean {
  return result.correct && (result.attempts ?? 1) === 1;
}

export interface SampleMastery {
  attempts: number;
  correct: number;
  lastPracticedAt: number;
  lastCorrect: boolean;
}

export type MasteryLevel = 'new' | 'review' | 'practicing' | 'mastered';

export function masteryLevel(progress?: SampleMastery): MasteryLevel {
  if (!progress || progress.attempts === 0) return 'new';
  if (!progress.lastCorrect) return 'review';
  return progress.correct >= 2 ? 'mastered' : 'practicing';
}

export function addPracticeResult(
  current: Record<string, SampleMastery>,
  result: PracticeResult,
): Record<string, SampleMastery> {
  const previous = current[result.sampleId];
  const credited = independentCorrect(result);
  return {
    ...current,
    [result.sampleId]: {
      attempts: (previous?.attempts ?? 0) + 1,
      correct: (previous?.correct ?? 0) + Number(credited),
      lastPracticedAt: result.completedAt,
      lastCorrect: credited,
    },
  };
}

export function masteryFromHistory(history: readonly PracticeResult[]): Record<string, SampleMastery> {
  return [...history]
    .sort((a, b) => a.completedAt - b.completedAt)
    .reduce<Record<string, SampleMastery>>(addPracticeResult, {});
}

/**
 * 复习优先，但始终保留随机探索；最近抽过的样品降权。
 * 当前样品在同难度池有其他选择时会被排除。
 */
export function selectPracticeSample<T extends { id: string }>(
  pool: readonly T[],
  history: readonly PracticeResult[],
  currentSampleId: string | null,
  random: () => number = Math.random,
  mastery: Readonly<Record<string, SampleMastery>> = {},
): T | null {
  if (pool.length === 0) return null;
  const candidates = pool.length > 1
    ? pool.filter((sample) => sample.id !== currentSampleId)
    : [...pool];
  const recent = history.slice(0, 5);
  const latestById = new Map<string, PracticeResult>();
  for (const result of history) {
    if (!latestById.has(result.sampleId)) latestById.set(result.sampleId, result);
  }

  const weighted = candidates.map((sample) => {
    const latest = latestById.get(sample.id);
    const known = mastery[sample.id];
    const base = known
      ? masteryLevel(known) === 'review' ? 5 : masteryLevel(known) === 'mastered' ? 1 : 3
      : !latest ? 4 : independentCorrect(latest) ? 1 : 5;
    const recentIndex = recent.findIndex((result) => result.sampleId === sample.id);
    const recency = recentIndex === -1 ? 1 : recentIndex < 2 ? 0.25 : 0.6;
    return { sample, weight: base * recency };
  });
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let position = Math.min(Math.max(random(), 0), 0.999999999) * total;
  for (const item of weighted) {
    position -= item.weight;
    if (position < 0) return item.sample;
  }
  return weighted[weighted.length - 1]?.sample ?? null;
}
