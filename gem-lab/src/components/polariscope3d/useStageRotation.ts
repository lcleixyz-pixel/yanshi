import { useCallback, useEffect, useRef, useState } from 'react';
import { rotationStepDegrees } from '../../domain/animationTiming';
import { coverageOf, emptyCoverage, markRotation } from '../../domain/rotationCoverage';

/**
 * 物台转动的观察记录与自动转一周（约 9 秒）。recording 为假时转动不计入记录（例如未预测、未正交）。
 * setStageAngle 接收函数式更新，由页面写回自己的仪器状态。
 */
export function useStageRotation(stageAngle: number, recording: boolean, setStageAngle: (update: (previous: number) => number) => void) {
  const [visited, setVisited] = useState<readonly boolean[]>(() => emptyCoverage());
  const [autoRotate, setAutoRotate] = useState(false);
  const previous = useRef(stageAngle);
  const write = useRef(setStageAngle); write.current = setStageAngle;
  useEffect(() => {
    const from = previous.current; previous.current = stageAngle;
    if (recording) setVisited((current) => markRotation(current, from, stageAngle));
  }, [stageAngle]); // eslint-disable-line react-hooks/exhaustive-deps -- 只响应物台转动；recording 取本次渲染的值
  useEffect(() => {
    if (!autoRotate) return;
    // 按累计转角精确终止（不逐帧舍入），任何刷新率下都正好转满一周。
    let frame = 0, last = performance.now(), travelled = 0, start: number | null = null;
    const tick = (now: number) => {
      const elapsed = (now - last) / 1000; last = now;
      if (document.hidden) { frame = requestAnimationFrame(tick); return; }
      travelled = Math.min(360, travelled + rotationStepDegrees(elapsed));
      write.current((angle) => {
        if (start === null) start = angle;
        return travelled >= 360 ? start : (start + travelled) % 360;
      });
      if (travelled >= 360) { setAutoRotate(false); return; }
      frame = requestAnimationFrame(tick);
    };
    const resetClock = () => { last = performance.now(); };
    document.addEventListener('visibilitychange', resetClock);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', resetClock); };
  }, [autoRotate]);
  const resetVisited = useCallback(() => setVisited(emptyCoverage()), []);
  return { visited, coverage: coverageOf(visited), resetVisited, autoRotate, setAutoRotate };
}
