// Three.js viewer for the versioned paper-optics spectroscopes and refractometer.
// Ported from tools/3d-assets/instruments-optics-2026-10-08/review/review.mjs: same verified paths,
// poses and display rules; the page UI is React and receives a snapshot through onChange.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { displayPaths } from './displayPaths.js';

const READOUT_LABELS = { summary: '观察要点', display: '观察要点', explanation: '现象解释', exitAngleDegrees: '出射角（度）', exitAnglesDegrees: '波长 nm → 出射角 °',
  reachesEyepiece: '到达目镜前', total: '代表光线数', relativeTransmission: '相对透过率', sampleRI: '示例样品 RI', sampleCriticalAngleDegrees: '玻璃内临界角（度）',
  contactCriticalAngleDegrees: '玻璃—接触层临界角（度）' };
const KIND_LABELS = { refracted: '折射光', diffracted: '衍射光', incident: '入射光', reflected: '反射光', transmitted: '透射光', critical: '临界方向', schematic: '方向示意',
  'partial-reflection': '部分反射', 'total-internal-reflection': '全反射', 'grazing-boundary': '临界透射方向', 'contact-limit': '接触界面全反射', blocked: '受孔径遮挡' };
const SHELL_PARTS = { refractometer: ['body', 'cover', 'metal_stage'], 'prism-spectroscope': ['focusTube', 'slitHousing'], 'grating-spectroscope': ['slitHousing'] };
const REFRACTOMETER_OPTICS = ['test_prism', 'first_mirror', 'second_mirror', 'lens_group', 'eyepiece', 'internal_light', 'internal_scale', 'contact_layer', 'isotropic_sample'];

function summaryValue(value) {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.map(v => typeof v === 'number' ? Number(v.toFixed(4)) : v).join(' / ');
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
function disposeTree(object) {
  if (!object) return;
  const geometry = new Set(), mats = new Set(), textures = new Set();
  object.traverse(o => {
    if (o.geometry) geometry.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) { mats.add(m); for (const v of Object.values(m)) if (v?.isTexture) textures.add(v); }
  });
  geometry.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
}

export function createOpticsViewer({ container, instrument, assetBase, onChange }) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e7edef');
  const camera = new THREE.PerspectiveCamera(35, 1, .00001, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  container.prepend(renderer.domElement);
  const canvas = renderer.domElement; canvas.dataset.testid = 'optics3d-canvas'; canvas.dataset.instrument = instrument;
  canvas.setAttribute('aria-label', '仪器与光路三维模型'); canvas.tabIndex = 0; canvas.dataset.loaded = 'false'; canvas.className = 'opt-explore__canvas';
  const controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
  const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromScene(room, .04);
  scene.environment = env.texture; scene.environmentIntensity = .55; room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x849097, 1.05));
  for (const [pos, intensity] of [[[2, 3, 4], 2.5], [[-3, 1, -2], 1.1]]) { const light = new THREE.DirectionalLight(0xffffff, intensity); light.position.set(...pos); scene.add(light); }
  const raycaster = new THREE.Raycaster();
  let modelExtent = 1, root, manifest, caseFile, sources, parts = [], helpers = new THREE.Group(), animationFrame, disposed = false;
  const materials = new Map(), originalPoses = new Map();
  scene.add(helpers);
  let external = null;
  // 课程联动：可动部件按清单的转角 / 行程取 0–1 位置；样品与入射光为教学示意（红宝石固定样品）。
  let positions = {}, sample = null;
  const SAMPLE_Z = -.068, SOURCE_Z = -.1, ENTRY_Z = -.0475, SAMPLE_ASIDE_X = .013;
  let state = { view: 'optics', caseId: null, rays: true, explode: 0, selectedId: null, isolated: false };
  const currentCase = () => caseFile?.cases.find(c => c.id === state.caseId);
  const chosen = () => parts.find(p => p.id === state.selectedId);

  function clearHelpers() { scene.remove(helpers); disposeTree(helpers); helpers = new THREE.Group(); scene.add(helpers); }
  function restore() {
    for (const [o, p] of originalPoses) { o.position.copy(p.position); o.quaternion.copy(p.quaternion); o.scale.copy(p.scale); }
    root.updateMatrixWorld(true);
  }
  function applyPose(part, offset = [0, 0, 0], delta = null, pivotOverride = null) {
    const o = part.object; o.updateWorldMatrix(true, true);
    const pivot = pivotOverride ? new THREE.Vector3(...pivotOverride).applyMatrix4(root.matrixWorld) : new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
    const shift = new THREE.Vector3(...offset).applyMatrix4(root.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(root.matrixWorld));
    const transform = new THREE.Matrix4().makeTranslation(...shift.toArray());
    if (delta) {
      const rotation = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(...delta).normalize());
      transform.multiply(new THREE.Matrix4().makeTranslation(...pivot.toArray())).multiply(rotation).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    }
    const local = new THREE.Matrix4().copy(o.parent.matrixWorld).invert().multiply(transform).multiply(o.matrixWorld);
    local.decompose(o.position, o.quaternion, o.scale); o.updateWorldMatrix(true, true);
  }
  /** 按 positions 摆放可动部件；被联动的部件（drivenBy）跟随其控制部件的位置。 */
  function applyControls() {
    const linkedValue = part => positions[part.id] ?? (part.drivenBy ? positions[part.drivenBy] : undefined);
    for (const part of parts) {
      const value = linkedValue(part);
      if (value === undefined) continue;
      const t = Math.min(1, Math.max(0, value));
      if (part.rotatable && part.rotationRangeDegrees) {
        const [from, to] = part.rotationRangeDegrees, angle = THREE.MathUtils.degToRad(from + (to - from) * t);
        applyPose(part, [0, 0, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...part.rotationAxisLocal), angle).toArray(), part.pivot);
      }
      if (part.translatable && part.translationRange) {
        const [from, to] = part.translationRange, travel = from + (to - from) * t;
        applyPose(part, part.translationAxisLocal.map(n => n * travel));
      }
    }
  }
  /** 从部件实际姿态测出的控制量，供页面与测试核对动作确实发生。 */
  function measureControls() {
    const out = {};
    // 可动部件都是模型根节点的直接子节点，位置即模型坐标。
    const moved = part => part.object.position.distanceTo(originalPoses.get(part.object).position);
    const byId = id => parts.find(p => p.id === id);
    for (const link of manifest.controlLinkages || []) {
      if (link.type !== 'symmetricSlit') continue;
      const control = byId(link.controlPart), [left, right] = link.drivenParts.map(byId);
      if (!control || !left || !right) continue;
      const pose = originalPoses.get(control.object), now = control.object.quaternion;
      out[link.controlPart + 'Degrees'] = Number(THREE.MathUtils.radToDeg(pose.quaternion.angleTo(now)).toFixed(1));
      const opened = moved(left) + moved(right);
      out.slitGapMm = Number(((link.closedStopGapMeters + opened) * 1000).toFixed(3));
    }
    for (const part of parts.filter(p => p.translatable && !p.drivenBy)) out[part.id + 'Mm'] = Number((moved(part) * 1000).toFixed(2));
    if (sample) out.sample = sample.position;
    return out;
  }
  /** 样品与入射光（只在设置了 sample 时出现）：光源在入光端外侧，光束沿光轴进入狭缝。 */
  function makeSampleOverlay() {
    const through = sample.position === 'through';
    makeTeachingMesh({ id: 'teaching_sample', shape: 'gem', color: '#b3203a', opacity: .85, position: [through ? 0 : SAMPLE_ASIDE_X, 0, SAMPLE_Z], scale: [.0042, .0042, .0032] });
    makeTeachingMesh({ id: 'teaching_light', shape: 'sphere', color: '#f3d27a', opacity: .9, position: [0, 0, SOURCE_Z], scale: [.003, .003, .003] });
    const white = '#f2e6c4', red = '#c8324a';
    const beams = through
      ? [{ id: 'beam-to-sample', color: white, points: [[0, 0, SOURCE_Z], [0, 0, SAMPLE_Z - .004]] }, { id: 'beam-through-sample', color: red, arrow: false, points: [[0, 0, SAMPLE_Z + .004], [0, 0, ENTRY_Z]] }]
      : [{ id: 'beam-bypass', color: white, arrowAt: .3, points: [[0, 0, SOURCE_Z], [0, 0, ENTRY_Z]] }];
    // 箭头只放在靠光源一侧，近看狭缝时不遮挡刃口。
    for (const beam of beams) makeLine({ ...beam, lineWidth: 3.2 });
  }
  function isShown(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
  function bounds(objects) {
    const b = new THREE.Box3();
    for (const o of objects) {
      o.updateWorldMatrix(true, true);
      o.traverse(child => { if (child.isMesh && isShown(child)) { child.geometry.computeBoundingBox(); b.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld)); } });
    }
    return b;
  }
  function fitBox(box, direction) {
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), r = Math.max(size.length() / 2, .001);
    const dir = (direction || camera.position.clone().sub(controls.target)).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
    const right = new THREE.Vector3().crossVectors(camera.up, dir).normalize(), up = new THREE.Vector3().crossVectors(dir, right).normalize();
    let distance = .001;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const v = new THREE.Vector3(x, y, z).sub(center);
      distance = Math.max(distance, v.dot(dir) + 1.15 * Math.max(Math.abs(v.dot(right)) / tanH, Math.abs(v.dot(up)) / tanV));
    }
    controls.target.copy(center); camera.position.copy(center).addScaledVector(dir, distance);
    camera.near = Math.max(.000001, distance / (instrument === 'refractometer' ? 100 : 2000)); camera.far = Math.max(10, distance * 50); camera.updateProjectionMatrix();
    controls.minDistance = r * .1; controls.maxDistance = Math.max(2, distance * 20); controls.update();
  }
  function fit() {
    if (!root) return;
    if (state.isolated && chosen()) return fitBox(bounds([chosen().object]));
    const box = bounds([root]);
    if (sample && !state.explode) box.expandByPoint(new THREE.Vector3(0, 0, SOURCE_Z - .004).applyMatrix4(root.matrixWorld));
    if (state.view === 'optics' && !state.explode) {
      const rayBox = new THREE.Box3();
      for (const path of currentCase()?.paths || []) for (const p of path.points || []) rayBox.expandByPoint(new THREE.Vector3(...p).applyMatrix4(root.matrixWorld));
      if (!rayBox.isEmpty()) {
        rayBox.expandByScalar(box.getSize(new THREE.Vector3()).length() * .035);
        if (instrument === 'refractometer') box.copy(bounds(parts.filter(p => REFRACTOMETER_OPTICS.includes(p.id)).map(p => p.object))).union(rayBox);
        else box.union(rayBox);
      }
    }
    fitBox(box, instrument.includes('spectroscope') ? new THREE.Vector3(.45, 1, .15) : new THREE.Vector3(1.4, .7, 1.8));
  }
  function makeLine(path) {
    if (!Array.isArray(path.points) || path.points.length < 2) return;
    const pts = path.points.filter(p => p.length === 3 && p.every(Number.isFinite)).map(p => new THREE.Vector3(...p).applyMatrix4(root.matrixWorld));
    if (pts.length < 2) return;
    const material = new LineMaterial({ color: path.color || '#c29642', linewidth: path.lineWidth || 2.6, transparent: true, opacity: typeof path.opacity === 'number' ? path.opacity : 1,
      depthTest: state.view !== 'optics', dashed: path.dashed || false, dashScale: 1, dashSize: .008, gapSize: .005 });
    const rect = container.getBoundingClientRect(); material.resolution.set(rect.width, rect.height);
    const line = new Line2(new LineGeometry().setPositions(pts.flatMap(p => p.toArray())), material);
    line.name = path.id; line.renderOrder = 10; line.computeLineDistances(); helpers.add(line);
    const a = pts[pts.length - 2], b = pts[pts.length - 1], length = a.distanceTo(b);
    if (length > 1e-7 && path.arrow !== false) {
      const direction = b.clone().sub(a).normalize(), size = Math.min(length * .13, modelExtent * .014);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(size * .24, size, 8), new THREE.MeshBasicMaterial({ color: path.color || '#c29642', transparent: true,
        opacity: typeof path.opacity === 'number' ? Math.max(.4, path.opacity) : 1, depthTest: state.view !== 'optics', depthWrite: false }));
      arrow.position.copy(a).lerp(b, path.arrowAt ?? .72); arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction); arrow.renderOrder = 11; helpers.add(arrow);
    }
  }
  function makeTeachingMesh(data) {
    const geometry = data.shape === 'sphere' ? new THREE.SphereGeometry(1, 32, 24) : data.shape === 'cabochon' ? new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2)
      : data.shape === 'gem' ? new THREE.OctahedronGeometry(1) : new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({ color: data.color || '#83afc0', roughness: .2, metalness: 0, transparent: true, opacity: data.opacity ?? .45, depthWrite: false, side: THREE.DoubleSide }));
    mesh.name = data.id; mesh.position.fromArray(data.position || [0, 0, 0]); mesh.scale.fromArray(data.scale || [1, 1, 1]);
    if (data.quaternion) mesh.quaternion.fromArray(data.quaternion);
    helpers.add(mesh);
  }
  function describe() {
    const c = currentCase(), suspended = state.explode > 0 || state.isolated;
    const readout = Object.entries(c?.readout || {}).filter(([key]) => READOUT_LABELS[key]).map(([key, value]) => ({ label: READOUT_LABELS[key],
      value: key === 'exitAnglesDegrees' ? Object.entries(value).map(([w, a]) => w + ' → ' + Number(a.toFixed(4))).join('；') : summaryValue(typeof value === 'number' ? Number(value.toFixed(4)) : value) }));
    let conditionNote = suspended ? '拆解或隔离时暂停光路；装配复位后继续。' : summaryValue(c?.limitations || caseFile?.limitations || caseFile?.conditions || '代表光路仅适用于当前列出的教学参数；不代表厂商实测处方。');
    if (state.view === 'optics' && !suspended) conditionNote += ' 光路采用透视叠加显示。';
    if (manifest.materialAppearanceNote && !suspended) conditionNote += ' ' + manifest.materialAppearanceNote;
    const legend = [], seen = new Set();
    for (const path of displayPaths(instrument, c?.paths)) {
      const label = path.label || (path.wavelengthNm ? path.wavelengthNm + ' nm' : KIND_LABELS[path.kind] || path.kind);
      if (!label || seen.has(label)) continue;
      seen.add(label); legend.push({ label, color: path.color || '#c29642' });
      if (seen.size >= 8) break;
    }
    const part = chosen();
    return { status: 'ready', state: { ...state }, suspended, controls: measureControls(),
      cases: caseFile.cases.map(item => ({ id: item.id, label: item.label })),
      currentCase: { label: c?.label || '', description: c?.description || '', readout, conditionNote, legend },
      parts: parts.filter(p => !p.teachingOverlay).map(p => ({ id: p.id, label: p.label })),
      selected: part ? { id: part.id, label: part.label, note: part.note || part.evidenceNote || part.label } : null,
      boundary: caseFile.scope || sources.scope || '公开资料支持的教学候选，内部尺寸与参数非厂商实测处方。',
      sources: (Array.isArray(sources) ? sources : sources.sources || sources.references || []).map(s => ({ title: s.title || s.name || '参考资料', url: s.url || null, note: s.locator || s.pages || s.role || '' })) };
  }
  function apply() {
    if (!root) return;
    restore();
    const c = currentCase();
    for (const part of parts) {
      const offset = c?.partOffsets?.[part.id] || [0, 0, 0], explode = (part.explodeOffset || [0, 0, 0]).map(n => n * state.explode);
      applyPose(part, offset.map((n, i) => n + explode[i]), c?.partRotations?.[part.id]);
      if (external && instrument === 'refractometer') {
        if (part.id === 'power_switch' && external.power) applyPose(part, [-.0008, 0, 0]);
        if (part.id === 'cover' && external.cover === 'closed') applyPose(part, [0, 0, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(100)).toArray(), part.pivot);
        if (part.id === 'isotropic_sample' && external.angle) applyPose(part, [0, 0, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...manifest.contactWindow.normal), THREE.MathUtils.degToRad(external.angle)).toArray(), part.pivot);
      }
    }
    applyControls();
    root.updateMatrixWorld(true);
    for (const part of parts) part.object.visible = (external?.partVisibility?.[part.id] ?? c?.partVisibility?.[part.id] ?? part.defaultVisible) !== false && !part.teachingOverlay
      && (!state.isolated || part.id === state.selectedId || chosen()?.object.parent === part.object);
    for (const [material, base] of materials) {
      material.opacity = base.opacity; material.transparent = base.transparent; material.depthWrite = base.depthWrite;
      if ('transmission' in material) material.transmission = base.transmission;
    }
    if (state.view === 'optics' && !state.isolated) {
      for (const part of parts.filter(p => p.transparentShell || (manifest.transparentShellParts || []).includes(p.id) || (SHELL_PARTS[instrument] || []).includes(p.id)))
        part.object.traverse(o => { if (!o.isMesh) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.opacity = .11; m.transparent = true; m.depthWrite = false; } });
      for (const [m, base] of materials) if (base.transmission > 0) { m.transmission = 0; m.opacity = .22; m.transparent = true; m.depthWrite = false; }
    }
    if (external && instrument === 'refractometer') {
      parts.find(p => p.id === 'internal_light')?.object.traverse(o => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.emissive) {
          m.emissive.set(external.power ? '#d39323' : '#000000'); m.emissiveIntensity = external.power ? .65 : 0;
        }
      });
    }
    clearHelpers();
    const suspended = state.isolated || state.explode > 0;
    if (!suspended) {
      for (const m of c?.teachingMeshes || []) makeTeachingMesh(m);
      if (state.rays) for (const path of displayPaths(instrument, c?.paths)) makeLine(path);
      if (sample) makeSampleOverlay();
    }
    canvas.dataset.controls = JSON.stringify(measureControls());
    canvas.dataset.displayPaths = JSON.stringify(suspended || !state.rays ? [] : displayPaths(instrument, c?.paths).map(p => ({ id: p.id, kind: p.kind, color: p.color })));
    if (external) canvas.dataset.operation = JSON.stringify({ power: external.power, cover: external.cover, angle: external.angle, partVisibility: external.partVisibility });
    else delete canvas.dataset.operation;
    canvas.dataset.state = JSON.stringify(state); canvas.dataset.selectedPart = state.selectedId || '';
    canvas.dataset.case = JSON.stringify({ id: c?.id, pathCount: c?.paths?.length || 0, visiblePathCount: suspended || !state.rays ? 0 : (c?.paths?.length || 0), suspended });
    onChange?.(describe());
  }
  function update(patch, refit = false) {
    if (!root) return;
    state = { ...state, ...patch }; apply(); if (refit) fit();
  }
  function select(id) { update({ selectedId: id }); if (chosen()) fitBox(bounds([chosen().object])); }
  async function json(url) { const response = await fetch(url); if (!response.ok) throw Error(`${response.status}: ${url}`); return response.json(); }
  async function load() {
    try {
      onChange?.({ status: 'loading' });
      const [mf, cf, sf] = await Promise.all([json(assetBase + 'manifest.json'), json(assetBase + 'optical-cases.json'), json(assetBase + 'sources.json')]);
      const response = await fetch(assetBase + (mf.model || 'model.glb') + '?sha=' + encodeURIComponent(mf.modelSha256 || ''));
      if (!response.ok) throw Error('模型读取失败 ' + response.status);
      const bytes = await response.arrayBuffer();
      if (mf.modelBytes !== undefined && mf.modelBytes !== bytes.byteLength) throw Error('模型大小与清单不一致');
      if (crypto.subtle && mf.modelSha256) {
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
        if (hash !== mf.modelSha256) throw Error('模型与清单版本不一致');
      }
      const asset = await new GLTFLoader().parseAsync(bytes, assetBase);
      if (disposed) { disposeTree(asset.scene); return; }
      if (!cf.cases?.length) throw Error('没有可用光路示例');
      manifest = mf; caseFile = cf; sources = sf; root = asset.scene; scene.add(root); root.updateMatrixWorld(true);
      modelExtent = bounds([root]).getSize(new THREE.Vector3()).length();
      parts = mf.parts.map(p => ({ ...p, object: root.getObjectByName(p.node) }));
      const missing = parts.filter(p => !p.object);
      if (missing.length) throw Error('缺少部件：' + missing.map(p => p.id).join('、'));
      for (const part of parts) originalPoses.set(part.object, { position: part.object.position.clone(), quaternion: part.object.quaternion.clone(), scale: part.object.scale.clone() });
      root.traverse(o => {
        if (!o.isMesh) return;
        o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.set(m, { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite, transmission: m.transmission });
      });
      state = { ...state, caseId: external?.caseId || cf.defaultCaseId || cf.cases[0].id };
      canvas.dataset.modelSha256 = mf.modelSha256 || ''; canvas.dataset.assetVersion = mf.version || ''; canvas.dataset.partCount = String(parts.length);
      resize(); apply(); fit(); canvas.dataset.loaded = 'true';
    } catch (error) {
      if (disposed) return;
      canvas.dataset.error = String(error); console.error(error);
      onChange?.({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }
  let pointerDown;
  const onPointerDown = e => { pointerDown = [e.clientX, e.clientY]; };
  const onPointerUp = e => {
    if (!root || !pointerDown || Math.hypot(e.clientX - pointerDown[0], e.clientY - pointerDown[1]) > 4) return;
    const rect = canvas.getBoundingClientRect(), p = new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(p, camera);
    const hit = raycaster.intersectObject(root, true).find(h => isShown(h.object));
    if (!hit) return;
    for (let o = hit.object; o; o = o.parent) { const part = parts.find(item => item.object === o && !item.teachingOverlay); if (part) { select(part.id); break; } }
  };
  canvas.addEventListener('pointerdown', onPointerDown); canvas.addEventListener('pointerup', onPointerUp);
  function resize() {
    const r = container.getBoundingClientRect(); if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
    helpers.traverse(o => { if (o.material?.isLineMaterial) o.material.resolution.set(r.width, r.height); });
    fit();
  }
  const observer = new ResizeObserver(resize); observer.observe(container);
  function animate() { if (disposed) return; animationFrame = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
  function dispose() {
    if (disposed) return; disposed = true;
    cancelAnimationFrame(animationFrame); observer.disconnect(); controls.dispose();
    canvas.removeEventListener('pointerdown', onPointerDown); canvas.removeEventListener('pointerup', onPointerUp);
    disposeTree(root); disposeTree(helpers); env.texture.dispose(); renderer.dispose(); canvas.remove();
  }
  animate(); load();
  return {
    setState: patch => {
      external = patch;
      state = { ...state, caseId: patch.caseId, rays: patch.rays ?? state.rays };
      apply();
    },
    setView: view => update({ view }, true),
    setCase: caseId => update({ caseId, explode: 0, isolated: false, selectedId: null }, true),
    setRays: rays => update({ rays }),
    setExplode: explode => update({ explode }, true),
    toggleIsolate: () => update({ isolated: !state.isolated }, true),
    select, focusSelected: () => { if (chosen()) fitBox(bounds([chosen().object])); },
    setControls: patch => { positions = { ...positions, ...patch }; apply(); },
    setSample: next => { const refit = !!next !== !!sample; sample = next; apply(); if (refit) fit(); },
    focusParts: (ids, view = state.view, direction = null) => {
      update({ view });
      const objects = parts.filter(p => ids.includes(p.id)).map(p => p.object);
      if (objects.length) fitBox(bounds(objects), direction && new THREE.Vector3(...direction).transformDirection(root.matrixWorld));
    },
    fit, reset: () => { external = null; update({ view: 'optics', caseId: caseFile.defaultCaseId || caseFile.cases[0].id, rays: true, explode: 0, selectedId: null, isolated: false }, true); },
    dispose,
  };
}
