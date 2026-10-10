import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../shared/Header';
import RangeControl from '../shared/RangeControl';
import { useMediaQuery } from '../shared/useMediaQuery';
import { useResponsiveViewport } from '../shared/useResponsiveViewport';
import SpectrumStrip from '../spectroscope/SpectrumStrip';
import { SAMPLES, SAMPLES_BY_ID } from '../../data/samples';
import { BENCH_METHOD_LABELS, benchMethodSetup, createBenchState, evaluateBench, type BenchMethod, type BenchState } from '../../domain/spectroscopeBench';
import { useDetection, type SpectroscopeData } from '../../store/detectionStore';
import { benchSpecimenAppearance, createSpectroscopeBenchViewer } from './spectroscopeBenchViewer';
import '../../styles/spectroscope-bench.css';

type RecordSnapshot = { data: SpectroscopeData; state: BenchState; stale: boolean; pending: boolean };
type View = 'whole' | 'lamp' | 'sample' | 'instrument';
const METHODS = Object.keys(BENCH_METHOD_LABELS) as BenchMethod[];
const PARTS: Record<string, string> = {
  Bench_lightSource: '光源箱 · 调节输出亮度', Bench_lampHead: '灯头 · 横移和转向配合对光',
  Bench_tweezers: '镊子 · 夹持样品', Bench_reflectionTable: '黑色放置台面',
  Bench_dimmerKnob: '亮度旋钮', Bench_powerSwitch: '光源电源',
};

/** 观察条件与谱图共用确定性状态；未知样品模式不揭示品种或资料答案。 */
export default function SpectroscopePractice3D({ sampleId, onDetectionComplete, onUse2D }: {
  sampleId?: string;
  onDetectionComplete?: () => void;
  onUse2D?: () => void;
}) {
  const [params] = useSearchParams();
  const detection = !!sampleId;
  const [selectedId, setSelectedId] = useState(() => SAMPLES_BY_ID[params.get('sample') ?? '']?.id ?? 'ruby');
  const sample = SAMPLES_BY_ID[sampleId ?? selectedId] ?? SAMPLES[0];
  const [state, setState] = useState<BenchState>(() => {
    const initial = createBenchState(params.get('instrument') === 'grating' ? 'grating' : 'prism');
    const method = params.get('method') as BenchMethod;
    return METHODS.includes(method) ? { ...initial, method, ...benchMethodSetup(method) } : initial;
  });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [selectedPart, setSelectedPart] = useState('');
  const [view, setView] = useState<View>('whole');
  const [showBeams, setShowBeams] = useState(true);
  const [marks, setMarks] = useState<number[]>([]);
  const [bands, setBands] = useState<Array<{ start: number; end: number }>>([]);
  const [manualWl, setManualWl] = useState('');
  const [bandStart, setBandStart] = useState('');
  const [bandEnd, setBandEnd] = useState('');
  const [noAbsorption, setNoAbsorption] = useState(false);
  const [notes, setNotes] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const [saved, setSaved] = useState<RecordSnapshot | null>(null);
  // 载入失败时原地重试：换一次 attempt 就重新创建查看器，不刷新整页（同偏光镜）。
  const [attempt, setAttempt] = useState(0);
  // 手机上三维区吸附顶部，并叠一条只读小光谱：拖滑杆时模型与谱线同时可见（同课程停靠窗）。
  const phone = useMediaQuery('(max-width: 760px)');
  // 三维页面使用响应式视口（同课程与自由探索页），手机上才会按手机布局显示。
  useResponsiveViewport();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ReturnType<typeof createSpectroscopeBenchViewer> | null>(null);
  const evaluation = useMemo(() => evaluateBench(sample, state), [sample, state]);
  const specimen = useMemo(() => benchSpecimenAppearance(sample), [sample]);

  useEffect(() => {
    if (!hostRef.current) return;
    try {
      const viewer = createSpectroscopeBenchViewer(hostRef.current, {
        onStatus: (next, message) => { setStatus(next); setError(message ?? ''); },
        onSelect: (part) => setSelectedPart(PARTS[part] ?? part),
      });
      viewerRef.current = viewer;
      setStatus('loading');
      return () => { viewer.dispose(); viewerRef.current = null; };
    } catch (cause) {
      setStatus('error');
      setError(cause instanceof Error ? cause.message : '三维视图未能初始化');
    }
  }, [attempt]);
  useEffect(() => { viewerRef.current?.update(state, evaluation, specimen); }, [state, evaluation, specimen, attempt]);
  useEffect(() => { viewerRef.current?.setBeams(showBeams); }, [showBeams]);

  const invalidate = () => {
    setMarks([]); setBands([]); setNoAbsorption(false); setConfirmation(false);
    setSaved((previous) => previous ? { ...previous, stale: true } : null);
  };
  const update = (patch: Partial<BenchState>) => { invalidate(); setState((previous) => ({ ...previous, ...patch })); };
  const changeSample = (id: string) => { invalidate(); setSelectedId(id); setNotes(''); setSaved(null); };
  const changeView = (next: View) => { setView(next); viewerRef.current?.focus(next); };
  const setupOnly = state.method !== 'transmission';
  const pending = evaluation.referenceStatus === 'unverified' || setupOnly;
  const mayObserve = evaluation.canRecord && status === 'ready';
  const hasObservation = marks.length > 0 || bands.length > 0 || noAbsorption;
  const canSave = status === 'ready' && (pending || (mayObserve && hasObservation));
  const addMark = (wl: number) => {
    if (!mayObserve || !Number.isFinite(wl) || wl < 400 || wl > 700) return;
    setMarks((previous) => [...new Set([...previous, Math.round(wl)])].sort((a, b) => a - b));
    setNoAbsorption(false); setConfirmation(false);
  };
  const addBand = () => {
    const start = Number(bandStart), end = Number(bandEnd);
    if (!mayObserve || !bandStart || !bandEnd || start < 400 || end > 700 || start >= end) return;
    setBands((previous) => [...previous, { start, end }]); setNoAbsorption(false); setConfirmation(false);
    setBandStart(''); setBandEnd('');
  };
  const observationText = setupOnly ? '照明布置练习：缺少该样品对应方法的参考谱，未作有效吸收观察' : pending ? '教学谱图未核定，无法判断吸收情况'
    : noAbsorption ? '本次条件下未见明显特征吸收'
    : [...marks.map((wl) => `${wl} nm 线`), ...bands.map((band) => `${band.start}–${band.end} nm 带`)].join('；');
  const recordNotes = [observationText, `三维教学观察；${state.dispersion === 'prism' ? '棱镜式' : '光栅式'}；${BENCH_METHOD_LABELS[state.method]}`,
    `亮度 ${Math.round(state.brightness * 100)}%；灯位 ${Math.round(state.lampLateral * 110)} mm / ${setupOnly ? '相对台面俯角' : '水平偏转'} ${state.lampAngle}°；样品横移 ${Math.round(state.sampleOffset * 35)} mm / 转角 ${state.sampleRotation}°`,
    state.dispersion === 'prism' ? `狭缝 ${Math.round(state.slit * 100)}%；调焦 ${Math.round(state.focus * 100)}%` : '本机型狭缝与焦距固定',
    evaluation.lightPath === 'weak' ? '收光较弱：受限观察，需改善条件复核' : '',
    setupOnly ? '仅保存布置条件，未显示或推定该样品的反射光谱' : '', notes.trim()].filter(Boolean).join('；');
  const save = () => {
    if (!canSave || !confirmation) return;
    const data: SpectroscopeData = { observationStatus: setupOnly ? 'setup-only' : pending ? 'pending-reference' : 'observed', method: state.method, markedLines: pending ? [] : marks, bandRanges: pending ? [] : bands, notes: recordNotes };
    setSaved({ data, state: { ...state }, stale: false, pending }); setConfirmation(false);
    if (detection) {
      useDetection.getState().setSpectroscope(data);
      useDetection.getState().markInstrument('spectroscope');
      onDetectionComplete?.();
    }
  };
  const signalLabel = { off: '光源未就绪', missed: '需要重新对光', bypass: '当前是旁路白光', blocked: '当前方法无法观察', aligned: '可以开始观察', weak: '收光偏弱 · 需复核' }[evaluation.lightPath];
  const setup = benchMethodSetup(state.method);

  return <div className="spectro-bench iu" data-instrument="spectroscope" data-testid="spectroscope-practice-3d" data-light-path={evaluation.lightPath} data-reference-status={evaluation.referenceStatus}>
    <Header title="分光镜" subtitle={detection ? '检测练习' : '照明与夹样练习'} right={<div className="sb-toplinks"><Link to="/knowledge/spectroscope">← 仪器知识库</Link>{onUse2D ? <button className="iu-button" onClick={onUse2D} data-testid="detection-use-2d">改用 2D 版本</button> : <Link to="/demo/spectroscope">2D 演示</Link>}</div>} />
    <main className="sb-main">
      <div className="sb-title-row">
        <div><div className="sb-eyebrow">SPECTROSCOPE PRACTICE <span>03</span></div><h1>摆好样品，找到合适的光路。</h1><p>分光镜观察练习 · {detection ? '检测模式，独立记录未知样品' : '光源、镊子与黑色放置台面'}</p></div>
        <div className="sb-specimen-select">{detection ? <span className="sb-unknown" data-testid="unknown-sample-label">未知样品</span> : <label>练习样品<select aria-label="三维分光镜样品" value={sample.id} onChange={(event) => changeSample(event.target.value)}>{SAMPLES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><small>{SAMPLES.length} 种样品 · 含弱谱、不特征及待核资料</small></label>}</div>
      </div>
      <div className="sb-workspace">
        <section className="sb-observe-column">
          <div className="sb-viewport-card">
            <div className="sb-view-heading"><div className="sb-segment" aria-label="分光镜机型">{(['prism', 'grating'] as const).map((kind) => <button key={kind} aria-pressed={state.dispersion === kind} onClick={() => update({ dispersion: kind })}>{kind === 'prism' ? '棱镜式' : '光栅式'}</button>)}</div><span className="sb-live"><i className={state.power ? 'is-on' : ''} />{state.power ? 'LIGHT ON' : 'LIGHT OFF'}</span></div>
            <div className="sb-scene" ref={hostRef} aria-label="光源、镊子与手持分光镜三维场景" data-testid="bench-scene" />
            {status === 'loading' && <div className="sb-scene-message" role="status"><span className="sb-loader" />正在准备三维观察场景…</div>}
            {status === 'error' && <div className="sb-scene-message sb-scene-error" role="alert"><strong>三维视图暂不可用</strong><p>{error || '可以继续使用 2D 演示进行观察练习。'}</p><button className="iu-button sb-retry" onClick={() => setAttempt((n) => n + 1)} data-testid="bench-retry">重新载入</button>{onUse2D ? <button className="sb-primary" onClick={onUse2D}>改用 2D 检测</button> : <Link to="/demo/spectroscope" className="sb-primary">进入 2D 演示</Link>}</div>}
            {phone && !pending && <div className="sb-mini-spectrum" data-testid="bench-mini-spectrum" aria-hidden="true"><SpectrumStrip features={evaluation.display.features} display={evaluation.display} dispersion={state.dispersion} interactive={false} showFeatureDescriptions={false} height={30} /></div>}
            <div className="sb-scene-caption"><span>{selectedPart || '拖动旋转 · 滚轮缩放 · 点击查看部件'}</span><span>手持操作与尺寸示意</span></div>
            <div className="sb-camera-bar"><div aria-label="观察视角">{([['whole', '全景'], ['lamp', '灯头'], ['sample', '样品'], ['instrument', '分光镜']] as const).map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => changeView(key)}>{label}</button>)}</div><label><input type="checkbox" checked={showBeams} onChange={(event) => setShowBeams(event.target.checked)} />光路示意</label></div>
          </div>
          <section className="sb-spectrum-card" aria-label="目镜观察与波长标记">
            <div className="sb-section-title"><div><span className="sb-step">02</span><h2>观察视场</h2></div><span className={`sb-signal ${mayObserve ? 'is-ready' : ''}`} data-testid="bench-signal">{pending ? '参考谱待核定' : signalLabel}</span></div>
            {pending ? <div className="sb-unverified" data-testid="spectroscope-unverified-spectrum"><strong>{setupOnly ? '本方法先做照明布置练习' : '本样品参考谱尚未核定'}</strong><p>{setupOnly ? '缺少该样品对应方法的谱图依据，先保存布置说明。后续补入方法与样品匹配的资料，再开放有效吸收观察。' : '仍可练习照明与摆样；此处不显示空白光谱，也不将它当作“未见吸收”。'}</p></div> : <SpectrumStrip features={evaluation.display.features} display={evaluation.display} dispersion={state.dispersion} userMarks={marks} onAddMark={addMark} onRemoveMark={(wl) => { setMarks((previous) => previous.filter((value) => value !== wl)); setConfirmation(false); }} showFeatureDescriptions={false} interactive={mayObserve} height={96} />}
            <p className="sb-spectrum-hint">{pending ? '保存待核说明后，可换用其他仪器继续检测。' : mayObserve ? '点击光谱标记吸收线，或在下方输入波长 / 带范围。波长统一以 nm 记录。' : '先调整观察条件；暗场、没有经过样品的白光和未放样都不能作为吸收记录。'}</p>
            <div className="sb-feedback" aria-live="polite">{evaluation.problems.slice(0, 2).map((problem) => <p key={problem}>{problem}</p>)}{!evaluation.problems.length && <p>光已通过样品并进入分光镜。请自行观察并记录，之后再对照资料。</p>}</div>
            {setupOnly && <p className="sb-boundary">{state.method === 'internal-reflection' ? '内反射：较大平面向下；刻面石的光从一侧亭部进入，经台面内侧反射，由另一侧亭部出射。' : '表面反射：样品稳定放在黑色台面，灯与分光镜对准同一片被照亮的上表面区域。'}灯头与分光镜分别位于样品两侧上方，斜向照明和收光。光路为布置示意，本次不显示反射吸收谱。</p>}
          </section>
          <section className="sb-record-card" aria-label="观察记录">
            <div className="sb-section-title"><div><span className="sb-step">03</span><h2>留下你的观察</h2></div><span className="sb-small">调整条件后需重新记录</span></div>
            <fieldset disabled={!mayObserve} className="sb-observation-inputs">
              <div className="sb-mark-entry"><label>吸收线<input aria-label="吸收线波长" type="number" min="400" max="700" placeholder="400–700" value={manualWl} onChange={(event) => setManualWl(event.target.value)} /></label><span>nm</span><button onClick={() => { if (manualWl) addMark(Number(manualWl)); setManualWl(''); }}>添加线</button></div>
              <div className="sb-mark-entry"><label>吸收带<input aria-label="吸收带起点" type="number" min="400" max="700" placeholder="起点" value={bandStart} onChange={(event) => setBandStart(event.target.value)} /></label><span>—</span><input aria-label="吸收带终点" type="number" min="400" max="700" placeholder="终点" value={bandEnd} onChange={(event) => setBandEnd(event.target.value)} /><span>nm</span><button onClick={addBand}>添加带</button></div>
              <label className="sb-no-feature"><input type="checkbox" data-testid="bench-no-absorption" checked={noAbsorption} onChange={(event) => { setNoAbsorption(event.target.checked); setMarks([]); setBands([]); setConfirmation(false); }} />本次条件下未见明显特征吸收</label>
            </fieldset>
            {(marks.length > 0 || bands.length > 0) && <div className="sb-chips">{marks.map((wl) => <button key={wl} onClick={() => { setMarks((previous) => previous.filter((value) => value !== wl)); setConfirmation(false); }}>{wl} nm 线 ×</button>)}{bands.map((band, index) => <button key={`${index}-${band.start}`} onClick={() => { setBands((previous) => previous.filter((_, i) => i !== index)); setConfirmation(false); }}>{band.start}–{band.end} nm 带 ×</button>)}</div>}
            <label className="sb-notes-label">补充说明<textarea aria-label="观察补充说明" value={notes} onChange={(event) => { setNotes(event.target.value); setConfirmation(false); }} placeholder="例如蓝紫区较暗、弱带不确定，或需要换向复核…" rows={2} /></label>
            {confirmation ? <div className="sb-confirm" role="region" aria-label="核对本次记录"><strong>核对本次记录</strong><p>{observationText}</p><p>{state.dispersion === 'prism' ? '棱镜式' : '光栅式'} · {BENCH_METHOD_LABELS[state.method]} · {pending ? '仅作待核说明，不计有效观察' : evaluation.lightPath === 'weak' ? '受限观察，需复核' : '观察条件可用'}</p>{notes && <p>{notes}</p>}<div><button onClick={() => setConfirmation(false)}>返回修改</button><button className="sb-primary" onClick={save} disabled={!canSave} data-testid="bench-confirm-save">确认保存</button></div></div> : <button className="sb-primary sb-save" onClick={() => setConfirmation(true)} disabled={!canSave} data-testid="bench-review-record">{pending ? '核对待核说明' : '核对并保存观察'}</button>}
            {saved && <div className={`sb-saved ${saved.stale ? 'is-stale' : ''}`} data-testid="bench-saved" data-stale={saved.stale}><strong>{saved.stale ? '先前记录已保留，当前条件已改变' : saved.pending ? '待核说明已保存' : '本次观察已保存'}</strong><p>{saved.data.notes}</p>{saved.stale && <p>请重新观察；调回原设置也不会自动确认旧结果。</p>}</div>}
            {!detection && saved && !saved.stale && !pending && <details className="sb-reference" data-testid="bench-reference"><summary>记录后对照资料</summary><p>{sample.spectrum.description}</p>{sample.spectrum.observationNote && <p>{sample.spectrum.observationNote}</p>}<p>模型中的样品形态、体色与收光程度为教学示意，不能代替这颗样品的实测资料。</p></details>}
          </section>
        </section>
        <aside className="sb-controls" aria-label="照明与持样操作">
          <div className="sb-section-title"><div><span className="sb-step">01</span><h2>照明与持样</h2></div><button className="sb-text-button" onClick={() => { invalidate(); setState(createBenchState(state.dispersion)); changeView('whole'); }} data-testid="bench-reset">复位</button></div>
          <section className="sb-control-section"><div className="sb-control-heading"><h3>光源</h3><button role="switch" aria-label="光源电源" aria-checked={state.power} className={`sb-switch ${state.power ? 'is-on' : ''}`} onClick={() => update({ power: !state.power })}><i />{state.power ? '已开启' : '未开启'}</button></div><Slider label="光源亮度" value={state.brightness} onChange={(brightness) => update({ brightness })} display={`${Math.round(state.brightness * 100)}%`} ends={['暗', '亮']} /><p className="sb-control-note">连续可见光源示意。亮度滑杆表示相对光量。</p></section>
          <section className="sb-control-section"><h3>观察方式</h3><div className="sb-methods">{METHODS.map((method, index) => <button key={method} aria-pressed={state.method === method} onClick={() => update({ method, ...benchMethodSetup(method) })}><span>0{index + 1}</span>{BENCH_METHOD_LABELS[method]}</button>)}</div><Slider label="灯头横移" value={state.lampLateral} min={-1} max={1} step={0.01} onChange={(lampLateral) => update({ lampLateral })} display={`${Math.round(state.lampLateral * 110)} mm`} ends={['左', '右']} /><Slider label={setupOnly ? '灯头俯角（相对台面）' : '灯头角度'} value={state.lampAngle} min={setupOnly ? 5 : -75} max={75} step={1} onChange={(lampAngle) => update({ lampAngle })} display={`${state.lampAngle}°`} ends={setupOnly ? ['5°', '75°'] : ['−75°', '75°']} /><details className="sb-hint"><summary>对光提示</summary><p>先让灯头照中样品，再确认样品出光区域对着入光口。{state.method === 'transmission' ? '透射示意从直向照明开始。' : '灯头从一侧上方俯照，分光镜从另一侧上方斜向观察。'}</p><p>照明示意起点：横移约 {Math.round(setup.lampLateral * 110)} mm、{setupOnly ? '相对台面俯角' : '水平偏转'} {setup.lampAngle}°；实际样品需逐步寻找合适位置。{setupOnly && '图示约 45° 是常见起点，需按样品形状与明亮区域微调，并非统一测量条件。'}</p>{!detection && <button onClick={() => update(setup)}>摆到示意起点</button>}</details></section>
          <section className="sb-control-section"><div className="sb-control-heading"><h3>样品</h3><button aria-pressed={state.samplePlaced} className="sb-place" onClick={() => update({ samplePlaced: !state.samplePlaced })} data-testid="bench-place-sample">{state.samplePlaced ? '取下样品' : setupOnly ? '放到黑色台面' : '镊子夹样'}</button></div><Slider label="样品横移" value={state.sampleOffset} min={-1} max={1} step={0.01} onChange={(sampleOffset) => update({ sampleOffset })} display={`${Math.round(state.sampleOffset * 35)} mm`} ends={['左', '右']} /><Slider label="样品转角" value={state.sampleRotation} min={0} max={360} step={1} onChange={(sampleRotation) => update({ sampleRotation })} display={`${state.sampleRotation}°`} ends={['0°', '360°']} /><p className="sb-control-note">{state.method === 'internal-reflection' ? '较大平面向下放稳；刻面石台面朝下、亭部朝上，寻找另一侧亭部的出射亮区。' : state.method === 'surface-reflection' ? '较平的支承面朝下放稳；弧面石弧面朝上，分光镜对准被照亮的表面区域。' : '用镊子夹持样品，保持样品与分光镜入光口对准。'}</p></section>
          <section className="sb-control-section"><h3>{state.dispersion === 'prism' ? '狭缝与调焦' : '固定光学结构'}</h3>{state.dispersion === 'prism' ? <><Slider label="狭缝宽度" value={state.slit} onChange={(slit) => update({ slit })} display={`${Math.round(state.slit * 100)}%`} ends={['窄', '宽']} /><Slider label="调焦位置" value={state.focus} onChange={(focus) => update({ focus })} display={`${Math.round(state.focus * 100)}%`} ends={['缩回', '拉出']} /><p className="sb-control-note">狭缝过宽会模糊，过窄会变暗；抽拉调焦让谱线清晰。</p></> : <p className="sb-control-note">本袖珍光栅式机型的狭缝与焦距固定。请通过照明、摆样改善观察。</p>}</section>
        </aside>
      </div>
      <footer className="sb-footer"><span>从操作 → 观察 → 记录 → 复核</span><p>基于资料参考谱的教学模拟。三维光源、镊子和台面为教学示意；光量与可见性未作实物标定。记录观察不等同于掌握鉴定技能。</p></footer>
    </main>
  </div>;
}

/** 工作台滑杆：共用 RangeControl（标签、读数、两端刻度），数值仍按状态原单位传递。 */
function Slider({ label, value, onChange, display, ends, min = 0, max = 1, step = .01 }: { label: string; value: number; onChange: (value: number) => void; display: string; ends: readonly [string, string]; min?: number; max?: number; step?: number }) {
  return <RangeControl label={label} value={value} min={min} max={max} step={step} display={display} ends={ends} onChange={onChange} />;
}
