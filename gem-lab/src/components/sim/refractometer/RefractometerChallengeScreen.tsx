import { Link } from 'react-router-dom';
import { SimPanel } from '../SimShell';
import RefractometerBench from './RefractometerBench';
import type { SimScreenProps } from '../registry';
import { SAMPLES, SAMPLES_BY_DIFFICULTY, SAMPLES_BY_ID } from '../../../data/samples';
import type { SampleDef } from '../../../data/types';
import { DIFFICULTY_LABELS, labInitial, readLabScene, type ChallengeDifficulty, type LabScene } from '../../../domain/refractometerSim';

const DIFFICULTIES: readonly ChallengeDifficulty[] = ['beginner', 'intermediate', 'advanced'];

/**
 * 折射仪 · 挑战屏（独立练习）：选一档难度随机抽一颗未知样品，全程不显示品种名；
 * 保存读数后揭示答案与参考值，记录只留本屏 —— 不写检测存储，也不清空进行中的综合检测。
 */
export default function RefractometerChallengeScreen({ sim, screen, onScreen, session, dispatch }: SimScreenProps) {
  const scene = readLabScene(session.scenes[screen]);
  const patch = (next: Partial<LabScene>) => dispatch({ type: 'patch-scene', screen, patch: next as unknown as Record<string, unknown> });
  // 抽样身份存在场景里：换屏、重新开始任务与「全部重置」都保留，重选难度才重新抽样。
  const drawn = scene.difficulty;
  const sample = SAMPLES_BY_ID[scene.sampleId] ?? SAMPLES[0];
  const idle = drawn === null;
  // 还没抽样品时不露出任何样品（连形态也不显示），抽到后才按真实样品摆放。
  const shown: SampleDef = idle ? SAMPLES_BY_DIFFICULTY.beginner[0] : sample;

  const pick = (difficulty: ChallengeDifficulty) => {
    const pool = SAMPLES_BY_DIFFICULTY[difficulty];
    const picked = pool[Math.floor(Math.random() * pool.length)];
    patch({ ...labInitial(picked.id), difficulty } as unknown as Partial<LabScene>);
  };

  const header = (
    <SimPanel title="未知样品挑战" testId="sim-panel-challenge">
      <div className="sim-row">
        {DIFFICULTIES.map((item) => <button key={item} type="button" className={`iu-button${drawn === item ? ' iu-button--primary' : ''}`} aria-pressed={drawn === item} onClick={() => pick(item)} data-testid={`sim-challenge-${item}`}>{DIFFICULTY_LABELS[item]}</button>)}
      </div>
      {idle
        ? <p className="sim-note">选一档难度抽一颗未知样品。本屏记录只留在这里，不影响「综合检测」进行中的记录。</p>
        : <p className="sim-note">已抽一颗未知样品（全程不显示品种名）。完成开灯、滴液、放样与贴合，读出边界后保存，屏内即揭示答案；想换一颗就再点一次难度。</p>}
      <p className="sim-note"><Link className="iu-button" to="/detection" data-testid="sim-challenge-detection">去做综合检测</Link></p>
    </SimPanel>
  );

  return (
    <RefractometerBench
      sim={sim} screen={screen} onScreen={onScreen}
      scene={scene} sample={shown} unknown reveal={!idle} idle={idle}
      header={header}
      onPatch={patch}
      onReset={() => patch({ ...labInitial(scene.sampleId), difficulty: scene.difficulty, saved: scene.saved ? { ...scene.saved, stale: true } : null } as unknown as Partial<LabScene>)}
      onSave={(record) => { if (!idle) patch({ saved: { summary: record.summary, stale: false } }); }}
      reference={!idle ? <details className="sim-sources" data-testid="sim-record-reference"><summary>参考答案</summary><p>{referenceText(sample)}</p></details> : undefined}
    />
  );
}

/** 揭示时的参考答案：与 2D 演示同一份样品数据。 */
function referenceText(sample: SampleDef): string {
  const ri = sample.characteristics.refractiveIndex;
  const value = ri === 'over-1.78' ? '> 1.780（超折射油）' : typeof ri === 'number' ? ri.toFixed(3) : `${ri[0].toFixed(3)} – ${ri[1].toFixed(3)}`;
  return `${sample.name}：折射率 ${value}。${sample.detectionTips[0] ?? ''}`;
}
