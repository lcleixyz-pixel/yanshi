import assert from 'node:assert/strict';
import test from 'node:test';
import { coverageOf, emptyCoverage, markRotation } from '../../src/domain/rotationCoverage';

const turn = (from: number, to: number, step: number) => {
  let visited = emptyCoverage(), angle = from;
  for (let next = from + step; step > 0 ? next <= to : next >= to; next += step) { visited = markRotation(visited, angle, next); angle = next; }
  return visited;
};

test('a continuous full turn in small steps covers every bin, in either direction', () => {
  assert.equal(coverageOf(turn(0, 360, 5)), 1);
  assert.equal(coverageOf(turn(360, 0, -12)), 1);
});

test('a jump larger than 15° records only where the stage lands', () => {
  const visited = markRotation(emptyCoverage(), 0, 180);
  assert.equal(visited.filter(Boolean).length, 1);
  assert.equal(coverageOf(turn(0, 360, 30)), 12 / 72);
});

test('wrapping across 0°/360° is continuous', () => {
  const visited = markRotation(markRotation(emptyCoverage(), 355, 5), 5, 10);
  assert.ok(visited[71] && visited[0] && visited[1] && visited[2]);
});

test('unchanged coverage keeps the same array (no needless re-render)', () => {
  const once = markRotation(emptyCoverage(), 0, 4);
  assert.equal(markRotation(once, 0, 4), once);
});
