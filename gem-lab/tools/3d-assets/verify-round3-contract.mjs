import {Matrix4, Vector3, Quaternion} from 'three';
import {illuminationContractErrors} from './instruments-review-state.mjs';

function worldMatrices(json) {
  const matrices = new Map();
  function visit(index, parent) {
    const node = json.nodes[index];
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(new Vector3(...(node.translation || [0,0,0])), new Quaternion(...(node.rotation || [0,0,0,1])), new Vector3(...(node.scale || [1,1,1])));
    const world = parent.clone().multiply(local); matrices.set(index, world);
    for (const child of node.children || []) visit(child, world);
  }
  for (const index of json.scenes[json.scene || 0].nodes) visit(index, new Matrix4());
  return matrices;
}

function floatVectors(json, bytes, index) {
  const accessor = json.accessors[index], view = json.bufferViews[accessor.bufferView];
  if (accessor.componentType !== 5126 || accessor.type !== 'VEC3' || (view && view.buffer !== 0)) throw Error('Round 3 geometry checker requires float VEC3 accessors in the GLB buffer');
  const jsonLength = bytes.readUInt32LE(12), binStart = 20 + jsonLength + 8;
  const result = Array.from({length: accessor.count}, () => [0,0,0]);
  if (view) {
    const stride = view.byteStride || 12, start = binStart + (view.byteOffset || 0) + (accessor.byteOffset || 0);
    for (let i = 0; i < accessor.count; i++) result[i] = [0,4,8].map(offset => bytes.readFloatLE(start + i * stride + offset));
  }
  // Blender uses sparse-only POSITION deltas for the unmoving outer blade arc.
  if (accessor.sparse) {
    const sparse = accessor.sparse, indices = json.bufferViews[sparse.indices.bufferView], values = json.bufferViews[sparse.values.bufferView];
    if (indices.buffer !== 0 || values.buffer !== 0) throw Error('External sparse buffer is unsupported');
    const readers = {5121: [1, 'readUInt8'], 5123: [2, 'readUInt16LE'], 5125: [4, 'readUInt32LE']};
    const reader = readers[sparse.indices.componentType]; if (!reader) throw Error('Invalid sparse index type');
    const indexStart = binStart + (indices.byteOffset || 0) + (sparse.indices.byteOffset || 0);
    const valueStart = binStart + (values.byteOffset || 0) + (sparse.values.byteOffset || 0);
    for (let i = 0; i < sparse.count; i++) {
      const target = bytes[reader[1]](indexStart + i * reader[0]); if (target >= accessor.count) throw Error('Sparse index out of range');
      result[target] = [0,4,8].map(offset => bytes.readFloatLE(valueStart + i * 12 + offset));
    }
  }
  return result;
}

export function verifyIrisMorphGeometry(manifest, json, bytes) {
  const iris = manifest.irisMechanics, matrices = worldMatrices(json), center = manifest.parts.find(p => p.id === iris.bladePartId).pivot;
  const poses = [], errors = [];
  for (const weight of [0, .25, .5, .75, 1]) {
    let minimum = Infinity; const layers = [];
    for (const name of iris.drive.nodes) {
      const index = json.nodes.findIndex(n => n.name === name), node = json.nodes[index], mesh = json.meshes[node?.mesh];
      if (!mesh) throw Error('Missing iris mesh ' + name);
      const target = mesh.extras?.targetNames?.indexOf(iris.drive.morphTargetName);
      if (!(target >= 0)) throw Error('Missing named iris morph ' + name);
      let leafMinimum = Infinity, low = Infinity, high = -Infinity;
      for (const primitive of mesh.primitives) {
        const base = floatVectors(json, bytes, primitive.attributes.POSITION), delta = floatVectors(json, bytes, primitive.targets[target].POSITION);
        for (let i = 0; i < base.length; i++) {
          const v = new Vector3(...base[i]).addScaledVector(new Vector3(...delta[i]), weight).applyMatrix4(matrices.get(index));
          leafMinimum = Math.min(leafMinimum, Math.hypot(v.x - center[0], v.z - center[2])); low = Math.min(low, v.y); high = Math.max(high, v.y);
        }
      }
      const expected = (iris.apertureDiameterRangeMeters[0] + weight * (iris.apertureDiameterRangeMeters[1] - iris.apertureDiameterRangeMeters[0])) / 2;
      if (Math.abs(leafMinimum - expected) > .00008) errors.push(`Iris leaf aperture mismatch ${name} at ${weight}`);
      minimum = Math.min(minimum, leafMinimum); layers.push({name, low, high});
    }
    layers.sort((a,b) => a.low - b.low);
    const gap = Math.min(...layers.slice(1).map((layer,i) => layer.low - layers[i].high));
    if (gap <= 0) errors.push('Iris leaf layer overlap at ' + weight);
    poses.push({weight, innerDiameterMeters: 2 * minimum, minLayerGapMeters: gap});
  }
  if (poses.some((p,i) => i && p.innerDiameterMeters <= poses[i-1].innerDiameterMeters)) errors.push('Iris aperture is not strictly monotonic');
  return {scope: 'Exported GLB morph positions at five poses; aperture and disjoint blade layers, not optical calibration', poses, errors, ok: !errors.length};
}

export function verifyRound3Contract(id, manifest, provenance, json, bytes) {
  const errors = [], details = {}, parts = manifest.parts || [], names = (json.nodes || []).map(n => n.name);
  const part = id => parts.find(p => p.id === id);
  const requireParts = ids => ids.forEach(id => { if (!part(id)) errors.push('Missing round 3 part: ' + id); });
  if (manifest.version !== 'structure-3' || manifest.revision !== 'repair-v3') errors.push('Round 3 artifact has not been generated; expected structure-3 / repair-v3');
  // Do not interpret an earlier artifact using a later schema.
  if (errors.length) return {errors, details};
  if (provenance.revision !== 'repair-v3') errors.push('Provenance belongs to a different round');
  if (id === 'refractometer') {
    requireParts(['body','metal_stage','test_prism','cover','eyepiece','polarizer','power_switch','internal_light','first_mirror','internal_scale','lens_group','second_mirror','optical_path','oil_bottle']);
    if (part('body')?.unknownExteriorFeatures || /five[^a-z]*dots|5[^a-z]*dots|五个圆点|5个圆点|5 个圆点|Unverified small side dot/i.test(JSON.stringify({manifest,provenance,names}))) errors.push('Obsolete decorative-dot metadata or nodes remain');
    if (manifest.internalOpticsIllustrative !== true) errors.push('Internal optics must remain illustrative');
    if (part('cover')?.lidConstruction?.form !== 'open-bottom box' || part('cover')?.lidConstruction?.innerColor !== 'white' || part('cover')?.lidConstruction?.visibleHingeScrews !== true) errors.push('Missing box lid construction and hinge screws');
    if (JSON.stringify(part('test_prism')?.cylinderAxis) !== '[1,0,0]' || part('test_prism')?.refractiveIndexIllustrative !== 1.88) errors.push('Hemicylinder must use the width axis and illustrative index 1.88');
    for (const id of ['first_mirror','internal_scale','lens_group','second_mirror']) {
      const p = part(id);
      if (!p?.internalOpticsIllustrative || !Array.isArray(p.surfaceCenter) || !p.surfaceCenter.every(Number.isFinite) || !Array.isArray(p.surfaceNormal) || Math.abs(Math.hypot(...p.surfaceNormal)-1) > 1e-5 || !(p.clearRadiusMeters > 0)) errors.push('Incomplete finite optical surface: ' + id);
    }
    if (part('internal_scale')?.tickPositionsCalibrated !== false || part('lens_group')?.imagingCalibrated !== false) errors.push('Scale and lens imaging must remain uncalibrated');
    const rays = manifest.opticalPath;
    if (Math.abs(rays?.mainAngleDegrees - 60) > .01 || !Array.isArray(rays?.criticalAngleRangeDegrees) || Math.abs(rays.criticalAngleRangeDegrees[0] - Math.asin(1.35/1.88)*180/Math.PI) > .01 || Math.abs(rays.criticalAngleRangeDegrees[1] - Math.asin(1.80/1.88)*180/Math.PI) > .01 || !rays?.mainRayPointsMeters?.length || !rays?.limitations?.length) errors.push('Missing principal ray, critical-angle fan or propagation boundary');
    const motion = part('eyepiece')?.motion;
    if (motion?.type !== 'translation' || !(motion.outputRangeMeters?.[1] > motion.outputRangeMeters?.[0]) || !motion.followers?.includes('polarizer')) errors.push('Missing axial ocular focus and polarizer following');
    if (part('optical_path')?.defaultVisible !== false || !part('optical_path')?.teachingOverlay || manifest.opticalPath?.defaultVisible !== false) errors.push('Optical path must be hidden by default');
    const overlay = json.nodes.find(n => n.name === part('optical_path')?.node);
    if (overlay?.extras?.defaultVisible !== false) errors.push('GLB optical overlay lacks default-hidden extras');
  }
  if (id === 'prism-spectroscope') {
    const assembly = manifest.amiciAssembly;
    if (assembly?.interfaces?.length !== 2 || assembly.alternatingSlopes !== true) errors.push('Missing two alternating Amici cement interfaces');
    for (const face of assembly?.interfaces || []) if (!names.includes(face.node)) errors.push('Missing Amici interface mesh ' + face.node);
    const appearance = assembly?.materialAppearance;
    if (!appearance?.crown || !appearance?.flint || JSON.stringify(appearance.crown) === JSON.stringify(appearance.flint) || !(appearance.flint.ior > appearance.crown.ior)) errors.push('Crown/flint appearances or refractive-index declaration missing');
    const materials = ['Amici crown teaching glass', 'Amici flint teaching glass'].map(name => (json.materials || []).find(m => m.name === name));
    if (materials.some(m => !m) || new Set(materials.map(m => JSON.stringify(m?.pbrMetallicRoughness?.baseColorFactor))).size < 2) errors.push('Exported crown/flint materials do not differ');
  }
  if (id === 'gem-microscope') {
    errors.push(...illuminationContractErrors(manifest, names));
    const matrices = worldMatrices(json), sample = new Vector3(...manifest.samplePositionMeters);
    for (const source of Object.values(manifest.sourceNodes || {})) {
      const node = json.nodes.find(n => n.name === source.node), mesh = json.meshes[node?.mesh];
      if (!mesh?.primitives?.some(p => json.materials[p.material]?.emissiveFactor?.some(v => v > 0))) errors.push('Missing exported emissive material: ' + source.node);
      if (mesh) {
        const index = json.nodes.indexOf(node), low = new Vector3(Infinity,Infinity,Infinity), high = new Vector3(-Infinity,-Infinity,-Infinity);
        for (const primitive of mesh.primitives) for (const position of floatVectors(json,bytes,primitive.attributes.POSITION)) { const v = new Vector3(...position).applyMatrix4(matrices.get(index)); low.min(v); high.max(v); }
        const center = low.add(high).multiplyScalar(.5);
        if (center.distanceTo(new Vector3(...source.positionMeters)) > .0005) errors.push('Emission position disagrees with exported mesh: ' + source.node);
      }
      const direction = new Vector3(...source.direction), toSample = sample.clone().sub(new Vector3(...source.positionMeters));
      if (Math.abs(direction.length()-1) > 1e-6 || direction.dot(toSample) <= 0 || direction.clone().cross(toSample).length() > 1e-5) errors.push('Emission axis misses sample: ' + source.node);
    }
    const ellipsoid = manifest.reflectorEllipsoid;
    if (!ellipsoid || !part(ellipsoid.partId)) errors.push('Missing independent ellipsoidal reflector');
    else {
      const f1 = new Vector3(...ellipsoid.sourceFocusMeters), f2 = new Vector3(...ellipsoid.sampleFocusMeters), c = f1.distanceTo(f2)/2;
      if (Math.abs(ellipsoid.semiMajorAxisMeters**2-ellipsoid.semiMinorAxisMeters**2-c**2) > 1e-8 || f1.clone().add(f2).multiplyScalar(.5).distanceTo(new Vector3(...ellipsoid.centerMeters)) > 1e-6) errors.push('Ellipsoid focal geometry is inconsistent');
    }
    if (manifest.illuminationGeometry?.photometrySimulated !== false || manifest.illuminationGeometry?.brightfieldIncludesReflectedLight !== true || manifest.illuminationGeometry?.stagePlan !== 'rounded rectangle') errors.push('Missing round 3 illumination or rectangular-stage declarations');
    if (!manifest.focusMechanics?.drivenParts?.includes('analyzer')) errors.push('Analyzer must follow objective focus');
    const iris = manifest.irisMechanics;
    if (!iris?.controlAngleChangesAperture || iris?.drive?.nodes?.length !== 12 || !Array.isArray(iris?.apertureDiameterRangeMeters) || !iris.apertureDiameterRangeMeters.every(Number.isFinite) || Math.abs(iris.apertureDiameterRangeMeters[0] - .0075) > .0001 || Math.abs(iris.apertureDiameterRangeMeters[1] - .04) > .0001) errors.push('Iris mapping must span approximately 7.5–40 mm');
    if (!(iris?.edgeBevelMeters > 0) || !(iris?.layerGapMeters > 0)) errors.push('Missing iris bevel or blade clearance');
    for (const name of iris?.drive?.nodes || []) {
      const node = json.nodes.find(n => n.name === name), mesh = json.meshes[node?.mesh];
      if (!mesh?.primitives.every(p => {
        const material = json.materials[p.material]?.pbrMetallicRoughness;
        return material?.roughnessFactor >= .6 && material.baseColorFactor?.slice(0,3).every(c => c <= .15);
      })) errors.push('Iris blade must export dark matte material: ' + name);
    }
    if (iris?.drive?.nodes?.length) {
      try { details.irisMorphGeometry = verifyIrisMorphGeometry(manifest, json, bytes); errors.push(...details.irisMorphGeometry.errors); }
      catch (error) { errors.push('Exported iris geometry: ' + error.message); }
    }
  }
  return {errors, details};
}
