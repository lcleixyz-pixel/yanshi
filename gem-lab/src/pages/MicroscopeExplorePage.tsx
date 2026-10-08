import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/shared/Header';
import { createMicroscopeViewer, type MicroscopeSnapshot, type MicroscopeViewer } from '../components/microscope3d/viewer.js';
import type { LightingMode, MicroscopeEvent, ViewMode } from '../components/microscope3d/reviewState.js';
import '../styles/microscope-explore.css';

export const MICROSCOPE_ASSETS = `${import.meta.env.BASE_URL}assets/3d/gem-microscope/lighting-v3/`;

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'structure', label: '整机' },
  { id: 'chamber', label: '灯室剖解' },
  { id: 'sample', label: '散射体近景' },
];
const MODES: { id: LightingMode; label: string }[] = [
  { id: 'off', label: '关灯' },
  { id: 'darkfield', label: '暗域' },
  { id: 'brightfield', label: '明域' },
];
const percent = (value: number) => `${Math.round(value * 100)}%`;

function cameraFromHash(): number[] | undefined {
  const values = new URLSearchParams(window.location.hash.slice(1)).get('cam')?.split(',').map(Number);
  return values?.length === 6 && values.every(Number.isFinite) ? values : undefined;
}

export default function MicroscopeExplorePage() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<MicroscopeViewer | null>(null);
  const [snapshot, setSnapshot] = useState<MicroscopeSnapshot>({ status: 'loading' });

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
    const viewer = createMicroscopeViewer({ container: viewportRef.current, assetBase: MICROSCOPE_ASSETS, onChange: setSnapshot, camera: cameraFromHash() });
    viewerRef.current = viewer;
    return () => { viewer.dispose(); viewerRef.current = null; };
  }, []);

  const ready = snapshot.status === 'ready' ? snapshot : null;
  const state = ready?.state, derived = ready?.derived;
  const send = (event: MicroscopeEvent, focus = false) => viewerRef.current?.dispatch(event, focus);
  const viewNote = !ready ? '' : derived!.suspended ? derived!.message : state!.viewMode === 'sample'
    ? '同一个固定散射体，仅比较入射照明；不是目镜或真实宝石成像。夹具可能遮住局部光线，本近景未模拟其阴影。'
    : state!.showRays ? '金色：底光准直后的代表路径，暗域经两次反射；金色虚线：不改变方向的延伸；蓝色虚线：散射方向示例。紫线：顶光；橙线：侧光（整机视图可见）。'
    : state!.viewMode === 'chamber' ? '前侧局部剖开，上部暂隐。中央锥体可退出，光阑用短把手调节；腔体受光为实时灯光近似。'
    : '整机外形沿用 KSW6000 候选；进入灯室剖解，查看底光与短行程切换。';

  return (
    <div className="mic-explore" data-testid="microscope-explore-page">
      <Header title="宝石显微镜" subtitle="3D 三路照明" />
      <main className="mic-explore__main">
        <section className="mic-explore__viewport" ref={viewportRef} aria-label="显微镜三维教学区">
          <nav className="mic-explore__views" aria-label="观察视图">
            {VIEWS.map(view => (
              <button key={view.id} type="button" aria-pressed={state?.viewMode === view.id} disabled={!ready} onClick={() => send({ type: 'view', value: view.id }, true)}>{view.label}</button>
            ))}
          </nav>
          <span className="mic-explore__stage-label">未标定比例 · 原理示意</span>
          {snapshot.status === 'loading' && <div className="mic-explore__loading" role="status"><i />正在载入显微镜模型（约 4.9 MB）…</div>}
          {snapshot.status === 'error' && (
            <div className="mic-explore__error" role="alert">
              <img src={`${MICROSCOPE_ASSETS}poster.webp`} alt="宝石显微镜三路照明模型静态预览" />
              <p>三维模型载入失败：{snapshot.error}。上图为静态预览。</p>
              <button type="button" onClick={() => window.location.reload()}>重新载入</button>
            </div>
          )}
          {ready && <div className="mic-explore__help"><small>拖动旋转 · 滚轮缩放 · 点选部件</small><p data-testid="microscope-view-note">{viewNote}</p></div>}
        </section>

        <aside className="mic-explore__sidebar" aria-label="照明与部件控制">
          <section className="mic-explore__block" aria-label="底光控制">
            <h2>底光照明 <span>明域 / 暗域</span></h2>
            <div className="mic-explore__segmented" role="group" aria-label="底光模式">
              {MODES.map(mode => (
                <button key={mode.id} type="button" aria-pressed={derived?.mode === mode.id} disabled={!ready} onClick={() => send({ type: 'mode', value: mode.id })}>{mode.label}</button>
              ))}
            </div>
            <p className="mic-explore__note">{derived?.message}</p>
            <Range disabled={!ready} label="底光亮度" value={state?.brightness} onChange={value => send({ type: 'brightness', value })} />
            <Range disabled={!ready} label="光阑开度" value={state?.irisOpen} onChange={value => send({ type: 'iris', value })} />
            <Check disabled={!ready} label="显示代表光路" checked={state?.showRays} onChange={value => send({ type: 'rays', value }, state?.viewMode === 'chamber')} />
            <Check disabled={!ready} label="放置固定散射体" checked={state?.showSample} onChange={value => send({ type: 'sample', value })} />
            <p className="mic-explore__hint">也可以直接点模型上的明暗切换钮，或横向拖动光阑短把手。</p>
          </section>

          <section className="mic-explore__block" aria-label="顶光控制">
            <h2>顶光照明 <span>LED + 漫射板 · 6500K</span></h2>
            <button type="button" className="mic-explore__toggle" aria-pressed={!!state?.topOn} disabled={!ready} onClick={() => send({ type: 'topPower', value: !state?.topOn })}>{state?.topOn ? '顶光 开' : '顶光 关'}</button>
            <p className="mic-explore__note">{derived?.topMessage}</p>
            <Range disabled={!ready} label="顶光亮度" value={state?.topBrightness} onChange={value => send({ type: 'topBrightness', value })} />
          </section>

          <section className="mic-explore__block" aria-label="侧光控制">
            <h2>侧光照明 <span>鹅颈光导</span></h2>
            <button type="button" className="mic-explore__toggle" aria-pressed={!!state?.sideOn} disabled={!ready} onClick={() => send({ type: 'sidePower', value: !state?.sideOn })}>{state?.sideOn ? '侧光 开' : '侧光 关'}</button>
            <p className="mic-explore__note">{derived?.sideMessage}</p>
            <Range disabled={!ready} label="侧光亮度" value={state?.sideBrightness} onChange={value => send({ type: 'sideBrightness', value })} />
            <p className="mic-explore__hint">三路照明可同时开启组合使用。顶光、侧光从台面上方照射，不受光阑和明暗域切换影响。</p>
          </section>

          <section className="mic-explore__block" aria-label="装配与拆解">
            <h2>装配与拆解 <span>{state ? percent(state.explode) : ''}</span></h2>
            <input type="range" min={0} max={100} step={1} aria-label="连续拆解" disabled={!ready} value={Math.round((state?.explode ?? 0) * 100)} onChange={event => send({ type: 'explode', value: Number(event.target.value) / 100 }, true)} />
            <Check disabled={!ready} label="剖开灯室前侧" checked={state?.cutaway} onChange={value => send({ type: 'cutaway', value })} />
            <p className="mic-explore__hint">剖切只为查看内部，不代表实际拆卸。拆解或隔离时暂停光学示意。</p>
            <div className="mic-explore__row">
              <button type="button" disabled={!ready} onClick={() => send({ type: 'reset' }, true)}>全部复位</button>
              <button type="button" disabled={!ready} onClick={() => viewerRef.current?.fit()}>完整视野</button>
            </div>
          </section>

          <section className="mic-explore__block" aria-label="部件介绍">
            <h2>部件介绍 <span>{ready ? `${ready.parts.length} 个` : ''}</span></h2>
            <div className="mic-explore__parts">
              {ready?.parts.map(part => (
                <button key={part.id} type="button" aria-pressed={state?.selectedId === part.id} onClick={() => viewerRef.current?.select(part.id)}>
                  {part.label}<span>{part.exterior ? '外形' : '示意'}</span>
                </button>
              ))}
            </div>
            <div className="mic-explore__row">
              <button type="button" aria-pressed={!!state?.isolated} disabled={!ready?.selected} onClick={() => send({ type: 'isolate', value: !state?.isolated }, true)}>{state?.isolated ? '显示全部' : '隔离所选'}</button>
              <button type="button" disabled={!ready?.selected} onClick={() => viewerRef.current?.focusSelected()}>聚焦所选</button>
            </div>
            <p className="mic-explore__note">{ready?.selected ? `${ready.selected.label}：${ready.selected.note}` : '从模型或列表选择部件，查看结构与作用。'}</p>
          </section>

          <section className="mic-explore__block">
            <details>
              <summary>来源、教学简化与边界</summary>
              <p>三路照明按《宝石显微镜光源系统设计与改造》（2014，宝石和宝石学杂志 16(4):61–69）图 1 的顶光、底光、侧光三个独立开关组织。底光按 §3.3：单一 LED 底光先准直；暗域时中央锥体进入光轴，将光导向外围腰形反射器，再斜向照射样品；明域时中央组件退出，保留轴向光束。顶光按 §3.1：LED 灯珠群加漫射板、亮度连续可调、色温 6500K。</p>
              <p>整机外形为 KSW6000 生成候选，内部结构、尺寸、曲面与运动是教学简化，不声称还原厂家内部或隐藏传动，数值未经实物标定。顶光漫射板位置取自灯头出光面实际网格，灯珠排列为示意；模型中细鹅颈轴线偏离样品约 44–54°，实机需手动弯折对准，本页按已对准样品示意。</p>
              <p>腔体明暗使用实时灯光近似，未做反射光线追踪；金色、紫色、橙色线是代表光路。固定散射体由独立场景只接受仪器灯照明；散射体近景是外侧观察，不是目镜视野，也不模拟真实宝石的折射、反射、薄膜干涉或包裹体成像。</p>
              <p className="mic-explore__links"><a href={`${MICROSCOPE_ASSETS}provenance.json`} target="_blank" rel="noreferrer">来源记录</a><a href={`${MICROSCOPE_ASSETS}manifest.json`} target="_blank" rel="noreferrer">资产清单</a><Link to="/">返回工作台</Link></p>
            </details>
          </section>
        </aside>
      </main>
    </div>
  );
}

function Range({ label, value, disabled, onChange }: { label: string; value: number | undefined; disabled: boolean; onChange: (value: number) => void }) {
  return (
    <label className="mic-explore__range">
      <span>{label}<output>{value === undefined ? '' : percent(value)}</output></span>
      <input type="range" min={0} max={100} step={1} aria-label={label} disabled={disabled} value={Math.round((value ?? 0) * 100)} onChange={event => onChange(Number(event.target.value) / 100)} />
    </label>
  );
}

function Check({ label, checked, disabled, onChange }: { label: string; checked: boolean | undefined; disabled: boolean; onChange: (value: boolean) => void }) {
  return <label className="mic-explore__check"><input type="checkbox" disabled={disabled} checked={!!checked} onChange={event => onChange(event.target.checked)} />{label}</label>;
}
