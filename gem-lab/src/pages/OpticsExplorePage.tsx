import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import Header from '../components/shared/Header';
import { createOpticsViewer, type OpticsSnapshot, type OpticsViewer } from '../components/optics3d/opticsViewer.js';
import { isOpticsInstrument, OPTICS_INSTRUMENTS, opticsAssetBase, type OpticsInstrumentId } from '../components/optics3d/opticsInstruments';
import '../styles/microscope-explore.css';
import RefractometerCourse from '../components/refractometer3d/RefractometerCourse';

export default function OpticsExplorePage() {
  const { instrumentId } = useParams<{ instrumentId: string }>();
  const [courseMode, setCourseMode] = useState<'student' | 'teacher' | null>(null);
  if (!isOpticsInstrument(instrumentId)) return <Navigate to="/" replace />;
  if (instrumentId === 'refractometer' && courseMode) return <RefractometerCourse key={courseMode} mode={courseMode} onExit={() => setCourseMode(null)} />;
  // Remount per instrument so each viewer owns exactly one model.
  return <OpticsExplore key={instrumentId} instrumentId={instrumentId} onStart={setCourseMode} />;
}

function OpticsExplore({ instrumentId, onStart }: { instrumentId: OpticsInstrumentId; onStart: (mode: 'student' | 'teacher') => void }) {
  const info = OPTICS_INSTRUMENTS[instrumentId], assetBase = opticsAssetBase(instrumentId);
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpticsViewer | null>(null);
  const [snapshot, setSnapshot] = useState<OpticsSnapshot>({ status: 'loading' });

  useLayoutEffect(() => {
    // Same as the polariscope route: responsive here, restore the fixed teaching viewport on exit.
    const existingViewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const viewport = existingViewport ?? document.createElement('meta');
    const previousContent = viewport.getAttribute('content');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width, initial-scale=1';
    if (!existingViewport) document.head.appendChild(viewport);
    return () => {
      if (!existingViewport) viewport.remove();
      else if (previousContent === null) viewport.removeAttribute('content');
      else viewport.setAttribute('content', previousContent);
    };
  }, []);

  useEffect(() => {
    if (!viewportRef.current) return;
    const viewer = createOpticsViewer({ container: viewportRef.current, instrument: instrumentId, assetBase, onChange: setSnapshot });
    viewerRef.current = viewer;
    return () => { viewer.dispose(); viewerRef.current = null; };
  }, [instrumentId, assetBase]);

  const ready = snapshot.status === 'ready' ? snapshot : null;
  const viewer = () => viewerRef.current;
  const siblings = (Object.keys(OPTICS_INSTRUMENTS) as OpticsInstrumentId[]).filter(id => id !== instrumentId);

  return (
    <div className="mic-explore" data-testid="optics-explore-page" data-instrument={instrumentId}>
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
              <button type="button" onClick={() => window.location.reload()}>重新载入</button>
            </div>
          )}
          {ready && <div className="mic-explore__help"><small>拖动旋转 · 滚轮缩放 · 箭头表示传播方向</small><p data-testid="optics-case-caption"><strong>{ready.currentCase.label}</strong></p></div>}
        </section>

        <aside className="mic-explore__sidebar" aria-label="光路与部件控制">
          {instrumentId === 'refractometer' && <section className="mic-explore__block" aria-label="基础读数课">
            <h2>基础读数课 <span>约 9 分钟</span></h2>
            <p className="mic-explore__note">从接触恢复到自主读数与换方向复核。固定尖晶石教学样品，先记录再核对。</p>
            <div className="mic-explore__row"><button type="button" onClick={() => onStart('student')}>开始学习（学员）</button><button type="button" onClick={() => onStart('teacher')}>讲师演示</button></div>
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
            <label className="mic-explore__range">
              <span>连续拆解<output>{Math.round((ready?.state.explode ?? 0) * 100)}%</output></span>
              <input type="range" min={0} max={100} step={1} aria-label="连续拆解" disabled={!ready} value={Math.round((ready?.state.explode ?? 0) * 100)} onChange={event => viewer()?.setExplode(Number(event.target.value) / 100)} />
            </label>
            <div className="mic-explore__row">
              <button type="button" disabled={!ready} onClick={() => viewer()?.reset()}>全部复位</button>
              <button type="button" disabled={!ready} onClick={() => viewer()?.fit()}>完整视野</button>
            </div>
            <div className="mic-explore__row">
              <button type="button" aria-pressed={!!ready?.state.isolated} disabled={!ready?.selected} onClick={() => viewer()?.toggleIsolate()}>{ready?.state.isolated ? '显示全部' : '隔离所选'}</button>
              <button type="button" disabled={!ready?.selected} onClick={() => viewer()?.focusSelected()}>聚焦所选</button>
            </div>
            <div className="mic-explore__parts" style={{ marginTop: 12 }}>
              {ready?.parts.map(part => <button key={part.id} type="button" aria-pressed={ready.state.selectedId === part.id} onClick={() => viewer()?.select(part.id)}>{part.label}</button>)}
            </div>
            <p className="mic-explore__note">{ready?.selected ? ready.selected.note : '选择部件查看作用。'}</p>
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
