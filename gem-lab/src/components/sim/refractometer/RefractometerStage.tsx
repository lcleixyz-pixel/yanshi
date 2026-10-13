import { useEffect, useRef, useState } from 'react';
import ObservationWindow from '../../refractometer/ObservationWindow';
import { createOpticsViewer, type OpticsSnapshot, type OpticsViewer } from '../../optics3d/opticsViewer.js';
import { opticsAssetBase } from '../../optics3d/opticsInstruments';
import type { SampleDef } from '../../../data/types';
import { SAMPLE_CASES_PATH, viewerState, type LabScene } from '../../../domain/refractometerSim';
import type { RefractometerView } from '../../refractometer/ObservationWindow';
import { benchStatusLine } from '../../../domain/refractometerCopy';

/**
 * 折射仪的操作区：三维仪器 + 停靠的目镜视场（同课程页的观察窗停靠）。
 * 三维按当前样品选光路案例（逐样品案例包），开关 / 翻盖 / 样品姿态与课程页同一组字段。
 */
export default function RefractometerStage({ scene, sample, view, showReading, readout, children }: {
  scene: LabScene;
  sample: SampleDef;
  view: RefractometerView;
  /** 目镜里是否揭晓读数（操作门槛满足后）。 */
  showReading: boolean;
  /** 停靠窗下方的状态行（读数条件说明）。 */
  readout?: string;
  /** 操作区里的按钮（记录观察、改用 2D 等）。 */
  children?: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpticsViewer | null>(null);
  const [snapshot, setSnapshot] = useState<OpticsSnapshot>({ status: 'loading' });
  // 载入失败时原地重试：换一次 attempt 就重新创建查看器，不刷新整页（同偏光镜与分光镜）。
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!hostRef.current) return;
    setSnapshot({ status: 'loading' });
    const viewer = createOpticsViewer({
      container: hostRef.current, instrument: 'refractometer', assetBase: opticsAssetBase('refractometer'),
      extraCasesUrl: `${import.meta.env.BASE_URL}${SAMPLE_CASES_PATH}`, onChange: setSnapshot,
    });
    viewerRef.current = viewer;
    return () => { viewer.dispose(); viewerRef.current = null; };
  }, [attempt]);

  // 仪器状态与光路案例：条件一变就按新样品 / 新接触状态换案例（三维与目镜始终说同一件事）。
  const state = viewerState(scene, sample);
  const key = JSON.stringify(state);
  useEffect(() => {
    if (snapshot.status !== 'ready') return;
    viewerRef.current?.setState(state);
  }, [key, snapshot.status]);
  useEffect(() => { viewerRef.current?.setView(scene.view); }, [scene.view, snapshot.status]);
  useEffect(() => { viewerRef.current?.setRays(scene.rays); }, [scene.rays, snapshot.status]);

  return (
    <>
      <section className="sim-stage" aria-label="折射仪三维仪器与目镜观察" data-testid="sim-refracto-bench">
        <div className="sim-stage__host" ref={hostRef} />
        {snapshot.status === 'loading' && <p className="sim-stage__note" role="status"><i />正在载入仪器模型…</p>}
        {snapshot.status === 'error' && (
          <div className="sim-stage__error" role="alert">
            <img src={`${opticsAssetBase('refractometer')}poster.png`} alt="折射仪静态预览" />
            <p>三维模型载入失败：{snapshot.error}。可重新载入，或用 2D 版本继续。</p>
            <button type="button" className="iu-button" onClick={() => setAttempt((n) => n + 1)} data-testid="sim-refracto-retry">重新载入</button>
          </div>
        )}
        <div className="sim-eyepiece" data-testid="sim-refracto-eyepiece" data-view={view}>
          <h2>目镜观察 <span>教学模拟</span></h2>
          <ObservationWindow view={view} sample={sample} size={196} showReading={showReading} hideChrome />
          {readout && <p role="status">{readout}</p>}
          {children}
        </div>
        <p className="sim-stage__hint">{benchStatusLine(scene)} · 拖动旋转 · 滚轮缩放</p>
      </section>
    </>
  );
}
