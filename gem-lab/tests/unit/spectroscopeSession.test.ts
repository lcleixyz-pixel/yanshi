import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSE_CONFIG, QUESTIONS, type Operation } from '../../src/domain/spectroscopeCourse';
import { mayRecordLearning } from '../../src/domain/course';
import { createSimSession, type SimSession, type SimScreenId } from '../../src/domain/simSession';
import { spectroscopeSessionReducer as reduce } from '../../src/domain/spectroscopeSession';
import {
  applyOperation, courseInitialLab, courseView, drawChallenge, labInitial, patchLab,
  readLabScene, readMachine, readTaskData, spectroscopeInitial, type LabScene,
} from '../../src/domain/spectroscopeSim';

const start = (screen: SimScreenId = 'lab', search = 'mode=student') => {
  const init = spectroscopeInitial(new URLSearchParams(search));
  return createSimSession(screen, init.scenes, true, init);
};
const lab = (s: SimSession) => readLabScene(s.scenes.lab, readMachine(s.options));
const view = (s: SimSession) => courseView(readTaskData(s.task.data), lab(s), readMachine(s.options), 'lab');
const operate = (s: SimSession, op: Operation, screen: 'learn' | 'lab' = 'lab') => {
  const next = applyOperation(readTaskData(s.task.data), lab(s), readMachine(s.options), op);
  if (screen === 'lab') s = reduce(s, { type: 'patch-scene', screen, patch: next.scene });
  return reduce(s, { type: 'task-patch', patch: next.task as unknown as Record<string, unknown> });
};
const adjust = (s: SimSession, patch: Parameters<typeof patchLab>[1]) => reduce(s, { type: 'patch-scene', screen: 'lab', patch: patchLab(lab(s), patch) });
const reset = (s: SimSession) => reduce(s, { type: 'reset-scene', screen: 'lab', initial: courseInitialLab(readMachine(s.options)) });

function completePrism(s = start()) {
  for (const part of COURSE_CONFIG.prism.parts) s = operate(s, { type: 'see-part', id: part.id }, 'learn');
  for (const item of COURSE_CONFIG.prism.cases) s = operate(s, { type: 'see-case', id: item.id }, 'learn');
  s = operate(s, { type: 'record-continuous' });
  s = adjust(s, { samplePlaced: true, slit: 0.32, focus: 0.5 });
  for (const q of QUESTIONS) s = operate(s, { type: 'answer', id: q.id, option: q.correct });
  for (const wavelength of [694, 580, 476]) s = operate(s, { type: 'mark', wavelength });
  return operate(s, { type: 'check' });
}

test('从任意屏切换共享机型，都同步失效实验及挑战记录，保留 nm 标记和抽样身份', () => {
  for (const screen of ['learn', 'lab', 'challenge'] as const) {
    let s = start(screen, '');
    const saved = { notes: '棱镜式的已保存记录', stale: false, pending: false };
    const marked: LabScene = { ...labInitial('prism', 'amethyst'), marks: [550], bands: [{ start: 540, end: 560 }], checked: true, saved };
    s = reduce(s, { type: 'patch-scene', screen: 'lab', patch: marked });
    s = reduce(s, { type: 'patch-scene', screen: 'challenge', patch: { ...marked, difficulty: 'intermediate' } });
    s = reduce(s, { type: 'patch-options', patch: { machine: 'grating' } });
    for (const target of ['lab', 'challenge'] as const) {
      const result = readLabScene(s.scenes[target], 'grating');
      assert.equal(s.scenes[target]?.dispersion, 'grating', `${screen}→${target}`);
      assert.equal(result.bench.dispersion, 'grating');
      assert.equal(result.saved?.stale, true);
      assert.equal(result.saved?.notes, saved.notes);
      assert.equal(result.checked, false);
      assert.deepEqual(result.marks, [550]);
      assert.deepEqual(result.bands, marked.bands);
    }
    assert.equal(s.scenes.challenge?.sampleId, 'amethyst');
    assert.equal(s.scenes.challenge?.difficulty, 'intermediate');
  }
});

test('点当前机型不会重置场景或失效记录', () => {
  let s = start('learn', '');
  s = reduce(s, { type: 'patch-scene', screen: 'lab', patch: { saved: { notes: '保持有效', stale: false, pending: false } } });
  assert.deepEqual(reduce(s, { type: 'patch-options', patch: { machine: 'prism' } }), s);
});

test('先答题再夹样：完成立即写进任务证据，重置后不退回', () => {
  let s = start();
  s = operate(s, { type: 'record-continuous' });
  s = operate(s, { type: 'answer', id: 'continuous', option: 1 });
  assert.equal(view(s).progress.done, 0);
  s = adjust(s, { samplePlaced: true });
  assert.equal(view(s).progress.done, 1);
  assert.ok(readTaskData(s.task.data).byVariant.prism.completed.includes('light'));
  assert.equal(view(reset(s)).progress.done, 1);
});

test('先答题再用滑杆或三维调节：狭缝与焦距合适后立即留下证据', () => {
  let s = start();
  s = operate(s, { type: 'record-continuous' });
  s = operate(s, { type: 'answer', id: 'continuous', option: 1 });
  s = adjust(s, { samplePlaced: true });
  s = operate(s, { type: 'answer', id: 'slit', option: 1 });
  s = adjust(s, { slit: 0.32 });
  s = adjust(s, { focus: 0.5 });
  assert.equal(view(s).progress.done, 2);
  assert.ok(readTaskData(s.task.data).byVariant.prism.completed.includes('tune'));
  assert.equal(view(reset(s)).progress.done, 2);
});

test('完整课重置及换机型保留完成事实；另一机型不会继承观察证据', () => {
  let s = completePrism();
  assert.equal(view(s).allComplete, true);
  s = reset(s);
  assert.equal(view(s).progress.done, 6);
  assert.equal(lab(s).checked, false);
  s = reduce(s, { type: 'patch-options', patch: { machine: 'grating' } });
  assert.equal(view(s).progress.done, 0);
  assert.equal(lab(s).bench.brightness, 0.35);
  assert.equal(lab(s).bench.samplePlaced, false);
  s = reduce(s, { type: 'patch-options', patch: { machine: 'prism' } });
  assert.equal(view(s).progress.done, 6);
  assert.equal(view(s).allComplete, true);
});

test('重启清除本轮核对：保留场景、挑战和存档，但旧观察不能自动计入新任务', () => {
  let s = completePrism();
  s = reduce(s, { type: 'patch-scene', screen: 'lab', patch: { saved: { notes: '上轮已保存', stale: false, pending: false } } });
  s = reduce(s, { type: 'patch-scene', screen: 'challenge', patch: drawChallenge(labInitial('prism'), 'prism', { difficulty: 'intermediate', sampleId: 'amethyst' }) });
  const originalScenes = structuredClone(s.scenes);
  s = reduce(s, { type: 'task-restart' });
  assert.deepEqual(s.scenes, originalScenes);
  assert.equal(lab(s).checked, true, '场景原始核对保留，不改写历史观察');
  assert.equal(view(s).progress.done, 0);
  s = reduce(s, { type: 'task-patch', patch: { mode: 'student' } });
  s = operate(s, { type: 'see-part', id: 'slitHousing' }, 'learn');
  assert.equal(view(s).progress.done, 0);
  assert.deepEqual(readTaskData(s.task.data).byVariant.prism.completed, []);
  assert.equal(view(s).state.checked, false);
  // 本轮重新核对后才重新成立，不要求删除场景里的已有标记。
  s = operate(s, { type: 'check' });
  assert.ok(readTaskData(s.task.data).byVariant.prism.completed.includes('observe'));
});

test('重置保留旧记录并标为过期，讲师与跳步门禁不因证据积累而放开', () => {
  let s = completePrism(start('lab', 'mode=teacher&step=observe'));
  s = reduce(s, { type: 'patch-scene', screen: 'lab', patch: { saved: { notes: '原始记录', stale: false, pending: false } } });
  s = reset(s);
  assert.deepEqual(lab(s).saved, { notes: '原始记录', stale: true, pending: false });
  assert.equal(s.task.teacherUsed, true);
  assert.equal(readTaskData(s.task.data).hasSkipped, true);
  assert.equal(mayRecordLearning('teacher', readTaskData(s.task.data).hasSkipped, view(s).allComplete), false);
  assert.equal(mayRecordLearning('student', true, view(s).allComplete), false);
  s = reduce(s, { type: 'task-restart' });
  assert.equal(s.task.teacherUsed, true);
  assert.equal(readTaskData(s.task.data).hasSkipped, false);
});

test('自由探索操作和认识屏往返不会自动选择身份', () => {
  let s = start('learn', '');
  s = operate(s, { type: 'see-part', id: 'slitHousing' }, 'learn');
  s = operate(s, { type: 'see-case', id: 'wavelength-550' }, 'learn');
  s = reduce(s, { type: 'screen', screen: 'lab' });
  s = adjust(s, { samplePlaced: true, focus: 0.5 });
  assert.equal(readTaskData(s.task.data).mode, null);
});
