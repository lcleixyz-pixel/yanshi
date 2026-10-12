import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {illuminationContractErrors, illuminationPlan, defaultHiddenNodes} from './instruments-review-state.mjs';
import {createMicroscopeLighting} from './microscope-lighting.mjs';

const $=id=>document.getElementById(id), view=$('view'), scene=new THREE.Scene();
scene.background=new THREE.Color('#e8edf2');
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
renderer.outputColorSpace=THREE.SRGBColorSpace;view.prepend(renderer.domElement);
const canvas=renderer.domElement;canvas.dataset.testid='instrument-canvas';
const camera=new THREE.PerspectiveCamera(36,1,.0001,100);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;
const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);
scene.environment=env.texture;room.dispose();pmrem.dispose();
const studioLights=[];
const hemisphere=new THREE.HemisphereLight(0xffffff,0x8090a0,2);scene.add(hemisphere);studioLights.push({lamp:hemisphere,intensity:2});
for(const [pos,color,intensity] of [[[2,4,3],0xffffff,3.2],[[-3,2,-2],0xf0f6ff,2]]){
  const lamp=new THREE.DirectionalLight(color,intensity);lamp.position.set(...pos);scene.add(lamp);studioLights.push({lamp,intensity});
}
const loader=new GLTFLoader(),ids=['gem-microscope','refractometer','prism-spectroscope','grating-spectroscope'];
let root,group,parts=[],manifest,selected=null,isolated=false,revision=0,frame=0,activeMotions=[];
const materials=new Map();
let illuminationState=null;
let lightingRig=null,sampleViewActive=false;
const byId=id=>parts.find(p=>p.id===id||p.node===id);
function dispose(obj){
  const mats=new Set(),geo=new Set(),tex=new Set();
  obj.traverse(o=>{if(o.geometry)geo.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m){mats.add(m);for(const v of Object.values(m))if(v?.isTexture)tex.add(v)}});
  geo.forEach(x=>x.dispose());mats.forEach(x=>x.dispose());tex.forEach(x=>x.dispose());
}
function visibleBounds(obj){
  scene.updateMatrixWorld(true);const box=new THREE.Box3();
  obj.traverseVisible(o=>{if(!o.isMesh)return;for(let a=o;a&&a!==obj;a=a.parent)if(a.userData.excludeFromAssetBounds)return;o.geometry.computeBoundingBox();box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));});
  return box;
}
function fit(obj=group,dir=camera.position.clone().sub(controls.target)){
  if(!obj)return;const box=visibleBounds(obj);if(box.isEmpty())return;
  const sphere=box.getBoundingSphere(new THREE.Sphere()),v=THREE.MathUtils.degToRad(camera.fov/2),h=Math.atan(Math.tan(v)*camera.aspect);
  // Sphere fits both horizontal and vertical fields, even at diagonal angles or narrow widths.
  const distance=Math.max(.001,sphere.radius/Math.sin(Math.min(v,h))*1.12);
  if(dir.lengthSq()<1e-8)dir.set(1.25,.85,1.5);
  controls.target.copy(sphere.center);camera.position.copy(sphere.center).add(dir.normalize().multiplyScalar(distance));
  controls.minDistance=Math.max(.0002,sphere.radius*.1);controls.maxDistance=Math.max(1,distance*12);
  camera.near=Math.max(.00001,distance/1000);camera.far=Math.max(10,distance*50);camera.updateProjectionMatrix();controls.update();
}
function shells(){return parts.filter(p=>p.transparentShell||(manifest?.transparentShellParts||[]).includes(p.id)||p.id==='body');}
function transparent(){
  const enabled=$('transparent').checked;
  for(const p of shells())p.obj.traverse(o=>{if(!o.isMesh)return;for(const m of (Array.isArray(o.material)?o.material:[o.material])){
    if(!materials.has(m))materials.set(m,{opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite});
    const original=materials.get(m);m.opacity=enabled?.13:original.opacity;m.transparent=enabled||original.transparent;m.depthWrite=enabled?false:original.depthWrite;m.needsUpdate=true;
  }});
  canvas.dataset.transparent=String(enabled);
}
function applyVisibility(){
  if(!root)return;const chosen=byId(selected)?.obj;
  // Visibility is resolved on meshes so isolating a nested component remains possible.
  parts.forEach(p=>p.obj.visible=true);
  root.traverse(o=>{if(!o.isMesh)return;let belongs=false,allowed=true;
    for(let a=o;a;a=a.parent){
      if(a===chosen)belongs=true;
      const p=parts.find(p=>p.obj===a);if(!p)continue;
      if(p.teachingOverlay||p.id===manifest.opticalPath?.partId)allowed&&=$('opticalPath').checked;
      else if(p.accessory||p.visibilityToggle)allowed&&=$('accessory').checked;
      else if(p.defaultVisible===false)allowed=false;
    }
    o.visible=allowed&&(!isolated||belongs);
  });
  canvas.dataset.accessoriesVisible=String($('accessory').checked);
  canvas.dataset.opticalPathVisible=String($('opticalPath').checked);
  updateLightingRig();
}
function syncLightingControls(){
  if(!illuminationState)return;
  for(const key of ['bottom','top','fiber'])$('light-'+key).checked=illuminationState.sources[key];
  $('directLight').checked=illuminationState.darkfieldStop==='open';
  for(const [id,key] of [['insertDiffuser','diffuser'],['insertPolarizer','polarizer'],['insertAnalyzer','analyzer']])$(id).checked=illuminationState[key]==='in';
}
function updateLightingRig(){
  const available=!!lightingRig&&!$('lineup').checked;
  const observation=available&&$('observation').checked&&!isolated&&Number($('explode').value)===0;
  scene.environmentIntensity=observation?0:1;
  studioLights.forEach(({lamp,intensity})=>lamp.intensity=observation?0:intensity);
  canvas.dataset.sceneBackground=scene.background.getHexString();canvas.dataset.environmentIntensity=String(scene.environmentIntensity);
  if(!available){delete canvas.dataset.lighting;return;}
  lightingRig.update(illuminationState,{enabled:true,showSample:$('sampleVisible').checked,showRays:$('illuminationRays').checked,irisDiameterMeters:Number(canvas.dataset.irisDiameter),exploded:Number($('explode').value)>0,isolated,showObservation:observation});
  const diagnostic=lightingRig.diagnostics();canvas.dataset.lighting=JSON.stringify(diagnostic);
  const active=Object.entries(illuminationState.sources).filter(([,on])=>on).map(([key])=>({bottom:'底光',top:'顶灯',fiber:'光纤'}[key]));
  const oblique=diagnostic.actualLights.some(light=>light.kind==='ring'&&light.intensity>0);
  const bottomNote=!illuminationState.sources.bottom?'底光关闭。':illuminationState.darkfieldStop==='closed'?(oblique?'直射通道遮住，底光通过外围斜射。':'直射通道遮住；当前光阑已截去所示斜射光束。'):'直射通道打开。';
  $('lightingResponse').textContent=isolated||Number($('explode').value)>0?'隔离或展开中：照明演示暂停，装配复位后恢复。':!active.length?'仪器光源全部关闭。'+(observation?'':'当前仍有结构展示补光。'):`${active.join('＋')}；${bottomNote}${illuminationState.diffuser==='in'?' 漫射为等效柔化。':''}${illuminationState.analyzer==='in'||illuminationState.polarizer==='in'?' 偏光片仅作装配示意。':''}`;
}
function markCustomLighting(){
  $('illumination').value='';$('illuminationNote').textContent='自定义组合照明；各光源、直射通道和光阑独立控制。';
  applyTransforms();applyVisibility();syncLightingControls();
}
function fitCurrent(){
  if(sampleViewActive&&lightingRig&&$('sampleVisible').checked&&!isolated&&Number($('explode').value)===0)fit(lightingRig.sample,new THREE.Vector3(0,1,.025));
  else fit(isolated&&selected?byId(selected).obj:group);
}
function applyIllumination(){
  if(!illuminationState)return;
  const plan=illuminationPlan(manifest,illuminationState);
  for(const motion of plan.transforms)translation(motion.partId,motion.axis,motion.distance);
  for(const emission of plan.emissions){
    const obj=root.getObjectByName(emission.node);if(!obj?.isMesh)throw Error('自发光网格缺失 '+emission.node);
    for(const material of (Array.isArray(obj.material)?obj.material:[obj.material])){
      material.emissive.setRGB(...emission.color);material.emissiveIntensity=emission.intensity;
    }
  }
  canvas.dataset.illuminationMode=$('illumination').value||'custom';
  canvas.dataset.illuminationState=JSON.stringify(illuminationState);
  canvas.dataset.emissionIntensities=JSON.stringify(Object.fromEntries(plan.emissions.map(e=>[e.node,e.intensity])));
}
function chooseIllumination(id){
  const mode=manifest.illuminationModes?.find(m=>m.id===id);if(!mode)return;
  illuminationState=structuredClone(mode.states);$('illumination').value=id;
  const iris=activeMotions.find(m=>m.id==='iris');if(iris){iris.input.value=mode.states.irisAngleDegrees;iris.show();}
  $('illuminationNote').textContent=mode.note||'';
  applyTransforms();applyVisibility();
  syncLightingControls();
}
function setupIllumination(){
  illuminationState=null;$('illumination').replaceChildren();$('illuminationLabel').hidden=!manifest.illuminationModes;
  $('illuminationNote').textContent='';
  for(const key of ['illuminationMode','illuminationState','emissionIntensities'])delete canvas.dataset[key];
  $('opticalPathLabel').hidden=!byId(manifest.opticalPath?.partId)?.teachingOverlay;$('opticalPath').checked=false;
  if(!manifest.illuminationModes)return;
  const names=[];root.traverse(o=>names.push(o.name));const errors=illuminationContractErrors(manifest,names);
  if(errors.length)throw Error(errors.join('; '));
  const custom=document.createElement('option');custom.value='';custom.textContent='自定义组合照明';custom.disabled=true;$('illumination').append(custom);
  for(const mode of manifest.illuminationModes){const option=document.createElement('option');option.value=mode.id;option.textContent=mode.id==='polarized'?'偏光（滤片装配）':mode.id==='shadowing'?'遮光（光阑预设）':mode.label;$('illumination').append(option);}
  // Independent material instances keep one source switch from changing another source.
  for(const source of Object.values(manifest.sourceNodes)){const obj=root.getObjectByName(source.node);if(!obj?.isMesh)throw Error('自发光网格缺失 '+source.node);obj.material=Array.isArray(obj.material)?obj.material.map(m=>m.clone()):obj.material.clone();}
}
function applyTransforms(){
  for(const p of parts){p.obj.position.copy(p.start);p.obj.quaternion.copy(p.quat);}
  for(const m of activeMotions)m.apply(Number(m.input.value));
  applyIllumination();
  const t=Number($('explode').value)/100;
  for(const p of parts)p.obj.position.add(new THREE.Vector3(...(p.explodeOffset||[0,0,0])).multiplyScalar(t));
  canvas.dataset.explode=String(t);$('amount').value=Math.round(t*100)+'%';
  scene.updateMatrixWorld(true);
  updateLightingRig();
}
function rotation(id,angle){const p=byId(id);if(p)p.obj.quaternion.copy(p.quat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...p.rotationAxisLocal).normalize(),THREE.MathUtils.degToRad(angle)));}
function translation(id,axis,distance){const p=byId(id);if(p)p.obj.position.add(new THREE.Vector3(...axis).multiplyScalar(distance));}
function addMotion(id,label,range,initial,apply,unit='°'){
  const el=document.createElement('label'),output=document.createElement('output'),input=document.createElement('input');
  input.type='range';input.min=range[0];input.max=range[1];input.step=(range[1]-range[0])/100;input.value=initial;input.id='motion-'+id;
  el.htmlFor=input.id;el.append(label+' ',output);$('motions').append(el,input);
  const show=()=>output.value=Number(input.value).toFixed(unit==='mm'?1:0)+unit;
  activeMotions.push({id,input,initial,apply,show});input.oninput=()=>{show();if(id==='iris'&&illuminationState){illuminationState.irisAngleDegrees=Number(input.value);$('illumination').value='';$('illuminationNote').textContent='已手动调整光阑；孔径约束通光范围，光源与板片保留当前状态。';}applyTransforms();fitCurrent()};show();
}
function setupMotions(){
  activeMotions=[];$('motions').replaceChildren();
  const links=manifest.controlLinkages||[];
  for(const link of (Array.isArray(links)?links:Object.values(links)))if(link.type==='symmetricSlit'){
    const range=link.angleRangeDegrees;
    addMotion('slit','狭缝调节环',range,range[0],angle=>{
      const t=(angle-range[0])/(range[1]-range[0]);rotation(link.controlPart,angle-range[0]);
      translation(link.drivenParts[0],[-1,0,0],link.perBladeTravelMeters*t);translation(link.drivenParts[1],[1,0,0],link.perBladeTravelMeters*t);
      canvas.dataset.slitAperture=String(THREE.MathUtils.lerp(...link.apertureRangeMeters,t));
    });
  }
  const tube=byId('focusTube');if(tube?.translationRange)addMotion('focusTube','目镜抽拉',tube.translationRange.map(x=>x*1000),0,value=>translation(tube.id,tube.translationAxisLocal,value/1000),'mm');
  const ocular=byId('eyepiece');if(ocular?.motion?.type==='translation'){const motion=ocular.motion;addMotion('eyepiece','目镜调焦',motion.inputRange,motion.defaultValue??0,value=>{const t=(value-motion.inputRange[0])/(motion.inputRange[1]-motion.inputRange[0]),distance=THREE.MathUtils.lerp(...motion.outputRangeMeters,t);for(const id of [ocular.id,...(motion.followers||[])])translation(id,motion.axis||ocular.translationAxisLocal,distance);},motion.inputUnit||'mm');}
  const iris=manifest.irisMechanics;
  if(iris?.controlAngleChangesAperture&&iris.drive){
    const range=iris.angleRangeDegrees,initial=iris.defaultAngleDegrees;
    addMotion('iris','光阑操纵环',range,initial,angle=>{
      const t=(angle-range[0])/(range[1]-range[0]);rotation(iris.controlPart||iris.controlNode,angle-initial);
      for(const node of iris.drive.nodes){const o=root.getObjectByName(node),i=o?.morphTargetDictionary?.[iris.drive.morphTargetName];if(!o?.morphTargetInfluences||!Number.isInteger(i))throw Error('光阑形态目标缺失 '+node);o.morphTargetInfluences[i]=THREE.MathUtils.lerp(...iris.drive.weightRange,t);}
      canvas.dataset.irisDiameter=String(THREE.MathUtils.lerp(...iris.apertureDiameterRangeMeters,t));
    });
  }
  const focus=manifest.focusMechanics;
  if(focus?.drivenParts&&focus.angleRangeDegrees){
    const range=focus.angleRangeDegrees,initial=focus.defaultAngleDegrees??0;
    addMotion('focus','立柱调焦旋钮',range,initial,angle=>{
      const t=(angle-range[0])/(range[1]-range[0]),base=(initial-range[0])/(range[1]-range[0]);
      rotation(focus.controlPart,angle-initial);
      const distance=THREE.MathUtils.lerp(...focus.translationRangeMeters,t)-THREE.MathUtils.lerp(...focus.translationRangeMeters,base);
      for(const id of focus.drivenParts)translation(id,focus.translationAxisLocal,distance);
      canvas.dataset.focusTravel=String(distance);
    });
  }
  const power=byId('power_switch');if(power?.motion?.outputRangeMeters)addMotion('power','电源开关按压',[0,100],0,percent=>translation(power.id,power.translationAxisLocal,THREE.MathUtils.lerp(...power.motion.outputRangeMeters,percent/100)),'%');
  const polarizer=byId('polarizer');if(polarizer?.rotatable)addMotion('polarizer','偏光片转角',[0,180],0,angle=>rotation(polarizer.id,angle));
  const cover=byId('cover');if(cover){const initial=cover.defaultAngleDegrees??100;addMotion('cover','翻盖开启角度',[0,100],initial,angle=>rotation('cover',initial-angle));}
}
function reset(){
  sampleViewActive=false;$('observation').checked=false;$('sampleVisible').checked=true;$('illuminationRays').checked=false;
  isolated=false;selected=null;$('explode').value=0;$('isolate').setAttribute('aria-pressed','false');
  for(const m of activeMotions){m.input.value=m.initial;m.show();}
  $('transparent').checked=false;$('accessory').checked=true;$('opticalPath').checked=false;transparent();
  if(manifest.illuminationModes)chooseIllumination(manifest.defaultIlluminationMode);else{applyTransforms();applyVisibility();}
  $('parts').querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  $('partInfo').textContent='点击部件可聚焦；拖动画面旋转，滚轮缩放。';
  fit(group,new THREE.Vector3(1.25,.85,1.5));
}
function select(id){
  selected=id;const part=byId(id);if(!part)return;
  $('parts').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.part===id));
  applyVisibility();$('partInfo').textContent=`${part.label} · ${part.rotatable||part.translationRange||part.translationRangeMeters?'可动部件':'装配部件'}${part.evidenceNote||part.note?'；'+(part.evidenceNote||part.note):''}`;fit(part.obj);
}
function initializeLineupAsset(asset,meta){
  for(const name of defaultHiddenNodes(meta)){const obj=asset.getObjectByName(name);if(obj)obj.visible=false;}
  const mode=meta.illuminationModes?.find(m=>m.id===meta.defaultIlluminationMode);if(!mode)return;
  const plan=illuminationPlan(meta,mode.states);
  for(const motion of plan.transforms){const node=meta.parts.find(p=>p.id===motion.partId)?.node,obj=asset.getObjectByName(node);if(!obj)throw Error('并排部件缺失 '+node);obj.position.addScaledVector(new THREE.Vector3(...motion.axis),motion.distance);}
  for(const emission of plan.emissions){const obj=asset.getObjectByName(emission.node);if(!obj?.isMesh)throw Error('并排发光网格缺失 '+emission.node);obj.material=Array.isArray(obj.material)?obj.material.map(m=>m.clone()):obj.material.clone();for(const m of (Array.isArray(obj.material)?obj.material:[obj.material])){m.emissive.setRGB(...emission.color);m.emissiveIntensity=emission.intensity;}}
  const iris=meta.irisMechanics,t=(mode.states.irisAngleDegrees-iris.angleRangeDegrees[0])/(iris.angleRangeDegrees[1]-iris.angleRangeDegrees[0]);
  for(const name of iris.drive.nodes){const obj=asset.getObjectByName(name),index=obj?.morphTargetDictionary?.[iris.drive.morphTargetName];if(!Number.isInteger(index))throw Error('并排光阑形态目标缺失 '+name);obj.morphTargetInfluences[index]=THREE.MathUtils.lerp(...iris.drive.weightRange,t);}
  const part=meta.parts.find(p=>p.id===iris.controlPart),control=asset.getObjectByName(part.node);control.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...part.rotationAxisLocal).normalize(),THREE.MathUtils.degToRad(mode.states.irisAngleDegrees-iris.defaultAngleDegrees)));
}
async function load(id){
  const token=++revision;delete canvas.dataset.error;canvas.dataset.loaded='false';$('status').textContent='正在载入模型…';$('parts').replaceChildren();$('error').textContent='';$('fallback').style.display='none';canvas.style.display='block';
  lightingRig?.dispose();lightingRig=null;sampleViewActive=false;$('lightingControls').hidden=true;updateLightingRig();
  if(group){scene.remove(group);dispose(group);}root=null;group=null;parts=[];materials.clear();activeMotions=[];illuminationState=null;$('motions').replaceChildren();$('illuminationLabel').hidden=true;$('opticalPathLabel').hidden=true;
  const base=`../../public/assets/3d/${id}/structure-v1/`;
  $('fallback').src=base+'poster.png';$('manifest').href=base+'manifest.json';$('provenance').href=base+'provenance.json';$('modelLink').href=base+'model.glb';
  try{
    const response=await fetch(base+'manifest.json',{cache:'no-store'});if(!response.ok)throw Error('清单读取失败 '+response.status);
    const mf=await response.json(),gltf=await loader.loadAsync(base+(mf.model||'model.glb')+'?sha256='+encodeURIComponent(mf.sha256));
    if(token!==revision){dispose(gltf.scene);return;}
    manifest=mf;$('fallback').src=base+'poster.png?sha256='+encodeURIComponent(mf.sha256);root=gltf.scene;group=new THREE.Group();group.add(root);scene.add(group);
    // Keep GLB metres; individual views fit the camera instead of changing the model scale.
    parts=mf.parts.map(p=>{const obj=root.getObjectByName(p.node);if(!obj)throw Error('部件节点缺失 '+p.node);return {...p,obj,start:obj.position.clone(),quat:obj.quaternion.clone()}});
    for(const p of parts){const b=document.createElement('button');b.textContent=p.label;b.dataset.part=p.id;b.onclick=()=>select(p.id);$('parts').append(b);}
    $('accessoryLabel').hidden=!parts.some(p=>!p.teachingOverlay&&(p.accessory||p.visibilityToggle));$('transparent').disabled=!shells().length;
    for(const p of shells())p.obj.traverse(o=>{if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();});
    setupMotions();setupIllumination();
    if(id==='gem-microscope'&&!$('lineup').checked){
      root.traverse(o=>{if(o.isMesh){const mats=Array.isArray(o.material)?o.material:[o.material];o.castShadow=mats.every(m=>!m.transparent&&!m.transmission);o.receiveShadow=true;}});
      lightingRig=createMicroscopeLighting({THREE,scene,root,manifest});$('lightingControls').hidden=false;
    }
    reset();canvas.dataset.instrument=id;canvas.dataset.parts=parts.length;canvas.dataset.sha256=mf.sha256;canvas.dataset.dimensionsCalibrated=String(mf.dimensionsCalibrated);canvas.dataset.revision=String(mf.revision);
    if($('lineup').checked){
      $('parts').hidden=true;$('motions').hidden=true;
      const models=[{id,root,mf}];
      for(const other of ids.filter(x=>x!==id)){const path=`../../public/assets/3d/${other}/structure-v1/`;const response=await fetch(path+'manifest.json',{cache:'no-store'});if(!response.ok)throw Error('并排清单读取失败 '+response.status);const meta=await response.json(),asset=await loader.loadAsync(path+'model.glb?sha256='+encodeURIComponent(meta.sha256));initializeLineupAsset(asset.scene,meta);if(token!==revision){dispose(asset.scene);return;}group.add(asset.scene);models.push({id:other,root:asset.scene,mf:meta});}
      if(models.some(item=>!['m','meter','meters'].includes(item.mf.units))){$('lineup').checked=false;await load(id);$('error').textContent='并排比较尚不可用：仍有资产未导出为米制，请完成第 2 轮生成后再检查。';return;}
      let x=0;const sizeData={};
      for(const item of models.sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id))){const box=visibleBounds(item.root),s=box.getSize(new THREE.Vector3());item.root.position.add(new THREE.Vector3(x-box.min.x,-box.min.y,-box.getCenter(new THREE.Vector3()).z));sizeData[item.id]=s.toArray();x+=s.x+.035;}
      canvas.dataset.lineupDimensions=JSON.stringify(sizeData);fit(group,new THREE.Vector3(.4,.65,1.8));
    }else{$('parts').hidden=false;$('motions').hidden=false;}
    for(const id of ['explode','transparent','accessory','isolate','illumination','opticalPath'])$(id).disabled=$('lineup').checked||(id==='transparent'&&!shells().length);
    canvas.dataset.lineup=String($('lineup').checked);canvas.dataset.loaded='true';
    $('status').textContent=$('lineup').checked?'四台同场景 · 原始米制比例':`${$('instrument').selectedOptions[0].textContent} · ${parts.length} 个部件 · 尺寸示意`;
    history.replaceState(null,'','#'+id);
  }catch(error){if(token!==revision)return;$('error').textContent='加载失败：'+error.message;$('status').textContent='显示静帧回退';$('fallback').style.display='block';canvas.style.display='none';canvas.dataset.error=String(error);}
}
$('instrument').onchange=()=>load($('instrument').value);$('lineup').onchange=()=>load($('instrument').value);
$('reset').onclick=()=>{if(!root)return;if($('lineup').checked)load($('instrument').value);else reset()};
$('illumination').onchange=()=>{chooseIllumination($('illumination').value);fitCurrent()};
for(const key of ['bottom','top','fiber'])$('light-'+key).onchange=()=>{illuminationState.sources[key]=$('light-'+key).checked;markCustomLighting()};
$('lightsOff').onclick=()=>{for(const key of ['bottom','top','fiber'])illuminationState.sources[key]=false;markCustomLighting()};
$('directLight').onchange=()=>{illuminationState.darkfieldStop=$('directLight').checked?'open':'closed';markCustomLighting()};
for(const [id,key] of [['insertDiffuser','diffuser'],['insertPolarizer','polarizer'],['insertAnalyzer','analyzer']])$(id).onchange=()=>{illuminationState[key]=$(id).checked?'in':'out';markCustomLighting()};
$('observation').onchange=()=>{updateLightingRig();if($('observation').checked){sampleViewActive=true;fitCurrent()}};
$('sampleView').onclick=()=>{if(!lightingRig)return;$('sampleVisible').checked=true;$('observation').checked=true;sampleViewActive=true;updateLightingRig();fitCurrent()};
$('instrumentView').onclick=()=>{sampleViewActive=false;$('observation').checked=false;updateLightingRig();fit(group,new THREE.Vector3(1.25,.85,1.5))};
$('sampleVisible').onchange=updateLightingRig;$('illuminationRays').onchange=updateLightingRig;
$('opticalPath').onchange=()=>{applyVisibility();fit(group)};
$('transparent').onchange=transparent;$('accessory').onchange=()=>{applyVisibility();fit(group)};
$('isolate').onclick=()=>{if(!root)return;isolated=!isolated;$('isolate').setAttribute('aria-pressed',String(isolated));select(selected||parts[0].id)};
$('explode').oninput=()=>{if(!root)return;applyTransforms();fit(isolated&&selected?byId(selected).obj:group)};
$('angles').onclick=e=>{const a=e.target.dataset.angle;if(!a||!root)return;const dirs={hero:[1.25,.85,1.5],front:[0,.05,1],side:[1,.05,0],top:[0,1,.001]};fit(group,new THREE.Vector3(...dirs[a]));};
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down;
canvas.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);
canvas.addEventListener('pointerup',e=>{if(!root||$('lineup').checked||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>4)return;const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(parts.filter(p=>!isolated||p.id===selected).map(p=>p.obj),true).filter(hit=>{for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;return true;});if(hits.length){let obj=hits[0].object;while(obj){const p=parts.find(p=>p.obj===obj);if(p){select(p.id);break}obj=obj.parent}}});
new ResizeObserver(()=>{renderer.setSize(view.clientWidth,view.clientHeight,false);camera.aspect=view.clientWidth/view.clientHeight;camera.updateProjectionMatrix();if(group)fitCurrent()}).observe(view);
function audit(){
  if(!group)return;const obj=isolated&&selected?byId(selected).obj:sampleViewActive&&lightingRig&&$('sampleVisible').checked&&Number($('explode').value)===0?lightingRig.sample:group,box=visibleBounds(obj);let max=0;
  camera.updateMatrixWorld();for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).project(camera);max=Math.max(max,Math.abs(p.x),Math.abs(p.y));}
  canvas.dataset.frameExtent=String(max);canvas.dataset.visibleMeshes=String((()=>{let n=0;group.traverseVisible(o=>{if(o.isMesh)n++});return n;})());
  canvas.dataset.partPositions=JSON.stringify(Object.fromEntries(parts.map(p=>[p.id,p.obj.position.toArray()])));
  canvas.dataset.cameraPosition=JSON.stringify(camera.position.toArray());canvas.dataset.cameraTarget=JSON.stringify(controls.target.toArray());
  canvas.dataset.morphWeights=JSON.stringify((()=>{const out={};root?.traverse(o=>{if(o.morphTargetInfluences)out[o.name]=o.morphTargetInfluences});return out;})());
}
function render(){frame++;controls.update();renderer.render(scene,camera);Object.assign(canvas.dataset,{frame:String(frame),geometries:String(renderer.info.memory.geometries),textures:String(renderer.info.memory.textures),triangles:String(renderer.info.render.triangles)});if(frame%15===0)audit();requestAnimationFrame(render)}
render();const id=location.hash.slice(1);if(ids.includes(id))$('instrument').value=id;load($('instrument').value);
