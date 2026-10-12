import { useRef, useState, type ReactNode } from 'react';
import RangeControl from '../../shared/RangeControl';
import { ResetAllButton, SimChecks, SimPanel, SimShell } from '../SimShell';
import SpectroscopeRecord from './SpectroscopeRecord';
import SpectroscopeStage from './SpectroscopeStage';
import { useSpectroscopeBench, type BenchView } from './useSpectroscopeBench';
import type { SimDef } from '../../../data/sims';
import { SAMPLES_BY_ID } from '../../../data/samples';
import { BENCH_METHOD_LABELS, benchMethodSetup, type BenchMethod, type BenchState } from '../../../domain/spectroscopeBench';
import { MACHINE_LABELS } from '../../../domain/spectroscopeCopy';
import { labInitial, patchLab, type LabScene, type Machine } from '../../../domain/spectroscopeSim';
import type { SimScreenId } from '../../../domain/simSession';
import type { SpectroscopeData } from '../../../store/detectionStore';
import '../../../styles/spectroscope-sim.css';

const MACHINES: readonly Machine[] = ['prism', 'grating'];
const METHODS = Object.keys(BENCH_METHOD_LABELS) as BenchMethod[];
const VIEWS: readonly (readonly [BenchView, string])[] = [['whole', '整体'], ['lamp', '灯头'], ['sample', '样品与镊子'], ['instrument', '分光镜']];

/**
 * 挑战屏的工作台与记录：与实验屏同一套三维与记录流程，差别只在样品来源与保存去向。
 * 不显示品种名与参考资料（保存后由屏内决定是否揭示）；机型仍在面板里切换。
 */
export default function SpectroscopeChallenge({ sim, machine, onMachine, scene, patch, unknown, reveal, reference, header, extraPanel, embedded, onScreen, onSave, onUse2D }: {
  sim: SimDef;
  machine: Machine;
  onMachine?: (machine: Machine) => void;
  scene: LabScene;
  patch: (next: Partial<LabScene>) => void;
  /** 未知样品：面板与读数里都不写品种名。 */
  unknown: boolean;
  /** 保存后揭示答案（独立挑战）；检测流程不揭示。 */
  reveal: boolean;
  /** 揭示时显示的对照资料。 */
  reference?: ReactNode;
  header?: ReactNode;
  extraPanel?: ReactNode;
  embedded?: boolean;
  onScreen?: (screen: SimScreenId) => void;
  onSave: (data: SpectroscopeData) => void;
  onUse2D?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [recording, setRecording] = useState(false);
  const sample = SAMPLES_BY_ID[scene.sampleId] ?? SAMPLES_BY_ID.ruby;
  const bench = useSpectroscopeBench({
    hostRef, state: scene.bench, sample, beams: scene.beams, view: scene.view,
    onAdjust: (next) => patch(patchLab(scene, next)),
  });
  const setBench = (next: Partial<BenchState>) => patch(patchLab(scene, next));
  const mayObserve = bench.evaluation.canRecord && bench.status === 'ready';
  const answered = reveal && scene.saved && !scene.saved.stale;

  const play = (
    <>
      <SpectroscopeStage
        hostRef={hostRef} status={bench.status} error={bench.error} onRetry={bench.retry}
        display={bench.evaluation.display} dispersion={machine} marks={scene.marks} interactive={mayObserve}
        onAddMark={(wl) => patch({ marks: [...new Set([...scene.marks, Math.round(wl)])].sort((a, b) => b - a), noAbsorption: false, checked: false })}
        onRemoveMark={(wl) => patch({ marks: scene.marks.filter((value) => value !== wl), checked: false })}
        values={scene.values}
      >
        <div className="sim-row">
          <button type="button" className="iu-button" onClick={() => setRecording(true)} data-testid="sim-spectro-record-open">记录观察</button>
          {onUse2D && <button type="button" className="iu-button" onClick={onUse2D} data-testid="detection-use-2d">改用 2D 版本</button>}
        </div>
      </SpectroscopeStage>
      {answered && reveal && (
        <div className="sim-challenge__answer" data-testid="sim-spectro-answer">
          <strong>{sample.name}</strong>
          <p>{sample.spectrum.description}</p>
          {sample.spectrum.observationNote && <p>{sample.spectrum.observationNote}</p>}
        </div>
      )}
      {recording && (
        <SpectroscopeRecord
          onClose={() => setRecording(false)} state={scene.bench} evaluation={bench.evaluation} marks={scene.marks} bands={scene.bands}
          noAbsorption={scene.noAbsorption} notes={scene.notes} saved={scene.saved} ready={bench.status === 'ready'}
          onAddMark={(wl) => patch({ marks: [...new Set([...scene.marks, wl])].sort((a, b) => b - a), noAbsorption: false, checked: false })}
          onRemoveMark={(wl) => patch({ marks: scene.marks.filter((value) => value !== wl), checked: false })}
          onAddBand={(band) => patch({ bands: [...scene.bands, band], noAbsorption: false })}
          onRemoveBand={(index) => patch({ bands: scene.bands.filter((_, i) => i !== index) })}
          onNoAbsorption={(value) => patch(value ? { noAbsorption: true, marks: [], bands: [] } : { noAbsorption: false })}
          onNotes={(notes) => patch({ notes })}
          onSave={onSave}
          reference={answered ? reference : undefined}
        />
      )}
    </>
  );

  const panels = (
    <>
      {header}
      {extraPanel}
      <SimPanel title="仪器" hint="三屏共用" testId="sim-panel-machine">
        <div className="sim-seg">
          {MACHINES.map((item) => <button key={item} type="button" aria-pressed={item === machine} onClick={() => (onMachine ? onMachine(item) : patch({ bench: { ...scene.bench, dispersion: item }, dispersion: item }))} data-testid={`sim-machine-${item}`}>{MACHINE_LABELS[item]}</button>)}
        </div>
        <p className="sim-note">{MACHINE_LABELS[machine]}分光镜：{machine === 'prism' ? '狭缝与焦距可调，红端压缩、紫端展开。' : '固定狭缝与焦距，刻度近似线性，整体较暗。'}</p>
      </SimPanel>
      <SimPanel title="光源与观察方式" testId="sim-panel-light">
        <button type="button" role="switch" aria-checked={scene.bench.power} className={`iu-switch${scene.bench.power ? ' is-on' : ''}`} onClick={() => setBench({ power: !scene.bench.power })} data-testid="sim-bench-power">{scene.bench.power ? '已开启' : '未开启'}</button>
        <RangeControl label="光源亮度" min={0} max={100} value={Math.round(scene.bench.brightness * 100)} display={`${Math.round(scene.bench.brightness * 100)}%`} ends={['暗', '亮']} onChange={(value) => setBench({ brightness: value / 100 })} />
        <div className="sim-methods">
          {METHODS.map((method, index) => <button key={method} type="button" aria-pressed={scene.bench.method === method} onClick={() => setBench({ method, ...benchMethodSetup(method) })} data-testid={`sim-method-${method}`}><span>0{index + 1}</span>{BENCH_METHOD_LABELS[method]}</button>)}
        </div>
      </SimPanel>
      <SimPanel title="样品" hint={unknown ? '未知样品' : undefined} testId="sim-panel-sample">
        {unknown ? <p className="sim-note" data-testid="sim-spectro-unknown">未知样品：观察并记录后核对，再对照答案。</p> : <p className="sim-note"><strong>{sample.name}</strong></p>}
        <div className="sim-row">
          <button type="button" aria-pressed={scene.bench.samplePlaced} className="iu-button" onClick={() => setBench({ samplePlaced: !scene.bench.samplePlaced })} data-testid="sim-bench-place">{scene.bench.samplePlaced ? '取下样品' : scene.bench.method === 'transmission' ? '镊子夹样' : '放到黑色台面'}</button>
        </div>
        <RangeControl label="样品横移" min={-10} max={10} step={0.1} value={Number((scene.bench.sampleOffset * 10).toFixed(1))} display={`${(scene.bench.sampleOffset * 10).toFixed(1)} / 10`} ends={['左', '右']} onChange={(value) => setBench({ sampleOffset: value / 10 })} />
        <RangeControl label="样品转角" min={0} max={360} value={scene.bench.sampleRotation} display={`${scene.bench.sampleRotation}°`} ends={['0°', '360°']} onChange={(sampleRotation) => setBench({ sampleRotation })} />
      </SimPanel>
      <SimPanel title={machine === 'prism' ? '狭缝与调焦' : '固定光学结构'} testId="sim-panel-optics">
        {machine === 'prism' ? (
          <>
            <RangeControl label="狭缝宽度" min={0} max={10} step={0.1} value={Number((scene.bench.slit * 10).toFixed(1))} display={`${(scene.bench.slit * 10).toFixed(1)} / 10`} ends={['窄', '宽']} onChange={(value) => setBench({ slit: value / 10 })} />
            <RangeControl label="目镜焦距" min={0} max={10} step={0.1} value={Number((scene.bench.focus * 10).toFixed(1))} display={`${(scene.bench.focus * 10).toFixed(1)} / 10`} ends={['缩回', '拉出']} onChange={(value) => setBench({ focus: value / 10 })} />
          </>
        ) : <p className="sim-note">狭缝与焦距固定：视场偏暗先查照明和对光，不把「暗」当成吸收。</p>}
      </SimPanel>
      <SimPanel title="灯头" testId="sim-panel-lamp">
        <RangeControl label="灯头横移" min={-10} max={10} step={0.1} value={Number((scene.bench.lampLateral * 10).toFixed(1))} display={`${(scene.bench.lampLateral * 10).toFixed(1)} / 10`} ends={['左', '右']} onChange={(value) => setBench({ lampLateral: value / 10 })} />
        <RangeControl label={scene.bench.method === 'transmission' ? '灯头角度' : '灯头俯角（相对台面）'} min={scene.bench.method === 'transmission' ? -75 : 5} max={75} value={scene.bench.lampAngle} display={`${scene.bench.lampAngle}°`} ends={scene.bench.method === 'transmission' ? ['−75°', '75°'] : ['5°', '75°']} onChange={(lampAngle) => setBench({ lampAngle })} />
      </SimPanel>
      <SimPanel title="视角与显示" testId="sim-panel-display">
        <div className="sim-row">
          {VIEWS.map(([id, label]) => <button key={id} type="button" className="iu-button" aria-pressed={scene.view === id} disabled={bench.status !== 'ready'} onClick={() => patch({ view: id })}>{label}</button>)}
        </div>
        <SimChecks items={[
          { id: 'beams', label: '光路示意', checked: scene.beams },
          { id: 'values', label: '显示数值', checked: scene.values },
        ]} onChange={(id, checked) => patch(id === 'beams' ? { beams: checked } : { values: checked })} />
      </SimPanel>
      <ResetAllButton onReset={() => { setRecording(false); patch({ ...labInitial(machine, scene.sampleId, scene.bench.method), saved: scene.saved } as unknown as Partial<LabScene>); }} />
    </>
  );

  return <SimShell sim={sim} screen="challenge" onScreen={onScreen ?? (() => {})} hideScreens={embedded} play={play} panels={panels} />;
}
