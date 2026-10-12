import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { initialState, reduceState, deriveState } from './review-state.mjs';
import { createTeachingLighting } from './lighting.mjs';
const contract = JSON.parse(fs.readFileSync(new URL('../../../../assets-source/gem-microscope/tripo-trials/2026-10-08/repair-v2/contract.json', import.meta.url)));

test('默认进入灯室，明暗互斥，关灯保留机械位置', () => {
  let s = initialState(); assert.equal(s.viewMode, 'chamber'); assert.equal(s.cutaway, true);
  for (const field of ['darkfield', 'brightfield']) {
    s = reduceState(s, { type: 'mode', value: field }); const d = deriveState(s, contract);
    assert.equal(d.ringActive, field === 'darkfield'); assert.equal(d.axialActive, field === 'brightfield');
    const off = reduceState(s, { type: 'mode', value: 'off' }), o = deriveState(off, contract);
    assert.equal(off.field, field); assert.equal(o.coneOpen, d.coneOpen); assert.equal(o.ringActive, false); assert.equal(o.axialActive, false);
  }
});
test('实体切换钮不代替电源，亮度零不移动锥体', () => {
  let s = reduceState(initialState(), { type: 'mode', value: 'off' });
  s = reduceState(s, { type: 'toggleField' }); assert.equal(s.power, false); assert.equal(s.field, 'brightfield');
  s = reduceState(s, { type: 'brightness', value: 0 }); assert.equal(deriveState(s, contract).coneOpen, true);
});
test('光阑控制双反射通光率，最小孔径截断外围束而仍有轴向明域', () => {
  const small = { ...initialState(), irisOpen: 0 };
  const d = deriveState(small, contract); assert.equal(d.ringActive, false); assert.ok(d.reflectedBeams.every(x => x.transmission === 0));
  const b = deriveState({ ...small, field: 'brightfield' }, contract); assert.equal(b.axialActive, true); assert.ok(b.axialTransmission > 0 && b.axialTransmission < 1);
});
test('拆解、隔离暂停光学，恢复装配不留下混合路径', () => {
  for (const extra of [{ explode: .4 }, { isolated: true, selectedId: 'centralCone' }]) {
    const d = deriveState({ ...initialState(), showRays: true, ...extra }, contract);
    assert.equal(d.suspended, true); assert.equal(d.ringActive, false); assert.equal(d.axialActive, false); assert.equal(d.sampleVisible, false); assert.equal(d.rayVisible, false);
  }
});
test('真实Three光源互斥、四条代表双反射路径，散射体位置不随模式或相机改变', () => {
  const root = new THREE.Group(), rig = createTeachingLighting(root, contract);
  let s = { ...initialState(), showRays: true }; rig.update(s, deriveState(s, contract));
  const d = rig.diagnostics(); assert.equal(d.sourceCount, 1); assert.equal(d.visibleRepresentativePaths, 4); assert.equal(d.axialActiveCount, 0); assert.ok(d.ringActiveCount > 0); assert.ok(d.minimumObjectiveClearanceDegrees > 0);
  const point = d.sampleWorldPosition;
  s = reduceState(s, { type: 'mode', value: 'brightfield' }); rig.update(s, deriveState(s, contract));
  const b = rig.diagnostics(); assert.equal(b.ringActiveCount, 0); assert.equal(b.axialActiveCount, 1); assert.equal(b.visibleRepresentativePaths, 0); assert.equal(b.visibleAxialPaths, 4); assert.ok(b.cavityLights.filter(x => x.kind === 'ring').every(x => x.intensity === 0)); assert.deepEqual(b.sampleWorldPosition, point);
  s = reduceState(s, { type: 'mode', value: 'off' }); rig.update(s, deriveState(s, contract));
  assert.equal(rig.diagnostics().activeLightCount, 0); assert.ok(rig.diagnostics().cavityLights.every(x => x.intensity === 0)); assert.equal(rig.renderScene.environment, null);
  rig.dispose();
});
test('反射面独立绘制仍保留原节点、同几何材质、世界变换及隔离可见性', () => {
  const root = new THREE.Group(), cone = new THREE.Group(); root.add(cone);
  const geo = new THREE.SphereGeometry(.01, 8, 4), mat = new THREE.MeshStandardMaterial({ metalness: .98, roughness: .08, emissiveIntensity: 0 });
  const coneMirror = new THREE.Mesh(geo, mat); coneMirror.name = contract.optics.coneReflector.node; cone.add(coneMirror);
  const outer = new THREE.Mesh(geo, mat); outer.name = contract.optics.outerReflector.node; root.add(outer);
  const rig = createTeachingLighting(root, contract); let state = initialState(); rig.update(state, deriveState(state, contract));
  cone.position.set(.03, .04, .05); rig.prepareReflectorPass();
  const proxy = rig.reflectorScene.getObjectByName(coneMirror.name + '_bottomLightDraw');
  assert.equal(root.getObjectByName(coneMirror.name), coneMirror); assert.equal(proxy.geometry, geo); assert.equal(proxy.material, mat);
  assert.deepEqual(proxy.matrixWorld.elements, coneMirror.matrixWorld.elements); assert.equal(coneMirror.visible, false);
  rig.restoreReflectorObjects(); assert.equal(coneMirror.visible, true);
  state = { ...state, isolated: true, selectedId: 'centralCone' }; rig.update(state, deriveState(state, contract)); rig.prepareReflectorPass();
  assert.equal(coneMirror.visible, true); assert.equal(proxy.visible, false); rig.restoreReflectorObjects();
  assert.equal(mat.emissiveIntensity, 0); assert.equal(mat.emissive.getHex(), 0); // No emission or color mutation by the draw-scene separation.
  rig.dispose(); geo.dispose(); mat.dispose();
});
