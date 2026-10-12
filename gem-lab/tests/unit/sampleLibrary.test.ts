import assert from 'node:assert/strict';
import test from 'node:test';
import { SAMPLES, SAMPLES_BY_DIFFICULTY, SAMPLES_BY_ID } from '../../src/data/samples';
import { requiredRefractometerMethod } from '../../src/data/refractometerSampleMethod';
import { checkRI } from '../../src/domain/refractometerAssessment';
import { masteryFromHistory, masteryLevel, selectPracticeSample } from '../../src/domain/practice';
import { getPolariscopeProfile } from '../../src/domain/polariscopeSamples';
import { buildSampleFieldMap, judgeObservation } from '../../src/domain/eyepieceField';

test('不特征和待核谱图不缩小练习样品池；新品种均可被抽到，旧混合条目不再被抽到', () => {
  assert.ok(SAMPLES.length >= 30, '扩充到当前范围后不回退到旧的 28 种上限');
  assert.equal(new Set(SAMPLES.map((sample) => sample.id)).size, SAMPLES.length);
  const drawn = new Set<string>();
  for (const pool of Object.values(SAMPLES_BY_DIFFICULTY)) {
    for (let i = 0; i < 1000; i++) {
      const sample = selectPracticeSample(pool, [], null, () => i / 1000);
      if (sample) drawn.add(sample.id);
    }
  }
  for (const id of ['almandine', 'pyrope', 'red-tourmaline', 'tourmaline', 'opal', 'prehnite']) {
    assert.ok(drawn.has(id), `${id} 仍有新练习入口`);
  }
  assert.ok(!drawn.has('garnet'));
  assert.deepEqual(drawn, new Set(SAMPLES.map((sample) => sample.id)));
});

test('旧石榴石成绩保持原身份，不授予铁铝或镁铝新分类掌握度', () => {
  const history = [1, 2].map((completedAt) => ({ sampleId: 'garnet', correct: true, completedAt, attempts: 1 }));
  const snapshot = JSON.stringify(history);
  const mastery = masteryFromHistory(history);
  assert.equal(masteryLevel(mastery.garnet), 'mastered');
  assert.equal(masteryLevel(mastery.almandine), 'new');
  assert.equal(masteryLevel(mastery.pyrope), 'new');
  assert.equal(SAMPLES_BY_ID.garnet.id, 'garnet');
  assert.notEqual(SAMPLES_BY_ID.garnet, SAMPLES_BY_ID.almandine);
  assert.notEqual(SAMPLES_BY_ID.garnet, SAMPLES_BY_ID.pyrope);
  assert.equal(JSON.stringify(history), snapshot);
});

test('拆分后的石榴石经同一折射仪判定：铁铝样品超量程，镁铝可记录单读数', () => {
  const almandine = SAMPLES_BY_ID.almandine, pyrope = SAMPLES_BY_ID.pyrope;
  const almandineRi = almandine.characteristics.refractiveIndex, pyropeRi = pyrope.characteristics.refractiveIndex;
  assert.equal(requiredRefractometerMethod(almandine), 'facet');
  assert.equal(requiredRefractometerMethod(pyrope), 'facet');
  assert.equal(checkRI(null, null, almandineRi, 'facet'), true);
  assert.equal(checkRI(1.78, 1.78, almandineRi, 'facet'), false, '不能用刻度上限伪造实测值');
  assert.equal(checkRI(1.74, 1.74, almandineRi, 'facet'), false, '旧版混合 RI 不适用于铁铝教学样品');
  assert.equal(checkRI(1.74, null, pyropeRi, 'facet'), true);
  assert.equal(checkRI(null, null, pyropeRi, 'facet'), false);
});

test('光谱诊断价值不会覆盖偏光镜的独立光学现象，新石榴石只对设定应变作反应', () => {
  const observe = (id: string, strain?: number) => {
    const profile = getPolariscopeProfile(id)!;
    assert.ok(profile, `${id} 有偏光模型`);
    const settings = { orientation: 'general' as const, strain: strain ?? profile.defaultStrain };
    return judgeObservation(profile, settings, buildSampleFieldMap(profile, settings, 48));
  };
  assert.equal(observe('tourmaline'), 'four-bright-four-dark', '未核定光谱不能使碧玺失去偏光教学');
  assert.equal(observe('red-tourmaline'), 'four-bright-four-dark');
  assert.equal(observe('prehnite'), 'all-bright', '弱带不影响当前集合体样品的偏光反应');
  assert.equal(observe('opal'), 'all-dark');
  assert.equal(observe('almandine'), 'anomalous');
  assert.equal(observe('almandine', 0), 'all-dark', '应变可关闭，不把异常双折射当物种固有必现属性');
  assert.equal(observe('pyrope'), 'all-dark');
});
