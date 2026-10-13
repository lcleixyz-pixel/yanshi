import { useState } from 'react';
import { Link } from 'react-router-dom';
import RefractometerBench, { type ReadingRecord } from './RefractometerBench';
import { SIMS } from '../../../data/sims';
import { SAMPLES_BY_ID } from '../../../data/samples';
import { requiredRefractometerMethod, shapeLabelCn } from '../../../data/refractometerSampleMethod';
import { labInitial, observationView, type LabScene } from '../../../domain/refractometerSim';
import { useDetection } from '../../../store/detectionStore';
import '../../../styles/sim-instrument.css';

const VIEW_LABEL: Record<string, string> = {
  off: '电源关闭', 'scale-only': '只有空载刻度', 'oil-empty': '未放样', spot: '点测视场', single: '单边界', 'double': '双折射（两条边界）', 'over-range': '超量程',
};

/**
 * 检测流程里的折射仪挑战屏（内联）：会话是本地的一次性状态（检测流程不经过仿真地址）。
 * 保存时逐字保留今天的写回：setRefractometer → markInstrument → 回到检测流程；不显示样品名与参考值。
 * 底部不渲染屏幕导航（避免从挑战屏跳到别的屏而丢了检测流程）。
 */
export default function RefractometerDetectionChallenge({ sampleId, onDetectionComplete, onUse2D }: {
  sampleId: string;
  onDetectionComplete?: () => void;
  onUse2D?: () => void;
}) {
  const [scene, setScene] = useState<LabScene>(() => labInitial(sampleId));
  const patch = (next: Partial<LabScene>) => setScene((previous) => ({ ...previous, ...next }));
  const sample = SAMPLES_BY_ID[sampleId];
  const method = requiredRefractometerMethod(sample);
  const view = observationView(scene, sample);

  // 保存读数：写回与 2D 检测同一份数据（点测只给近似读数；超量程只记「> 1.780」，不编数值）。
  const save = (record: ReadingRecord) => {
    useDetection.getState().setRefractometer({
      method,
      riMin: record.min,
      riMax: record.max ?? record.min,
      birefringence: record.max !== null && record.min !== null ? Number((record.max - record.min).toFixed(3)) : 0,
      opticalCharacter: sample.characteristics.opticalCharacter,
      notes: record.overLimit ? '折射率仅可判定为 > 1.780（超折射油）' : '',
    });
    useDetection.getState().markInstrument('refractometer');
    patch({ saved: { summary: record.summary, stale: false } });
    onDetectionComplete?.();
  };

  return (
    <RefractometerBench
      sim={SIMS.refractometer} screen="challenge" embedded
      scene={scene} sample={sample} unknown reveal={false}
      header={(
        <section className="sim-panel" data-testid="sim-panel-detection">
          <h3><span>检测中的折射仪</span></h3>
          <div className="sim-panel__body">
            <p className="sim-note">未知样品 · 形态{shapeLabelCn(sample.refractometerShape)}：按形态只能用{method === 'facet' ? '刻面法' : '点测法（远视法）'}，读数条件与实验屏一致。</p>
            <p className="sim-note" data-testid="sim-refracto-view">当前视场：{VIEW_LABEL[view]}</p>
            <p className="sim-note">三维光路为「示例参数 · 原理计算」，不显示样品身份与参考值；读不到的边界就是读不到。</p>
            <p className="sim-note"><Link className="iu-button" to="/detection" data-testid="sim-refracto-back">返回检测流程</Link></p>
          </div>
        </section>
      )}
      onPatch={patch}
      onReset={() => patch(labInitial(sampleId))}
      onSave={save}
      onUse2D={onUse2D}
    />
  );
}
