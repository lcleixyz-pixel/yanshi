import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COURSE_MINUTES,
  COURSE_QUESTIONS,
  COURSE_STEPS,
  EMPTY_COURSE_PROGRESS,
  REORIENT_SAMPLE,
  ROTATE_TARGETS,
  courseChecklist,
  isAnswerCorrect,
  isStepComplete,
  type CourseProgress,
} from '../../src/domain/polariscopeCourse';
import { buildSampleFieldMap, judgeObservation } from '../../src/domain/eyepieceField';
import { getPolariscopeProfile, type SampleViewSettings } from '../../src/domain/polariscopeSamples';
import type { SampleOrientation } from '../../src/domain/polariscopeStructure';

function observe(sampleId: string, orientation: SampleOrientation) {
  const profile = getPolariscopeProfile(sampleId)!;
  const settings: SampleViewSettings = { orientation, strain: profile.defaultStrain, thicknessMm: 2.5, brazilTwin: false };
  return judgeObservation(profile, settings, buildSampleFieldMap(profile, settings, 96));
}

test('course follows the agreed order and fits a 5–8 minute lesson', () => {
  assert.deepEqual(COURSE_STEPS.map((step) => step.id), ['parts', 'path', 'crossed', 'rotate', 'reorient', 'explain']);
  assert.ok(COURSE_MINUTES >= 5 && COURSE_MINUTES <= 8, `planned ${COURSE_MINUTES} min`);
});

test('the basic samples produce the typical reactions the course expects (same judge as the page)', () => {
  for (const target of ROTATE_TARGETS) assert.equal(observe(target.sampleId, 'general'), target.observation, target.name);
  assert.equal(observe(REORIENT_SAMPLE, 'optic-axis'), 'axis-dark');
  assert.equal(observe(REORIENT_SAMPLE, 'general'), 'four-bright-four-dark');
});

test('reorient step only completes when the general-direction rotation follows the optic-axis one', () => {
  const step3Tourmaline = { sampleId: REORIENT_SAMPLE, orientation: 'general' as const, observation: 'four-bright-four-dark' as const };
  const axis = { sampleId: REORIENT_SAMPLE, orientation: 'optic-axis' as const, observation: 'axis-dark' as const };
  const earlier: CourseProgress = { ...EMPTY_COURSE_PROGRESS, reveals: [step3Tourmaline, axis] };
  assert.equal(isStepComplete('reorient', earlier), false);
  assert.deepEqual(courseChecklist('reorient', earlier).map((item) => item.done), [true, false]);
  assert.equal(isStepComplete('reorient', { ...earlier, reveals: [...earlier.reveals, step3Tourmaline] }), true);
});

test('rotate step needs all three typical reactions', () => {
  const reveals = ROTATE_TARGETS.slice(0, 2).map((target) => ({ sampleId: target.sampleId, orientation: 'general' as const, observation: target.observation }));
  assert.equal(isStepComplete('rotate', { ...EMPTY_COURSE_PROGRESS, reveals }), false);
  const all = ROTATE_TARGETS.map((target) => ({ sampleId: target.sampleId, orientation: 'general' as const, observation: target.observation }));
  assert.equal(isStepComplete('rotate', { ...EMPTY_COURSE_PROGRESS, reveals: all }), true);
  // 沿光轴看到的全暗不能顶替碧玺的四明四暗。
  const axisOnly = [all[0], { sampleId: 'tourmaline', orientation: 'optic-axis' as const, observation: 'axis-dark' as const }, all[2]];
  assert.equal(isStepComplete('rotate', { ...EMPTY_COURSE_PROGRESS, reveals: axisOnly }), false);
});

test('early steps track parts, path and crossing', () => {
  assert.equal(isStepComplete('parts', { ...EMPTY_COURSE_PROGRESS, partsSeen: ['polarizer', 'stage'] }), false);
  assert.equal(isStepComplete('parts', { ...EMPTY_COURSE_PROGRESS, partsSeen: ['analyzer', 'polarizer', 'stage'] }), true);
  assert.equal(isStepComplete('path', { ...EMPTY_COURSE_PROGRESS, pathMax: 3 }), false);
  assert.equal(isStepComplete('path', { ...EMPTY_COURSE_PROGRESS, pathMax: 4 }), true);
  assert.equal(isStepComplete('crossed', { ...EMPTY_COURSE_PROGRESS, crossedSeen: true }), false);
  assert.equal(isStepComplete('crossed', { ...EMPTY_COURSE_PROGRESS, crossedSeen: true, parallelSeen: true }), true);
});

test('quiz answers: exactly the correct set, each question has feedback for every option', () => {
  const [crossed, reorient, noConclusion] = COURSE_QUESTIONS;
  assert.equal(isAnswerCorrect(crossed, ['a']), true);
  assert.equal(isAnswerCorrect(crossed, ['b']), false);
  assert.equal(isAnswerCorrect(reorient, ['b']), true);
  assert.equal(isAnswerCorrect(noConclusion, ['a', 'b', 'c', 'd']), true);
  assert.equal(isAnswerCorrect(noConclusion, ['a', 'b', 'c']), false);
  assert.equal(isAnswerCorrect(noConclusion, ['a', 'b', 'c', 'd', 'e']), false);
  for (const question of COURSE_QUESTIONS) {
    assert.equal(question.options.filter((option) => option.correct).length > 1, question.multiple, question.id);
    for (const option of question.options) assert.ok(option.feedback.length > 0);
  }
});
