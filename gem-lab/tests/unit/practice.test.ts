import assert from 'node:assert/strict';
import test from 'node:test';
import { addPracticeResult, masteryFromHistory, masteryLevel, selectPracticeSample } from '../../src/domain/practice';
import { computeScore } from '../../src/domain/assessment';

test('practice selection prefers unseen and incorrect samples while allowing exploration', () => {
  const pool = [{ id: 'new' }, { id: 'wrong' }, { id: 'correct' }];
  const history = [
    { sampleId: 'correct', correct: true, completedAt: 2 },
    { sampleId: 'wrong', correct: false, completedAt: 1 },
  ];
  assert.equal(selectPracticeSample(pool, history, null, () => 0)?.id, 'new');
  assert.equal(selectPracticeSample(pool, history, null, () => 0.8)?.id, 'wrong');
  assert.equal(selectPracticeSample(pool, history, null, () => 0.99)?.id, 'correct');
  assert.equal(selectPracticeSample(pool, history, 'new', () => 0)?.id, 'wrong');
  assert.equal(selectPracticeSample([], history, null), null);
  const oldMastery = { correct: { attempts: 2, correct: 2, lastPracticedAt: 1, lastCorrect: true } };
  assert.equal(selectPracticeSample([{ id: 'correct' }, { id: 'new' }], [], null, () => 0.5, oldMastery)?.id, 'new');
});

test('a revealed-answer retry does not count toward mastery', () => {
  const first = addPracticeResult({}, { sampleId: 'ruby', correct: false, completedAt: 1, attempts: 1 });
  const retry = addPracticeResult(first, { sampleId: 'ruby', correct: true, completedAt: 2, attempts: 2 });
  assert.equal(retry.ruby.attempts, 2);
  assert.equal(retry.ruby.correct, 0);
  assert.equal(masteryLevel(retry.ruby), 'review');
  assert.equal(selectPracticeSample([{ id: 'ruby' }, { id: 'agate' }], [{ sampleId: 'ruby', correct: true, completedAt: 2, attempts: 2 }], null, () => 0)?.id, 'ruby');
});

test('two independent correct attempts establish mastery and a later miss reopens review', () => {
  const records = [
    { sampleId: 'ruby', correct: true, completedAt: 3, attempts: 1 },
    { sampleId: 'ruby', correct: true, completedAt: 1, attempts: 1 },
  ];
  const mastered = masteryFromHistory(records);
  assert.equal(masteryLevel(mastered.ruby), 'mastered');
  assert.equal(masteryLevel(addPracticeResult(mastered, { sampleId: 'ruby', correct: false, completedAt: 4 }).ruby), 'review');
});

test('score rewards only independent answers and keeps hint penalty after reveal', () => {
  assert.equal(computeScore(true, 'beginner', 1, 50, false), 10);
  assert.equal(computeScore(true, 'beginner', 1, 50, true), 8);
  assert.equal(computeScore(false, 'advanced', 1, 100, false), 0);
  assert.equal(computeScore(true, 'advanced', 2, 100, false), 0);
});
