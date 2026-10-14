import { useState, type ReactNode } from 'react';
import { OBS_VIEW_SHIFT, ResetAllButton, SimChecks, SimObsPanel, SimPanel, SimShell, SimStepBar, useDesktopLayout, type SimStep } from '../SimShell';
import ObservationWindow from '../../refractometer/ObservationWindow';
import RefractometerStage from './RefractometerStage';
import type { SimDef } from '../../../data/sims';
import { SAMPLES } from '../../../data/samples';
import type { SampleDef } from '../../../data/types';
import { requiredRefractometerMethod, shapeLabelCn } from '../../../data/refractometerSampleMethod';
import {
  applySceneOperation, BENCH_ACTION_PART, benchActionText, CONTACT_INDEX, displayRiForSample, isOverContactLimit, observationView, patchLab,
  type BenchAction, type LabScene, type SimOperation,
} from '../../../domain/refractometerSim';
import { benchStatusLine } from '../../../domain/refractometerCopy';
import type { SimScreenId } from '../../../domain/simSession';
import '../../../styles/sim-instrument.css';

/** 一次读数的记录：数值、上限（双折射）与超量程标记；summary 只用于面板显示。 */
export interface ReadingRecord {
  summary: string;
  min: number | null;
  max: number | null;
  overLimit: boolean;
  valid: boolean;
}

/**
 * 折射仪的操作台（实验屏与挑战屏共用）：三维仪器 + 停靠目镜 + 操作与记录面板。
 * 两屏差别只在样品来源（所选 / 未知）与保存去向，控制项与读数条件完全一致。
 */
export default function RefractometerBench({ sim, screen, onScreen, embedded, scene, sample, unknown, idle, reveal, reference, header, extraPanel, taskSlot, observe, onOperate, onPatch, onReset, onSave, onUse2D }: {
  sim: SimDef;
  screen: SimScreenId;
  onScreen?: (screen: SimScreenId) => void;
  embedded?: boolean;
  scene: LabScene;
  sample: SampleDef;
  /** 未知样品：面板与状态里都不写品种名。 */
  unknown?: boolean;
  /** 还没抽样品（挑战屏初始态）：不显示目镜视场，也不能记录。 */
  idle?: boolean;
  /** 保存后揭示答案（独立挑战）；检测流程不揭示。 */
  reveal?: boolean;
  reference?: ReactNode;
  header?: ReactNode;
  extraPanel?: ReactNode;
  taskSlot?: ReactNode;
  /**
   * 观察面板布局（实验屏，观察区改版 P2）：目镜放大到左侧面板，仪器操作按课程顺序放在「手」一栏。
   * 引导时给出步骤条与下一步动作（面板里高亮、仪器上亮一个热点）；挑战屏不传，保持停靠目镜。
   */
  observe?: { steps: readonly SimStep[] | null; next: BenchAction | null; onRecordInvalid?: () => void };
  /** 引导任务下的操作走课程域（记进度）；不传则只改场景（自由练习与挑战）。 */
  onOperate?: (op: SimOperation) => void;
  onPatch: (next: Partial<LabScene>) => void;
  onReset: () => void;
  onSave?: (record: ReadingRecord) => void;
  onUse2D?: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const method = requiredRefractometerMethod(sample);
  const view = idle ? 'off' : observationView(scene, sample);
  const over = isOverContactLimit(sample);
  const mayObserve = !idle && (view === 'single' || view === 'double' || view === 'spot');
  const op = (type: SimOperation) => { if (onOperate) onOperate(type); else onPatch(applySceneOperation(scene, type)); };
  const answered = reveal && scene.saved && !scene.saved.stale;
  const [obsOpen, setObsOpen] = useState(true);
  const desktop = useDesktopLayout();
  const next = observe?.next ?? null;
  const runAction = (action: BenchAction) => {
    if (action === 'read') setRecording(true);
    else if (action === 'record-invalid') observe?.onRecordInvalid?.();
    else if (action !== 'answer') op({ type: action });
  };
  const opsButtons = (
    <>
      {([
        ['power', scene.power ? '关闭电源' : '打开电源', false, 'sim-refracto-power'],
        ['cover', scene.cover === 'open' ? '合上翻盖' : '打开翻盖', scene.sample === 'placed', 'sim-refracto-cover'],
        ['drop', '滴一小滴接触液', scene.cover !== 'open', 'sim-refracto-drop'],
        ['place', '台面朝下放样', scene.cover !== 'open' || scene.sample === 'placed', 'sim-refracto-place'],
        ['recover', '轻推贴合', scene.sample !== 'placed' || scene.liquid === 'none' || scene.cover !== 'open', 'sim-refracto-recover'],
        ['turn', '取下转向 90° 并放回', scene.sample !== 'placed' || scene.cover !== 'open', 'sim-refracto-turn'],
        ['remove', '取下样品', scene.sample !== 'placed', 'sim-refracto-remove'],
        ['clean-stage', '擦净测台', scene.sample === 'placed', 'sim-refracto-clean-stage'],
        ['clean-sample', '擦净样品', scene.sample === 'placed', 'sim-refracto-clean-sample'],
      ] as const).map(([type, label, disabled, testId]) => (
        <button key={type} type="button" className="iu-button" disabled={disabled} aria-pressed={type === 'power' ? scene.power : undefined}
          data-next={next === type} onClick={() => op({ type })} data-testid={testId}>{label}</button>
      ))}
    </>
  );
  const readout = readoutFor(scene, sample, view);
  const recordButton = <button type="button" className="iu-button" data-next={next === 'read'} onClick={() => setRecording(true)} data-testid="sim-refracto-record-open">记录读数</button>;
  const eyeSize = desktop ? Math.max(180, Math.min(300, Math.round(window.innerHeight * 0.27))) : 132;
  const action = next && next !== 'answer' && !idle ? { part: BENCH_ACTION_PART[next], text: benchActionText(next, scene), onActivate: () => runAction(next) } : null;

  const play = observe ? (
    <>
      <RefractometerStage scene={scene} sample={sample} view={view} showReading={mayObserve} docked={false}
        viewShift={desktop && obsOpen ? OBS_VIEW_SHIFT : 0} action={action} />
      {observe.steps && <SimStepBar steps={observe.steps} />}
      <SimObsPanel
        title="目镜观察" meta={unknown ? '未知样品' : sample.name} open={obsOpen} onOpen={setObsOpen} guided={!!observe.steps} testId="sim-refracto-obs"
        eye={<div className="sim-refracto-eye" data-testid="sim-refracto-eyepiece" data-view={view}><ObservationWindow view={view} sample={sample} size={eyeSize} showReading={mayObserve} hideChrome /></div>}
        beside={(
          <>
            <p className="sim-note" role="status" data-testid="sim-refracto-readout">{readout}</p>
            <div className="sim-row">{recordButton}{onUse2D && <button type="button" className="iu-button" onClick={onUse2D} data-testid="detection-use-2d">改用 2D 版本</button>}</div>
            <p className="sim-note">读数只在目镜里看：三维光路是示例参数的原理计算。</p>
          </>
        )}
        handLabel="操作仪器"
        hand={(
          <>
            {observe.steps && <p className="sim-obs__next" data-testid="sim-refracto-next">{next ? `下一步：${benchActionText(next, scene)}${next !== 'answer' ? '（仪器上亮的位置也可以点）' : ''}` : '本步操作已完成，看右侧任务卡。'}</p>}
            <div className="sim-obs__ops">{opsButtons}</div>
          </>
        )}
        conditions={[
          { label: '电源', value: scene.power ? '已开' : '已关' },
          { label: '翻盖', value: scene.cover === 'open' ? '打开' : '合上' },
          { label: '接触液', value: scene.liquid === 'drop' ? '已滴' : '无' },
          { label: '样品', value: scene.sample === 'placed' ? (scene.contact === 'good' ? '已贴合' : '空气间隙') : '未放' },
          { label: '方向', value: `${scene.angle}°` },
        ]}
      />
      {idle && <p className="sim-answer" data-testid="sim-refracto-idle">先在上面选一档难度抽一颗未知样品，再开始操作。</p>}
      {answered && (
        <div className="sim-answer" data-testid="sim-refracto-answer">
          <strong>{sample.name}</strong>
          <p>折射率 {displayRiForSample(sample) === null ? '> 1.780（超折射油）' : referenceRange(sample)}，光性 {opticalLabel(sample)}。</p>
        </div>
      )}
      {recording && (
        <RefractometerRecord
          scene={scene} sample={sample} method={method} view={view}
          min={min} max={max} onMin={setMin} onMax={setMax}
          onClose={() => setRecording(false)}
          onSave={(record) => onSave?.(record)}
          onNotify={(text) => onPatch({ note: text })}
          reference={answered ? reference : undefined}
        />
      )}
      {taskSlot}
    </>
  ) : (
    <>
      <RefractometerStage scene={{ ...scene, rays: scene.rays }} sample={sample} view={view} showReading={mayObserve} readout={readout}>
        <div className="sim-row">
          <button type="button" className="iu-button" onClick={() => setRecording(true)} data-testid="sim-refracto-record-open">记录读数</button>
          {onUse2D && <button type="button" className="iu-button" onClick={onUse2D} data-testid="detection-use-2d">改用 2D 版本</button>}
        </div>
      </RefractometerStage>
      {idle && <p className="sim-answer" data-testid="sim-refracto-idle">先在上面选一档难度抽一颗未知样品，再开始操作。</p>}
      {answered && (
        <div className="sim-answer" data-testid="sim-refracto-answer">
          <strong>{sample.name}</strong>
          <p>折射率 {displayRiForSample(sample) === null ? '> 1.780（超折射油）' : referenceRange(sample)}，光性 {opticalLabel(sample)}。</p>
        </div>
      )}
      {recording && (
        <RefractometerRecord
          scene={scene} sample={sample} method={method} view={view}
          min={min} max={max} onMin={setMin} onMax={setMax}
          onClose={() => setRecording(false)}
          onSave={(record) => onSave?.(record)}
          onNotify={(text) => onPatch({ note: text })}
          reference={answered ? reference : undefined}
        />
      )}
      {taskSlot}
    </>
  );

  const panels = (
    <>
      {header}
      {extraPanel}
      {!observe && (
        <SimPanel title="仪器操作" testId="sim-panel-ops">
          <div className="sim-obs__ops">{opsButtons}</div>
          <p className="sim-note" data-testid="sim-refracto-state">{benchStatusLine(scene)}</p>
        </SimPanel>
      )}
      <SimPanel title="样品" hint={unknown ? '未知样品' : undefined} testId="sim-panel-sample">
        {unknown
          ? <p className="sim-note" data-testid="sim-refracto-unknown">未知样品：先读数并记录，再对照答案。三维与目镜都不显示品种名。</p>
          : <label className="sim-field">练习样品<select className="sim-select" value={scene.sampleId} onChange={(event) => onPatch(patchLab(scene, { sampleId: event.target.value }))} data-testid="sim-sample-select">{SAMPLES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <p className="sim-note">
          {unknown ? `形态：${shapeLabelCn(sample.refractometerShape)}` : <><strong>{sample.name}</strong> · {shapeLabelCn(sample.refractometerShape)}</>}
          ；本样品用{method === 'facet' ? '刻面法' : '点测法（远视法）'}。
          {method === 'spot' ? '点测只给两位小数的近似读数，不据此测双折射率。' : ''}
        </p>
        <p className="sim-note">三维按理想抛光块示意；接触液可测上限 {CONTACT_INDEX.toFixed(3)}，超出只能记为「&gt; 1.780」。</p>
      </SimPanel>
      <SimPanel title="视角与显示" testId="sim-panel-display">
        <div className="sim-row">
          <button type="button" className="iu-button" aria-pressed={scene.view === 'whole'} onClick={() => onPatch({ view: 'whole' })}>整机结构</button>
          <button type="button" className="iu-button" aria-pressed={scene.view === 'optics'} onClick={() => onPatch({ view: 'optics', rays: true })}>内部光路</button>
        </div>
        <SimChecks items={[{ id: 'rays', label: '显示光路', checked: scene.rays }]} onChange={(_, checked) => onPatch({ rays: checked })} />
        <p className="sim-note">三维光路为「示例参数 · 原理计算」，与目镜视场的读数分开看：目镜里才是当前样品的边界。</p>
      </SimPanel>
      <details className="sim-sources">
        <summary>依据与适用范围</summary>
        <p>光学案例按<strong>理想均质、单色 589 nm、平行接触层</strong>计算，与已复核的折射仪资产同一套程序；双折射样品在目镜里出现两条边界，三维只画其中一条代表路径。</p>
        <p>仪器尺寸、刻度与内部处方未经实物标定；读数练习不等同于鉴定结论。</p>
      </details>
      <ResetAllButton onReset={onReset} />
    </>
  );

  return <SimShell sim={sim} screen={screen} onScreen={onScreen ?? (() => {})} hideScreens={embedded} play={play} panels={panels} />;
}

/** 只改场景的操作：与实验屏共用同一套课程域规则，但不记任务进度。 */
function readoutFor(scene: LabScene, sample: SampleDef, view: string): string {
  if (view === 'off') return '电源关闭，视场无观察光。打开电源，先看空载刻度。';
  if (view === 'scale-only') return scene.liquid === 'none' ? '尚未滴加接触液：只有空载刻度。' : '存在空气间隙：边界不是样品读数，需轻推贴合。';
  if (view === 'oil-empty') return '尚未放置样品：接触液已在窗口上。';
  if (view === 'over-range') return '样品超出接触液可测上限，只能记录「> 1.780」。';
  if (view === 'spot') return '转动样品到影点对半，再估读两位小数。';
  return sample.characteristics.opticalCharacter === 'isotropic' ? '接触良好，读明暗边界。' : '接触良好：双折射样品有两条边界，分别估读。';
}

const opticalLabel = (sample: SampleDef) => ({ isotropic: '均质体', 'uniaxial-positive': '一轴晶（+）', 'uniaxial-negative': '一轴晶（−）', 'biaxial-positive': '二轴晶（+）', 'biaxial-negative': '二轴晶（−）', aggregate: '多晶质集合体' })[sample.characteristics.opticalCharacter];

function referenceRange(sample: SampleDef): string {
  const ri = sample.characteristics.refractiveIndex;
  if (typeof ri === 'number') return ri.toFixed(3);
  if (ri === 'over-1.78') return '> 1.780';
  return `${ri[0].toFixed(3)} – ${ri[1].toFixed(3)}`;
}

/** 记录读数：与 2D 检测同一套输入（点测只给近似读数；超量程只记「> 1.780」，不填数值）。 */
function RefractometerRecord({ scene, sample, method, view, min, max, onMin, onMax, onClose, onSave, onNotify, reference }: {
  scene: LabScene; sample: SampleDef; method: 'facet' | 'spot'; view: string;
  min: string; max: string; onMin: (value: string) => void; onMax: (value: string) => void;
  onClose: () => void; onSave: (record: ReadingRecord) => void; onNotify: (text: string) => void;
  reference?: ReactNode;
}) {
  const spot = method === 'spot';
  const over = isOverContactLimit(sample);
  const mayRead = view === 'single' || view === 'double' || view === 'spot';
  // 超量程：操作条件满足（视场到 over-range）就能记「> 1.780」，不需要填数值。
  const maySaveOver = over && view === 'over-range';
  const numeric = Number(min);
  const upper = max.trim() === '' ? null : Number(max);
  const valid = mayRead && !over && min.trim() !== '' && Number.isFinite(numeric) && numeric >= 1.3 && numeric <= CONTACT_INDEX
    && (upper === null || (Number.isFinite(upper) && upper >= numeric && upper <= CONTACT_INDEX));
  const summary = `折射率 ${min}${upper === null ? '' : ` – ${max}`}`;
  const record: ReadingRecord = { summary, min: numeric, max: upper, overLimit: false, valid };
  const overRecord: ReadingRecord = { summary: '折射率 > 1.780（超折射油）', min: null, max: null, overLimit: true, valid: true };
  return (
    <section className="sim-sheet sim-record" data-testid="sim-refracto-record" aria-label="记录读数">
      <header><strong>记录读数</strong><button type="button" onClick={onClose} data-testid="sim-refracto-record-close">收起 ▾</button></header>
      <div className="sim-sheet__body">
        {over ? (
          <p className="sim-note" data-testid="sim-refracto-over-oil">视场只到 1.780 的阴影边界：本次应记录为 <strong>折射率 &gt; 1.780</strong>，不能填具体数值。</p>
        ) : (
          <div className="sim-record__inputs">
            <div className="sim-record__row">
              <label htmlFor="refracto-min">{spot ? '近似读数' : '折射率读数'}</label>
              <input id="refracto-min" type="number" step="0.001" inputMode="decimal" value={min} disabled={!mayRead} onChange={(event) => onMin(event.target.value)} data-testid="sim-refracto-reading" />
              <span>nD{spot ? ' · 点测取两位小数' : ''}</span>
            </div>
            {method === 'facet' && (
              <div className="sim-record__row">
                <label htmlFor="refracto-max">高值（双折射）</label>
                <input id="refracto-max" type="number" step="0.001" inputMode="decimal" value={max} disabled={!mayRead} onChange={(event) => onMax(event.target.value)} placeholder="均质体可留空" data-testid="sim-refracto-reading-max" />
                <span>nD</span>
              </div>
            )}
            {spot && <p className="sim-note">点测只给两位小数的近似读数，不据此测定双折射率。</p>}
          </div>
        )}
        <div className="sim-record__row">
          <button type="button" className="iu-button iu-button--primary" disabled={over ? !maySaveOver : !valid}
            onClick={() => { const saved = over ? overRecord : record; onSave(saved); onNotify(`已记录：${saved.summary}`); }} data-testid="sim-refracto-save">保存读数</button>
          {!mayRead && !over && <span className="sim-note">先完成操作条件（开灯、滴液、放样、贴合）再读数。</span>}
          {over && !maySaveOver && <span className="sim-note">先把样品放到接触良好，再看边界。</span>}
        </div>
        {scene.saved && (
          <div className="sim-record__saved" data-stale={scene.saved.stale} data-testid="sim-refracto-saved">
            <strong>{scene.saved.stale ? '上一次记录（条件已变，需重新确认）' : '已保存'}</strong>
            <p>{scene.saved.summary}</p>
          </div>
        )}
        {reference}
      </div>
    </section>
  );
}
