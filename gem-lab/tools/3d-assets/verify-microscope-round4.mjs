import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import validator from 'gltf-validator';
import {illuminationContractErrors} from './instruments-review-state.mjs';
import {verifyIrisMorphGeometry} from './verify-round3-contract.mjs';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const base=path.join(app,'public/assets/3d/gem-microscope/structure-v1');
const output=path.join(app,'assets-source/instruments-2026-10-07/round4');
const master=path.join(app,'assets-source/gem-microscope/tripo-trials/2026-10-07/repair-v4');
const jsonFile=async file=>JSON.parse(await readFile(file,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const errors=[];
const [manifest,provenance,bytes]=await Promise.all([jsonFile(path.join(base,'manifest.json')),jsonFile(path.join(base,'provenance.json')),readFile(path.join(base,'model.glb'))]);
if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB');
const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)).trim());
const sha256=hash(bytes);
if(manifest.sha256!==sha256)errors.push('Manifest does not match current model');
const poster=await readFile(path.join(base,'poster.png'));
if(!poster.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))errors.push('Poster is not PNG');
if(/\/Users\//.test(JSON.stringify(provenance)))errors.push('Public provenance contains a personal host path');
if(manifest.version!=='structure-4'||manifest.revision!=='repair-v4'||provenance.revision!=='repair-v4')errors.push('Expected round-4 microscope');
if(manifest.dimensionsCalibrated!==false||manifest.teachingOpticsSimulated!==false)errors.push('Static model must remain uncalibrated and separate from browser lighting');
const names=json.nodes.map(n=>n.name);
errors.push(...illuminationContractErrors(manifest,names));
for(const id of ['lampHousingBase','lampMount','filterGuides','analyzerGuide'])if(!manifest.parts.some(p=>p.id===id))errors.push('Missing mounting part '+id);
if(new Set(manifest.parts.map(p=>p.id)).size!==manifest.parts.length)errors.push('Duplicate part IDs');
for(const p of manifest.parts){
  if(names.filter(name=>name===p.node).length!==1)errors.push('Part not unique '+p.id);
  for(const key of ['pivot','rotationAxisLocal','explodeOffset'])if(!Array.isArray(p[key])||p[key].length!==3||!p[key].every(Number.isFinite))errors.push('Invalid part vector '+p.id+': '+key);
}
const validation=await validator.validateBytes(new Uint8Array(bytes),{uri:'model.glb',maxIssues:100});
if(validation.issues.numErrors||validation.issues.numWarnings)errors.push('glTF validation errors/warnings');
const iris=verifyIrisMorphGeometry(manifest,json,bytes);errors.push(...iris.errors);
const reports=[];
for(const name of ['microscope-illumination-check.json','microscope-iris-math-check.json','microscope-mounting-check.json']){
  const report=await jsonFile(path.join(output,name));
  if(report.ok!==true||report.round!==4)errors.push('Failed math report '+name);
  for(const [file,expected]of Object.entries(report.sourceSha256||{})){
    if(file.includes('..')||path.isAbsolute(file))throw Error('Invalid source path');
    if(hash(await readFile(path.join(app,'tools/3d-assets',file)))!==expected)errors.push('Stale math report '+name+': '+file);
  }
  reports.push({file:name,checks:report.checks.length,scope:report.scope});
}
const meshes=await jsonFile(path.join(master,'mesh-check.json'));
if(meshes.meshes.some(mesh=>mesh.boundaryEdges||mesh.nonManifoldEdges||!(mesh.volumeCubicMeters>0)))errors.push('Open, nonmanifold or non-positive mesh');
const reimport=await jsonFile(path.join(master,'blender-reimport-check.json'));
if(reimport.irisMorphTargetsAfterReimport?.length!==12)errors.push('Blender reimport lost iris targets');
if(reimport.missingNamedParts?.length||!reimport.allSourceMeshesClosed||!reimport.allSourceMeshesPositiveVolume)errors.push('Blender geometry/reimport check failed');
const mountingGlb=await jsonFile(path.join(output,'microscope-mounting-glb-check.json'));
if(!mountingGlb.ok||mountingGlb.modelSha256!==sha256||!mountingGlb.hashMatchesManifest)errors.push('Exported mounting clearance check failed or stale');
const runtime=await jsonFile(path.join(output,'lighting-runtime-check.json'));
if(!runtime.ok||runtime.modelSha256!==sha256)errors.push('Runtime checks failed or use stale GLB');
if(runtime.lightingModuleSha256!==hash(await readFile(path.join(app,'tools/3d-assets/microscope-lighting.mjs'))))errors.push('Stale lighting implementation evidence');
const protectedFiles=await jsonFile(path.join(output,'protected-before.json'));
for(const [file,expected]of Object.entries(protectedFiles))if(hash(await readFile(path.join(app,'..',file)))!==expected)errors.push('Protected file changed: '+file);
const result={checkedAt:new Date().toISOString(),round:4,ok:errors.length===0,sha256,bytes:bytes.length,parts:manifest.parts.length,meshes:json.meshes.length,gltfErrors:validation.issues.numErrors,gltfWarnings:validation.issues.numWarnings,iris,reports,mountingGlb:{poses:mountingGlb.poses.length,meshes:mountingGlb.checkedMountingMeshes.length,scope:mountingGlb.scope},runtimeChecks:runtime.checks.length,protectedFileCount:Object.keys(protectedFiles).length,errors,scope:'Exported microscope GLB, iris morphs, parameter-based geometry evidence, CPU lighting contract; browser images checked separately. Not real optical calibration.'};
await writeFile(path.join(output,'technical-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));if(errors.length)process.exitCode=1;
