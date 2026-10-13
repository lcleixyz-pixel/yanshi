import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import RangeControl from '../../shared/RangeControl';
import PolariscopeScene from '../../polariscope3d/PolariscopeScene';
import EyepieceView, { type EyepieceContent } from '../../polariscope3d/EyepieceView';
import { ResetAllButton, SimChecks, SimPanel, SimReadout, SimShell } from '../SimShell';
import PolariscopeTaskCard from './PolariscopeTaskCard';
import type { SimScreenProps } from '../registry';
import { LEARN_LESSONS, LESSONS, PART_SHORT, PARTS, PARTS_BY_ID, PATH_STEPS } from '../../../domain/polariscopeCopy';
import {
  courseView, initialQuality, readLabScene, topicScene, enterStep, isCrossed, pendingStep, stepChecklist, LEARN_INITIAL, learnCoach, learnEvidence, lessonScene, readLearnScene, readTaskData, seePart,
  STEP_SCREEN, type LearnScene, type PolariscopeTaskData,
} from '../../../domain/polariscopeSim';
import { deriveTeachingOptics, STRUCTURE_PART_IDS, type PolariscopeStructureState, type StructurePartId, type StructureViewPreset, type TeachingLesson } from '../../../domain/polariscopeStructure';
import type { SimSession } from '../../../domain/simSession';
import '../../../styles/polariscope-explore.css';
import '../../../styles/sim-instrument.css';

const KEY_PARTS: readonly StructurePartId[] = ['polarizer', 'stage', 'analyzer'];
const VIEW_PRESETS: readonly { id: StructureViewPreset; label: string }[] = [
  { id: 'free', label: '自由观察' }, { id: '01-front', label: '正面' }, { id: '02-side', label: '侧面' }, { id: '03-top', label: '俯视' },
  { id: '04-three-quarter', label: '主视图' }, { id: '05-analyzer-close', label: '上环近景' }, { id: '06-stage-close', label: '物台近景' },
];
const BLOCKED: Record<'power-off' | 'disassembled' | 'isolated', string> = {
  'power-off': '电源关闭，当前没有出射光。', disassembled: '请先恢复装配，再观察光路与明暗。', isolated: '请显示整机，再观察完整光路。',
};
const mobileQuery = () => window.matchMedia('(max-width: 680px)').matches;

/**
 * 偏光镜 · 认识屏：部件、光路与偏振原理（原三维教学页 01–03 讲与课程前三步）。
 * 部件名称默认不显示，勾选后显示短名称；点部件只高亮并在面板里说明，不推近镜头。
 */
export default function PolariscopeLearnScreen({ sim, screen, onScreen, session, dispatch }: SimScreenProps) {
  const learn = readLearnScene(session.scenes.learn);
  const task = readTaskData(session.task.data);
  const view = courseView(task, screen);
  const structure = learn.structure;
  const lesson = structure.lesson;
  const optics = deriveTeachingOptics(structure);
  const crossed = isCrossed(structure);
  const halfWave = structure.principleExample === 'half-wave';
  const guided = task.mode !== null && STEP_SCREEN[view.step] === screen && !view.screenDone;
  const [quality, setQuality] = useState<'standard' | 'high'>(() => initialQuality(session.options, mobileQuery()));
  const [sceneStatus, setSceneStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fieldCanvas, setFieldCanvas] = useState<HTMLCanvasElement | null>(null);
  const [fieldVersion, setFieldVersion] = useState(0);
  const onFieldRendered = useCallback(() => setFieldVersion((value) => value + 1), []);

  // 连续拖动会在一次渲染前派发多次：在 ref 里先合并好最新场景，后一次改动不会覆盖前一次。
  const latest = useRef<SimSession>(session);
  latest.current = session;
  const setScene = (next: LearnScene) => {
    latest.current = { ...latest.current, scenes: { ...latest.current.scenes, learn: next } };
    dispatch({ type: 'patch-scene', screen, patch: next });
  };
  const currentScene = () => readLearnScene(latest.current.scenes.learn);
  const update = (patch: Partial<PolariscopeStructureState>) => { const scene = currentScene(); setScene({ ...scene, structure: { ...scene.structure, ...patch } }); };
  const setTask = (next: PolariscopeTaskData) => {
    latest.current = { ...latest.current, task: { ...latest.current.task, data: next as unknown as Record<string, unknown> } };
    dispatch({ type: 'task-patch', patch: next as unknown as Record<string, unknown> });
  };

  // 进入本屏的课程步骤时套该步的开场场景；同一步回到本屏不再重摆（换屏不清场景）。
  // 本屏刚做完一步时先停在结果上（pending），学员点「下一步」才套下一步的场景。
  const pending = guided ? pendingStep(view, learn.enteredStep) : null;
  const enterCurrent = () => { const scene = currentScene(); setScene({ ...enterStep(scene, view.step), enteredStep: view.step }); };
  useEffect(() => {
    if (!guided || learn.enteredStep === view.step || pending) return;
    enterCurrent();
  }, [guided, view.step, learn.enteredStep, pending]); // eslint-disable-line react-hooks/exhaustive-deps -- 只在步骤变化时套用
  // 场景里自然产生的完成证据：走到光路第几步、空载平行最亮与正交全暗。
  useEffect(() => {
    const current = readTaskData(latest.current.task.data);
    const next = learnEvidence(current, structure);
    if (next !== current) setTask(next);
  }, [structure.lesson, structure.pathStep, structure.principleExample, structure.analyzerAngle, structure.stageAngle, structure.power, structure.mode, structure.explosion, structure.isolatedPart, task.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectPart = (id: StructurePartId | null) => {
    const scene = currentScene();
    setScene({
      ...scene, viewPreset: 'free',
      structure: { ...scene.structure, selectedPart: id, isolatedPart: id === 'light' ? null : scene.structure.isolatedPart && id ? id : null, internalView: id === 'light' ? true : scene.structure.internalView },
    });
    if (id) { const current = readTaskData(latest.current.task.data); const next = seePart(current, id); if (next !== current) setTask(next); }
  };
  const changeLesson = (next: TeachingLesson) => setScene(lessonScene(currentScene(), next));
  const changeAngle = (part: 'analyzer' | 'stage', degrees: number) => {
    if (Number.isFinite(degrees)) update({ [part === 'analyzer' ? 'analyzerAngle' : 'stageAngle']: Math.max(0, Math.min(360, degrees)) });
  };
  const changeMode = (mode: PolariscopeStructureState['mode']) => {
    const scene = currentScene();
    setScene({ ...scene, viewPreset: 'free', resetViewKey: scene.resetViewKey + 1, structure: { ...scene.structure, mode, explosion: mode === 'explode' ? 0.7 : 0, isolatedPart: null } });
  };
  const changeExample = (example: PolariscopeStructureState['principleExample']) => update({ principleExample: example, ...(example === 'half-wave' ? { analyzerAngle: 90, stageAngle: 0 } : {}) });
  const resetView = () => { const scene = currentScene(); setScene({ ...scene, viewPreset: 'free', resetViewKey: scene.resetViewKey + 1, structure: { ...scene.structure, selectedPart: null, isolatedPart: null } }); };

  // 目镜视场：偏振原理讲与光路最后一步（沿光路观察）显示空载视场。
  const eyepiece = useMemo<EyepieceContent | null>(() => {
    if (lesson === 'principle') return { kind: 'field', map: null, backgroundTransmission: optics.relativeTransmission };
    if (lesson === 'path' && structure.pathStep === 4) return { kind: 'field', map: null };
    return null;
  }, [lesson, structure.pathStep, optics.relativeTransmission]);
  const sceneField = useMemo(() => ({ canvas: fieldCanvas, version: fieldVersion, show: !!eyepiece && lesson !== 'path', sampleGlow: 0 }), [fieldCanvas, fieldVersion, eyepiece, lesson]);
  const coach = task.mode === 'student' && guided && !pending ? learnCoach(view.step, task.progress, structure) : null;
  const labels = useMemo(() => ({
    text: PART_SHORT,
    show: learn.names ? STRUCTURE_PART_IDS : guided && view.step === 'parts' ? KEY_PARTS : [],
  }), [learn.names, guided, view.step]);
  const percent = Math.round(optics.relativeTransmission * 100);
  const blocked = optics.blockedReason ? BLOCKED[optics.blockedReason] : null;
  const selected = structure.selectedPart ? PARTS_BY_ID[structure.selectedPart] : null;
  const pathStep = PATH_STEPS[structure.pathStep];

  const play = (
    <>
      <section className="sim-stage" aria-label="偏光镜三维模型" data-testid="sim-polari-stage" data-lesson={lesson} data-status={sceneStatus}>
        <PolariscopeScene state={structure} quality={quality} resetViewKey={learn.resetViewKey} viewPreset={learn.viewPreset}
          onSelectPart={selectPart} onAngleChange={changeAngle} onPowerChange={(power) => update({ power })} onStatus={setSceneStatus}
          field={sceneField} coach={coach} focusOnSelect={false} labels={labels} />
        {sceneStatus === 'error' && <Link to="/demo/polariscope" className="sim-stage__fallback" data-testid="sim-polari-fallback-2d">3D 暂不可用：改用经典 2D 演示 →</Link>}
        {structure.isolatedPart && (
          <div className="sim-stage__isolation" data-testid="sim-polari-isolation">
            <span>单独查看 · {structure.isolatedPart === 'light' ? '内部光源与底座边界' : PARTS_BY_ID[structure.isolatedPart].shortName}</span>
            <button type="button" className="iu-button" onClick={() => update({ isolatedPart: null })}>显示整机</button>
          </div>
        )}
        <p className="sim-stage__hint">{structure.mode === 'structure' && !structure.isolatedPart ? '拖动空白旋转视角 · 拖动圆环旋转部件 · 点底座侧面按钮开关电源' : '拖动旋转视角 · 滚轮缩放'}</p>
      </section>
      {eyepiece && (
        <SimReadout title="目镜视场" meta="空载" placement="top-right" testId="sim-polari-field">
          <EyepieceView content={eyepiece} stageDeg={structure.stageAngle} analyzerDeg={structure.analyzerAngle} active={optics.active} label="目镜视场 · 空载" onRendered={onFieldRendered} onCanvas={setFieldCanvas} />
          {learn.values && <p className="sim-note" data-testid="sim-polari-transmission" data-value={optics.relativeTransmission}>{optics.active ? `相对透过率 ${percent}%（下片之后为 100%）` : blocked}</p>}
        </SimReadout>
      )}
      <PolariscopeTaskCard
        view={view} finished={pending ? { step: pending, items: stepChecklist(task, pending) } : null} onNext={enterCurrent} open={session.task.open} mode={task.mode} hasSkipped={task.hasSkipped} teacherUsed={session.task.teacherUsed}
        onOpen={(open) => dispatch({ type: 'task-open', open })}
        onChoose={(mode) => { dispatch({ type: 'task-patch', patch: { mode } }); if (mode === 'teacher') dispatch({ type: 'task-teacher' }); }}
        onRestart={() => { dispatch({ type: 'task-restart' }); setScene({ ...currentScene(), enteredStep: null }); }}
        onScreen={onScreen}
        onTopic={(id) => { dispatch({ type: 'patch-scene', screen: 'lab', patch: topicScene(readLabScene(latest.current.scenes.lab), id) }); onScreen('lab'); }}
      />
    </>
  );

  const panels = (
    <>
      <SimPanel title="讲解" testId="sim-panel-lesson">
        <div className="sim-seg" role="group" aria-label="讲解内容">
          {LEARN_LESSONS.map((id) => <button key={id} type="button" aria-pressed={lesson === id} onClick={() => changeLesson(id)} data-testid={`sim-polari-lesson-${id}`}>{LESSONS.find((item) => item.id === id)!.title}</button>)}
        </div>
      </SimPanel>
      {lesson === 'components' && (
        <SimPanel title="结构与部件" hint={`${PARTS.length} 个`} testId="sim-panel-parts">
          <div className="sim-seg" role="group" aria-label="查看方式">
            <button type="button" aria-pressed={structure.mode === 'structure'} onClick={() => changeMode('structure')} data-testid="sim-polari-mode-structure">整机</button>
            <button type="button" aria-pressed={structure.mode === 'explode'} onClick={() => changeMode('explode')} data-testid="sim-polari-mode-explode">拆解</button>
          </div>
          {structure.mode === 'explode' && <RangeControl label="拆解程度" min={0} max={1} step={0.01} value={structure.explosion} display={`${Math.round(structure.explosion * 100)}%`} ends={['装配', '展开']} onChange={(value) => update({ explosion: value })} testId="sim-polari-explosion" />}
          <div className="sim-parts">
            {PARTS.map((part) => <button key={part.id} type="button" aria-pressed={structure.selectedPart === part.id} onClick={() => selectPart(structure.selectedPart === part.id ? null : part.id)} data-testid={`sim-part-${part.id}`}>{part.shortName}</button>)}
          </div>
          <p className="sim-note" data-testid="sim-part-note">{selected ? <><strong>{selected.name}</strong>：{selected.description}</> : '点模型上的部件或上面的列表，查看作用。'}</p>
          <div className="sim-row">
            {selected && <button type="button" className="iu-button" aria-pressed={structure.isolatedPart === selected.id} onClick={() => update({ isolatedPart: structure.isolatedPart === selected.id ? null : selected.id, ...(selected.id === 'light' ? { internalView: true } : {}) })} data-testid="sim-polari-isolate">{structure.isolatedPart === selected.id ? '显示整机' : '单独查看'}</button>}
            <button type="button" className="iu-button" aria-pressed={structure.internalView} onClick={() => update({ internalView: !structure.internalView, isolatedPart: null })} data-testid="sim-polari-internal">{structure.internalView ? '恢复底座外壳' : '查看内部光源'}</button>
          </div>
        </SimPanel>
      )}
      {lesson === 'path' && (
        <SimPanel title="光路" hint={`${structure.pathStep + 1} / 5`} testId="sim-panel-path">
          <ol className="sim-path">
            {PATH_STEPS.map((step, index) => (
              <li key={step.title}><button type="button" aria-pressed={structure.pathStep === index} onClick={() => update({ pathStep: index })} data-testid={`sim-polari-path-${index}`}>{index < structure.pathStep ? '✓ ' : `${index + 1}. `}{step.short}</button></li>
            ))}
          </ol>
          <p className="sim-note" data-testid="sim-polari-path-note"><strong>{pathStep.title}</strong>：{pathStep.description}</p>
          <div className="sim-row">
            <button type="button" className="iu-button" disabled={structure.pathStep === 0} onClick={() => update({ pathStep: structure.pathStep - 1 })}>← 上一步</button>
            <button type="button" className="iu-button iu-button--primary" disabled={structure.pathStep === 4} onClick={() => update({ pathStep: structure.pathStep + 1 })} data-testid="sim-polari-path-next">下一步 →</button>
          </div>
        </SimPanel>
      )}
      {lesson === 'principle' && (
        <SimPanel title="示例" testId="sim-panel-principle">
          <div className="sim-seg" role="group" aria-label="原理示例">
            <button type="button" aria-pressed={!halfWave} onClick={() => changeExample('empty')} data-testid="sim-polari-example-empty">空载</button>
            <button type="button" aria-pressed={halfWave} onClick={() => changeExample('half-wave')} data-testid="sim-polari-example-half-wave">理想双折射</button>
          </div>
          <p className="sim-note">{halfWave
            ? crossed ? '保持两片正交，转动物台：一周四次亮、四次暗（理想半波片，单色；不是某种宝石的实测）。' : '检偏器未正交，明暗极值随它的角度移动。转回 90° 正交再看。'
            : '空载时转动上偏光片：两片平行最亮，正交消光；转动物台不影响明暗。'}</p>
        </SimPanel>
      )}
      <SimPanel title="仪器操作" testId="sim-panel-instrument">
        <div className="sim-row">
          <button type="button" role="switch" aria-checked={structure.power} aria-label="电源开关" className="iu-button" onClick={() => update({ power: !structure.power })} data-testid="sim-polari-power">{structure.power ? '电源已开' : '电源已关'}</button>
        </div>
        <RangeControl label="上偏光片角度" min={0} max={360} value={Math.round(structure.analyzerAngle)} display={`${Math.round(structure.analyzerAngle)}°`} valueText={`${Math.round(structure.analyzerAngle)} 度`} ends={['0°', '360°']} onChange={(value) => changeAngle('analyzer', value)} testId="sim-polari-analyzer" />
        {lesson !== 'components' && (
          <div className="sim-row" role="group" aria-label="上偏光片常用角度">
            {[{ value: 0, label: '0° 平行' }, { value: 45, label: '45° 斜交' }, { value: 90, label: '90° 正交' }].map((choice) => <button key={choice.value} type="button" className="iu-button" aria-pressed={Math.abs(structure.analyzerAngle - choice.value) < 0.5} onClick={() => changeAngle('analyzer', choice.value)} data-testid={`sim-polari-analyzer-${choice.value}`}>{choice.label}</button>)}
          </div>
        )}
        <RangeControl label="载物台角度" min={0} max={360} value={Math.round(structure.stageAngle)} display={`${Math.round(structure.stageAngle)}°`} valueText={`${Math.round(structure.stageAngle)} 度`} ends={['0°', '360°']} onChange={(value) => changeAngle('stage', value)} testId="sim-polari-stage-angle" />
        <p className="sim-note">下偏光片固定为 0°；只有载物台和上偏光片能转动。也可以在模型上直接拖动圆环。</p>
      </SimPanel>
      <SimPanel title="视角与显示" testId="sim-panel-display">
        <div className="sim-row">
          <button type="button" className="iu-button" onClick={resetView} data-testid="sim-polari-reset-view">恢复视角</button>
          <select className="sim-select" aria-label="观察视角" value={learn.viewPreset} onChange={(event) => { const scene = currentScene(); setScene({ ...scene, viewPreset: event.target.value as StructureViewPreset, structure: { ...scene.structure, selectedPart: null, isolatedPart: null } }); }}>
            {VIEW_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
          <select className="sim-select" aria-label="三维画质" value={quality} onChange={(event) => setQuality(event.target.value as 'standard' | 'high')}>
            <option value="high">精细画质</option><option value="standard">流畅画质</option>
          </select>
        </div>
        <SimChecks items={[
          { id: 'names', label: '显示名称', checked: learn.names },
          { id: 'values', label: '显示数值', checked: learn.values },
        ]} onChange={(id, checked) => setScene({ ...currentScene(), [id]: checked })} />
      </SimPanel>
      <details className="sim-sources">
        <summary>依据与适用范围</summary>
        <p>底座与支架为一体金属外壳；下偏光片固定，只有载物台与检偏器转动。光柱、方向线、振动短杆和理想薄片属于教学叠层，不代表空气中能看到的光束。参考原项目仪器形态，尺寸未实测校准。</p>
        <ul><li><a href={`${import.meta.env.BASE_URL}assets/3d/polariscope/references/index.html`} target="_blank" rel="noreferrer">公开参考资料</a></li></ul>
      </details>
      <ResetAllButton onReset={() => setScene({ ...LEARN_INITIAL, resetViewKey: learn.resetViewKey + 1 })} />
    </>
  );

  return <SimShell sim={sim} screen={screen} onScreen={onScreen} play={play} panels={panels} />;
}
