/**
 * 「转满一周」的记录规则：把物台角度分成 TRACE_STEPS 格，只记录连续转动经过的格。
 * 单次跳变超过 15°（如按 End、PageUp 或点预设）只记录落点，中间角度没有被观察到。
 * 3D 讲解课程与 3D 检测模式共用。
 */
export const TRACE_STEPS = 72;
const CONTINUITY_LIMIT_DEG = 15;

export const emptyCoverage = (steps = TRACE_STEPS) => Array<boolean>(steps).fill(false);

export function markRotation(visited: readonly boolean[], from: number, to: number): readonly boolean[] {
  const steps = visited.length, stepDeg = 360 / steps;
  const shortest = ((to - from) % 360 + 540) % 360 - 180;
  const continuous = Math.abs(to - from) <= CONTINUITY_LIMIT_DEG || Math.abs(shortest) <= CONTINUITY_LIMIT_DEG && Math.abs(to - from) < 359;
  const delta = continuous ? shortest : 0;
  const count = continuous ? Math.max(1, Math.ceil(Math.abs(delta) / (stepDeg / 2))) : 0;
  let next: boolean[] | null = null;
  for (let k = 0; k <= count; k++) {
    const angle = continuous ? (((from + (delta * k) / count) % 360) + 360) % 360 : ((to % 360) + 360) % 360;
    const bin = Math.floor(angle / stepDeg) % steps;
    if (!(next ?? visited)[bin]) { next ??= visited.slice(); next[bin] = true; }
  }
  return next ?? visited;
}

export const coverageOf = (visited: readonly boolean[]) => visited.filter(Boolean).length / visited.length;
