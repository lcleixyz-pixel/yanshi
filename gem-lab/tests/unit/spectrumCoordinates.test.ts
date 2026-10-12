import test from 'node:test';
import assert from 'node:assert/strict';
import { positionToWavelength, wavelengthRangeToPositions, wavelengthToPosition } from '../../src/domain/spectrumCoordinates';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≈ ${expected}`);

test('两机型都以同一 nm 波长往返换算，左红右紫，不丢失 653.5 等小数波长', () => {
  for (const dispersion of ['prism', 'grating'] as const) {
    for (const nm of [400, 438, 453, 477, 497, 505, 520, 564, 573, 653.5, 694, 700]) {
      close(positionToWavelength(wavelengthToPosition(nm, dispersion), dispersion), nm);
    }
    assert.equal(wavelengthToPosition(400, dispersion), 1);
    assert.equal(wavelengthToPosition(700, dispersion), 0);
  }
});

test('光栅等波长间隔等距；棱镜同样 50 nm 的蓝紫间隔比红区展开', () => {
  const width = (a: number, b: number, dispersion: 'prism' | 'grating') => wavelengthRangeToPositions(a, b, dispersion)!.width;
  close(width(400, 450, 'grating'), width(650, 700, 'grating'));
  assert.ok(width(400, 450, 'prism') > width(650, 700, 'prism'));
  assert.notEqual(wavelengthToPosition(550, 'prism'), wavelengthToPosition(550, 'grating'));
});

test('棱镜吸收带左右边缘精确对应两端波长，不能以映射中心平分像素宽度', () => {
  const band = wavelengthRangeToPositions(540, 620, 'prism')!;
  close(positionToWavelength(band.left, 'prism'), 620);
  close(positionToWavelength(band.left + band.width, 'prism'), 540);
  assert.ok(Math.abs(band.left + band.width / 2 - wavelengthToPosition(580, 'prism')) > 0.001);
});

test('跨出可见范围的带按端点裁切；完全越界的带不挤到边界充当假吸收', () => {
  for (const dispersion of ['prism', 'grating'] as const) {
    const violet = wavelengthRangeToPositions(390, 430, dispersion)!;
    close(violet.left + violet.width, 1);
    close(positionToWavelength(violet.left, dispersion), 430);
    const red = wavelengthRangeToPositions(680, 720, dispersion)!;
    close(red.left, 0);
    close(positionToWavelength(red.width, dispersion), 680);
    assert.deepEqual(wavelengthRangeToPositions(720, 680, dispersion), red);
    assert.equal(wavelengthRangeToPositions(710, 740, dispersion), null);
    assert.equal(wavelengthRangeToPositions(360, 390, dispersion), null);
    assert.equal(wavelengthRangeToPositions(Number.NaN, 450, dispersion), null);
    assert.equal(positionToWavelength(-0.01, dispersion), 700);
    assert.equal(positionToWavelength(1.01, dispersion), 400);
  }
});
