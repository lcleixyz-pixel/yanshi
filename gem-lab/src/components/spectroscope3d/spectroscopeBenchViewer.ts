import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { SampleDef } from '../../data/types';
import { getPolariscopeProfile } from '../../domain/polariscopeSamples';
import { BENCH_GEOMETRY, benchLampPose, benchScopePose, normalizeBenchState, type BenchEvaluation, type BenchState } from '../../domain/spectroscopeBench';

export interface BenchViewerCallbacks {
  onStatus(status: 'loading' | 'ready' | 'error', message?: string): void;
  onSelect?(part: string): void;
  /** 在三维中直接拖动灯头、狭缝调节环或目镜套筒时回报新的数值（与滑杆同一字段）。 */
  onAdjust?(patch: Partial<Pick<BenchState, 'lampLateral' | 'slit' | 'focus'>>): void;
}
export interface BenchSpecimenAppearance { color: string; shape: string }

/** 场景中样品的体色与形态：体色取偏光镜样品档案的线性透过率，转为 sRGB。 */
export function benchSpecimenAppearance(sample: SampleDef): BenchSpecimenAppearance {
  const rgb = getPolariscopeProfile(sample.id)?.bodyColor ?? [0.65, 0.24, 0.2];
  return { color: `#${rgb.map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255).toString(16).padStart(2, '0')).join('')}`, shape: sample.refractometerShape };
}
export interface SpectroscopeBenchViewer {
  update(state: BenchState, evaluation: BenchEvaluation, specimen: BenchSpecimenAppearance): void;
  focus(view: 'whole' | 'lamp' | 'sample' | 'instrument'): void;
  setBeams(visible: boolean): void;
  dispose(): void;
}

interface PartManifest {
  id: string;
  node: string;
  label?: string;
  defaultVisible?: boolean;
  translatable?: boolean;
  translationAxisLocal?: number[];
  translationRange?: number[];
  rotationAxisLocal?: number[];
  rotationRangeDegrees?: number[];
  rotatable?: boolean;
  drivenBy?: string;
}
interface AssetManifest {
  parts: PartManifest[];
  lamp?: { apertureDiameterMeters?: number };
  fiber?: { points: number[][]; headAttachmentLocal: number[]; radiusMeters: number };
  controlLinkages?: { type: string; closedStopGapMeters: number; drivenParts: string[] }[];
}
interface LoadedAsset { root: THREE.Group; manifest: AssetManifest }
interface Pose { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }

const AXIS_Y = BENCH_GEOMETRY.sampleCenterY;
const VERTICAL_GRIP = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
const BASE = import.meta.env.BASE_URL;
const assetPath = (path: string) => `${BASE.endsWith('/') ? BASE : `${BASE}/`}assets/3d/${path}`;
const vec = (values: number[]) => new THREE.Vector3(values[0], values[1], values[2]);
const meshes = (root: THREE.Object3D, callback: (mesh: THREE.Mesh) => void) => root.traverse((object) => {
  if ((object as THREE.Mesh).isMesh) callback(object as THREE.Mesh);
});
const materials = (mesh: THREE.Mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material];

function disposeTree(root: THREE.Object3D) {
  const geometry = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.geometry || !mesh.material) return;
    geometry.add(mesh.geometry);
    for (const material of materials(mesh)) {
      mats.add(material);
      for (const value of Object.values(material)) if (value && typeof value === 'object' && 'isTexture' in value) textures.add(value as THREE.Texture);
    }
  });
  geometry.forEach((item) => item.dispose());
  textures.forEach((item) => item.dispose());
  mats.forEach((item) => item.dispose());
}

/** A versioned GLB scene. Dynamic specimen, light paths and cable are explicitly teaching overlays. */
export function createSpectroscopeBenchViewer(host: HTMLElement, callbacks: BenchViewerCallbacks): SpectroscopeBenchViewer {
  callbacks.onStatus('loading', '正在载入光源、镊子与两支分光镜…');
  let disposed = false;
  let failed = false;
  let ready = false;
  let animation = 0;
  let beamsEnabled = true;
  let current: { state: BenchState; evaluation: BenchEvaluation; specimen: BenchSpecimenAppearance } | null = null;
  let appearanceKey = '';
  let fiberKey = '';
  let optics: { incidentEnd: THREE.Vector3; incidentHit: THREE.Vector3 | null; sampleExit: THREE.Vector3 | null; internalBounce: THREE.Vector3 | null; entry: THREE.Vector3; axis: THREE.Vector3 } | null = null;
  let bench: LoadedAsset | null = null;
  const instrument: Partial<Record<'prism' | 'grating', LoadedAsset>> = {};
  const poses = new Map<THREE.Object3D, Pose>();
  const loadedRoots = new Set<THREE.Group>();
  const abort = new AbortController();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eaf0ef');
  scene.fog = new THREE.Fog('#eaf0ef', 1.8, 4.2);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.001, 8);
  camera.position.set(0.63, 0.44, 0.35);
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    callbacks.onStatus('error', '当前浏览器无法启动 3D 图形；请使用二维观察区，或重新载入后再试。');
    return { update() {}, focus() {}, setBeams() {}, dispose() {} };
  }
  // 手机默认流畅画质（同偏光镜）：降低像素比与阴影开销；遵守系统「减少动效」。
  const phone = window.matchMedia('(max-width: 680px)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = phone ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline-offset:-3px;';
  canvas.dataset.testid = 'spectroscope-bench-canvas';
  canvas.dataset.loaded = 'false';
  canvas.dataset.renderedInstrument = '';
  canvas.setAttribute('aria-label', '手持分光镜、光源与镊子的三维观察；拖动旋转，滚轮缩放');
  canvas.tabIndex = 0;
  host.append(canvas);
  const handLabel = document.createElement('span');
  handLabel.textContent = '手持分光镜 · 示意';
  handLabel.style.cssText = 'position:absolute;pointer-events:none;z-index:1;padding:4px 7px;border:1px solid #c9d5d0;border-radius:5px;background:#f7faf8e8;color:#53645d;font:11px/1.2 system-ui,sans-serif;white-space:nowrap;transform:translate(-50%,-100%);display:none;';
  host.append(handLabel);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(-0.055, 0.075, 0.006);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.035;
  controls.maxDistance = 1.65;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, 0.035);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.6;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xf4fbff, 0x63726c, 1.45));
  const key = new THREE.DirectionalLight(0xfff7e9, 3.5);
  key.position.set(-0.32, 0.8, 0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -0.55, right: 0.55, top: 0.5, bottom: -0.5, near: 0.05, far: 2.2 });
  key.shadow.bias = -0.00012;
  key.shadow.normalBias = 0.001;
  key.shadow.radius = 3;
  key.target.position.set(-0.06, 0.05, 0);
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xd9ebff, 1.7);
  fill.position.set(0.6, 0.35, -0.2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2);
  rim.position.set(-0.5, 0.25, -0.55);
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshStandardMaterial({ color: '#dce5e1', roughness: 0.96 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  floor.receiveShadow = true;
  scene.add(floor);

  const dynamic = new THREE.Group();
  dynamic.name = 'Bench_runtime_overlays';
  const specimenGroup = new THREE.Group();
  specimenGroup.name = 'Bench_teaching_specimen';
  specimenGroup.userData.part = 'sample';
  specimenGroup.userData.label = '教学样品';
  const fiberGroup = new THREE.Group();
  fiberGroup.name = 'Bench_runtime_fiber';
  fiberGroup.userData.part = 'fiberCable';
  fiberGroup.userData.label = '柔性光纤导光束';
  let rays = new THREE.Group();
  rays.name = 'Bench_teaching_light_paths';
  dynamic.add(specimenGroup, fiberGroup, rays);
  scene.add(dynamic);

  let transition: { start: number; fromPosition: THREE.Vector3; toPosition: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3 } | null = null;
  const cancelTransition = () => { transition = null; };
  controls.addEventListener('start', cancelTransition);
  const resize = () => {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  const getNode = (name: string) => bench?.root.getObjectByName(name);
  const original = (object: THREE.Object3D) => poses.get(object)!;
  function register(asset: LoadedAsset) {
    scene.add(asset.root);
    asset.root.traverse((node) => poses.set(node, { position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() }));
    meshes(asset.root, (mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; });
    for (const part of asset.manifest.parts) {
      const node = asset.root.getObjectByName(part.node);
      if (!node) throw new Error(`模型缺少部件：${part.node}`);
      node.userData.part = part.id;
      node.userData.label = part.label ?? part.id;
      if (part.defaultVisible === false) node.visible = false;
    }
  }
  function resetNode(object: THREE.Object3D | undefined) {
    if (!object) return;
    const pose = poses.get(object);
    if (pose) { object.position.copy(pose.position); object.quaternion.copy(pose.quaternion); object.scale.copy(pose.scale); }
  }
  function cloneEmissiveMaterials(object: THREE.Object3D | undefined) {
    if (!object) return;
    meshes(object, (mesh) => { mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone(); });
  }
  function glow(object: THREE.Object3D | undefined, color: THREE.ColorRepresentation, intensity: number) {
    if (!object) return;
    meshes(object, (mesh) => materials(mesh).forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial) { material.emissive.set(color); material.emissiveIntensity = intensity; }
    }));
  }

  function specimenGeometry(shape: string): THREE.BufferGeometry {
    if (shape === 'cabochon') {
      // Smooth oval cabochon, with a planar base and a separate low girdle in the shared material.
      const points: THREE.Vector2[] = [new THREE.Vector2(0, -0.005), new THREE.Vector2(0.0105, -0.005)];
      for (let i = 0; i <= 22; i++) {
        const theta = i / 22 * Math.PI / 2;
        points.push(new THREE.Vector2(0.012 * Math.cos(theta), -0.0038 + 0.0118 * Math.sin(theta)));
      }
      return new THREE.LatheGeometry(points, 72);
    }
    if (shape === 'fancy') {
      const geo = new THREE.DodecahedronGeometry(0.012, 0);
      geo.scale(0.9, 1.1, 0.76);
      return geo;
    }
    if (shape === 'carved') {
      const geo = new THREE.TorusGeometry(0.0087, 0.0037, 20, 72);
      geo.rotateX(Math.PI / 2);
      return geo;
    }
    // Original round brilliant teaching topology: table, crown, girdle and pavilion facets.
    const ring = (radius: number, height: number, count: number, phase: number) => Array.from({ length: count }, (_, i) => new THREE.Vector3(radius * Math.cos(i * Math.PI * 2 / count + phase), height, radius * Math.sin(i * Math.PI * 2 / count + phase)));
    const table = ring(0.0062, 0.0064, 8, Math.PI / 8);
    const crown = ring(0.0093, 0.0038, 16, 0);
    const girdle = ring(0.012, 0.0004, 16, 0);
    const lower = ring(0.012, -0.0004, 16, 0);
    const bottom = new THREE.Vector3(0, -0.008, 0);
    const triangles: number[] = [];
    const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => triangles.push(...a.toArray(), ...b.toArray(), ...c.toArray());
    const tableCenter = new THREE.Vector3(0, 0.0064, 0);
    for (let i = 0; i < 8; i++) tri(tableCenter, table[(i + 1) % 8], table[i]);
    for (let i = 0; i < 16; i++) {
      const next = (i + 1) % 16;
      const top = table[Math.floor(i / 2) % 8];
      tri(top, crown[next], crown[i]);
      if (i % 2 === 1) tri(top, table[(Math.floor(i / 2) + 1) % 8], crown[next]);
      tri(crown[i], crown[next], girdle[i]);
      tri(crown[next], girdle[next], girdle[i]);
      tri(girdle[i], girdle[next], lower[i]);
      tri(girdle[next], lower[next], lower[i]);
      tri(lower[i], lower[next], bottom);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
  function updateSpecimen(appearance: BenchSpecimenAppearance, transmission: BenchEvaluation['specimenTransmission']) {
    const nextKey = `${appearance.color}/${appearance.shape}/${transmission}`;
    if (nextKey === appearanceKey) return;
    appearanceKey = nextKey;
    for (const child of [...specimenGroup.children]) { specimenGroup.remove(child); disposeTree(child); }
    const material = new THREE.MeshPhysicalMaterial({
      color: appearance.color, metalness: 0, roughness: 0.13, clearcoat: 1, clearcoatRoughness: 0.065,
      transmission: transmission === 'opaque' ? 0 : transmission === 'clear' ? 0.36 : 0.12, thickness: 0.012, ior: 1.62,
      attenuationColor: new THREE.Color(appearance.color), attenuationDistance: 0.055,
      transparent: false, side: THREE.DoubleSide, envMapIntensity: 1.4,
    });
    const specimen = new THREE.Mesh(specimenGeometry(appearance.shape), material);
    specimen.name = `Teaching_specimen_${appearance.shape}`;
    specimen.castShadow = true;
    specimen.receiveShadow = true;
    specimenGroup.add(specimen);
  }
  function updateFiber(head: THREE.Object3D) {
    const worldPosition = head.getWorldPosition(new THREE.Vector3());
    const worldQuaternion = head.getWorldQuaternion(new THREE.Quaternion());
    const nextKey = [...worldPosition.toArray(), ...worldQuaternion.toArray()].map((value) => value.toFixed(6)).join('/');
    if (nextKey === fiberKey) return;
    fiberKey = nextKey;
    const definition = bench?.manifest.fiber;
    if (!definition) throw new Error('工作台缺少光纤连接定义');
    const end = head.localToWorld(vec(definition.headAttachmentLocal));
    const rear = new THREE.Vector3(0, 0, -1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
    const points = definition.points.slice(0, -2).map(vec);
    points.push(end.clone().addScaledVector(rear, 0.055), end);
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.4);
    const geometry = new THREE.TubeGeometry(curve, 120, definition.radiusMeters, 12, false);
    const existing = fiberGroup.children[0] as THREE.Mesh | undefined;
    if (existing) { existing.geometry.dispose(); existing.geometry = geometry; }
    else {
      const cable = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#182628', metalness: 0.18, roughness: 0.5 }));
      cable.castShadow = true;
      cable.receiveShadow = true;
      fiberGroup.add(cable);
    }
  }

  function coneBetween(a: THREE.Vector3, b: THREE.Vector3, startRadius: number, endRadius: number, color: THREE.ColorRepresentation, opacity: number, centerLine = true) {
    const length = a.distanceTo(b);
    if (length < 0.00001) return;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(endRadius, startRadius, length, 32, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    mesh.position.copy(a).lerp(b, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    rays.add(mesh);
    if (centerLine) {
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.00022, 0.00022, length, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false }));
      line.position.copy(mesh.position);
      line.quaternion.copy(mesh.quaternion);
      rays.add(line);
    }
  }
  function updateOpticalGeometry(state: BenchState, evaluation: BenchEvaluation, active: LoadedAsset) {
    const reflected = state.method !== 'transmission';
    const head = getNode('Bench_lampHead')!;
    const emitter = getNode('Bench_lampEmitter')!;
    const start = emitter.getWorldPosition(new THREE.Vector3());
    const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
    const cast = new THREE.Raycaster(start, direction, 0, 0.5);
    const stoneHit = state.samplePlaced ? cast.intersectObject(specimenGroup, true)[0]?.point ?? null : null;
    const table = getNode('Bench_reflectionTable');
    const tableHit = table?.visible ? cast.intersectObject(table, true)[0]?.point ?? null : null;
    const incidentHit = stoneHit && (!tableHit || start.distanceTo(stoneHit) <= start.distanceTo(tableHit)) ? stoneHit : null;
    const atPlane = new THREE.Vector3(evaluation.beamXAtSample, evaluation.beamYAtSample, evaluation.beamZAtSample);
    const incidentEnd = incidentHit?.clone() ?? tableHit?.clone() ?? atPlane;
    const nominal = benchScopePose(state);
    const axis = vec([...nominal.axis]);
    let sampleExit: THREE.Vector3 | null = null;
    let internalBounce: THREE.Vector3 | null = null;
    // Ray/mesh intersections only locate the illustrative path endpoints; this is not refraction tracing.
    if (state.samplePlaced) {
      if (state.method === 'surface-reflection') sampleExit = incidentHit?.clone() ?? null;
      else {
        const center = new THREE.Vector3(evaluation.sampleX, AXIS_Y, 0);
        sampleExit = new THREE.Raycaster(center.clone().addScaledVector(axis, 0.08), axis.clone().negate(), 0, 0.16)
          .intersectObject(specimenGroup, true)[0]?.point ?? null;
        if (state.method === 'internal-reflection' && incidentHit && sampleExit) {
          const bottom = new THREE.Box3().setFromObject(specimenGroup).min.y;
          internalBounce = new THREE.Vector3(evaluation.sampleX, bottom + 0.00018, 0);
        }
      }
    }
    const scopeTarget: [number, number, number] = reflected && sampleExit
      ? [0, sampleExit.y, sampleExit.z] : [0, AXIS_Y, 0];
    const scope = benchScopePose(state, scopeTarget);
    const entry = vec([...scope.entry]);
    active.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    // Existing model entry ports are 47.5 / 27.5 mm behind their original model origins.
    const localEntry = new THREE.Vector3(0, 0, state.dispersion === 'prism' ? -0.0475 : -0.0275);
    active.root.position.copy(entry).sub(localEntry.applyQuaternion(active.root.quaternion));
    optics = { incidentEnd, incidentHit, sampleExit, internalBounce, entry, axis };
  }

  function updateRays(state: BenchState, evaluation: BenchEvaluation, appearance: BenchSpecimenAppearance) {
    dynamic.remove(rays);
    disposeTree(rays);
    rays = new THREE.Group();
    rays.name = 'Bench_teaching_light_paths';
    rays.visible = beamsEnabled;
    dynamic.add(rays);
    if (!state.power || state.brightness <= 0.025 || !optics) return;
    const emitter = getNode('Bench_lampEmitter');
    if (!emitter) return;
    const start = emitter.getWorldPosition(new THREE.Vector3());
    const incidentEnd = !state.samplePlaced && evaluation.lightPath === 'bypass' ? optics.entry : optics.incidentEnd;
    const intensity = 0.025 + state.brightness * 0.035;
    const lampRadius = (bench?.manifest.lamp?.apertureDiameterMeters ?? 0.003) / 2;
    coneBetween(start, incidentEnd, lampRadius, state.method === 'transmission' ? 0.014 : 0.0055, '#fff4d8', intensity);
    if (!state.samplePlaced || !optics.incidentHit || !optics.sampleExit
      || ['missed', 'off', 'blocked'].includes(evaluation.lightPath)) return;
    if (state.method === 'internal-reflection' && optics.internalBounce) {
      // Pavilion entry → inside of the downward table facet → opposite pavilion exit. Schematic only.
      const points = [optics.incidentHit, optics.internalBounce, optics.sampleExit];
      // Solid screen-legible geometry, rather than WebGL linewidth: the blue is a path annotation, not spectral colour.
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const direction = b.clone().sub(a).normalize();
        const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        const material = new THREE.MeshBasicMaterial({ color: '#164c68', depthTest: false, depthWrite: false, transparent: true, opacity: 1 });
        const segment = new THREE.Mesh(new THREE.CylinderGeometry(0.00033, 0.00033, a.distanceTo(b), 10), material);
        segment.position.copy(a).lerp(b, 0.5);
        segment.quaternion.copy(rotation);
        segment.renderOrder = 12;
        rays.add(segment);
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.0009, 0.0022, 12), material);
        arrow.position.copy(a).lerp(b, 0.59);
        arrow.quaternion.copy(rotation);
        arrow.renderOrder = 13;
        rays.add(arrow);
      }
    }
    const tint = new THREE.Color('#fffaf0').lerp(new THREE.Color(appearance.color), 0.19);
    coneBetween(optics.sampleExit, optics.entry, 0.004, 0.004, state.method === 'transmission' ? tint : '#eee9d9', evaluation.signal === 'weak' ? 0.035 : 0.065);
  }

  function instrumentControls(asset: LoadedAsset, state: BenchState) {
    for (const part of asset.manifest.parts) {
      const object = asset.root.getObjectByName(part.node);
      if (!object) continue;
      resetNode(object);
      const value = part.id === 'slitControl' || part.drivenBy === 'slitControl' ? state.slit : part.id === 'focusTube' ? state.focus : undefined;
      if (value === undefined) continue;
      if (part.rotatable && part.rotationRangeDegrees && part.rotationAxisLocal) {
        const [min, max] = part.rotationRangeDegrees;
        object.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(vec(part.rotationAxisLocal), THREE.MathUtils.degToRad(min + (max - min) * value)));
      }
      if (part.translatable && part.translationRange && part.translationAxisLocal) {
        const [min, max] = part.translationRange;
        object.position.addScaledVector(vec(part.translationAxisLocal), min + (max - min) * value);
      }
    }
  }
  function actualMeasurements(asset: LoadedAsset, state: BenchState) {
    scene.updateMatrixWorld(true);
    const head = getNode('Bench_lampHead')!;
    const position = new THREE.Vector3();
    canvas.dataset.lampX = head.getWorldPosition(position).x.toFixed(6);
    canvas.dataset.lampY = head.getWorldPosition(position).y.toFixed(6);
    canvas.dataset.lampZ = head.getWorldPosition(position).z.toFixed(6);
    const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
    const pitch = THREE.MathUtils.radToDeg(Math.atan2(-direction.y, Math.hypot(direction.x, direction.z)));
    canvas.dataset.lampAngle = (state.method === 'transmission' ? THREE.MathUtils.radToDeg(Math.atan2(direction.x, direction.z)) : pitch).toFixed(3);
    canvas.dataset.lampPitch = pitch.toFixed(3);
    for (const [axis, value] of [['X', direction.x], ['Y', direction.y], ['Z', direction.z]] as const) canvas.dataset[`lampDir${axis}`] = value.toFixed(6);
    const scopeEntry = asset.root.localToWorld(new THREE.Vector3(0, 0, state.dispersion === 'prism' ? -0.0475 : -0.0275));
    const scopeAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(asset.root.getWorldQuaternion(new THREE.Quaternion()));
    for (const [key, point] of [['scopeEntry', scopeEntry], ['scopeAxis', scopeAxis], ['incidentHit', optics?.incidentHit], ['sampleExit', optics?.sampleExit]] as const) {
      for (const axis of ['x', 'y', 'z'] as const) canvas.dataset[`${key}${axis.toUpperCase()}`] = point ? point[axis].toFixed(6) : 'none';
    }
    canvas.dataset.scopeElevation = THREE.MathUtils.radToDeg(Math.atan2(scopeAxis.y, Math.hypot(scopeAxis.x, scopeAxis.z))).toFixed(3);
    canvas.dataset.internalBounceY = optics?.internalBounce ? optics.internalBounce.y.toFixed(6) : 'none';
    canvas.dataset.sampleX = specimenGroup.getWorldPosition(position).x.toFixed(6);
    canvas.dataset.samplePlaced = String(state.samplePlaced);
    canvas.dataset.tweezersVisible = String(getNode('Bench_tweezers')?.visible ?? false);
    canvas.dataset.tableVisible = String(getNode('Bench_reflectionTable')?.visible ?? false);
    const table = getNode('Bench_reflectionTable');
    canvas.dataset.tableTopY = table?.visible ? new THREE.Box3().setFromObject(table).max.y.toFixed(6) : 'hidden';
    canvas.dataset.sampleBottomY = new THREE.Box3().setFromObject(specimenGroup).min.y.toFixed(6);
    const tipA = getNode('Bench_tweezerTipA');
    const tipB = getNode('Bench_tweezerTipB');
    if (tipA && tipB) {
      const axis = canvas.dataset.tweezerGrip === 'vertical' ? 'x' : 'z';
      canvas.dataset.tweezerGap = (new THREE.Box3().setFromObject(tipA).min[axis] - new THREE.Box3().setFromObject(tipB).max[axis]).toFixed(6);
    }
    canvas.dataset.assetVersion = 'simple-v2';
    canvas.dataset.renderedInstrument = state.dispersion;
    const byId = (id: string) => {
      const part = asset.manifest.parts.find((item) => item.id === id);
      return part ? asset.root.getObjectByName(part.node) : undefined;
    };
    const focus = byId('focusTube');
    canvas.dataset.focusZ = focus ? focus.getWorldPosition(position).z.toFixed(6) : 'fixed';
    const link = asset.manifest.controlLinkages?.find((item) => item.type === 'symmetricSlit');
    if (link) {
      const opened = link.drivenParts.reduce((sum, id) => {
        const node = byId(id);
        return node ? sum + node.position.distanceTo(original(node).position) : sum;
      }, 0);
      canvas.dataset.slitGap = (link.closedStopGapMeters + opened).toFixed(7);
    } else canvas.dataset.slitGap = 'fixed';
    canvas.dataset.tweezersInBeam = String(tweezersInBeam(state));
    canvas.dataset.lightPath = current?.evaluation.lightPath ?? '';
    canvas.dataset.beamsVisible = String(beamsEnabled);
  }
  /** 透射时从灯口到入光口取光束中心与四周 3 mm 的五条线，检查镊子是否挡在光路上。 */
  function tweezersInBeam(state: BenchState) {
    const tweezers = getNode('Bench_tweezers');
    if (state.method !== 'transmission' || !state.samplePlaced || !tweezers?.visible || !optics) return false;
    const start = getNode('Bench_lampEmitter')!.getWorldPosition(new THREE.Vector3());
    const span = optics.entry.clone().sub(start);
    const along = span.clone().normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(along).normalize();
    const up = along.clone().cross(side).normalize();
    return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => {
      const origin = start.clone().addScaledVector(side, a * 0.003).addScaledVector(up, b * 0.003);
      return new THREE.Raycaster(origin, along, 0, span.length()).intersectObject(tweezers, true).length > 0;
    });
  }
  function apply() {
    if (!ready || !current || !bench || failed || disposed) return;
    const { state: rawState, evaluation, specimen } = current;
    const state = normalizeBenchState(rawState);
    const head = getNode('Bench_lampHead')!;
    const lampPose = benchLampPose(state);
    resetNode(head);
    head.position.x = state.lampLateral * BENCH_GEOMETRY.lateralScale;
    head.position.y = lampPose.pivotY;
    head.position.z = lampPose.pivotZ;
    head.rotation.set(lampPose.worldPitch, lampPose.worldYaw, 0);
    const power = getNode('Bench_powerSwitch')!;
    resetNode(power);
    power.rotation.x = THREE.MathUtils.degToRad(state.power ? 12 : -12);
    const dimmer = getNode('Bench_dimmerKnob')!;
    resetNode(dimmer);
    // The reference illuminator combines the power detent and brightness in one dial.
    dimmer.rotation.z = THREE.MathUtils.degToRad(state.power ? -125 + state.brightness * 260 : -135);
    glow(getNode('Bench_lampEmitter'), '#fff3d3', state.power ? state.brightness * 1.9 : 0);
    glow(getNode('Source_indicator_lens'), '#ef3b30', state.power ? 1.8 : 0);
    for (const mode of ['prism', 'grating'] as const) if (instrument[mode]) instrument[mode]!.root.visible = mode === state.dispersion;
    const active = instrument[state.dispersion]!;
    instrumentControls(active, state);
    updateSpecimen(specimen, evaluation.specimenTransmission);
    specimenGroup.position.set(state.samplePlaced ? evaluation.sampleX : 0.075, state.samplePlaced ? AXIS_Y : 0.012, state.samplePlaced ? 0 : 0.085);
    // Both reflection methods rest a faceted stone on its broad table, not on the culet.
    specimenGroup.rotation.x = state.method !== 'transmission' && specimen.shape === 'faceted' ? Math.PI : 0;
    specimenGroup.rotation.y = THREE.MathUtils.degToRad(state.sampleRotation);
    scene.updateMatrixWorld(true);
    const sampleBounds = new THREE.Box3().setFromObject(specimenGroup);
    const tweezers = getNode('Bench_tweezers')!;
    resetNode(tweezers);
    tweezers.visible = state.method === 'transmission';
    tweezers.position.set(state.samplePlaced ? evaluation.sampleX : 0.09, state.samplePlaced ? AXIS_Y : 0.018, state.samplePlaced ? 0 : 0.02);
    // 透射夹样时镊子竖起、手柄朝上，镊尖从左右两侧夹住腰棱，夹持方向与光轴垂直，光路从两镊尖之间穿过。
    // 资产中镊子沿 +X 伸出、沿 Z 夹合；竖持即把局部 X 转到 +Y、局部 Z 转到 +X。未夹样时平放在台面上。
    const vertical = state.samplePlaced && tweezers.visible;
    if (vertical) tweezers.quaternion.premultiply(VERTICAL_GRIP);
    const grip = vertical ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const contactRay = new THREE.Raycaster(specimenGroup.position.clone().addScaledVector(grip, 0.05), grip.clone().negate(), 0, 0.1);
    const contact = contactRay.intersectObject(specimenGroup, true)[0];
    const halfDepth = contact ? Math.abs(contact.point.clone().sub(specimenGroup.position).dot(grip))
      : (vertical ? sampleBounds.max.x - sampleBounds.min.x : sampleBounds.max.z - sampleBounds.min.z) / 2;
    canvas.dataset.tweezerGrip = vertical ? 'vertical' : tweezers.visible ? 'resting' : 'hidden';
    for (const [name, sign] of [['Bench_tweezerJawA', 1], ['Bench_tweezerJawB', -1]] as const) {
      const jaw = getNode(name);
      resetNode(jaw);
      if (jaw) jaw.rotation.y = sign * (state.samplePlaced ? Math.asin(Math.max(-0.045, Math.min(0.07, (halfDepth + 0.00036 - 0.007) / 0.145))) : THREE.MathUtils.degToRad(4));
    }
    const table = getNode('Bench_reflectionTable')!;
    resetNode(table);
    table.visible = state.method !== 'transmission';
    if (table.visible && state.samplePlaced) {
      table.updateWorldMatrix(true, true);
      const originalTableTop = new THREE.Box3().setFromObject(table).max.y;
      // Scale gently about desk height zero: both specimen contact and the table's own floor contact remain real.
      const heightRatio = sampleBounds.min.y / originalTableTop;
      table.scale.y *= heightRatio;
      table.position.y *= heightRatio;
      // The small pad follows the chosen placement; there is no mechanical stage or height control.
      table.position.x += state.samplePlaced ? evaluation.sampleX : 0;
    }
    if (!state.samplePlaced) {
      // A removed specimen rests on the desk rather than hovering at an arbitrary template height.
      specimenGroup.position.y -= sampleBounds.min.y;
    }
    scene.updateMatrixWorld(true);
    updateFiber(head);
    updateOpticalGeometry(state, evaluation, active);
    scene.updateMatrixWorld(true);
    updateRays(state, evaluation, specimen);
    actualMeasurements(active, state);
  }

  function focus(view: 'whole' | 'lamp' | 'sample' | 'instrument') {
    if (disposed) return;
    const sampleX = current?.evaluation.sampleX ?? 0;
    const lampX = (current?.state.lampLateral ?? 0) * BENCH_GEOMETRY.lateralScale;
    const reflected = current?.state.method !== undefined && current.state.method !== 'transmission';
    const lampPose = current ? benchLampPose(current.state) : null;
    const lampZ = lampPose?.pivotZ ?? BENCH_GEOMETRY.lampPivotZ;
    const lampY = lampPose?.pivotY ?? AXIS_Y;
    const scopeCenter = instrument[current?.state.dispersion ?? 'prism']?.root.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3(0, AXIS_Y, 0.11);
    const targets = {
      whole: { at: new THREE.Vector3(-0.07, reflected ? 0.12 : 0.079, 0.005), offset: reflected ? new THREE.Vector3(0.48, 0.21, 0.18) : new THREE.Vector3(0.44, 0.29, 0.33) },
      lamp: { at: new THREE.Vector3(lampX, lampY, lampZ), offset: new THREE.Vector3(0.15, 0.065, 0.10) },
      sample: { at: new THREE.Vector3(sampleX, reflected ? 0.14 : AXIS_Y, 0.003), offset: reflected ? new THREE.Vector3(0.26, 0.065, 0.04) : new THREE.Vector3(0.115, 0.072, -0.08) },
      instrument: { at: scopeCenter, offset: new THREE.Vector3(0.13, 0.085, 0.12) },
    };
    const chosen = targets[view];
    if (view === 'whole' && ready && bench) {
      // Fit the actual visible apparatus after changing the reflection layout or viewport.
      const bounds = new THREE.Box3();
      const corners: THREE.Vector3[] = [];
      scene.updateMatrixWorld(true);
      for (const root of [bench.root, specimenGroup, fiberGroup, instrument[current?.state.dispersion ?? 'prism']!.root]) {
        meshes(root, (mesh) => {
          for (let node: THREE.Object3D | null = mesh; node; node = node.parent) if (!node.visible) return;
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          if (mesh.geometry.boundingBox) {
            const box = mesh.geometry.boundingBox;
            for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
              const corner = new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld);
              corners.push(corner);
              bounds.expandByPoint(corner);
            }
          }
        });
      }
      if (!bounds.isEmpty()) {
        chosen.at.copy(bounds.getCenter(new THREE.Vector3()));
        const towardEye = chosen.offset.clone().normalize();
        const right = new THREE.Vector3(0, 1, 0).cross(towardEye).normalize();
        const up = towardEye.clone().cross(right).normalize();
        const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        let distance = 0;
        const projectedRight = corners.map((corner) => corner.clone().sub(chosen.at).dot(right));
        const projectedUp = corners.map((corner) => corner.clone().sub(chosen.at).dot(up));
        chosen.at.addScaledVector(right, (Math.min(...projectedRight) + Math.max(...projectedRight)) / 2);
        chosen.at.addScaledVector(up, (Math.min(...projectedUp) + Math.max(...projectedUp)) / 2);
        for (const corner of corners) {
          const relative = corner.clone().sub(chosen.at);
          distance = Math.max(distance, relative.dot(towardEye) + Math.abs(relative.dot(up)) / tangent,
            relative.dot(towardEye) + Math.abs(relative.dot(right)) / (tangent * camera.aspect));
        }
        chosen.offset.copy(towardEye).multiplyScalar(distance * 1.09);
      }
    }
    const horizontalFactor = view === 'whole' ? 1 : Math.max(1, 1.15 / Math.max(camera.aspect, 0.5));
    transition = {
      // 减少动效时直接到位（起点设在过去，下一帧即完成过渡）。
      start: performance.now() - (reducedMotion ? 10_000 : 0), fromPosition: camera.position.clone(), toPosition: chosen.at.clone().add(chosen.offset.multiplyScalar(horizontalFactor)),
      fromTarget: controls.target.clone(), toTarget: chosen.at,
    };
    canvas.dataset.focusView = view;
  }
  canvas.dataset.quality = phone ? 'smooth' : 'high';
  canvas.dataset.reducedMotion = String(reducedMotion);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerStart: { x: number; y: number } | null = null;
  // 直接操作（同偏光镜拖转盘）：按住灯头、狭缝调节环或目镜套筒左右拖动，数值与滑杆同步；两指操作时让给缩放平移。
  const DRAGGABLE: Record<string, { key: 'lampLateral' | 'slit' | 'focus'; perPixel: number; min: number; max: number }> = {
    lampHead: { key: 'lampLateral', perPixel: 0.008, min: -1, max: 1 },
    slitControl: { key: 'slit', perPixel: 0.004, min: 0, max: 1 },
    focusTube: { key: 'focus', perPixel: 0.004, min: 0, max: 1 },
  };
  let drag: { pointerId: number; part: string; startX: number; startValue: number } | null = null;
  const draggableAt = (event: PointerEvent) => {
    if (!ready || !current || !callbacks.onAdjust) return null;
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const roots = [bench!.root, instrument[current.state.dispersion]!.root];
    for (const hit of raycaster.intersectObjects(roots, true)) {
      let hidden = false;
      for (let parent: THREE.Object3D | null = hit.object; parent; parent = parent.parent) if (!parent.visible) hidden = true;
      if (hidden) continue;
      let node: THREE.Object3D | null = hit.object;
      while (node && !node.userData.part) node = node.parent;
      const id = node?.userData.part as string | undefined;
      return id && DRAGGABLE[id] ? id : null;
    }
    return null;
  };
  const dragMove = (event: PointerEvent) => {
    if (drag && event.pointerId === drag.pointerId && current) {
      const rule = DRAGGABLE[drag.part];
      const value = Math.min(rule.max, Math.max(rule.min, drag.startValue + (event.clientX - drag.startX) * rule.perPixel));
      callbacks.onAdjust?.({ [rule.key]: Number(value.toFixed(3)) });
      return;
    }
    if (event.buttons === 0) canvas.style.cursor = draggableAt(event) ? 'ew-resize' : '';
  };
  const endDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    controls.enabled = true;
    canvas.dataset.dragging = '';
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  const pointerDown = (event: PointerEvent) => {
    pointerStart = { x: event.clientX, y: event.clientY };
    if (drag && !event.isPrimary) { endDrag({ pointerId: drag.pointerId } as PointerEvent); return; }
    const part = event.isPrimary ? draggableAt(event) : null;
    if (!part || !current) return;
    const rule = DRAGGABLE[part];
    drag = { pointerId: event.pointerId, part, startX: event.clientX, startValue: current.state[rule.key] };
    controls.enabled = false;
    canvas.dataset.dragging = part;
    canvas.setPointerCapture(event.pointerId);
  };
  const pointerUp = (event: PointerEvent) => {
    if (drag && event.pointerId === drag.pointerId) { endDrag(event); pointerStart = null; return; }
    if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5 || !ready) return;
    pointerStart = null;
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const roots = [bench!.root, specimenGroup, fiberGroup, instrument[current?.state.dispersion ?? 'prism']!.root];
    for (const hit of raycaster.intersectObjects(roots, true)) {
      let node: THREE.Object3D | null = hit.object;
      let hidden = false;
      for (let parent: THREE.Object3D | null = node; parent; parent = parent.parent) if (!parent.visible) hidden = true;
      if (hidden) continue;
      while (node && !node.userData.part) node = node.parent;
      if (node?.userData.part) { callbacks.onSelect?.(String(node.userData.label ?? node.userData.part)); break; }
    }
  };
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointermove', dragMove);
  canvas.addEventListener('pointercancel', endDrag);
  const contextLost = (event: Event) => {
    event.preventDefault();
    failed = true;
    canvas.dataset.loaded = 'false';
    cancelAnimationFrame(animation);
    callbacks.onStatus('error', '3D 图形上下文已中断；二维观察记录仍可使用，请重载 3D 工作台。');
  };
  canvas.addEventListener('webglcontextlost', contextLost);

  const loader = new GLTFLoader();
  async function loadAsset(directory: string): Promise<LoadedAsset> {
    const base = assetPath(directory);
    const [manifestResponse, modelResponse] = await Promise.all([
      fetch(`${base}/manifest.json`, { signal: abort.signal }), fetch(`${base}/model.glb`, { signal: abort.signal }),
    ]);
    if (!manifestResponse.ok || !modelResponse.ok) throw new Error(`3D 资产不可用：${directory}`);
    const [manifest, buffer] = await Promise.all([manifestResponse.json() as Promise<AssetManifest>, modelResponse.arrayBuffer()]);
    if (!Array.isArray(manifest.parts)) throw new Error('模型部件清单格式不正确');
    const gltf = await loader.parseAsync(buffer, `${base}/`);
    if (disposed || failed) { disposeTree(gltf.scene); throw new Error('viewer disposed'); }
    loadedRoots.add(gltf.scene);
    return { root: gltf.scene, manifest };
  }
  void Promise.all([
    loadAsset('spectroscope-workbench/simple-v2'),
    loadAsset('prism-spectroscope/paper-optics-v1'),
    loadAsset('grating-spectroscope/paper-optics-v1'),
  ]).then(([loadedBench, prism, grating]) => {
    if (disposed || failed) return;
    bench = loadedBench;
    instrument.prism = prism;
    instrument.grating = grating;
    prism.root.position.set(0, AXIS_Y, 0.1075);
    grating.root.position.set(0, AXIS_Y, 0.0875);
    register(bench);
    register(prism);
    register(grating);
    getNode('Bench_fiberCable')!.visible = false;
    cloneEmissiveMaterials(getNode('Bench_lampEmitter'));
    cloneEmissiveMaterials(getNode('Source_indicator_lens'));
    grating.root.visible = false;
    ready = true;
    apply();
    focus('whole');
    canvas.dataset.loaded = 'true';
    callbacks.onStatus('ready');
  }).catch((error: unknown) => {
    if (disposed) return;
    failed = true;
    abort.abort();
    canvas.dataset.loaded = 'false';
    for (const root of loadedRoots) { scene.remove(root); disposeTree(root); }
    loadedRoots.clear();
    callbacks.onStatus('error', error instanceof Error ? `3D 工作台加载失败：${error.message}。可继续使用二维观察区。` : '3D 工作台加载失败，可继续使用二维观察区。');
  });

  /** 可拖动部件在画面上的位置（CSS 像素，相对画布），供核验直接操作。 */
  const handleBox = new THREE.Box3(), handleCenter = new THREE.Vector3();
  function writeHandles() {
    const rect = canvas.getBoundingClientRect();
    const handles: Record<string, [number, number]> = {};
    for (const asset of [bench!, instrument[current!.state.dispersion]!]) for (const part of asset.manifest.parts) {
      if (!DRAGGABLE[part.id]) continue;
      const node = asset.root.getObjectByName(part.node);
      if (!node?.visible) continue;
      // 取顶面附近一点：环、套筒是空心的，中心点会穿过环孔打到内部部件。
      handleBox.setFromObject(node).getCenter(handleCenter);
      handleCenter.y = handleBox.max.y - (handleBox.max.y - handleBox.min.y) * 0.12;
      handleCenter.project(camera);
      handles[part.id] = [Math.round((handleCenter.x * .5 + .5) * rect.width), Math.round((-handleCenter.y * .5 + .5) * rect.height)];
    }
    canvas.dataset.handles = JSON.stringify(handles);
  }
  const render = (time: number) => {
    if (disposed || failed) return;
    if (transition) {
      const t = Math.min(1, (time - transition.start) / 360);
      const eased = t * t * (3 - 2 * t);
      camera.position.lerpVectors(transition.fromPosition, transition.toPosition, eased);
      controls.target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
      if (t === 1) transition = null;
    }
    controls.update();
    if (ready && current) {
      const position = instrument[current.state.dispersion]!.root.localToWorld(new THREE.Vector3(0, 0.023, 0.02)).project(camera);
      const within = ['whole', 'instrument'].includes(canvas.dataset.focusView ?? 'whole')
        && position.z >= -1 && position.z <= 1 && Math.abs(position.x) < 0.93 && Math.abs(position.y) < 0.93;
      handLabel.style.display = within ? 'block' : 'none';
      handLabel.style.left = `${(position.x * 0.5 + 0.5) * host.clientWidth}px`;
      handLabel.style.top = `${(-position.y * 0.5 + 0.5) * host.clientHeight}px`;
    }
    renderer.render(scene, camera);
    if (ready && current) writeHandles();
    animation = requestAnimationFrame(render);
  };
  animation = requestAnimationFrame(render);
  return {
    update(state, evaluation, specimen) { current = { state, evaluation, specimen }; apply(); },
    focus,
    setBeams(visible) { beamsEnabled = visible; rays.visible = visible; canvas.dataset.beamsVisible = String(visible); },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      cancelAnimationFrame(animation);
      observer.disconnect();
      controls.removeEventListener('start', cancelTransition);
      controls.dispose();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointermove', dragMove);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('webglcontextlost', contextLost);
      disposeTree(scene);
      for (const root of loadedRoots) if (!root.parent) disposeTree(root);
      loadedRoots.clear();
      environment.dispose();
      key.shadow.dispose();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      handLabel.remove();
    },
  };
}
