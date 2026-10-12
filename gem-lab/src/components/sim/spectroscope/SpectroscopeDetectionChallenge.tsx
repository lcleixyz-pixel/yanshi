import { useState } from 'react';
import SpectroscopeChallenge from './SpectroscopeChallenge';
import { SIMS } from '../../../data/sims';
import { labInitial, type LabScene, type Machine } from '../../../domain/spectroscopeSim';
import { useDetection, type SpectroscopeData } from '../../../store/detectionStore';
import '../../../styles/spectroscope-sim.css';

/**
 * 检测流程里的分光镜挑战屏（内联）：会话是本地的一次性状态（检测流程不经过仿真地址）。
 * 保存时逐字保留今天的写回：setSpectroscope → markInstrument → 回到检测流程；不显示样品名与参考资料。
 * 底部不渲染屏幕导航（避免从挑战屏跳到别的屏而丢了检测流程）。
 */
export default function SpectroscopeDetectionChallenge({ sampleId, onDetectionComplete, onUse2D }: {
  sampleId: string;
  onDetectionComplete?: () => void;
  onUse2D?: () => void;
}) {
  const [machine, setMachine] = useState<Machine>('prism');
  const [scene, setScene] = useState<LabScene>(() => labInitial('prism', sampleId));
  const patch = (next: Partial<LabScene>) => setScene((previous) => ({ ...previous, ...next }));

  const save = (data: SpectroscopeData) => {
    patch({ saved: { notes: data.notes, stale: false, pending: data.observationStatus !== 'observed' } });
    useDetection.getState().setSpectroscope(data);
    useDetection.getState().markInstrument('spectroscope');
    onDetectionComplete?.();
  };

  return (
    <SpectroscopeChallenge
      sim={SIMS.spectroscope} machine={machine} onMachine={(next) => { setMachine(next); setScene((previous) => ({ ...labInitial(next, sampleId, previous.bench.method), saved: previous.saved })); }}
      scene={scene} patch={patch} unknown reveal={false} embedded onSave={save} onUse2D={onUse2D}
    />
  );
}
