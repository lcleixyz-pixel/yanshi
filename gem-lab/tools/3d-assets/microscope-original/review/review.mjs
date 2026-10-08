import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { initialState, reduceState, deriveState } from './review-state.mjs';
import { createTeachingLighting } from './lighting.mjs';

const ASSET = '/assets-source/gem-microscope/original-design/2026-10-08/v1/';
const $ = id => document.getElementById(id), viewport = $('viewport');
$('manifestLink').href = ASSET + 'manifest.json'; $('modelLink').href = ASSET + 'model.glb';
$('fallback').src = ASSET + 'renders/hero.png';
const scene = new THREE.Scene(); scene.background = new THREE.Color('#f1f0e9');
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
catch (error) { $('loading').hidden = true; $('error').hidden = false; $('errorText').textContent = '当前浏览器无法建立三维绘图环境。下图为本次原创候选的静态预览。'; $('retry').onclick = () => location.reload(); throw error; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.autoClear = false; renderer.info.autoReset = false; viewport.prepend(renderer.domElement);
const canvas = renderer.domElement; canvas.setAttribute('aria-label', '原创宝石显微镜三维模型');
canvas.dataset.testid = 'original-microscope-canvas'; canvas.dataset.loaded = 'false'; canvas.tabIndex = 0;
const camera = new THREE.PerspectiveCamera(33, 1, .0001, 20);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.dampingFactor = .07;
const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer), environment = pmrem.fromScene(room, .04);
room.dispose(); pmrem.dispose(); scene.environment = environment.texture; scene.environmentIntensity = .43;
scene.add(new THREE.HemisphereLight(0xf2f7ed, 0x878b7b, .65));
for (const [position, intensity] of [[[.7, 1, 1.2], 2.0], [[-.9, .8, -.5], 1.1]]) {
  const light = new THREE.DirectionalLight(0xfff8ec, intensity); light.position.set(...position); scene.add(light);
}
let root, manifest, contract, tiltRig, focusRig, lighting, parts = [], state = initialState(), disposed = false, frame, loading = false;
const initialTransforms = new Map(), meshes = [], initialMaterials = new Map(), originalMaterials = new Set();
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
const chosen = () => parts.find(part => part.id === state.selectedId);
function track(object) { if (!initialTransforms.has(object)) initialTransforms.set(object, { position: object.position.clone(), quaternion: object.quaternion.clone() }); }
function visibleBounds(objects) {
  root.updateWorldMatrix(true, true); const box = new THREE.Box3();
  for (const object of Array.isArray(objects) ? objects : [objects]) object?.traverseVisible(child => {
    if (!child.isMesh) return;
    for (let p = child; p; p = p.parent) if (p.userData.reviewHelper) return;
    child.geometry.computeBoundingBox(); box.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld));
  });
  return box;
}
function fitBox(box, direction = new THREE.Vector3(1.22, .62, 1.65)) {
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere()), dir = direction.clone().normalize();
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
  const right = new THREE.Vector3().crossVectors(camera.up, dir).normalize(), up = new THREE.Vector3().crossVectors(dir, right).normalize();
  let distance = .01;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const point = new THREE.Vector3(x, y, z).sub(sphere.center);
    distance = Math.max(distance, point.dot(dir) + Math.max(Math.abs(point.dot(right)) / tanH, Math.abs(point.dot(up)) / tanV) * 1.18);
  }
  controls.target.copy(sphere.center); camera.position.copy(sphere.center).addScaledVector(dir, distance);
  camera.near = Math.max(.00001, distance / 2000); camera.far = 20; camera.updateProjectionMatrix();
  controls.minDistance = Math.max(.005, sphere.radius * .25); controls.maxDistance = 3; controls.update();
}
function fitView() {
  if (!root) return;
  if (state.isolated && chosen()) return fitBox(visibleBounds(chosen().object));
  if (state.viewMode === 'sample' && !deriveState(state).suspended) {
    lighting.sync(); return fitBox(new THREE.Box3().setFromObject(lighting.sample).expandByScalar(.003), new THREE.Vector3(.9, .42, 1));
  }
  if (state.viewMode === 'chamber') {
    const objects = parts.filter(part => part.group === 'illumination' || part.node === 'Part_Stage').map(part => part.object);
    const box = visibleBounds(objects);
    if (state.showRays && !deriveState(state).suspended) {
      const center = new THREE.Vector3(...contract.optics.observationEntrance); center.y += state.focusMeters;
      const spread = .09;
      for (const x of [-spread, spread]) for (const z of [-spread, spread]) box.expandByPoint(tiltRig.localToWorld(center.clone().add(new THREE.Vector3(x, 0, z))));
    }
    return fitBox(box, new THREE.Vector3(1.25, .55, 1.8));
  }
  fitBox(visibleBounds(root));
}
function applyState() {
  if (!root) return;
  const derived = deriveState(state);
  for (const [object, baseline] of initialTransforms) { object.position.copy(baseline.position); object.quaternion.copy(baseline.quaternion); }
  tiltRig.rotateOnAxis(new THREE.Vector3(...contract.rigs.tilt.axisLocal), THREE.MathUtils.degToRad(state.tiltDegrees));
  focusRig.position.addScaledVector(new THREE.Vector3(...contract.rigs.focus.axisLocal), state.focusMeters);
  root.getObjectByName(contract.controls.mode.node)?.rotateY(state.lastLitMode === 'brightfield' ? Math.PI / 2 : 0);
  root.getObjectByName(contract.controls.brightness.node)?.rotateY((state.brightness - .5) * Math.PI * 1.5);
  const shutter = contract.optics.darkfield.shutter;
  if (shutter) root.getObjectByName(shutter.node).position.add(new THREE.Vector3(...(state.mode === 'brightfield' ? shutter.openTranslation : shutter.closedTranslation)));
  for (const part of parts) part.object.position.addScaledVector(new THREE.Vector3(...(part.explodeOffset || [0, 0, 0])), state.explode);
  const selected = chosen()?.object;
  for (const mesh of meshes) {
    let belongs = false, allowed = true;
    for (let ancestor = mesh; ancestor && ancestor !== root; ancestor = ancestor.parent) {
      if (ancestor === selected) belongs = true;
      if (['Part_Sample', 'Part_SampleMarker', 'Sample_Proxy'].includes(ancestor.name)) allowed = false;
      if (parts.some(part => part.object === ancestor && part.defaultVisible === false)) allowed = false;
    }
    mesh.visible = allowed && (!state.isolated || belongs);
  }
  for (const [material, baseline] of initialMaterials) {
    material.opacity = baseline.opacity; material.transparent = baseline.transparent; material.depthWrite = baseline.depthWrite;
    if (material.color) material.color.copy(baseline.color);
    if (material.emissive) { material.emissive.copy(baseline.emissive); material.emissiveIntensity = baseline.emissiveIntensity; }
  }
  const powerIndicator = root.getObjectByName('Power_icon_arc') || root.getObjectByName('Power icon arc');
  powerIndicator?.traverse(child => { if (child.isMesh) for (const material of Array.isArray(child.material) ? child.material : [child.material]) if (material.color) {
    material.color.set(state.mode === 'off' ? 0x6b746e : 0x80ac84);
    if (material.emissive) { material.emissive.set(0x80ac84); material.emissiveIntensity = state.mode === 'off' ? 0 : .5; }
  }});
  if (state.cutaway && !state.isolated) for (const identifier of manifest.shellIds || []) {
    const object = parts.find(p => p.id === identifier || p.node === identifier)?.object || root.getObjectByName(identifier);
    object?.traverse(child => { if (child.isMesh) for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      material.opacity = .08; material.transparent = true; material.depthWrite = false;
    }});
  }
  for (const [name, active] of [[contract.optics.brightfield.emitterNode, derived.brightfieldActive], [contract.optics.darkfield.emitterNode, derived.darkfieldActive]]) {
    root.getObjectByName(name)?.traverse(child => { if (child.isMesh) for (const material of Array.isArray(child.material) ? child.material : [child.material]) if (material.emissive) {
      material.emissive.set(0xffedc6); material.emissiveIntensity = active ? 2.2 * state.brightness : 0;
    }});
  }
  root.updateWorldMatrix(true, true); lighting.update(state, derived);
  canvas.dataset.state = JSON.stringify(state); canvas.dataset.derived = JSON.stringify(derived);
  canvas.dataset.diagnostics = JSON.stringify({ ...lighting.diagnostics(), tiltRigPosition: tiltRig.position.toArray(), tiltRigQuaternion: tiltRig.quaternion.toArray(),
    focusRigPosition: focusRig.position.toArray(), shutterPosition: shutter ? root.getObjectByName(shutter.node).position.toArray() : null,
    partTransforms: parts.map(part => ({ id: part.id, position: part.object.position.toArray() })) });
  canvas.dataset.selectedPart = state.selectedId || '';
  for (const [id, value] of [['brightness', state.brightness * 100], ['tilt', state.tiltDegrees], ['focusPosition', state.focusMeters * 1000], ['explode', state.explode * 100]]) $(id).value = value;
  $('brightnessValue').value = Math.round(state.brightness * 100) + '%'; $('tiltValue').value = state.tiltDegrees + '°';
  $('focusValue').value = (state.focusMeters > 0 ? '+' : '') + Math.round(state.focusMeters * 1000) + ' mm'; $('explodeValue').value = Math.round(state.explode * 100) + '%';
  for (const id of ['showRays', 'showSample', 'cutaway']) $(id).checked = state[id];
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)));
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === state.viewMode)));
  $('parts').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.part === state.selectedId)));
  $('isolate').disabled = $('focusPart').disabled = !selected; $('isolate').setAttribute('aria-pressed', String(state.isolated)); $('isolate').textContent = state.isolated ? '显示全部' : '隔离所选';
  $('partNote').textContent = chosen() ? `${chosen().label} · ${chosen().note}` : '点选模型或部件名称，查看作用与位置。';
  $('lightingNote').textContent = derived.message;
  $('modeBadge').textContent = derived.suspended ? '光学示意已暂停' : ({ off: '底光关闭', darkfield: '暗域照明', brightfield: '明域照明' })[state.mode];
  const headings = { structure: ['01 / STRUCTURE', '结构，从整体开始。'], chamber: ['02 / ILLUMINATION', '两路底光，各有路径。'], sample: ['03 / SCATTERING', '光照变化，同一个散射体。'] };
  [$('viewIndex').textContent, $('viewTitle').textContent] = headings[state.viewMode];
  $('viewNote').textContent = derived.suspended ? derived.message : state.viewMode === 'sample'
    ? '固定散射体的外侧近景，不是目镜视野或真实宝石成像。夹具可能遮挡局部入射光；本近景未模拟夹具阴影。'
    : state.showRays ? '金色实线：出光后的简化路径；金色虚线：未改变方向的延伸；蓝色虚线：一条示例散射路径。蓝环为物镜接收区。'
    : '从底座、倾斜支架到双目观察组件，逐一查看部件之间的关系。内部为原创原理结构。';
}
function dispatch(event, fit = false) { if (!root) return; state = reduceState(state, event); applyState(); if (fit) fitView(); }
function select(id) { dispatch({ type: 'select', id }); if (chosen()) fitBox(visibleBounds(chosen().object)); }
document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => dispatch({ type: 'mode', value: button.dataset.mode }));
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => dispatch({ type: 'view', value: button.dataset.view }, true));
for (const [id, type, divisor] of [['brightness', 'brightness', 100], ['tilt', 'tilt', 1], ['focusPosition', 'focus', 1000], ['explode', 'explode', 100]]) {
  $(id).oninput = event => dispatch({ type, value: Number(event.target.value) / divisor }, type === 'explode');
}
for (const [id, type] of [['showRays', 'rays'], ['showSample', 'sample'], ['cutaway', 'cutaway']]) $(id).onchange = event => dispatch({ type, value: event.target.checked }, id === 'showRays' && state.viewMode === 'chamber');
$('isolate').onclick = () => dispatch({ type: 'isolate', value: !state.isolated }, true);
$('focusPart').onclick = () => { if (chosen()) fitBox(visibleBounds(chosen().object)); };
$('fit').onclick = () => { if (root) fitBox(visibleBounds(root)); }; $('reset').onclick = () => dispatch({ type: 'reset' }, true);
$('retry').onclick = () => location.reload();
let pointerStart;
canvas.addEventListener('pointerdown', event => { pointerStart = [event.clientX, event.clientY]; });
canvas.addEventListener('pointerup', event => {
  if (!root || !pointerStart || Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 5) return;
  const rect = canvas.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
  for (const hit of raycaster.intersectObjects(meshes.filter(mesh => mesh.visible), false)) for (let object = hit.object; object && object !== root; object = object.parent) {
    const part = parts.find(part => part.object === object);
    if (part) {
      if (!state.isolated && state.explode === 0 && part.node === contract.controls.power.node) return dispatch({ type: 'power' });
      if (!state.isolated && state.explode === 0 && part.node === contract.controls.mode.node) return dispatch({ type: 'cycleMode' });
      return select(part.id);
    }
  }
});
function resize() { const rect = viewport.getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); if (root) fitView(); }
const observer = new ResizeObserver(resize); observer.observe(viewport);
let frames = 0;
function animate() {
  if (disposed) return; frame = requestAnimationFrame(animate); controls.update(); renderer.info.reset(); renderer.clear(); renderer.render(scene, camera);
  if (lighting) { lighting.sync(); renderer.render(lighting.renderScene, camera); }
  if (++frames % 30 === 0) canvas.dataset.renderStats = JSON.stringify({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures });
}
function dispose() {
  if (disposed) return; disposed = true; cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); lighting?.dispose();
  const geos = new Set(), mats = new Set(originalMaterials), textures = new Set();
  root?.traverse(object => { if (object.geometry) geos.add(object.geometry); if (object.material) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
    mats.add(mat); for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
  }});
  geos.forEach(x => x.dispose()); mats.forEach(x => x.dispose()); textures.forEach(x => x.dispose()); environment.dispose(); renderer.dispose(); canvas.dataset.disposed = 'true';
}
function disposeUnattached(object) {
  const geos = new Set(), mats = new Set(), textures = new Set();
  object.traverse(child => { if (child.geometry) geos.add(child.geometry); if (child.material) for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
    mats.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
  }});
  geos.forEach(x => x.dispose()); mats.forEach(x => x.dispose()); textures.forEach(x => x.dispose());
}
window.addEventListener('pagehide', event => { if (event.persisted) cancelAnimationFrame(frame); else dispose(); });
window.addEventListener('pageshow', event => { if (event.persisted && !disposed) animate(); });
async function load() {
  if (loading) return; loading = true;
  try {
    const responses = await Promise.all([fetch(ASSET + 'manifest.json', { cache: 'no-store' }), fetch('../contract.json', { cache: 'no-store' })]);
    if (responses.some(response => !response.ok)) throw Error('资产清单或结构契约暂不可用');
    [manifest, contract] = await Promise.all(responses.map(response => response.json()));
    if (disposed) return;
    const gltf = await new GLTFLoader().loadAsync(ASSET + 'model.glb?sha=' + encodeURIComponent(manifest.modelSha256 || ''));
    if (disposed) { disposeUnattached(gltf.scene); return; }
    root = gltf.scene; scene.add(root);
    root.traverse(object => { if (!object.isMesh) return; meshes.push(object);
      const originals = Array.isArray(object.material) ? object.material : [object.material];
      const clones = originals.map(material => { originalMaterials.add(material); const clone = material.clone(); initialMaterials.set(clone, {
        opacity: clone.opacity, transparent: clone.transparent, depthWrite: clone.depthWrite, color: clone.color?.clone(), emissive: clone.emissive?.clone(), emissiveIntensity: clone.emissiveIntensity,
      }); return clone; }); object.material = Array.isArray(object.material) ? clones : clones[0];
    });
    tiltRig = root.getObjectByName(contract.rigs.tilt.node); focusRig = root.getObjectByName(contract.rigs.focus.node);
    if (!tiltRig || !focusRig) throw Error('模型缺少倾斜或升降组件'); track(tiltRig); track(focusRig);
    // The model contains a static sample for offline renders. The interactive page
    // replaces it with the separately lit fixed scatterer and lists instrument parts.
    parts = manifest.parts.filter(part => part.node !== 'Part_Sample').map(part => { const object = root.getObjectByName(part.node); if (!object) throw Error('缺少部件：' + part.node); track(object); return { ...part, object }; });
    const shutter = contract.optics.darkfield.shutter; if (shutter) { const object = root.getObjectByName(shutter.node); if (!object) throw Error('模型缺少中央快门'); track(object); }
    const labels = { base: '支撑', mechanics: '机械', optics: '观察', illumination: '照明', specimen: '样品' };
    for (const part of parts) { const button = document.createElement('button'); button.textContent = part.label; button.dataset.part = part.id; button.setAttribute('aria-pressed', 'false');
      const category = document.createElement('small'); category.textContent = labels[part.group] || '部件'; button.append(category); button.onclick = () => select(part.id); $('parts').append(button);
    }
    lighting = createTeachingLighting(tiltRig, contract); $('partCount').value = parts.length + ' 个部件';
    canvas.dataset.modelSha256 = manifest.modelSha256 || ''; canvas.dataset.modelsha = manifest.modelSha256 || ''; canvas.dataset.partCount = parts.length;
    canvas.dataset.units = 'metres'; applyState(); resize(); fitView(); $('loading').hidden = true; $('status').textContent = '原创教学候选 / 可交互'; canvas.dataset.loaded = 'true';
  } catch (error) { $('loading').hidden = true; $('error').hidden = false; $('errorText').textContent = String(error.message) + '。预览图仅表示本次原创候选的静态外观。'; canvas.dataset.error = String(error); console.error(error); }
}
resize(); animate(); load();
