/** CPU checks against real Three.js objects; browser rendering is a separate acceptance layer. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createMicroscopeLighting } from './microscope-lighting.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await fs.readFile(path.resolve(here, '../../public/assets/3d/gem-microscope/structure-v1/manifest.json'), 'utf8'));
const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
scene.background = new THREE.Color(0x20252c);
const rig = createMicroscopeLighting({ THREE, scene, root, manifest });
const state = (sources, darkfieldStop = 'closed') => ({ sources: { bottom: false, top: false, fiber: false, ...sources }, darkfieldStop,
  diffuser: 'out', polarizer: 'out', analyzer: 'out' });
const actualLights = [];
rig.group.traverse(object => { if (object.isSpotLight) actualLights.push(object); });
assert.equal(actualLights.length, 11);
const background = scene.background.getHex();
const geometries = new Set(), materials = new Set();
rig.group.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
const geometrySnapshots = [...geometries].map(geometry => JSON.stringify(geometry.toJSON()));
const materialSnapshots = [...materials].map(material => JSON.stringify(material.toJSON()));
const counts = [];
const countObjects = () => { const ids = []; rig.group.traverse(object => ids.push(object.uuid)); return ids.sort(); };
const objectIds = countObjects();

// Illuminate a fixed Lambertian probe using the actual SpotLight values and cone directions.
// This tests directional/additive input to the renderer; it is not an image or optical transport simulator.
const samplePoint = new THREE.Vector3(...manifest.samplePositionMeters);
function probe(normal) {
  let result = 0;
  for (const light of actualLights) {
    const toPoint = samplePoint.clone().sub(light.position), distance = toPoint.length();
    const axis = light.target.position.clone().sub(light.position).normalize();
    const coneCos = Math.cos(light.angle), innerCos = Math.cos(light.angle * (1 - light.penumbra));
    const cosAngle = toPoint.clone().normalize().dot(axis);
    const t = THREE.MathUtils.clamp((cosAngle - coneCos) / Math.max(1e-10, innerCos - coneCos), 0, 1);
    const coneWeight = t * t * (3 - 2 * t);
    const lambert = Math.max(0, normal.dot(toPoint.negate().normalize()));
    // Match the installed Three.js shader's 0.01 denominator floor (not 0.01²).
    result += light.intensity * coneWeight * lambert / Math.max(distance ** light.decay, .01);
  }
  return result;
}

rig.update(state({ bottom: true }));
let dark = rig.diagnostics();
assert.equal(dark.activeLightCount, 8);
assert.equal(actualLights.find(light => light.name.endsWith('_axial')).intensity, 0, 'Darkfield must block the direct bottom light');
assert(dark.actualLights.filter(light => light.kind === 'ring').every(light => light.coneAvoidsObjective));
const axialDirection = new THREE.Vector3(...manifest.sourceNodes.bottom.direction).normalize();
const objective = new THREE.Vector3(...manifest.objectiveEntrance.centerMeters);
const radius = manifest.objectiveEntrance.radiusMeters;
const focusOffsets = manifest.focusMechanics?.translationRangeMeters || [0, 0];
let closestPupilClearance = Infinity;
// Independently intersect each spot-cone perimeter and centre with the entrance plane,
// also checking both focus-travel limits. No helper or precomputed result from the rig is used.
for (const light of actualLights.filter(light => light.name.includes('_ring-'))) {
  const axis = light.target.position.clone().sub(light.position).normalize();
  const tangent = new THREE.Vector3(0, 1, 0).cross(axis).normalize();
  const bitangent = axis.clone().cross(tangent).normalize();
  for (const focusOffset of [0, ...focusOffsets]) {
    const pupil = objective.clone().addScaledVector(axialDirection, focusOffset);
    for (let index = -1; index < 96; index++) {
      const theta = 2 * Math.PI * index / 96;
      const direction = index === -1 ? axis.clone() : axis.clone().multiplyScalar(Math.cos(light.angle))
        .addScaledVector(tangent, Math.cos(theta) * Math.sin(light.angle))
        .addScaledVector(bitangent, Math.sin(theta) * Math.sin(light.angle));
      const t = pupil.clone().sub(light.position).dot(axialDirection) / direction.dot(axialDirection);
      assert(t > 0);
      const intersection = light.position.clone().addScaledVector(direction, t);
      const clearance = intersection.distanceTo(pupil) - radius;
      closestPupilClearance = Math.min(closestPupilClearance, clearance);
      assert(clearance > 0, 'An unscattered darkfield ray can reach the objective pupil');
    }
  }
}
const bottomResponse = probe(new THREE.Vector3(0, -1, 0));
assert(bottomResponse > 0, 'Oblique lamps must deliver nonzero light to the sample');

rig.update(state({ bottom: true }, 'open'));
const bright = rig.diagnostics();
assert.equal(bright.activeLightCount, 9);
assert(probe(new THREE.Vector3(0, -1, 0)) > bottomResponse, 'Brightfield must add direct illumination');
const wideAngle = actualLights.find(light => light.name.endsWith('_axial')).angle;
rig.update(state({ bottom: true }, 'open'), { irisDiameterMeters: .0075 });
const narrow = rig.diagnostics();
assert(actualLights.find(light => light.name.endsWith('_axial')).angle < wideAngle / 2, 'The pupil must geometrically narrow the axial cone');
assert(narrow.actualLights.filter(light => light.kind === 'ring').every(light => light.intensity === 0), 'A small iris must intercept the peripheral oblique beams');
assert(narrow.actualLights.find(light => light.kind === 'axial').intensity > 0, 'Narrowing the iris does not itself close the central beam');
rig.update(state({ bottom: true }), { irisDiameterMeters: .019 });
const partlyClipped = rig.diagnostics().actualLights.filter(light => light.kind === 'ring');
assert(new Set(partlyClipped.map(light => light.apertureTransmission)).size > 1, 'Pupil clipping must follow each beam intersection rather than one global dimmer');
assert(partlyClipped.some(light => light.apertureTransmission > 0 && light.apertureTransmission < 1));
rig.update(state({ bottom: true }), { irisDiameterMeters: .016, showRays: true });
const edgeOnly = rig.diagnostics();
assert(edgeOnly.activeLightCount > 0, 'Some finite beam edges still pass the partly closed aperture');
assert.equal(edgeOnly.visibleRayCount, 0, 'Never draw a blocked beam centre through an iris leaf');

rig.update(state({ top: true }));
const topResponse = probe(new THREE.Vector3(0, 1, 0));
assert(topResponse > 0);
assert.equal(rig.diagnostics().activeLightCount, 1);
rig.update(state({ fiber: true }));
const sideResponse = probe(new THREE.Vector3(1, 0, 0));
assert(sideResponse > 0);
assert.equal(rig.diagnostics().activeLightCount, 1);
rig.update(state({ bottom: true, top: true, fiber: true }, 'open'));
assert.equal(rig.diagnostics().activeLightCount, 11, 'Source switches must support combination');
assert(probe(new THREE.Vector3(0, 1, 0)) >= topResponse);
assert(probe(new THREE.Vector3(1, 0, 0)) >= sideResponse);

rig.update(state({}));
assert(actualLights.every(light => light.intensity === 0), 'All-off must switch actual lights off');
assert.equal(probe(new THREE.Vector3(0, 1, 0)), 0);
for (const options of [{ exploded: true }, { isolated: true }, { enabled: false }]) {
  rig.update(state({ bottom: true, top: true, fiber: true }, 'open'), options);
  assert(actualLights.every(light => light.intensity === 0));
  assert.equal(rig.sample.visible, false);
}

rig.update(state({ bottom: true }, 'open'));
const noPolarization = rig.diagnostics().actualLights.map(light => light.intensity);
rig.update({ ...state({ bottom: true }, 'open'), polarizer: 'in', analyzer: 'in' });
assert.deepEqual(rig.diagnostics().actualLights.map(light => light.intensity), noPolarization, 'Do not invent polarization extinction');
assert(rig.diagnostics().polarization.includes('不计算'));

const knownWorldPoint = new THREE.Vector3(...manifest.samplePositionMeters);
root.position.set(.17, .08, -.23); root.rotation.set(.12, .4, -.18); root.scale.setScalar(1.7);
root.updateWorldMatrix(true, true); knownWorldPoint.applyMatrix4(root.matrixWorld);
assert(new THREE.Vector3(...rig.diagnostics().sampleWorldCenter).distanceTo(knownWorldPoint) < 1e-8,
  'Lights/sample must follow the same asset transform');
for (const record of rig.diagnostics().actualLights) {
  const expected = new THREE.Vector3(...record.positionMeters).applyMatrix4(root.matrixWorld);
  assert(expected.distanceTo(new THREE.Vector3(...record.worldPosition)) < 1e-8);
}
const camera = new THREE.PerspectiveCamera(); scene.add(camera);
const beforeCamera = rig.diagnostics();
camera.position.set(10, -12, .2); camera.rotation.set(1, 2, 3); scene.updateMatrixWorld(true);
assert.deepEqual(rig.diagnostics(), beforeCamera, 'A camera change must not alter teaching light angles or intensity');
for (let index = 0; index < 100; index++) {
  rig.update(state({ bottom: index % 2 === 0, top: index % 3 === 0, fiber: index % 5 === 0 }, index % 2 ? 'open' : 'closed'),
    { showRays: index % 2 === 0, showSample: index % 3 !== 0, irisDiameterMeters: .0075 + index / 100 * .0325 });
  counts.push(rig.diagnostics().activeLightCount);
}
assert.deepEqual(countObjects(), objectIds, 'Repeated mode changes must not allocate additional scene objects');
assert.deepEqual([...geometries].map(geometry => JSON.stringify(geometry.toJSON())), geometrySnapshots, 'Sample and ray geometry are fixed across illumination states');
assert.deepEqual([...materials].map(material => JSON.stringify(material.toJSON())), materialSnapshots, 'No mode-dependent emissive or colour trick on the sample');
assert.equal(scene.background.getHex(), background, 'The environment background must stay fixed');

const disposedGeometry = new Map(), disposedMaterial = new Map(), disposedLights = new Map(), disposedMaps = [];
for (const item of geometries) item.addEventListener('dispose', () => disposedGeometry.set(item.uuid, (disposedGeometry.get(item.uuid) || 0) + 1));
for (const item of materials) item.addEventListener('dispose', () => disposedMaterial.set(item.uuid, (disposedMaterial.get(item.uuid) || 0) + 1));
for (const item of actualLights) {
  item.addEventListener('dispose', () => disposedLights.set(item.uuid, (disposedLights.get(item.uuid) || 0) + 1));
  if (item.castShadow) {
    const map = new THREE.WebGLRenderTarget(2, 2); let count = 0;
    map.addEventListener('dispose', () => count++); item.shadow.map = map; disposedMaps.push(() => count);
  }
}
rig.dispose(); rig.dispose();
assert.equal(rig.group.parent, null);
assert.equal(disposedGeometry.size, geometries.size);
assert.equal(disposedMaterial.size, materials.size);
assert.equal(disposedLights.size, actualLights.length);
for (const count of [...disposedGeometry.values(), ...disposedMaterial.values(), ...disposedLights.values()]) assert.equal(count, 1);
assert(disposedMaps.every(count => count() === 1));
assert(actualLights.every(light => light.intensity === 0));

const report = { timestamp: new Date().toISOString(), ok: true, layer: 'Three.js object/geometry and illumination contract, CPU only',
  manifestRevision: manifest.revision, modelSha256: manifest.sha256,
  lightingModuleSha256: createHash('sha256').update(await fs.readFile(path.join(here, 'microscope-lighting.mjs'))).digest('hex'),
  checks: ['darkfield excludes central source and objective pupil across focus travel', 'brightfield adds the central source',
    'iris clips each annular beam footprint and the axial spot cone', 'blocked beam-centre diagrams are omitted even if beam edges transmit',
    'independent bottom/top/fiber and additive combinations',
    'all-off/exploded/isolated turn off real lights', 'same sample geometry/material in every mode', 'no invented polarization extinction',
    'root transforms preserve source/sample alignment', 'camera does not alter illumination state', '100 changes do not accumulate objects',
    'geometry/material/light/shadow disposal is complete and idempotent'],
  actualLightCount: actualLights.length, shadowLightCount: actualLights.filter(light => light.castShadow).length,
  sampleMeshCount: rig.sample.children.length, minimumUnscatteredRayClearanceMeters: closestPupilClearance,
  illustrativeProbeResponses: { bottomResponse, topResponse, sideResponse },
  geometryCount: geometries.size, materialCount: materials.size,
  limitations: ['CPU probes do not verify rendered appearance or GPU resources', 'No calibrated photometry, gemstone refraction, polarization or measured sample image'],
};
const outputIndex = process.argv.indexOf('--out');
if (outputIndex >= 0) {
  const output = path.resolve(process.argv[outputIndex + 1]); await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
