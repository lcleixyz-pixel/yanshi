/**
 * Local, metre-based teaching illumination. All positions live in the GLB root.
 * The eight oblique spots are equivalent exit-pupil sources, not a path tracer.
 * The sample is a scattering illustration, not a measured gemstone or an optical image.
 * No camera, background colour, renderer settings, or material emission drives this rig.
 */
const finite3 = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = value => Number(value.toFixed(9));
const rounded = vector => vector.toArray().map(round);

// Area of a finite circular beam footprint that can pass a circular aperture.
function pupilTransmission(pupilRadius, beamRadius, offset) {
  if (pupilRadius <= 0) return 0;
  if (offset + beamRadius <= pupilRadius) return 1;
  if (offset >= pupilRadius + beamRadius) return 0;
  if (offset + pupilRadius <= beamRadius) return (pupilRadius / beamRadius) ** 2;
  const a = Math.acos(clamp((offset ** 2 + beamRadius ** 2 - pupilRadius ** 2) / (2 * offset * beamRadius), -1, 1));
  const b = Math.acos(clamp((offset ** 2 + pupilRadius ** 2 - beamRadius ** 2) / (2 * offset * pupilRadius), -1, 1));
  const overlap = beamRadius ** 2 * a + pupilRadius ** 2 * b - .5 * Math.sqrt(Math.max(0,
    (-offset + beamRadius + pupilRadius) * (offset + beamRadius - pupilRadius) *
    (offset - beamRadius + pupilRadius) * (offset + beamRadius + pupilRadius)));
  return clamp(overlap / (Math.PI * beamRadius ** 2), 0, 1);
}

export function createMicroscopeLighting({ THREE, scene, root, manifest }) {
  if (!THREE?.Group || !root?.isObject3D || !scene?.isScene) throw Error('Microscope lighting requires THREE, scene and the asset root');
  if (!finite3(manifest.samplePositionMeters)) throw Error('Missing samplePositionMeters');
  const sources = manifest.sourceNodes;
  for (const key of ['bottom', 'top', 'fiber']) {
    if (!finite3(sources?.[key]?.positionMeters) || !finite3(sources?.[key]?.direction) ||
        Math.hypot(...sources[key].direction) < .999) throw Error('Invalid source position or direction: ' + key);
  }
  const rig = new THREE.Group(); rig.name = 'MicroscopeTeachingIllumination';
  rig.userData.excludeFromAssetBounds = true;
  const sample = new THREE.Group(); sample.name = 'MicroscopeScatteringTeachingSample';
  sample.userData.teachingSample = true;
  sample.position.fromArray(manifest.samplePositionMeters);
  const sampleCenter = sample.position.clone(), sampleRadius = .0045;
  const up = new THREE.Vector3(...sources.bottom.direction).normalize();
  const bottom = new THREE.Vector3(...sources.bottom.positionMeters);
  const irisPart = manifest.parts.find(part => part.id === (manifest.irisMechanics?.bladePartId || 'iris'));
  if (!finite3(irisPart?.pivot)) throw Error('Missing iris aperture plane');
  const irisCenter = new THREE.Vector3(...irisPart.pivot);
  // The optical axis is the bottom source axis, even if the stage pivot is off-axis.
  irisCenter.copy(bottom).addScaledVector(up, new THREE.Vector3(...irisPart.pivot).sub(bottom).dot(up));
  const irisToSample = sampleCenter.clone().sub(irisCenter).dot(up);
  if (!(irisToSample > .002)) throw Error('Sample must be above the iris aperture');
  const irisToSource = irisCenter.clone().sub(bottom).dot(up);
  if (!(irisToSource > 0)) throw Error('Bottom source must be below the iris aperture');
  const defaultDiameter = manifest.irisMechanics.defaultApertureDiameterMeters;
  if (!(defaultDiameter > 0)) throw Error('Missing default iris aperture');
  const objective = manifest.objectiveEntrance;
  if (!finite3(objective?.centerMeters) || !(objective.radiusMeters > 0)) throw Error('Missing objective entrance');
  const objectiveCenter = new THREE.Vector3(...objective.centerMeters);
  const objectiveRadius = objective.radiusMeters;
  const basisX = new THREE.Vector3(1, 0, 0).addScaledVector(up, -up.x).normalize();
  if (basisX.lengthSq() < .5) basisX.set(0, 0, 1).addScaledVector(up, -up.z).normalize();
  const basisZ = new THREE.Vector3().crossVectors(basisX, up).normalize();
  const geometries = new Set(), materials = new Set(), lights = [], rays = [];
  const geometry = item => { geometries.add(item); return item; };
  const material = item => { materials.add(item); return item; };
  const hullMaterial = material(new THREE.MeshPhysicalMaterial({
    color: 0xb4d9e5, metalness: 0, roughness: .48, transparent: true,
    opacity: .15, depthWrite: false, side: THREE.DoubleSide, flatShading: true,
  }));
  const hull = new THREE.Mesh(geometry(new THREE.IcosahedronGeometry(sampleRadius, 0)), hullMaterial);
  hull.name = 'ScatteringSample_FacetedEnvelope'; hull.scale.y = .82;
  hull.rotation.set(.12, .21, .07); hull.receiveShadow = true;
  sample.add(hull);
  const grainMaterial = material(new THREE.MeshStandardMaterial({ color: 0xe9ecda, roughness: .75, metalness: 0 }));
  const needleMaterial = material(new THREE.MeshStandardMaterial({ color: 0xd6c08a, roughness: .43, metalness: .12 }));
  const grainGeometry = geometry(new THREE.IcosahedronGeometry(1, 1));
  const needleGeometry = geometry(new THREE.CylinderGeometry(1, 1, 1, 8));
  // Fixed deterministic geometry. No material or inclusion changes between illumination modes.
  for (let index = 0; index < 22; index++) {
    const phi = index * 2.399963229728653, height = ((index * 7) % 19) / 18 * 2 - 1;
    const radius = .0024 * Math.sqrt(Math.max(0, 1 - height * height));
    const grain = new THREE.Mesh(grainGeometry, grainMaterial);
    grain.name = 'ScatteringSample_Grain_' + index;
    grain.position.set(Math.cos(phi) * radius, height * .0025, Math.sin(phi) * radius);
    grain.scale.setScalar(.00024 + (index % 4) * .000075);
    grain.castShadow = true; grain.receiveShadow = true; sample.add(grain);
  }
  for (let index = 0; index < 6; index++) {
    const needle = new THREE.Mesh(needleGeometry, needleMaterial);
    needle.name = 'ScatteringSample_Needle_' + index;
    needle.position.set(Math.sin(index * 2) * .00145, (index - 2.5) * .00036, Math.cos(index * 1.7) * .00145);
    needle.scale.set(.00010, .0023 + (index % 3) * .00065, .00010);
    needle.rotation.set(.6 + index * .53, index * .34, .42 + index * .72);
    needle.castShadow = true; needle.receiveShadow = true; sample.add(needle);
  }
  rig.add(sample);

  function addSpot(id, kind, origin, direction, angle, intensity, color, shadow = false) {
    const light = new THREE.SpotLight(new THREE.Color().setRGB(...color), 0, 0, angle, .35, 2);
    light.name = 'MicroscopeSpot_' + id; light.position.copy(origin);
    light.target.name = light.name + '_Target';
    light.target.position.copy(origin).add(direction.clone().normalize().multiplyScalar(.15));
    light.castShadow = shadow;
    if (shadow) {
      light.shadow.mapSize.set(512, 512);
      light.shadow.camera.near = .001; light.shadow.camera.far = .25;
      light.shadow.bias = -.00015; light.shadow.normalBias = .00001;
    }
    rig.add(light, light.target);
    const entry = { id, kind, light, intensity, origin, direction: direction.clone().normalize(),
      transmission: 0, coneAvoidsObjective: kind !== 'ring' ? null : false };
    lights.push(entry); return entry;
  }
  function addRay(id, points, color) {
    const line = new THREE.Line(geometry(new THREE.BufferGeometry().setFromPoints(points)),
      material(new THREE.LineBasicMaterial({ color, transparent: true, opacity: .72, depthWrite: false })));
    line.name = 'MicroscopeRay_' + id; line.visible = false;
    line.userData.teachingOverlay = true; rig.add(line); rays.push({ id, line });
  }
  function reflectorHit(exit) {
    const reflector = manifest.reflectorEllipsoid;
    if (!finite3(reflector?.centerMeters) || !(reflector?.semiMajorAxisMeters > 0) || !(reflector?.semiMinorAxisMeters > 0)) return null;
    const center = new THREE.Vector3(...reflector.centerMeters), v = exit.clone().sub(sampleCenter), q = sampleCenter.clone().sub(center);
    const a2 = reflector.semiMajorAxisMeters ** 2, b2 = reflector.semiMinorAxisMeters ** 2;
    const scaledDot = (a, b) => a.dot(b) / b2 + a.dot(up) * b.dot(up) * (1 / a2 - 1 / b2);
    const A = scaledDot(v, v), B = 2 * scaledDot(q, v), C = scaledDot(q, q) - 1;
    const d = B * B - 4 * A * C;
    if (!(d > 0)) return null;
    const t = (-B + Math.sqrt(d)) / (2 * A);
    return t > 1 ? sampleCenter.clone().addScaledVector(v, t) : null;
  }

  const baseRingRadius = Math.min(defaultDiameter * .235, irisToSample * .68);
  for (let index = 0; index < 8; index++) {
    const phi = index * Math.PI / 4, radius = baseRingRadius * (index % 2 ? 1.05 : .9);
    const exit = irisCenter.clone().addScaledVector(up, .0005)
      .addScaledVector(basisX, radius * Math.cos(phi)).addScaledVector(basisZ, radius * Math.sin(phi));
    const aim = sampleCenter.clone().sub(exit), distance = aim.length(), direction = aim.clone().normalize();
    const objectiveVector = objectiveCenter.clone().sub(exit), objectiveDistance = objectiveVector.length();
    const objectiveHalfAngle = Math.asin(clamp(objectiveRadius / objectiveDistance, 0, 1));
    const separation = direction.angleTo(objectiveVector);
    // Conservative angular disk bound: even the edge of the spot cone misses the objective pupil.
    const coneLimit = separation - objectiveHalfAngle - THREE.MathUtils.degToRad(1);
    if (!(coneLimit > .03)) throw Error('No valid oblique cone outside objective pupil');
    const angle = Math.min(Math.asin(clamp(sampleRadius / distance, 0, .95)) * 1.03, coneLimit);
    // Three.js clamps inverse-square attenuation inside 10 cm; tune this demonstrator
    // against the actual browser shader, not an unbounded physical 1 / r² estimate.
    const entry = addSpot('ring-' + index, 'ring', exit, direction, angle, .0048,
      sources.bottom.emissiveColor || [1, .84, .58]);
    const pupilT = irisCenter.clone().sub(exit).dot(up) / direction.dot(up);
    entry.pupilIntersection = exit.clone().addScaledVector(direction, pupilT);
    entry.pupilOffset = entry.pupilIntersection.distanceTo(irisCenter);
    entry.reflectorPoint = reflectorHit(exit);
    const reflectedDistance = entry.reflectorPoint?.distanceTo(sampleCenter);
    entry.pupilBeamRadius = reflectedDistance ? sampleRadius * entry.reflectorPoint.distanceTo(entry.pupilIntersection) / reflectedDistance : sampleRadius * .7;
    entry.coneAvoidsObjective = separation > angle + objectiveHalfAngle;
    entry.clearanceDegrees = THREE.MathUtils.radToDeg(separation - angle - objectiveHalfAngle);
    const path = entry.reflectorPoint ? [bottom, entry.reflectorPoint, entry.pupilIntersection, exit, sampleCenter]
      : [entry.pupilIntersection, exit, sampleCenter];
    addRay(entry.id, path, 0xdfab46);
  }
  const axial = addSpot('axial', 'axial', bottom, up, Math.atan(defaultDiameter / 2 / irisToSource),
    .035, sources.bottom.emissiveColor || [1, .84, .58]);
  addRay(axial.id, [bottom, sampleCenter], 0xe8bd5a);
  for (const [key, intensity, angle] of [['top', .028, .30], ['fiber', .022, .22]]) {
    const source = sources[key], position = new THREE.Vector3(...source.positionMeters), direction = new THREE.Vector3(...source.direction).normalize();
    addSpot(key, key, position, direction, angle, intensity, source.emissiveColor || [1, 1, 1], true);
    const closest = position.clone().addScaledVector(direction, sampleCenter.clone().sub(position).dot(direction));
    addRay(key, [position, closest], key === 'top' ? 0xffdea7 : 0x8bcee8);
  }
  root.add(rig);
  let disposed = false, current = {}, latestOptions = {};

  function update(states = {}, options = {}) {
    if (disposed) return;
    const { enabled = true, showSample = true, showRays = false, irisDiameterMeters = defaultDiameter,
      exploded = false, isolated = false, showObservation = false } = options;
    const apertureDiameter = Number.isFinite(irisDiameterMeters) ? Math.max(0, irisDiameterMeters) : defaultDiameter;
    const suspended = !enabled || exploded || isolated;
    const active = states.sources || {};
    current = { sources: { bottom: !!active.bottom, top: !!active.top, fiber: !!active.fiber },
      darkfieldStop: states.darkfieldStop, diffuser: states.diffuser,
      polarizer: states.polarizer, analyzer: states.analyzer, apertureDiameter, suspended };
    latestOptions = { enabled, showSample, showRays, exploded: !!exploded, isolated: !!isolated, showObservation };
    rig.visible = !suspended; sample.visible = !suspended && showSample;
    for (const entry of lights) {
      const sourceOn = active[entry.kind === 'ring' || entry.kind === 'axial' ? 'bottom' : entry.kind];
      let transmission = suspended || !sourceOn ? 0 : 1;
      if (entry.kind === 'ring') transmission *= pupilTransmission(apertureDiameter / 2, entry.pupilBeamRadius, entry.pupilOffset);
      if (entry.kind === 'axial') {
        transmission *= states.darkfieldStop === 'open' && apertureDiameter > 0 ? 1 : 0;
        // The iris clips the direct cone geometrically, instead of dimming the whole scene.
        entry.light.angle = Math.max(.0001, Math.atan(apertureDiameter / 2 / irisToSource));
        entry.light.penumbra = states.diffuser === 'in' ? .82 : .28;
      }
      entry.transmission = transmission;
      entry.light.intensity = entry.intensity * transmission;
    }
    for (const ray of rays) {
      const entry = lights.find(item => item.id === ray.id);
      // A finite beam may pass only at its edge while its centre hits an iris leaf.
      // In that case keep the transmitted light but omit the blocked centre-ray diagram.
      const centerPasses = entry.kind !== 'ring' || entry.pupilOffset <= apertureDiameter / 2;
      ray.line.visible = !suspended && showRays && entry.light.intensity > 0 && centerPasses;
    }
    rig.updateMatrixWorld(true);
  }
  function diagnostics() {
    root.updateWorldMatrix(true, true);
    const sampleBounds = new THREE.Box3().setFromObject(sample);
    const position = new THREE.Vector3(), target = new THREE.Vector3();
    return {
      implementation: 'Three.js SpotLight direct shading; equivalent annular exit sources; no optical path tracing',
      sample: '同一散射示意样品；未模拟真实宝石折射/偏振',
      coordinates: 'asset-local metres; transforms inherited from GLB root; no camera dependency',
      disposed, state: structuredClone(current), options: { ...latestOptions },
      sampleCenterMeters: rounded(sample.position), sampleWorldCenter: rounded(sample.getWorldPosition(position)),
      sampleBoundsWorld: { min: rounded(sampleBounds.min), max: rounded(sampleBounds.max) },
      sampleMeshCount: sample.children.length,
      irisPlaneCenterMeters: rounded(irisCenter), irisNormal: rounded(up),
      activeLightCount: lights.filter(entry => entry.light.intensity > 0).length,
      actualLights: lights.map(entry => ({
        id: entry.id, kind: entry.kind, intensity: round(entry.light.intensity),
        positionMeters: rounded(entry.light.position), direction: rounded(entry.direction),
        worldPosition: rounded(entry.light.getWorldPosition(position)), worldTarget: rounded(entry.light.target.getWorldPosition(target)),
        coneDegrees: round(THREE.MathUtils.radToDeg(entry.light.angle)), apertureTransmission: round(entry.transmission),
        castShadow: entry.light.castShadow,
        ...(entry.kind === 'ring' ? { pupilIntersectionMeters: rounded(entry.pupilIntersection),
          pupilBeamRadiusMeters: round(entry.pupilBeamRadius), pupilOffsetMeters: round(entry.pupilOffset),
          coneAvoidsObjective: entry.coneAvoidsObjective, objectiveClearanceDegrees: round(entry.clearanceDegrees),
          objectiveClearanceBasis: 'manifest rest position; full focus travel is separately verified by check-microscope-lighting.mjs' } : {}),
      })),
      visibleRayCount: rays.filter(ray => ray.line.visible).length,
      polarization: current.polarizer === 'in' || current.analyzer === 'in' ? '滤片位置示意；不计算偏振消光或干涉色' : '未插入偏振附件',
      limitations: ['环形灯为反射后的等效出光；孔径部分截光采用光束截面积比例近似',
        '示意光源强度未经标定，不能作为实测照度',
        '漫射附件仅增加直射光束边缘柔和度，未计算真实散射函数',
        '仅顶灯与光纤启用阴影；轴灯由挡板状态截断，环形出射受光阑裁剪'],
    };
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    // SpotLight.dispose() owns its shadow maps; call it once per light.
    for (const { light } of lights) { light.intensity = 0; light.dispose(); }
    geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
    root.remove(rig);
  }
  update({}, { enabled: false });
  return { sample, group: rig, update, diagnostics, dispose };
}
