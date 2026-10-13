import type { CourseMode } from './course';
import { SAMPLES } from '../data/samples';
import { STEPS } from './refractometerCourse';
import {
  COURSE_SAMPLE, emptyTaskData, isStepId, labInitial, LEARN_INITIAL, readLabScene, readTaskData,
  type LabScene, type RefractometerTaskData,
} from './refractometerSim';
import { simReducer, type SimAction, type SimSession } from './simSession';

const taskData = (task: RefractometerTaskData): Record<string, unknown> => task as unknown as Record<string, unknown>;
const STEP_IDS = STEPS.map((step) => step.id);

/**
 * 进入折射仪仿真时的初始状态：从地址读样品、讲师 / 学员与步骤（深链只在进入时生效一次）。
 * 引导任务固定用教学样品；只有自由练习（没写 mode）才按 ?sample= 摆好。
 */
export function refractometerInitial(search: URLSearchParams) {
  const sampleParam = search.get('sample');
  const sampleId = SAMPLES.some((item) => item.id === sampleParam) ? sampleParam! : COURSE_SAMPLE.id;
  const modeParam = search.get('mode');
  const mode: CourseMode | null = modeParam === 'student' || modeParam === 'teacher' ? modeParam : null;
  const stepParam = search.get('step');
  const stepIndex = isStepId(stepParam) ? STEP_IDS.indexOf(stepParam) : -1;
  const task = emptyTaskData();
  task.mode = mode;
  if (stepIndex >= 0) { task.step = stepParam as RefractometerTaskData['step']; task.hasSkipped = stepIndex > 0; }
  const scene = mode === null ? labInitial(sampleId) : labInitial(COURSE_SAMPLE.id);
  return {
    scenes: { learn: LEARN_INITIAL as unknown as Record<string, unknown>, lab: scene as unknown as Record<string, unknown>, challenge: labInitial(sampleId) as unknown as Record<string, unknown> },
    options: {},
    taskData: taskData(task),
    teacherUsed: mode === 'teacher',
  };
}

/** 折射仪会话归约：其余动作沿用通用外壳，只补「全部重置不恢复已保存记录的确认」。 */
export function refractometerSessionReducer(session: SimSession, action: SimAction): SimSession {
  const next = simReducer(session, action);
  if (action.type !== 'reset-scene' || (action.screen !== 'lab' && action.screen !== 'challenge')) return next;
  const before = readLabScene(session.scenes[action.screen]);
  const scene = readLabScene(next.scenes[action.screen]);
  return {
    ...next,
    scenes: { ...next.scenes, [action.screen]: { ...scene, saved: before.saved ? { ...before.saved, stale: true } : null } as LabScene },
  };
}

export { readTaskData };
