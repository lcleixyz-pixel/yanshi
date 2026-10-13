import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import RangeControl from '../../shared/RangeControl';
import PolariscopeScene from '../../polariscope3d/PolariscopeScene';
import EyepieceView, { EYEPIECE_RESOLUTION, type EyepieceContent } from '../../polariscope3d/EyepieceView';
import RotationTrace from '../../polariscope3d/RotationTrace';
import { useStageRotation } from '../../polariscope3d/useStageRotation';
import { ResetAllButton, SimPanel, SimReadout, SimShell } from '../SimShell';
import type { SimDef } from '../../../data/sims';
import {
  canSaveChallenge, challengeCrossed, challengePlaced, challengeRecording, challengeSteps, patchChallenge,
  type ChallengeJudgement, type ChallengeReaction, type ChallengeScene,
} from '../../../domain/polariscopeSim';
import { buildSampleFieldMap, meanSampleLuminance, rotationCurve } from '../../../domain/eyepieceField';
import { getPolariscopeProfile } from '../../../domain/polariscopeSamples';
import { REACTION_CHECK_LABEL } from '../../../domain/polariscopeRules';
import { markRotation, TRACE_STEPS } from '../../../domain/rotationCoverage';
import { deriveTeachingOptics, type PolariscopeStructureState } from '../../../domain/polariscopeStructure';
import type { SimScreenId } from '../../../domain/simSession';
import '../../../styles/polariscope-explore.css';
import '../../../styles/sim-instrument.css';

const REACTIONS: { id: ChallengeReaction; label: string }[] = [
  { id: 'four-bright-four-dark', label: REACTION_CHECK_LABEL.fourBright },
  { id: 'all-dark', label: REACTION_CHECK_LABEL.allDark },
  { id: 'all-bright', label: REACTION_CHECK_LABEL.allBright },
  { id: 'not-applicable', label: '几乎不透光（透射法不适用）' },
];
export const JUDGEMENTS: { id: ChallengeJudgement; label: string }[] = [
  { id: 'isotropic', label: '均质体' }, { id: 'anisotropic', label: '非均质体（一轴 / 二轴晶）' }, { id: 'aggregate', label: '多晶质集合体' },
];

/**
 * 偏光镜挑战台：未知样品，无讲解、揭晓与动作提示，五步按顺序解锁（原 3D 检测模式搬进仿真外壳）。
 * 挑战屏（独立练习）与检测流程共用；保存后做什么由外层决定（练习屏揭示答案，检测流程写回检测记录）。
 */
export default function PolariscopeBench({ sim, screen, onScreen, embedded, quality: initialQuality = 'high', scene, idle, header, after, onScene, onReset, onSave, onUse2D }: {
  sim: SimDef;
  screen: SimScreenId;
  onScreen?: (screen: SimScreenId) => void;
  /** 检测流程内联：不显示底部屏幕导航。 */
  embedded?: boolean;
  /** 初始三维画质（挑战屏随地址；检测流程默认精细，与原检测模式一致）。 */
  quality?: 'standard' | 'high';
  scene: ChallengeScene;
  /** 还没抽样：载物台空着，不能放样。 */
  idle?: boolean;
  header?: ReactNode;
  /** 保存后显示在记录下方（练习屏的答案核对）。 */
  after?: ReactNode;
  onScene: (next: ChallengeScene) => void;
  onReset: () => void;
  onSave: (scene: ChallengeScene) => void;
  onUse2D?: () => void;
}) {
  const [quality, setQuality] = useState<'standard' | 'high'>(initialQuality);
  const [sceneStatus, setSceneStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fieldCanvas, setFieldCanvas] = useState<HTMLCanvasElement | null>(null);
  const [fieldVersion, setFieldVersion] = useState(0);
  const onRendered = useCallback(() => setFieldVersion((value) => value + 1), []);
  // 自动转动每帧写物台角：ref 里合并最新场景，转动与记录不会互相覆盖（同实验屏）。
  const latest = useRef(scene);
  latest.current = scene;
  const set = (next: ChallengeScene) => { latest.current = next; onScene(next); };
  const update = (patch: Partial<PolariscopeStructureState>) => set(patchChallenge(latest.current, patch));

  const structure = scene.structure;
  const profile = getPolariscopeProfile(structure.sampleId)!;
  const placed = challengePlaced(scene);
  const crossed = challengeCrossed(scene);
  const recording = challengeRecording(scene);
  const turned = placed && scene.visited.every(Boolean);
  const steps = challengeSteps(scene);
  const current = steps.findIndex((step) => !step.done);

  const strain = structure.strain ?? profile.defaultStrain;
  const settings = useMemo(() => ({ orientation: structure.orientation, strain, thicknessMm: structure.thicknessMm, brazilTwin: false }), [structure.orientation, strain, structure.thicknessMm]);
  const fieldMap = useMemo(() => placed ? buildSampleFieldMap(profile, settings, EYEPIECE_RESOLUTION) : null, [placed, profile, settings]);
  const curve = useMemo(() => fieldMap ? rotationCurve(fieldMap, structure.analyzerAngle, TRACE_STEPS) : [], [fieldMap, structure.analyzerAngle]);
  const brightness = fieldMap ? meanSampleLuminance(fieldMap, structure.stageAngle, structure.analyzerAngle, 4) : 0;
  const eyepiece = useMemo<EyepieceContent>(() => ({ kind: 'field', map: fieldMap }), [fieldMap]);
  const field = useMemo(() => ({ canvas: fieldCanvas, version: fieldVersion, show: true, transmission: placed ? brightness : undefined, sampleGlow: placed ? brightness : 0 }), [fieldCanvas, fieldVersion, placed, brightness]);

  const { autoRotate, setAutoRotate } = useStageRotation(structure.stageAngle, false, (rotate) => {
    const now = latest.current;
    set({ ...now, structure: { ...now.structure, stageAngle: rotate(now.structure.stageAngle) } });
  });
  const previousAngle = useRef(structure.stageAngle);
  useEffect(() => {
    const from = previousAngle.current; previousAngle.current = structure.stageAngle;
    const now = latest.current;
    if (!challengeRecording(now)) return;
    const visited = markRotation(now.visited, from, structure.stageAngle);
    if (visited !== now.visited) set({ ...now, visited: [...visited] });
  }, [structure.stageAngle]); // eslint-disable-line react-hooks/exhaustive-deps -- 只响应物台转动

  const changeAngle = (part: 'analyzer' | 'stage', degrees: number) => {
    if (Number.isFinite(degrees)) update({ [part === 'analyzer' ? 'analyzerAngle' : 'stageAngle']: Math.max(0, Math.min(360, degrees)) });
  };
  const place = () => { if (crossed && !idle) update({ lesson: 'sample', stageAngle: 0 }); };
  // 换方向前先停下旧的自动转动，再改方向（剩余转角不能记进新方向）。
  const reorient = () => { setAutoRotate(false); update({ orientation: structure.orientation === 'general' ? 'optic-axis' : 'general' }); };
  const saved = !!scene.saved && !scene.saved.stale;

  const play = (
    <>
      <section className="sim-stage" aria-label="偏光镜三维检测台" data-testid="sim-polari-stage" data-status={sceneStatus}>
        <PolariscopeScene state={structure} quality={quality} resetViewKey={0} viewPreset="free" onSelectPart={() => {}} onAngleChange={changeAngle} onPowerChange={(power) => update({ power })} onStatus={setSceneStatus} field={field} focusOnSelect={false} />
        {sceneStatus === 'error' && onUse2D && <button type="button" className="sim-stage__fallback" onClick={onUse2D} data-testid="detection-fallback-2d">3D 暂不可用：改用 2D 检测 →</button>}
        <p className="sim-stage__hint">拖动空白旋转视角 · 拖动圆环旋转部件 · 点底座侧面按钮开关电源</p>
      </section>
      <SimReadout title="目镜视场" meta={placed ? '未知样品' : '空载'} placement="top-right" testId="sim-polari-field">
        <EyepieceView content={eyepiece} stageDeg={structure.stageAngle} analyzerDeg={structure.analyzerAngle} active={deriveTeachingOptics(structure).active} label={placed ? '目镜视场 · 未知样品' : '目镜视场 · 空载'} onRendered={onRendered} onCanvas={setFieldCanvas} />
      </SimReadout>
    </>
  );

  const panels = (
    <>
      {header}
      <SimPanel title="检测步骤" hint="按顺序完成" testId="sim-panel-steps">
        <ol className="sim-polari-steps" data-testid="detection-steps">
          {steps.map((step, index) => <li key={step.id} data-done={step.done} aria-current={index === current ? 'step' : undefined}><span aria-hidden="true">{step.done ? '✓' : index + 1}</span>{step.label}</li>)}
        </ol>
      </SimPanel>
      <SimPanel title="仪器操作" testId="sim-panel-instrument">
        <div className="sim-row">
          <button type="button" role="switch" aria-checked={structure.power} aria-label="电源开关" className="iu-button" onClick={() => update({ power: !structure.power })} data-testid="sim-polari-power">{structure.power ? '电源已开' : '电源已关'}</button>
          <select className="sim-select" aria-label="三维画质" value={quality} onChange={(event) => setQuality(event.target.value as 'standard' | 'high')}>
            <option value="high">精细画质</option><option value="standard">流畅画质</option>
          </select>
        </div>
        <RangeControl label="上偏光片角度" min={0} max={360} value={Math.round(structure.analyzerAngle)} display={`${Math.round(structure.analyzerAngle)}°`} valueText={`${Math.round(structure.analyzerAngle)} 度`} ends={['0°', '360°']} onChange={(value) => changeAngle('analyzer', value)} testId="sim-polari-analyzer" />
        <button type="button" className="iu-button iu-button--primary" disabled={!crossed || placed || idle} onClick={place} data-testid="detection-place-sample">{placed ? '样品已放上载物台' : '放置样品'}</button>
        {placed && <>
          <RangeControl label="载物台角度" min={0} max={360} value={Math.round(structure.stageAngle)} display={`${Math.round(structure.stageAngle)}°`} valueText={`${Math.round(structure.stageAngle)} 度`} ends={['0°', '360°']} onChange={(value) => changeAngle('stage', value)} testId="sim-polari-stage-angle" />
          <RotationTrace curve={curve} visited={scene.visited} current={structure.stageAngle} reveal={false} analyzerDeg={structure.analyzerAngle} />
          {!crossed && <p className="sim-note" role="status">上偏光片不在正交位置，此时转动不计入记录。</p>}
          <div className="sim-row">
            <button type="button" className="iu-button" onClick={() => setAutoRotate(!autoRotate)} disabled={!recording} data-testid="detection-auto-rotate">{autoRotate ? '停止转动' : '自动转动一周'}</button>
            <button type="button" className="iu-button" onClick={reorient} data-testid="detection-reorient">换个方向放置</button>
          </div>
        </>}
        {onUse2D && <button type="button" className="iu-button" onClick={onUse2D} data-testid="detection-use-2d">改用 2D 版本</button>}
      </SimPanel>
      {placed && (
        <SimPanel title="记录" hint={turned ? undefined : '转满一周后可记录'} testId="sim-panel-record">
          <fieldset className="sim-fieldset sim-polari-record" disabled={!turned || saved} data-testid="detection-record">
            {REACTIONS.map((item) => <label key={item.id}><input type="radio" name="polariscope-reaction" checked={scene.reaction === item.id} onChange={() => set({ ...latest.current, reaction: item.id })} />{item.label}</label>)}
            {scene.reaction !== 'not-applicable' && (
              <label className="sim-polari-record__select">光性判断
                <select className="sim-select" value={scene.judgement} onChange={(event) => set({ ...latest.current, judgement: event.target.value as ChallengeJudgement | '' })} aria-label="光性判断">
                  <option value="">请选择…</option>{JUDGEMENTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
            )}
            <button type="button" className="iu-button iu-button--primary" disabled={!canSaveChallenge(scene)} onClick={() => { setAutoRotate(false); onSave(latest.current); }} data-testid="detection-submit">保存记录</button>
          </fieldset>
          {after}
        </SimPanel>
      )}
      <ResetAllButton onReset={() => { setAutoRotate(false); onReset(); }} />
    </>
  );

  return (
    <div className="sim-polari-bench" data-testid="polariscope-detection-3d" data-step={steps[current]?.id ?? 'record'}>
      <SimShell sim={sim} screen={screen} onScreen={onScreen ?? (() => {})} hideScreens={embedded} play={play} panels={panels} />
    </div>
  );
}
