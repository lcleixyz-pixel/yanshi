import * as THREE from 'three';
import { deriveTeachingOptics, lessonUsesSample, type PolariscopeStructureState } from '../../domain/polariscopeStructure';

const UP = new THREE.Vector3(0, 1, 0);
const NO_PICK = () => {};
const COLORS = { source: 0xf2b24a, polarized: 0x2aa79b, sample: 0x9060b1, analyzer: 0x3d7fc0 };

export interface TeachingLabel { key: string; text: string; tone: 'source' | 'polarized' | 'sample' | 'analyzer'; position: THREE.Vector3; visible: boolean }

export interface TeachingOutput {
  /** 检偏器之后的相对光强（以下片后为 1）；样品讲解时为样品区平均亮度。 */
  transmission?: number;
  /** 目镜视场画面（与右侧目镜窗同一张画布）。 */
  fieldTexture?: THREE.Texture | null;
  showField?: boolean;
}

/** World anchors are extracted from the same GLB that the learner operates. */
function geometryCenter(node: THREE.Object3D): THREE.Vector3 {
  return new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
}

/** 体积感光柱：加色混合，视线穿过越厚越亮，两端淡出。 */
function columnMaterial(color: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: 1 } },
    vertexShader: `varying vec3 vNormal; varying vec3 vView; varying float vY;
      void main() { vec4 world = modelMatrix * vec4(position, 1.0); vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - world.xyz); vY = position.y + 0.5; gl_Position = projectionMatrix * viewMatrix * world; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uIntensity; varying vec3 vNormal; varying vec3 vView; varying float vY;
      void main() { float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float ends = smoothstep(0.0, 0.08, vY) * smoothstep(0.0, 0.08, 1.0 - vY);
        float a = uIntensity * ends * (0.018 + 0.1 * pow(facing, 2.0));
        gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
}

function glowTexture() {
  const surface = document.createElement('canvas'); surface.width = surface.height = 128;
  const context = surface.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,236,190,1)'); gradient.addColorStop(0.25, 'rgba(255,196,110,0.55)'); gradient.addColorStop(1, 'rgba(255,170,80,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(surface); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * An explanatory overlay, not ray tracing or measured instrument optics. The
 * scene owns its geometries/materials and disposes them with the single scene.
 */
export function createOpticalTeachingOverlay(asset: THREE.Object3D, extent: number) {
  const required = ['Internal_light_emitting_surface', 'Base_top_open_light_port', 'Fixed_lower_polarizer_glass', 'Stage_clear_sample_support', 'Analyzer_independent_glass'];
  const nodes = required.map(name => asset.getObjectByName(name));
  if (nodes.some(node => !node)) throw new Error('光学讲解所需的资产定位节点缺失');
  const [emitter, aperture, polarizer, support, analyzer] = nodes as THREE.Object3D[];
  const root = new THREE.Group(); root.name = 'Asset_optical_teaching_overlay'; root.visible = false;
  const polarizerSize = new THREE.Box3().setFromObject(polarizer).getSize(new THREE.Vector3());
  const analyzerSize = new THREE.Box3().setFromObject(analyzer).getSize(new THREE.Vector3());
  const columnRadius = Math.max(polarizerSize.x, polarizerSize.z) * 0.42;
  const beamRadius = extent * .0032;
  const rodGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
  const coneGeometry = new THREE.ConeGeometry(1, 1, 16);
  const columnGeometry = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true);
  const stemGeometry = new THREE.BoxGeometry(1, 1, 1);

  // ── 光柱与中心传播方向线 ──
  const beams: { group: THREE.Group; core: THREE.Mesh; column: THREE.Mesh; arrow: THREE.Mesh; material: THREE.MeshBasicMaterial; columnMaterial: THREE.ShaderMaterial }[] = [];
  for (let i = 0; i < 5; i++) {
    const material = new THREE.MeshBasicMaterial({ color: i < 2 ? COLORS.source : COLORS.polarized, transparent: true, opacity: .9, depthWrite: false, toneMapped: false });
    const column = new THREE.Mesh(columnGeometry, columnMaterial(i < 2 ? 0xffd9a0 : 0xfff3dc));
    const core = new THREE.Mesh(rodGeometry, material), arrow = new THREE.Mesh(coneGeometry, material);
    column.renderOrder = 11;
    const group = new THREE.Group(); group.name = `Teaching_path_segment_${i}`; group.add(column, core, arrow); root.add(group);
    beams.push({ group, core, column, arrow, material, columnMaterial: column.material as THREE.ShaderMaterial });
  }

  // ── 电场振动（E 矢量）示意：横向短杆，沿传播方向流动 ──
  const STEMS = 120;
  const stemMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .95, depthWrite: false, toneMapped: false, vertexColors: false });
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, STEMS);
  stems.name = 'Teaching_electric_field_vectors'; stems.frustumCulled = false; stems.instanceMatrix.setUsage(THREE.DynamicDrawUsage); stems.renderOrder = 14;
  stems.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(STEMS * 3), 3); root.add(stems);
  const stemDirections = Array.from({ length: STEMS }, () => Math.random() * Math.PI);
  const stemRefresh = Array.from({ length: STEMS }, () => Math.random());

  const axis = (color: number, length: number, radius: number) => {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, toneMapped: false });
    const line = new THREE.Mesh(rodGeometry, material); line.rotation.z = Math.PI / 2; line.scale.set(radius, length, radius); group.add(line);
    for (const sign of [-1, 1]) {
      const tip = new THREE.Mesh(coneGeometry, material); tip.rotation.z = -sign * Math.PI / 2;
      tip.position.x = sign * length / 2; tip.scale.set(radius * 3.1, radius * 8, radius * 3.1); group.add(tip);
    }
    group.traverse(object => { object.renderOrder = 13; });
    return group;
  };
  const lowerAxis = axis(COLORS.polarized, extent * .27, extent * .0034);
  const upperAxis = axis(COLORS.analyzer, extent * .27, extent * .0034);
  const incidentAxis = axis(COLORS.sample, extent * .19, extent * .0026);
  lowerAxis.name = 'Fixed_polarizer_transmission_axis'; upperAxis.name = 'Rotating_analyzer_transmission_axis';
  incidentAxis.name = 'Incident_linear_polarization_after_sample'; root.add(lowerAxis, upperAxis, incidentAxis);
  const sample = new THREE.Group(); sample.name = 'Ideal_half_wave_plate_schematic'; root.add(sample);
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(extent * .19, extent * .004, extent * .19), new THREE.MeshBasicMaterial({ color: 0xad89bf, transparent: true, opacity: .27, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  sample.add(sheet);
  const fast = axis(0x8352a5, extent * .22, extent * .0029), slow = axis(0xb79556, extent * .22, extent * .0025);
  fast.position.y = extent * .005; slow.position.y = extent * .006; slow.rotation.y = Math.PI / 2; sample.add(fast, slow);

  // ── 检偏器上的视场圆盘：从上方看，就是目镜里看到的画面 ──
  const fieldMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: .94, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const field = new THREE.Mesh(new THREE.CircleGeometry(Math.max(analyzerSize.x, analyzerSize.z) * .47, 72), fieldMaterial);
  field.name = 'Analyzer_field_of_view'; field.rotation.x = -Math.PI / 2; field.renderOrder = 12; field.visible = false;

  // ── 光源辉光（被不透明外壳遮挡时自然看不见） ──
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  glow.name = 'Internal_light_glow'; glow.scale.setScalar(extent * .26);

  const extras = new THREE.Group(); extras.name = 'Asset_light_extras'; extras.add(field, glow);
  root.traverse(object => { object.raycast = NO_PICK; });
  extras.traverse(object => { object.raycast = NO_PICK; });

  const labels: TeachingLabel[] = [
    { key: 'lower', text: '下片透振方向 · 0°', tone: 'polarized' }, { key: 'upper', text: '上片透振方向 · α', tone: 'analyzer' },
    { key: 'plate', text: '理想半波片 · φ', tone: 'sample' },
    { key: 'path-0', text: '底座内光源 · 自然光', tone: 'source' }, { key: 'path-1', text: '下偏光片 · 变成线偏振光', tone: 'polarized' },
    { key: 'path-2', text: '样品位置', tone: 'sample' }, { key: 'path-3', text: '上偏光片 · 只放行一个方向', tone: 'analyzer' },
    { key: 'path-4', text: '出射 · 观察方向', tone: 'polarized' }, { key: 'field', text: '视场：从上往下看', tone: 'analyzer' },
  ].map(label => ({ ...label, tone: label.tone as TeachingLabel['tone'], position: new THREE.Vector3(), visible: false }));
  const labelByKey = Object.fromEntries(labels.map(label => [label.key, label]));

  const anchors: THREE.Vector3[] = Array.from({ length: 6 }, () => new THREE.Vector3());
  const direction = new THREE.Vector3(), mid = new THREE.Vector3(), point = new THREE.Vector3(), horizontal = new THREE.Vector3();
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(), color = new THREE.Color();
  const bounds = new THREE.Box3();
  const diagnostics = { pathAnchors: '', beamIntensities: '0,0,0,0,0', overlayVisible: false, sampleVisible: false, fieldVisible: false, vectors: 0 };
  const refreshAnchors = () => {
    [emitter, aperture, polarizer, support, analyzer].forEach((node, index) => anchors[index].copy(geometryCenter(node)));
    anchors[3].y += extent * .009; // Schematic plate rests immediately above the real sample support.
    anchors[5].copy(anchors[4]).addScaledVector(UP, extent * .135);
    diagnostics.pathAnchors = anchors.map(value => value.toArray().map(n => n.toFixed(4)).join(',')).join(';');
    bounds.makeEmpty(); anchors.forEach(value => bounds.expandByPoint(value)); bounds.expandByScalar(extent * .02);
  };
  refreshAnchors();

  const update = (state: PolariscopeStructureState, movingExplosion: number, time: number, output: TeachingOutput = {}) => {
    const optics = deriveTeachingOptics(state);
    const sampleLesson = lessonUsesSample(state.lesson);
    const transmission = output.transmission ?? optics.relativeTransmission;
    const assembled = optics.active && movingExplosion < .0001;
    refreshAnchors();
    glow.position.copy(anchors[0]); glow.visible = state.power;
    field.visible = !!output.showField && !!output.fieldTexture && assembled;
    diagnostics.fieldVisible = field.visible;
    if (field.visible && fieldMaterial.map !== output.fieldTexture) { fieldMaterial.map = output.fieldTexture!; fieldMaterial.needsUpdate = true; }
    field.position.copy(anchors[4]).addScaledVector(UP, Math.max(analyzerSize.y * .55, extent * .004));
    root.visible = state.lesson !== 'components' && assembled;
    diagnostics.overlayVisible = root.visible;
    diagnostics.sampleVisible = false;
    labels.forEach(label => { label.visible = false; });
    labelByKey.field.visible = field.visible && state.showAnnotations && state.lesson !== 'path';
    labelByKey.field.position.copy(field.position).add(new THREE.Vector3(extent * .1, extent * .07, -extent * .1));
    if (!root.visible) { diagnostics.beamIntensities = '0,0,0,0,0'; diagnostics.vectors = 0; return optics; }
    const principle = state.lesson === 'principle' || sampleLesson, step = principle ? 4 : Math.max(0, Math.min(4, state.pathStep));
    const halfWave = state.principleExample === 'half-wave' && !sampleLesson;
    const intensities: number[] = [];
    const segmentLength: number[] = [];
    beams.forEach((beam, index) => {
      const intensity = index === 4 ? transmission : 1;
      const visible = index <= step && intensity > 1e-4;
      beam.group.visible = visible; intensities.push(visible ? intensity : 0);
      direction.subVectors(anchors[index + 1], anchors[index]); const length = direction.length(); direction.normalize(); segmentLength.push(length);
      mid.copy(anchors[index]).add(anchors[index + 1]).multiplyScalar(.5);
      beam.group.position.copy(mid); beam.group.quaternion.setFromUnitVectors(UP, direction);
      beam.core.scale.set(beamRadius, length, beamRadius);
      // 光源段在底座内，半径取发光面；之后取通光孔与偏光片的口径。
      beam.column.scale.set(columnRadius * (index === 0 ? .8 : 1), length, columnRadius * (index === 0 ? .8 : 1));
      const arrowLength = Math.min(length * .30, extent * .029);
      beam.arrow.visible = length > extent * .07;
      beam.arrow.scale.set(beamRadius * 3.4, arrowLength, beamRadius * 3.4); beam.arrow.position.y = Math.max(0, length * .26);
      beam.material.opacity = Math.min(1, .25 + intensity * .75);
      // 未偏振的自然光经过理想起偏器后光强减半；之后以下片后为 1。
      beam.columnMaterial.uniforms.uIntensity.value = (index < 2 ? 1.1 : .5) * intensity * (sampleLesson ? .55 : 1);
      // 样品讲解时中心方向线会穿过样品，只保留光柱。
      beam.core.visible = !sampleLesson; beam.arrow.visible = beam.arrow.visible && !sampleLesson;
      const hex = index < 2 ? COLORS.source : halfWave && index === 3 ? COLORS.sample : index === 4 ? COLORS.analyzer : COLORS.polarized;
      beam.material.color.setHex(hex);
    });

    // E 矢量：自然光为随机方向；下片后沿 0°；（半波片后沿 2φ）；上片后沿 α，振幅为投影 cos。
    const inputDirection = halfWave ? THREE.MathUtils.degToRad(optics.stageDirection * 2) : 0;
    const alpha = THREE.MathUtils.degToRad(optics.analyzerDirection);
    const outputAmplitude = sampleLesson ? Math.sqrt(Math.max(0, transmission)) : Math.cos(alpha - inputDirection);
    const total = segmentLength.reduce((sum, value, index) => sum + (index <= step ? value : 0), 0);
    const amplitude = columnRadius * .62, wavelength = extent * .07;
    let count = 0;
    for (let k = 0; k < STEMS; k++) {
      const s = (k + .5) / STEMS * total;
      let segment = 0, offset = s;
      while (segment < 4 && offset > segmentLength[segment]) { offset -= segmentLength[segment]; segment++; }
      if (segment > step || intensities[segment] <= 1e-4) continue;
      // 样品讲解时样品后的偏振状态一般为椭圆，不画单一方向。
      if (sampleLesson && segment === 3) continue;
      direction.subVectors(anchors[segment + 1], anchors[segment]).normalize();
      point.copy(anchors[segment]).addScaledVector(direction, offset);
      let angle: number, amp = 1;
      if (segment < 2) {
        if (time > stemRefresh[k]) { stemDirections[k] = Math.random() * Math.PI; stemRefresh[k] = time + .12 + Math.random() * .25; }
        angle = stemDirections[k];
      } else if (segment === 4) { angle = alpha; amp = outputAmplitude; }
      else if (segment === 3 && halfWave) angle = inputDirection;
      else angle = 0;
      const value = amp * Math.sin(2 * Math.PI * (s / wavelength - time * .9));
      const length = Math.abs(value) * amplitude;
      if (length < extent * .0008) continue;
      // 与 Three 中物台绕 +Y 旋转同向：0° 沿 +x，正角由 +x 转向 −z。
      horizontal.set(Math.cos(angle), 0, -Math.sin(angle));
      quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), horizontal);
      point.addScaledVector(horizontal, value * amplitude / 2);
      matrix.compose(point, quaternion, scale.set(length, extent * .0022, extent * .0022));
      stems.setMatrixAt(count, matrix);
      color.setHex(segment < 2 ? COLORS.source : segment === 4 ? COLORS.analyzer : halfWave && segment === 3 ? COLORS.sample : COLORS.polarized);
      stems.setColorAt(count, color);
      count++;
    }
    stems.count = count; stems.instanceMatrix.needsUpdate = true; if (stems.instanceColor) stems.instanceColor.needsUpdate = true;
    stems.visible = state.showAnnotations;
    diagnostics.vectors = stems.visible ? count : 0;

    const setAxis = (group: THREE.Group, value: THREE.Vector3, degrees: number) => {
      group.position.copy(value).addScaledVector(UP, extent * .005); group.rotation.y = THREE.MathUtils.degToRad(degrees);
    };
    lowerAxis.visible = state.showAnnotations && (principle || step >= 1); upperAxis.visible = state.showAnnotations && (principle || step >= 3);
    setAxis(lowerAxis, anchors[2], 0); setAxis(upperAxis, anchors[4], optics.analyzerDirection);
    sample.visible = halfWave && step >= 2; sample.position.copy(anchors[3]); sample.rotation.y = THREE.MathUtils.degToRad(optics.stageDirection);
    diagnostics.sampleVisible = sample.visible;
    incidentAxis.visible = halfWave && step >= 3 && state.showAnnotations;
    mid.copy(anchors[3]).lerp(anchors[4], .57); setAxis(incidentAxis, mid, optics.stageDirection * 2);
    if (state.showAnnotations) {
      const side = new THREE.Vector3(-extent * .2, 0, extent * .17);
      if (sampleLesson) {
        labelByKey.lower.visible = true; labelByKey.lower.position.copy(anchors[2]).add(side).add(new THREE.Vector3(0, -extent * .02, 0));
      } else if (principle) {
        labelByKey.lower.visible = true; labelByKey.lower.position.copy(anchors[2]).add(side).add(new THREE.Vector3(0, -extent * .02, 0));
        labelByKey.upper.visible = true; labelByKey.upper.position.copy(anchors[4]).add(side).add(new THREE.Vector3(0, extent * .03, 0));
        labelByKey.plate.visible = halfWave; labelByKey.plate.position.copy(anchors[3]).add(side).add(new THREE.Vector3(0, extent * .05, 0));
      } else {
        const label = labelByKey[`path-${step}`];
        label.visible = true; label.position.copy(anchors[step === 0 ? 0 : step + 1]).add(side).add(new THREE.Vector3(0, extent * .03, 0));
      }
    }
    diagnostics.beamIntensities = intensities.map(value => value.toFixed(5)).join(',');
    return optics;
  };
  return { root, extras, update, bounds, diagnostics, labels };
}
