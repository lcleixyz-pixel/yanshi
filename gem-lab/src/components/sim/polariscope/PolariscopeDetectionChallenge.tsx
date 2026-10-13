import { useState } from 'react';
import { Link } from 'react-router-dom';
import PolariscopeBench from './PolariscopeBench';
import { SIMS } from '../../../data/sims';
import { challengeInitial, type ChallengeScene } from '../../../domain/polariscopeSim';
import { useDetection } from '../../../store/detectionStore';
import { useProgress } from '../../../store/progressStore';

/**
 * 检测流程里的偏光镜挑战屏（内联）：会话是本地的一次性状态（检测流程不经过仿真地址）。
 * 保存时逐字保留原 3D 检测模式的写回：setPolariscope → markInstrument → 检测完成 → 回到检测流程。
 * 底部不渲染屏幕导航（避免从挑战屏跳到别的屏而丢了检测流程）。
 */
export default function PolariscopeDetectionChallenge({ sampleId, onDetectionComplete, onUse2D }: {
  sampleId: string;
  onDetectionComplete?: () => void;
  onUse2D: () => void;
}) {
  const [scene, setScene] = useState<ChallengeScene>(() => challengeInitial(sampleId));
  const save = (next: ChallengeScene) => {
    const notApplicable = next.reaction === 'not-applicable';
    useDetection.getState().setPolariscope({
      rotation: next.structure.stageAngle,
      phenomenon: notApplicable ? null : next.reaction as 'four-bright-four-dark' | 'all-dark' | 'all-bright',
      optical: notApplicable ? null : next.judgement || null,
      notes: notApplicable ? '几乎不透光，标准偏光镜透射法不适用' : '',
    });
    useDetection.getState().markInstrument('polariscope');
    useProgress.getState().markDemoComplete({ instrumentId: 'polariscope', mode: 'detection', completedAt: Date.now() });
    onDetectionComplete?.();
  };
  return (
    <PolariscopeBench
      sim={SIMS.polariscope} screen="challenge" embedded scene={scene}
      header={(
        <section className="sim-panel" data-testid="sim-panel-detection">
          <h3><span>检测中的偏光镜</span></h3>
          <div className="sim-panel__body">
            <p className="sim-note">未知样品：不显示讲解、揭晓与动作提示。只有转满一周的观察才能记录。</p>
            <p className="sim-note"><Link className="iu-button" to="/detection" data-testid="sim-polari-back">返回检测流程</Link></p>
          </div>
        </section>
      )}
      onScene={setScene} onReset={() => setScene(challengeInitial(sampleId))} onSave={save} onUse2D={onUse2D}
    />
  );
}
