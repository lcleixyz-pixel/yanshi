/** Independent exported-mesh audit. Does not import the model author's optics code. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import assert from 'node:assert/strict';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../..');
const output=path.join(repo,'gem-lab/assets-source/optics-paper-review/2026-10-08');
const {values:options}=parseArgs({options:{'input-root':{type:'string'},'input-dir':{type:'string'},'output-dir':{type:'string'},'model-file':{type:'string'},'manifest-file':{type:'string'},instrument:{type:'string'},help:{type:'boolean'}}});
if(options.help){console.log('node verify_other_optics.mjs [--input-root DIR] [--instrument prism-spectroscope|grating-spectroscope --input-dir DIR] [--model-file GLB] [--manifest-file JSON] [--output-dir DIR]\nDefault: both original 2026-10-08 candidate directories, original shared validation output. File overrides require --instrument.');process.exit(0);}
const instrumentIds=options.instrument?[options.instrument]:['prism-spectroscope','grating-spectroscope'];
assert.ok(instrumentIds.every(id=>['prism-spectroscope','grating-spectroscope'].includes(id)),'invalid instrument');
assert.ok(!options['input-dir']||options.instrument,'--input-dir requires --instrument');
assert.ok(!(options['model-file']||options['manifest-file'])||options.instrument,'file overrides require --instrument');
const inputRoot=path.resolve(options['input-root']??output);
const reportDirectory=path.resolve(options['output-dir']??path.join(output,'validation'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const vector=p=>new T.Vector3().fromArray(p);
const checks=[];
function check(name,fn){try{checks.push({name,pass:true,evidence:fn()??null});}catch(e){checks.push({name,pass:false,error:e.message});}}
const instruments=[];
const tolerance={surfaceDistanceMeters:1e-7,snellTangentialIndexVector:3e-6,gratingSine:1e-6,terminationMeters:1e-7,angularDegrees:.0001};
for(const instrumentId of instrumentIds){
  const folder=options['input-dir']?path.resolve(options['input-dir']):path.join(inputRoot,instrumentId);
  const modelFile=path.resolve(options['model-file']??path.join(folder,'model.glb')),manifestFile=path.resolve(options['manifest-file']??path.join(folder,'manifest.json'));
  const modelBytes=await fs.readFile(modelFile);
  const manifest=await json(manifestFile), cases=await json(path.join(folder,'optical-cases.json'));
  const prescription=instrumentId==='prism-spectroscope'?await json(path.join(folder,'prescription.json')):null;
  const gltf=await new GLTFLoader().register(()=>({name:'INDEPENDENT_CPU_SKIP_IMAGE_DECODING',loadTexture:()=>Promise.resolve(new T.Texture())})).parseAsync(modelBytes.buffer.slice(modelBytes.byteOffset,modelBytes.byteOffset+modelBytes.byteLength),'');
  gltf.scene.updateMatrixWorld(true);
  const meshes=[];
  gltf.scene.traverse(o=>{if(o.isMesh){meshes.push(o);for(const material of Array.isArray(o.material)?o.material:[o.material])material.side=T.DoubleSide;}});
  const meshByName=name=>meshes.find(o=>o.name===name||o.userData.name===name);
  const canonical=o=>o.userData.name??o.name;
  // The manuscript-facing, deliberately enlarged grating rulings are visual
  // annotations, not opaque physical rails. Cement edge guides are also tagged
  // non-optical in the export. Every remaining mesh participates in ray queries.
  const ignored=meshes.filter(o=>o.userData.opticalLayer===false||(manifest.replicaGrating?.rulingsEnlarged&&canonical(o).includes('enlarged_parallel_rulings')));
  const physical=meshes.filter(o=>!ignored.includes(o));
  const triangles=new Map();
  function trianglesOf(mesh){
    if(triangles.has(mesh))return triangles.get(mesh);
    const p=mesh.geometry.attributes.position,index=mesh.geometry.index,out=[];
    const count=index?.count??p.count;
    for(let i=0;i<count;i+=3){
      const at=j=>new T.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld);
      const tri=new T.Triangle(at(0),at(1),at(2));
      if(tri.getArea()>1e-20)out.push(tri);
    }
    triangles.set(mesh,out);return out;
  }
  function surface(mesh,point){
    assert.ok(mesh,'declared interaction mesh missing');
    let best=Infinity,result=null;const closest=new T.Vector3();
    for(const tri of trianglesOf(mesh)){
      tri.closestPointToPoint(point,closest);const distance=closest.distanceTo(point);
      if(distance<best){best=distance;result={distance,normal:tri.getNormal(new T.Vector3()),closest:closest.clone()};}
    }
    return result;
  }
  function firstHit(start,direction,far=.3){
    // Plane intersection plus closest-point containment gives a stable edge
    // convention for rays exactly on the y=0 seam of the exported lathe meshes.
    // A conventional Raycaster can miss one face there and return its back face.
    let best=null;const normal=new T.Vector3(),point=new T.Vector3(),nearest=new T.Vector3();
    for(const mesh of physical)for(const tri of trianglesOf(mesh)){
      tri.getNormal(normal);const denominator=normal.dot(direction);
      if(Math.abs(denominator)<1e-12)continue;
      const t=tri.a.clone().sub(start).dot(normal)/denominator;
      if(t<2e-7||t>far||best&&t>=best.distance)continue;
      point.copy(start).addScaledVector(direction,t);
      tri.closestPointToPoint(point,nearest);
      if(point.distanceTo(nearest)>1e-8)continue;
      best={object:mesh,point:point.clone(),distance:t};
    }
    return best;
  }
  function materialIndex(glass,wavelength){
    if(glass==='air')return 1;
    const g=prescription.glasses[glass],l2=(wavelength/1000)**2;
    return Math.sqrt(1+g.B.reduce((sum,b,i)=>sum+b*l2/(l2-g.C[i]),0));
  }
  check(`${instrumentId}: model hash agrees with manifest`,()=>assert.equal(hash(modelBytes),manifest.sha256));
  const record={instrumentId,inputDirectory:folder,modelFile,manifestFile,modelSha256:hash(modelBytes),manifestSha256:hash(await fs.readFile(manifestFile)),
    opticalCasesSha256:hash(await fs.readFile(path.join(folder,'optical-cases.json'))),
    prescriptionSha256:prescription?hash(await fs.readFile(path.join(folder,'prescription.json'))):null,
    cases:[],ignoredAnnotationMeshes:ignored.map(canonical)};
  for(const c of cases.cases){
    const row={caseId:c.id,pathCount:c.paths.length,interactionCount:0,maxSurfaceDistanceMeters:0,maxSnellResidual:0,maxGratingResidual:0,maxTerminationDeltaMeters:0,maxExitAngleErrorDegrees:0,blocked:0,reachesEyepiece:0};
    check(`${instrumentId}/${c.id}: all interface points, equations and first physical obstructions`,()=>{
      for(const p of c.paths){
        const points=p.points.map(vector);assert.ok(points.length>=3);
        for(let i=0;i<points.length-1;i++){
          const direction=points[i+1].clone().sub(points[i]),length=direction.length();assert.ok(length>0);
          direction.normalize();
          const hit=firstHit(points[i],direction,length-2e-7);
          assert.ok(!hit,`${p.id}: segment ${i} passes through ${hit?canonical(hit.object):''} before declared interaction`);
        }
        for(const interaction of p.interactions){
          const i=interaction.pointIndex,point=points[i],mesh=meshByName(interaction.surfaceNode),actual=surface(mesh,point);
          row.interactionCount++;row.maxSurfaceDistanceMeters=Math.max(row.maxSurfaceDistanceMeters,actual.distance);
          assert.ok(actual.distance<tolerance.surfaceDistanceMeters,`${p.id}: ${interaction.surfaceNode} point off actual triangles by ${actual.distance}`);
          if(interaction.kind==='termination')continue;
          const incoming=point.clone().sub(points[i-1]).normalize(),outgoing=points[i+1].clone().sub(point).normalize();
          const normal=actual.normal;
          if(interaction.kind==='refraction'){
            // Independent Snell check: tangential wave-vector continuity using
            // an actual triangle normal. No use of recorded event directions.
            const inT=incoming.clone().addScaledVector(normal,-incoming.dot(normal)).multiplyScalar(interaction.n1);
            const outT=outgoing.clone().addScaledVector(normal,-outgoing.dot(normal)).multiplyScalar(interaction.n2);
            const residual=inT.distanceTo(outT);row.maxSnellResidual=Math.max(row.maxSnellResidual,residual);
            assert.ok(residual<tolerance.snellTangentialIndexVector,`${p.id}: Snell tangent residual ${residual}`);
            assert.ok(incoming.dot(normal)*outgoing.dot(normal)>0,`${p.id}: refracted direction reversed its propagation side`);
            const glassOrder=['air',...prescription.glassSequence,'air'];
            assert.ok(Math.abs(interaction.n1-materialIndex(glassOrder[i-1],interaction.wavelengthNm))<1e-10);
            assert.ok(Math.abs(interaction.n2-materialIndex(glassOrder[i],interaction.wavelengthNm))<1e-10);
            const [z,slope]=prescription.planesZEqualsInterceptPlusSlopeX[i-1];
            assert.ok(Math.abs(point.z-z-slope*point.x)<tolerance.surfaceDistanceMeters,`${p.id}: point disagrees with prescription plane`);
          }else if(interaction.kind==='diffraction'){
            if(normal.z<0)normal.negate();
            const groove=vector(interaction.groovesDirection).normalize(),dispersion=new T.Vector3().crossVectors(groove,normal).normalize();
            assert.ok(Math.abs(incoming.dot(groove))<1e-9&&Math.abs(incoming.dot(dispersion))<1e-9,'not the stated normal-incidence case');
            const expected=interaction.order*interaction.wavelengthNm*1e-6*interaction.grooveDensityPerMm;
            const residual=Math.abs(outgoing.dot(dispersion)-incoming.dot(dispersion)-expected);
            row.maxGratingResidual=Math.max(row.maxGratingResidual,residual);
            assert.ok(residual<tolerance.gratingSine,`${p.id}: grating equation residual ${residual}`);
            assert.ok(Math.abs(outgoing.dot(groove))<1e-9,'diffraction wrongly changes groove-parallel component');
            assert.ok(outgoing.dot(normal)>0,'transmitted order propagates backward');
          }
        }
        const last=points.length-1,direction=points[last].clone().sub(points[last-1]).normalize();
        const hit=firstHit(points[last-1],direction);
        assert.ok(hit,`${p.id}: no physical terminal mesh`);
        const delta=hit.point.distanceTo(points[last]);row.maxTerminationDeltaMeters=Math.max(row.maxTerminationDeltaMeters,delta);
        assert.ok(delta<tolerance.terminationMeters,`${p.id}: first hit differs from claimed termination by ${delta}`);
        assert.equal(canonical(hit.object),p.termination.node);
        if(p.termination.status==='reaches-eyepiece-front'){
          row.reachesEyepiece++;assert.ok(canonical(hit.object).endsWith('eyepiece_glass'));
        }else{row.blocked++;assert.equal(p.termination.status,'blocked');assert.ok(!canonical(hit.object).includes('glass'));}
        const exitAngle=T.MathUtils.radToDeg(Math.atan2(direction.x,direction.z));
        if(prescription){
          const expected=prescription.analyticExitDegrees[String(p.wavelengthNm)],error=Math.abs(exitAngle-expected);
          row.maxExitAngleErrorDegrees=Math.max(row.maxExitAngleErrorDegrees,error);
          assert.ok(error<tolerance.angularDegrees,`${p.id}: exit angle error ${error}`);
        }
      }
      if(c.readout.reachesEyepiece!==undefined)assert.equal(row.reachesEyepiece,c.readout.reachesEyepiece);
      if(c.readout.total!==undefined)assert.equal(c.paths.length,c.readout.total);
      return row;
    });
    record.cases.push(row);
  }
  if(prescription){
    check(`${instrumentId}: manifest cement-interface planes agree with prescription and GLB`,()=>{
      const planes=manifest.amiciAssembly.interfaces;
      assert.equal(planes.length,2);
      for(let i=0;i<2;i++){
        assert.ok(Math.abs(planes[i].planeXZ.zInterceptMeters-prescription.planesZEqualsInterceptPlusSlopeX[i+1][0])<1e-10,`interface ${i+1} intercept stale: ${planes[i].planeXZ.zInterceptMeters}`);
        assert.ok(Math.abs(planes[i].planeXZ.zSlopePerX-prescription.planesZEqualsInterceptPlusSlopeX[i+1][1])<1e-10,`interface ${i+1} slope stale: ${planes[i].planeXZ.zSlopePerX}`);
      }
    });
  }
  instruments.push(record);
}
const report={schemaVersion:1,checkedAt:new Date().toISOString(),validator:'independent Three GLTF triangle read; no author optics functions imported',validatorSha256:hash(await fs.readFile(fileURLToPath(import.meta.url))),tolerance,
  scope:['All current display cases and all paths, including 400/550/700 nm.',
    'Assumes collimated parallel input after the unknown collimator; does not validate collimation, slit imaging or spectral resolution.',
    'Stops at the first actual obstacle or the actual eyepiece front surface; does not trace the unknown eyepiece or predict a retinal image.',
    'Sellmeier indices are independently recomputed from the supplied prescription, not independently measured glass data.',
    'Explicitly enlarged grating-ruling annotations and non-optical cement edge guides excluded from opaque-obstacle tests.'],
  instruments,checks,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length};
await fs.mkdir(reportDirectory,{recursive:true});
await fs.writeFile(path.join(reportDirectory,'independent-spectroscopes.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.failed)process.exitCode=1;
