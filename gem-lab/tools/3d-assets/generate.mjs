import {mkdir, copyFile, writeFile, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createPolariscope} from './technical-reference/polariscope/model.js';
import {PARTS} from './technical-reference/polariscope/configuration.js';

// The exporter uses the browser FileReader API even for texture-free geometry.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();}).catch(error=>this.onerror?.(error)); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value=>{this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;this.onloadend?.();}).catch(error=>this.onerror?.(error)); }
};
const here=path.dirname(fileURLToPath(import.meta.url));
const output=path.resolve(here,'./technical-reference/polariscope');
const three=path.resolve(here,'node_modules/three');
const files={
  'build/three.module.min.js':'three.module.min.js',
  'build/three.core.min.js':'three.core.min.js',
  'examples/jsm/controls/OrbitControls.js':'addons/controls/OrbitControls.js',
  'examples/jsm/loaders/GLTFLoader.js':'addons/loaders/GLTFLoader.js',
  'examples/jsm/utils/BufferGeometryUtils.js':'addons/utils/BufferGeometryUtils.js',
  'examples/jsm/utils/SkeletonUtils.js':'addons/utils/SkeletonUtils.js',
  'examples/jsm/environments/RoomEnvironment.js':'addons/environments/RoomEnvironment.js',
  'LICENSE':'LICENSE-three.txt',
};
for(const [source,dest] of Object.entries(files)) {
  const target=path.join(output,'vendor',dest);
  await mkdir(path.dirname(target),{recursive:true});
  await copyFile(path.join(three,source),target);
}
const {root,parts}=createPolariscope(THREE,RoundedBoxGeometry);
const tracks=PARTS.map(({id,offset})=>{
  const part=parts[id];
  if(!part) throw new Error(`Missing required part: ${id}`);
  part.userData.partId=id;
  const start=part.position.toArray();
  return new THREE.VectorKeyframeTrack(`${part.name}.position`,[0,1.2],[...start,...start.map((n,i)=>n+offset[i])]);
});
root.userData={...root.userData,assetVersion:'0.1.0',units:'meters',purpose:'Teaching structure approximation; dimensions uncalibrated; gemstone optical response not simulated.'};
const animations=[new THREE.AnimationClip('Explode',1.2,tracks)];
const data=await new GLTFExporter().parseAsync(root,{binary:true,trs:true,animations,onlyVisible:false});
await writeFile(path.join(output,'polariscope.glb'),Buffer.from(data));
let triangles=0,meshes=0;
root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
await writeFile(path.join(output,'manifest.json'),JSON.stringify({id:'gem-lab-polariscope',version:'0.1.0',format:'glTF 2.0 binary',file:'polariscope.glb',units:'meter',geometryType:'procedural teaching approximation',dimensionsCalibrated:false,gemstoneOpticsSimulated:false,reference:'../../instruments/polariscope.png',generator:'Three.js 0.183.2',byteLength:data.byteLength,meshes,triangles,animations:['Explode'],parts:PARTS.map(({id,label,offset})=>({id,label,node:parts[id].name,explodeOffset:offset})),scope:'Independent sample; not integrated into assessment or learning progress.'},null,2)+'\n');
console.log(JSON.stringify({file:path.join(output,'polariscope.glb'),bytes:data.byteLength,meshes,triangles}));
