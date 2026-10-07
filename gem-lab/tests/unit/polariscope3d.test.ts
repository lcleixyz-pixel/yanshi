import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_OBSERVATIONS,
  createInitialPolariscope3DState,
  evaluatePolariscope3D,
  validatePolariscopeObservations,
  type PolariscopeObservationDataset,
  type Polariscope3DState,
} from '../../src/domain/polariscope3d';

// Deliberately synthetic schema fixture. These media paths are not observation assets.
function approvedFixture(): PolariscopeObservationDataset {
  const dataset = structuredClone(DEFAULT_OBSERVATIONS);
  dataset.status = 'approved';
  dataset.series = [{
    id: 'unit-test-only-series',
    sampleId: 'unit-test-only-sample',
    orientation: { id: 'unit-test-only-orientation', description: '测试取向，不代表真实样品', mountingDescription: '测试安装条件' },
    conditions: { sourceInstrumentId: 'unit-test-only-instrument', illumination: '测试照明', analyzerAngleDegrees: 90, polarizerAngleDegrees: 0 },
    coverage: { startAngleDegrees: 0, endAngleDegrees: 360, maxGapDegrees: 90 },
    scope: { permittedUses: ['recorded-media-playback', 'rotation-observation'], limitations: ['仅用于单元测试'], interpolation: 'none', angleToleranceDegrees: 0.5 },
    review: { status: 'approved', reviewer: 'unit-test-only-reviewer', reviewedAt: '2026-10-05' },
    records: [0, 90, 180, 270, 360].map((angle, index) => ({
      id: `unit-test-only-record-${index}`,
      stageAngleDegrees: angle,
      analyzerAngleDegrees: 90,
      polarizerAngleDegrees: 0,
      media: { kind: 'video', src: '/unit-test-only/not-a-real-recording.mp4', seconds: index },
      observation: '纯测试记录，不是实测描述',
    })),
  }];
  return dataset;
}

const sampleState = (overrides: Partial<Polariscope3DState> = {}) => createInitialPolariscope3DState({
  mode: 'practice', samplePresent: true, sampleId: 'unit-test-only-sample', orientationId: 'unit-test-only-orientation', ...overrides,
});

test('ideal empty field follows analyzer angle and is independent of stage angle and selection', () => {
  for (const [analyzerAngle, expected] of [[0, 1], [45, 0.5], [90, 0], [180, 1], [270, 0], [360, 1], [-90, 0]]) {
    for (const stageAngle of [0, 35, 180, 360]) {
      const result = evaluatePolariscope3D(createInitialPolariscope3DState({ analyzerAngle, stageAngle, selectedPart: 'stage' }));
      assert.equal(result.observationStatus, 'ideal');
      assert.ok(Math.abs(result.relativeIntensity! - expected) < 1e-12);
      assert.equal(result.canShowLightPath, true);
      assert.equal(result.workflow.canComplete, false);
    }
  }
});

test('factory starts with the entire instrument and does not share mutable practice history', () => {
  const first = createInitialPolariscope3DState();
  const second = createInitialPolariscope3DState();
  assert.equal(first.selectedPart, null);
  assert.equal(first.isolatedPart, null);
  assert.equal(first.analyzerAngle, 90);
  first.practiceProgress!.viewedObservationIds.push('local-only');
  assert.deepEqual(second.practiceProgress!.viewedObservationIds, []);
  assert.equal(evaluatePolariscope3D(second).workflow.alignmentReady, true);
});

test('power, exploded assembly and isolation block optical observation before considering evidence', () => {
  const cases: Partial<Polariscope3DState>[] = [
    { power: false }, { mode: 'explode' }, { explosion: 0.001 }, { isolatedPart: 'analyzer' },
    { analyzerAngle: NaN }, { stageAngle: Infinity }, { explosion: -0.1 }, { explosion: 1.1 },
  ];
  for (const overrides of cases) {
    for (const samplePresent of [false, true]) {
      const result = evaluatePolariscope3D(sampleState({ ...overrides, samplePresent }), approvedFixture());
      assert.equal(result.observationStatus, 'blocked');
      assert.equal(result.relativeIntensity, null);
      assert.equal(result.canObserve, false);
      assert.equal(result.canShowLightPath, false);
      assert.equal(result.workflow.alignmentReady, false);
      assert.equal(result.workflow.canComplete, false);
      assert.ok(result.workflow.blockedReason);
    }
  }
});

test('shipped data is empty and pending and cannot complete sample practice even with claimed progress', () => {
  assert.equal(validatePolariscopeObservations(DEFAULT_OBSERVATIONS).valid, true);
  assert.equal(DEFAULT_OBSERVATIONS.status, 'pending');
  assert.deepEqual(DEFAULT_OBSERVATIONS.series, []);
  assert.deepEqual(DEFAULT_OBSERVATIONS.metadata.lowerPolarizerStageCoupling.value, null);
  const result = evaluatePolariscope3D(sampleState({ practiceProgress: {
    emptyFieldAligned: true, rotationDegrees: 720, viewedObservationIds: ['invented'], interpretationAcknowledged: true,
  } }));
  assert.equal(result.observationStatus, 'pending');
  assert.equal(result.relativeIntensity, null);
  assert.equal(result.canObserve, false);
  assert.equal(result.canShowLightPath, false);
  assert.equal(result.workflow.evidenceReady, false);
  assert.equal(result.workflow.canComplete, false);
});

test('approved labels cannot replace full-turn angle, timestamp, media and review evidence', () => {
  assert.equal(validatePolariscopeObservations(approvedFixture()).valid, true);
  const changes: ((dataset: PolariscopeObservationDataset) => void)[] = [
    d => { d.series = []; },
    d => { d.series[0].coverage.endAngleDegrees = 180; },
    d => { d.series[0].records.pop(); },
    d => { d.series[0].records.splice(2, 1); },
    d => { d.series[0].records[1].media.seconds = 0; },
    d => { d.series[0].records[0].media.src = ''; },
    d => { d.series[0].records[0].media.src = 'javascript:alert(1)'; },
    d => { d.series[0].records[0].polarizerAngleDegrees = 90; },
    d => { d.series[0].orientation.description = ''; },
    d => { d.series[0].conditions.illumination = ''; },
    d => { d.series[0].scope.limitations = []; },
    d => { d.series[0].review.reviewer = ''; },
    d => { d.series[0].review.reviewedAt = 'unknown'; },
    d => { d.series[0].records[1].id = d.series[0].records[0].id; },
    d => { d.metadata.lowerPolarizerStageCoupling.value = 'coupled'; },
  ];
  for (const change of changes) {
    const dataset = approvedFixture();
    change(dataset);
    const validation = validatePolariscopeObservations(dataset);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.length);
    assert.deepEqual(validation.approvedSeries, []);
    assert.equal(evaluatePolariscope3D(sampleState(), dataset).observationStatus, 'pending');
  }
});

test('actual-media eligibility is specific to sample, orientation and recorded angles, with no interpolation', () => {
  const dataset = approvedFixture();
  const result = evaluatePolariscope3D(sampleState({ stageAngle: 90 }), dataset);
  assert.equal(result.observationStatus, 'approved');
  assert.equal(result.matchedObservation?.id, 'unit-test-only-record-1');
  assert.equal(evaluatePolariscope3D(sampleState({ stageAngle: 360 }), dataset).matchedObservation?.id, 'unit-test-only-record-4');
  assert.equal(evaluatePolariscope3D(sampleState({ stageAngle: 0 }), dataset).matchedObservation?.id, 'unit-test-only-record-0');
  assert.equal(result.canObserve, true);
  assert.equal(result.canShowLightPath, false);
  assert.equal(result.relativeIntensity, null);
  for (const patch of [{ sampleId: 'different' }, { orientationId: null }, { stageAngle: 45 }, { analyzerAngle: 0 }]) {
    const mismatch = evaluatePolariscope3D(sampleState(patch), dataset);
    assert.equal(mismatch.observationStatus, 'pending');
    assert.equal(mismatch.matchedObservation, null);
    assert.equal(mismatch.relativeIntensity, null);
  }
});

test('sample workflow needs alignment, a full rotation, every recorded observation and interpretation', () => {
  const dataset = approvedFixture();
  const progress = {
    emptyFieldAligned: true,
    rotationDegrees: 360,
    viewedObservationIds: dataset.series[0].records.map(record => record.id),
    interpretationAcknowledged: true,
  };
  const complete = evaluatePolariscope3D(sampleState({ practiceProgress: progress }), dataset);
  assert.equal(complete.workflow.step, 'interpret');
  assert.equal(complete.workflow.canComplete, true);
  for (const change of [
    { emptyFieldAligned: false }, { rotationDegrees: 359 }, { viewedObservationIds: progress.viewedObservationIds.slice(1) },
    { interpretationAcknowledged: false },
  ]) {
    assert.equal(evaluatePolariscope3D(sampleState({ practiceProgress: { ...progress, ...change } }), dataset).workflow.canComplete, false);
  }
  assert.equal(evaluatePolariscope3D(sampleState({ mode: 'structure', practiceProgress: progress }), dataset).workflow.canComplete, false);
  const pendingReview = approvedFixture();
  pendingReview.status = 'pending';
  assert.equal(evaluatePolariscope3D(sampleState({ practiceProgress: progress }), pendingReview).workflow.canComplete, false);
});

test('evaluation is pure and rejects malformed external observation data without throwing', () => {
  const state = sampleState();
  const dataset = approvedFixture();
  const before = JSON.stringify({ state, dataset });
  evaluatePolariscope3D(state, dataset);
  assert.equal(JSON.stringify({ state, dataset }), before);
  for (const malformed of [null, [], {}, { series: [null] }, { schemaVersion: 1, status: 'approved', series: [] }]) {
    assert.equal(evaluatePolariscope3D(state, malformed).observationStatus, 'pending');
    assert.equal(validatePolariscopeObservations(malformed).valid, false);
  }
});
