// Web delivery build of the KSW6000 three-way lighting microscope.
// Input: repair-v2/model.glb (read-only). Output: public/assets/3d/gem-microscope/lighting-v3/.
// Only Tripo exterior meshes (tripo_part_*) without morph targets are simplified; authored
// teaching parts, iris morph targets, node names and transforms are kept unchanged.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplifyPrimitive, textureCompress, prune, dedup, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const gemLab = path.resolve(here, '../../..');
const source = path.join(gemLab, 'assets-source/gem-microscope/tripo-trials/2026-10-08/repair-v2');
const out = path.join(gemLab, 'public/assets/3d/gem-microscope/lighting-v3');
const args = new Map(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const ratio = Number(args.get('ratio') ?? .22), maxTexture = Number(args.get('texture') ?? 1024);

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const inputBytes = await fs.readFile(path.join(source, 'model.glb'));
const manifest = JSON.parse(await fs.readFile(path.join(source, 'manifest.json'), 'utf8'));
if (sha(inputBytes) !== manifest.modelSha256) throw Error('repair-v2 model hash does not match its manifest');

await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const document = await io.readBinary(new Uint8Array(inputBytes));
const triangles = () => document.getRoot().listMeshes().flatMap(m => m.listPrimitives())
  .reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
const before = triangles();

const simplified = [];
for (const node of document.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh || !node.getName().startsWith('tripo_part_')) continue;
  for (const primitive of mesh.listPrimitives()) {
    if (primitive.listTargets().length) continue;
    const count = (primitive.getIndices()?.getCount() ?? 0) / 3;
    if (count < 4000) continue;
    simplifyPrimitive(primitive, { simplifier: MeshoptSimplifier, ratio, error: .0008, lockBorder: true });
    simplified.push({ node: node.getName(), before: count, after: primitive.getIndices().getCount() / 3 });
  }
}
await document.transform(
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxTexture, maxTexture], quality: 82 }),
  prune({ keepLeaves: true, keepAttributes: true }),
  // EXT_meshopt_compression; the app registers three's MeshoptDecoder. Quantization may fold
  // dequantization into mesh nodes, so world-space bounds are verified separately (check-web.mjs).
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
// Every node the app looks up must survive pruning.
const names = new Set(document.getRoot().listNodes().map(n => n.getName()));
const required = [...manifest.parts.map(p => p.node), ...manifest.iris.bladeNodes, manifest.centralCone.node,
  manifest.controls.irisControlRingNode, manifest.controls.irisHandleNode, manifest.controls.modeNode,
  manifest.optics.coneReflector.node, manifest.optics.outerReflector.node, manifest.lampEmitterNode, manifest.collimatorExitNode];
const missing = required.filter(name => !names.has(name));
if (missing.length) throw Error('Missing nodes after compression: ' + missing.join(', '));

const outputBytes = Buffer.from(await io.writeBinary(document));
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'model.glb'), outputBytes);
const webManifest = { ...manifest, assetId: 'gem-microscope-ksw-lighting-v3-web', modelSha256: sha(outputBytes), modelBytes: outputBytes.length,
  web: { sourceModelSha256: manifest.modelSha256, sourceBytes: inputBytes.length, simplifiedExteriorRatio: ratio, maxTexture, textureFormat: 'webp',
    trianglesBefore: before, trianglesAfter: triangles(), note: 'Only tripo_part_* exterior meshes simplified; teaching parts, morph targets, node names and transforms unchanged.' } };
await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(webManifest, null, 2) + '\n');
const provenance = JSON.parse(await fs.readFile(path.join(source, 'provenance.json'), 'utf8'));
await fs.writeFile(path.join(out, 'provenance.json'), JSON.stringify({ ...provenance, assetId: webManifest.assetId, modelSha256: webManifest.modelSha256,
  webBuild: { script: 'tools/3d-assets/microscope-ksw-lighting-v3/build-web.mjs', from: 'assets-source/gem-microscope/tripo-trials/2026-10-08/repair-v2/model.glb', sourceModelSha256: manifest.modelSha256,
    lighting: 'Top (LED + diffuser, 6500 K) and gooseneck side light added in the web layer after the 2014 paper §3.1 / Fig. 1; see microscope-ksw-lighting-v3/README.md.' } }, null, 2) + '\n');
await fs.copyFile(path.join(source, 'renders/hero.png'), path.join(out, 'poster-source.png'));
await sharp(path.join(source, 'renders/hero.png')).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(out, 'poster.webp'));
await fs.rm(path.join(out, 'poster-source.png'));
console.log(JSON.stringify({ bytesIn: inputBytes.length, bytesOut: outputBytes.length, trianglesBefore: before, trianglesAfter: webManifest.web.trianglesAfter,
  simplifiedPrimitives: simplified.length, sha256: webManifest.modelSha256 }, null, 2));
