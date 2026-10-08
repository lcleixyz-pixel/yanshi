// Verifies the web build against repair-v2: same named nodes, world-space bounds within
// tolerance (teaching parts strict, simplified exterior looser), morph targets kept, validator clean.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import validator from 'gltf-validator';

const here = path.dirname(fileURLToPath(import.meta.url)), gemLab = path.resolve(here, '../../..');
const sourcePath = path.join(gemLab, 'assets-source/gem-microscope/tripo-trials/2026-10-08/repair-v2/model.glb');
const webDir = path.join(gemLab, 'public/assets/3d/gem-microscope/lighting-v3');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [source, web] = await Promise.all([io.read(sourcePath), io.read(path.join(webDir, 'model.glb'))]);
const manifest = JSON.parse(await fs.readFile(path.join(webDir, 'manifest.json'), 'utf8'));
const webBytes = await fs.readFile(path.join(webDir, 'model.glb'));
const failures = [], rows = [], movedToChild = [];
const sha = crypto.createHash('sha256').update(webBytes).digest('hex');
if (sha !== manifest.modelSha256) failures.push('manifest modelSha256 mismatch');

const byName = doc => new Map(doc.getRoot().listNodes().map(node => [node.getName(), node]));
const a = byName(source), b = byName(web);
for (const [name, node] of a) {
  const other = b.get(name);
  if (!other) { failures.push('missing node ' + name); continue; }
  if (!node.getMesh()) continue;
  // Quantization moves a mesh off a node that has children into an unnamed child, so the
  // dequantization scale does not reach the children. Lookups by name + traverse still work.
  const meshNode = other.getMesh() ? other : other.listChildren().find(child => !child.getName() && child.getMesh());
  if (!meshNode) { failures.push('mesh lost on node ' + name); continue; }
  if (meshNode !== other) movedToChild.push(name);
  const exterior = name.startsWith('tripo_part_'), tolerance = exterior ? .002 : .0002;
  const x = getBounds(node), y = getBounds(other); // subtree bounds in world space
  const delta = Math.max(...[0, 1, 2].flatMap(i => [Math.abs(x.min[i] - y.min[i]), Math.abs(x.max[i] - y.max[i])]));
  const targets = [node, meshNode].map(n => n.getMesh().listPrimitives().reduce((s, p) => s + p.listTargets().length, 0));
  rows.push({ name, delta: +delta.toFixed(6), tolerance, targets });
  if (delta > tolerance) failures.push(`${name} bounds moved ${delta.toFixed(5)} > ${tolerance}`);
  if (targets[0] !== targets[1]) failures.push(`${name} morph targets ${targets[0]} -> ${targets[1]}`);
}
for (const name of manifest.iris.bladeNodes) {
  const target = b.get(name)?.getMesh()?.listPrimitives()[0]?.listTargets()[0];
  if (!target) failures.push('iris blade lost morph target: ' + name);
}
const report = await validator.validateBytes(new Uint8Array(webBytes), { maxIssues: 200 });
if (report.issues.numErrors) failures.push(`glTF validator errors: ${report.issues.numErrors}`);
const result = { passed: !failures.length, sha256: sha, bytes: webBytes.length, nodesCompared: rows.length,
  maxTeachingDelta: Math.max(...rows.filter(r => r.tolerance < .001).map(r => r.delta)),
  maxExteriorDelta: Math.max(...rows.filter(r => r.tolerance >= .001).map(r => r.delta)),
  validator: { errors: report.issues.numErrors, warnings: report.issues.numWarnings, infos: report.issues.numInfos },
  meshMovedToUnnamedChild: movedToChild,
  extensionsUsed: web.getRoot().listExtensionsUsed().map(e => e.extensionName), failures };
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
