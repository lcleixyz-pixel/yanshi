import { useRef, useState } from 'react';
import type { InstrumentId } from '../../data/types';
import { mayRecordLearning, noRecordReason, type CourseMode } from '../../domain/course';

/**
 * 课程完成时的学习记录：符合条件才按需加载进度存储并写入，与 2D 学习模式使用同一条记录；
 * 讲师演示、跳步复习、自由探索和未完成的课程都不读写学习存储。
 */
export function useLearningRecord(instrumentId: InstrumentId, mode: CourseMode) {
  const [status, setStatus] = useState('');
  const saving = useRef(false);
  async function record(hasSkipped: boolean, allComplete: boolean) {
    if (saving.current) return;
    saving.current = true;
    if (!mayRecordLearning(mode, hasSkipped, allComplete)) {
      setStatus(noRecordReason(mode));
      return;
    }
    try {
      const { useProgress } = await import('../../store/progressStore');
      useProgress.getState().markDemoComplete({ instrumentId, mode: 'learning', completedAt: Date.now() });
      setStatus('已记录本次学习完成。');
    } catch {
      setStatus('学习记录保存失败，可重试。');
      saving.current = false;
    }
  }
  /** 再学一遍：清除本轮保存状态，下一次完成可以重新判断是否写入。 */
  function reset() {
    saving.current = false;
    setStatus('');
  }
  return { status, failed: status.includes('失败'), record, reset };
}
