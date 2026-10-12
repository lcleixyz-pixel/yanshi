import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateBytes } from 'gltf-validator';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const asset = path.join(root, 'public/assets/3d/polariscope');
const bytes = await fs.readFile(path.join(asset, 'polariscope.glb'));
const result = await validateBytes(new Uint8Array(bytes), { maxIssues: 100 });
const manifest = JSON.parse(await fs.readFile(path.join(asset, 'manifest.json'), 'utf8'));
const sha256 = createHash('sha256').update(bytes).digest('hex');
const jsonLength = bytes.readUInt32LE(12);
const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
const ids = ['base', 'frame', 'light', 'polarizer', 'stage', 'sample', 'analyzer', 'conoscope'];
const assertions = [];
assertions.push({ check: 'manifest hash and size match the delivered GLB', pass: manifest.sha256 === sha256 && manifest.byteLength === bytes.length });
for (const id of ids) {
  const part = manifest.parts.find(p => p.id === id);
  const nodes = document.nodes.filter(n => n.name === part?.node);
  assertions.push({ check: `unique part node: ${id}`, pass: nodes.length === 1 && nodes[0].extras?.partId === id });
  assertions.push({ check: `finite explode offset: ${id}`, pass: part?.explodeOffset?.length === 3 && part.explodeOffset.every(Number.isFinite) });
}
assertions.push({ check: 'meters and uncalibrated provenance retained', pass: (manifest.units === 'meter' || manifest.units === 'meters' || manifest.units === 'm') && manifest.dimensionsCalibrated === false });
const summary = {
  date: new Date().toISOString(), file: 'polariscope.glb', sha256, bytes: bytes.length,
  meshes: document.meshes.length, nodes: document.nodes.length,
  triangles: document.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((count, primitive) => count + ((document.accessors[primitive.indices]?.count || 0) / 3), 0), 0),
  errors: result.issues.numErrors, warnings: result.issues.numWarnings,
  messages: result.issues.messages, assertions,
  pass: result.issues.numErrors === 0 && assertions.every(a => a.pass),
};
const destination = path.join(root, 'assets-source/polariscope/validation');
await fs.mkdir(destination, { recursive: true });
await fs.writeFile(path.join(destination, 'gltf-validation.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.pass ? 0 : 1;
