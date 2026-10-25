import { useEffect, useRef, useState } from 'react';
import RangeControl from '../../shared/RangeControl';
import SpectrumStrip from '../../spectroscope/SpectrumStrip';
import { OBS_VIEW_SHIFT, ResetAllButton, SimChecks, SimObsPanel, SimPanel, SimShell, SimStepBar, useDesktopLayout } from '../SimShell';
import SpectroscopeRecord from './SpectroscopeRecord';
import SpectroscopeStage, { SpectroscopeField } from './SpectroscopeStage';
import SpectroscopeTaskCard from './SpectroscopeTaskCard';
import { useSpectroscopeBench, type BenchView } from './useSpectroscopeBench';
import type { SimScreenProps } from '../registry';
import { SAMPLES, SAMPLES_BY_ID } from '../../../data/samples';
import { BENCH_METHOD_LABELS, benchMethodSetup, type BenchEvaluation, type BenchMethod, type BenchState } from '../../../domain/spectroscopeBench';
import { IDEAL, MACHINE_LABELS, WEAK_LIGHT } from '../../../domain/spectroscopeCopy';
import { isPendingReference } from '../../../domain/spectroscopeRecord';
import { COURSE_SAMPLE } from '../../../domain/spectroscopeCourse';
import {
  applyOperation, changeLabSample, courseInitialLab, courseView, labInitial, patchLab, readLabScene, readMachine, readTaskData,
  type LabScene, type Machine,
} from '../../../domain/spectroscopeSim';
import type { SpectroscopeData } from '../../../store/detectionStore';
import '../../../styles/sim-instrument.css';

const MACHINES: readonly Machine[] = ['prism', 'grating'];
const METHODS = Object.keys(BENCH_METHOD_LABELS) as BenchMethod[];
const VIEWS: readonly (readonly [BenchView, string])[] = [['whole', '整体'], ['lamp', '灯头'], ['sample', '样品与镊子'], ['instrument', '分光镜']];

/**
 * 分光镜 · 实验屏：照明夹样工作台与两门课的操作合在一屏。
 * 引导任务的四步（对光与照明、调节狭缝与焦距（光栅式为对准与亮度）、标记吸收特征、解释与适用条件）用的是同一套工作台状态；
 * 机型三屏共用；狭缝、调焦与横移用相对刻度（0–10 / −10…10），三维仍按原单位回写。
 */
export default function SpectroscopeLabScreen({ sim, screen, onScreen, session, dispatch }: SimScreenProps) {
  const machine = readMachine(session.options);
  const lab = readLabScene(session.scenes[screen], machine);
  const task = readTaskData(session.task.data);
  const view = courseView(task, lab, machine, screen);
  const guided = task.mode !== null;
  // 引导任务固定用课程教学样品（透明红宝石），与课程域的完成条件同源；自由练习用所选样品。
  const sample = guided ? COURSE_SAMPLE : SAMPLES_BY_ID[lab.sampleId] ?? SAMPLES[0];
  const hostRef = useRef<HTMLDivElement>(null);
  const [recording, setRecording] = useState(false);
  // 观察面板（观察区改版 P2）：谱条放大，与光源、狭缝、焦距、夹样放在一起；展开时工作台右移让位。
  const [obsOpen, setObsOpen] = useState(true);
  const desktop = useDesktopLayout();
  // 手机上任务卡先收为顶部一行，给工作台与观察面板让出高度。
  useEffect(() => { if (!desktop) dispatch({ type: 'task-open', open: false }); }, [desktop]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (next: Partial<LabScene>) => dispatch({ type: 'patch-scene', screen, patch: next });
  // 引导任务的课程操作（标记、核对、记录连续光谱、回答）与被引导时的滑杆都走课程域，进度才会记上。
  // 用 ref 取最新会话状态：连点两下时第二下不会用上一次渲染的旧状态计算，进度不会丢。
  const latest = useRef(session);
  latest.current = session;
  const operate = (op: Parameters<typeof applyOperation>[3]) => {
    const current = latest.current;
    const machineNow = readMachine(current.options);
    const next = applyOperation(readTaskData(current.task.data), readLabScene(current.scenes[screen], machineNow), machineNow, op);
    dispatch({ type: 'patch-scene', screen, patch: next.scene as unknown as Record<string, unknown> });
    dispatch({ type: 'task-patch', patch: next.task as unknown as Record<string, unknown> });
  };
  const bench = useSpectroscopeBench({
    hostRef, state: lab.bench, sample, beams: lab.beams, view: lab.view, viewShift: desktop && obsOpen ? OBS_VIEW_SHIFT : 0,
    onAdjust: (next) => patch(patchLab(lab, next)),
  });

  // 自由练习：滑杆、夹样与显示开关直接改场景；引导任务的清单会跟着同一套条件实时判断。
  const setBench = (next: Partial<BenchState>) => patch(patchLab(lab, next));
  const setSample = (id: string) => patch(changeLabSample(lab, id));
  const mayObserve = bench.evaluation.canRecord && bench.status === 'ready';
  const pending = isPendingReference(lab.bench, bench.evaluation);
  const addMark = (wavelength: number) => {
    if (!mayObserve || !Number.isFinite(wavelength) || wavelength < 400 || wavelength > 700) return;
    const wl = Math.round(wavelength);
    if (guided) operate({ type: 'mark', wavelength: wl });
    else patch({ marks: [...new Set([...lab.marks, wl])].sort((a, b) => b - a), noAbsorption: false, checked: false });
  };
  const removeMark = (wavelength: number) => {
    if (guided) operate({ type: 'unmark', wavelength });
    else patch({ marks: lab.marks.filter((wl) => wl !== wavelength), checked: false });
  };
  const save = (data: SpectroscopeData) => patch({ saved: { notes: data.notes, stale: false, pending: data.observationStatus !== 'observed' } });

  const play = (
    <>
      <SpectroscopeStage
        hostRef={hostRef} status={bench.status} error={bench.error} onRetry={bench.retry}
        evaluation={bench.evaluation} dispersion={machine} marks={lab.marks} interactive={mayObserve}
        onAddMark={addMark} onRemoveMark={removeMark} values={lab.values} docked={false}
      />
      {guided && <SimStepBar steps={view.stepBar} />}
      <SimObsPanel
        title="目镜视场" meta={`${MACHINE_LABELS[machine]} · ${guided ? sample.name : SAMPLES_BY_ID[lab.sampleId]?.name ?? ''}`} open={obsOpen} onOpen={setObsOpen} guided={guided}
        layout="stack" eyeLabel="谱条（点谱条标记吸收）" testId="sim-spectro-obs"
        eye={(
          <SpectroscopeField evaluation={bench.evaluation} dispersion={machine} marks={lab.marks} interactive={mayObserve} onAddMark={addMark} onRemoveMark={removeMark}
            values={lab.values} height={desktop ? 72 : 48} caption>
            <div className="sim-row">
              <button type="button" className="iu-button" onClick={() => setRecording(true)} data-testid="sim-spectro-record-open">记录观察</button>
              {pending && <span className="sim-note">{bench.evaluation.recordStatus === 'setup-only' ? '本方法先做布置练习' : '本样品参考谱尚未核定'}</span>}
            </div>
          </SpectroscopeField>
        )}
        handLabel={machine === 'prism' ? '光源 · 狭缝 · 调焦 · 夹样' : '光源 · 夹样（狭缝与焦距固定）'}
        hand={(
          <div className="sim-spectro-hand" data-testid="sim-spectro-hand">
            <div className="sim-row">
              <span className="sim-spectro-hand__label">光源</span>
              <button type="button" role="switch" aria-checked={lab.bench.power} className={`iu-switch${lab.bench.power ? ' is-on' : ''}`} onClick={() => setBench({ power: !lab.bench.power })} data-testid="sim-bench-power">{lab.bench.power ? '已开启' : '未开启'}</button>
              <button type="button" aria-pressed={lab.bench.samplePlaced} className="iu-button" onClick={() => setBench({ samplePlaced: !lab.bench.samplePlaced })} data-testid="sim-bench-place">{lab.bench.samplePlaced ? '取下样品' : lab.bench.method === 'transmission' ? '镊子夹样' : '放到黑色台面'}</button>
            </div>
            <RangeControl label="光源亮度" min={0} max={100} value={Math.round(lab.bench.brightness * 100)} display={`${Math.round(lab.bench.brightness * 100)}%`} ends={['暗', '亮']} onChange={(value) => setBench({ brightness: value / 100 })} />
            {machine === 'prism' && <>
              <RangeControl label="狭缝宽度" min={0} max={10} step={0.1} value={Number((lab.bench.slit * 10).toFixed(1))} display={`${(lab.bench.slit * 10).toFixed(1)} / 10`} ends={['窄', '宽']} onChange={(value) => setBench({ slit: value / 10 })} />
              <RangeControl label="目镜焦距" min={0} max={10} step={0.1} value={Number((lab.bench.focus * 10).toFixed(1))} display={`${(lab.bench.focus * 10).toFixed(1)} / 10`} ends={['缩回', '拉出']} onChange={(value) => setBench({ focus: value / 10 })} />
            </>}
            <p className="sim-note">{machine === 'prism'
              ? '狭缝太宽谱线发糊、太窄变暗；焦距对准后谱线才清楚。刻度为 0–10 相对值，未经实物标定。'
              : '本袖珍光栅式机型的狭缝与焦距固定：视场偏暗先查照明和对光，不把「暗」当成吸收。'}</p>
            <RangeControl label="样品横移" min={-10} max={10} step={0.1} value={Number((lab.bench.sampleOffset * 10).toFixed(1))} display={`${(lab.bench.sampleOffset * 10).toFixed(1)} / 10`} ends={['左', '右']} onChange={(value) => setBench({ sampleOffset: value / 10 })} />
          </div>
        )}
        conditions={[
          { label: '机型', value: MACHINE_LABELS[machine] },
          { label: '方法', value: BENCH_METHOD_LABELS[lab.bench.method] },
          { label: '光源', value: lab.bench.power ? `开 ${Math.round(lab.bench.brightness * 100)}%` : '关' },
          { label: '样品', value: lab.bench.method === 'transmission'
            ? lab.bench.samplePlaced ? '已夹持' : '未夹持'
            : lab.bench.samplePlaced ? '已放到黑色台面' : '未放到黑色台面' },
          { label: '光路', value: lightPathStatus(bench.evaluation) },
          ...(machine === 'prism' ? [{ label: '狭缝 / 焦距', value: `${(lab.bench.slit * 10).toFixed(1)} / ${(lab.bench.focus * 10).toFixed(1)}` }] : []),
        ]}
      />
      <SpectroscopeTaskCard
        screen={screen} view={view} machine={machine} open={session.task.open} mode={task.mode}
        teacherUsed={session.task.teacherUsed} hasSkipped={task.hasSkipped}
        onOpen={(open) => dispatch({ type: 'task-open', open })}
        onChoose={(mode) => {
          // 开始引导任务：工作台回到本机型的课程起点（光源已开、未夹样，狭缝或对光故意不合适）。
          dispatch({ type: 'patch-scene', screen, patch: courseInitialLab(machine) as unknown as Record<string, unknown> });
          dispatch({ type: 'task-patch', patch: { mode } });
          if (mode === 'teacher') dispatch({ type: 'task-teacher' });
        }}
        onAnswer={(id, option) => operate({ type: 'answer', id, option })}
        onRestart={() => dispatch({ type: 'task-restart' })}
        onScreen={onScreen}
      >
        {view.state.step === 'light' && (
          <div className="sim-task__step" data-testid="sim-task-continuous">
            <button type="button" className="iu-button" disabled={bench.evaluation.spectrumMode !== 'continuous-light'} onClick={() => operate({ type: 'record-continuous' })}>记录：只见连续光谱</button>
            <p className="sim-note">{bench.evaluation.spectrumMode === 'continuous-light' ? '现在光没有穿过样品：记录这一现象，再把样品夹进光路。' : '只有光未经样品直接进入狭缝、看到连续光谱时才可记录。'}</p>
          </div>
        )}
        {view.state.step === 'explain' && (
          <div className="sim-task__step" data-testid="sim-task-explain">
            <div className="sim-compare" data-testid="weak-light-comparison">
              <h3>对照：透光太弱时 <span>教学模拟</span></h3>
              <SpectrumStrip features={WEAK_LIGHT[machine].features} display={WEAK_LIGHT[machine]} dispersion={machine} interactive={false} showFeatureDescriptions={false} height={48} />
            </div>
            {machine === 'grating' && (
              <div className="sim-compare" data-testid="scale-comparison">
                <h3>对照：同一颗红宝石，两种刻度 <span>教学模拟</span></h3>
                {(['grating', 'prism'] as const).map((kind) => (
                  <div key={kind} data-dispersion={kind}>
                    <small>{kind === 'grating' ? '光栅式（近似线性）' : '棱镜式（红端压缩、紫端展开）'}</small>
                    <SpectrumStrip features={IDEAL[kind].features} display={IDEAL[kind]} dispersion={kind} interactive={false} showFeatureDescriptions={false} height={40} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SpectroscopeTaskCard>
      {recording && (
        <SpectroscopeRecord
          onClose={() => setRecording(false)} state={lab.bench} evaluation={bench.evaluation} marks={lab.marks} bands={lab.bands}
          noAbsorption={lab.noAbsorption} notes={lab.notes} saved={lab.saved} ready={bench.status === 'ready'}
          guided={guided} reviewed={lab.checked} sampleName={guided ? sample.name : undefined}
          onAddMark={addMark} onRemoveMark={removeMark}
          onAddBand={(band) => patch({ bands: [...lab.bands, band], noAbsorption: false, checked: false })}
          onRemoveBand={(index) => patch({ bands: lab.bands.filter((_, i) => i !== index), checked: false })}
          onNoAbsorption={(value) => patch(value ? { noAbsorption: true, marks: [], bands: [], checked: false } : { noAbsorption: false })}
          onNotes={(notes) => patch({ notes })}
          onReview={guided ? () => operate({ type: 'check' }) : undefined}
          onSave={save}
          reference={<details className="sim-sources" data-testid="sim-record-reference"><summary>对照资料</summary><p>{sample.spectrum.description}</p>{sample.spectrum.observationNote && <p>{sample.spectrum.observationNote}</p>}<p>模型中的样品形态、体色与收光程度为教学示意，不能代替这颗样品的实测资料。</p></details>}
        />
      )}
    </>
  );

  const panels = (
    <>
      <SimPanel title="仪器" hint="三屏共用" testId="sim-panel-machine">
        <div className="sim-seg">
          {MACHINES.map((item) => <button key={item} type="button" aria-pressed={item === machine} disabled={item === machine} onClick={() => {
            dispatch({ type: 'patch-options', patch: { machine: item } });
          }} data-testid={`sim-machine-${item}`}>{MACHINE_LABELS[item]}</button>)}
        </div>
        <p className="sim-note">{MACHINE_LABELS[machine]}分光镜：{machine === 'prism' ? '狭缝与焦距可调，红端压缩、紫端展开。' : '固定狭缝与焦距，刻度近似线性，整体较暗。'}</p>
      </SimPanel>
      <SimPanel title="样品" hint={guided ? '教学样品' : `${SAMPLES.length} 种`} testId="sim-panel-sample">
        {guided
          ? <p className="sim-note"><strong>{COURSE_SAMPLE.name}</strong>（教学样品）：品种透明度为透明至半透明，本课选用可清楚透射的一颗。</p>
          : <label className="sim-field">练习样品<select className="sim-select" value={lab.sampleId} onChange={(event) => setSample(event.target.value)} data-testid="sim-sample-select">{SAMPLES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <p className="sim-note">夹样、横移与光源、{machine === 'prism' ? '狭缝、调焦' : '亮度'}在左侧「目镜视场」面板的「手」一栏；三维里也可以按住灯头、狭缝环或目镜套筒拖动。</p>
        <RangeControl label="样品转角" min={0} max={360} value={lab.bench.sampleRotation} display={`${lab.bench.sampleRotation}°`} ends={['0°', '360°']} onChange={(sampleRotation) => setBench({ sampleRotation })} />
      </SimPanel>
      <h3 className="sim-panels__group">更多调节</h3>
      <SimPanel title="观察方式" testId="sim-panel-method">
        <div className="sim-methods">
          {METHODS.map((method, index) => <button key={method} type="button" aria-pressed={lab.bench.method === method} disabled={guided} onClick={() => setBench({ method, ...benchMethodSetup(method) })} data-testid={`sim-method-${method}`}><span>0{index + 1}</span>{BENCH_METHOD_LABELS[method]}</button>)}
        </div>
        {guided
          ? <p className="sim-note">引导任务用透射观察与教学样品（红宝石）；要试别的方法，可先「重新开始任务」，本屏即回到自由练习。</p>
          : <p className="sim-note">反射法只练布置：缺少方法对应的参考谱，记录为「仅布置练习」，不计有效观察。</p>}
      </SimPanel>
      <SimPanel title="灯头" testId="sim-panel-lamp">
        <RangeControl label="灯头横移" min={-10} max={10} step={0.1} value={Number((lab.bench.lampLateral * 10).toFixed(1))} display={`${(lab.bench.lampLateral * 10).toFixed(1)} / 10`} ends={['左', '右']} onChange={(value) => setBench({ lampLateral: value / 10 })} />
        <RangeControl label={lab.bench.method === 'transmission' ? '灯头角度' : '灯头俯角（相对台面）'} min={lab.bench.method === 'transmission' ? -75 : 5} max={75} value={lab.bench.lampAngle} display={`${lab.bench.lampAngle}°`} ends={lab.bench.method === 'transmission' ? ['−75°', '75°'] : ['5°', '75°']} onChange={(lampAngle) => setBench({ lampAngle })} />
        <p className="sim-note">灯头也可以在三维里左右拖动。示意起点：横移 {Math.round(benchMethodSetup(lab.bench.method).lampLateral * 10)} / 10 · {lab.bench.method === 'transmission' ? '水平偏转' : '相对台面俯角'} {benchMethodSetup(lab.bench.method).lampAngle}°。位置按相对刻度给出，未经实物标定；需按样品逐步寻找合适位置。</p>
        <div className="sim-row"><button type="button" className="iu-button" onClick={() => setBench(benchMethodSetup(lab.bench.method))}>摆到示意起点</button></div>
      </SimPanel>
      <SimPanel title="视角与显示" testId="sim-panel-display">
        <div className="sim-row">
          {VIEWS.map(([id, label]) => <button key={id} type="button" className="iu-button" aria-pressed={lab.view === id} disabled={bench.status !== 'ready'} onClick={() => patch({ view: id })}>{label}</button>)}
        </div>
        <SimChecks items={[
          { id: 'beams', label: '光路示意', checked: lab.beams },
          { id: 'values', label: '显示数值', checked: lab.values },
        ]} onChange={(id, checked) => patch(id === 'beams' ? { beams: checked } : { values: checked })} />
        <p className="sim-note" data-testid="sim-bench-part">{bench.part ? `选中：${bench.part}` : '点部件查看名称与作用。'}</p>
      </SimPanel>
      <details className="sim-sources">
        <summary>依据与适用范围</summary>
        <p>基于资料参考谱的教学模拟。三维光源、镊子与台面为教学示意；光量、可见性与刻度未作实物标定。记录观察不等同于掌握鉴定技能。</p>
        <p>透光太弱时整体偏暗、蓝紫端先变黑，不能当成蓝紫区强吸收：先加强照明或换个方向、换照明方法再看。</p>
      </details>
      {/* 全部重置：只恢复本屏场景（观察条件随之改变），旧记录保留但标为过期；任务进度与学习记录不受影响。 */}
      <ResetAllButton onReset={() => {
        setRecording(false);
        const reset = guided ? courseInitialLab(machine) : labInitial(machine, lab.sampleId, lab.bench.method);
        dispatch({ type: 'reset-scene', screen, initial: { ...reset, saved: lab.saved ? { ...lab.saved, stale: true } : null } as unknown as Record<string, unknown> });
      }} />
    </>
  );

  return <SimShell sim={sim} screen={screen} onScreen={onScreen} play={play} panels={panels} />;
}

/** 放样不等于对光；条件表与目镜提示使用同一份工作台判断，不另算合格条件。 */
function lightPathStatus(evaluation: BenchEvaluation): string {
  switch (evaluation.lightPath) {
    case 'off': return evaluation.problemCodes.includes('power-off') ? '光源未开' : '光量不足';
    case 'bypass': return '光未经过样品';
    case 'missed':
      if (evaluation.problemCodes.includes('sample-absent')) return '待放样与对光';
      if (evaluation.problemCodes.includes('lamp-missed')) return '灯束未照中样品';
      if (evaluation.problemCodes.includes('sample-off-axis')) return '样品偏离观察轴';
      return '照明方向未对准';
    case 'blocked': return evaluation.problemCodes.includes('opaque-internal-reflection') ? '内部光路不可观察' : '样品不透光';
    case 'weak': return evaluation.methodEvidence === 'setup-only' ? '收光偏弱（仅布置练习）' : '收光偏弱';
    case 'aligned': return evaluation.methodEvidence === 'setup-only' ? '已对准（仅布置练习）' : '已对准';
  }
}
