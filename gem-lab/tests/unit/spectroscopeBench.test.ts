import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES_BY_ID } from '../../src/data/samples';
import type { SampleDef } from '../../src/data/types';
import {
  BENCH_GEOMETRY,
  benchLampPose,
  benchMethodSetup,
  benchScopePose,
  benchObservationIsCurrent,
  benchSpecimenProfile,
  createBenchState,
  evaluateBench,
  normalizeBenchState,
  setBenchMethod,
  type BenchMethod,
  type BenchState,
} from '../../src/domain/spectroscopeBench';

const clear = SAMPLES_BY_ID.almandine;
const ready = (method: BenchMethod = 'transmission', patch: Partial<BenchState> = {}): BenchState => ({
  ...createBenchState(), power: true, samplePlaced: true, method, ...benchMethodSetup(method), ...patch,
});

test('关闭光源时目镜黑暗；开灯但未放样的直射连续谱不能变成样品观察', () => {
  const state = createBenchState();
  const off = evaluateBench(clear, state);
  assert.equal(off.lightPath, 'off');
  assert.equal(off.display.brightness, 0);
  assert.deepEqual(off.display.features, []);
  assert.equal(off.canRecord, false);
  const empty = evaluateBench(clear, { ...state, power: true });
  assert.equal(empty.lightPath, 'bypass');
  assert.equal(empty.spectrumMode, 'continuous-light');
  assert.ok(empty.display.brightness > 0);
  assert.equal(empty.canRecord, false);
  assert.ok(empty.problemCodes.includes('sample-absent'));
  const side = evaluateBench(clear, { ...ready('internal-reflection'), samplePlaced: false });
  assert.equal(side.lightPath, 'missed');
  assert.equal(side.display.brightness, 0);
});

test('透射水平直入；反射由上方两侧斜照和观察，布置可达但无对应谱时不能记录吸收', () => {
  for (const method of ['transmission', 'internal-reflection', 'surface-reflection'] as const) {
    const observed = evaluateBench(clear, ready(method));
    assert.ok(Math.abs(observed.beamXAtSample) < 1e-12);
    assert.equal(observed.lightPath, 'aligned');
    const reflected = method !== 'transmission';
    assert.equal(observed.canRecord, !reflected);
    assert.equal(observed.spectrumMode, reflected ? 'method-unverified' : 'reference-simulation');
    assert.equal(observed.methodEvidence, reflected ? 'setup-only' : 'reference-absorption');
    assert.equal(observed.display.features.length, reflected ? 0 : clear.spectrum.features.length);
    if (reflected) {
      assert.equal(observed.recordStatus, 'setup-only');
      assert.equal(observed.display.brightness, 0);
      assert.ok(observed.notices.some((note) => note.includes('上方两侧')));
      const lamp = benchLampPose(ready(method));
      const scope = benchScopePose(ready(method));
      assert.equal(lamp.pivotY, 0.21);
      assert.equal(lamp.pivotZ, -0.09);
      assert.equal(lamp.worldYaw, 0);
      assert.equal(lamp.worldPitch, Math.PI / 4);
      assert.equal(ready(method).lampLateral, 0);
      assert.ok(lamp.direction[1] < 0 && lamp.direction[2] > 0);
      assert.ok(scope.axis[1] > 0 && scope.axis[2] > 0);
      assert.ok(scope.entry[1] > 0.12 && scope.entry[2] > 0);
      assert.ok(Math.abs(lamp.beamYAtSample - 0.12) < 1e-12);
    } else assert.equal(benchLampPose(ready(method)).pivotZ, -0.09);
  }
  const before = ready();
  const switched = setBenchMethod(before, 'surface-reflection');
  assert.equal(switched.lampAngle, before.lampAngle);
  assert.equal(switched.lampLateral, before.lampLateral);
  assert.equal(evaluateBench(clear, switched).canRecord, false);
  assert.ok(evaluateBench(clear, switched).problemCodes.includes('lamp-missed'));
});

test('光束命中按灯头出光方向与样品位置计算，移动样品还能离开入镜轴', () => {
  const hit = ready('transmission', { sampleOffset: 0.5, lampLateral: 0.5 * BENCH_GEOMETRY.sampleLateralScale / BENCH_GEOMETRY.lateralScale });
  const offAxisButHit = evaluateBench(clear, hit);
  assert.ok(Math.abs(offAxisButHit.beamXAtSample - offAxisButHit.sampleX) < 1e-12);
  assert.equal(offAxisButHit.lightPath, 'weak');
  const tooFar = evaluateBench(clear, { ...hit, sampleOffset: 1, lampLateral: BENCH_GEOMETRY.sampleLateralScale / BENCH_GEOMETRY.lateralScale });
  assert.ok(Math.abs(tooFar.beamXAtSample - tooFar.sampleX) < 1e-12);
  assert.equal(tooFar.lightPath, 'missed');
  assert.ok(tooFar.problemCodes.includes('sample-off-axis'));
  assert.equal(tooFar.canRecord, false);
  const missed = evaluateBench(clear, ready('transmission', { lampLateral: 1 }));
  assert.ok(missed.problemCodes.includes('lamp-missed'));
  assert.equal(missed.display.brightness, 0);
});

test('简化器材中没有暗藏的遮光板：正确对光可达，只有未放样直射才显示连续旁路', () => {
  assert.equal('baffle' in createBenchState(), false);
  const observed = evaluateBench(clear, ready());
  assert.equal(observed.lightPath, 'aligned');
  assert.equal(observed.canRecord, true);
  assert.ok(observed.display.features.length > 0);
  const noSample = evaluateBench(clear, ready('transmission', { samplePlaced: false }));
  assert.equal(noSample.lightPath, 'bypass');
  assert.equal(noSample.canRecord, false);
  const missed = evaluateBench(clear, ready('transmission', { sampleOffset: 1 }));
  assert.equal(missed.lightPath, 'missed');
  assert.notEqual(missed.lightPath, 'bypass');
});

test('两种反射默认上方 V 形布置可达，方法区别不依赖左右灯角', () => {
  assert.deepEqual(benchMethodSetup('internal-reflection'), benchMethodSetup('surface-reflection'));
  for (const method of ['internal-reflection', 'surface-reflection'] as const) {
    const reachable = evaluateBench(clear, ready(method));
    assert.equal(reachable.lightPath, 'aligned');
    assert.equal(reachable.signal, 'adequate');
    assert.equal(reachable.methodEvidence, 'setup-only');
    assert.equal(reachable.canRecord, false);
  }
});

test('反射俯角是真实照样条件，5°/75°改变高度落点且均不能观察', () => {
  for (const method of ['internal-reflection', 'surface-reflection'] as const) {
    for (const angle of [5, 75]) {
      const state = ready(method, { lampAngle: angle });
      const lamp = benchLampPose(state);
      assert.equal(lamp.beamXAtSample, 0);
      assert.ok(Math.abs(lamp.beamYAtSample - BENCH_GEOMETRY.sampleCenterY) > BENCH_GEOMETRY.sampleCatchRadius);
      const result = evaluateBench(clear, state);
      assert.equal(result.lightPath, 'missed');
      assert.ok(result.problemCodes.includes('lamp-missed'));
      assert.equal(result.signal, 'none');
      assert.equal(result.canRecord, false);
    }
  }
});

test('反射横移不再充当水平转角补偿，离轴样品即使照中仍不能有效入镜', () => {
  const state = ready('internal-reflection', { lampLateral: 0.035 / 0.11, sampleOffset: 1 });
  assert.ok(Math.abs(benchLampPose(state).beamXAtSample - 0.035) < 1e-12);
  const result = evaluateBench(clear, state);
  assert.equal(result.lightPath, 'missed');
  assert.ok(result.problemCodes.includes('sample-off-axis'));
  assert.equal(result.canRecord, false);
  const target = [0, 0.124, -0.004] as const;
  const scope = benchScopePose(state, target);
  assert.ok(Math.abs(scope.entry[1] - target[1] - scope.entry[2] + target[2]) < 1e-12);
  assert.equal(scope.elevation, Math.PI / 4);
});

test('不透明样品透射与内反射不可观察；表面反射保留布置练习但不挪用透射谱', () => {
  const turquoise = SAMPLES_BY_ID.turquoise;
  assert.equal(benchSpecimenProfile(turquoise).transmission, 'opaque');
  for (const method of ['transmission', 'internal-reflection'] as const) {
    const observed = evaluateBench(turquoise, ready(method));
    assert.equal(observed.lightPath, 'blocked');
    assert.equal(observed.spectrumMode, method === 'transmission' ? 'no-signal' : 'method-unverified');
    assert.equal(observed.canRecord, false);
    assert.equal(observed.display.brightness, 0);
  }
  const reflected = evaluateBench(turquoise, ready('surface-reflection'));
  assert.equal(reflected.lightPath, 'aligned');
  assert.equal(reflected.canRecord, false);
  assert.deepEqual(reflected.display.features, []);
  assert.equal(reflected.methodEvidence, 'setup-only');
});

test('半透明及跨度较宽的透明度范围保留受限观察，不自动等同不透明或无吸收', () => {
  const prehnite = SAMPLES_BY_ID.prehnite;
  assert.equal(benchSpecimenProfile(prehnite).transmission, 'limited');
  const transmitted = evaluateBench(prehnite, ready());
  assert.equal(transmitted.signal, 'weak');
  assert.equal(transmitted.canRecord, true);
  assert.ok(transmitted.notices.some((note) => note.includes('不是') || note.includes('不能替代')));
  assert.ok(transmitted.display.violetDim > 0);
  const improved = evaluateBench(prehnite, ready('internal-reflection'));
  assert.equal(improved.signal, 'adequate');
  assert.deepEqual(improved.display.features, []);
  assert.equal(improved.canRecord, false);
  assert.equal(improved.referenceStatus, 'non-diagnostic');
  for (const id of ['jadeite', 'nephrite', 'jinsi-jade']) {
    assert.equal(benchSpecimenProfile(SAMPLES_BY_ID[id]).transmission, 'limited');
    assert.notEqual(evaluateBench(SAMPLES_BY_ID[id], ready()).lightPath, 'blocked');
  }
});

test('不特征是可以记录的资料状态；待核谱图与物理暗场都不能代替未见吸收', () => {
  const nonDiagnostic = evaluateBench(SAMPLES_BY_ID.opal, ready('transmission'));
  assert.equal(nonDiagnostic.referenceStatus, 'non-diagnostic');
  assert.equal(nonDiagnostic.canRecord, true);
  assert.equal(nonDiagnostic.spectrumMode, 'reference-simulation');
  assert.equal(nonDiagnostic.display.features.length, 0);
  assert.ok(nonDiagnostic.display.brightness > 0);
  const unverified = evaluateBench(SAMPLES_BY_ID.tourmaline, ready());
  assert.equal(unverified.referenceStatus, 'unverified');
  assert.equal(unverified.spectrumMode, 'unverified');
  assert.equal(unverified.recordStatus, 'unverified');
  assert.equal(unverified.canRecord, false);
  assert.equal(unverified.display.brightness, 0);
  assert.ok(!('observationAnswer' in nonDiagnostic));
  assert.ok(!('observationAnswer' in unverified));
});

test('亮度与刻面朝向只改变可见性，绝不新增波长；全暗不可记录', () => {
  const ideal = evaluateBench(clear, ready());
  const low = evaluateBench(clear, ready('transmission', { brightness: 0.2 }));
  assert.equal(low.signal, 'weak');
  assert.ok(low.display.brightness < ideal.display.brightness);
  assert.equal(low.canRecord, true);
  assert.ok(low.display.features.every((f) => clear.spectrum.features.some((source) => source.wavelength === f.wavelength)));
  const rotated = evaluateBench(clear, ready('transmission', { sampleRotation: 90 }));
  assert.equal(rotated.signal, 'weak');
  const dark = evaluateBench(clear, ready('transmission', { brightness: 0 }));
  assert.equal(dark.lightPath, 'off');
  assert.equal(dark.canRecord, false);
  assert.equal(dark.display.brightness, 0);
});

test('棱镜式光学设置不合格先调整，光栅式固定机构不继承这些显示误差', () => {
  const prism = evaluateBench(clear, ready('transmission', { slit: 0.9, focus: 0.1 }));
  assert.equal(prism.canRecord, false);
  assert.ok(prism.problemCodes.includes('slit-wide'));
  assert.ok(prism.problemCodes.includes('defocus'));
  const grating = evaluateBench(clear, ready('transmission', { dispersion: 'grating', slit: 0.9, focus: 0.1 }));
  assert.equal(grating.canRecord, true);
  assert.ok(!grating.problemCodes.includes('slit-wide'));
  assert.ok(!grating.problemCodes.includes('defocus'));
  assert.deepEqual(grating.display.features.map((f) => f.wavelength), clear.spectrum.features.map((f) => f.wavelength).sort((a, b) => a - b));
});

test('换样、全部设置、参考资料变化都会使保存观察失效，旧设置原样返回可识别', () => {
  const state = ready();
  const signature = evaluateBench(clear, state).signature;
  assert.equal(benchObservationIsCurrent(clear, { ...state }, signature), true);
  const changes: Partial<BenchState>[] = [
    { dispersion: 'grating' }, { power: false }, { brightness: 0.8 }, { lampLateral: 0.1 },
    { lampAngle: 1 }, { samplePlaced: false }, { sampleOffset: 0.1 }, { sampleRotation: 10 },
    { method: 'internal-reflection' }, { slit: 0.31 }, { focus: 0.49 },
  ];
  for (const patch of changes) assert.equal(benchObservationIsCurrent(clear, { ...state, ...patch }, signature), false, JSON.stringify(patch));
  assert.equal(benchObservationIsCurrent(SAMPLES_BY_ID.pyrope, state, signature), false);
  const updated: SampleDef = { ...clear, spectrum: { ...clear.spectrum, features: [{ type: 'line', wavelength: 500, intensity: 'weak' }] } };
  assert.equal(benchObservationIsCurrent(updated, state, signature), false);
  assert.equal(benchObservationIsCurrent(clear, state, undefined), false);
});

test('越界数值归一后仍是有限教学坐标，不产生 NaN 光束或负亮度', () => {
  const unsafe = ready('transmission', { brightness: -2, lampAngle: Infinity, lampLateral: NaN, sampleOffset: NaN, sampleRotation: -10 });
  const normalized = normalizeBenchState(unsafe);
  assert.equal(normalized.brightness, 0);
  assert.equal(normalized.lampAngle, 0);
  assert.equal(normalized.lampLateral, 0);
  assert.equal(normalized.sampleOffset, 0);
  assert.equal(normalized.sampleRotation, 350);
  const observed = evaluateBench(clear, unsafe);
  assert.ok(Number.isFinite(observed.beamXAtSample));
  assert.equal(observed.display.brightness, 0);
  assert.equal(observed.canRecord, false);
});
