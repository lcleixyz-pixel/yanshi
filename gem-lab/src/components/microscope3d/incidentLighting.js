import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/**
 * Top (reflected) and side (gooseneck) illumination after the 2014 paper
 * 《宝石显微镜光源系统设计与改造》 §3.1 and Fig. 1 (#21 top, #25 side).
 * Positions were measured from the repair-v2 GLB vertices of tripo_part_0
 * (lamp head) and tripo_part_10 (thin gooseneck); they are teaching placements,
 * not manufacturer optics. Asset coordinates, Y up.
 */
export const INCIDENT_GEOMETRY = {
  top: {
    node: 'tripo_part_0',
    // Flat light face of the lamp head: area-weighted fit of triangles whose normals lie within
    // 18 deg of (cos -44 deg, sin -44 deg, 0); outermost plane only. It aims ~4 deg off the sample.
    center: [-0.1102, 0.4964, -0.033],
    normal: [0.7266, -0.687, 0.0006],
    lengthAxis: [0, 0, 1],
    // Fitted face spans about .27 x .11; the diffuser is inset inside the bezel.
    size: [0.23, 0.085],
    centerShift: [0.0072, 0.0076, 0],
    surfaceOffset: 0.0062,
    colorTemperatureK: 6500,
  },
  side: {
    node: 'tripo_part_10',
    // Opening of the thin gooseneck end: PCA end face, then centred on the visible bore in the browser.
    // The modelled tube axis points 44-54 deg away from the sample; a real gooseneck is bent
    // by hand, so the teaching beam is aimed at the sample from this exit.
    tip: [0.0695, 0.3971, 0.0609],
    exitRadius: 0.0032,
    tubeAxis: [-0.564, -0.734, -0.369],
    modelAxisOffsetDegrees: [44, 54],
  },
};

// 6500 K approximates to a slightly cool white; the side guide is a neutral cold light.
const TOP_COLOR = 0xf4f7ff, SIDE_COLOR = 0xfff3e2;

export function createIncidentLighting(root, manifest, litGroup) {
  const center = new THREE.Vector3(...manifest.samplePosition), sampleRadius = manifest.sampleRadius;
  const geometries = new Set(), materials = new Set();
  const geometry = value => { geometries.add(value); return value; }, material = value => { materials.add(value); return value; };
  const group = new THREE.Group(); group.name = 'IncidentLightingHelpers'; group.userData.reviewHelper = true; root.add(group);
  const rays = new THREE.Group(); rays.name = 'IncidentRepresentativePaths'; group.add(rays);

  // Top: diffuser panel on the lamp head underside.
  const t = INCIDENT_GEOMETRY.top, topNormal = new THREE.Vector3(...t.normal).normalize();
  const topCenter = new THREE.Vector3(...t.center).add(new THREE.Vector3(...t.centerShift)).addScaledVector(topNormal, t.surfaceOffset);
  const lengthAxis = new THREE.Vector3(...t.lengthAxis).normalize(), widthAxis = new THREE.Vector3().crossVectors(topNormal, lengthAxis).normalize();
  const basis = new THREE.Matrix4().makeBasis(lengthAxis, widthAxis, topNormal);
  const panelMat = material(new THREE.MeshBasicMaterial({ color: 0x2c3236, side: THREE.DoubleSide, toneMapped: false }));
  const panel = new THREE.Mesh(geometry(new THREE.PlaneGeometry(t.size[0], t.size[1])), panelMat);
  panel.name = 'TopDiffuserPanel'; panel.quaternion.setFromRotationMatrix(basis);
  panel.position.copy(topCenter).addScaledVector(topNormal, .0012); group.add(panel);
  // LED dots behind the diffuser are drawn as a faint grid only while the panel is lit (paper Fig. 7).
  const dotMat = material(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
  const dotGeo = geometry(new THREE.CircleGeometry(.0024, 10)), dots = new THREE.Group(); dots.quaternion.copy(panel.quaternion); dots.position.copy(panel.position).addScaledVector(topNormal, .0004); group.add(dots);
  for (let i = 0; i < 12; i++) for (let j = 0; j < 3; j++) {
    const dot = new THREE.Mesh(dotGeo, dotMat); dot.position.set((i - 5.5) * t.size[0] / 12.5, (j - 1) * t.size[1] / 3.4, 0); dots.add(dot);
  }

  // Side: light-guide exit at the gooseneck tip, aimed at the sample.
  const s = INCIDENT_GEOMETRY.side, tip = new THREE.Vector3(...s.tip), sideDirection = center.clone().sub(tip).normalize();
  const tipMat = material(new THREE.MeshBasicMaterial({ color: 0x2c3236, side: THREE.DoubleSide, toneMapped: false }));
  const tipFace = new THREE.Mesh(geometry(new THREE.CircleGeometry(s.exitRadius, 24)), tipMat); tipFace.name = 'SideGuideExit';
  const tubeAxis = new THREE.Vector3(...s.tubeAxis).normalize();
  tipFace.position.copy(tip).addScaledVector(tubeAxis, .0012); tipFace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tubeAxis); group.add(tipFace);

  const lights = [];
  function spot(id, kind, color, position, cone, penumbra, illuminance, scene) {
    const lamp = new THREE.SpotLight(color, 0, 0, cone, penumbra, 2); lamp.name = id; lamp.position.copy(position); lamp.target.position.copy(center);
    scene.add(lamp, lamp.target); lights.push({ id, kind, lamp, power: illuminance * position.distanceToSquared(center), scene: scene === litGroup ? 'sample' : 'structure' });
  }
  // Sample scene (fixed scattering body): only instrument lights reach it.
  const topSource = topCenter.clone().addScaledVector(topNormal, .002);
  spot('TopDiffuseSample', 'top', TOP_COLOR, topSource, Math.atan(sampleRadius * 4 / topSource.distanceTo(center)), .8, 7, litGroup);
  spot('SideGuideSample', 'side', SIDE_COLOR, tip, Math.atan(sampleRadius * 2.2 / tip.distanceTo(center)), .45, 9, litGroup);
  // Structure scene: a broad pool on the stage top and a tight spot from the gooseneck.
  spot('TopDiffuseStage', 'top', TOP_COLOR, topSource, .42, .9, 2.4, group);
  spot('SideGuideStage', 'side', SIDE_COLOR, tip, .16, .5, 3.2, group);

  function line(id, points, color) {
    const mat = material(new LineMaterial({ color, linewidth: 2.6, opacity: .95, transparent: true, depthWrite: false, toneMapped: false, worldUnits: false }));
    const item = new Line2(geometry(new LineGeometry().setPositions(points.flatMap(point => point.toArray()))), mat); item.name = id; rays.add(item); return item;
  }
  const topPaths = [[-.38, 0], [0, 0], [.38, 0]].map(([u, v], i) => {
    const start = topSource.clone().addScaledVector(lengthAxis, u * t.size[0]).addScaledVector(widthAxis, v * t.size[1]);
    return line('TopIncident_' + i, [start, center], 0x6b5fc0);
  });
  const sidePath = line('SideIncident', [tip, center], 0xcf6b2c);

  let last = null, disposed = false;
  function nodeVisible(name) {
    let visible = false;
    root.getObjectByName(name)?.traverse(object => { if (object.isMesh && object.visible) visible = true; });
    return visible;
  }
  function update(state, derived) {
    if (disposed) return;
    const topShown = nodeVisible(t.node) && !derived.suspended, sideShown = nodeVisible(s.node) && !derived.suspended;
    panel.visible = dots.visible = topShown; tipFace.visible = sideShown;
    panelMat.color.set(derived.topActive ? 0xffffff : 0x2c3236).multiplyScalar(derived.topActive ? .55 + .45 * state.topBrightness : 1);
    dotMat.opacity = derived.topActive ? .35 + .5 * state.topBrightness : 0;
    tipMat.color.set(derived.sideActive ? 0xffffff : 0x2c3236).multiplyScalar(derived.sideActive ? .55 + .45 * state.sideBrightness : 1);
    for (const entry of lights) {
      const active = entry.kind === 'top' ? derived.topActive : derived.sideActive;
      entry.lamp.intensity = active ? entry.power * (entry.kind === 'top' ? state.topBrightness : state.sideBrightness) : 0;
    }
    const raysOn = state.showRays && !derived.suspended && derived.sampleVisible;
    topPaths.forEach(path => { path.visible = raysOn && derived.topActive && topShown; });
    sidePath.visible = raysOn && derived.sideActive && sideShown;
    last = { topActive: derived.topActive, sideActive: derived.sideActive, topShown, sideShown };
  }
  function diagnostics() {
    return { ...last, colorTemperatureK: t.colorTemperatureK, sideModelAxisOffsetDegrees: s.modelAxisOffsetDegrees,
      lights: lights.map(x => ({ id: x.id, kind: x.kind, scene: x.scene, intensity: x.lamp.intensity })),
      visibleTopPaths: topPaths.filter(x => x.visible).length, visibleSidePaths: sidePath.visible ? 1 : 0,
      placement: 'Measured from repair-v2 GLB vertices; teaching placement, not manufacturer optics.' };
  }
  function setResolution(width, height) { for (const mat of materials) if (mat.isLineMaterial) mat.resolution.set(width, height); }
  function dispose() {
    if (disposed) return; disposed = true;
    for (const x of lights) { x.lamp.parent?.remove(x.lamp, x.lamp.target); x.lamp.dispose(); }
    root.remove(group); geometries.forEach(x => x.dispose()); materials.forEach(x => x.dispose());
  }
  return { group, update, diagnostics, setResolution, dispose };
}
