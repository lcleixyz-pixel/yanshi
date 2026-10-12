import { useState } from 'react';
import SpectroscopeChallenge from './SpectroscopeChallenge';
import { SIMS } from '../../../data/sims';
import { changeLabMachine, labInitial, type LabScene, type Machine } from '../../../domain/spectroscopeSim';
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
      sim={SIMS.spectroscope} machine={machine}
      onMachine={(next) => {
        setMachine(next);
        // 换机型：条件变了，旧记录只保留并标为过期；抽到的未知样品与观察方法不变。
        setScene((previous) => ({ ...labInitial(next, sampleId, previous.bench.method), saved: previous.saved ? { ...previous.saved, stale: true } : null }));
      }}
      scene={scene} patch={patch} unknown reveal={false} embedded onSave={save} onUse2D={onUse2D}
    />
  );
}
