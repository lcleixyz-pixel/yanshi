import assert from 'node:assert/strict';
import test from 'node:test';
import type { GemCharacteristics } from '../../src/data/types';
import { SAMPLES_BY_ID } from '../../src/data/samples';
import { requiredRefractometerMethod } from '../../src/data/refractometerSampleMethod';
import { getSpotDisplayRi } from '../../src/components/refractometer/refractometerObsUtils';
import { checkRI, formatRIReference } from '../../src/domain/refractometerAssessment';

test('葡萄石按实际点测流程保存 1.64 后，参考范围核对通过', () => {
  const sample = SAMPLES_BY_ID.prehnite;
  const standard = sample.characteristics.refractiveIndex;
  const method = requiredRefractometerMethod(sample);
  const recorded = getSpotDisplayRi(standard);
  assert.equal(method, 'spot');
  assert.equal(recorded, 1.64);
  assert.equal(checkRI(recorded, recorded, standard, method), true);
  assert.equal(checkRI(1.75, 1.75, standard, method), false);
});

test('点测核对一个读数，并接受两位小数带来的边界舍入', () => {
  const standard: [number, number] = [1.611, 1.669];
  assert.equal(checkRI(1.64, null, standard, 'spot'), true);
  assert.equal(checkRI(1.61, 1.61, standard, 'spot'), true);
  assert.equal(checkRI(1.67, 1.67, standard, 'spot'), true);
  assert.equal(checkRI(1.60, 1.60, standard, 'spot'), false);
  assert.equal(checkRI(1.68, 1.68, standard, 'spot'), false);
  assert.equal(checkRI(1.52, 1.52, 1.524, 'spot'), true);
  assert.equal(checkRI(1.54, 1.54, 1.524, 'spot'), false);
});

test('刻面法保留双端核对和 0.005 容差，不能用范围中间值代替', () => {
  const standard: [number, number] = [1.611, 1.669];
  assert.equal(checkRI(1.611, 1.669, standard, 'facet'), true);
  assert.equal(checkRI(1.615, 1.665, standard, 'facet'), true);
  assert.equal(checkRI(1.617, 1.669, standard, 'facet'), false);
  assert.equal(checkRI(1.611, 1.675, standard, 'facet'), false);
  assert.equal(checkRI(1.64, 1.64, standard, 'facet'), false);
  assert.equal(checkRI(1.611, null, standard, 'facet'), false);
  assert.equal(checkRI(1.544, null, 1.54, 'facet'), true);
  assert.equal(checkRI(1.546, null, 1.54, 'facet'), false);
  assert.equal(checkRI(1.64, 1.64, standard, null), false);
});

test('超量程仍只接受空数值记录，不把刻度上限当成测量值', () => {
  const standards: GemCharacteristics['refractiveIndex'][] = ['over-1.78', 2.417, [1.93, 1.987]];
  for (const standard of standards) {
    for (const method of ['spot', 'facet', null] as const) {
      assert.equal(checkRI(null, null, standard, method), true);
      assert.equal(checkRI(1.78, 1.78, standard, method), false);
    }
  }
});

test('量程内没有读数或读数无效时不通过', () => {
  for (const method of ['spot', 'facet', null] as const) {
    assert.equal(checkRI(null, null, [1.611, 1.669], method), false);
    assert.equal(checkRI(Number.NaN, null, 1.54, method), false);
    assert.equal(checkRI(Infinity, null, 1.54, method), false);
  }
});

test('点测参考用两位小数并标明单读数范围，刻面参考保持原精度', () => {
  assert.equal(formatRIReference([1.611, 1.669], 'spot'), '点测参考 1.61 – 1.67（单次近似读数范围，不代表双折射率）');
  assert.equal(formatRIReference(1.54, 'spot'), '点测参考 1.54（近似值）');
  assert.equal(formatRIReference([1.611, 1.669], 'facet'), '1.611 – 1.669');
  assert.equal(formatRIReference('over-1.78', 'spot'), '点测参考 > 1.780（超折射油）');
});
