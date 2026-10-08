import * as THREE from 'three';

export function createTeachingLighting(tiltRig, contract) {
  const optics = contract.optics, center = new THREE.Vector3(...optics.samplePosition);
  const radius = optics.sampleRadius || .004, baseEntrance = new THREE.Vector3(...optics.observationEntrance);
  const group = new THREE.Group(); group.name = 'TeachingPaths'; group.userData.reviewHelper = true; tiltRig.add(group);
  // A separate scene is essential: layers do not isolate lights between meshes.
  const renderScene = new THREE.Scene(); renderScene.background = null; renderScene.environment = null;
  const litGroup = new THREE.Group(); litGroup.matrixAutoUpdate = false; renderScene.add(litGroup);
  const geometries = new Set(), materials = new Set(), lights = [], paths = [];
  const geo = value => { geometries.add(value); return value; }, mat = value => { materials.add(value); return value; };
  const sample = new THREE.Group(); sample.name = 'FixedScatteringBody'; sample.position.copy(center); litGroup.add(sample);
  const shell = new THREE.Mesh(geo(new THREE.IcosahedronGeometry(radius, 0)), mat(new THREE.MeshStandardMaterial({
    color: 0xc0d6c8, roughness: .45, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide, flatShading: true,
  })));
  shell.scale.set(1, .83, 1); shell.rotation.set(.14, .26, .1); sample.add(shell);
  const grainGeo = geo(new THREE.IcosahedronGeometry(1, 1));
  const grainMat = mat(new THREE.MeshStandardMaterial({ color: 0xe9e0b9, roughness: .74, metalness: 0 }));
  for (let index = 0; index < 19; index++) {
    const angle = index * 2.3999632, y = ((index * 7) % 19) / 9 - 1;
    const r = radius * .61 * Math.sqrt(Math.max(0, 1 - y * y));
    const grain = new THREE.Mesh(grainGeo, grainMat); grain.name = 'ScatteringPoint_' + index;
    grain.position.set(Math.cos(angle) * r, y * radius * .56, Math.sin(angle) * r);
    grain.scale.setScalar(radius * (.065 + index % 3 * .015)); sample.add(grain);
  }
  const rodGeo = geo(new THREE.CylinderGeometry(1, 1, 1, 7));
  for (let index = 0; index < 4; index++) {
    const rod = new THREE.Mesh(rodGeo, grainMat); rod.name = 'ScatteringRod_' + index;
    rod.position.set(Math.sin(index * 2.1) * radius * .28, (index - 1.5) * radius * .13, Math.cos(index * 1.7) * radius * .25);
    rod.scale.set(radius * .025, radius * (.58 + index * .08), radius * .025);
    rod.rotation.set(.5 + index * .41, index * .31, .5 + index * .6); sample.add(rod);
  }
  function addLight(id, position, angle, power, kind) {
    const light = new THREE.SpotLight(0xfff0d9, 0, 0, angle, .1, 2);
    light.name = id; light.position.copy(position); light.target.position.copy(center); light.castShadow = false;
    litGroup.add(light, light.target); const entry = { id, light, power, kind }; lights.push(entry); return entry;
  }
  function line(id, points, color, dashed = false) {
    const parameters = { color, transparent: true, opacity: .73, depthWrite: false };
    const material = mat(dashed ? new THREE.LineDashedMaterial({ ...parameters, dashSize: .002, gapSize: .0016 }) : new THREE.LineBasicMaterial(parameters));
    const item = new THREE.Line(geo(new THREE.BufferGeometry().setFromPoints(points)), material); item.name = id;
    if (dashed) item.computeLineDistances(); group.add(item); return item;
  }
  function updateLine(item, points) { item.geometry.setFromPoints(points); item.computeLineDistances?.(); }
  const df = optics.darkfield, halfAngle = THREE.MathUtils.degToRad(df.divergenceHalfAngleDegrees);
  let minimumClearance = Infinity;
  for (let index = 0; index < df.rayCount; index++) {
    const a = index / df.rayCount * Math.PI * 2;
    const position = new THREE.Vector3(...df.center).add(new THREE.Vector3(Math.cos(a) * df.radius, 0, Math.sin(a) * df.radius));
    const direction = center.clone().sub(position).normalize();
    // The entire 4-degree light cone must miss the circular entrance at every
    // allowed focus position. Camera position is deliberately absent.
    for (const focus of contract.rigs.focus.rangeMeters) {
      const entrance = baseEntrance.clone().add(new THREE.Vector3(0, focus, 0));
      const toEntrance = entrance.sub(position), separation = direction.angleTo(toEntrance);
      const pupilAngularRadius = Math.asin((optics.observationRadius + (df.emittingPatchRadius || 0)) / toEntrance.length());
      const clearance = separation - pupilAngularRadius - halfAngle;
      if (!(clearance > 0)) throw Error('暗域出光束与物镜接收区相交');
      minimumClearance = Math.min(minimumClearance, clearance);
    }
    const light = addLight('DarkfieldLED_' + index, position, halfAngle, .9 * position.distanceToSquared(center), 'darkfield');
    light.direction = direction;
    paths.push({ direction, incident: line('ObliqueRay_' + index, [position, center], 0xb38c38),
      continuation: line('DirectContinuation_' + index, [center, baseEntrance], 0xb38c38, true) });
  }
  const bfSource = new THREE.Vector3(...optics.brightfield.center);
  addLight('BrightfieldLED', bfSource, Math.atan(optics.brightfield.radius / bfSource.distanceTo(center)), 7 * bfSource.distanceToSquared(center), 'brightfield');
  const brightPath = line('AxialRay', [bfSource, center, baseEntrance], 0xcaa04b);
  const scatterPath = line('ExampleChangedDirectionRay', [center, baseEntrance], 0x4f99a0, true);
  const entranceMarker = new THREE.Mesh(geo(new THREE.TorusGeometry(optics.observationRadius, .00028, 8, 80)), mat(new THREE.MeshBasicMaterial({
    color: 0x5e9da2, transparent: true, opacity: .85, depthTest: false, depthWrite: false, toneMapped: false,
  })));
  entranceMarker.rotation.x = -Math.PI / 2; entranceMarker.renderOrder = 20; group.add(entranceMarker);
  let current = null, disposed = false;
  function update(state, derived) {
    current = { mode: state.mode, brightness: state.brightness, tiltDegrees: state.tiltDegrees, focusMeters: state.focusMeters, suspended: derived.suspended };
    group.visible = !derived.suspended; litGroup.visible = !derived.suspended; sample.visible = derived.sampleVisible;
    for (const entry of lights) entry.light.intensity = (entry.kind === 'darkfield' ? derived.darkfieldActive : derived.brightfieldActive) ? entry.power * state.brightness : 0;
    const entrance = baseEntrance.clone().add(new THREE.Vector3(0, state.focusMeters, 0));
    for (const path of paths) {
      path.incident.visible = path.continuation.visible = derived.raysVisible && derived.darkfieldActive;
      const distance = (entrance.y - center.y) / path.direction.y;
      updateLine(path.continuation, [center, center.clone().addScaledVector(path.direction, distance)]);
    }
    brightPath.visible = derived.raysVisible && derived.brightfieldActive; updateLine(brightPath, [bfSource, center, entrance]);
    scatterPath.visible = derived.raysVisible && derived.darkfieldActive && derived.sampleVisible; updateLine(scatterPath, [center, entrance]);
    entranceMarker.visible = derived.raysVisible; entranceMarker.position.copy(entrance);
    sync();
  }
  function sync() { tiltRig.updateWorldMatrix(true, true); litGroup.matrix.copy(tiltRig.matrixWorld); renderScene.updateMatrixWorld(true); }
  function diagnostics() {
    sync(); return { state: current, rendering: 'separate scene, instrument lighting only; shared camera and depth',
      sampleLocalPosition: sample.position.toArray(), sampleWorldPosition: sample.getWorldPosition(new THREE.Vector3()).toArray(), sampleRadius: radius,
      sampleVisible: sample.visible, sampleMaterialEmissive: 0, sampleEnvironment: null, activeLightCount: lights.filter(x => x.light.intensity > 0).length,
      brightfieldActive: lights.some(x => x.kind === 'brightfield' && x.light.intensity > 0), darkfieldActive: lights.some(x => x.kind === 'darkfield' && x.light.intensity > 0),
      darkfieldDivergenceHalfAngleDegrees: df.divergenceHalfAngleDegrees, emittingPatchRadius: df.emittingPatchRadius || 0,
      minimumFullConeClearanceDegrees: THREE.MathUtils.radToDeg(minimumClearance), lightApproximation: 'point spotlights; clearance includes finite emitting patch bound',
      entranceWorldPosition: entranceMarker.getWorldPosition(new THREE.Vector3()).toArray(),
      liveLights: lights.map(x => ({ id: x.id, kind: x.kind, intensity: x.light.intensity, angleRadians: x.light.angle, worldPosition: x.light.getWorldPosition(new THREE.Vector3()).toArray() })),
      visibleObliquePaths: paths.filter(x => x.incident.visible && group.visible).length, visibleAxialPath: brightPath.visible && group.visible,
      limitations: 'Fixed scattering body; no gemstone refraction, polarization, inclusions, imaging or depth of field.' };
  }
  function dispose() { if (disposed) return; disposed = true; lights.forEach(x => x.light.dispose()); geometries.forEach(x => x.dispose()); materials.forEach(x => x.dispose()); tiltRig.remove(group); renderScene.remove(litGroup); }
  return { group, renderScene, sample, sync, update, diagnostics, dispose };
}
