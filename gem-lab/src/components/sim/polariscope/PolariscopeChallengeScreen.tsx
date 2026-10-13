import { Link } from 'react-router-dom';
import { SimPanel } from '../SimShell';
import PolariscopeBench, { JUDGEMENTS } from './PolariscopeBench';
import type { SimScreenProps } from '../registry';
import { SAMPLES_BY_DIFFICULTY } from '../../../data/samples';
import { getPolariscopeProfile } from '../../../domain/polariscopeSamples';
import { OBSERVATION_RULES } from '../../../domain/polariscopeRules';
import { CATEGORY_LABEL } from '../../../domain/polariscopeCopy';
import { challengeInitial, checkChallenge, DIFFICULTY_LABELS, readChallengeScene, type ChallengeDifficulty, type ChallengeScene } from '../../../domain/polariscopeSim';

const DIFFICULTIES: readonly ChallengeDifficulty[] = ['beginner', 'intermediate', 'advanced'];

/**
 * 偏光镜 · 挑战屏（独立练习）：选一档难度随机抽一颗未知样品，全程不显示品种名；
 * 保存记录后揭示答案，记录只留本屏 —— 不写检测存储，也不清空进行中的综合检测（同折射仪、分光镜）。
 */
export default function PolariscopeChallengeScreen({ sim, screen, onScreen, session, dispatch }: SimScreenProps) {
  const scene = readChallengeScene(session.scenes[screen]);
  const set = (next: ChallengeScene) => dispatch({ type: 'patch-scene', screen, patch: next });
  const idle = scene.difficulty === null;
  const pick = (difficulty: ChallengeDifficulty) => {
    const pool = SAMPLES_BY_DIFFICULTY[difficulty].filter((sample) => getPolariscopeProfile(sample.id));
    set(challengeInitial(pool[Math.floor(Math.random() * pool.length)].id, difficulty));
  };
  const profile = getPolariscopeProfile(scene.structure.sampleId)!;
  const saved = scene.saved && !scene.saved.stale ? scene.saved : null;
  const check = saved ? checkChallenge(scene.structure.sampleId, saved) : null;

  const header = (
    <SimPanel title="未知样品挑战" testId="sim-panel-challenge">
      <div className="sim-row">
        {DIFFICULTIES.map((item) => <button key={item} type="button" className={`iu-button${scene.difficulty === item ? ' iu-button--primary' : ''}`} aria-pressed={scene.difficulty === item} onClick={() => pick(item)} data-testid={`sim-challenge-${item}`}>{DIFFICULTY_LABELS[item]}</button>)}
      </div>
      <p className="sim-note">{idle
        ? '选一档难度抽一颗未知样品。本屏记录只留在这里，不影响「综合检测」进行中的记录。'
        : '已抽一颗未知样品（全程不显示品种名）。开电源、调正交、放样、转满一周后记录，保存即揭示答案；想换一颗就再点一次难度。'}</p>
      <p className="sim-note"><Link className="iu-button" to="/detection" data-testid="sim-challenge-detection">去做综合检测</Link></p>
    </SimPanel>
  );

  const after = saved && check ? (
    <div className="sim-polari-answer" data-testid="sim-challenge-answer" data-correct={check.reaction && check.judgement}>
      <strong>{profile.name} · {CATEGORY_LABEL[profile.observation]}</strong>
      <p className="sim-note">现象{check.reaction ? '✓' : '✗'} · 光性{check.judgement ? '✓' : '✗'}（你记的是：{saved.reaction === 'not-applicable' ? '透射法不适用' : JUDGEMENTS.find((item) => item.id === saved.judgement)?.label ?? '—'}）</p>
      <p className="sim-note">{OBSERVATION_RULES[profile.expectedPhenomenon === 'not-applicable' ? 'not-applicable' : profile.expectedPhenomenon].text}</p>
    </div>
  ) : scene.saved?.stale ? <p className="sim-note" data-testid="sim-challenge-stale">已重置场景：上一条记录不再对应当前视场。</p> : null;

  return (
    <PolariscopeBench
      sim={sim} screen={screen} onScreen={onScreen} scene={scene} idle={idle} header={header} after={after}
      onScene={set}
      onReset={() => set({ ...challengeInitial(scene.structure.sampleId, scene.difficulty), saved: scene.saved ? { ...scene.saved, stale: true } : null })}
      onSave={(next) => set({ ...next, saved: { reaction: next.reaction!, judgement: next.reaction === 'not-applicable' ? null : next.judgement || null, stale: false } })}
    />
  );
}
