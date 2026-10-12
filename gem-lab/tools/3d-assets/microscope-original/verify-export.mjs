// Inspect the exported geometry and rig, independently of the Blender builder.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../../assets-source/gem-microscope/original-design/2026-10-08/v1');
const contract = JSON.parse(await fs.readFile(path.join(here, 'contract.json')));
const manifest = JSON.parse(await fs.readFile(path.join(out, 'manifest.json')));
const bytes = await fs.readFile(path.join(out, 'model.glb'));
const hash = createHash('sha256').update(bytes).digest('hex');
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const root = gltf.scene;
root.updateMatrixWorld(true);
const checks = [], failures = [];
function check(label, pass, details = {}) { const row = { label, pass: Boolean(pass), ...details }; checks.push(row); if (!pass) failures.push(row); }
function find(name) { const object = root.getObjectByName(name); if (!object) throw new Error('Missing exported node ' + name); return object; }
function beneath(object, ancestor) { for (let p = object; p; p = p.parent) if (p === ancestor) return true; return false; }
const tilt = find(contract.rigs.tilt.node), focus = find(contract.rigs.focus.node);
check('Focus rig is a descendant of the tilt rig', beneath(focus, tilt));
check('Part ids and nodes are unique', new Set(manifest.parts.map(p => p.id)).size === manifest.parts.length && new Set(manifest.parts.map(p => p.node)).size === manifest.parts.length);
for (const part of manifest.parts) check('Part exists: ' + part.id, Boolean(root.getObjectByName(part.node)));
const meshes = [];
root.traverse(object => { if (object.isMesh) meshes.push(object); });
check('All exported meshes belong to a registered part', meshes.every(mesh => manifest.parts.some(part => beneath(mesh, find(part.node)))));
check('No external texture resources or imported image texture maps', meshes.every(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every(mat => !mat.map && !mat.normalMap)));
const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3());
check('Plausible desktop dimensions in metres', size.x > .12 && size.x < .7 && size.y > .2 && size.y < .8 && size.z > .12 && size.z < .7, { size: size.toArray() });
const tiltStart = tilt.quaternion.clone(), focusStart = focus.position.clone();
const positions = new Map(meshes.map(mesh => [mesh, mesh.getWorldPosition(new THREE.Vector3())]));
const bf = find(contract.optics.brightfield.emitterNode), df = find(contract.optics.darkfield.emitterNode);
for (const node of [bf, df, find(contract.optics.fixedAperture.node)]) check('Stage/illumination moves with tilt, not focus: ' + node.name, beneath(node, tilt) && !beneath(node, focus));
for (const travel of contract.rigs.focus.rangeMeters) {
  focus.position.copy(focusStart).addScaledVector(new THREE.Vector3(...contract.rigs.focus.axisLocal), travel);
  root.updateMatrixWorld(true);
  let fixedError = 0, movedError = 0;
  // Compare distances to baseline rather than duplicating the implementation's matrix expression.
  for (const mesh of meshes) {
    const displacement = mesh.getWorldPosition(new THREE.Vector3()).distanceTo(positions.get(mesh));
    if (beneath(mesh, focus)) movedError = Math.max(movedError, Math.abs(displacement - Math.abs(travel)));
    else fixedError = Math.max(fixedError, displacement);
  }
  check('Focus travel preserves the fixed stage and lights: ' + travel, fixedError < 1e-7 && movedError < 1e-7, { fixedError, movedError });
}
focus.position.copy(focusStart); root.updateMatrixWorld(true);
const pivot = tilt.getWorldPosition(new THREE.Vector3());
for (const angle of [0, 12.5, 25]) {
  tilt.quaternion.copy(tiltStart).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...contract.rigs.tilt.axisLocal), THREE.MathUtils.degToRad(angle)));
  root.updateMatrixWorld(true);
  let radiusError = 0, baseError = 0;
  for (const mesh of meshes) {
    const pos = mesh.getWorldPosition(new THREE.Vector3());
    if (beneath(mesh, tilt)) radiusError = Math.max(radiusError, Math.abs(pos.distanceTo(pivot) - positions.get(mesh).distanceTo(pivot)));
    else baseError = Math.max(baseError, pos.distanceTo(positions.get(mesh)));
  }
  check('Tilt rotates one rigid assembly while the base stays fixed: ' + angle, radiusError < 1e-7 && baseError < 1e-7, { radiusError, baseError });
}
tilt.quaternion.copy(tiltStart); root.updateMatrixWorld(true);
const o = contract.optics, sample = tilt.localToWorld(new THREE.Vector3(...o.samplePosition));
const raycaster = new THREE.Raycaster();
const opaque = meshes.filter(mesh => !(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(mat => mat.transmission > 0 || mat.transparent || mat.opacity < 1));
for (const mesh of opaque) for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mat.side = THREE.DoubleSide;
function obstructed(a, b, exclude) {
  const direction = b.clone().sub(a), length = direction.length(); direction.normalize();
  raycaster.set(a.clone().addScaledVector(direction, .00015), direction); raycaster.near = .00001; raycaster.far = length - .0003;
  return raycaster.intersectObjects(opaque.filter(mesh => !exclude.some(node => beneath(mesh, node))), false).map(hit => hit.object.name);
}
const shutter = find(o.darkfield.shutter.node), shutterStart = shutter.position.clone();
const darkPaths = [];
for (let k = 0; k < o.darkfield.rayCount; k++) {
  const phi = 2 * Math.PI * k / o.darkfield.rayCount;
  const point = new THREE.Vector3(...o.darkfield.center).add(new THREE.Vector3(o.darkfield.radius * Math.cos(phi), 0, o.darkfield.radius * Math.sin(phi)));
  const from = tilt.localToWorld(point), hits = obstructed(from, sample, [df]);
  darkPaths.push({ index: k, blockers: [...new Set(hits)] });
}
check('Exported darkfield centre rays reach the sample without opaque obstructions', darkPaths.every(p => !p.blockers.length), { rays: darkPaths });
const brightStart = tilt.localToWorld(new THREE.Vector3(...o.brightfield.center));
const closedHits = obstructed(brightStart, sample, [bf]);
check('Closed darkfield shutter blocks the central source path', closedHits.some(name => beneath(find(name), shutter)), { blockers: [...new Set(closedHits)] });
shutter.position.add(new THREE.Vector3(...o.darkfield.shutter.openTranslation)); root.updateMatrixWorld(true);
const openHits = obstructed(brightStart, sample, [bf]);
check('Opening the shutter clears the central brightfield path', openHits.length === 0, { blockers: [...new Set(openHits)] });
shutter.position.copy(shutterStart); root.updateMatrixWorld(true);
const report = { createdAt: new Date().toISOString(), modelSha256: hash, meshCount: meshes.length, partCount: manifest.parts.length, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray() }, checks, pass: !failures.length,
  limits: ['Ray checks cover discrete centre rays against exported meshes, not continuous light or multiple scattering.', 'Rig checks do not establish manufacturing tolerances or full collision-free mechanics.', 'No real gemstone, image formation, colour, illumination or dimensional calibration is implied.'] };
await fs.mkdir(path.join(out, 'validation'), { recursive: true });
await fs.writeFile(path.join(out, 'validation/export-check.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ pass: report.pass, checks: checks.length, meshCount: meshes.length, partCount: manifest.parts.length, modelSha256: hash, failures }, null, 2));
process.exitCode = report.pass ? 0 : 1;
