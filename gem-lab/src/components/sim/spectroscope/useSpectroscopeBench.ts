import { useEffect, useRef, useState } from 'react';
import type { SampleDef } from '../../../data/types';
import { evaluateBench, type BenchState } from '../../../domain/spectroscopeBench';
import { benchSpecimenAppearance, createSpectroscopeBenchViewer, type SpectroscopeBenchViewer } from '../../spectroscope3d/spectroscopeBenchViewer';

export type BenchView = 'whole' | 'lamp' | 'sample' | 'instrument';
export type BenchStatus = 'loading' | 'ready' | 'error';

/**
 * 照明夹样工作台的查看器：状态一变就整体更新，三维里直接拖动部件经 ref 回写（不取闭包里的旧状态）。
 * 机型切换只由状态驱动可见性，不重建查看器；载入失败时换 attempt 原地重试（同练习页与偏光镜）。
 */
export function useSpectroscopeBench({ hostRef, state, sample, beams, view, viewShift = 0, onAdjust }: {
  hostRef: React.RefObject<HTMLElement>;
  state: BenchState;
  sample: SampleDef;
  beams: boolean;
  view: BenchView;
  /** 画面右移比例（实验屏观察面板展开时让位）。 */
  viewShift?: number;
  onAdjust: (patch: Partial<Pick<BenchState, 'lampLateral' | 'slit' | 'focus'>>) => void;
}) {
  const viewerRef = useRef<SpectroscopeBenchViewer | null>(null);
  const adjustRef = useRef(onAdjust);
  adjustRef.current = onAdjust;
  const [status, setStatus] = useState<BenchStatus>('loading');
  const [error, setError] = useState('');
  const [part, setPart] = useState('');
  const [attempt, setAttempt] = useState(0);
  const evaluation = evaluateBench(sample, state);
  const specimen = benchSpecimenAppearance(sample);

  useEffect(() => {
    if (!hostRef.current) return;
    try {
      viewerRef.current = createSpectroscopeBenchViewer(hostRef.current, {
        onStatus: (next, message) => { setStatus(next); setError(message ?? ''); },
        onSelect: (id) => setPart(id),
        onAdjust: (patch) => adjustRef.current(patch),
      });
      return () => { viewerRef.current?.dispose(); viewerRef.current = null; };
    } catch (cause) {
      setStatus('error');
      setError(cause instanceof Error ? cause.message : '三维视图未能初始化');
      return;
    }
  }, [attempt]);

  useEffect(() => { viewerRef.current?.update(state, evaluation, specimen); }, [state, evaluation, specimen, status, attempt]);
  useEffect(() => { viewerRef.current?.setBeams(beams); }, [beams]);
  useEffect(() => { viewerRef.current?.setViewShift(viewShift); }, [viewShift, status, attempt]);
  // 窄屏上画幅在状态就绪后才定下尺寸，就绪后按最终画幅重取一次视角。
  useEffect(() => {
    if (status !== 'ready') return;
    const frame = requestAnimationFrame(() => viewerRef.current?.focus(view));
    return () => cancelAnimationFrame(frame);
  }, [view, status]);
  useEffect(() => { if (status === 'ready') viewerRef.current?.focus(view); }, [view]);

  return { status, error, part, evaluation, specimen, viewer: viewerRef, retry: () => setAttempt((n) => n + 1) };
}
