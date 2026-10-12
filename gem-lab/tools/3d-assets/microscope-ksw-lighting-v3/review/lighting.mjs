import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/** Two-reflection teaching approximation; no manufacturer internal claim. */
export function createTeachingLighting(root, manifest) {
  const optics = manifest.optics, sampleRadius = manifest.sampleRadius;
  const center = new THREE.Vector3(...manifest.samplePosition), objective = new THREE.Vector3(...optics.objectiveCenter);
  const source = new THREE.Vector3(...optics.sourcePosition), exit = new THREE.Vector3(...optics.collimatorExit), axis = new THREE.Vector3(...optics.axis).normalize();
  const group = new THREE.Group(); group.name = 'TwoReflectionPaths'; group.userData.reviewHelper = true; root.add(group);
  const structuralLights = new THREE.Group(); structuralLights.name = 'CavityLightingApproximation'; structuralLights.userData.reviewHelper = true; root.add(structuralLights);
  const renderScene = new THREE.Scene(); renderScene.background = null; renderScene.environment = null;
  const litGroup = new THREE.Group(); litGroup.matrixAutoUpdate = false; renderScene.add(litGroup);
  const reflectorScene = new THREE.Scene(); reflectorScene.background = null; reflectorScene.environment = null;
  const outerReflectorScene = new THREE.Scene(); outerReflectorScene.background = null; outerReflectorScene.environment = null;
  const reflectorLightGroup = new THREE.Group(); reflectorLightGroup.matrixAutoUpdate = false; reflectorScene.add(reflectorLightGroup);
  const outerLightGroup = new THREE.Group(); outerLightGroup.matrixAutoUpdate = false; outerReflectorScene.add(outerLightGroup);
  const reflectorProxies = [], reflectorLightCopies = [];
  const geometries = new Set(), materials = new Set(), lights = [], structureEntries = [], outerOnlyEntries = [], representativePaths = [];
  const geometry = value => { geometries.add(value); return value; }, material = value => { materials.add(value); return value; };
  const sample = new THREE.Group(); sample.name = 'FixedScatteringSample'; sample.position.copy(center); litGroup.add(sample);
  const shellMat = material(new THREE.MeshPhysicalMaterial({ color: 0xb9d8df, roughness: .5, metalness: 0,
    opacity: .17, transparent: true, depthWrite: false, side: THREE.DoubleSide, flatShading: true, envMapIntensity: .2 }));
  const shell = new THREE.Mesh(geometry(new THREE.IcosahedronGeometry(sampleRadius, 0)), shellMat);
  shell.scale.y = .85; shell.rotation.set(.14, .26, .1); shell.name = 'SampleEnvelope'; sample.add(shell);
  const grainGeo = geometry(new THREE.IcosahedronGeometry(1, 1));
  const grainMat = material(new THREE.MeshStandardMaterial({ color: 0xeee5c8, roughness: .75, envMapIntensity: .1 }));
  const needleGeo = geometry(new THREE.CylinderGeometry(1, 1, 1, 8));
  const needleMat = material(new THREE.MeshStandardMaterial({ color: 0xc5b185, metalness: .12, roughness: .52, envMapIntensity: .1 }));
  for (let i = 0; i < 20; i++) {
    const phi = i * 2.3999632, y = ((i * 7) % 19) / 9 - 1, r = .58 * sampleRadius * Math.sqrt(Math.max(0, 1 - y * y));
    const mesh = new THREE.Mesh(grainGeo, grainMat); mesh.name = 'SampleGrain_' + i;
    mesh.position.set(Math.cos(phi) * r, y * sampleRadius * .57, Math.sin(phi) * r);
    mesh.scale.setScalar(sampleRadius * (.055 + (i % 3) * .013)); sample.add(mesh);
  }
  for (let i = 0; i < 5; i++) {
    const mesh = new THREE.Mesh(needleGeo, needleMat); mesh.name = 'SampleNeedle_' + i;
    mesh.position.set(Math.sin(i * 2.1) * sampleRadius * .3, (i - 2) * sampleRadius * .1, Math.cos(i * 1.7) * sampleRadius * .3);
    mesh.scale.set(sampleRadius * .022, sampleRadius * (.6 + i * .065), sampleRadius * .022);
    mesh.rotation.set(.6 + i * .44, i * .34, .5 + i * .6); sample.add(mesh);
  }

  function line(id, points, color, dashed = false) {
    const mat = material(new LineMaterial({ color, linewidth: dashed ? 2.5 : 3.1, opacity: .96, transparent: true, depthWrite: false,
      dashed, dashSize: .004, gapSize: .003, toneMapped: false, worldUnits: false }));
    const item = new Line2(geometry(new LineGeometry().setPositions(points.flatMap(point => point.toArray()))), mat); item.name = id;
    item.computeLineDistances(); group.add(item); return item;
  }
  const allRays = optics.twoReflectionPaths;
  const irisMeshes = [], apertureRaycaster = new THREE.Raycaster();
  for (const name of [...manifest.iris.bladeNodes, 'irisCarrier']) root.getObjectByName(name)?.traverse(object => { if (object.isMesh) irisMeshes.push(object); });
  // Four azimuths from a middle radial band keep both reflections legible.
  const radialValues = [...new Set(allRays.map(ray => ray.beamRadius))].sort((a,b) => a-b);
  const middleRadius = radialValues[Math.floor(radialValues.length / 2)];
  const band = allRays.map((ray, index) => ({ ray, index })).filter(item => item.ray.beamRadius === middleRadius);
  const representatives = [0, 1, 2, 3].map(i => band[Math.floor(i * band.length / 4)]);
  let minimumClearance = Infinity;
  for (let i = 0; i < allRays.length; i += 3) {
    const spec = allRays[i], position = new THREE.Vector3(...spec.outerPoint), direction = center.clone().sub(position).normalize();
    const nearest = objective.clone().addScaledVector(axis, Math.min(0, ...(optics.focusRange || [0]))), toPupil = nearest.sub(position);
    const accept = Math.asin(Math.min(.99, optics.objectiveRadius / toPupil.length()));
    const limit = direction.angleTo(toPupil) - accept - THREE.MathUtils.degToRad(.5);
    if (!(limit > .001)) throw Error('双反射斜光不能避开观察入口');
    const angle = Math.min(Math.asin(Math.min(.95, sampleRadius / center.distanceTo(position))), limit);
    minimumClearance = Math.min(minimumClearance, direction.angleTo(toPupil) - accept - angle);
    const lamp = new THREE.SpotLight(0xffedd1, 0, 0, angle, .15, 2); lamp.position.copy(position); lamp.target.position.copy(center); lamp.castShadow = false;
    litGroup.add(lamp, lamp.target);
    lights.push({ lamp, id: 'EquivalentReflectedExit_' + i, kind: 'ring', rayIndex: i, power: 12 * center.distanceToSquared(position) / Math.ceil(allRays.length / 3) });
  }
  // A directional source is a closer proxy to the authored parallel BF exit
  // than a divergent point source. Finite aperture loss is applied in state.
  const axial = new THREE.DirectionalLight(0xffedd1, 0); axial.position.copy(exit); axial.target.position.copy(center);
  litGroup.add(axial, axial.target); lights.push({ lamp: axial, id: 'AxialParallelExit', kind: 'axial', power: 6 });
  for (const { ray, index } of representatives) {
    const pupil = new THREE.Vector3(...ray.irisPoint), direction = center.clone().sub(new THREE.Vector3(...ray.outerPoint)).normalize();
    const start = line('TwoReflections_' + index, [source, new THREE.Vector3(...ray.exitPoint), new THREE.Vector3(...ray.conePoint), new THREE.Vector3(...ray.outerPoint), pupil], 0xc79b40);
    const onward = line('AfterIris_' + index, [pupil, center], 0xc79b40);
    const extension = line('UnchangedDirection_' + index, [center, center.clone().addScaledVector(direction, .035)], 0xc79b40, true);
    representativePaths.push({ index, start, onward, extension, ray, blockedBy: null });
  }
  const axialPaths = [];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, radius = Math.min(sampleRadius * .55, optics.collimatedBeamRadius * .5);
    const offset = new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    axialPaths.push(line('ParallelBrightfield_' + i, [source, exit.clone().add(offset), center.clone().add(offset), center.clone().add(offset).addScaledVector(axis, .035)], 0xe0b752));
  }
  const scatterPath = line('ExampleScatteredPath', [center, center.clone().addScaledVector(axis, .04)], 0x5a9da9, true);
  const bottomLamp = new THREE.PointLight(0xffe6bc, 0, .035, 2); bottomLamp.position.copy(source).addScaledVector(axis, .003); structuralLights.add(bottomLamp);
  structureEntries.push({ lamp: bottomLamp, kind: 'source', power: .0035, name: 'Source chamber proxy' });
  const directCavity = new THREE.SpotLight(0xfff0d9, 0, .21, Math.atan(optics.collimatedBeamRadius / center.distanceTo(exit)), .05, 2);
  directCavity.position.copy(exit); directCavity.target.position.copy(center); structuralLights.add(directCavity, directCavity.target);
  structureEntries.push({ lamp: directCavity, kind: 'axial', power: 2 * center.distanceToSquared(exit), name: 'Axial chamber proxy' });
  // A single continuous radial transport proxy represents the first reflection.
  // It is restricted to the OUTER reflector draw scene: it cannot leak through
  // the shell or turn the four illustrative paths into four physical beams.
  const radialBounce = new THREE.PointLight(0xffe6bc, 0, .26, 2);
  const outerHeights = optics.outerReflector.verticalRange, outerRadii = optics.outerReflector.radialRange;
  radialBounce.position.set(center.x, (outerHeights[0] + outerHeights[1]) / 2, center.z); outerLightGroup.add(radialBounce);
  outerOnlyEntries.push({ lamp: radialBounce, kind: 'ring', power: 8 * ((outerRadii[0] + outerRadii[1]) / 2) ** 2, name: 'Continuous radial first-reflection transport proxy' });
  for (const name of [optics.coneReflector.node, optics.outerReflector.node]) root.getObjectByName(name)?.traverse(object => {
    if (!object.isMesh) return;
    // Reuse the original geometry and material. Keep originals in the asset tree
    // for selection, clipping, explode, focus and transforms; only the draw pass
    // is separated from the studio lights.
    const proxy = new THREE.Mesh(object.geometry, object.material); proxy.name = object.name + '_bottomLightDraw'; proxy.matrixAutoUpdate = false;
    (name === optics.outerReflector.node ? outerReflectorScene : reflectorScene).add(proxy);
    reflectorProxies.push({ original: object, proxy, originalVisible: object.visible });
  });
  for (const entry of structureEntries) {
    const lamp = entry.lamp.clone(); reflectorLightGroup.add(lamp); if (lamp.target) reflectorLightGroup.add(lamp.target);
    reflectorLightCopies.push({ original: entry.lamp, lamp });
  }
  let lastState, disposed = false;
  function update(state, derived) {
    if (disposed) return;
    lastState = { power: state.power, field: state.field, irisOpen: state.irisOpen, brightness: state.brightness, suspended: derived.suspended };
    group.visible = !derived.suspended; structuralLights.visible = !derived.suspended; litGroup.visible = !derived.suspended; sample.visible = derived.sampleVisible;
    for (const entry of lights) {
      const active = entry.kind === 'ring' ? derived.ringActive : derived.axialActive;
      const pass = entry.kind === 'ring' ? derived.reflectedBeams[entry.rayIndex].transmission : derived.axialTransmission;
      entry.lamp.intensity = active ? entry.power * pass * state.brightness : 0;
    }
    for (const entry of structureEntries) {
      const active = entry.kind === 'ring' ? derived.illuminationActive && state.field === 'darkfield' : entry.kind === 'axial' ? derived.axialActive : derived.illuminationActive;
      entry.lamp.intensity = active ? entry.power * state.brightness : 0;
    }
    for (const entry of outerOnlyEntries) entry.lamp.intensity = derived.illuminationActive && state.field === 'darkfield' ? entry.power * state.brightness : 0;
    root.updateWorldMatrix(true, true);
    for (const path of representativePaths) {
      path.start.visible = derived.rayVisible && state.field === 'darkfield';
      const outer = new THREE.Vector3(...path.ray.outerPoint), target = new THREE.Vector3(...path.ray.samplePoint);
      const worldOrigin = root.localToWorld(outer.clone()), worldTarget = root.localToWorld(target.clone());
      apertureRaycaster.set(worldOrigin, worldTarget.clone().sub(worldOrigin).normalize()); apertureRaycaster.near = .00001; apertureRaycaster.far = worldOrigin.distanceTo(worldTarget);
      const hit = irisMeshes.length ? apertureRaycaster.intersectObjects(irisMeshes, false)[0] : null;
      path.blockedBy = hit?.object.name || null;
      const endpoint = hit ? root.worldToLocal(hit.point.clone()) : new THREE.Vector3(...path.ray.irisPoint);
      path.start.geometry.setPositions([source, new THREE.Vector3(...path.ray.exitPoint), new THREE.Vector3(...path.ray.conePoint), outer, endpoint].flatMap(point => point.toArray()));
      path.start.computeLineDistances();
      path.onward.visible = path.extension.visible = path.start.visible && !hit && derived.reflectedBeams[path.index].centerPasses;
    }
    axialPaths.forEach(path => { path.visible = derived.rayVisible && derived.axialActive; });
    scatterPath.visible = derived.rayVisible && derived.ringActive && derived.sampleVisible;
  }
  function sync() {
    root.updateWorldMatrix(true, true); litGroup.matrix.copy(root.matrixWorld); renderScene.updateMatrixWorld(true);
    reflectorLightGroup.matrix.copy(root.matrixWorld);
    outerLightGroup.matrix.copy(root.matrixWorld);
    for (const entry of reflectorLightCopies) entry.lamp.intensity = entry.original.intensity;
    for (const entry of reflectorProxies) { entry.proxy.matrix.copy(entry.original.matrixWorld); entry.proxy.visible = entry.original.visible; }
    reflectorScene.updateMatrixWorld(true);
    outerReflectorScene.updateMatrixWorld(true);
  }
  function prepareReflectorPass() {
    sync();
    for (const entry of reflectorProxies) {
      entry.originalVisible = entry.original.visible;
      entry.proxy.visible = entry.originalVisible && !lastState?.suspended;
      // Pure assembly study uses the regular studio draw so an isolated mirror
      // remains inspectable while the optical simulation is explicitly paused.
      if (!lastState?.suspended) entry.original.visible = false;
    }
  }
  function restoreReflectorObjects() { for (const entry of reflectorProxies) entry.original.visible = entry.originalVisible; }
  function diagnostics() {
    sync();
    const reflectorEmission = [];
    for (const name of [optics.coneReflector.node, optics.outerReflector.node]) root.getObjectByName(name)?.traverse(object => {
      if (!object.isMesh) return;
      for (const mat of Array.isArray(object.material) ? object.material : [object.material]) reflectorEmission.push({ node: name, intensity: mat.emissiveIntensity || 0, roughness: mat.roughness, metalness: mat.metalness });
    });
    return { state: lastState, sampleWorldPosition: sample.getWorldPosition(new THREE.Vector3()).toArray(), sampleVisible: sample.visible && litGroup.visible,
      activeLightCount: lights.filter(x => x.lamp.intensity > 0).length, ringActiveCount: lights.filter(x => x.kind === 'ring' && x.lamp.intensity > 0).length,
      axialActiveCount: lights.filter(x => x.kind === 'axial' && x.lamp.intensity > 0).length, sourceCount: 1,
      visibleRepresentativePaths: representativePaths.filter(x => x.start.visible && group.visible).length,
      visibleThroughIrisPaths: representativePaths.filter(x => x.onward.visible && group.visible).length,
      representativeIrisIntersections: representativePaths.map(x => ({ index: x.index, blockedBy: x.blockedBy })),
      visibleAxialPaths: axialPaths.filter(x => x.visible && group.visible).length,
      minimumObjectiveClearanceDegrees: THREE.MathUtils.radToDeg(minimumClearance), sampleSceneEnvironment: null,
      rendering: 'Separate sample scene, instrument lights only, shared camera and depth buffer',
      chamberRendering: 'Reflector-only draw scene accepts bottom-light proxies only; shared original geometry, materials, world transforms and depth. No studio/environment light on reflectors, no real-time ray tracing',
      reflectorSceneEnvironment: null, reflectorDrawCount: reflectorProxies.length,
      reflectorEmission,
      cavityLights: [...structureEntries, ...outerOnlyEntries].map(x => ({ kind: x.kind, intensity: x.lamp.intensity, role: x.name })),
      outerReflectorTransport: 'Continuous radial PointLight proxy restricted to outer-reflector scene; one physical LED, four drawn representative paths',
      liveLights: lights.map(x => ({ id: x.id, kind: x.kind, intensity: x.lamp.intensity, coneRadians: x.lamp.angle ?? 0 })),
      limitations: 'Fixed scattering body; no real gemstone imaging, optical refraction, eyepiece image, clip-dependent shading or holder shadows.' };
  }
  function dispose() { if (disposed) return; disposed = true; restoreReflectorObjects(); [...lights,...structureEntries,...outerOnlyEntries,...reflectorLightCopies].forEach(x => x.lamp.dispose()); geometries.forEach(x => x.dispose()); materials.forEach(x => x.dispose()); root.remove(group, structuralLights); renderScene.remove(litGroup); reflectorScene.clear(); outerReflectorScene.clear(); }
  function setResolution(width, height) { for (const mat of materials) if (mat.isLineMaterial) mat.resolution.set(width, height); }
  return { group, structuralLights, sample, litGroup, renderScene, reflectorScene, outerReflectorScene, update, sync, prepareReflectorPass, restoreReflectorObjects, diagnostics, dispose, setResolution };
}
