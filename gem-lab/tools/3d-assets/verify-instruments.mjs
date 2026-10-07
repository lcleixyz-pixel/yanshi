import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import validator from 'gltf-validator';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ids = ['prism-spectroscope', 'grating-spectroscope', 'refractometer', 'gem-microscope'];
const report = { checkedAt: new Date().toISOString(), checks: [], ok: true };
const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
for (const id of ids) {
  const result = { id, errors: [] };
  try {
    const folder = path.join(app, 'public/assets/3d', id, 'structure-v1');
    const manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8'));
    const provenance = JSON.parse(await readFile(path.join(folder, 'provenance.json'), 'utf8'));
    const bytes = await readFile(path.join(folder, 'model.glb'));
    const poster = await readFile(path.join(folder, 'poster.png'));
    if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid GLB header/length');
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)).trim());
    const validation = await validator.validateBytes(new Uint8Array(bytes), { uri: 'model.glb', maxIssues: 100 });
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (manifest.sha256 !== hash) result.errors.push('Manifest SHA-256 mismatch');
    if (manifest.dimensionsCalibrated !== false) result.errors.push('Must explicitly remain uncalibrated');
    if (manifest.teachingOpticsSimulated !== false) result.errors.push('Static structure must not claim optical simulation');
    if ((json.nodes || []).some(n => n.extras?.teachingOpticsSimulated === true)) result.errors.push('GLB node extras incorrectly claim optical simulation');
    if (/\/Users\/|[A-Z]:\\\\Users\\\\/.test(JSON.stringify(provenance))) result.errors.push('Public provenance contains a personal host path');
    if (!manifest.units) result.errors.push('Missing units');
    if (bytes.length > 10_000_000) result.errors.push('Web asset exceeds 10 MB target');
    if (validation.issues.numErrors) result.errors.push('glTF validation errors');
    if (!poster.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) result.errors.push('Poster is not PNG');
    if (!provenance || !Object.keys(provenance).length) result.errors.push('Empty provenance');
    const names = (json.nodes || []).map(n => n.name);
    const seen = new Set();
    for (const part of manifest.parts || []) {
      if (seen.has(part.id)) result.errors.push(`Duplicate part ID ${part.id}`);
      seen.add(part.id);
      if (names.filter(n => n === part.node).length !== 1) result.errors.push(`Part node not unique/present: ${part.node}`);
      if (!vector(part.pivot) || !vector(part.rotationAxisLocal) || !vector(part.explodeOffset)) result.errors.push(`Invalid spatial vectors: ${part.id}`);
      if (typeof part.rotatable !== 'boolean') result.errors.push(`Missing motion declaration: ${part.id}`);
      if (part.rotatable && Math.hypot(...part.rotationAxisLocal) < 0.99) result.errors.push(`Invalid rotation axis: ${part.id}`);
    }
    if (seen.size < ({'prism-spectroscope':7,'grating-spectroscope':5,refractometer:8,'gem-microscope':10}[id])) result.errors.push('Insufficient independent teaching parts');
    let triangles = 0;
    for (const mesh of json.meshes || []) for (const primitive of mesh.primitives || []) {
      if ((primitive.mode ?? 4) === 4) triangles += json.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3;
    }
    Object.assign(result, { bytes: bytes.length, sha256: hash, parts: seen.size, meshes: json.meshes?.length, triangles, materials: json.materials?.length, gltfErrors: validation.issues.numErrors, gltfWarnings: validation.issues.numWarnings, gltfIssues: validation.issues.messages, posterBytes: poster.length });
  } catch (error) { result.errors.push(error.message); }
  result.ok = result.errors.length === 0;
  if (!result.ok) report.ok = false;
  report.checks.push(result);
}
const output = path.join(app, 'assets-source/instruments-2026-10-07/technical-verification.json');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({...report, checks: report.checks.map(({gltfIssues, ...check}) => check)}, null, 2));
if (!report.ok) process.exitCode = 1;
