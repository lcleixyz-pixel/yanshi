import { useEffect, useRef, useState } from 'react';
import RangeControl from '../../shared/RangeControl';
import { createOpticsViewer, type OpticsSnapshot, type OpticsViewer } from '../../optics3d/opticsViewer.js';
import { opticsAssetBase, type OpticsInstrumentId } from '../../optics3d/opticsInstruments';
import { ResetAllButton, SimChecks, SimPanel, SimReadout, SimShell } from '../SimShell';
import SpectroscopeTaskCard from './SpectroscopeTaskCard';
import type { SimScreenProps } from '../registry';
import { MACHINE_LABELS, PART_SHORT } from '../../../domain/spectroscopeCopy';
import { applyOperation, courseView, isMachine, LEARN_INITIAL, readLabScene, readLearnScene, readMachine, readTaskData, type LearnScene, type Machine } from '../../../domain/spectroscopeSim';
import '../../../styles/sim-instrument.css';

const MACHINES: readonly Machine[] = ['prism', 'grating'];
const instrumentOf = (machine: Machine): OpticsInstrumentId => machine === 'grating' ? 'grating-spectroscope' : 'prism-spectroscope';

/**
 * 分光镜 · 认识屏：结构与光路（原两个 3D 自由探索页与课程的「认识部件」「跟随光路」两步）。
 * 机型在本屏切换，三屏共用；两个机型各自的进度分别保留。
 * 部件名称默认不显示，勾选后显示短名称；点部件只高亮并在面板里说明，不推近镜头。
 */
export default function SpectroscopeLearnScreen({ sim, screen, onScreen, session, dispatch }: SimScreenProps) {
  const machine = readMachine(session.options);
  const learn = readLearnScene(session.scenes.learn);
  const lab = readLabScene(session.scenes.lab, machine);
  const task = readTaskData(session.task.data);
  const view = courseView(task, lab, machine, screen);
  const variant = learn.byVariant[machine];
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpticsViewer | null>(null);
  const [snapshot, setSnapshot] = useState<OpticsSnapshot>({ status: 'loading' });
  // 载入失败时原地重试：换一次 attempt 就重新创建查看器，不刷新整页（同偏光镜与课程页）。
  const [attempt, setAttempt] = useState(0);
  const ready = snapshot.status === 'ready' ? snapshot : null;

  const patch = (patch: Partial<LearnScene>) => dispatch({ type: 'patch-scene', screen, patch });
  const patchVariant = (next: Partial<LearnScene['byVariant'][Machine]>) => patch({ byVariant: { ...learn.byVariant, [machine]: { ...variant, ...next } } });
  const setMachine = (next: Machine) => dispatch({ type: 'patch-options', patch: { machine: next } });
  // 一次操作同时写回任务与场景（本屏只用得到 see-part / see-case / answer）。
  // 用 ref 取最新会话状态：连点两下时第二下不会用上一次渲染的旧状态计算，进度不会丢。
  const latest = useRef(session);
  latest.current = session;
  const operate = (op: Parameters<typeof applyOperation>[3]) => {
    const current = latest.current;
    const machineNow = readMachine(current.options);
    const next = applyOperation(readTaskData(current.task.data), readLabScene(current.scenes.lab, machineNow), machineNow, op);
    dispatch({ type: 'task-patch', patch: next.task as unknown as Record<string, unknown> });
  };

  useEffect(() => {
    if (!hostRef.current) return;
    setSnapshot({ status: 'loading' });
    const viewer = createOpticsViewer({ container: hostRef.current, instrument: instrumentOf(machine), assetBase: opticsAssetBase(instrumentOf(machine)), onChange: setSnapshot });
    viewerRef.current = viewer;
    // 回到这一机型时恢复上次的视图与光路示例。
    if (variant.caseId) viewer.setCase(variant.caseId);
    viewer.setView(variant.view);
    viewer.setExplode(learn.explode);
    viewer.setRays(learn.rays);
    return () => { viewer.dispose(); viewerRef.current = null; };
  }, [machine, attempt]);

  useEffect(() => { viewerRef.current?.setRays(learn.rays); }, [learn.rays]);
  useEffect(() => { viewerRef.current?.setExplode(learn.explode); }, [learn.explode]);
  useEffect(() => { if (snapshot.status === 'ready') viewerRef.current?.setView(variant.view); }, [variant.view, snapshot.status]);
  useEffect(() => { if (snapshot.status === 'ready' && variant.caseId) viewerRef.current?.setCase(variant.caseId); }, [variant.caseId, snapshot.status]);

  // 选中模型上的部件即记为已看（学员模式的「点这里」据此指向下一个未看的部件）。
  const selectedId = ready?.state.selectedId ?? null;
  useEffect(() => {
    if (!ready || !selectedId) return;
    if (view.state.step !== 'parts' || view.state.partsSeen.includes(selectedId)) return;
    operate({ type: 'see-part', id: selectedId });
  }, [selectedId, ready?.status]);

  // 热点只给本机型的几个关键部件（与课程一致）；勾「显示名称」时显示全部短名称，学员做「认识部件」时显示并给出「点这里」指引。
  // 不按遮挡隐藏：整机结构下内部部件也要能点到（与课程页、偏光镜一致）。
  const seen = view.state.partsSeen;
  const guided = task.mode === 'student' && view.state.step === 'parts';
  const partIds = ready ? view.config.parts.map((part) => part.id) : [];
  const key = partIds.join(' ');
  useEffect(() => {
    if (!key) return;
    const ids = key.split(' ');
    const coach = guided ? ids.find((id) => !seen.includes(id)) ?? null : null;
    const show = learn.names || guided;
    viewerRef.current?.setHotspots(show ? {
      ids,
      labels: Object.fromEntries(ids.map((id) => [id, PART_SHORT[machine][id] ?? view.config.parts.find((part) => part.id === id)?.label ?? id])),
      labelMode: 'name', done: seen, selected: selectedId, coach,
    } : null);
  }, [key, learn.names, guided, seen.join(' '), selectedId]);

  const selected = ready?.selected ?? null;
  // 关键部件用课程自己的名称与说明（学生要读的那份），其余部件用模型资产的说明。
  const coursePart = view.config.parts.find((part) => part.id === selected?.id) ?? null;
  const play = (
    <>
      <section className="sim-stage" aria-label="分光镜三维模型与光路" data-testid="sim-spectro-stage">
        <div className="sim-stage__host" ref={hostRef} />
        {snapshot.status === 'loading' && <p className="sim-stage__note" role="status"><i />正在载入模型与光路…</p>}
        {snapshot.status === 'error' && (
          <div className="sim-stage__error" role="alert">
            <img src={`${opticsAssetBase(instrumentOf(machine))}poster.png`} alt={`${MACHINE_LABELS[machine]}分光镜静态预览`} />
            <p>三维模型载入失败：{snapshot.error}。可重新载入，或到实验屏继续练习。</p>
            <button type="button" className="iu-button" onClick={() => setAttempt((n) => n + 1)} data-testid="sim-spectro-retry">重新载入</button>
          </div>
        )}
        <p className="sim-stage__hint">拖动旋转 · 滚轮缩放 · 箭头表示传播方向</p>
      </section>
      <SimReadout title="光路示例" meta={MACHINE_LABELS[machine]} testId="sim-spectro-case">
        <select className="sim-select" aria-label="光路示例" disabled={!ready} value={ready?.state.caseId ?? ''} onChange={(event) => { viewerRef.current?.setCase(event.target.value); operate({ type: 'see-case', id: event.target.value }); patchVariant({ caseId: event.target.value }); }} data-testid="sim-spectro-case-select">
          {ready?.cases.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <p className="sim-note">{ready?.currentCase.description}</p>
        {!!ready?.currentCase.readout.length && learn.values && (
          <dl className="sim-readout-list" data-testid="sim-spectro-readout">
            {ready.currentCase.readout.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
          </dl>
        )}
        <div className="sim-legend">{ready?.currentCase.legend.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}</div>
        <p className="sim-note" data-testid="sim-spectro-condition">{ready?.currentCase.conditionNote}</p>
      </SimReadout>
      <SpectroscopeTaskCard
        screen={screen} view={view} machine={machine} open={session.task.open} mode={task.mode}
        teacherUsed={session.task.teacherUsed} hasSkipped={task.hasSkipped}
        onOpen={(open) => dispatch({ type: 'task-open', open })}
        onChoose={(mode) => { dispatch({ type: 'task-patch', patch: { mode } }); if (mode === 'teacher') dispatch({ type: 'task-teacher' }); }}
        onAnswer={(id, option) => operate({ type: 'answer', id, option })}
        onRestart={() => dispatch({ type: 'task-restart' })}
        onScreen={onScreen}
      />
    </>
  );

  const panels = (
    <>
      <SimPanel title="仪器" hint="三屏共用" testId="sim-panel-machine">
        <div className="sim-seg">
          {MACHINES.map((item) => <button key={item} type="button" aria-pressed={item === machine} onClick={() => setMachine(item)} data-testid={`sim-machine-${item}`}>{MACHINE_LABELS[item]}</button>)}
        </div>
        <p className="sim-note">{MACHINE_LABELS[machine]}分光镜：{instrumentOf(machine) === 'grating-spectroscope' ? '固定狭缝与焦距，靠光栅衍射分光，刻度近似线性。' : '狭缝与目镜焦距可调，靠棱镜组色散分光，红端压缩、紫端展开。'}</p>
      </SimPanel>
      <SimPanel title="视图" testId="sim-panel-view">
        <div className="sim-row">
          <button type="button" className="iu-button" aria-pressed={variant.view === 'whole'} disabled={!ready} onClick={() => { viewerRef.current?.setView('whole'); patchVariant({ view: 'whole' }); }}>整机结构</button>
          <button type="button" className="iu-button" aria-pressed={variant.view === 'optics'} disabled={!ready} onClick={() => { viewerRef.current?.setView('optics'); patchVariant({ view: 'optics' }); }}>内部光路</button>
          <button type="button" className="iu-button" disabled={!ready} onClick={() => viewerRef.current?.fit()}>完整视野</button>
        </div>
      </SimPanel>
      <SimPanel title="结构与部件" hint={ready ? `${ready.parts.length} 个` : undefined} testId="sim-panel-parts">
        <fieldset className="sim-fieldset" disabled={!ready}>
          <RangeControl label="连续拆解" min={0} max={100} value={Math.round(learn.explode * 100)} display={`${Math.round(learn.explode * 100)}%`} ends={['装配', '拆开']} onChange={(value) => { viewerRef.current?.setExplode(value / 100); patch({ explode: value / 100 }); }} />
        </fieldset>
        <div className="sim-parts">
          {ready?.parts.map((part) => <button key={part.id} type="button" aria-pressed={selected?.id === part.id} onClick={() => viewerRef.current?.select(part.id, false)} data-testid={`sim-part-${part.id}`}>{PART_SHORT[machine][part.id] ?? part.label}</button>)}
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
