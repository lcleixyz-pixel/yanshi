import { Link } from 'react-router-dom';
import { SimPanel } from '../SimShell';
import SpectroscopeChallenge from './SpectroscopeChallenge';
import type { SimScreenProps } from '../registry';
import { SAMPLES_BY_DIFFICULTY, SAMPLES_BY_ID } from '../../../data/samples';
import { labInitial, readLabScene, readMachine, readTaskData, DIFFICULTY_LABELS, type ChallengeDifficulty, type LabScene } from '../../../domain/spectroscopeSim';
import type { SpectroscopeData } from '../../../store/detectionStore';

const DIFFICULTIES: readonly ChallengeDifficulty[] = ['beginner', 'intermediate', 'advanced'];

/**
 * 分光镜 · 挑战屏（独立练习）：选一档难度随机抽一颗未知样品，全程不显示品种名；
 * 保存核对后揭示答案与参考谱，记录只留本屏 —— 不写检测存储，也不清空进行中的综合检测。
 */
export default function SpectroscopeChallengeScreen({ sim, screen, onScreen, session, dispatch }: SimScreenProps) {
  const machine = readMachine(session.options);
  const task = readTaskData(session.task.data);
  const draw = task.challenge;
  const scene: LabScene = { ...readLabScene(session.scenes[screen], machine), sampleId: draw?.sampleId ?? 'ruby' };
  const patch = (next: Partial<LabScene>) => dispatch({ type: 'patch-scene', screen, patch: next });

  // 抽样品：随机取一颗并换一套干净的挑战场景（保存后屏内揭示答案）。
  const pick = (difficulty: ChallengeDifficulty) => {
    const pool = SAMPLES_BY_DIFFICULTY[difficulty];
    const sample = pool[Math.floor(Math.random() * pool.length)];
    dispatch({ type: 'task-patch', patch: { challenge: { difficulty, sampleId: sample.id } } });
    dispatch({ type: 'patch-scene', screen, patch: labInitial(machine, sample.id) as unknown as Record<string, unknown> });
  };
  const save = (data: SpectroscopeData) => patch({ saved: { notes: data.notes, stale: false, pending: data.observationStatus !== 'observed' } });
  const answer = draw ? SAMPLES_BY_ID[draw.sampleId] : null;

  const header = (
    <SimPanel title="未知样品挑战" testId="sim-panel-challenge">
      <div className="sim-row">
        {DIFFICULTIES.map((item) => <button key={item} type="button" className={`iu-button${draw?.difficulty === item ? ' iu-button--primary' : ''}`} aria-pressed={draw?.difficulty === item} onClick={() => pick(item)} data-testid={`sim-challenge-${item}`}>{DIFFICULTY_LABELS[item]}</button>)}
      </div>
      {draw
        ? <p className="sim-note">已抽一颗未知样品（全程不显示品种名）。摆好光路、记录吸收特征，保存核对后显示答案；想换一颗就再点一次难度。</p>
        : <p className="sim-note">选一档难度抽一颗未知样品。本屏记录只留在这里，不影响「综合检测」进行中的记录。</p>}
      <p className="sim-note"><Link className="iu-button" to="/detection" data-testid="sim-challenge-detection">去做综合检测</Link></p>
    </SimPanel>
  );

  return (
    <SpectroscopeChallenge
      sim={sim} machine={machine} scene={scene} patch={patch} unknown reveal
      onMachine={(next) => dispatch({ type: 'patch-options', patch: { machine: next } })}
      onScreen={onScreen} onSave={save} header={header}
      reference={answer && <details className="sim-sources" data-testid="sim-record-reference"><summary>参考谱与说明</summary><p>{answer.spectrum.description}</p>{answer.spectrum.observationNote && <p>{answer.spectrum.observationNote}</p>}</details>}
    />
  );
}
