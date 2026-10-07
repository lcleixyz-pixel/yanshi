import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInitialStructureState,
  deriveTeachingOptics,
  STRUCTURE_PART_IDS,
  type PolariscopeStructureState,
  type PrincipleExample,
} from '../../src/domain/polariscopeStructure';

const optics = (overrides: Partial<PolariscopeStructureState> = {}) => deriveTeachingOptics(createInitialStructureState(overrides));
const closeTo = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} should equal ${expected}`);

test('teaching starts in the existing component view with an empty assembled instrument', () => {
  const state = createInitialStructureState();
  assert.equal(state.lesson, 'components');
  assert.equal(state.pathStep, 4);
  assert.equal(state.principleExample, 'empty');
  assert.equal(state.showAnnotations, true);
  assert.equal(state.mode, 'structure');
  assert.equal(state.explosion, 0);
  assert.equal(state.isolatedPart, null);
  assert.equal(state.selectedPart, null);
  assert.equal(optics().active, true);
});

test('empty crossed and parallel fields follow Malus law with intensity normalized after the lower polarizer', () => {
  for (const [analyzerAngle, expected] of [[0, 1], [45, 0.5], [90, 0], [180, 1], [270, 0], [360, 1], [-90, 0], [405, 0.5]]) {
    for (const stageAngle of [0, 22.5, 45, 90, 180, 360]) {
      const result = optics({ lesson: 'principle', analyzerAngle, stageAngle });
      assert.equal(result.active, true);
      assert.equal(result.blockedReason, null);
      closeTo(result.relativeTransmission, expected);
    }
  }
  assert.equal(optics({ analyzerAngle: 90 }).relativeTransmission, 0);
});

test('a half-wave plate between crossed polarizers has four bright and four dark positions in one turn', () => {
  const positions = Array.from({ length: 8 }, (_, index) => index * 45);
  const intensities = positions.map(stageAngle => optics({ principleExample: 'half-wave', analyzerAngle: 90, stageAngle }).relativeTransmission);
  assert.deepEqual(intensities, [0, 1, 0, 1, 0, 1, 0, 1]);
  assert.equal(intensities.filter(value => value === 1).length, 4);
  assert.equal(intensities.filter(value => value === 0).length, 4);
  assert.equal(optics({ principleExample: 'half-wave', analyzerAngle: 90, stageAngle: 360 }).relativeTransmission, intensities[0]);
  closeTo(optics({ principleExample: 'half-wave', analyzerAngle: 90, stageAngle: 22.5 }).relativeTransmission, 0.5);
});

test('half-wave teaching uses both analyzer and plate directions, including non-crossed analyzers', () => {
  // A plate at 22.5° produces 45° linearly polarized output from the fixed 0° input.
  for (const [analyzerAngle, expected] of [[0, 0.5], [45, 1], [90, 0.5], [135, 0], [225, 1]]) {
    closeTo(optics({ principleExample: 'half-wave', stageAngle: 22.5, analyzerAngle }).relativeTransmission, expected);
  }
  assert.equal(optics({ principleExample: 'half-wave', stageAngle: 45, analyzerAngle: 0 }).relativeTransmission, 0);
  assert.equal(optics({ principleExample: 'half-wave', stageAngle: 45, analyzerAngle: 90 }).relativeTransmission, 1);
});

test('power off, disassembly, and isolated parts suppress every ideal demonstration', () => {
  const cases: [Partial<PolariscopeStructureState>, 'power-off' | 'disassembled' | 'isolated'][] = [
    [{ power: false }, 'power-off'],
    [{ mode: 'explode', explosion: 0 }, 'disassembled'],
    [{ explosion: 0.001 }, 'disassembled'],
    [{ explosion: 1 }, 'disassembled'],
    ...STRUCTURE_PART_IDS.map(id => [{ isolatedPart: id }, 'isolated'] as [Partial<PolariscopeStructureState>, 'isolated']),
  ];
  for (const principleExample of ['empty', 'half-wave'] as PrincipleExample[]) {
    for (const [overrides, reason] of cases) {
      const result = optics({ lesson: 'principle', principleExample, ...overrides });
      assert.equal(result.active, false);
      assert.equal(result.blockedReason, reason);
      assert.equal(result.relativeTransmission, 0);
    }
  }
  assert.equal(optics({ power: false, explosion: 1, isolatedPart: 'light' }).blockedReason, 'power-off');
  assert.equal(optics({ explosion: 1, isolatedPart: 'light' }).blockedReason, 'disassembled');
});

test('camera and presentation choices do not alter ideal optics, and derivation leaves state untouched', () => {
  const state = createInitialStructureState({ principleExample: 'half-wave', analyzerAngle: 67.5, stageAngle: 22.5 });
  const expected = deriveTeachingOptics(state).relativeTransmission;
  const before = structuredClone(state);
  for (const lesson of ['components', 'path', 'principle'] as const) {
    for (const cameraAzimuth of [0, 90, 180, 270]) {
      const presentation = { ...state, lesson, pathStep: 0, showAnnotations: false, internalView: true, selectedPart: 'analyzer' as const, camera: { azimuth: cameraAzimuth } };
      assert.equal(deriveTeachingOptics(presentation).relativeTransmission, expected);
    }
  }
  assert.deepEqual(state, before);
  assert.equal('camera' in state, false);
});

test('direction wrapping preserves mechanical input while producing equivalent optical axes', () => {
  const state = createInitialStructureState({ principleExample: 'half-wave', analyzerAngle: -90, stageAngle: 405 });
  const result = deriveTeachingOptics(state);
  assert.equal(result.analyzerDirection, 270);
  assert.equal(result.stageDirection, 45);
  assert.equal(result.relativeTransmission, 1);
  assert.equal(state.analyzerAngle, -90);
  assert.equal(state.stageAngle, 405);
  closeTo(result.relativeTransmission, optics({ principleExample: 'half-wave', analyzerAngle: 90, stageAngle: 45 }).relativeTransmission);
});
