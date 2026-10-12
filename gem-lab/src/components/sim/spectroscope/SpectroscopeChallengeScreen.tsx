import { Link } from 'react-router-dom';
import { SimPanel } from '../SimShell';
import SpectroscopeChallenge from './SpectroscopeChallenge';
import type { SimScreenProps } from '../registry';
import { SAMPLES_BY_DIFFICULTY, SAMPLES_BY_ID } from '../../../data/samples';
import { changeLabMachine, drawChallenge, labInitial, readLabScene, readMachine, DIFFICULTY_LABELS, type ChallengeDifficulty, type LabScene } from '../../../domain/spectroscopeSim';
import type { SpectroscopeData } from '../../../store/detectionStore';

const DIFFICULTIES: readonly ChallengeDifficulty[] = ['beginner', 'intermediate', 'advanced'];

/**
 * 分光镜 · 挑战屏（独立练习）：选一档难度随机抽一颗未知样品，全程不显示品种名；
 * 保存核对后揭示答案与参考谱，记录只留本屏 —— 不写检测存储，也不清空进行中的综合检测。
 */
export default function SpectroscopeChallengeScreen({ sim, screen, onScreen, session, dispatch }: SimScreenProps) {
  const machine = readMachine(session.options);
  const scene: LabScene = readLabScene(session.scenes[screen], machine);
  const patch = (next: Partial<LabScene>) => dispatch({ type: 'patch-scene', screen, patch: next });
  // 抽样身份存在场景里：换屏与「重新开始任务」都不丢，只有重置本屏才回到未抽取。
  const drawn = scene.difficulty;

  // 抽样品：随机取一颗，连同难度一起写进场景（保存后屏内揭示答案）。
  const pick = (difficulty: ChallengeDifficulty) => {
    const pool = SAMPLES_BY_DIFFICULTY[difficulty];
    const sample = pool[Math.floor(Math.random() * pool.length)];
    patch(drawChallenge(scene, machine, { difficulty, sampleId: sample.id }) as unknown as Partial<LabScene>);
  };
  const save = (data: SpectroscopeData) => patch({ saved: { notes: data.notes, stale: false, pending: data.observationStatus !== 'observed' } });
  const answer = drawn ? SAMPLES_BY_ID[scene.sampleId] : null;

  const header = (
    <SimPanel title="未知样品挑战" testId="sim-panel-challenge">
      <div className="sim-row">
        {DIFFICULTIES.map((item) => <button key={item} type="button" className={`iu-button${drawn === item ? ' iu-button--primary' : ''}`} aria-pressed={drawn === item} onClick={() => pick(item)} data-testid={`sim-challenge-${item}`}>{DIFFICULTY_LABELS[item]}</button>)}
      </div>
      {drawn
        ? <p className="sim-note">已抽一颗未知样品（全程不显示品种名）。摆好光路、记录吸收特征，保存核对后显示答案；想换一颗就再点一次难度。</p>
        : <p className="sim-note">选一档难度抽一颗未知样品。本屏记录只留在这里，不影响「综合检测」进行中的记录。</p>}
      <p className="sim-note"><Link className="iu-button" to="/detection" data-testid="sim-challenge-detection">去做综合检测</Link></p>
    </SimPanel>
  );

  return (
    <SpectroscopeChallenge
      sim={sim} machine={machine} scene={scene} patch={patch} unknown reveal idle={drawn === null}
      onMachine={(next) => {
        dispatch({ type: 'patch-options', patch: { machine: next } });
        // 换机型：刻度与可调部件都变了，已保存的记录标为过期；抽样身份与已标记波长照旧。
        patch(changeLabMachine(scene, next) as unknown as Partial<LabScene>);
      }}
      onScreen={onScreen} onSave={save} header={header}
      reference={answer && <details className="sim-sources" data-testid="sim-record-reference"><summary>参考谱与说明</summary><p>{answer.spectrum.description}</p>{answer.spectrum.observationNote && <p>{answer.spectrum.observationNote}</p>}</details>}
    />
  );
}
