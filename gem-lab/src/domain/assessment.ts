import type { Difficulty } from '../data/types';

/** 反馈已揭晓答案后，重试只用于复盘，不再计分。 */
export function computeScore(
  correct: boolean,
  difficulty: Difficulty,
  attempts: number,
  confidence: number,
  hintUsed: boolean,
): number {
  if (!correct || attempts > 1) return 0;
  const base = { beginner: 10, intermediate: 20, advanced: 30 }[difficulty];
  const hintPenalty = hintUsed ? 2 : 0;
  const confidenceFactor = 1 + (confidence - 50) / 200;
  return Math.max(1, Math.round((base - hintPenalty) * confidenceFactor));
}
