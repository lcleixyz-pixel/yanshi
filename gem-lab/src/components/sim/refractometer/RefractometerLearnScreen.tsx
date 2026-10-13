import { useEffect, useRef, useState } from 'react';
import RangeControl from '../../shared/RangeControl';
import { createOpticsViewer, type OpticsSnapshot, type OpticsViewer } from '../../optics3d/opticsViewer.js';
import { opticsAssetBase } from '../../optics3d/opticsInstruments';
import { ResetAllButton, SimChecks, SimPanel, SimReadout, SimShell } from '../SimShell';
import RefractometerTaskCard from './RefractometerTaskCard';
import type { SimScreenProps } from '../registry';
import { KEY_PARTS, PATH_STAGES } from '../../../domain/refractometerCourse';
import {
  applyOperation, COURSE_SAMPLE, courseView, EMPTY_SCENE_FIELDS, LEARN_INITIAL, labInitial, readLearnScene, readTaskData,
  SAMPLE_CASES_PATH, type LearnScene, type SimOperation,
} from '../../../domain/refractometerSim';
import { PART_SHORT } from '../../../domain/refractometerCopy';
import '../../../styles/sim-instrument.css';

/**
 * 折射仪 · 认识屏：结构与光路（原三维自由探索页与课程的「认识部件」「跟随光路」两步）。
 * 部件名称默认不显示，勾选后显示短名称；点部件只高亮并在面板里说明，不推近镜头。
 */
export default function RefractometerLearnScreen({ sim, screen, onScreen, session, dispatch }: SimScreenProps) {
  const learn = readLearnScene(session.scenes.learn);
  const task = readTaskData(session.task.data);
  const view = courseView(task, { ...EMPTY_SCENE_FIELDS, explode: learn.explode }, screen);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpticsViewer | null>(null);
  const [snapshot, setSnapshot] = useState<OpticsSnapshot>({ status: 'loading' });
  // 载入失败时原地重试：换一次 attempt 就重新创建查看器，不刷新整页（同偏光镜与分光镜）。
  const [attempt, setAttempt] = useState(0);
  const ready = snapshot.status === 'ready' ? snapshot : null;

  const patch = (next: Partial<LearnScene>) => dispatch({ type: 'patch-scene', screen, patch: next });
  // 认识屏的操作只动任务证据（看部件、跟光路、答题）；用 ref 取最新会话，连点两下不会丢进度。
  const latest = useRef(session);
  latest.current = session;
  const operate = (op: SimOperation) => {
    const current = latest.current;
    const next = applyOperation(readTaskData(current.task.data), labInitial(), COURSE_SAMPLE, op);
    dispatch({ type: 'task-patch', patch: next.task as unknown as Record<string, unknown> });
  };

  useEffect(() => {
    if (!hostRef.current) return;
    setSnapshot({ status: 'loading' });
    const viewer = createOpticsViewer({
      container: hostRef.current, instrument: 'refractometer', assetBase: opticsAssetBase('refractometer'),
      extraCasesUrl: `${import.meta.env.BASE_URL}${SAMPLE_CASES_PATH}`, onChange: setSnapshot,
    });
    viewerRef.current = viewer;
    return () => { viewer.dispose(); viewerRef.current = null; };
  }, [attempt]);

  useEffect(() => { viewerRef.current?.setRays(learn.rays); }, [learn.rays]);
  useEffect(() => { viewerRef.current?.setExplode(learn.explode); }, [learn.explode]);
  useEffect(() => { if (snapshot.status === 'ready') viewerRef.current?.setView(learn.view); }, [learn.view, snapshot.status]);
  // 跟随光路一步：预置良好接触的教学示例（与课程页一致）。
  useEffect(() => { if (snapshot.status === 'ready' && view.state.step === 'path') viewerRef.current?.setCase(`sample-${COURSE_SAMPLE.characteristics.refractiveIndex}`); }, [snapshot.status, view.state.step]);

  // 选中模型上的部件即记为已看（学员模式的「点这里」据此指向下一个未看的部件）。
  const selectedId = ready?.state.selectedId ?? null;
  const step = view.state.step;
  const seen = view.state.partsSeen;
  useEffect(() => {
    if (!ready || !selectedId) return;
    if (step !== 'parts' || seen.includes(selectedId)) return;
    operate({ type: 'see-part', id: selectedId });
  }, [selectedId, ready?.status, step]);

  // 热点：认识部件一步给六个关键部件并给出「点这里」；勾「显示名称」时给全部部件的短名称。
  const partIds = ready ? ready.parts.map((part) => part.id).join(' ') : '';
  useEffect(() => {
    if (!partIds) return;
    const ids = partIds.split(' ');
    const keyIds = KEY_PARTS.map((part) => part.id).filter((id) => ids.includes(id));
    const guided = task.mode === 'student' && step === 'parts';
    const coach = guided ? keyIds.find((id) => !seen.includes(id)) ?? null : null;
    if (learn.names) {
      viewerRef.current?.setHotspots({ ids, labels: PART_SHORT, labelMode: 'name', done: seen, selected: selectedId, coach });
      return;
    }
    viewerRef.current?.setHotspots(guided ? { ids: keyIds, done: seen, selected: selectedId, coach } : null);
  }, [partIds, learn.names, task.mode, step, seen.join(' '), selectedId]);

  const selected = ready?.selected ?? null;
  const coursePart = KEY_PARTS.find((part) => part.id === selected?.id) ?? null;
  const play = (
    <>
      <section className="sim-stage" aria-label="折射仪三维模型与光路" data-testid="sim-refracto-stage">
        <div className="sim-stage__host" ref={hostRef} />
        {snapshot.status === 'loading' && <p className="sim-stage__note" role="status"><i />正在载入模型与光路…</p>}
        {snapshot.status === 'error' && (
          <div className="sim-stage__error" role="alert">
            <img src={`${opticsAssetBase('refractometer')}poster.png`} alt="折射仪静态预览" />
            <p>三维模型载入失败：{snapshot.error}。可重新载入，或到实验屏继续练习。</p>
            <button type="button" className="iu-button" onClick={() => setAttempt((n) => n + 1)} data-testid="sim-refracto-retry">重新载入</button>
          </div>
        )}
        <p className="sim-stage__hint">拖动旋转 · 滚轮缩放 · 比例及内部处方未标定</p>
      </section>
      <SimReadout title="光路示例" meta="原理计算" testId="sim-refracto-case">
        <select className="sim-select" aria-label="光路示例" disabled={!ready} value={ready?.state.caseId ?? ''} onChange={(event) => viewerRef.current?.setCase(event.target.value)} data-testid="sim-refracto-case-select">
          {ready?.cases.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <p className="sim-note">{ready?.currentCase.description}</p>
        {learn.values && !!ready?.currentCase.readout.length && (
          <dl className="sim-readout-list" data-testid="sim-refracto-readout">
            {ready.currentCase.readout.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
          </dl>
        )}
        <div className="sim-legend">{ready?.currentCase.legend.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}</div>
        <p className="sim-note" data-testid="sim-refracto-condition">{ready?.currentCase.conditionNote}</p>
      </SimReadout>
      <RefractometerTaskCard
        view={view} open={session.task.open} mode={task.mode} hasSkipped={task.hasSkipped} teacherUsed={session.task.teacherUsed}
        onOpen={(open) => dispatch({ type: 'task-open', open })}
        onChoose={(mode) => { dispatch({ type: 'task-patch', patch: { mode } }); if (mode === 'teacher') dispatch({ type: 'task-teacher' }); }}
        onAnswer={(id, option) => operate({ type: 'answer', id, option })}
        onRestart={() => dispatch({ type: 'task-restart' })}
        onScreen={onScreen}
      >
        {step === 'path' && (
          <div className="sim-task__step" data-testid="sim-task-path">
            <ol className="sim-path">
              {PATH_STAGES.map((stage, index) => (
                <li key={stage.part}>
                  <button type="button" aria-pressed={view.state.pathSeen.includes(index)} disabled={!ready} data-testid={`sim-refracto-path-${index}`}
                    onClick={() => { viewerRef.current?.select(stage.part, false); operate({ type: 'see-stage', index }); }}>
                    {view.state.pathSeen.includes(index) ? '✓ ' : `${index + 1}. `}{stage.text}
                  </button>
                </li>
              ))}
            </ol>
            <p className="sim-note">这些线为理想单色代表路径；真实透镜面形、像差和仪器标定未模拟。</p>
          </div>
        )}
      </RefractometerTaskCard>
    </>
  );

  const panels = (
    <>
      <SimPanel title="视图" testId="sim-panel-view">
        <div className="sim-row">
          <button type="button" className="iu-button" aria-pressed={learn.view === 'whole'} disabled={!ready} onClick={() => { viewerRef.current?.setView('whole'); patch({ view: 'whole' }); }}>整机结构</button>
          <button type="button" className="iu-button" aria-pressed={learn.view === 'optics'} disabled={!ready} onClick={() => { viewerRef.current?.setView('optics'); patch({ view: 'optics', rays: true }); }}>内部光路</button>
          <button type="button" className="iu-button" disabled={!ready} onClick={() => viewerRef.current?.fit()}>完整视野</button>
        </div>
      </SimPanel>
      <SimPanel title="结构与部件" hint={ready ? `${ready.parts.length} 个` : undefined} testId="sim-panel-parts">
        <fieldset className="sim-fieldset" disabled={!ready}>
          <RangeControl label="连续拆解" min={0} max={100} value={Math.round(learn.explode * 100)} display={`${Math.round(learn.explode * 100)}%`} ends={['装配', '拆开']} onChange={(value) => { viewerRef.current?.setExplode(value / 100); patch({ explode: value / 100 }); }} />
        </fieldset>
        <div className="sim-parts">
          {ready?.parts.map((part) => <button key={part.id} type="button" aria-pressed={selected?.id === part.id} onClick={() => viewerRef.current?.select(part.id, false)} data-testid={`sim-part-${part.id}`}>{PART_SHORT[part.id] ?? part.label}</button>)}
        </div>
        <p className="sim-note" data-testid="sim-part-note">{selected ? <><strong>{coursePart?.label ?? selected.label}</strong>：{coursePart?.note ?? selected.note}</> : '点模型上的部件或上面的列表，查看作用。'}</p>
      </SimPanel>
      <SimPanel title="显示" testId="sim-panel-display">
        <SimChecks items={[
          { id: 'rays', label: '显示光路', checked: learn.rays },
          { id: 'names', label: '显示名称', checked: learn.names },
          { id: 'values', label: '显示数值', checked: learn.values },
        ]} onChange={(id, checked) => patch(id === 'rays' ? { rays: checked } : id === 'names' ? { names: checked } : { values: checked })} />
      </SimPanel>
      {ready && (
        <details className="sim-sources">
          <summary>依据与适用范围</summary>
          <p>{ready.boundary}</p>
          <ul>{ready.sources.map((source) => <li key={source.title}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : source.title}{source.note ? ` · ${source.note}` : ''}</li>)}</ul>
        </details>
      )}
      <ResetAllButton onReset={() => dispatch({ type: 'reset-scene', screen, initial: LEARN_INITIAL as unknown as Record<string, unknown> })} />
    </>
  );

  return <SimShell sim={sim} screen={screen} onScreen={onScreen} play={play} panels={panels} />;
}
