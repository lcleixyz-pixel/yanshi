import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SAMPLES } from '../../src/data/samples';
import { caseIdForSample, displayRiForSample, isOverContactLimit } from '../../src/domain/refractometerSampleCases';

/**
 * 逐样品光路案例是离线生成的（tools/3d-assets/.../generate_sample_cases.py）。
 * 这里只核对「生成结果覆盖代码会选到的每一条」，避免两边悄悄漂开。
 */
const file = JSON.parse(readFileSync(new URL('../../public/assets/3d/refractometer/sample-cases-v1/sample-cases.json', import.meta.url), 'utf8')) as {
  cases: { id: string; paths: { points: number[][] }[]; readout: { sampleRI: string | null; status: string } }[];
};
const ids = new Set(file.cases.map((item) => item.id));

test('每个教学样品都能选到一条接触良好的光路案例', () => {
  for (const sample of SAMPLES) {
    const id = caseIdForSample(sample, 'good');
    assert.ok(ids.has(id) || id === 'over-liquid', `${sample.id}（${sample.name}）应能选到案例，实际选了 ${id}`);
  }
});

test('超接触液上限的样品一律走 over-liquid，不给数值读数', () => {
  for (const sample of SAMPLES.filter(isOverContactLimit)) {
    assert.equal(caseIdForSample(sample, 'good'), 'over-liquid');
    assert.equal(displayRiForSample(sample), null);
  }
  assert.equal(ids.has('over-liquid'), false, 'over-liquid 属于主案例包，不重复放进逐样品案例');
});

test('空气间隙一律用固定案例，与样品无关', () => {
  for (const sample of SAMPLES) assert.equal(caseIdForSample(sample, 'air-gap'), 'air-gap');
});

test('每条案例都有可画的路径与一致的读数', () => {
  assert.ok(file.cases.length > 0);
  for (const item of file.cases) {
    const ri = item.id.replace('sample-', '');
    assert.match(item.id, /^sample-\d\.\d{3}$/);
    assert.equal(item.readout.sampleRI, ri);
    assert.equal(item.readout.status, 'valid-ideal-example');
    assert.ok(item.paths.length >= 6, `${item.id} 的代表路径过少`);
    for (const path of item.paths) {
      assert.ok(path.points.length >= 2, `${item.id} 存在不完整路径`);
      for (const point of path.points) {
        assert.equal(point.length, 3);
        assert.ok(point.every((value) => Number.isFinite(value)), `${item.id} 出现非有限坐标`);
      }
    }
  }
});

test('案例 id 不重复', () => {
  assert.equal(ids.size, file.cases.length);
});
