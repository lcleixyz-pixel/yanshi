import { useEffect, useReducer } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ResetAllButton, SimChecks, SimDropZone, SimPanel, SimReadout, SimShell, SimTaskCard, SimToolbox, type SimTool } from '../components/sim/SimShell';
import { SIM_IMPLEMENTATIONS } from '../components/sim/registry';
import { useResponsiveViewport } from '../components/shared/useResponsiveViewport';
import { isSimId, SIMS, type SimDef, type SimId } from '../data/sims';
import { createSimSession, parseSimScreen, simReducer, SIM_SCREEN_LABELS, type SimAction, type SimScene, type SimScreenId, type SimSession } from '../domain/simSession';

/** 占位屏的场景：显示开关与放置的工具。迁入真实内容后由各屏自己的场景取代。 */
interface PlaceholderScene extends SimScene { showRays: boolean; showNames: boolean; showValues: boolean; placed: string[]; tool: string | null }
const INITIAL_SCENE: PlaceholderScene = { showRays: true, showNames: false, showValues: true, placed: [], tool: null };
/** 同一台仿真里真实屏与占位屏共存（迁移中）：占位屏只认自己的字段，别屏场景缺字段也不会打崩。 */
const readPlaceholder = (value: SimScene | undefined): PlaceholderScene => {
  const raw = (value ?? {}) as Partial<PlaceholderScene>;
  return {
    showRays: raw.showRays !== false, showNames: raw.showNames === true, showValues: raw.showValues !== false,
    placed: Array.isArray(raw.placed) ? raw.placed.filter((id): id is string => typeof id === "string") : [],
    tool: typeof raw.tool === "string" ? raw.tool : null,
  };
};

const icon = (path: string, fill = 'currentColor') => <svg viewBox="0 0 24 20" width="24" height="20"><path d={path} fill={fill} /></svg>;
const GEM = icon('M6 7 L12 2 L18 7 L15 17 H9 Z');
const TOOLS: Record<SimId, SimTool[]> = {
  refractometer: [{ id: 'liquid', label: '接触液', icon: icon('M12 2 C 8 8, 7 11, 7 13 a5 5 0 0 0 10 0 C 17 11, 16 8, 12 2 Z') }, { id: 'sample', label: '样品', icon: GEM }],
  polariscope: [{ id: 'sample', label: '样品', icon: GEM }, { id: 'sphere', label: '干涉球', icon: icon('M12 3 a7 7 0 1 0 0.01 0 Z') }],
  spectroscope: [{ id: 'sample', label: '样品', icon: GEM }, { id: 'tweezers', label: '镊子', icon: icon('M9 1 H11 L13 19 H11 Z M13 1 H15 L13 19 H11 Z') }, { id: 'table', label: '黑台', icon: icon('M3 11 H21 V15 H3 Z M10 15 H14 V19 H10 Z') }],
  microscope: [{ id: 'sample', label: '样品', icon: GEM }],
};

export default function SimPage() {
  const { simId, screen } = useParams<{ simId: string; screen: string }>();
  if (!isSimId(simId)) return <Navigate to="/" replace />;
  // 每台仿真单独一份会话：换仪器时重新开始，换屏幕时保留。
  return <SimSessionView key={simId} sim={SIMS[simId]} requested={screen} />;
}

function SimSessionView({ sim, requested }: { sim: SimDef; requested: string | undefined }) {
  useResponsiveViewport();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const available = sim.screens.map((item) => item.id);
  const screen = parseSimScreen(requested, available);
  const impl = SIM_IMPLEMENTATIONS[sim.id];
  const [session, dispatch] = useReducer(simReducer, undefined, () => {
    const init = impl?.initial(searchParams);
    const scenes = init?.scenes ?? Object.fromEntries(available.map((id) => [id, INITIAL_SCENE]));
    return createSimSession(screen, scenes, !window.matchMedia('(max-width: 680px)').matches, init ? { options: init.options, taskData: init.taskData } : undefined);
  });
  // 地址是屏幕的唯一来源：不认识的屏幕改写为第一块可用屏幕；会话随地址切换当前屏。
  useEffect(() => {
    if (requested !== screen) navigate(`/sim/${sim.id}/${screen}`, { replace: true });
    dispatch({ type: 'screen', screen });
  }, [requested, screen, sim.id, navigate]);

  const Screen = impl?.screens[screen];
  const onScreen = (next: SimScreenId) => navigate(`/sim/${sim.id}/${next}`);
  // 已迁入的屏幕由自己的组件渲染外壳；其余照旧显示占位屏与现有页面入口。
  if (Screen) return <Screen sim={sim} screen={screen} onScreen={onScreen} session={session} dispatch={dispatch} />;
  return <SimPlaceholder sim={sim} screen={screen} session={session} dispatch={dispatch} onScreen={onScreen} />;
}

/** 迁移中的占位屏（阶段 1）：写明本屏用途，并指向当前提供该内容的现有页面。 */
function SimPlaceholder({ sim, screen, session, dispatch, onScreen }: { sim: SimDef; screen: SimScreenId; session: SimSession; dispatch: React.Dispatch<SimAction>; onScreen: (screen: SimScreenId) => void }) {
  const scene = readPlaceholder(session.scenes[screen]);
  const def = sim.screens.find((item) => item.id === screen)!;
  const available = sim.screens.map((item) => item.id);
  const patch = (value: Partial<PlaceholderScene>) => dispatch({ type: 'patch-scene', screen, patch: value });

  // 外壳演示任务：跨屏、放工具、显示名称。任务进度跨屏保留，「全部重置」不影响。
  const scenes = Object.fromEntries(Object.entries(session.scenes).map(([id, value]) => [id, readPlaceholder(value)]));
  const visitedOther = available.length > 1 && Object.entries(scenes).some(([id, value]) => id !== available[0] && value.placed.length > 0);
  const anyPlaced = Object.values(scenes).some((value) => value.placed.length > 0);
  const anyNames = Object.values(scenes).some((value) => value.showNames);
  const taskItems = [
    { id: 'place', label: '把一件工具放进操作区（拖入，或先点工具再点放置位）', done: session.task.done.includes('place') },
    { id: 'names', label: '勾选「显示名称」', done: session.task.done.includes('names') },
    ...(available.length > 1 ? [{ id: 'other', label: `切到「${SIM_SCREEN_LABELS[available[1]]}」屏，也放一件工具`, done: session.task.done.includes('other') }] : []),
  ];
  useEffect(() => { if (anyPlaced) dispatch({ type: 'task-done', id: 'place' }); }, [anyPlaced]);
  useEffect(() => { if (anyNames) dispatch({ type: 'task-done', id: 'names' }); }, [anyNames]);
  useEffect(() => { if (visitedOther) dispatch({ type: 'task-done', id: 'other' }); }, [visitedOther]);

  const place = (toolId: string) => { if (!scene.placed.includes(toolId)) patch({ placed: [...scene.placed, toolId], tool: null }); };
  const migrated = sim.migrated.includes(screen);
  const tools = TOOLS[sim.id].map((tool) => ({ ...tool, used: scene.placed.includes(tool.id) }));

  const play = (
    <>
      <SimTaskCard title="外壳演示（阶段 1）" items={taskItems} open={session.task.open} onOpen={(open) => dispatch({ type: 'task-open', open })} onRestart={() => dispatch({ type: 'task-restart' })} />
      <div className="sim-placeholder" data-testid="sim-placeholder">
        <span className="iu-eyebrow">{migrated ? '已迁入' : '迁移中'}</span>
        <h2>{sim.name} · {SIM_SCREEN_LABELS[screen]}</h2>
        <p>{def.summary}</p>
        {!migrated && <>
          <p>本屏内容将在后续阶段迁入。迁入前请使用现有页面：</p>
          <nav aria-label="现有页面">{def.current.map((link) => <Link key={link.to} to={link.to} className="iu-button">{link.label}</Link>)}</nav>
        </>}
        <div className="sim-placeholder__stage">
          <SimDropZone label="放置位" selectedTool={scene.tool} onPlace={place} testId="sim-drop" />
          {scene.placed.map((id) => <span key={id} className="sim-placed" data-testid={`sim-placed-${id}`}>{TOOLS[sim.id].find((tool) => tool.id === id)?.label}{scene.showNames ? ' · 已放置' : ''}</span>)}
        </div>
      </div>
      <SimReadout title="本屏状态" meta="示意" testId="sim-readout">
        <span>显示光路：{scene.showRays ? '开' : '关'} · 显示名称：{scene.showNames ? '开' : '关'} · 显示数值：{scene.showValues ? '开' : '关'}</span>
        <span>已放置：{scene.placed.length ? scene.placed.map((id) => TOOLS[sim.id].find((tool) => tool.id === id)?.label).join('、') : '无'}</span>
      </SimReadout>
      <SimToolbox tools={tools} selected={scene.tool} onSelect={(tool) => patch({ tool })} />
    </>
  );

  const panels = (
    <>
      <SimPanel title="显示" testId="sim-panel-display">
        <SimChecks items={[
          { id: 'rays', label: '显示光路', checked: scene.showRays },
          { id: 'names', label: '显示名称', checked: scene.showNames },
          { id: 'values', label: '显示数值', checked: scene.showValues },
        ]} onChange={(id, checked) => patch(id === 'rays' ? { showRays: checked } : id === 'names' ? { showNames: checked } : { showValues: checked })} />
      </SimPanel>
      <SimPanel title="本屏内容" hint={migrated ? '已迁入' : '迁移中'}>
        <p style={{ margin: 0, color: 'var(--iu-muted)' }}>{def.summary}</p>
      </SimPanel>
      <ResetAllButton onReset={() => dispatch({ type: 'reset-scene', screen, initial: INITIAL_SCENE })} />
    </>
  );

  return <SimShell sim={sim} screen={screen} onScreen={onScreen} play={play} panels={panels} />;
}
