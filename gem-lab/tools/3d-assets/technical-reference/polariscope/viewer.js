import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {PARTS, observationState} from './configuration.js';

const $=id=>document.getElementById(id);
const state={power:true,sample:false,exploded:false,angle:90,stageAngle:0,labels:false,selected:'analyzer'};
const loading=$('loading');
try { await start(); } catch(error) {
  loading.hidden=false; loading.className='error';
  loading.textContent='3D 预览未能加载。请使用支持 WebGL 2 的浏览器打开；仍可下载 GLB 模型。';
  document.body.dataset.ready='error';
  console.error(error);
}

async function start(){
  const viewport=$('viewport');
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setClearColor(0xeeeae1);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.1;
  viewport.appendChild(renderer.domElement);
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(34,1,.005,10);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true; controls.dampingFactor=.075;
  controls.minDistance=.24;controls.maxDistance=1.5;
  controls.maxPolarAngle=Math.PI*.49;
  controls.enablePan=false;
  const pmrem=new THREE.PMREMGenerator(renderer);
  const room=new RoomEnvironment();
  const environment=pmrem.fromScene(room,.035);
  scene.environment=environment.texture;
  scene.environmentIntensity=.85;
  room.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfffcf0,0x9faca1,1.5));
  const key=new THREE.DirectionalLight(0xfff4df,3.4);
  key.position.set(.3,.65,.32);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);
  Object.assign(key.shadow.camera,{left:-.35,right:.35,top:.5,bottom:-.35,near:.01,far:2});
  key.shadow.bias=-.0003;key.shadow.normalBias=.0008;
  scene.add(key);
  const fill=new THREE.DirectionalLight(0xe7f2ff,1.5);fill.position.set(-.4,.3,-.2);scene.add(fill);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xeeeae1,roughness:1}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.0006;ground.receiveShadow=true;scene.add(ground);
  const gltf=await new GLTFLoader().loadAsync('./polariscope.glb');
  const root=gltf.scene;scene.add(root);
  const parts={};
  root.traverse(o=>{if(o.userData.partId) parts[o.userData.partId]=o;if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  for(const {id} of PARTS) if(!parts[id]) throw new Error(`Missing part ${id}`);
  const original={};for(const {id} of PARTS) original[id]=parts[id].position.clone();
  const emissive=[];
  parts.light.traverse(o=>{if(o.isMesh&&o.material.emissive&&o.material.emissive.getHex()!==0) emissive.push({material:o.material,intensity:o.material.emissiveIntensity});});
  const raycaster=new THREE.Raycaster();
  const pointer=new THREE.Vector2();let down=null;
  const outline=new THREE.BoxHelper(parts.analyzer,0x6f8d66);outline.visible=false;scene.add(outline);
  const lightPath=new THREE.Group();lightPath.name='IllustrativeLightPath';scene.add(lightPath);
  const axisMaterial=new THREE.LineDashedMaterial({color:0x9ca88c,dashSize:.004,gapSize:.003,transparent:true,opacity:.7});
  const axis=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,.053,0),new THREE.Vector3(0,.31,0)]),axisMaterial);axis.computeLineDistances();lightPath.add(axis);
  const lowerArrow=new THREE.ArrowHelper(new THREE.Vector3(0,1,0),new THREE.Vector3(0,.12,0),.10,0xa7b78d,.013,.006);lightPath.add(lowerArrow);
  // A single upward arrow only indicates the illumination axis, not ray tracing.
  const labels={};
  for(const [i,part] of PARTS.entries()){
    const button=document.createElement('button');button.className='part-button';button.dataset.part=part.id;
    const number=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');button.append(number,document.createTextNode(part.label));
    button.addEventListener('click',()=>select(part.id));$('part-list').appendChild(button);
    const label=document.createElement('div');label.className='label';label.textContent=part.label;label.hidden=true;$('labels').appendChild(label);labels[part.id]=label;
  }
  function select(id){
    state.selected=id;const part=PARTS.find(p=>p.id===id);
    $('part-name').textContent=part.title;$('part-description').textContent=part.description;
    document.querySelectorAll('.part-button').forEach(b=>{b.classList.toggle('active',b.dataset.part===id);b.setAttribute('aria-pressed',String(b.dataset.part===id));});
    outline.setFromObject(parts[id]);outline.visible=state.labels&&parts[id].visible;
  }
  function resetCamera(){
    controls.target.set(0,state.exploded?.19:.12,0);
    const mobile=viewport.clientWidth<700;
    camera.position.set(mobile?.39:.40,state.exploded?.41:.34,mobile?.53:.52);
    if(state.exploded) camera.position.multiplyScalar(1.18);
    controls.update();
  }
  function apply(){
    parts.analyzer.rotation.y=THREE.MathUtils.degToRad(state.angle);
    parts.stage.rotation.y=THREE.MathUtils.degToRad(state.stageAngle);
    parts.sample.rotation.y=THREE.MathUtils.degToRad(state.stageAngle);
    parts.sample.visible=state.sample;
    emissive.forEach(({material,intensity})=>{material.emissiveIntensity=state.power?intensity:0;});
    lightPath.visible=state.power&&!state.sample&&!state.exploded;
    $('analyzer-value').textContent=`${state.angle}°`;$('analyzer-angle').value=String(state.angle);
    $('stage-value').textContent=`${state.stageAngle}°`;
    $('assemble').classList.toggle('active',!state.exploded);$('explode').classList.toggle('active',state.exploded);
    $('assemble').setAttribute('aria-pressed',String(!state.exploded));$('explode').setAttribute('aria-pressed',String(state.exploded));
    $('view-status').textContent=state.exploded?'拆解视图 · 光路已暂停':'装配视图';
    const observation=observationState(state);
    $('field-title').textContent=observation.title;$('field-note').textContent=observation.note;
    const level=observation.ratio===null?null:Math.round(10+observation.ratio*211);
    $('field').style.background=level===null?(observation.mode==='off'?'#050704':'repeating-linear-gradient(135deg,#444c40 0px,#444c40 4px,#697360 4px,#697360 5px)'):`rgb(${level} ${Math.min(level+7,255)} ${Math.max(level-9,0)})`;
    $('field').dataset.mode=observation.mode;
    $('field').dataset.ratio=observation.ratio===null?'':String(observation.ratio);
    select(state.selected);
  }
  $('analyzer-angle').addEventListener('input',e=>{state.angle=Number(e.target.value);apply();});
  $('stage-angle').addEventListener('input',e=>{state.stageAngle=Number(e.target.value);apply();});
  $('parallel').addEventListener('click',()=>{state.angle=0;apply();});
  $('crossed').addEventListener('click',()=>{state.angle=90;apply();});
  $('sample').addEventListener('change',e=>{state.sample=e.target.checked;apply();});
  $('power').addEventListener('change',e=>{state.power=e.target.checked;apply();});
  function explode(value){state.exploded=value;apply();resetCamera();}
  $('assemble').addEventListener('click',()=>explode(false));$('explode').addEventListener('click',()=>explode(true));
  $('reset-camera').addEventListener('click',resetCamera);
  $('toggle-labels').addEventListener('click',()=>{state.labels=!state.labels;$('toggle-labels').setAttribute('aria-pressed',String(state.labels));$('toggle-labels').textContent=state.labels?'隐藏标注':'显示标注';select(state.selected);});
  renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5) return;
    const rect=renderer.domElement.getBoundingClientRect();
    pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    const visibleParts=Object.values(parts).filter(p=>p.visible);
    const hit=raycaster.intersectObjects(visibleParts,true)[0];
    if(hit){let object=hit.object;while(object&&!object.userData.partId)object=object.parent;if(object) select(object.userData.partId);}
    down=null;
  });
  const resize=new ResizeObserver(()=>{const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});resize.observe(viewport);
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let mix=0,last=performance.now();const target=new THREE.Vector3();
  function frame(now){
    const dt=Math.min((now-last)/1000,.1);last=now;
    const desired=state.exploded?1:0;
    mix=reduced?desired:THREE.MathUtils.lerp(mix,desired,1-Math.exp(-dt*7));
    for(const {id,offset} of PARTS){
      parts[id].position.copy(original[id]).addScaledVector(target.fromArray(offset),mix);
    }
    controls.update();root.updateMatrixWorld(true);
    if(outline.visible) outline.setFromObject(parts[state.selected]);
    for(const {id} of PARTS){
      const label=labels[id];label.hidden=!state.labels||!parts[id].visible;
      if(label.hidden) continue;
      const box=new THREE.Box3().setFromObject(parts[id]);box.getCenter(target);
      target.x+=id==='conoscope'?-.025:.043;
      target.project(camera);
      label.hidden=target.z< -1||target.z>1;
      label.style.left=`${(target.x*.5+.5)*viewport.clientWidth}px`;
      label.style.top=`${(-target.y*.5+.5)*viewport.clientHeight}px`;
    }
    renderer.render(scene,camera);
  }
  apply();resetCamera();renderer.setAnimationLoop(frame);
  loading.hidden=true;document.body.dataset.ready='true';
  document.addEventListener('visibilitychange',()=>{renderer.setAnimationLoop(document.hidden?null:frame);last=performance.now();});
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();loading.hidden=false;loading.textContent='图形上下文已暂停，请刷新恢复预览。';});
  // Read-only snapshot for the local verification harness.
  window.assetPreview={snapshot:()=>({ ...state, observation:observationState(state),partCount:Object.keys(parts).length,triangles:renderer.info.render.triangles,explodeProgress:mix,analyzerRadians:parts.analyzer.rotation.y,stageRadians:parts.stage.rotation.y,sampleVisible:parts.sample.visible,lightPathVisible:lightPath.visible })};
}
