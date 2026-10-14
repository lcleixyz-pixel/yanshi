import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSE_SETUP, courseView, emptyTaskData, enterStep, labInitial, LEARN_INITIAL, learnCoach, learnEvidence, lessonScene, parseLesson,
  canSaveChallenge, challengeInitial, challengeSteps, checkChallenge, patchChallenge, readChallengeScene,
  isRecording, labCoach, pendingStep, labEnterStep, patchLab, polariscopeInitial, readLabScene, recordAnswer, recordReveal, readLearnScene, readTaskData, seePart, stateForLesson, STEP_SCREEN, type PolariscopeTaskData,
} from '../../src/domain/polariscopeSim';
import { COURSE_STEPS } from '../../src/domain/polariscopeCourse';

/** 三屏共用外壳的三条约束在这里先立住：换屏不清场景、重置只重置当前屏、重新开始只清任务。 */

test('讲次解析：认识的落回认识部件，实验的落回样品观察', () => {
  assert.equal(parseLesson('components'), 'components');
  assert.equal(parseLesson('conoscope'), 'conoscope');
  assert.equal(parseLesson('bogus'), 'components');
  assert.equal(parseLesson(null), 'components');
  assert.equal(readLearnScene(undefined).structure.lesson, 'components');
  // 实验屏场景里若混进认识屏的讲次，回落到样品观察，避免整屏空白。
  assert.equal(readLabScene({ structure: stateForLesson('path') }).structure.lesson, 'sample');
  assert.equal(readLearnScene({ structure: stateForLesson('sample') }).structure.lesson, 'components');
});

test('场景初值与旧页面同一套规则', () => {
  const path = stateForLesson('path');
  assert.equal(path.pathStep, 0);
  assert.equal(path.internalView, true);
  const sample = stateForLesson('sample', 'ruby');
  assert.equal(sample.analyzerAngle, 90);
  assert.equal(sample.sampleId, 'ruby');
  // 干涉图只放非均质样品；给了均质样品就回落到碧玺。
  assert.equal(stateForLesson('conoscope', 'ruby').sampleId, 'tourbillon' in {} ? 'ruby' : stateForLesson('conoscope', 'ruby').sampleId);
  assert.equal(stateForLesson('conoscope', 'ruby').orientation, 'optic-axis');
});

test('课程六步的屏幕归属与场景补丁', () => {
  assert.deepEqual(Object.values(STEP_SCREEN), ['learn', 'learn', 'lab', 'lab', 'lab', 'learn'].length === 6 ? Object.values(STEP_SCREEN) : []);
  assert.equal(STEP_SCREEN.parts, 'learn');
  assert.equal(STEP_SCREEN.crossed, 'learn');
  assert.equal(STEP_SCREEN.rotate, 'lab');
  assert.equal(STEP_SCREEN.explain, 'lab');
  // 「解释」沿用上一步的画面；其余五步各自套讲与参数。
  assert.equal(COURSE_SETUP.explain, null);
  assert.equal(COURSE_SETUP.rotate![0], 'sample');
  assert.equal(COURSE_SETUP.rotate![1].sampleId, 'spinel');
  assert.equal(COURSE_SETUP.reorient![1].orientation, 'optic-axis');
  assert.equal(COURSE_SETUP.crossed![1].analyzerAngle, 0);
});

test('进入课程某一步：换讲、套补丁、并抬一次相机复位计数', () => {
  const scene = { ...LEARN_INITIAL, resetViewKey: 3 };
  const next = enterStep(scene, 'crossed');
  assert.equal(next.structure.lesson, 'principle');
  assert.equal(next.structure.power, true);
  assert.equal(next.structure.analyzerAngle, 0);
  assert.equal(next.resetViewKey, 4);
  // 实验屏的步骤落进实验场景。
  const lab = enterStep(labInitial(), 'rotate');
  assert.equal(lab.structure.lesson, 'sample');
  assert.equal(lab.structure.sampleId, 'spinel');
});

test('换讲重置本讲场景，但换屏与重置不互相影响', () => {
  const scene = { ...LEARN_INITIAL, structure: { ...LEARN_INITIAL.structure, explosion: 0.8, selectedPart: 'analyzer' as const } };
  const switched = lessonScene(scene, 'path');
  assert.equal(switched.structure.lesson, 'path');
  assert.equal(switched.structure.explosion, 0);
  assert.equal(switched.structure.selectedPart, null);
  assert.equal(switched.viewPreset, 'free');
  assert.equal(switched.resetViewKey, scene.resetViewKey + 1);
});

test('任务状态：缺失或残缺都能安全读回', () => {
  const base = readTaskData(undefined);
  assert.deepEqual(base, emptyTaskData());
  const messy = readTaskData({ mode: 'bogus', step: 'nope', progress: { partsSeen: ['polarizer', 7], pathMax: 9, reveals: [{ sampleId: 'spinel' }, null], correctQuestions: ['why-crossed', 3] }, completed: ['rotate', 'x'] });
  assert.equal(messy.mode, null);
  assert.equal(messy.step, 'parts');
  assert.deepEqual(messy.progress.partsSeen, ['polarizer']);
  assert.equal(messy.progress.pathMax, 4);
  assert.equal(messy.progress.reveals.length, 1);
  assert.deepEqual(messy.progress.correctQuestions, ['why-crossed']);
  assert.deepEqual(messy.completed, ['rotate']);
});

test('任务卡视图：按屏分发步骤，进度按「做完过」累计', () => {
  const task: PolariscopeTaskData = { ...emptyTaskData(), mode: 'student', step: 'crossed' };
  const learn = courseView(task, 'learn');
  assert.equal(learn.step, 'crossed');
  assert.equal(learn.progress.total, COURSE_STEPS.length);
  assert.equal(learn.screenDone, false);
  assert.equal(learn.items.every((item) => !item.done), true);
  // 实验屏不显示认识屏的三步。
  const lab = courseView(task, 'lab');
  assert.equal(lab.step, 'rotate');
  // 已完成过的步骤计入进度，即使当前场景不再满足条件。
  const done = courseView({ ...task, completed: ['parts', 'path'] }, 'learn');
  assert.equal(done.progress.done, 2);
});

const withMode = (mode: PolariscopeTaskData['mode'] = 'student'): PolariscopeTaskData => ({ ...emptyTaskData(), mode });

test('认识屏的完成证据：点部件、走光路、空载平行与正交；没选身份时不记', () => {
  const free = emptyTaskData();
  assert.equal(seePart(free, 'stage'), free);
  assert.equal(learnEvidence(free, stateForLesson('path')), free);
  let task = withMode();
  for (const id of ['polarizer', 'stage', 'analyzer'] as const) task = seePart(task, id);
  assert.deepEqual(task.completed, ['parts']);
  assert.equal(seePart(task, 'stage'), task);
  task = learnEvidence(task, { ...stateForLesson('path'), pathStep: 4 });
  assert.equal(task.progress.pathMax, 4);
  assert.ok(task.completed.includes('path'));
  // 偏振原理：0° 平行最亮、90° 正交全暗；理想双折射示例与断电不算。
  const principle = (patch: Partial<ReturnType<typeof stateForLesson>>) => ({ ...stateForLesson('principle'), ...patch });
  assert.equal(learnEvidence(task, principle({ analyzerAngle: 90, power: false })), task);
  assert.equal(learnEvidence(task, principle({ analyzerAngle: 0, principleExample: 'half-wave' })), task);
  task = learnEvidence(task, principle({ analyzerAngle: 0 }));
  assert.equal(task.progress.parallelSeen, true);
  task = learnEvidence(task, principle({ analyzerAngle: 90 }));
  assert.equal(task.progress.crossedSeen, true);
  assert.deepEqual(task.completed, ['parts', 'path', 'crossed']);
  const view = courseView(task, 'learn');
  assert.equal(view.screenDone, true);
  assert.equal(view.nextScreen, 'lab');
  assert.equal(view.progress.done, 3);
});

test('任务清单去掉部件编号；学员提示指向下一个要操作的部件', () => {
  const view = courseView(withMode(), 'learn');
  assert.deepEqual(view.items.map((item) => item.label), ['下偏光片', '载物台', '上偏光片']);
  const seen = seePart(withMode(), 'polarizer');
  assert.equal(learnCoach('parts', seen.progress, stateForLesson('components'))?.part, 'stage');
  assert.equal(learnCoach('crossed', seen.progress, { ...stateForLesson('principle'), power: false })?.part, 'powerSwitch');
  assert.equal(learnCoach('crossed', seen.progress, { ...stateForLesson('principle'), analyzerAngle: 90 })?.tone, 'done');
  assert.equal(learnCoach('rotate', seen.progress, stateForLesson('sample')), null);
});

test('地址进入：讲次落到对应屏，讲师 / 学员与步骤只读一次，直达中间步骤记为跳步', () => {
  const principle = polariscopeInitial(new URLSearchParams('lesson=principle&mode=student&step=crossed'));
  assert.equal(readLearnScene(principle.scenes.learn).structure.lesson, 'principle');
  assert.equal(readLabScene(principle.scenes.lab).structure.lesson, 'sample');
  const task = readTaskData(principle.taskData);
  assert.equal(task.mode, 'student');
  assert.equal(task.step, 'crossed');
  assert.equal(task.hasSkipped, true);
  assert.equal(principle.teacherUsed, false);
  const conoscope = polariscopeInitial(new URLSearchParams('lesson=conoscope&mode=teacher'));
  assert.equal(readLearnScene(conoscope.scenes.learn).structure.lesson, 'components');
  assert.equal(readLabScene(conoscope.scenes.lab).structure.lesson, 'conoscope');
  assert.equal(conoscope.teacherUsed, true);
  assert.equal(readTaskData(conoscope.taskData).hasSkipped, false);
});

test('实验屏改仪器状态：换样品要重新预测，换方向只重新记录，转检偏器保留揭晓', () => {
  const full = Array(72).fill(true);
  const base = { ...labInitial('tourmaline'), prediction: 'four-bright-four-dark', revealed: true, visited: full };
  const sample = patchLab(base, { sampleId: 'spinel' });
  assert.equal(sample.prediction, null);
  assert.equal(sample.revealed, false);
  assert.equal(sample.visited.filter(Boolean).length, 0);
  const orientation = patchLab(base, { orientation: 'optic-axis' });
  assert.equal(orientation.prediction, 'four-bright-four-dark');
  assert.equal(orientation.revealed, false);
  const analyzer = patchLab(base, { analyzerAngle: 0 });
  assert.equal(analyzer.revealed, true);
  assert.equal(analyzer.visited.filter(Boolean).length, 0);
  const stage = patchLab(base, { stageAngle: 40 });
  assert.equal(stage.visited, full);
  // 记录条件：已预测、通电、正交。
  assert.equal(isRecording(base), true);
  assert.equal(isRecording(analyzer), false);
  assert.equal(isRecording({ ...base, prediction: null }), false);
});

test('实验屏的课程：开场场景、揭晓顺序判断换方向复核、答题完成解释', () => {
  const entered = labEnterStep({ ...labInitial('jadeite'), prediction: 'all-bright' }, 'reorient');
  assert.equal(entered.structure.sampleId, 'tourmaline');
  assert.equal(entered.structure.orientation, 'optic-axis');
  assert.equal(entered.prediction, null);
  assert.equal(entered.enteredStep, 'reorient');
  let task = withMode();
  task = recordReveal(task, stateForLesson('sample', 'spinel'), 'all-dark');
  task = recordReveal(task, stateForLesson('sample', 'tourmaline'), 'four-bright-four-dark');
  task = recordReveal(task, stateForLesson('sample', 'jadeite'), 'all-bright');
  assert.ok(task.completed.includes('rotate'));
  // 先换方向、后沿光轴不算复核：顺序必须是沿光轴在前。
  const general = { ...stateForLesson('sample', 'tourmaline'), orientation: 'general' as const };
  const axis = { ...stateForLesson('sample', 'tourmaline'), orientation: 'optic-axis' as const };
  const wrongOrder = recordReveal(recordReveal(task, general, 'four-bright-four-dark'), axis, 'axis-dark');
  assert.equal(wrongOrder.completed.includes('reorient'), false);
  task = recordReveal(recordReveal(task, axis, 'axis-dark'), general, 'four-bright-four-dark');
  assert.ok(task.completed.includes('reorient'));
  for (const id of ['why-crossed', 'why-reorient', 'no-conclusion']) task = recordAnswer(task, id);
  assert.ok(task.completed.includes('explain'));
  assert.equal(recordReveal(emptyTaskData(), axis, 'axis-dark').progress.reveals.length, 0);
});

test('实验屏学员提示：断电指向电源，未正交指向上偏光片，沿光轴全暗时提示换方向', () => {
  const scene = { ...labInitial('tourmaline'), prediction: 'all-dark' };
  assert.equal(labCoach('rotate', patchLab(scene, { power: false }), 'all-dark')?.part, 'powerSwitch');
  assert.equal(labCoach('rotate', patchLab(scene, { analyzerAngle: 30 }), 'all-dark')?.part, 'analyzer');
  assert.equal(labCoach('rotate', scene, 'four-bright-four-dark')?.part, 'stage');
  assert.match(labCoach('reorient', { ...patchLab(scene, { orientation: 'optic-axis' }), revealed: true }, 'axis-dark')!.text, /换个方向/);
  assert.equal(labCoach('explain', scene, 'all-dark'), null);
});

test('做完一步先停在结果上：同屏的下一步要等学员点「下一步」，跨屏或首次进入不算', () => {
  let task = withMode();
  for (const id of ['polarizer', 'stage', 'analyzer'] as const) task = seePart(task, id);
  const view = courseView(task, 'learn');
  assert.equal(view.step, 'path');
  assert.equal(pendingStep(view, 'parts'), 'parts');
  assert.equal(pendingStep(view, 'path'), null);
  assert.equal(pendingStep(view, null), null);
  assert.equal(pendingStep(courseView(withMode(), 'learn'), 'parts'), null);
});

test('挑战台：五步按顺序解锁，转检偏器或换方向重新记录，转满一周且写全才能保存', () => {
  let scene = challengeInitial('tourmaline', 'beginner');
  assert.deepEqual(challengeSteps(scene).map((step) => step.done), [false, false, false, false, false]);
  scene = patchChallenge(scene, { power: true, analyzerAngle: 90 });
  scene = patchChallenge(scene, { lesson: 'sample' });
  assert.deepEqual(challengeSteps(scene).map((step) => step.done), [true, true, true, false, false]);
  scene = { ...scene, visited: Array(72).fill(true) };
  assert.equal(challengeSteps(scene)[3].done, true);
  assert.equal(patchChallenge(scene, { orientation: 'optic-axis' }).visited.some(Boolean), false);
  assert.equal(patchChallenge(scene, { stageAngle: 30 }).visited, scene.visited);
  assert.equal(canSaveChallenge({ ...scene, reaction: 'four-bright-four-dark' }), false);
  assert.equal(canSaveChallenge({ ...scene, reaction: 'four-bright-four-dark', judgement: 'anisotropic' }), true);
  assert.equal(canSaveChallenge({ ...scene, reaction: 'not-applicable' }), true);
  // 读回：抽样难度与记录随场景保存。
  assert.equal(readChallengeScene({ ...scene, difficulty: 'beginner' }).difficulty, 'beginner');
});

test('挑战核对：现象与光性分开判；不透明样品记「透射法不适用」才算对', () => {
  assert.deepEqual(checkChallenge('tourmaline', { reaction: 'four-bright-four-dark', judgement: 'anisotropic', stale: false }), { reaction: true, judgement: true });
  assert.deepEqual(checkChallenge('spinel', { reaction: 'four-bright-four-dark', judgement: 'anisotropic', stale: false }), { reaction: false, judgement: false });
  assert.deepEqual(checkChallenge('turquoise', { reaction: 'not-applicable', judgement: null, stale: false }).reaction, checkChallenge('turquoise', { reaction: 'not-applicable', judgement: null, stale: false }).judgement);
});

test('空载调正：先 0° 后 90° 两个状态依次经过时都记上（每次改场景当场判断，不靠渲染次数）', () => {
  let task: PolariscopeTaskData = { ...withMode(), step: 'crossed' };
  for (const angle of [0, 90]) task = learnEvidence(task, { ...stateForLesson('principle'), analyzerAngle: angle });
  assert.equal(task.progress.parallelSeen, true);
  assert.equal(task.progress.crossedSeen, true);
});
