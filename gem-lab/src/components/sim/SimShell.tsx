import { createContext, useContext, useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { SIM_SCREEN_LABELS, type SimScreenId, type SimStep, type SimTaskItem } from '../../domain/simSession';
export { taskChecklist, type SimTaskItem } from '../../domain/simSession';
import type { SimDef } from '../../data/sims';
import { SimDrawerProvider, useSimDrawer } from './SimDrawer';
import '../../styles/instrument-ui.css';
import '../../styles/sim-shell.css';
import '../../styles/sim-observe.css';

/**
 * 仿真外壳（PhET 风格）：顶栏（仿真名、投屏、引导任务入口）、操作区为主、控制面板贴右侧、底部屏幕导航。
 * 桌面上引导任务卡停靠在控制面板上方（不浮在操作区里，挡不住模型与读数框）；
 * 手机上控制面板收为底部抽屉，任务卡收为顶部一行、展开后仍在顶部且限高，底部读数框保持可见。
 * 投屏模式：放大字号与操作区，屏幕导航与面板保留（课程操作都在面板里）；Esc 退出，焦点在页内循环。
 */
export function SimShell(props: {
  sim: SimDef;
  screen: SimScreenId;
  onScreen: (screen: SimScreenId) => void;
  /** 顶栏右侧：引导任务入口。 */
  taskSlot?: ReactNode;
  play: ReactNode;
  panels: ReactNode;
  /** 检测流程内联使用时不显示底部屏幕导航（避免离开检测流程）。 */
  hideScreens?: boolean;
}) {
  return <SimDrawerProvider><SimShellBody {...props} /></SimDrawerProvider>;
}

function SimShellBody({ sim, screen, onScreen, taskSlot, play, panels, hideScreens }: {
  sim: SimDef;
  screen: SimScreenId;
  onScreen: (screen: SimScreenId) => void;
  taskSlot?: ReactNode;
  play: ReactNode;
  panels: ReactNode;
  hideScreens?: boolean;
}) {
  const [controlsOpen, setControlsOpen] = useState(false);
  const suppressed = useSimDrawer('controls', controlsOpen);
  const [taskDock, setTaskDock] = useState<HTMLElement | null>(null);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const panelsId = useId();
  // 投屏模式（同课程外壳与偏光镜）：进入时焦点到退出按钮，退出后回到入口；投屏期间 Tab 在页内循环。
  const [projection, setProjection] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null), enterRef = useRef<HTMLButtonElement>(null), exitRef = useRef<HTMLButtonElement>(null);
  const wasProjection = useRef(false);
  useEffect(() => {
    if (projection) exitRef.current?.focus();
    else if (wasProjection.current) enterRef.current?.focus();
    wasProjection.current = projection;
    if (!projection) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setProjection(false); return; }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0], lastItem = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); lastItem?.focus(); }
      if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [projection]);

  return (
    <SimTaskDockContext.Provider value={desktop ? taskDock : null}>
    <div ref={rootRef} className={`sim-shell iu${projection ? ' sim-shell--projection' : ''}`} data-instrument={sim.id} data-testid="sim-shell" data-sim={sim.id} data-screen={screen} data-projection={projection}>
      <header className="sim-shell__top">
        <div className="sim-shell__name"><strong>{sim.name}</strong><span>{SIM_SCREEN_LABELS[screen]}</span></div>
        <button ref={enterRef} type="button" className="iu-button sim-shell__projection" onClick={() => setProjection(true)} aria-label="进入投屏模式" data-testid="sim-projection">投屏模式</button>
        {taskSlot}
      </header>
      {projection && <button ref={exitRef} type="button" className="iu-button sim-shell__projection-exit" onClick={() => setProjection(false)} aria-label="退出投屏模式" data-testid="sim-projection-exit">退出投屏 · Esc</button>}
      <main className="sim-shell__main">
        <section className="sim-shell__play" aria-label={`${sim.name}${SIM_SCREEN_LABELS[screen]}操作区`} data-testid="sim-play">{play}</section>
        <button type="button" className="sim-shell__controls-toggle" aria-expanded={controlsOpen} aria-controls={panelsId} onClick={() => setControlsOpen((open) => !open)} data-testid="sim-controls-toggle">控制 {controlsOpen ? '▾' : '▴'}</button>
        <div className="sim-shell__side">
          <div ref={setTaskDock} className="sim-shell__task-dock" data-testid="sim-task-dock" />
          <aside id={panelsId} className="sim-shell__panels" data-open={controlsOpen} data-suppressed={suppressed} aria-label="控制面板">{panels}</aside>
        </div>
      </main>
      {!hideScreens && (
        <nav className="sim-shell__screens" aria-label="屏幕">
          {sim.screens.map((item) => (
            <button key={item.id} type="button" className="sim-shell__screen" aria-current={item.id === screen ? 'page' : undefined} onClick={() => onScreen(item.id)} data-testid={`sim-screen-${item.id}`}>
              <ScreenIcon id={item.id} />
              <span>{SIM_SCREEN_LABELS[item.id]}</span>
            </button>
          ))}
          <Link to="/" className="sim-shell__home" data-testid="sim-home"><span aria-hidden="true">⌂</span>首页</Link>
        </nav>
      )}
    </div>
    </SimTaskDockContext.Provider>
  );
}

/** 与 sim-shell.css 的手机断点（max-width: 680px）对应。 */
const DESKTOP_QUERY = '(min-width: 681px)';

/** 桌面布局（与手机断点对应）：观察面板展开时仪器向右让位只在桌面上做。 */
export const useDesktopLayout = () => useMediaQuery(DESKTOP_QUERY);

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const change = () => setMatches(list.matches);
    change();
    list.addEventListener('change', change);
    return () => list.removeEventListener('change', change);
  }, [query]);
  return matches;
}

/** 桌面上任务卡的停靠位（控制面板上方）；手机或外壳之外为 null，任务卡留在原处渲染。 */
const SimTaskDockContext = createContext<HTMLElement | null>(null);

/** 把引导任务卡（含收起后的一行、选讲师 / 学员的开场卡）送到停靠位。 */
export function SimTaskDock({ children }: { children: ReactNode }) {
  const dock = useContext(SimTaskDockContext);
  return dock ? createPortal(children, dock) : <>{children}</>;
}

function ScreenIcon({ id }: { id: SimScreenId }) {
  if (id === 'learn') return <svg viewBox="0 0 34 22" aria-hidden="true"><path d="M4 18 L11 6 H24 L30 18 Z" fill="currentColor" opacity=".55" /><path d="M9 13 H26" stroke="currentColor" strokeWidth="1.6" /></svg>;
  if (id === 'lab') return <svg viewBox="0 0 34 22" aria-hidden="true"><rect x="2" y="7" width="9" height="8" rx="1" fill="currentColor" opacity=".55" /><polygon points="14,10 18,7 22,10 20,15 16,15" fill="currentColor" /><rect x="24" y="9" width="9" height="4" rx="2" fill="currentColor" opacity=".55" /></svg>;
  return <svg viewBox="0 0 34 22" aria-hidden="true"><polygon points="13,5 17,2 21,5 19,12 15,12" fill="currentColor" opacity=".55" /><text x="17" y="21" textAnchor="middle" fontSize="8" fill="currentColor">?</text></svg>;
}

/** 贴边控制面板：标题可点收起（同 PhET 可折叠面板）。 */
export function SimPanel({ title, hint, children, testId }: { title: string; hint?: string; children: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  return (
    <section className="sim-panel" data-testid={testId}>
      <h3><button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((value) => !value)}><span>{title}</span>{hint && <small>{hint}</small>}<i aria-hidden="true">{open ? '−' : '+'}</i></button></h3>
      <div id={bodyId} className="sim-panel__body" hidden={!open}>{children}</div>
    </section>
  );
}

/** 显示 / 隐藏复选框组（显示光路、显示名称、显示数值）。 */
export function SimChecks({ items, onChange }: { items: readonly { id: string; label: string; checked: boolean }[]; onChange: (id: string, checked: boolean) => void }) {
  return (
    <div className="sim-checks">
      {items.map((item) => <label key={item.id}><input type="checkbox" checked={item.checked} onChange={(event) => onChange(item.id, event.target.checked)} data-testid={`sim-check-${item.id}`} />{item.label}</label>)}
    </div>
  );
}

/** 全部重置（PhET 橙色圆钮）：只恢复当前屏场景，任务进度与学习记录不受影响。 */
export function ResetAllButton({ onReset }: { onReset: () => void }) {
  return <button type="button" className="sim-reset" onClick={onReset} aria-label="全部重置（只恢复当前屏）" title="全部重置（只恢复当前屏）" data-testid="sim-reset">↺</button>;
}

/** 操作区内的读数框：可收起，不挡模型。placement 决定停靠位置。 */
export function SimReadout({ title, meta, placement = 'bottom-left', children, testId }: { title: string; meta?: string; placement?: 'bottom-left' | 'top-right'; children: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  return (
    <div className={`sim-readout sim-readout--${placement}`} data-testid={testId} data-open={open}>
      <button type="button" className="sim-readout__head" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((value) => !value)}>
        <strong>{title}</strong>{meta && <span>{meta}</span>}<i aria-hidden="true">{open ? '▾' : '▸'}</i>
      </button>
      <div id={bodyId} hidden={!open} className="sim-readout__body">{children}</div>
    </div>
  );
}

export interface SimTool { id: string; label: string; icon: ReactNode; used?: boolean }

/** 工具箱：拖入操作区，或「点选工具 → 点放置位」（拖动替代，WCAG 2.5.7）。 */
export function SimToolbox({ tools, selected, onSelect }: { tools: readonly SimTool[]; selected: string | null; onSelect: (id: string | null) => void }) {
  return (
    <div className="sim-toolbox" role="group" aria-label="工具箱" data-testid="sim-toolbox">
      {tools.map((tool) => (
        <button key={tool.id} type="button" className="sim-tool" draggable={!tool.used} disabled={tool.used} aria-pressed={selected === tool.id}
          onClick={() => onSelect(selected === tool.id ? null : tool.id)}
          onDragStart={(event) => { event.dataTransfer.setData('text/sim-tool', tool.id); event.dataTransfer.effectAllowed = 'move'; }}
          data-testid={`sim-tool-${tool.id}`}>
          <span aria-hidden="true">{tool.icon}</span>{tool.label}
        </button>
      ))}
      {selected && <span className="sim-toolbox__hint" role="status">点操作区放置「{tools.find((tool) => tool.id === selected)?.label}」</span>}
    </div>
  );
}

/** 放置位：接收工具箱拖入，或选中工具后点击放置。 */
export function SimDropZone({ label, selectedTool, onPlace, children, testId }: { label: string; selectedTool: string | null; onPlace: (toolId: string) => void; children?: ReactNode; testId?: string }) {
  const [over, setOver] = useState(false);
  const drop = (event: DragEvent) => { event.preventDefault(); setOver(false); const id = event.dataTransfer.getData('text/sim-tool'); if (id) onPlace(id); };
  return (
    <button type="button" className="sim-dropzone" data-over={over} data-armed={!!selectedTool} aria-label={selectedTool ? `放置到${label}` : label} disabled={!selectedTool && !children}
      onClick={() => selectedTool && onPlace(selectedTool)}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop} data-testid={testId}>
      {children ?? <span>{label}</span>}
    </button>
  );
}


/**
 * 引导任务卡：可收起（只隐藏卡片，不清进度）；「重新开始任务」单独一个按钮。
 * 桌面停靠在控制面板上方；手机收起时为顶部一行，展开后在操作区顶部、限高可滚动。
 * progress 给定时按步骤数显示 n / N（条目数多于步骤时更贴近实际进度）。
 */
export function SimTaskCard({ title, items, open, onOpen, onRestart, progress, children }: {
  title: string;
  items: readonly SimTaskItem[];
  open: boolean;
  onOpen: (open: boolean) => void;
  onRestart: () => void;
  progress?: { done: number; total: number };
  children?: ReactNode;
}) {
  const suppressed = useSimDrawer('task', open);
  const done = progress?.done ?? items.filter((item) => item.done).length;
  const total = progress?.total ?? items.length;
  if (!open) return <SimTaskLine title={title} done={done} total={total} onOpen={() => onOpen(true)} />;
  return (
    <SimTaskDock>
    <section className="sim-task" aria-label="引导任务" data-testid="sim-task" data-suppressed={suppressed}>
      <header><span>引导任务 · {done} / {total}</span><button type="button" onClick={() => onOpen(false)} aria-expanded="true" data-testid="sim-task-close">收起 ▾</button></header>
      <strong>{title}</strong>
      <ul>{items.map((item) => <li key={item.id} data-done={item.done}><span aria-hidden="true">{item.done ? '✓' : '○'}</span>{item.label}<span className="iu-sr">{item.done ? '（已完成）' : '（未完成）'}</span></li>)}</ul>
      {children}
      <button type="button" className="sim-task__restart" onClick={onRestart} data-testid="sim-task-restart">重新开始任务</button>
    </section>
    </SimTaskDock>
  );
}

/** 收起后的任务卡：顶部一行，点开恢复卡片（手机与桌面同一形态）。 */
export function SimTaskLine({ title, done, total, onOpen }: { title: string; done: number; total: number; onOpen: () => void }) {
  return <SimTaskDock><button type="button" className="sim-task-line" onClick={onOpen} aria-expanded="false" data-testid="sim-task-open"><strong>引导任务 {done} / {total}</strong><span>{title}</span><i aria-hidden="true">▸</i></button></SimTaskDock>;
}

/** 操作区里的记录面板：桌面为右上浮卡，手机为底部抽屉；与任务、控制抽屉互不叠放。由外部按钮控制开合。 */
export function SimSheet({ title, onClose, children, testId }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}) {
  const suppressed = useSimDrawer('record', true);
  return (
    <section className="sim-sheet" data-suppressed={suppressed} data-testid={testId} aria-label={title}>
      <header><strong>{title}</strong><button type="button" onClick={onClose} data-testid={testId ? `${testId}-close` : undefined}>收起 ▾</button></header>
      <div className="sim-sheet__body">{children}</div>
    </section>
  );
}

export { stepBarStates, type SimStep } from '../../domain/simSession';

/**
 * 引导课程的步骤条（操作区顶部，桌面显示；手机上任务卡已收为顶部一行，不再重复）。
 * 只表示进度，不能点击跳步：跳步只来自带 step= 的深链，并按跳步处理学习记录。
 */
export function SimStepBar({ steps }: { steps: readonly SimStep[] }) {
  return (
    <ol className="sim-stepbar" aria-label="引导课程进度" data-testid="sim-stepbar">
      {steps.map((step, index) => (
        <li key={step.id} data-state={step.state} aria-current={step.state === 'current' ? 'step' : undefined}>
          <span aria-hidden="true">{step.state === 'done' ? '✓' : index + 1}</span>{step.label}
          {step.state === 'done' && <span className="iu-sr">（已完成）</span>}
        </li>
      ))}
    </ol>
  );
}

/** 观察面板展开时三维仪器向右平移的比例（同偏光镜实验屏）。 */
export const OBS_VIEW_SHIFT = 0.24;

/**
 * 观察面板（观察区改版 P2，沿用偏光镜实验屏 P1a）：「眼」放观察结果，「手」放紧贴结果的调节控件，底部是当前条件条。
 * 桌面贴在操作区左侧、可收起；展开时由调用方让三维仪器右移 {@link OBS_VIEW_SHIFT}。手机上贴底、限高、可在面板内滚动。
 */
export function SimObsPanel({ title, meta, open, onOpen, guided, eye, eyeLabel = '目镜视场', beside, hand, handLabel, conditions, layout = 'side', testId }: {
  title: string;
  meta?: ReactNode;
  open: boolean;
  onOpen: (open: boolean) => void;
  /** 引导模式顶部有步骤条，面板让到它下方。 */
  guided: boolean;
  eye: ReactNode;
  eyeLabel?: string;
  /** 紧挨观察结果的说明与记录（side 布局在眼右侧，stack 布局在眼下方）。 */
  beside?: ReactNode;
  hand?: ReactNode;
  handLabel?: string;
  conditions?: readonly { label: string; value: ReactNode }[];
  /** side：眼与结果说明左右并排（圆形目镜）；stack：眼占整行（谱条等横向读数）。 */
  layout?: 'side' | 'stack';
  testId?: string;
}) {
  const bodyId = useId();
  return (
    <section className="sim-obs" data-open={open} data-guided={guided} data-layout={layout} aria-label={title} data-testid={testId}>
      <header className="sim-obs__head">
        <strong>{title}</strong>{meta && <span>{meta}</span>}
        <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => onOpen(!open)} data-testid="sim-obs-toggle">{open ? '收起 ▾' : '展开 ▸'}</button>
      </header>
      <div id={bodyId} className="sim-obs__body" hidden={!open}>
        <div className="sim-obs__eye">
          <span className="sim-obs__role"><b>眼</b>{eyeLabel}</span>
          {eye}
        </div>
        {beside && <div className="sim-obs__beside">{beside}</div>}
        {hand && (
          <div className="sim-obs__hand">
            {handLabel && <span className="sim-obs__role"><b>手</b>{handLabel}</span>}
            {hand}
          </div>
        )}
        {conditions && conditions.length > 0 && (
          <dl className="sim-obs__conditions" aria-label="当前条件" data-testid="sim-obs-conditions">
            {conditions.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
          </dl>
        )}
      </div>
    </section>
  );
}
