import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(directory, '../../../../..');
const output = process.argv[2] ?? path.join(repo, 'gem-lab/assets-source/optics-paper-review/2026-10-08/polariscope');
const source = '/Users/lc.leixyz/Documents/AI工作台/01-项目代码/yanshi';
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const [data, manifest, originalManifest, audit, cases] = await Promise.all([
  fs.readFile(path.join(output, 'model.glb')),
  readJson(path.join(output, 'manifest.json')),
  readJson(path.join(source, 'gem-lab/public/assets/3d/polariscope/structure-v1/manifest.json')),
  readJson(path.join(output, 'audit.json')),
  readJson(path.join(output, 'optical-cases.json')),
]);
const checks = [];
function check(name, fn) {
  try { checks.push({name, pass: true, evidence: fn() ?? null}); }
  catch (error) { checks.push({name, pass: false, error: error.message}); }
}
const gltf = await new GLTFLoader().register(() => ({
  name: 'CPU_GEOMETRY_CHECK_SKIP_IMAGE_DECODE',
  loadTexture: () => Promise.resolve(new THREE.Texture()),
})).parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
gltf.scene.updateMatrixWorld(true);
check('GLB byte identity and unchanged part protocol', () => {
  assert.equal(hash(data), audit.sourceAsset.sha256);
  assert.equal(hash(data), originalManifest.sha256);
  assert.deepEqual(manifest.parts, originalManifest.parts);
  assert.equal(manifest.parts.length, 8);
  assert.equal(new Set(manifest.parts.map(p => p.id)).size, 8);
  manifest.parts.forEach(p => assert.ok(gltf.scene.getObjectByName(p.node), p.node));
  return { sha256: hash(data), bytes: data.length, parts: 8 };
});

const modelTransforms = new Map(manifest.parts.map(part => {
  const object = gltf.scene.getObjectByName(part.node);
  return [part.id, { object, position: object.position.clone(), quaternion: object.quaternion.clone(),
    worldPosition: object.getWorldPosition(new THREE.Vector3()), worldQuaternion: object.getWorldQuaternion(new THREE.Quaternion()) }];
}));
function resetAndApply(c) {
  for (const {object, position, quaternion} of modelTransforms.values()) { object.position.copy(position); object.quaternion.copy(quaternion); }
  gltf.scene.updateMatrixWorld(true);
  for (const [id, saved] of modelTransforms) {
    const {object, worldPosition, worldQuaternion} = saved;
    const delta = new THREE.Quaternion().fromArray(c.partRotations?.[id] ?? [0, 0, 0, 1]);
    const newWorld = delta.multiply(worldQuaternion);
    const parentQ = object.parent.getWorldQuaternion(new THREE.Quaternion());
    object.quaternion.copy(parentQ.invert().multiply(newWorld));
    const offset = new THREE.Vector3().fromArray(c.partOffsets?.[id] ?? [0, 0, 0]);
    object.position.copy(object.parent.worldToLocal(worldPosition.clone().add(offset)));
  }
  gltf.scene.updateMatrixWorld(true);
}
function sampleMesh(def) {
  const geometry = def.shape === 'gem' ? new THREE.OctahedronGeometry(1)
    : new THREE.SphereGeometry(1,48,24,0,Math.PI*2,0,Math.PI/2);
  const mesh = new THREE.Mesh(geometry);
  mesh.position.fromArray(def.position); mesh.scale.fromArray(def.scale); mesh.updateMatrixWorld(true);
  return mesh;
}
check('Five independent finite cases, explicit schematic scope', () => {
  assert.equal(cases.cases.length, 5);
  assert.equal(new Set(cases.cases.map(c => c.id)).size, 5);
  for (const c of cases.cases) for (const p of c.paths) {
    assert.ok(p.points.length >= 2);
    p.points.forEach(point => assert.ok(point.length === 3 && point.every(Number.isFinite)));
    assert.match(p.color, /^#[a-f0-9]{6}$/i);
  }
  return {caseIds: cases.cases.map(c => c.id)};
});
check('Empty-field crossed state blocks only analyzer output', () => {
  const parallel = cases.cases.find(c => c.id === 'empty-parallel'), crossed = cases.cases.find(c => c.id === 'empty-crossed');
  assert.equal(parallel.readout.relativeTransmission, 1); assert.equal(crossed.readout.relativeTransmission, 0);
  assert.ok(parallel.paths.some(p => p.id === 'analyzer-output'));
  assert.ok(!crossed.paths.some(p => p.id === 'analyzer-output'));
  assert.deepEqual(crossed.paths, parallel.paths.slice(0,2));
});

const results = [];
for (const c of cases.cases.filter(c => c.parameters.conoscopeInserted)) {
  check(`${c.id}: actual Three mesh bounds, sphere gap and ring axis`, () => {
    resetAndApply(c);
    const specimen = sampleMesh(c.teachingMeshes[0]);
    const specimenBox = new THREE.Box3().setFromObject(specimen, true);
    const lens = gltf.scene.getObjectByName('Conoscope_clear_lens');
    const lensBox = new THREE.Box3().setFromObject(lens, true);
    const sphereCenter = lensBox.getCenter(new THREE.Vector3());
    const sphereDiameter = Math.max(...lensBox.getSize(new THREE.Vector3()).toArray());
    const gap = lensBox.min.y-specimenBox.max.y;
    assert.ok(gap > 0, 'sphere intersects the specimen');
    assert.ok(Math.abs(gap/sphereDiameter-.04) < 1e-6, 'gap is not 4% of the actual sphere diameter');
    const ring = gltf.scene.getObjectByName('Conoscope_regular_open_ring');
    ring.geometry.computeBoundingBox();
    const ringSize = ring.geometry.boundingBox.getSize(new THREE.Vector3()).toArray();
    const normal = new THREE.Vector3().setComponent(ringSize.indexOf(Math.min(...ringSize)), 1).transformDirection(ring.matrixWorld);
    assert.ok(Math.abs(normal.y) > .999999, 'ring is not aligned with the optical direction');
    const support = new THREE.Box3().setFromObject(gltf.scene.getObjectByName('Stage_clear_sample_support'), true);
    assert.ok(Math.abs(specimenBox.min.y-support.max.y)<1e-7, 'specimen does not rest on the support');
    const row = {caseId:c.id,gap,sphereDiameter,ratio:gap/sphereDiameter,sphereCenter:sphereCenter.toArray(),specimenTopY:specimenBox.max.y,ringNormal:normal.toArray()};
    results.push(row); specimen.geometry.dispose();
    return row;
  });
  check(`${c.id}: five representative directions stay in the named openings`, () => {
    resetAndApply(c);
    assert.equal(c.paths.length,5); assert.equal(c.parameters.rayTracing,false);
    const lensBox = new THREE.Box3().setFromObject(gltf.scene.getObjectByName('Conoscope_clear_lens'),true);
    const lensCenter = lensBox.getCenter(new THREE.Vector3()), lensRadius = lensBox.getSize(new THREE.Vector3()).x/2;
    const emitter = new THREE.Box3().setFromObject(gltf.scene.getObjectByName('Internal_light_emitting_surface'),true);
    const analyzer = new THREE.Box3().setFromObject(gltf.scene.getObjectByName('Analyzer_independent_glass'),true);
    for (const p of c.paths) {
      const spherePoint = new THREE.Vector3().fromArray(p.points[4]);
      assert.ok(spherePoint.distanceTo(lensCenter)<lensRadius);
      assert.ok(emitter.containsPoint(new THREE.Vector3().fromArray(p.points[0])));
      assert.ok(analyzer.containsPoint(new THREE.Vector3().fromArray(p.points[5])));
      assert.ok(p.points.every((point,i)=>i===0||point[1]>p.points[i-1][1]));
    }
    return {count:5,onlyGeometricContainmentChecked:true,physicalRayTrace:false};
  });
}
check('Shape switching moves sphere by the actual specimen height difference', () => {
  assert.equal(results.length,2);
  assert.ok(Math.abs((results[0].sphereCenter[1]-results[1].sphereCenter[1])-(results[0].specimenTopY-results[1].specimenTopY))<1e-7);
});
check('Repeated case switching restores original assembly before transforms', () => {
  const target=cases.cases.find(c=>c.id==='conoscopic-gem');
  resetAndApply(target);
  const first=modelTransforms.get('conoscope').object.matrixWorld.clone();
  for(let i=0;i<10;i++) for(const c of cases.cases) resetAndApply(c);
  resetAndApply(target);
  assert.deepEqual(modelTransforms.get('conoscope').object.matrixWorld.elements,first.elements);
  resetAndApply(cases.cases[0]);
  assert.deepEqual(modelTransforms.get('conoscope').object.position.toArray(),modelTransforms.get('conoscope').position.toArray());
});
for (const evidence of audit.codeEvidence) {
  const bytes = await fs.readFile(path.join(source,evidence.path));
  check(`Protected source unchanged: ${evidence.path}`,()=>assert.equal(hash(bytes),evidence.sha256));
}
const report={schemaVersion:1,instrumentId:'polariscope',checkedAt:new Date().toISOString(),modelSha256:hash(data),
  scope:'Actual GLB geometry and candidate data parsed in Node/Three; texture image decoding skipped, not browser or physical optical acceptance.',
  checks,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length};
await fs.mkdir(path.join(output,'validation'),{recursive:true});
await fs.writeFile(path.join(output,'validation/geometry-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.failed)process.exitCode=1;
