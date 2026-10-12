import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduceState, deriveState } from './review-state.mjs';

test('照明模式互斥，关灯和亮度零关闭两组照明', () => {
  for (const mode of ['off', 'darkfield', 'brightfield']) for (const brightness of [0, .5, 1]) {
    const d = deriveState({ ...initialState(), mode, brightness });
    assert.equal(d.darkfieldActive, mode === 'darkfield' && brightness > 0);
    assert.equal(d.brightfieldActive, mode === 'brightfield' && brightness > 0);
    assert.ok(!(d.darkfieldActive && d.brightfieldActive));
  }
});
test('实体电源恢复上次模式，模式切换保持互斥', () => {
  let state = reduceState(initialState(), { type: 'mode', value: 'brightfield' });
  state = reduceState(state, { type: 'power' }); assert.equal(state.mode, 'off');
  state = reduceState(state, { type: 'power' }); assert.equal(state.mode, 'brightfield');
  state = reduceState(state, { type: 'cycleMode' }); assert.equal(state.mode, 'darkfield');
  assert.equal(deriveState(state).brightfieldActive, false);
  state = reduceState(state, { type: 'power' });
  state = reduceState(state, { type: 'cycleMode' }); assert.equal(state.mode, 'off'); assert.equal(state.lastLitMode, 'brightfield');
  state = reduceState(state, { type: 'power' }); assert.equal(state.mode, 'brightfield');
});
test('拆解和隔离暂停照明、散射体及光路，复位解除', () => {
  for (const extra of [{ explode: .01 }, { isolated: true, selectedId: 'stage' }]) {
    const state = { ...initialState(), showRays: true, ...extra }, d = deriveState(state);
    assert.ok(d.suspended); assert.equal(d.darkfieldActive, false); assert.equal(d.brightfieldActive, false);
    assert.equal(d.sampleVisible, false); assert.equal(d.raysVisible, false);
    assert.deepEqual(reduceState(state, { type: 'reset' }), initialState());
  }
});
test('机械行程有限且不改变样品状态或照明模式', () => {
  for (const [type, value, expected] of [['tilt', 100, 25], ['tilt', -3, 0], ['focus', 1, .018], ['focus', -1, -.012]]) {
    const state = reduceState(initialState(), { type, value });
    assert.equal(type === 'tilt' ? state.tiltDegrees : state.focusMeters, expected);
    assert.equal(state.mode, 'darkfield'); assert.equal(state.showSample, true);
  }
});
test('移去样品不改变底光，不能生成示例散射；样品近景显式恢复样品', () => {
  const state = reduceState(initialState(), { type: 'sample', value: false });
  assert.equal(deriveState(state).sampleVisible, false); assert.equal(deriveState(state).darkfieldActive, true);
  const closeup = reduceState(state, { type: 'view', value: 'sample' });
  assert.equal(closeup.showSample, true); assert.equal(closeup.showRays, false);
});
