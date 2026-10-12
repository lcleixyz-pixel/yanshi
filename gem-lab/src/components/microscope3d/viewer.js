// Three.js viewer for the KSW6000 microscope with three-way lighting (top / bottom / side).
// Ported from tools/3d-assets/microscope-ksw-lighting-v3/review/review.mjs; the page UI is React,
// this module owns the scene, camera, picking and the optical state machine.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { initialState, reduceState, deriveState } from './reviewState.js';
import { createTeachingLighting } from './bottomLighting.js';
import { createIncidentLighting } from './incidentLighting.js';

export function createMicroscopeViewer({ container, assetBase, onChange, camera: initialCamera }) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e4eaec');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.localClippingEnabled = true; renderer.autoClear = false; renderer.info.autoReset = false;
  container.prepend(renderer.domElement);
  const canvas = renderer.domElement; canvas.dataset.testid = 'microscope3d-canvas'; canvas.setAttribute('aria-label', '宝石显微镜三路照明三维教学模型');
  canvas.tabIndex = 0; canvas.dataset.loaded = 'false'; canvas.className = 'mic-explore__canvas';
  const camera = new THREE.PerspectiveCamera(36, 1, .0001, 50);
  const controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
  const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer), environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture; scene.environmentIntensity = .32;
  room.dispose(); pmrem.dispose();
  const studioLights = [];
  const hemi = new THREE.HemisphereLight(0xe8f4ff, 0x78828a, .28); scene.add(hemi);
  for (const [position, intensity] of [[[1.5, 2.5, 3], 1.0], [[-2, 1.4, -1.8], .45]]) {
    const light = new THREE.DirectionalLight(0xffffff, intensity); light.position.set(...position); scene.add(light); studioLights.push(light);
  }
  let manifest, root, parts = [], rig, incident, state = initialState(), disposed = false, animationFrame;
  const starts = new Map(), materialDefaults = new Map(), assetMeshes = [], materialCopies = new Set();
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const selectedPart = () => parts.find(part => part.id === state.selectedId);
  let irisControl, irisHandle, modeControl;

  function emit(extra = {}) {
    if (!manifest || disposed) return;
    const derived = deriveState(state, manifest), part = selectedPart();
    onChange?.({ status: 'ready', state, derived, parts: parts.map(({ id, label, note }) => ({ id, label, note, exterior: id.startsWith('tripo_') })),
      selected: part ? { id: part.id, label: part.label, note: part.note } : null, ...extra });
  }
  function prepareControls() {
    irisControl = root.getObjectByName(manifest.controls.irisControlRingNode);
    irisHandle = root.getObjectByName(manifest.controls.irisHandleNode);
    modeControl = root.getObjectByName(manifest.controls.modeNode);
    if (!irisControl || !irisHandle || !modeControl) throw Error('缺少实体光阑或模式控制部件');
    for (const object of [irisControl, modeControl]) if (!starts.has(object)) starts.set(object, { position: object.position.clone(), quaternion: object.quaternion.clone() });
  }
  function rotateInAssetCoordinates(object, pivot, axis, radians) {
    object.updateWorldMatrix(true, true);
    const point = new THREE.Vector3(...pivot).applyMatrix4(root.matrixWorld);
    const worldAxis = new THREE.Vector3(...axis).transformDirection(root.matrixWorld);
    const rotation = new THREE.Matrix4().makeRotationAxis(worldAxis, radians);
    const transform = new THREE.Matrix4().makeTranslation(...point.toArray()).multiply(rotation)
      .multiply(new THREE.Matrix4().makeTranslation(-point.x, -point.y, -point.z));
    const local = new THREE.Matrix4().copy(object.parent.matrixWorld).invert().multiply(transform).multiply(object.matrixWorld);
    local.decompose(object.position, object.quaternion, object.scale);
  }
  function applyControlTransforms() {
    const c = manifest.controls;
    const irisDegrees = c.irisAngleRangeDegrees[0] + (c.irisAngleRangeDegrees[1] - c.irisAngleRangeDegrees[0]) * (1 - state.irisOpen);
    const modeDegrees = c.modeAngleRangeDegrees[state.field === 'brightfield' ? 1 : 0];
    rotateInAssetCoordinates(irisControl, c.irisPivot, c.irisRotationAxis, THREE.MathUtils.degToRad(irisDegrees));
    rotateInAssetCoordinates(modeControl, c.modePivot, c.modeRotationAxis, THREE.MathUtils.degToRad(modeDegrees));
  }
  function visibleBounds(objects) {
    root.updateWorldMatrix(true, true); const box = new THREE.Box3();
    for (const object of Array.isArray(objects) ? objects : [objects]) {
      if (!object) continue;
      object.traverseVisible(child => {
        if (!child.isMesh) return;
        for (let parent = child; parent; parent = parent.parent) if (parent.userData.reviewHelper) return;
        child.geometry.computeBoundingBox(); box.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld));
      });
    }
    return box;
  }
  function fitBox(box, direction) {
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere()), vector = direction?.clone() || camera.position.clone().sub(controls.target);
    if (vector.lengthSq() < 1e-8) vector.set(1.4, .75, 1.65);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
    vector.normalize();
    const right = new THREE.Vector3().crossVectors(camera.up, vector).normalize(), upright = new THREE.Vector3().crossVectors(vector, right).normalize();
    // Fit projected box corners so a tall instrument fills a portrait viewport.
    let distance = .001;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const offset = new THREE.Vector3(x, y, z).sub(sphere.center);
      distance = Math.max(distance, offset.dot(vector) + Math.max(Math.abs(offset.dot(right)) / tanH, Math.abs(offset.dot(upright)) / tanV) * 1.12);
    }
    controls.target.copy(sphere.center); camera.position.copy(sphere.center).addScaledVector(vector, distance);
    camera.near = Math.max(.00001, distance / 1500); camera.far = Math.max(10, distance * 20); camera.updateProjectionMatrix();
    controls.minDistance = Math.max(.001, sphere.radius * .1); controls.maxDistance = Math.max(2, distance * 20); controls.update();
  }
  function fitView(mode = state.viewMode) {
    if (!root) return;
    if (state.isolated && selectedPart()) return fitBox(visibleBounds(selectedPart().object));
    if (mode === 'sample' && !deriveState(state, manifest).suspended) {
      root.updateWorldMatrix(true, true); rig.sync();
      fitBox(new THREE.Box3().setFromObject(rig.sample).expandByScalar(manifest.sampleRadius * .8), new THREE.Vector3(.8, .5, .75));
    } else if (mode === 'chamber') {
      if (state.explode > .001) return fitBox(visibleBounds(root), new THREE.Vector3(.55, .46, 1.6));
      // Keep the lamp chamber large; the receiver stays a local endpoint explanation.
      const center = new THREE.Vector3(...manifest.chamberReview.center), radius = manifest.chamberReview.radius;
      const top = state.showRays ? manifest.samplePosition[1] + .04 : manifest.optics.irisCenter[1] + .026;
      const box = new THREE.Box3(new THREE.Vector3(center.x - radius, manifest.optics.sourcePosition[1] - .018, center.z - radius),
        new THREE.Vector3(center.x + radius, top, center.z + radius));
      box.applyMatrix4(root.matrixWorld);
      fitBox(box, new THREE.Vector3(.55, .46, 1.6));
    } else fitBox(visibleBounds(root), new THREE.Vector3(1.3, .72, 1.8));
  }
  function assetOffsetForParent(object, array) {
    const transform = new THREE.Matrix4().copy(object.parent.matrixWorld).invert().multiply(root.matrixWorld);
    return new THREE.Vector3(...array).applyMatrix4(transform).sub(new THREE.Vector3().applyMatrix4(transform));
  }
  function applyState() {
    if (!root) return;
    const derived = deriveState(state, manifest);
    for (const [object, start] of starts) { object.position.copy(start.position); object.quaternion.copy(start.quaternion); }
    root.updateWorldMatrix(true, true);
    const stop = root.getObjectByName(manifest.centralCone.node);
    if (derived.coneOpen) stop.position.add(assetOffsetForParent(stop, manifest.centralCone.openOffset));
    applyControlTransforms();
    for (const name of manifest.iris.bladeNodes) {
      const object = root.getObjectByName(name), index = object.morphTargetDictionary[manifest.iris.morphTarget];
      object.morphTargetInfluences[index] = 1 - state.irisOpen;
    }
    for (const part of parts) part.object.position.add(assetOffsetForParent(part.object, part.explodeOffset.map(value => value * state.explode)));
    const chosen = selectedPart()?.object;
    for (const mesh of assetMeshes) {
      let belongs = false, defaultVisible = true;
      for (let ancestor = mesh; ancestor && ancestor !== root; ancestor = ancestor.parent) {
        if (ancestor === chosen) belongs = true;
        const owner = parts.find(part => part.object === ancestor); if (owner?.defaultVisible === false) defaultVisible = false;
        if (owner && state.viewMode === 'chamber' && !state.isolated && owner.id.startsWith('tripo_') && !manifest.chamberReview.retainCloudNodes.includes(owner.node)) defaultVisible = false;
      }
      mesh.visible = defaultVisible && (!state.isolated || belongs);
    }
    for (const [material, original] of materialDefaults) {
      material.opacity = original.opacity; material.transparent = original.transparent; material.depthWrite = original.depthWrite;
      material.clippingPlanes = null; material.clipShadows = false;
      if (material.emissive) { material.emissiveIntensity = original.emissiveIntensity; material.emissive.copy(original.emissive); }
      if ('envMapIntensity' in material) material.envMapIntensity = original.envMapIntensity;
    }
    if (state.cutaway && !state.isolated) {
      const config = manifest.chamberReview.cutPlane;
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...config.normal), new THREE.Vector3(...config.point)).applyMatrix4(root.matrixWorld);
      for (const id of [...manifest.shellIds, manifest.optics.outerReflector.node]) {
        const object = parts.find(part => part.id === id || part.node === id)?.object || root.getObjectByName(id);
        object?.traverse(child => { if (!child.isMesh) return; for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
          material.clippingPlanes = [plane]; material.clipShadows = false;
        }});
      }
    }
    scene.environmentIntensity = state.viewMode === 'chamber' ? .24 : .32;
    hemi.intensity = state.viewMode === 'chamber' ? .46 : .28;
    studioLights.forEach((light, i) => { light.intensity = state.viewMode === 'chamber' ? (i === 0 ? 1.3 : .60) : (i === 0 ? 1 : .45); });
    for (const [name, gain] of [[manifest.lampEmitterNode, 2.5], [manifest.collimatorExitNode, 1.5]]) {
      root.getObjectByName(name)?.traverse(object => {
        if (!object.isMesh) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material.emissive) {
          // The exit face depicts the transmitted source brightness, not another lamp.
          material.emissive.setRGB(1, .90, .75); material.emissiveIntensity = derived.illuminationActive ? gain * state.brightness : 0;
        }
      });
    }
    for (const name of [manifest.optics.coneReflector.node, manifest.optics.outerReflector.node]) root.getObjectByName(name)?.traverse(object => {
      if (!object.isMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material.emissive) {
        material.emissiveIntensity = 0;
        // Constant web roughness widens the highlight for the section camera; never mode-dependent.
        material.roughness = .34;
        if (state.viewMode === 'chamber' && !derived.suspended) material.envMapIntensity *= .15;
      }
    });
    rig.update(state, derived); incident.update(state, derived); root.updateWorldMatrix(true, true);
    canvas.dataset.state = JSON.stringify(state); canvas.dataset.derived = JSON.stringify(derived);
    canvas.dataset.incident = JSON.stringify(incident.diagnostics());
    canvas.dataset.illumination = JSON.stringify(rig.diagnostics());
    canvas.dataset.selectedPart = state.selectedId || '';
  }
  function dispatch(event, focus = false) {
    if (!manifest) return;
    state = reduceState(state, event); applyState();
    if (focus) fitView();
    emit();
  }
  function select(id) {
    const part = parts.find(item => item.id === id);
    if (state.viewMode === 'chamber' && part?.id.startsWith('tripo_') && !manifest.chamberReview.retainCloudNodes.includes(part.node)) dispatch({ type: 'view', value: 'structure' });
    dispatch({ type: 'select', id });
    if (selectedPart()) fitBox(visibleBounds(selectedPart().object));
  }
  function focusSelected() { if (selectedPart()) fitBox(visibleBounds(selectedPart().object)); }

  let pointerStart, irisDrag = null;
  function pick(event) {
    if (!root) return null;
    const rect = canvas.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects(assetMeshes.filter(object => object.visible), false)) {
      const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face?.materialIndex || 0] : hit.object.material;
      if (material.clippingPlanes?.some(plane => plane.distanceToPoint(hit.point) < 0)) continue;
      let part, control;
      for (let object = hit.object; object && object !== root; object = object.parent) {
        if (object === irisHandle || object === irisControl) control = 'iris';
        if (object === modeControl) control = 'mode';
        part ||= parts.find(item => item.object === object);
      }
      return { part, control };
    }
    return null;
  }
  const onPointerDown = event => {
    pointerStart = [event.clientX, event.clientY];
    const hit = pick(event);
    if (hit?.control !== 'iris' || deriveState(state, manifest).suspended) return;
    event.preventDefault(); event.stopImmediatePropagation();
    irisDrag = { x: event.clientX, open: state.irisOpen, pointerId: event.pointerId };
    controls.enabled = false; canvas.setPointerCapture(event.pointerId);
  };
  const onPointerMove = event => {
    if (!irisDrag) return;
    event.preventDefault(); event.stopImmediatePropagation();
    dispatch({ type: 'iris', value: irisDrag.open + (event.clientX - irisDrag.x) / 190 });
  };
  function finishIrisDrag(event) {
    if (!irisDrag) return false;
    event?.preventDefault?.(); event?.stopImmediatePropagation?.();
    if (canvas.hasPointerCapture(irisDrag.pointerId)) canvas.releasePointerCapture(irisDrag.pointerId);
    irisDrag = null; controls.enabled = true; return true;
  }
  const onPointerUp = event => {
    if (finishIrisDrag(event)) return;
    if (!root || !pointerStart || Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 5) return;
    const hit = pick(event); if (!hit) return;
    if (hit.control === 'mode' && !deriveState(state, manifest).suspended) return dispatch({ type: 'toggleField' });
    if (hit.part) select(hit.part.id);
  };
  const onBlur = () => finishIrisDrag();
  canvas.addEventListener('pointerdown', onPointerDown, { capture: true });
  canvas.addEventListener('pointermove', onPointerMove, { capture: true });
  canvas.addEventListener('pointerup', onPointerUp, { capture: true });
  canvas.addEventListener('pointercancel', finishIrisDrag, { capture: true });
  window.addEventListener('blur', onBlur);

  function resize() {
    const rect = container.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    rig?.setResolution(rect.width, rect.height); incident?.setResolution(rect.width, rect.height);
    camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); if (root) fitView();
  }
  const observer = new ResizeObserver(resize); observer.observe(container);
  function animate() {
    if (disposed) return; animationFrame = requestAnimationFrame(animate); if (!irisDrag) controls.update();
    renderer.info.reset(); renderer.clear();
    if (rig) rig.prepareReflectorPass();
    renderer.render(scene, camera);
    if (rig) { rig.restoreReflectorObjects(); renderer.render(rig.reflectorScene, camera); renderer.render(rig.outerReflectorScene, camera); }
    // Do not clear depth: instrument surfaces continue to occlude the registered sample.
    if (rig) { rig.sync(); renderer.render(rig.renderScene, camera); }
  }
  function dispose() {
    if (disposed) return; disposed = true;
    cancelAnimationFrame(animationFrame); observer.disconnect(); controls.dispose();
    canvas.removeEventListener('pointerdown', onPointerDown, { capture: true }); canvas.removeEventListener('pointermove', onPointerMove, { capture: true });
    canvas.removeEventListener('pointerup', onPointerUp, { capture: true }); canvas.removeEventListener('pointercancel', finishIrisDrag, { capture: true });
    window.removeEventListener('blur', onBlur);
    incident?.dispose(); rig?.dispose();
    const geo = new Set(), mats = new Set(), textures = new Set();
    root?.traverse(object => { if (object.geometry) geo.add(object.geometry); if (object.material) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
      mats.add(mat); for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
    }});
    materialCopies.forEach(mat => mats.add(mat)); geo.forEach(item => item.dispose()); mats.forEach(item => item.dispose()); textures.forEach(item => item.dispose());
    if (root) scene.remove(root);
    environment.dispose(); renderer.dispose(); canvas.remove();
  }
  async function load() {
    try {
      onChange?.({ status: 'loading' });
      const response = await fetch(assetBase + 'manifest.json'); if (!response.ok) throw Error('资产清单读取失败 ' + response.status);
      const loadedManifest = await response.json();
      const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(assetBase + 'model.glb?sha=' + encodeURIComponent(loadedManifest.modelSha256 || ''));
      if (disposed) return;
      manifest = loadedManifest; root = gltf.scene; scene.add(root);
      root.traverse(object => {
        if (!object.isMesh) return;
        assetMeshes.push(object);
        const originals = Array.isArray(object.material) ? object.material : [object.material];
        const clones = originals.map(original => { materialCopies.add(original); const mat = original.clone(); materialDefaults.set(mat, { opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite, emissive: mat.emissive?.clone(), emissiveIntensity: mat.emissiveIntensity || 0, envMapIntensity: mat.envMapIntensity ?? 1 }); return mat; });
        object.material = Array.isArray(object.material) ? clones : clones[0];
      });
      parts = manifest.parts.map(part => {
        const object = root.getObjectByName(part.node); if (!object) throw Error('缺少部件节点：' + part.node);
        starts.set(object, { position: object.position.clone(), quaternion: object.quaternion.clone() });
        return { ...part, note: part.node === 'outerReflector' ? '把水平径向光再次反射到样品；该曲面为教学设定，未按厂家尺寸标定。' : part.note,
          object, explodeOffset: part.explodeOffset || [0, 0, 0] };
      });
      for (const name of manifest.iris.bladeNodes) {
        const blade = root.getObjectByName(name), index = blade?.morphTargetDictionary?.[manifest.iris.morphTarget];
        if (!Number.isInteger(index) || !blade.morphTargetInfluences) throw Error('缺少光阑形态目标：' + name);
      }
      if (!root.getObjectByName(manifest.centralCone.node)) throw Error('缺少中央切换锥体');
      prepareControls();
      // Internal teaching parts first, so the illumination discussion does not bury them below the exterior.
      parts.sort((a, b) => Number(a.id.startsWith('tripo_')) - Number(b.id.startsWith('tripo_')));
      rig = createTeachingLighting(root, manifest); incident = createIncidentLighting(root, manifest, rig.litGroup);
      canvas.dataset.modelSha256 = manifest.modelSha256 || ''; canvas.dataset.partCount = String(parts.length);
      applyState(); resize(); fitView();
      if (initialCamera?.length === 6 && initialCamera.every(Number.isFinite)) {
        camera.position.copy(root.localToWorld(new THREE.Vector3(...initialCamera.slice(0, 3)))); controls.target.copy(root.localToWorld(new THREE.Vector3(...initialCamera.slice(3))));
        camera.near = .0005; camera.updateProjectionMatrix(); controls.update();
      }
      canvas.dataset.loaded = 'true'; emit();
    } catch (error) {
      if (disposed) return;
      canvas.dataset.error = String(error); console.error(error);
      onChange?.({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }
  resize(); animate(); load();
  return { dispatch, select, focusSelected, fit: () => fitView(), dispose };
}
