import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { initialState, reduceState, deriveState } from '../../src/components/microscope3d/reviewState.js';
import { createTeachingLighting } from '../../src/components/microscope3d/bottomLighting.js';
import { createIncidentLighting } from '../../src/components/microscope3d/incidentLighting.js';

const assetDir = new URL('../../public/assets/3d/gem-microscope/lighting-v3/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', assetDir), 'utf8'));

test('网页显微镜模型哈希与清单一致，体积在 5 MB 内', () => {
  const bytes = fs.readFileSync(new URL('model.glb', assetDir));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), manifest.modelSha256);
  assert.ok(bytes.length < 5 * 1024 * 1024, `model.glb ${bytes.length} bytes`);
});

test('底光明暗域互斥；顶光、侧光独立于底光和光阑；拆解暂停三路', () => {
  let s = initialState();
  assert.equal(deriveState(s, manifest).ringActive, true);
  s = reduceState(s, { type: 'mode', value: 'brightfield' });
  let d = deriveState(s, manifest); assert.equal(d.axialActive, true); assert.equal(d.ringActive, false);
  s = reduceState(reduceState(s, { type: 'topPower', value: true }), { type: 'sidePower', value: true });
  s = reduceState(reduceState(s, { type: 'mode', value: 'off' }), { type: 'iris', value: 0 });
  d = deriveState(s, manifest); assert.equal(d.axialActive, false); assert.equal(d.topActive, true); assert.equal(d.sideActive, true);
  d = deriveState(reduceState(s, { type: 'explode', value: .3 }), manifest);
  assert.equal(d.topActive, false); assert.equal(d.sideActive, false); assert.equal(d.suspended, true);
});

test('真实 Three 光源按三路开关点亮，散射体位置不随模式改变', () => {
  const root = new THREE.Group();
  for (const name of ['tripo_part_0', 'tripo_part_10']) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(.01, .01, .01)); mesh.name = name; root.add(mesh); }
  const rig = createTeachingLighting(root, manifest), incident = createIncidentLighting(root, manifest, rig.litGroup);
  const run = (state: ReturnType<typeof initialState>) => { const d = deriveState(state, manifest); rig.update(state, d); incident.update(state, d); return { b: rig.diagnostics(), i: incident.diagnostics() }; };
  let s = { ...initialState(), showRays: true };
  let r = run(s); assert.ok(r.b.ringActiveCount > 0); assert.ok(r.i.lights.every((x: { intensity: number }) => x.intensity === 0));
  const point = r.b.sampleWorldPosition;
  s = reduceState(reduceState(s, { type: 'mode', value: 'off' }), { type: 'topPower', value: true });
  r = run(s); assert.equal(r.b.activeLightCount, 0); assert.equal(r.i.visibleTopPaths, 3);
  assert.ok(r.i.lights.filter((x: { kind: string }) => x.kind === 'top').every((x: { intensity: number }) => x.intensity > 0));
  assert.deepEqual(r.b.sampleWorldPosition, point);
  incident.dispose(); rig.dispose();
});
