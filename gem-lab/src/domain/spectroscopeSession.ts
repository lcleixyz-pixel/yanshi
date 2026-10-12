import { simReducer, type SimAction, type SimSession } from './simSession';
import {
  changeLabMachine, readLabScene, readMachine, readTaskData, recordSceneProgress,
  type SpectroscopeTaskData,
} from './spectroscopeSim';

const taskData = (task: SpectroscopeTaskData): Record<string, unknown> => task as unknown as Record<string, unknown>;

/** 分光镜共享机型与任务证据的唯一归约入口；其他仪器继续使用通用 simReducer。 */
export function spectroscopeSessionReducer(session: SimSession, action: SimAction): SimSession {
  const next = simReducer(session, action);
  const machine = readMachine(next.options);

  if (action.type === 'patch-options' && machine !== readMachine(session.options)) {
    const previousMachine = readMachine(session.options);
    const task = readTaskData(next.task.data);
    const scenes = { ...next.scenes };
    // 机型三屏共用：不论从哪一屏切换，都同时失效实验和挑战的观察。
    for (const screen of ['lab', 'challenge'] as const) {
      if (!session.scenes[screen]) continue;
      scenes[screen] = changeLabMachine(readLabScene(session.scenes[screen], previousMachine), machine, screen === 'lab' && task.mode !== null);
    }
    return {
      ...next, scenes,
      task: {
        ...next.task,
        data: taskData({
          ...task,
          byVariant: {
            prism: { ...task.byVariant.prism, observationChecked: false },
            grating: { ...task.byVariant.grating, observationChecked: false },
          },
        }),
      },
    };
  }

  if (action.type === 'patch-scene' && action.screen === 'lab') {
    // 所有实际操作（含三维拖动、滑杆、夹样）都会经过这里，完成后即留下证据。
    const task = recordSceneProgress(readTaskData(next.task.data), readLabScene(next.scenes.lab, machine), machine);
    return { ...next, task: { ...next.task, data: taskData(task) } };
  }

  if (action.type === 'reset-scene' && (action.screen === 'lab' || action.screen === 'challenge')) {
    const old = readLabScene(session.scenes[action.screen], machine);
    const scene = readLabScene(next.scenes[action.screen], machine);
    const scenes = { ...next.scenes, [action.screen]: { ...scene, checked: false, saved: old.saved ? { ...old.saved, stale: true } : null } };
    if (action.screen === 'challenge') return { ...next, scenes };
    const task = readTaskData(next.task.data);
    return {
      ...next, scenes,
      task: { ...next.task, data: taskData({ ...task, byVariant: { ...task.byVariant, [machine]: { ...task.byVariant[machine], observationChecked: false } } }) },
    };
  }

  // 重新开始只清任务，保留场景、挑战样品、存档及讲师使用记录。
  // 新任务的 observationChecked 缺省为 false，旧场景不会自动补回观察步骤。
  return next;
}
