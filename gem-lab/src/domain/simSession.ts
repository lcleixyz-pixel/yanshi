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
export function createSimSession(screen: SimScreenId, initialScenes: Partial<Record<SimScreenId, SimScene>>, taskOpen = true, init?: { options?: SimScene; taskData?: SimScene; teacherUsed?: boolean }): SimSession {
  return {
    screen,
    scenes: structuredClone(initialScenes),
    // 深链 ?mode=teacher 进入时也算用过讲师演示，学习记录规则据此判断。
    task: { ...EMPTY_TASK, open: taskOpen, data: structuredClone(init?.taskData ?? {}), teacherUsed: init?.teacherUsed === true },
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

/** 引导任务卡清单里的一条。 */
export interface SimTaskItem { id: string; label: string; done: boolean }

/**
 * 任务卡里的清单与问答：课程清单已含「回答：…」条目时，不再另列「检查一下：…」；
 * 每道题在清单里排在它前面的操作都做完后才出现（先动手观察，再回答），不在清单里的题等本步操作全做完；
 * 只有问答的一步（如「解释」）直接出现。
 */
export function taskChecklist<Q extends { id: string; label: string; done: boolean }>(items: readonly SimTaskItem[], questions: readonly Q[]) {
  // 清单里的题目条目按 id 取最后一次出现（操作与题目可能同 id，如分光镜的 continuous，题目总排在操作之后）。
  const lastIndex = (id: string) => items.map((item) => item.id).lastIndexOf(id);
  const questionAt = new Set(questions.map((item) => lastIndex(item.id)).filter((index) => index >= 0));
  const listed = new Set(items.map((item) => item.id));
  const actionsDone = (before: number) => items.slice(0, before).every((item, index) => questionAt.has(index) || item.done);
  return {
    items: [
      ...items.map((item, index) => ({ ...item, id: `step:${index}:${item.id}` })),
      ...questions.filter((item) => !listed.has(item.id)).map((item) => ({ id: `quiz:${item.id}`, label: `检查一下：${item.label}`, done: item.done })),
    ],
    ready: (id: string) => { const index = lastIndex(id); return actionsDone(index < 0 ? items.length : index); },
  };
}
