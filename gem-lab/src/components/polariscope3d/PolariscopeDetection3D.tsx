import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../shared/Header';
import PolariscopeScene from './PolariscopeScene';
import EyepieceView, { EYEPIECE_RESOLUTION, type EyepieceContent } from './EyepieceView';
import RotationTrace from './RotationTrace';
import { useStageRotation } from './useStageRotation';
import { createInitialStructureState, deriveTeachingOptics, type PolariscopeStructureState } from '../../domain/polariscopeStructure';
import { buildSampleFieldMap, meanSampleLuminance, rotationCurve } from '../../domain/eyepieceField';
import { getPolariscopeProfile } from '../../domain/polariscopeSamples';
import { REACTION_CHECK_LABEL } from '../../domain/polariscopeRules';
import { TRACE_STEPS } from '../../domain/rotationCoverage';
import { useDetection, type PolariscopeData } from '../../store/detectionStore';
import { useProgress } from '../../store/progressStore';
import '../../styles/polariscope-explore.css';

type Reaction = 'four-bright-four-dark' | 'all-dark' | 'all-bright' | 'not-applicable';
type Judgement = NonNullable<PolariscopeData['optical']>;

const REACTIONS: { id: Reaction; label: string }[] = [
  { id: 'four-bright-four-dark', label: REACTION_CHECK_LABEL.fourBright },
  { id: 'all-dark', label: REACTION_CHECK_LABEL.allDark },
  { id: 'all-bright', label: REACTION_CHECK_LABEL.allBright },
  { id: 'not-applicable', label: '几乎不透光（透射法不适用）' },
];
const JUDGEMENTS: { id: Judgement; label: string }[] = [
  { id: 'isotropic', label: '均质体' }, { id: 'anisotropic', label: '非均质体（一轴 / 二轴晶）' }, { id: 'aggregate', label: '多晶质集合体' },
];
const CROSSED_TOLERANCE_DEG = .5;

/**
 * 偏光镜 3D 检测模式：未知样品、无讲解与揭晓，步骤按顺序解锁。
 * 完成后写入与 2D 检测模式相同的检测记录（setPolariscope + markInstrument + 检测完成），检测流程与计分不变。
 */
export default function PolariscopeDetection3D({ sampleId, onDetectionComplete, onUse2D }: {
  sampleId: string;
  onDetectionComplete?: () => void;
  /** 3D 无法加载或用户主动选择时改用 2D 检测模式。 */
  onUse2D: () => void;
}) {
  const profile = getPolariscopeProfile(sampleId)!;
  const [state, setState] = useState<PolariscopeStructureState>(() => createInitialStructureState({ lesson: 'components', power: false, analyzerAngle: 0, showAnnotations: false, sampleId, orientation: 'general' }));
  const [sceneStatus, setSceneStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [quality, setQuality] = useState<'standard' | 'high'>('high');
  const [fieldCanvas, setFieldCanvas] = useState<HTMLCanvasElement | null>(null);
  const [fieldVersion, setFieldVersion] = useState(0);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [judgement, setJudgement] = useState<Judgement | ''>('');
  const setPolariscope = useDetection((store) => store.setPolariscope);
  const markInstrument = useDetection((store) => store.markInstrument);
  const markDemoComplete = useProgress((store) => store.markDemoComplete);

  const update = (patch: Partial<PolariscopeStructureState>) => setState((previous) => ({ ...previous, ...patch }));
  const optics = deriveTeachingOptics(state);
  const crossed = optics.active && Math.abs((optics.analyzerDirection % 180) - 90) < CROSSED_TOLERANCE_DEG;
  const placed = state.lesson === 'sample';
  const recording = placed && crossed;
  const { visited, coverage, resetVisited, autoRotate, setAutoRotate } = useStageRotation(state.stageAngle, recording, (rotate) => setState((previous) => ({ ...previous, stageAngle: rotate(previous.stageAngle) })));
  const turned = coverage >= 1;
  // 检偏器一动，之前的记录不再对应同一观察条件：与 3D 课程一致，重新记录。
  useEffect(() => { resetVisited(); }, [state.analyzerAngle, resetVisited]);

  const strain = state.strain ?? profile.defaultStrain;
  const settings = useMemo(() => ({ orientation: state.orientation, strain, thicknessMm: state.thicknessMm, brazilTwin: false }), [state.orientation, strain, state.thicknessMm]);
  const fieldMap = useMemo(() => placed ? buildSampleFieldMap(profile, settings, EYEPIECE_RESOLUTION) : null, [placed, profile, settings]);
  const curve = useMemo(() => fieldMap ? rotationCurve(fieldMap, state.analyzerAngle, TRACE_STEPS) : [], [fieldMap, state.analyzerAngle]);
  const brightness = fieldMap ? meanSampleLuminance(fieldMap, state.stageAngle, state.analyzerAngle, 4) : 0;
  const eyepiece = useMemo<EyepieceContent>(() => ({ kind: 'field', map: fieldMap }), [fieldMap]);
  const onRendered = useCallback(() => setFieldVersion((value) => value + 1), []);
  const field = useMemo(() => ({ canvas: fieldCanvas, version: fieldVersion, show: true, transmission: placed ? brightness : undefined, sampleGlow: placed ? brightness : 0 }), [fieldCanvas, fieldVersion, placed, brightness]);

  const steps = [
    { id: 'power', label: '打开电源', done: state.power },
    { id: 'crossed', label: '把上偏光片转到正交（视场最暗）', done: crossed || placed },
    { id: 'place', label: '放置样品', done: placed },
    { id: 'rotate', label: '在正交下转动载物台一整周', done: turned },
    { id: 'record', label: '记录现象并判断光性', done: false },
  ];
  const current = steps.findIndex((step) => !step.done);
  const canRecord = placed && turned && reaction !== null && (reaction === 'not-applicable' || judgement !== '');

  const changeAngle = (part: 'analyzer' | 'stage', degrees: number) => {
    if (!Number.isFinite(degrees)) return;
    update({ [part === 'analyzer' ? 'analyzerAngle' : 'stageAngle']: Math.max(0, Math.min(360, degrees)) });
  };
  const placeSample = () => { if (crossed) { update({ lesson: 'sample', stageAngle: 0 }); resetVisited(); } };
  const reorient = () => { setAutoRotate(false); update({ orientation: state.orientation === 'general' ? 'optic-axis' : 'general' }); resetVisited(); };
  const submit = () => {
    if (!canRecord) return;
    const notApplicable = reaction === 'not-applicable';
    setPolariscope({
      rotation: state.stageAngle,
      phenomenon: notApplicable ? null : reaction,
      optical: notApplicable ? null : judgement || null,
      notes: notApplicable ? '几乎不透光，标准偏光镜透射法不适用' : '',
    });
    markInstrument('polariscope');
    markDemoComplete({ instrumentId: 'polariscope', mode: 'detection', completedAt: Date.now() });
    onDetectionComplete?.();
  };

  return (
    <div className="flex min-h-screen flex-col bg-brand-50/40 pol-detection" data-testid="polariscope-detection-3d" data-step={steps[current]?.id ?? 'record'}>
      <Header title="偏光镜检测" subtitle="检测模式 · 未知样品" right={<button className="btn-ghost text-xs" onClick={onUse2D} data-testid="detection-use-2d">改用 2D 版本</button>} />
      <div className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
        <section className="pol-explore relative min-h-[560px] overflow-hidden rounded-2xl ring-1 ring-line" aria-label="偏光镜三维检测台" style={{ minHeight: 'min(720px, calc(100dvh - 120px))' }}>
          <div className="pol-explore__viewport" style={{ position: 'absolute', inset: 0, border: 0 }}>
            <div className="pol-explore__scene">
              <PolariscopeScene state={state} quality={quality} resetViewKey={0} viewPreset="free" onSelectPart={() => {}} onAngleChange={changeAngle} onPowerChange={(power) => update({ power })} onStatus={setSceneStatus} field={field} focusOnSelect={false} />
            </div>
            <div className="pol-explore__eyepiece-dock" style={{ top: 20 }}>
              <EyepieceView content={eyepiece} stageDeg={state.stageAngle} analyzerDeg={state.analyzerAngle} active={optics.active} label={placed ? '目镜视场 · 未知样品' : '目镜视场 · 空载'} onRendered={onRendered} onCanvas={setFieldCanvas} />
            </div>
            {sceneStatus === 'error' && <button className="pol-explore__fallback-2d" onClick={onUse2D} data-testid="detection-fallback-2d">3D 暂不可用：改用 2D 检测 →</button>}
          </div>
        </section>
        <aside className="card space-y-5 self-start p-5" aria-label="检测步骤与记录">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-4">DETECTION · 按步骤完成</div>
            <ol className="mt-3 space-y-2" data-testid="detection-steps">{steps.map((step, index) => (
              <li key={step.id} data-done={step.done} aria-current={index === current ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${index === current ? 'bg-violet-50 text-violet-900 ring-1 ring-violet-200' : step.done ? 'text-success' : 'text-ink-4'}`}>
                <span className="font-mono text-xs">{step.done ? '✓' : index + 1}</span>{step.label}
              </li>
            ))}</ol>
          </div>
          <div className="space-y-3 text-sm">
            <label className="flex items-center justify-between gap-3"><span className="text-ink-2">三维画质</span>
              <select value={quality} onChange={(event) => setQuality(event.target.value as 'standard' | 'high')} aria-label="三维画质" className="rounded-lg border border-line-2 bg-white px-3 py-2">
                <option value="high">精细画质</option><option value="standard">流畅画质</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3"><span className="text-ink-2">电源</span>
              <button role="switch" aria-checked={state.power} aria-label="电源开关" onClick={() => update({ power: !state.power })} className={`rounded-full px-3 py-1 text-xs ${state.power ? 'bg-polariscope text-white' : 'bg-line text-ink-3'}`}>{state.power ? '已开启' : '已关闭'}</button>
            </label>
            <label className="block"><span className="flex justify-between text-ink-2"><span>上偏光片角度</span><output>{Math.round(state.analyzerAngle)}°</output></span>
              <input type="range" min="0" max="360" step="1" value={state.analyzerAngle} onChange={(event) => changeAngle('analyzer', Number(event.target.value))} aria-label="上偏光片角度" className="w-full accent-violet-600" /></label>
            <button className="btn-primary w-full" style={{ background: '#7c3aed' }} disabled={!crossed || placed} onClick={placeSample} data-testid="detection-place-sample">{placed ? '样品已放上载物台' : '放置样品'}</button>
            {placed && <>
              <label className="block"><span className="flex justify-between text-ink-2"><span>载物台角度</span><output>{Math.round(state.stageAngle)}°</output></span>
                <input type="range" min="0" max="360" step="1" value={state.stageAngle} onChange={(event) => changeAngle('stage', Number(event.target.value))} aria-label="载物台角度" className="w-full accent-violet-600" /></label>
              <RotationTrace curve={curve} visited={visited} current={state.stageAngle} reveal={false} analyzerDeg={state.analyzerAngle} />
              {!crossed && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">上偏光片不在正交位置，此时转动不计入记录。</p>}
              <div className="flex gap-2">
                <button className="btn-ghost flex-1 text-xs" onClick={() => setAutoRotate(!autoRotate)} disabled={!recording} data-testid="detection-auto-rotate">{autoRotate ? '停止转动' : '自动转动一周'}</button>
                <button className="btn-ghost flex-1 text-xs" onClick={reorient} data-testid="detection-reorient">换个方向放置</button>
              </div>
            </>}
          </div>
          {placed && <fieldset className="space-y-2 border-t border-line pt-4" disabled={!turned} data-testid="detection-record">
            <legend className="text-sm font-semibold text-ink">记录{turned ? '' : '（转满一周后可记录）'}</legend>
            {REACTIONS.map((item) => <label key={item.id} className="flex items-center gap-2 text-sm text-ink-2"><input type="radio" name="reaction" checked={reaction === item.id} onChange={() => setReaction(item.id)} className="accent-violet-600" />{item.label}</label>)}
            {reaction !== 'not-applicable' && <label className="block pt-1 text-sm text-ink-2">光性判断
              <select value={judgement} onChange={(event) => setJudgement(event.target.value as Judgement | '')} className="mt-1 w-full rounded-lg border border-line-2 bg-white px-3 py-2" aria-label="光性判断">
                <option value="">请选择…</option>{JUDGEMENTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select></label>}
            <button className="btn-primary mt-2 w-full" style={{ background: '#7c3aed' }} disabled={!canRecord} onClick={submit} data-testid="detection-submit">保存记录</button>
          </fieldset>}
        </aside>
      </div>
    </div>
  );
}
