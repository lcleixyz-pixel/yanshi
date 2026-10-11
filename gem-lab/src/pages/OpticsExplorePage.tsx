import { useEffect, useRef, useState } from 'react';
import { useResponsiveViewport } from '../components/shared/useResponsiveViewport';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import Header from '../components/shared/Header';
import { createOpticsViewer, type OpticsSnapshot, type OpticsViewer } from '../components/optics3d/opticsViewer.js';
import { isOpticsInstrument, OPTICS_INSTRUMENTS, opticsAssetBase, type OpticsInstrumentId } from '../components/optics3d/opticsInstruments';
import '../styles/instrument-ui.css';
import '../styles/microscope-explore.css';
import RangeControl from '../components/shared/RangeControl';
import RefractometerCourse from '../components/refractometer3d/RefractometerCourse';
import SpectroscopeCourse, { GratingSpectroscopeCourse } from '../components/spectroscope/SpectroscopeCourse';

/** 有引导课程的 3D 光学仪器：入口说明与课程组件。 */
const COURSES = {
  refractometer: { title: '基础读数课', minutes: 9, intro: '从接触恢复到自主读数与换方向复核。固定尖晶石教学样品，先记录再核对。', Course: RefractometerCourse },
  'prism-spectroscope': { title: '基础观察课', minutes: 8, intro: '从对光、调狭缝与焦距到标记吸收特征。固定红宝石教学样品，先标记再核对。', Course: SpectroscopeCourse },
  'grating-spectroscope': { title: '观察课', minutes: 7, intro: '固定狭缝与焦距：从对光、调亮度与对准到在线性刻度上标记吸收特征。固定红宝石教学样品，先标记再核对。', Course: GratingSpectroscopeCourse },
} as const satisfies Partial<Record<OpticsInstrumentId, { title: string; minutes: number; intro: string; Course: typeof RefractometerCourse }>>;
const courseFor = (id: OpticsInstrumentId) => (id in COURSES ? COURSES[id as keyof typeof COURSES] : null);

export default function OpticsExplorePage() {
  const { instrumentId } = useParams<{ instrumentId: string }>();
  // 课程由地址驱动（?course=basic&mode=student|teacher），知识库可以直接打开；未写 mode 时按讲师演示，与偏光镜一致。
  const [searchParams, setSearchParams] = useSearchParams();
  const courseMode = searchParams.get('course') === 'basic' ? (searchParams.get('mode') === 'student' ? 'student' : 'teacher') : null;
  const setCourseMode = (mode: 'student' | 'teacher' | null) => setSearchParams(mode ? { course: 'basic', mode } : {}, { replace: !mode });
  if (!isOpticsInstrument(instrumentId)) return <Navigate to="/" replace />;
  const course = courseFor(instrumentId);
  // 课程内切换讲师 / 学员只改地址，不重新挂载，进度保留（同偏光镜）；?step= 直达某一步。
  if (course && courseMode) return <course.Course key={instrumentId} mode={courseMode} onMode={(mode) => setSearchParams({ course: 'basic', mode }, { replace: true })} onExit={() => setCourseMode(null)} initialStep={searchParams.get('step')} />;
  // Remount per instrument so each viewer owns exactly one model.
  return <OpticsExplore key={instrumentId} instrumentId={instrumentId} onStart={setCourseMode} />;
}

function OpticsExplore({ instrumentId, onStart }: { instrumentId: OpticsInstrumentId; onStart: (mode: 'student' | 'teacher') => void }) {
  const info = OPTICS_INSTRUMENTS[instrumentId], assetBase = opticsAssetBase(instrumentId);
  const course = courseFor(instrumentId);
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpticsViewer | null>(null);
  const [snapshot, setSnapshot] = useState<OpticsSnapshot>({ status: 'loading' });
  // 载入失败时原地重试：换一次 attempt 就重新创建查看器，不刷新整页（同偏光镜）。
  const [attempt, setAttempt] = useState(0);

  useResponsiveViewport();

  useEffect(() => {
    if (!viewportRef.current) return;
    setSnapshot({ status: 'loading' });
    const viewer = createOpticsViewer({ container: viewportRef.current, instrument: instrumentId, assetBase, onChange: setSnapshot });
    viewerRef.current = viewer;
    return () => { viewer.dispose(); viewerRef.current = null; };
  }, [instrumentId, assetBase, attempt]);

  const ready = snapshot.status === 'ready' ? snapshot : null;
  // 部件编号热点（同偏光镜自由探索）：编号与部件目录一致，选中的部件高亮；可关闭以免画面拥挤。
  const [showHotspots, setShowHotspots] = useState(true);
  const partIds = ready ? ready.parts.map((part) => part.id).join(' ') : '';
  const selectedPart = ready?.state.selectedId ?? null;
  useEffect(() => {
    if (!partIds) return;
    // 自由探索按遮挡隐藏：整机外观只标外部部件，切到内部光路（外壳透明）再显示内部部件。
    viewerRef.current?.setHotspots(showHotspots ? { ids: partIds.split(' '), selected: selectedPart, hideOccluded: true } : null);
  }, [partIds, selectedPart, showHotspots]);
  const viewer = () => viewerRef.current;
  const siblings = (Object.keys(OPTICS_INSTRUMENTS) as OpticsInstrumentId[]).filter(id => id !== instrumentId);

  return (
    <div className="mic-explore iu" data-testid="optics-explore-page" data-instrument={info.knowledgeId} data-optics={instrumentId}>
      <Header title={info.name} subtitle="3D 结构与光路" />
      <main className="mic-explore__main">
        <section className="mic-explore__viewport" ref={viewportRef} aria-label="三维仪器与光路">
          <nav className="mic-explore__views" aria-label="观察视图">
            <button type="button" aria-pressed={ready?.state.view === 'whole'} disabled={!ready} onClick={() => viewer()?.setView('whole')}>整机结构</button>
            <button type="button" aria-pressed={ready?.state.view === 'optics'} disabled={!ready} onClick={() => viewer()?.setView('optics')}>内部光路</button>
          </nav>
          <span className="mic-explore__stage-label">未标定比例 · 原理示意</span>
          {snapshot.status === 'loading' && <div className="mic-explore__loading" role="status"><i />正在载入模型与光路…</div>}
          {snapshot.status === 'error' && (
            <div className="mic-explore__error" role="alert">
              <img src={`${assetBase}poster.png`} alt={`${info.name}模型静态预览`} />
              <p>三维模型载入失败：{snapshot.error}。上图为静态预览。</p>
              <button type="button" className="iu-button" onClick={() => setAttempt((n) => n + 1)} data-testid="optics-retry">重新载入</button>
            </div>
          )}
          {ready && <div className="mic-explore__help"><small>拖动旋转 · 滚轮缩放 · 箭头表示传播方向</small><p data-testid="optics-case-caption"><strong>{ready.currentCase.label}</strong></p></div>}
        </section>

        <aside className="mic-explore__sidebar" aria-label="光路与部件控制">
          {course && <section className="mic-explore__block" aria-label={course.title}>
            <h2>{course.title} <span>约 {course.minutes} 分钟</span></h2>
            <p className="mic-explore__note">{course.intro}</p>
            {/* 同偏光镜：讲师演示为主要按钮。 */}
            <div className="mic-explore__row"><button type="button" className="iu-button iu-button--primary" onClick={() => onStart('teacher')}>讲师演示</button><button type="button" className="iu-button" onClick={() => onStart('student')}>开始学习（学员）</button></div>
          </section>}
          <section className="mic-explore__block" aria-label="光路示例">
            <h2>光路示例 <span>{instrumentId === 'refractometer' ? 'paper-optics-v2' : 'paper-optics-v1'}</span></h2>
            <select className="opt-explore__select" aria-label="光路示例" disabled={!ready} value={ready?.state.caseId ?? ''} onChange={event => viewer()?.setCase(event.target.value)}>
              {ready?.cases.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <p className="mic-explore__note">{ready?.currentCase.description}</p>
            {!!ready?.currentCase.readout.length && (
              <dl className="opt-explore__readout" data-testid="optics-readout">
                {ready.currentCase.readout.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
              </dl>
            )}
            <label className="mic-explore__check"><input type="checkbox" disabled={!ready} checked={!!ready?.state.rays} onChange={event => viewer()?.setRays(event.target.checked)} />显示代表光路</label>
            <div className="opt-explore__legend" aria-label="光路图例">
              {ready?.currentCase.legend.map(item => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}
            </div>
            <p className={`mic-explore__hint${ready?.suspended ? ' opt-explore__warning' : ''}`}>{ready?.currentCase.conditionNote}</p>
          </section>

          <section className="mic-explore__block" aria-label="结构与部件">
            <h2>结构与部件 <span>{ready ? `${ready.parts.length} 个` : ''}</span></h2>
            <fieldset className="mic-explore__range-field" disabled={!ready}>
              <RangeControl label="连续拆解" min={0} max={100} value={Math.round((ready?.state.explode ?? 0) * 100)} display={`${Math.round((ready?.state.explode ?? 0) * 100)}%`} ends={['装配', '拆开']} onChange={(value) => viewer()?.setExplode(value / 100)} />
            </fieldset>
            <div className="mic-explore__row">
              <button type="button" disabled={!ready} onClick={() => viewer()?.reset()}>全部复位</button>
              <button type="button" disabled={!ready} onClick={() => viewer()?.fit()}>完整视野</button>
            </div>
            <div className="mic-explore__row">
              <button type="button" aria-pressed={!!ready?.state.isolated} disabled={!ready?.selected} onClick={() => viewer()?.toggleIsolate()}>{ready?.state.isolated ? '显示全部' : '隔离所选'}</button>
              <button type="button" disabled={!ready?.selected} onClick={() => viewer()?.focusSelected()}>聚焦所选</button>
            </div>
            <div className="mic-explore__parts" style={{ marginTop: 12 }}>
              {ready?.parts.map((part, index) => <button key={part.id} type="button" aria-pressed={ready.state.selectedId === part.id} onClick={() => viewer()?.select(part.id)}><span className="mic-explore__part-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{part.label}</button>)}
            </div>
            <label className="mic-explore__check"><input type="checkbox" checked={showHotspots} disabled={!ready} onChange={event => setShowHotspots(event.target.checked)} data-testid="optics-show-hotspots" />在模型上显示部件编号</label>
            <p className="mic-explore__note">{ready?.selected ? ready.selected.note : '点模型上的编号或下面的部件，查看作用。'}</p>
          </section>

          <section className="mic-explore__block">
            <details>
              <summary>依据与适用范围</summary>
              <p>{ready?.boundary}</p>
              {!!ready?.sources.length && <ul className="opt-explore__sources">{ready.sources.map(source => (
                <li key={source.title + source.note}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : source.title}{source.note ? ` · ${source.note}` : ''}</li>
              ))}</ul>}
              <p className="mic-explore__links"><a href={`${assetBase}provenance.json`} target="_blank" rel="noreferrer">来源记录</a><a href={`${assetBase}manifest.json`} target="_blank" rel="noreferrer">部件清单</a><Link to={`/knowledge/${info.knowledgeId}`}>返回知识库</Link></p>
            </details>
            <p className="mic-explore__hint">其他仪器：{siblings.map((id, index) => <span key={id}>{index ? ' · ' : ''}<Link to={`/explore/optics/${id}`} className="opt-explore__link">{OPTICS_INSTRUMENTS[id].name}</Link></span>)}</p>
          </section>
        </aside>
      </main>
    </div>
  );
}
