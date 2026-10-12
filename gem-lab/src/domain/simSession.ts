/**
 * 仿真会话（PhET 式「一台仪器 = 一个仿真」）：多块屏幕各自保存场景，引导任务进度跨屏保留。
 * 约束（docs/整体重构规划-PhET风格-2026-10-11.md 第六节第 3 条）：
 * - 切换屏幕只换当前屏，不清空任何屏的场景与任务进度；
 * - 「全部重置」只恢复当前屏场景，任务进度、跳步与讲师使用记录不受影响；
 * - 「重新开始任务」只清任务进度，场景不动；已写入的学习与检测记录都不在本状态内。
 */

export type SimScreenId = 'learn' | 'lab' | 'challenge';

export const SIM_SCREEN_LABELS: Record<SimScreenId, string> = { learn: '认识', lab: '实验', challenge: '挑战' };

export type SimScene = Record<string, unknown>;

export interface SimTaskState {
  /** 任务卡展开；收起只隐藏卡片。 */
  open: boolean;
  /** 已完成的任务项。 */
  done: string[];
  /** 本轮是否跳过过未完成的任务（之后补齐仍算跳步）。 */
  hasSkipped: boolean;
  /** 本轮是否用过讲师演示（用过则不写入学员学习记录）。 */
  teacherUsed: boolean;
  /** 任务自有状态（分光镜：机型切片、当前步骤、讲师 / 学员）；「重新开始任务」清空，换屏与全部重置不动。 */
  data: SimScene;
}

export interface SimSession {
  screen: SimScreenId;
  scenes: Partial<Record<SimScreenId, SimScene>>;
  task: SimTaskState;
  /** 会话级选项（分光镜：机型），跨屏共享；「全部重置」不动它。 */
  options: SimScene;
}

export const EMPTY_TASK: SimTaskState = { open: true, done: [], hasSkipped: false, teacherUsed: false, data: {} };

/** taskOpen：任务卡初始是否展开（手机上默认收起为一行，避免盖住操作区）。 */
export function createSimSession(screen: SimScreenId, initialScenes: Partial<Record<SimScreenId, SimScene>>, taskOpen = true, init?: { options?: SimScene; taskData?: SimScene }): SimSession {
  return {
    screen,
    scenes: structuredClone(initialScenes),
    task: { ...EMPTY_TASK, open: taskOpen, data: structuredClone(init?.taskData ?? {}) },
    options: structuredClone(init?.options ?? {}),
  };
}

export type SimAction =
  | { type: 'screen'; screen: SimScreenId }
  | { type: 'patch-scene'; screen: SimScreenId; patch: SimScene }
  | { type: 'reset-scene'; screen: SimScreenId; initial: SimScene }
  | { type: 'patch-options'; patch: SimScene }
  | { type: 'task-open'; open: boolean }
  | { type: 'task-done'; id: string }
  | { type: 'task-skip' }
  | { type: 'task-teacher' }
  | { type: 'task-patch'; patch: SimScene }
  | { type: 'task-restart' };

export function simReducer(s: SimSession, action: SimAction): SimSession {
  switch (action.type) {
    case 'screen': return action.screen === s.screen ? s : { ...s, screen: action.screen };
    case 'patch-scene': return { ...s, scenes: { ...s.scenes, [action.screen]: { ...s.scenes[action.screen], ...action.patch } } };
    case 'reset-scene': return { ...s, scenes: { ...s.scenes, [action.screen]: structuredClone(action.initial) } };
    case 'patch-options': return { ...s, options: { ...s.options, ...action.patch } };
    case 'task-open': return { ...s, task: { ...s.task, open: action.open } };
    case 'task-done': return s.task.done.includes(action.id) ? s : { ...s, task: { ...s.task, done: [...s.task.done, action.id] } };
    case 'task-skip': return s.task.hasSkipped ? s : { ...s, task: { ...s.task, hasSkipped: true } };
    case 'task-teacher': return s.task.teacherUsed ? s : { ...s, task: { ...s.task, teacherUsed: true } };
    case 'task-patch': return { ...s, task: { ...s.task, data: { ...s.task.data, ...action.patch } } };
    // 重新开始：清进度、跳步与任务自有状态；讲师使用记录保留（同一轮里用过讲师演示，仍不写入学员记录）。
    case 'task-restart': return { ...s, task: { ...EMPTY_TASK, open: true, teacherUsed: s.task.teacherUsed } };
  }
}

/** 地址中的屏幕参数：不认识或该仿真没有的屏幕，退回第一块可用屏幕。 */
export function parseSimScreen(value: string | undefined, available: readonly SimScreenId[]): SimScreenId {
  return available.includes(value as SimScreenId) ? value as SimScreenId : available[0];
}
