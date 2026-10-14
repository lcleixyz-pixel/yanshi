import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import RangeControl from '../../shared/RangeControl';
import { CourseQuestionCard } from '../../course/CourseParts';
import PolariscopeScene from '../../polariscope3d/PolariscopeScene';
import EyepieceView, { EYEPIECE_RESOLUTION, type EyepieceContent } from '../../polariscope3d/EyepieceView';
import RotationTrace from '../../polariscope3d/RotationTrace';
import { useStageRotation } from '../../polariscope3d/useStageRotation';
import { ResetAllButton, SimChecks, SimPanel, SimShell, SimStepBar } from '../SimShell';
import PolariscopeTaskCard from './PolariscopeTaskCard';
import type { SimScreenProps } from '../registry';
import {
  CATEGORY_LABEL, conoscopeExplanation, EXPECTED_PREDICTION, LAB_LESSONS, LESSONS, ORIENTATION_LABEL, PART_SHORT, PHENOMENA, type Observation,
} from '../../../domain/polariscopeCopy';
import {
  courseSteps, courseView, initialQuality, topicScene, isCrossed, isRecording, pendingStep, stepChecklist, labCoach, labEnterStep, labInitial, labLessonScene, patchLab, readLabScene, readTaskData, recordAnswer, recordReveal,
  STEP_SCREEN, type LabScene, type PolariscopeTaskData,
} from '../../../domain/polariscopeSim';
import { COURSE_QUESTIONS, isAnswerCorrect, ROTATE_TARGETS } from '../../../domain/polariscopeCourse';
import { buildSampleFieldMap, judgeObservation, meanSampleLuminance, parallelCheck, rotationCurve } from '../../../domain/eyepieceField';
import { coverageOf, markRotation, TRACE_STEPS } from '../../../domain/rotationCoverage';
import { FEATURED_SAMPLE_IDS, getPolariscopeProfile, POLARISCOPE_PROFILES, sampleCrystal } from '../../../domain/polariscopeSamples';
import { OBSERVATION_RULES } from '../../../domain/polariscopeRules';
import { visibleOpticAxes } from '../../../domain/polarizedLight';
import { deriveTeachingOptics, STRUCTURE_PART_IDS, type PolariscopeStructureState, type StructureViewPreset, type TeachingLesson } from '../../../domain/polariscopeStructure';
import type { SimSession } from '../../../domain/simSession';
import '../../../styles/polariscope-explore.css';
import '../../../styles/sim-instrument.css';

const CONOSCOPE_FEATURED = ['tourmaline', 'ruby', 'citrine', 'amethyst', 'zircon', 'peridot', 'topaz', 'tanzanite'] as const;
const ANISOTROPIC = POLARISCOPE_PROFILES.filter((profile) => profile.observation === 'anisotropic');
const VIEW_PRESETS: readonly { id: StructureViewPreset; label: string }[] = [
  { id: 'free', label: '自由观察' }, { id: '01-front', label: '正面' }, { id: '04-three-quarter', label: '主视图' }, { id: '06-stage-close', label: '物台近景' }, { id: '05-analyzer-close', label: '上环近景' },
];
const BLOCKED: Record<'power-off' | 'disassembled' | 'isolated', string> = {
  'power-off': '电源关闭，当前没有出射光。', disassembled: '请先恢复装配，再观察。', isolated: '请显示整机，再观察。',
};
const mobileQuery = () => window.matchMedia('(max-width: 680px)').matches;

/**
 * 偏光镜 · 实验屏：样品观察与干涉图（原三维教学页 04–05 讲与课程后三步）。
 * 先预测、再在正交下转满一周、最后揭晓；记录与揭晓规则沿用旧页（domain/polariscopeSim 的 patchLab）。
 */
export default function PolariscopeLabScreen({ sim, screen, onScreen, session, dispatch }: SimScreenProps) {
  const lab = readLabScene(session.scenes.lab);
  const task = readTaskData(session.task.data);
  const view = courseView(task, screen);
  const structure = lab.structure;
  const lesson = structure.lesson;
  const optics = deriveTeachingOptics(structure);
  const crossed = isCrossed(structure);
  const guided = task.mode !== null && STEP_SCREEN[view.step] === screen && !view.screenDone;
  const [quality, setQuality] = useState<'standard' | 'high'>(() => initialQuality(session.options, mobileQuery()));
  const [sceneStatus, setSceneStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fieldCanvas, setFieldCanvas] = useState<HTMLCanvasElement | null>(null);
  const [fieldVersion, setFieldVersion] = useState(0);
  const [obsOpen, setObsOpen] = useState(true);
  const desktop = useDesktop();
  const onFieldRendered = useCallback(() => setFieldVersion((value) => value + 1), []);

  // 自动转动每帧写一次物台角：在 ref 里先合并好最新场景，记录与转动不会互相覆盖（同认识屏）。
  const latest = useRef<SimSession>(session);
  latest.current = session;
  const currentScene = () => readLabScene(latest.current.scenes.lab);
  const setScene = (next: LabScene) => {
    latest.current = { ...latest.current, scenes: { ...latest.current.scenes, lab: next } };
    dispatch({ type: 'patch-scene', screen, patch: next });
  };
  const update = (patch: Partial<PolariscopeStructureState>) => setScene(patchLab(currentScene(), patch));
  const setTask = (change: (task: PolariscopeTaskData) => PolariscopeTaskData) => {
    const current = readTaskData(latest.current.task.data);
    const next = change(current);
    if (next === current) return;
    latest.current = { ...latest.current, task: { ...latest.current.task, data: next as unknown as Record<string, unknown> } };
    dispatch({ type: 'task-patch', patch: next as unknown as Record<string, unknown> });
  };

  // ── 样品与视场（与旧页同一条计算链）──
  const profile = getPolariscopeProfile(structure.sampleId)!;
  const strain = structure.strain ?? profile.defaultStrain;
  const settings = useMemo(() => ({ orientation: structure.orientation, strain, thicknessMm: structure.thicknessMm, brazilTwin: structure.brazilTwin }), [structure.orientation, strain, structure.thicknessMm, structure.brazilTwin]);
  const fieldMap = useMemo(() => buildSampleFieldMap(profile, settings, EYEPIECE_RESOLUTION), [profile, settings]);
  const curve = useMemo(() => rotationCurve(fieldMap, structure.analyzerAngle, TRACE_STEPS), [fieldMap, structure.analyzerAngle]);
  const brightness = meanSampleLuminance(fieldMap, structure.stageAngle, structure.analyzerAngle, 4);
  const crystal = useMemo(() => lesson === 'conoscope' ? sampleCrystal(profile, structure.orientation, structure.brazilTwin) : null, [lesson, profile, structure.orientation, structure.brazilTwin]);
  const figure = lesson === 'conoscope' && structure.conoscopeInserted && !!crystal;
  const eyepiece = useMemo<EyepieceContent>(() => {
    if (figure && crystal) {
      const wide = crystal.kind === 'biaxial' && structure.orientation === 'acute-bisectrix' && profile.opticAxialAngle
        ? Math.min(0.92, Math.max(0.42, Math.sin(profile.opticAxialAngle / 2 * Math.PI / 180) * 1.3)) : undefined;
      return { kind: 'conoscope', crystal, thicknessMm: structure.thicknessMm, tint: profile.bodyColor.map((v) => 0.35 + 0.65 * v) as [number, number, number], sinThetaMax: wide };
    }
    return { kind: 'field', map: fieldMap };
  }, [figure, crystal, structure.orientation, structure.thicknessMm, profile, fieldMap]);
  const observation = useMemo<Observation>(() => judgeObservation(profile, settings, fieldMap), [profile, settings, fieldMap]);
  const recording = isRecording(lab);
  const coverage = coverageOf(lab.visited);
  const wideField = eyepiece.kind === 'conoscope' && eyepiece.sinThetaMax !== undefined && eyepiece.sinThetaMax > 0.42;
  const conoscopeKind = !crystal ? null : crystal.kind === 'biaxial' ? 'biaxial' : profile.quartz ? 'quartz' : 'uniaxial';
  const blocked = optics.blockedReason ? BLOCKED[optics.blockedReason] : null;
  const conoscopeText = conoscopeExplanation(conoscopeKind, structure.orientation, figure, {
    twin: structure.brazilTwin, wideField, crossed,
    parallel: Math.min(optics.analyzerDirection % 180, 180 - optics.analyzerDirection % 180) < 0.5,
    blockedReason: blocked,
    visibleAxes: crystal ? visibleOpticAxes(crystal, eyepiece.kind === 'conoscope' ? eyepiece.sinThetaMax ?? 0.42 : 0.42) : 0,
  });
  const label = figure ? (wideField ? '目镜视场 · 扩大角域原理图' : '目镜视场 · 锥光干涉图') : `目镜视场 · ${profile.name}`;

  // 自动转一周（约 9 秒）：只借用转动，记录写在场景里（换屏回来覆盖率还在）。
  const { autoRotate, setAutoRotate } = useStageRotation(structure.stageAngle, false, (rotate) => {
    const scene = currentScene();
    setScene({ ...scene, structure: { ...scene.structure, stageAngle: rotate(scene.structure.stageAngle) } });
  });
  const previousAngle = useRef(structure.stageAngle);
  useEffect(() => {
    const from = previousAngle.current; previousAngle.current = structure.stageAngle;
    const scene = currentScene();
    if (!isRecording(scene)) return;
    const visited = markRotation(scene.visited, from, structure.stageAngle);
    if (visited !== scene.visited) setScene({ ...scene, visited: [...visited] });
  }, [structure.stageAngle]); // eslint-disable-line react-hooks/exhaustive-deps -- 只响应物台转动
  // 转满一周揭晓，并记入任务进度（换方向复核按揭晓的先后判断）。
  useEffect(() => {
    if (lab.prediction === null || lab.revealed || coverage < 1) return;
    setScene({ ...currentScene(), revealed: true });
    setTask((current) => recordReveal(current, structure, observation));
  }, [coverage, lab.prediction, lab.revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  // 进入本屏的课程步骤时套开场场景；同一步回到本屏不再重摆。
  // 本屏刚做完一步时先停在揭晓结果上（pending），学员点「下一步」才套下一步的场景。
  const pending = guided ? pendingStep(view, lab.enteredStep) : null;
  const enterCurrent = () => { setAutoRotate(false); setScene(labEnterStep(currentScene(), view.step)); };
  useEffect(() => {
    if (!guided || lab.enteredStep === view.step || pending) return;
    enterCurrent();
  }, [guided, view.step, lab.enteredStep, pending]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeLesson = (next: TeachingLesson) => { setAutoRotate(false); setScene(labLessonScene(currentScene(), next)); };
  const chooseSample = (id: string) => {
    setAutoRotate(false);
    update({ sampleId: id, orientation: lesson === 'conoscope' ? 'optic-axis' : 'general', strain: null, stageAngle: 0, conoscopeInserted: false, brazilTwin: false });
  };
  // 换方向必须先停下旧的自动转动，再改方向（否则旧转动的剩余转角会记进新方向）。
  const changeOrientation = (orientation: PolariscopeStructureState['orientation']) => { setAutoRotate(false); update({ orientation }); };
  const changeAngle = (part: 'analyzer' | 'stage', degrees: number) => {
    if (Number.isFinite(degrees)) update({ [part === 'analyzer' ? 'analyzerAngle' : 'stageAngle']: Math.max(0, Math.min(360, degrees)) });
  };
  const runAdr = () => {
    if (!optics.active) return;
    const result = parallelCheck(profile, settings, fieldMap);
    const scene = currentScene();
    const moved = result.verdict === 'strain' || result.verdict === 'double-refraction' ? patchLab(scene, { stageAngle: result.stageDeg, analyzerAngle: 0 }) : scene;
    setScene({ ...moved, adr: result });
  };

  const sceneField = useMemo(() => ({
    canvas: fieldCanvas, version: fieldVersion, show: true,
    transmission: figure ? 0.35 : brightness, sampleGlow: figure ? 0 : brightness,
  }), [fieldCanvas, fieldVersion, figure, brightness]);
  const coach = task.mode === 'student' && guided && !pending ? labCoach(view.step, lab, observation) : null;
  const labels = useMemo(() => ({ text: PART_SHORT, show: lab.names ? STRUCTURE_PART_IDS : [] }), [lab.names]);
  const reveal = OBSERVATION_RULES[observation];
  const match = lab.prediction === 'demo' ? '教师演示' : lab.prediction === EXPECTED_PREDICTION[observation] ? '与预测一致' : '与预测不同';
  const sampleChoices = lesson === 'conoscope' ? CONOSCOPE_FEATURED : FEATURED_SAMPLE_IDS;
  const moreChoices = lesson === 'conoscope' ? ANISOTROPIC : POLARISCOPE_PROFILES;
  const stepItems = guided ? view.items : [];

  const play = (
    <>
      <section className="sim-stage" aria-label="偏光镜三维模型" data-testid="sim-polari-stage" data-lesson={lesson} data-status={sceneStatus}
        data-sample={structure.sampleId} data-orientation={structure.orientation} data-revealed={lab.revealed} data-observation={lab.revealed ? observation : undefined}>
        <PolariscopeScene state={structure} quality={quality} resetViewKey={lab.resetViewKey} viewPreset={lab.viewPreset}
          onSelectPart={(id) => update({ selectedPart: id })} onAngleChange={changeAngle} onPowerChange={(power) => update({ power })} onStatus={setSceneStatus}
          field={sceneField} coach={coach} focusOnSelect={false} labels={labels} viewShift={desktop && obsOpen ? 0.24 : 0} />
        {sceneStatus === 'error' && <Link to="/demo/polariscope" className="sim-stage__fallback" data-testid="sim-polari-fallback-2d">3D 暂不可用：改用经典 2D 演示 →</Link>}
        <p className="sim-stage__hint">拖动样品或物台环旋转样品 · 拖动空白旋转视角</p>
      </section>
      {task.mode !== null && <SimStepBar steps={courseSteps(view, pending)} />}
      {/* 观察面板（三版本对比 P1a）：眼看目镜、手转载物台，预测—观察—解释紧挨目镜；仪器向右让位作定位。 */}
      <section className="sim-polari-obs" data-testid="sim-polari-field" data-open={obsOpen} data-guided={!!task.mode} aria-label="观察">
        <header className="sim-polari-obs__head">
          <strong>{lesson === 'conoscope' ? '干涉图观察' : '观察'}</strong><span>{profile.name}</span>
          <button type="button" aria-expanded={obsOpen} onClick={() => setObsOpen(!obsOpen)} data-testid="sim-polari-obs-toggle">{obsOpen ? '收起 ▾' : '展开 ▸'}</button>
        </header>
        <div className="sim-polari-obs__body" hidden={!obsOpen}>
          <div className="sim-polari-obs__eye">
            <span className="sim-polari-obs__role"><b>眼</b>目镜视场</span>
            <EyepieceView content={eyepiece} stageDeg={structure.stageAngle} analyzerDeg={structure.analyzerAngle} active={optics.active} label={label} onRendered={onFieldRendered} onCanvas={setFieldCanvas} />
          </div>
          {lesson === 'sample' ? (
            <div className="sim-polari-poe" data-testid="sim-polari-poe" data-phase={lab.revealed ? 'explain' : lab.prediction === null ? 'predict' : 'observe'}>
              {blocked ? <p className="sim-note" role="status">{blocked}</p>
                // 已揭晓的解释在平行复核（检偏器转到 0°）时也保留，便于对照。
                : lab.revealed ? <>
                    <span className="sim-polari-poe__step">③ 解释 · {match}</span>
                    <strong data-testid="sim-polari-reveal">{reveal.title}</strong>
                    <p className="sim-note">{reveal.text}</p>
                    {profile.observation === 'isotropic' && profile.depolarization > 0.1 && <p className="sim-note">这块样品半透明，内部散射让少量光通过，视场呈暗灰而不是全黑；判断看的是转动时有没有规律的明暗变化。</p>}
                    {!crossed && <p className="sim-note" role="status">现在不是正交：转回 90° 才能再记录一周。<button type="button" className="iu-button" onClick={() => changeAngle('analyzer', 90)} data-testid="sim-polari-cross">转到 90° 正交</button></p>}
                  </> : !crossed ? <p className="sim-note" role="status">上偏光片不在 90° 正交，背景本身就亮。<button type="button" className="iu-button" onClick={() => changeAngle('analyzer', 90)} data-testid="sim-polari-cross">转到 90° 正交</button></p>
                  : lab.prediction === null ? <>
                    <span className="sim-polari-poe__step">① 先预测：正交下转一周，样品会？</span>
                    <div className="sim-polari-choices">
                      {PHENOMENA.map((item) => <button key={item.id} type="button" onClick={() => setScene({ ...currentScene(), prediction: item.id })} data-testid={`sim-polari-predict-${item.id}`}>{item.label}</button>)}
                      <button type="button" onClick={() => setScene({ ...currentScene(), prediction: 'demo' })} data-testid="sim-polari-predict-demo">不预测，直接看</button>
                    </div>
                  </> : <>
                    <span className="sim-polari-poe__step">② 观察 · 已转过 {Math.round(coverage * 100)}%</span>
                    <p className="sim-note" data-testid="sim-polari-live">{!recording ? '暂未记录' : brightness < 0.04 ? '当前：暗位，继续转，看有没有变亮' : '当前：较亮，继续转，看会不会再变暗'}</p>
                    <p className="sim-note">眼睛看左边的视场，手在下面转载物台，转满一周后揭晓。</p>
                  </>}
              {!blocked && crossed && lab.prediction !== null && <RotationTrace curve={curve} visited={lab.visited} current={structure.stageAngle} reveal={lab.revealed} analyzerDeg={structure.analyzerAngle} />}
            </div>
          ) : (
            <div className="sim-polari-poe">
              <span className="sim-polari-poe__step">{figure ? '干涉球已放上' : '先在「样品」面板里放上干涉球'}</span>
              <p className="sim-note" data-testid="sim-polari-conoscope-note">{conoscopeText}</p>
            </div>
          )}
          <div className="sim-polari-obs__hand">
            <span className="sim-polari-obs__role"><b>手</b>转动载物台</span>
            <div className="sim-polari-obs__rotate">
              <button type="button" className="iu-button" onClick={() => changeAngle('stage', (structure.stageAngle + 345) % 360)} aria-label="载物台减 15 度" data-testid="sim-polari-stage-minus">− 15°</button>
              <RangeControl label="载物台角度" min={0} max={360} value={Math.round(structure.stageAngle)} display={`${Math.round(structure.stageAngle)}°`} valueText={`${Math.round(structure.stageAngle)} 度`} ends={['0°', '360°']} onChange={(value) => changeAngle('stage', value)} testId="sim-polari-stage-angle" />
              <button type="button" className="iu-button" onClick={() => changeAngle('stage', (structure.stageAngle + 15) % 360)} aria-label="载物台加 15 度" data-testid="sim-polari-stage-plus">+ 15°</button>
              <button type="button" className="iu-button iu-button--primary" aria-pressed={autoRotate} disabled={lesson === 'sample' && !recording && !autoRotate} onClick={() => setAutoRotate(!autoRotate)} data-testid="sim-polari-auto-rotate">{autoRotate ? '停止转动' : '自动转一周'}</button>
            </div>
            {lesson === 'sample' && lab.prediction === null && !blocked && crossed && <p className="sim-note">先选一个预测，转动才计入记录。</p>}
          </div>
          <dl className="sim-polari-obs__conditions" aria-label="当前条件">
            <div><dt>样品</dt><dd>{profile.name}</dd></div>
            <div><dt>偏光</dt><dd>{crossed ? '正交 ✓' : polarLabel(structure.analyzerAngle)}</dd></div>
            <div><dt>物台</dt><dd>{Math.round(structure.stageAngle)}°</dd></div>
            <div><dt>光源</dt><dd>{structure.power ? '已开' : '已关'}</dd></div>
          </dl>
        </div>
      </section>
      <PolariscopeTaskCard
        view={view} finished={pending ? { step: pending, items: stepChecklist(task, pending) } : null} onNext={enterCurrent} open={session.task.open} mode={task.mode} hasSkipped={task.hasSkipped} teacherUsed={session.task.teacherUsed}
        onOpen={(open) => dispatch({ type: 'task-open', open })}
        onChoose={(mode) => { dispatch({ type: 'task-patch', patch: { mode } }); if (mode === 'teacher') dispatch({ type: 'task-teacher' }); }}
        onRestart={() => { setAutoRotate(false); dispatch({ type: 'task-restart' }); setScene({ ...currentScene(), enteredStep: null }); }}
        onScreen={onScreen}
        onTopic={(id) => { setAutoRotate(false); setScene(topicScene(currentScene(), id)); }}
      >
        {view.step === 'rotate' && stepItems.some((item) => !item.done) && (
          <div className="sim-row" data-testid="sim-task-rotate">
            {ROTATE_TARGETS.filter((target) => stepItems.some((item) => item.sampleId === target.sampleId && !item.done) && structure.sampleId !== target.sampleId).map((target) => (
              <button key={target.sampleId} type="button" className="iu-button" onClick={() => chooseSample(target.sampleId)} data-testid={`sim-polari-pick-${target.sampleId}`}>换到{target.name}</button>
            ))}
          </div>
        )}
        {view.step === 'reorient' && stepItems.some((item) => item.reorient && !item.done) && structure.orientation === 'optic-axis' && lab.revealed && (
          <button type="button" className="iu-button iu-button--primary" onClick={() => changeOrientation('general')} data-testid="sim-polari-reorient">换个方向放置，再转一周</button>
        )}
        {view.step === 'explain' && COURSE_QUESTIONS.map((question, index) => (
          <CourseQuestionCard key={question.id} question={question} number={index + 1} solved={task.progress.correctQuestions.includes(question.id)} testId={`sim-polari-question-${question.id}`}
            onSubmit={(selected) => { if (isAnswerCorrect(question, selected)) setTask((current) => recordAnswer(current, question.id)); }} />
        ))}
      </PolariscopeTaskCard>
    </>
  );

  const panels = (
    <>
      <SimPanel title="讲解" testId="sim-panel-lesson">
        <div className="sim-seg" role="group" aria-label="讲解内容">
          {LAB_LESSONS.map((id) => <button key={id} type="button" aria-pressed={lesson === id} onClick={() => changeLesson(id)} data-testid={`sim-polari-lesson-${id}`}>{LESSONS.find((item) => item.id === id)!.title}</button>)}
        </div>
      </SimPanel>
      <SimPanel title="样品" hint={lab.revealed || lesson === 'conoscope' ? CATEGORY_LABEL[profile.observation] : '光性揭晓前不显示'} testId="sim-panel-sample">
        <div className="sim-parts">
          {sampleChoices.map((id) => <button key={id} type="button" aria-pressed={structure.sampleId === id} onClick={() => chooseSample(id)} data-testid={`sim-polari-sample-${id}`}>{getPolariscopeProfile(id)!.name}</button>)}
        </div>
        <select className="sim-select" aria-label="从样品库选择" value={structure.sampleId} onChange={(event) => chooseSample(event.target.value)} data-testid="sim-polari-sample-select">
          {moreChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {lesson === 'sample' && (
          <div className="sim-row">
            {profile.observation === 'anisotropic' && <button type="button" className="iu-button" aria-pressed={structure.orientation === 'optic-axis'} onClick={() => changeOrientation(structure.orientation === 'optic-axis' ? 'general' : 'optic-axis')} data-testid="sim-polari-orientation">{structure.orientation === 'optic-axis' ? '换个方向放置' : '沿光轴方向放置'}</button>}
            {profile.quartz && <button type="button" className="iu-button" aria-pressed={structure.brazilTwin} onClick={() => update({ brazilTwin: !structure.brazilTwin })} data-testid="sim-polari-twin">巴西律双晶示意</button>}
            {(profile.observation === 'isotropic' || profile.observation === 'anisotropic') && <button type="button" className="iu-button" onClick={runAdr} disabled={!optics.active} data-testid="sim-polari-adr">平行复核（区分 ADR）</button>}
          </div>
        )}
        {lesson === 'sample' && profile.observation === 'isotropic' && <RangeControl label="内部应变" min={0} max={100} value={Math.round(strain * 100)} display={strain > 0.05 ? '有' : '无'} ends={['无', '强']} onChange={(value) => update({ strain: value / 100 })} testId="sim-polari-strain" />}
        {lab.adr && <p className="sim-note" data-testid="sim-polari-adr-result" data-verdict={lab.adr.verdict}>{adrText(lab.adr)}</p>}
        {lesson === 'conoscope' && crystal && (
          <>
            <button type="button" className="iu-button iu-button--primary" aria-pressed={structure.conoscopeInserted} onClick={() => update({ conoscopeInserted: !structure.conoscopeInserted, analyzerAngle: 90 })} data-testid="sim-polari-conoscope">{structure.conoscopeInserted ? '取下干涉球' : '放上干涉球'}</button>
            <div className="sim-parts" role="group" aria-label="样品方向" data-testid="sim-polari-conoscope-orientation">
              {profile.orientations.map((item) => <button key={item} type="button" aria-pressed={structure.orientation === item} onClick={() => changeOrientation(item)}>{ORIENTATION_LABEL[item]}</button>)}
            </div>
            <RangeControl label="样品厚度" min={5} max={50} value={Math.round(structure.thicknessMm * 10)} display={`${structure.thicknessMm.toFixed(1)} mm`} ends={['0.5', '5 mm']} onChange={(value) => update({ thicknessMm: value / 10 })} testId="sim-polari-thickness" />
            {profile.quartz && <button type="button" className="iu-button" aria-pressed={structure.brazilTwin} onClick={() => update({ brazilTwin: !structure.brazilTwin })}>巴西律双晶示意</button>}
            <p className="sim-note">厚度越大、双折射率越高，色环越多越密（本样品双折射率 {profile.birefringence.toFixed(3)}）。</p>
          </>
        )}
        {lesson === 'conoscope' && !crystal && <p className="sim-note" role="status">{profile.name}是{CATEGORY_LABEL[profile.observation]}，不产生干涉图。请选择非均质单晶。</p>}
      </SimPanel>
      <SimPanel title="仪器操作" testId="sim-panel-instrument">
        <div className="sim-row">
          <button type="button" role="switch" aria-checked={structure.power} aria-label="电源开关" className="iu-button" onClick={() => update({ power: !structure.power })} data-testid="sim-polari-power">{structure.power ? '电源已开' : '电源已关'}</button>
        </div>
        <RangeControl label="上偏光片角度" min={0} max={360} value={Math.round(structure.analyzerAngle)} display={`${Math.round(structure.analyzerAngle)}°`} valueText={`${Math.round(structure.analyzerAngle)} 度`} ends={['0°', '360°']} onChange={(value) => changeAngle('analyzer', value)} testId="sim-polari-analyzer" />
        <div className="sim-row" role="group" aria-label="上偏光片常用角度">
          {[{ value: 0, label: '0° 平行' }, { value: 45, label: '45° 斜交' }, { value: 90, label: '90° 正交' }].map((choice) => <button key={choice.value} type="button" className="iu-button" aria-pressed={Math.abs(structure.analyzerAngle - choice.value) < 0.5} onClick={() => changeAngle('analyzer', choice.value)} data-testid={`sim-polari-analyzer-${choice.value}`}>{choice.label}</button>)}
        </div>
        <p className="sim-note">载物台在「观察」面板的「手」一栏转动，也可以直接拖模型上的物台环。</p>
      </SimPanel>
      <SimPanel title="视角与显示" testId="sim-panel-display">
        <div className="sim-row">
          <button type="button" className="iu-button" onClick={() => { const scene = currentScene(); setScene({ ...scene, viewPreset: 'free', resetViewKey: scene.resetViewKey + 1 }); }}>恢复视角</button>
          <select className="sim-select" aria-label="观察视角" value={lab.viewPreset} onChange={(event) => setScene({ ...currentScene(), viewPreset: event.target.value as StructureViewPreset })}>
            {VIEW_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
          <select className="sim-select" aria-label="三维画质" value={quality} onChange={(event) => setQuality(event.target.value as 'standard' | 'high')}>
            <option value="high">精细画质</option><option value="standard">流畅画质</option>
          </select>
        </div>
        <SimChecks items={[{ id: 'names', label: '显示名称', checked: lab.names }]} onChange={(_, checked) => setScene({ ...currentScene(), names: checked })} />
      </SimPanel>
      <details className="sim-sources">
        <summary>依据与适用范围</summary>
        <p>目镜视场与干涉图按晶体光学实时计算（理想平行板，忽略刻面折射、吸收与色散细节；体色、2V 与厚度为示意取值），用于建立现象与原理的对应，不能作为具体宝石的鉴定或实测结果。</p>
        <ul><li><a href={`${import.meta.env.BASE_URL}assets/3d/polariscope/references/index.html`} target="_blank" rel="noreferrer">公开参考资料</a></li></ul>
      </details>
      <ResetAllButton onReset={() => { setAutoRotate(false); setScene({ ...labInitial(), resetViewKey: lab.resetViewKey + 1 }); }} />
    </>
  );

  return <SimShell sim={sim} screen={screen} onScreen={onScreen} play={play} panels={panels} />;
}

function adrText(result: NonNullable<LabScene['adr']>) {
  if (result.verdict === 'along-axis') return '当前为沿光轴观察，平行复核不适用。水晶仍可能因旋光呈现颜色；请换个方向放置后复查。';
  if (result.verdict === 'dark-no-check') return `正交下最亮约 ${Math.round(result.crossed * 100)}%${result.scatter > 0.03 ? '，其中包含散射背景' : ''}，明暗反应较弱，本次平行复核无法可靠确认是否存在应变双折射。请换个方向放置后复查。`;
  return `先转到最亮位置（正交亮度 ${Math.round(result.crossed * 100)}%），再把检偏器转到平行：${Math.round(result.parallel * 100)}%。${result.verdict === 'strain' ? '明显变亮 → 应变造成的异常双折射（本质是均质体）。' : '没有明显变亮 → 真正的双折射。'}`;
}

/** 检偏器相对下偏光片的状态（条件条用）。 */
function polarLabel(angle: number) {
  const a = ((angle % 180) + 180) % 180;
  return a < 0.5 || a > 179.5 ? '平行' : `斜交 ${Math.round(angle)}°`;
}

/** 与 sim-shell.css 的手机断点对应：桌面上仪器右移给观察面板让位。 */
function useDesktop() {
  const query = '(min-width: 681px)';
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const change = () => setMatches(list.matches);
    list.addEventListener('change', change);
    return () => list.removeEventListener('change', change);
  }, []);
  return matches;
}
