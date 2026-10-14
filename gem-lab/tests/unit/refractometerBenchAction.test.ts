import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOperation, BENCH_ACTION_PART, COURSE_SAMPLE, courseView, emptyTaskData, labInitial, nextBenchAction, sceneFields, type BenchAction, type LabScene, type RefractometerTaskData } from '../../src/domain/refractometerSim';

/** 按「下一步」一直做下去：每一步都用课程域执行，直到本步没有可在仪器上做的动作。 */
function follow(task: RefractometerTaskData, scene: LabScene, limit = 12) {
  const actions: BenchAction[] = [];
  for (let i = 0; i < limit; i++) {
    const next = nextBenchAction(courseView(task, sceneFields(scene), 'lab').state);
    if (!next || next === 'answer' || next === 'read') { if (next) actions.push(next); break; }
    actions.push(next);
    ({ task, scene } = applyOperation(task, scene, COURSE_SAMPLE, next === 'record-invalid' ? { type: 'record-invalid' } : { type: next }));
  }
  return { actions, task, scene };
}

test('实验屏下一步：开灯与放样按开电源 → 滴液 → 放样走完，接着在恢复接触一步先记录无法读数、再回答问题', () => {
  const start: RefractometerTaskData = { ...emptyTaskData(), mode: 'student', step: 'prepare' };
  const { actions, task } = follow(start, labInitial());
  assert.deepEqual(actions, ['power', 'drop', 'place', 'record-invalid', 'answer']);
  assert.ok(task.completed.includes('prepare'));
  assert.equal(task.step, 'contact');
});

test('实验屏下一步：清理复位依次取下样品、擦净测台与样品、关灯、合上翻盖；每个动作都有仪器上的位置', () => {
  const scene: LabScene = { ...labInitial(), power: true, liquid: 'drop', sample: 'placed', contact: 'good' };
  // 本例其余步骤没做过：清理做完后课程会转回未完成的步骤，只看清理这五个动作。
  const { actions, task } = follow({ ...emptyTaskData(), mode: 'student', step: 'cleanup' }, scene, 5);
  assert.ok(task.completed.includes('cleanup'));
  assert.deepEqual(actions, ['remove', 'clean-stage', 'clean-sample', 'power', 'cover']);
  for (const action of actions) assert.ok(BENCH_ACTION_PART[action as keyof typeof BENCH_ACTION_PART]);
});
