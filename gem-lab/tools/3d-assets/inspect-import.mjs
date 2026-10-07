import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validateBytes } from 'gltf-validator';

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(toolDir, '../..');
const run = promisify(execFile);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help')) {
  console.log('Usage: npm run inspect:import -- /absolute/model.glb [--out /absolute/report-root]\nReads a self-contained GLB only. Creates a unique report folder; never optimizes or replaces the input.');
  process.exit(args.includes('--help') ? 0 : 2);
}
if ((args.length !== 1 && args.length !== 3) || (args.length === 3 && args[1] !== '--out')) {
  throw new Error('Only one GLB path and optional --out directory are accepted.');
}

const input = await fs.realpath(path.resolve(args[0]));
if (path.extname(input).toLowerCase() !== '.glb') throw new Error('Expected a .glb file.');
const bytes = await fs.readFile(input);
const inputHash = sha256(bytes);
const outputRoot = path.resolve(args[2] ?? path.join(projectDir, 'assets-source/polariscope/tooling-validation', new Date().toISOString().slice(0, 10)));
if (outputRoot === input || outputRoot.startsWith(`${input}${path.sep}`)) throw new Error('Report output cannot replace or be nested below the input file.');

let document;
let parseError;
try {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) throw new Error('Not a glTF 2 GLB container.');
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB declared length does not match the file.');
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || jsonLength > bytes.length - 20) throw new Error('Invalid first JSON chunk.');
  document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('GLB JSON must be an object.');
  for (const key of ['buffers', 'bufferViews', 'images', 'textures', 'nodes', 'meshes', 'materials', 'accessors']) {
    if (document[key] !== undefined && (!Array.isArray(document[key]) || document[key].some(value => !value || typeof value !== 'object' || Array.isArray(value)))) throw new Error(`Invalid GLB JSON: ${key} must be an array of objects.`);
  }
  for (const resource of [...(document.buffers ?? []), ...(document.images ?? [])]) {
    if (resource.uri !== undefined && typeof resource.uri !== 'string') throw new Error('Invalid GLB JSON: resource.uri must be a string.');
  }
} catch (error) { parseError = error.message; document = undefined; }

async function rejectExternalResource() {
  throw new Error('External resources are disabled; provide a self-contained GLB with embedded buffers and textures.');
}

const resourceIssues = [];
if (document) {
  for (const resource of [...(document.buffers ?? []), ...(document.images ?? [])]) {
    if (resource.uri && !resource.uri.startsWith('data:')) {
      try { await rejectExternalResource(); }
      catch (error) { resourceIssues.push({ uri: resource.uri, error: error.message }); }
    }
  }
}
let validation;
let validationError;
try {
  validation = await validateBytes(new Uint8Array(bytes), { uri: path.basename(input), maxIssues: 1000, externalResourceFunction: rejectExternalResource });
} catch (error) { validationError = error.message; }

const cli = await fs.realpath(path.join(toolDir, 'node_modules/.bin/gltf-transform'));
const version = (await run(process.execPath, [cli, '--version'])).stdout.trim();
let inspection;
const inspectable = document && !validationError && validation?.issues.numErrors === 0 && resourceIssues.length === 0;
if (inspectable) {
  try {
    const result = await run(process.execPath, [cli, 'inspect', input, '--format', 'md'], { timeout: 120000, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1' } });
    inspection = { success: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    inspection = { success: false, stdout: error.stdout ?? '', stderr: error.stderr ?? '', error: error.message };
  }
} else inspection = { success: false, stdout: '', stderr: '', error: 'Inspection skipped: invalid GLB or external resources; see gltf-validation.json and summary.json.' };

// Invalid documents retain the validator diagnostics instead of being traversed for optional statistics.
if (!inspectable) document = undefined;

const primitiveCount = primitive => {
  const count = document.accessors?.[primitive.indices ?? primitive.attributes?.POSITION]?.count ?? 0;
  const mode = primitive.mode ?? 4;
  return mode === 4 ? count / 3 : (mode === 5 || mode === 6 ? Math.max(0, count - 2) : 0);
};
const unchanged = inputHash === sha256(await fs.readFile(input));
const summary = {
  createdAt: new Date().toISOString(), input, sha256: inputHash, byteLength: bytes.length,
  inputUnchanged: unchanged, networkReadsEnabled: false, externalResourcesEnabled: false, optimized: false,
  toolVersions: { node: process.version, gltfTransform: version, gltfValidator: JSON.parse(await fs.readFile(path.join(toolDir, 'node_modules/gltf-validator/package.json'), 'utf8')).version },
  parseError, validationError, resourceIssues,
  validation: validation ? { errors: validation.issues.numErrors, warnings: validation.issues.numWarnings, infos: validation.issues.numInfos, hints: validation.issues.numHints, truncated: validation.issues.truncated } : null,
  inspection: { success: inspection.success, error: inspection.error },
  extensionsUsed: document?.extensionsUsed ?? [], extensionsRequired: document?.extensionsRequired ?? [],
  counts: document ? { nodes: document.nodes?.length ?? 0, meshes: document.meshes?.length ?? 0, materials: document.materials?.length ?? 0, textures: document.textures?.length ?? 0, images: document.images?.length ?? 0, triangles: (document.meshes ?? []).reduce((sum, mesh) => sum + mesh.primitives.reduce((n, primitive) => n + primitiveCount(primitive), 0), 0) } : null,
  nodes: (document?.nodes ?? []).map((node, index) => ({ index, name: node.name, mesh: node.mesh, children: node.children, translation: node.translation, rotation: node.rotation, scale: node.scale, matrix: node.matrix, extras: node.extras })),
  materials: (document?.materials ?? []).map((material, index) => ({ index, ...material })),
  textures: (document?.textures ?? []).map((texture, index) => ({ index, ...texture })),
  images: (document?.images ?? []).map((item, index) => ({ index, name: item.name, mimeType: item.mimeType, uri: item.uri?.startsWith('data:') ? '[embedded data URI]' : item.uri, bufferView: item.bufferView, embeddedBytes: document.bufferViews?.[item.bufferView]?.byteLength })),
  limits: ['Format validation does not establish physical accuracy, part separation, optical behavior, or browser appearance.', 'Triangle counts use declared accessors; compressed geometry and image details are also reported by glTF Transform.', 'No optimization, remeshing, texture recompression, input replacement, external resource reads, or network reads are enabled.'],
};
summary.pass = unchanged && !parseError && !validationError && resourceIssues.length === 0 && validation?.issues.numErrors === 0 && inspection.success;
await fs.mkdir(outputRoot, { recursive: true });
const stem = path.basename(input, '.glb').replace(/[^a-z0-9_-]/gi, '-').slice(0, 60) || 'model';
const reportDir = await fs.mkdtemp(path.join(outputRoot, `${stem}-${inputHash.slice(0, 12)}-`));
const save = (name, value) => fs.writeFile(path.join(reportDir, name), value, { flag: 'wx' });
await save('summary.json', `${JSON.stringify(summary, null, 2)}\n`);
await save('gltf-validation.json', `${JSON.stringify(validation ?? { error: validationError }, null, 2)}\n`);
await save('gltf-inspect.md', `${inspection.stdout}\n${inspection.stderr ? `\nInspection diagnostics:\n${inspection.stderr}` : ''}${inspection.error ? `\n${inspection.error}\n` : ''}`);
console.log(JSON.stringify({ pass: summary.pass, reportDir, sha256: inputHash, inputUnchanged: unchanged, counts: summary.counts, validation: summary.validation, gltfTransform: version }, null, 2));
process.exitCode = summary.pass ? 0 : 1;
