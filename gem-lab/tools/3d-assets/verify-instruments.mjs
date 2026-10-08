import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import validator from 'gltf-validator';
import {Box3, Matrix4, Vector3, Quaternion} from 'three';
import {verifyRound3Contract} from './verify-round3-contract.mjs';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ids = ['prism-spectroscope', 'grating-spectroscope', 'refractometer', 'gem-microscope'];
const report = { checkedAt: new Date().toISOString(), checks: [], ok: true };
const round3=process.argv.includes('--round3'), round2=process.argv.includes('--round2')||round3;
const unknown=process.argv.slice(2).filter(arg=>!['--round2','--round3'].includes(arg));
if(unknown.length||process.argv.includes('--round2')&&round3)throw Error('Use either --round2 or --round3, without additional arguments');
report.round=round3?3:round2?2:1;
const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
function sceneBounds(json){
  const box=new Box3();
  function visit(index,parent){
    const node=json.nodes[index],local=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3(...(node.translation||[0,0,0])),new Quaternion(...(node.rotation||[0,0,0,1])),new Vector3(...(node.scale||[1,1,1])));
    const world=parent.clone().multiply(local);
    if(node.mesh!==undefined)for(const primitive of json.meshes[node.mesh].primitives){const a=json.accessors[primitive.attributes.POSITION];if(a.min&&a.max)box.union(new Box3(new Vector3(...a.min),new Vector3(...a.max)).applyMatrix4(world));}
    for(const child of node.children||[])visit(child,world);
  }
  for(const node of json.scenes[json.scene||0].nodes)visit(node,new Matrix4());
  return {min:box.min.toArray(),max:box.max.toArray(),size:box.getSize(new Vector3()).toArray()};
}
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
    const bounds=sceneBounds(json);
    if(round2){
      if(!['m','meter','meters'].includes(manifest.units))result.errors.push('Round 2 geometry must use metres');
      if(!round3&&!(manifest.revision===2||manifest.revision==='repair-v2'||/round-2/.test(manifest.version)))result.errors.push('Round 2 artifact has not been generated; current file is earlier revision');
      if(id.endsWith('spectroscope')){
        const expected=id==='prism-spectroscope'?.095:.055;
        if(Math.abs(bounds.size[2]-expected)>.003)result.errors.push('Spectroscope axial metre length outside target tolerance');
        if(!manifest.transparentShellParts?.length)result.errors.push('Missing independent transparent shell');
        if(manifest.parts.some(p=>Math.abs(p.explodeOffset[0])+Math.abs(p.explodeOffset[1])>1e-8))result.errors.push('Spectroscope explosion must be axial');
        if(id==='grating-spectroscope'&&manifest.parts.some(p=>p.rotatable||p.translatable))result.errors.push('Pocket grating instrument must have no mechanical controls');
      }
      if(id==='refractometer'){
        if(!manifest.parts.some(p=>p.id==='oil_bottle'&&p.accessory&&p.visibilityToggle))result.errors.push('Oil bottle must be an independently hideable accessory');
        if(!manifest.parts.some(p=>p.id==='power_switch'&&p.motion?.type==='translation'))result.errors.push('Missing power-switch travel mapping');
        // Decorative exterior features are deliberately absent in round 3.
        if(!round3&&!manifest.parts.some(p=>p.id==='body'&&p.unknownExteriorFeatures?.count===5))result.errors.push('Missing round 2 exterior feature evidence boundary');
      }
      if(id==='gem-microscope'){
        if(bounds.size[1]<.36||bounds.size[1]>.44)result.errors.push('Microscope metre height outside 40 cm illustrative scale');
        const iris=manifest.irisMechanics;
        if(!iris?.controlAngleChangesAperture||iris.drive?.nodes?.length!==12)result.errors.push('Missing iris linkage');
        for(const name of iris?.drive?.nodes||[]){const node=json.nodes.find(n=>n.name===name),mesh=json.meshes[node?.mesh];if(!mesh?.extras?.targetNames?.includes(iris.drive.morphTargetName)||!mesh.primitives.every(p=>p.targets?.length))result.errors.push('Missing exported iris morph target '+name);}
        if(!manifest.focusMechanics?.drivenParts?.length)result.errors.push('Missing focus linkage');
      }
    }
    if(round3){const check=verifyRound3Contract(id,manifest,provenance,json,bytes);result.errors.push(...check.errors);Object.assign(result,check.details);}
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
    Object.assign(result, { bytes: bytes.length, sha256: hash, bounds, parts: seen.size, meshes: json.meshes?.length, triangles, materials: json.materials?.length, gltfErrors: validation.issues.numErrors, gltfWarnings: validation.issues.numWarnings, gltfIssues: validation.issues.messages, posterBytes: poster.length });
  } catch (error) { result.errors.push(error.message); }
  result.ok = result.errors.length === 0;
  if (!result.ok) report.ok = false;
  report.checks.push(result);
}
const output = path.join(app, 'assets-source/instruments-2026-10-07',round3?'round3/technical-verification.json':round2?'round2/technical-verification.json':'technical-verification.json');
if(round3){
  report.geometryChecks=[];
  for(const name of ['refractometer-optical-path-check.json','microscope-illumination-check.json','microscope-iris-math-check.json','amici-geometry-check.json']){
    const check={file:name,errors:[]};
    try{
      const evidence=JSON.parse(await readFile(path.join(path.dirname(output),name),'utf8'));
      if(evidence.ok!==true||evidence.round!==3)check.errors.push('Current round-3 mathematical evidence did not pass');
      if(!evidence.sourceSha256||!Object.keys(evidence.sourceSha256).length)check.errors.push('Mathematical report lacks source hashes');
      for(const [file,expected] of Object.entries(evidence.sourceSha256||{})){
        if(file.includes('..')||path.isAbsolute(file))throw Error('Invalid source hash path');
        const actual=createHash('sha256').update(await readFile(path.join(app,'tools/3d-assets',file))).digest('hex');
        if(actual!==expected)check.errors.push('Stale mathematical evidence for '+file+'; rerun check-round3-static.py');
      }
      check.scope=evidence.scope;
    }catch(error){check.errors.push(error.message);}
    check.ok=!check.errors.length;if(!check.ok)report.ok=false;report.geometryChecks.push(check);
  }
}
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({...report, checks: report.checks.map(({gltfIssues, ...check}) => check)}, null, 2));
if (!report.ok) process.exitCode = 1;
