import assert from 'node:assert/strict';
import test from 'node:test';
import { rotationStepDegrees } from '../../src/domain/animationTiming';

test('automatic rotation covers one turn in nine seconds at 5, 30 and 60 fps', () => {
  for (const fps of [5, 30, 60]) {
    let angle = 0;
    for (let i = 0; i < 9 * fps; i++) angle += rotationStepDegrees(1 / fps);
    assert.ok(Math.abs(angle - 360) < 1e-8, `${fps} fps: ${angle}`);
  }
});

test('slow frames cannot jump across the visible observation continuity limit', () => {
  assert.equal(rotationStepDegrees(1.6), 12);
  assert.equal(rotationStepDegrees(60), 12);
  // Six rendered frames are not a completed turn, even if nine seconds elapsed.
  assert.ok(6 * rotationStepDegrees(1.5) < 360);
});

test('invalid or backwards time does not advance the stage', () => {
  for (const elapsed of [0, -1, NaN, Infinity]) assert.equal(rotationStepDegrees(elapsed), 0);
});
