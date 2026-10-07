/** Auto-rotation follows elapsed foreground time, while keeping each visible step
 * below the observation recorder's 15° continuity limit. Very slow devices take
 * longer than nine seconds; unseen angles must never count as an observed turn. */
export function rotationStepDegrees(elapsedSeconds: number): number {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
  return Math.min(12, elapsedSeconds * 40);
}
