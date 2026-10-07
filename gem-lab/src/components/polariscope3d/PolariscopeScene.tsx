import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { lessonUsesSample, STRUCTURE_ASSETS, STRUCTURE_PART_IDS, type PolariscopeStructureState, type StructurePartId } from '../../domain/polariscopeStructure';
import { getPolariscopeProfile } from '../../domain/polariscopeSamples';
import { createOpticalTeachingOverlay } from './OpticalTeachingOverlay';
import { createSampleModel } from './SampleOnStage';

/** 目镜视场画面：与页面目镜窗共用同一张画布，version 变化即刷新纹理。 */
export interface SceneFieldView { canvas: HTMLCanvasElement | null; version: number; show: boolean; transmission?: number; sampleGlow?: number }

export interface PolariscopeSceneProps {
  state: PolariscopeStructureState;
  quality: 'standard' | 'high';
  resetViewKey: number;
  viewPreset?: string;
  onSelectPart: (id: StructurePartId | null) => void;
  onAngleChange: (part: 'analyzer' | 'stage', degrees: number) => void;
  onPowerChange: (power: boolean) => void;
  onStatus?: (status: 'loading' | 'ready' | 'error') => void;
  field?: SceneFieldView;
}
type VectorTuple = [number, number, number];
interface PartSpec {
  id: StructurePartId; label: string; node: string; explodeOffset: VectorTuple;
  pivot?: VectorTuple; hotspot?: VectorTuple; rotationAxisLocal?: VectorTuple; rotatable?: boolean;
}
interface Manifest {
  parts: PartSpec[];
  powerControl?: { partId: StructurePartId; pressOffset: VectorTuple };
  internalLight?: { partId: StructurePartId; baseShellMesh: string; remainsInsideDuringExplode: boolean };
  /** 与底座一体的外壳网格（底座 + 支架为同一金属外壳）。 */
  integralShell?: { meshes: string[] };
}
interface PartRuntime {
  spec: PartSpec; node: THREE.Object3D; initialWorld: THREE.Vector3;
  quaternion: THREE.Quaternion; offset: THREE.Vector3; axis: THREE.Vector3; hotspot: THREE.Vector3;
}
interface FrameTarget { target: THREE.Vector3; position: THREE.Vector3; scale: number }
const UP = new THREE.Vector3(0, 1, 0);
const HOME_DIRECTION = new THREE.Vector3(1, .62, 1.45).normalize();
const isPartId = (id: unknown): id is StructurePartId => STRUCTURE_PART_IDS.includes(id as StructurePartId);

function disposeTree(root: THREE.Object3D, retainedMaterials: Set<THREE.Material> = new Set()) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set(retainedMaterials);
  const textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Sprite)) return;
    if (!(object instanceof THREE.Sprite)) geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
  });
  materials.forEach(material => Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); }));
  textures.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); geometries.forEach(value => value.dispose());
}

/** React owns the mechanical state. Camera movement never changes ring angles. */
export default function PolariscopeScene(props: PolariscopeSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const diagnostic = useRef<HTMLDivElement>(null);
  const latest = useRef(props); latest.current = props;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [failure, setFailure] = useState('');
  const [retry, setRetry] = useState(0);
  const [parts, setParts] = useState<PartSpec[]>([]);
  const markers = useRef(new Map<string, HTMLButtonElement>());
  const leaders = useRef(new Map<string, SVGLineElement>());
  const resetCamera = useRef<(() => void) | null>(null);
  const setCameraPreset = useRef<((id: string) => void) | null>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false, loaded = false, contextUnavailable = false;
    let animation = 0, renderedFrames = 0, renderedLast = 0, lastFpsAt = performance.now();
    const startedAt = performance.now();
    let extent = 1, explosion = 0, lastQuality = '', lastPoseKey = '';
    let lastSelection: StructurePartId | null = null, lastIsolated: StructurePartId | null = null;
    let lastMode = latest.current.state.mode, lastWantedExplosion = latest.current.state.explosion;
    let lastLesson = latest.current.state.lesson;
    let focus: FrameTarget | null = null;
    let drag: { id: 'analyzer' | 'stage'; startX: number; startY: number; startAngle: number; pointer: number; moved: boolean } | null = null;
    let click: { pointer: number; x: number; y: number; part: StructurePartId | null; moved: boolean; maxDistance: number; power: boolean } | null = null;
    const activePointers = new Set<number>();
    const abort = new AbortController();
    const timeout = window.setTimeout(() => abort.abort(), 45000);
    const report = (next: 'loading' | 'ready' | 'error') => { if (!disposed) { setStatus(next); latest.current.onStatus?.(next); } };
    setParts([]); setFailure(''); report('loading');
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); }
    catch { setFailure('当前浏览器无法启动三维显示，可先查看结构示意图。'); report('error'); clearTimeout(timeout); return () => abort.abort(); }
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-label', '偏光镜三维结构：拖动背景旋转视角，拖动上下操作环调节角度，点按底座侧面按钮切换电源');
    canvas.setAttribute('role', 'img'); canvas.dataset.testid = 'polariscope-canvas';
    canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;'; container.appendChild(canvas);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
    const scene = new THREE.Scene();
    const perspectiveCamera = new THREE.PerspectiveCamera(36, 1, .001, 100);
    const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, .001, 100);
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = perspectiveCamera;
    let orthographicScale = 1.5, aspect = 1;
    camera.position.copy(HOME_DIRECTION).multiplyScalar(3);
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, .5, 0); controls.enableDamping = true; controls.dampingFactor = .09;
    controls.minDistance = .08; controls.maxDistance = 20; controls.maxPolarAngle = Math.PI * .93;
    controls.enablePan = true; controls.screenSpacePanning = true; controls.update();
    const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, .04); scene.environment = environment.texture; room.dispose(); pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xf5f5ff, 0xb8b3a9, .85));
    const key = new THREE.DirectionalLight(0xfff6e9, 2.1); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    key.position.set(2, 3, 2); key.shadow.bias = -.00008; key.shadow.normalBias = .001; scene.add(key); scene.add(key.target);
    const fill = new THREE.DirectionalLight(0xd6e5ff, .8); fill.position.set(-2, 1, -2); scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: .16 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const halo = new THREE.Mesh(new THREE.RingGeometry(.99, 1, 96), new THREE.MeshBasicMaterial({ color: 0x986c38, transparent: true, opacity: .6, side: THREE.DoubleSide, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.visible = false; halo.raycast = () => {}; scene.add(halo);
    const runtimes = new Map<StructurePartId, PartRuntime>();
    const retainedMaterials = new Set<THREE.Material>();
    const emitters = new Map<THREE.MeshStandardMaterial, { intensity: number; color: THREE.Color }>();
    const shellMaterials = new Map<THREE.Material, { transparent: boolean; opacity: number; depthWrite: boolean }>();
    const outlines = new Map<THREE.Mesh, THREE.LineSegments>();
    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
    let asset: THREE.Object3D | null = null, baseShell: THREE.Object3D | undefined;
    const shellMeshes = new Set<THREE.Object3D>();
    let sampleModel: ReturnType<typeof createSampleModel> | null = null, sampleKey = '', sampleTop = 0;
    let conoscopeProgress = 0;
    let conoscopePose: { restPosition: THREE.Vector3; restQuaternion: THREE.Quaternion; insertedPosition: THREE.Vector3; insertedQuaternion: THREE.Quaternion; lift: number } | null = null;
    let fieldTexture: THREE.CanvasTexture | null = null, fieldCanvas: HTMLCanvasElement | null = null, lastFieldVersion = -1;
    const labelLayer = document.createElement('div');
    labelLayer.className = 'polariscope-scene-labels'; labelLayer.setAttribute('aria-hidden', 'true');
    labelLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden;';
    const labelElements = new Map<string, HTMLSpanElement>();
    let teaching: ReturnType<typeof createOpticalTeachingOverlay> | null = null;
    let powerControl: Manifest['powerControl'];
    const projection = () => {
      perspectiveCamera.aspect = aspect; perspectiveCamera.updateProjectionMatrix();
      orthographicCamera.left = -orthographicScale * aspect / 2; orthographicCamera.right = orthographicScale * aspect / 2;
      orthographicCamera.top = orthographicScale / 2; orthographicCamera.bottom = -orthographicScale / 2; orthographicCamera.updateProjectionMatrix();
    };
    const visibleBounds = (id?: StructurePartId | null) => {
      const box = new THREE.Box3();
      if (id && runtimes.has(id)) {
        box.setFromObject(runtimes.get(id)!.node);
        if ((id === 'light' || id === 'powerSwitch') && runtimes.has('base')) box.union(new THREE.Box3().setFromObject(runtimes.get('base')!.node));
      } else {
        for (const part of runtimes.values()) if (part.node.visible) box.union(new THREE.Box3().setFromObject(part.node));
        if (teaching && latest.current.state.lesson !== 'components') box.union(teaching.bounds);
      }
      return box;
    };
    const framing = (box: THREE.Box3, direction: THREE.Vector3, padding = 1.15): FrameTarget => {
      const target = box.getCenter(new THREE.Vector3()), look = direction.clone().normalize();
      const right = new THREE.Vector3().crossVectors(UP, look).normalize();
      if (right.lengthSq() < .001) right.set(0, 0, -1);
      const vertical = new THREE.Vector3().crossVectors(look, right).normalize();
      const tanV = Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov) / 2), tanH = tanV * aspect;
      let distance = extent * .15, spanX = extent * .08, spanY = extent * .08;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const corner = new THREE.Vector3(x, y, z).sub(target), sx = Math.abs(corner.dot(right)), sy = Math.abs(corner.dot(vertical)), depth = corner.dot(look);
        distance = Math.max(distance, sx * padding / tanH + depth, sy * padding / tanV + depth);
        spanX = Math.max(spanX, sx * 2); spanY = Math.max(spanY, sy * 2);
      }
      return { target, position: target.clone().addScaledVector(look, distance), scale: Math.max(spanY, spanX / aspect) * padding };
    };
    const clearDamping = () => { controls.enableDamping = false; controls.update(); controls.enableDamping = true; };
    const frameBounds = (box: THREE.Box3, direction?: THREE.Vector3, animate = true) => {
      if (box.isEmpty()) return;
      const result = framing(box, direction ?? camera.position.clone().sub(controls.target));
      clearDamping();
      if (animate) focus = result;
      else { focus = null; camera.position.copy(result.position); controls.target.copy(result.target); orthographicScale = result.scale; camera.zoom = 1; projection(); controls.update(); }
    };
    const preset = (id: string) => {
      if (!loaded) return;
      clearDamping();
      const directions: Record<string, THREE.Vector3> = { '01-front': new THREE.Vector3(1, 0, 0), '02-side': new THREE.Vector3(0, 0, 1), '03-top': new THREE.Vector3(.0001, 1, 0) };
      camera = directions[id] ? orthographicCamera : perspectiveCamera; controls.object = camera;
      const part = id === '05-analyzer-close' ? 'analyzer' : id === '06-stage-close' ? 'stage' : null;
      frameBounds(visibleBounds(part), directions[id] ?? HOME_DIRECTION, false);
      canvas.dataset.viewPreset = id;
    };
    setCameraPreset.current = preset; resetCamera.current = () => preset(latest.current.viewPreset ?? 'free');
    const resize = () => {
      const bounds = container.getBoundingClientRect(); if (!bounds.width || !bounds.height) return;
      aspect = bounds.width / bounds.height; renderer.setSize(bounds.width, bounds.height, false); projection();
      if (loaded) {
        const { state, viewPreset } = latest.current;
        const closePart = viewPreset === '05-analyzer-close' ? 'analyzer' : viewPreset === '06-stage-close' ? 'stage' : null;
        frameBounds(visibleBounds(state.isolatedPart ?? state.selectedPart ?? closePart), undefined, false);
      }
    };
    const observer = new ResizeObserver(resize); observer.observe(container);
    const effectiveInternal = () => latest.current.state.internalView || latest.current.state.isolatedPart === 'light' || latest.current.state.lesson === 'path' || latest.current.state.lesson === 'principle';
    const pick = (event: PointerEvent): { part: StructurePartId | null; power: boolean } => {
      if (!asset) return { part: null, power: false };
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return { part: null, power: false };
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(asset, true).find(hit => {
        if (effectiveInternal() && shellMeshes.has(hit.object)) return false;
        for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) if (!node.visible) return false;
        return true;
      });
      if (!hit) return { part: null, power: false };
      let part: StructurePartId | null = null, power = false;
      for (let node: THREE.Object3D | null = hit.object; node && node !== scene; node = node.parent) {
        if (isPartId(node.userData.partId)) part = node.userData.partId;
        if (node.userData.interactionRole === 'power-toggle') power = true;
      }
      return { part, power: power && part === powerControl?.partId };
    };
    const releaseDrag = () => {
      if (!drag) return;
      // OrbitControls owns capture and pointer registration. Keep its first
      // capture alive when a second touch takes over from a ring gesture.
      drag = null;
      controls.enabled = true; canvas.style.cursor = 'grab';
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      activePointers.add(event.pointerId);
      // OrbitControls has registered the first pointer even when a ring owns its
      // movement. Let it also receive the second pointer so pinch/pan can begin.
      if (activePointers.size > 1) { click = null; releaseDrag(); return; }
      const hit = pick(event), state = latest.current.state;
      canvas.dataset.lastPointerDown = `${hit.part ?? 'background'}${hit.power ? ':power' : ''}`;
      canvas.dataset.lastPointerUp = 'pending'; canvas.dataset.lastPointerCancel = '';
      canvas.dataset.pointerDownPosition = `${event.clientX.toFixed(1)},${event.clientY.toFixed(1)} buttons=${event.buttons} ${event.pointerType}#${event.pointerId}`;
      canvas.dataset.pointerMaxMove = '0 px'; canvas.dataset.pointerUpPosition = 'pending'; canvas.dataset.pointerIgnoredHover = '';
      click = { pointer: event.pointerId, x: event.clientX, y: event.clientY, part: hit.part, power: hit.power, moved: false, maxDistance: 0 };
      if ((hit.part === 'analyzer' || hit.part === 'stage') && state.mode !== 'explode' && !state.isolatedPart) {
        drag = { id: hit.part, startX: event.clientX, startY: event.clientY, startAngle: hit.part === 'analyzer' ? state.analyzerAngle : state.stageAngle, pointer: event.pointerId, moved: false };
        clearDamping(); focus = null;
        canvas.style.cursor = 'ew-resize';
      }
    };
    // This bubble listener runs after OrbitControls' pointerdown listener. Ring
    // movement is intercepted in capture; its pointer registration stays intact
    // for an eventual two-finger gesture and for normal pointerup cleanup.
    const settleDown = (event: PointerEvent) => {
      if (drag?.pointer === event.pointerId) { controls.enabled = false; event.preventDefault(); }
    };
    let lastHoverAt = 0;
    const move = (event: PointerEvent) => {
      if (!activePointers.has(event.pointerId) && event.target !== canvas) return;
      // A mouse hover cannot extend a held-button gesture. Native automation may
      // restore its cursor between down/up; block that hover before OrbitControls.
      if (activePointers.has(event.pointerId) && event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
        canvas.dataset.pointerIgnoredHover = `${event.clientX.toFixed(1)},${event.clientY.toFixed(1)} buttons=${event.buttons}`;
        event.stopImmediatePropagation();
        return;
      }
      if (click?.pointer === event.pointerId) {
        const distance = Math.hypot(event.clientX - click.x, event.clientY - click.y);
        if (distance >= 5) click.moved = true;
        if (distance > click.maxDistance) {
          click.maxDistance = distance;
          canvas.dataset.pointerMaxMove = `${distance.toFixed(1)} px at ${event.clientX.toFixed(1)},${event.clientY.toFixed(1)} buttons=${event.buttons} ${event.pointerType}#${event.pointerId}`;
        }
      }
      if (drag && event.pointerId === drag.pointer) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 5) drag.moved = true;
        if (drag.moved) latest.current.onAngleChange(drag.id, Math.round((((drag.startAngle + (event.clientX - drag.startX) * .65) % 360 + 360) % 360) * 10) / 10);
        event.stopImmediatePropagation(); event.preventDefault();
      } else if (performance.now() - lastHoverAt > 45 && activePointers.size === 0) {
        lastHoverAt = performance.now(); const { part, power } = pick(event); canvas.dataset.hoveredPart = part ?? '';
        const ring = (part === 'analyzer' || part === 'stage') && latest.current.state.mode === 'structure' && !latest.current.state.isolatedPart;
        canvas.style.cursor = ring ? 'ew-resize' : power || part ? 'pointer' : 'grab';
      }
    };
    const up = (event: PointerEvent) => {
      if (!activePointers.has(event.pointerId) && click?.pointer !== event.pointerId && drag?.pointer !== event.pointerId) return;
      const pressed = click?.pointer === event.pointerId ? click : null;
      if (pressed) click = null;
      canvas.dataset.pointerUpPosition = `${event.clientX.toFixed(1)},${event.clientY.toFixed(1)} buttons=${event.buttons} ${event.pointerType}#${event.pointerId} Δ=${pressed ? Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y).toFixed(1) : 'n/a'} px`;
      const wasDrag = drag?.pointer === event.pointerId, selectedRing = wasDrag && !drag!.moved ? drag!.id : null;
      if (wasDrag) releaseDrag(); activePointers.delete(event.pointerId);
      canvas.dataset.lastPointerUp = wasDrag ? 'ring' : pressed?.moved ? 'moved' : 'released';
      if (selectedRing) latest.current.onSelectPart(selectedRing);
      else if (!wasDrag && pressed && !pressed.moved && activePointers.size === 0 && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < 5) {
        const hit = pick(event);
        canvas.dataset.lastPointerUp = `${hit.part ?? 'background'}${hit.power ? ':power' : ''}`;
        if (hit.part === pressed.part) {
          if (hit.power && pressed.power) latest.current.onPowerChange(!latest.current.state.power);
          else latest.current.onSelectPart(hit.part);
        }
      }
    };
    const cancel = (event: PointerEvent) => {
      if (!activePointers.has(event.pointerId) && drag?.pointer !== event.pointerId) return;
      canvas.dataset.lastPointerCancel = event.type; activePointers.delete(event.pointerId);
      if (drag?.pointer === event.pointerId) releaseDrag(); click = null;
    };
    // OrbitControls owns capture for camera gestures. Losing that capture after a
    // native Safari release is not pointer cancellation; document pointerup decides.
    const lostCapture = (event: PointerEvent) => { if (drag?.pointer === event.pointerId) cancel(event); };
    const cancelAll = () => { click = null; activePointers.clear(); releaseDrag(); };
    const orbitStart = () => { focus = null; };
    controls.addEventListener('start', orbitStart);
    const ownerDocument = canvas.ownerDocument;
    canvas.addEventListener('pointerdown', down, true); canvas.addEventListener('pointerdown', settleDown); ownerDocument.addEventListener('pointermove', move, true);
    ownerDocument.addEventListener('pointerup', up, true); ownerDocument.addEventListener('pointercancel', cancel, true);
    canvas.addEventListener('lostpointercapture', lostCapture, true); window.addEventListener('blur', cancelAll);
    const contextLost = (event: Event) => {
      contextUnavailable = true; event.preventDefault(); setFailure('三维显示已中断。结构示意图仍可查看，也可重新加载场景。'); report('error'); cancelAnimationFrame(animation);
    };
    canvas.addEventListener('webglcontextlost', contextLost);
    const applyState = () => {
      const state = latest.current.state, internal = effectiveInternal();
      const rotation = new THREE.Quaternion();
      for (const [id, part] of runtimes) {
        // 底座与支架是同一金属外壳：单独查看其一时，另一个随之显示。
        const context = state.isolatedPart === 'light' && (id === 'base' || id === 'powerSwitch' || id === 'frame') || state.isolatedPart === 'powerSwitch' && (id === 'base' || id === 'frame')
          || state.isolatedPart === 'base' && id === 'frame' || state.isolatedPart === 'frame' && id === 'base';
        part.node.visible = !state.isolatedPart || state.isolatedPart === id || context;
        const world = part.initialWorld.clone().addScaledVector(part.offset, explosion);
        if (state.power && powerControl?.partId === id) world.add(new THREE.Vector3(...powerControl.pressOffset));
        part.node.position.copy(part.node.parent ? part.node.parent.worldToLocal(world) : world);
        part.node.quaternion.copy(part.quaternion);
        const angle = id === 'analyzer' ? state.analyzerAngle : id === 'stage' ? state.stageAngle : 0;
        if (part.spec.rotatable) part.node.quaternion.multiply(rotation.setFromAxisAngle(part.axis, THREE.MathUtils.degToRad(angle)));
        if (id === 'conoscope' && conoscopePose && conoscopeProgress > 0) {
          // 干涉球从收纳位抬起、翻转并落到样品正上方（镜片朝上下方向）。
          const p = conoscopeProgress, eased = p * p * (3 - 2 * p);
          const target = conoscopePose.restPosition.clone().lerp(conoscopePose.insertedPosition, eased).addScaledVector(UP, conoscopePose.lift * Math.sin(Math.PI * eased));
          const targetQuaternion = conoscopePose.restQuaternion.clone().slerp(conoscopePose.insertedQuaternion, eased);
          const parent = part.node.parent;
          part.node.position.copy(parent ? parent.worldToLocal(target) : target);
          const parentQuaternion = parent ? parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
          part.node.quaternion.copy(parentQuaternion.invert().multiply(targetQuaternion));
        }
        part.node.updateMatrix();
      }
      for (const [material, value] of emitters) { material.emissiveIntensity = state.power ? value.intensity : 0; material.color.copy(value.color).multiplyScalar(state.power ? 1 : .15); }
      for (const [material, value] of shellMaterials) {
        const transparent = internal || value.transparent;
        if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
        material.opacity = internal ? .34 : value.opacity; material.depthWrite = internal ? false : value.depthWrite;
      }
      scene.updateMatrixWorld(true);
      for (const [shell, outline] of outlines) { outline.visible = internal && shell.parent?.visible !== false && (() => { for (let node: THREE.Object3D | null = shell; node; node = node.parent) if (!node.visible) return false; return true; })(); outline.matrix.copy(shell.matrixWorld); outline.matrixWorldNeedsUpdate = true; }
      if (sampleModel) sampleModel.group.visible = lessonUsesSample(state.lesson) && !!runtimes.get('stage')?.node.visible;
      renderer.shadowMap.needsUpdate = true;
    };
    void (async () => {
      try {
        const [modelResponse, manifestResponse] = await Promise.all([fetch(`${STRUCTURE_ASSETS}repaired.glb`, { signal: abort.signal }), fetch(`${STRUCTURE_ASSETS}manifest.json`, { signal: abort.signal })]);
        if (!modelResponse.ok || !manifestResponse.ok) throw new Error('资源文件未能下载');
        const [buffer, manifest] = await Promise.all([modelResponse.arrayBuffer(), manifestResponse.json() as Promise<Manifest>]);
        if (!Array.isArray(manifest.parts) || STRUCTURE_PART_IDS.some(id => manifest.parts.filter(p => p.id === id).length !== 1)) throw new Error('部件清单不完整');
        const gltf = await new GLTFLoader().parseAsync(buffer, STRUCTURE_ASSETS);
        if (disposed || contextUnavailable) { disposeTree(gltf.scene); return; }
        asset = gltf.scene; scene.add(asset); scene.updateMatrixWorld(true); powerControl = manifest.powerControl;
        for (const spec of manifest.parts) {
          if (!isPartId(spec.id)) continue;
          const node = asset.getObjectByName(spec.node); if (!node) throw new Error(`找不到部件 ${spec.id}`);
          node.traverse(child => { child.userData.partId = spec.id; if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; } });
          const worldHotspot = spec.hotspot ? new THREE.Vector3(...spec.hotspot) : new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
          const axis = new THREE.Vector3(...(spec.rotationAxisLocal ?? [0, 1, 0] as VectorTuple)).normalize();
          const offset = new THREE.Vector3(...spec.explodeOffset);
          if ((spec.id === manifest.internalLight?.partId && manifest.internalLight.remainsInsideDuringExplode) || spec.id === 'powerSwitch') offset.set(0, 0, 0);
          runtimes.set(spec.id, { spec, node, initialWorld: node.getWorldPosition(new THREE.Vector3()), quaternion: node.quaternion.clone(), offset, axis, hotspot: node.worldToLocal(worldHotspot.clone()) });
        }
        asset.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          const originals = Array.isArray(object.material) ? object.material : [object.material];
          const isEmitter = object.userData.opticalRole === 'emitter' || object.name === 'Internal_light_emitting_surface';
          const isShell = (manifest.integralShell?.meshes ?? [manifest.internalLight?.baseShellMesh]).includes(object.name);
          const assigned = originals.map(material => {
            retainedMaterials.add(material);
            if (isEmitter && material instanceof THREE.MeshStandardMaterial) {
              const clone = material.clone(); emitters.set(clone, { intensity: Math.max(material.emissiveIntensity, 1), color: material.color.clone() }); return clone;
            }
            if (isShell) { const clone = material.clone(); shellMaterials.set(clone, { transparent: clone.transparent, opacity: clone.opacity, depthWrite: clone.depthWrite }); return clone; }
            return material;
          });
          object.material = Array.isArray(object.material) ? assigned : assigned[0];
          if (isShell) {
            if (object.name === manifest.internalLight?.baseShellMesh) baseShell = object;
            shellMeshes.add(object);
            // 轮廓线取外壳自身的折边（底座与支架一体），透明查看时仍能看清外形。
            const edges = new THREE.EdgesGeometry(object.geometry, 28);
            const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x668476, transparent: true, opacity: .52, depthTest: false, depthWrite: false, toneMapped: false }));
            outline.name = 'Base_internal_view_envelope'; outline.matrixAutoUpdate = false; outline.visible = false; outline.renderOrder = 9; outline.raycast = () => {}; scene.add(outline); outlines.set(object, outline);
          }
        });
        if (!emitters.size || !baseShell || !powerControl) throw new Error('光源或电源配置缺失');
        const bounds = visibleBounds(), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
        if (bounds.isEmpty() || !size.toArray().every(Number.isFinite)) throw new Error('模型几何无效');
        extent = Math.max(size.x, size.y, size.z); floor.position.y = bounds.min.y - extent * .003;
        teaching = createOpticalTeachingOverlay(asset, extent); scene.add(teaching.root); scene.add(teaching.extras);
        for (const label of teaching.labels) {
          const element = document.createElement('span'); element.className = `polariscope-scene-label polariscope-scene-label--${label.tone}`;
          element.textContent = label.text; element.dataset.labelKey = label.key; element.style.display = 'none';
          labelLayer.appendChild(element); labelElements.set(label.key, element);
        }
        const conoscopeRuntime = runtimes.get('conoscope'), lens = asset.getObjectByName('Conoscope_clear_lens') as THREE.Mesh | undefined;
        const ring = asset.getObjectByName('Conoscope_regular_open_ring') as THREE.Mesh | undefined;
        const supportNode = asset.getObjectByName('Stage_clear_sample_support');
        if (conoscopeRuntime && lens && ring && supportNode) {
          // 干涉球就位姿态：镜环轴线竖直，柄朝向仪器正面，球心在样品上方。
          // 球体本身各向同性，环的最薄方向才是光轴方向。
          ring.geometry.computeBoundingBox(); const ringSize = ring.geometry.boundingBox!.getSize(new THREE.Vector3());
          const thin = ringSize.x <= ringSize.y && ringSize.x <= ringSize.z ? new THREE.Vector3(1, 0, 0) : ringSize.y <= ringSize.z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
          const normal = thin.transformDirection(ring.matrixWorld); if (normal.y < 0) normal.negate();
          const lensCenter = new THREE.Box3().setFromObject(lens).getCenter(new THREE.Vector3());
          const restPosition = conoscopeRuntime.node.getWorldPosition(new THREE.Vector3()), restQuaternion = conoscopeRuntime.node.getWorldQuaternion(new THREE.Quaternion());
          const align = new THREE.Quaternion().setFromUnitVectors(normal, UP);
          const handle = new THREE.Box3().setFromObject(conoscopeRuntime.node).getCenter(new THREE.Vector3()).sub(lensCenter).applyQuaternion(align).setY(0);
          if (handle.lengthSq() > 1e-10) align.premultiply(new THREE.Quaternion().setFromUnitVectors(handle.normalize(), new THREE.Vector3(1, 0, 0)));
          const supportBox = new THREE.Box3().setFromObject(supportNode), supportCenter = supportBox.getCenter(new THREE.Vector3());
          sampleTop = supportBox.max.y;
          const lensTarget = new THREE.Vector3(supportCenter.x, supportBox.max.y + extent * .17, supportCenter.z);
          const offset = lensCenter.clone().sub(restPosition).applyQuaternion(align);
          conoscopePose = { restPosition, restQuaternion, insertedPosition: lensTarget.sub(offset), insertedQuaternion: align.clone().multiply(restQuaternion), lift: extent * .12 };
        }
        for (const cam of [perspectiveCamera, orthographicCamera]) { cam.near = extent / 1000; cam.far = extent * 100; cam.updateProjectionMatrix(); }
        controls.minDistance = extent * .08; controls.maxDistance = extent * 20; controls.minZoom = .25; controls.maxZoom = 10;
        key.position.copy(center).add(new THREE.Vector3(2, 3, 2).multiplyScalar(extent)); key.target.position.copy(center);
        key.shadow.camera.left = -extent * 1.4; key.shadow.camera.right = extent * 1.4; key.shadow.camera.top = extent * 1.6; key.shadow.camera.bottom = -extent * 1.4;
        key.shadow.camera.near = extent * .1; key.shadow.camera.far = extent * 10; key.shadow.normalBias = extent * .001; key.shadow.camera.updateProjectionMatrix();
        applyState(); loaded = true; preset(latest.current.viewPreset ?? 'free');
        canvas.dataset.loadMs = (performance.now() - startedAt).toFixed(0); canvas.dataset.modelExtent = extent.toFixed(4); canvas.dataset.parts = String(runtimes.size);
        setParts([...manifest.parts].filter(part => isPartId(part.id)).sort((a, b) => STRUCTURE_PART_IDS.indexOf(a.id) - STRUCTURE_PART_IDS.indexOf(b.id))); report('ready');
      } catch (error) {
        if (disposed || contextUnavailable) return;
        setFailure(error instanceof Error && error.name === 'AbortError' ? '加载超时，请检查连接后重试。' : '三维资产暂时不可用，可以先查看结构示意图与部件说明。');
        report('error'); cancelAnimationFrame(animation);
      } finally { clearTimeout(timeout); }
    })();
    const projected = new THREE.Vector3();
    let previousTickAt = performance.now();
    const tick = () => {
      if (disposed || contextUnavailable) return;
      animation = requestAnimationFrame(tick);
      const tickAt = performance.now(), dt = Math.min((tickAt - previousTickAt) / 1000, .05);
      previousTickAt = tickAt;
      if (document.hidden) return;
      const current = latest.current, state = current.state;
      if (lastQuality !== current.quality) {
        lastQuality = current.quality; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, current.quality === 'high' ? 1.75 : 1));
        const mapSize = current.quality === 'high' ? 2048 : 1024;
        if (key.shadow.mapSize.x !== mapSize) { key.shadow.map?.dispose(); key.shadow.map = null; key.shadow.mapSize.set(mapSize, mapSize); }
        renderer.shadowMap.needsUpdate = true; resize();
      }
      const wanted = state.mode === 'explode' ? state.explosion : 0;
      explosion = THREE.MathUtils.damp(explosion, wanted, 9, dt); if (Math.abs(explosion - wanted) < .0001) explosion = wanted;
      const wantedConoscope = state.lesson === 'conoscope' && state.conoscopeInserted && state.mode === 'structure' ? 1 : 0;
      conoscopeProgress = THREE.MathUtils.damp(conoscopeProgress, wantedConoscope, 4.2, dt); if (Math.abs(conoscopeProgress - wantedConoscope) < .002) conoscopeProgress = wantedConoscope;
      canvas.dataset.conoscopeProgress = conoscopeProgress.toFixed(3);
      if (loaded) {
        const wantedSample = lessonUsesSample(state.lesson) ? state.sampleId : '';
        if (wantedSample !== sampleKey) {
          sampleKey = wantedSample;
          if (sampleModel) { sampleModel.group.removeFromParent(); disposeTree(sampleModel.group); sampleModel = null; }
          const profile = getPolariscopeProfile(wantedSample), stage = runtimes.get('stage'), supportNode = asset?.getObjectByName('Stage_clear_sample_support');
          if (profile && stage && supportNode) {
            // 尺寸取支承面自身几何（与物台当前角度无关）；样品在物台局部坐标中不旋转，
            // 因此三维样品与目镜视场一样「随物台转动、0° 时对齐」。
            const supportMesh = supportNode as THREE.Mesh; supportMesh.geometry.computeBoundingBox();
            const size = supportMesh.geometry.boundingBox!.getSize(new THREE.Vector3()).multiply(supportNode.getWorldScale(new THREE.Vector3()));
            const supportBox = new THREE.Box3().setFromObject(supportNode);
            sampleModel = createSampleModel(profile, Math.max(size.x, size.z) * .4);
            sampleModel.group.traverse(child => { child.userData.partId = 'stage'; });
            const center = supportBox.getCenter(new THREE.Vector3()); center.y = supportBox.max.y;
            stage.node.add(sampleModel.group); sampleModel.group.position.copy(stage.node.worldToLocal(center));
            sampleModel.group.quaternion.identity();
          }
          canvas.dataset.sample = sampleModel ? wantedSample : '';
          lastPoseKey = '';
        }
      }
      const poseKey = [explosion, state.power, state.analyzerAngle, state.stageAngle, state.isolatedPart, effectiveInternal(), conoscopeProgress, state.lesson].join(':');
      if (loaded && poseKey !== lastPoseKey) { applyState(); lastPoseKey = poseKey; }
      if (loaded && (state.mode !== lastMode || wanted !== lastWantedExplosion)) {
        lastMode = state.mode; lastWantedExplosion = wanted;
        // Fit the requested assembly position immediately, then animate both geometry and camera.
        const currentExplosion = explosion; explosion = wanted; applyState(); frameBounds(visibleBounds(), undefined, true); explosion = currentExplosion; applyState();
      }
      if (loaded && state.lesson !== lastLesson) {
        lastLesson = state.lesson;
        frameBounds(visibleBounds(state.isolatedPart ?? state.selectedPart), undefined, true);
      }
      if (loaded && (state.selectedPart !== lastSelection || state.isolatedPart !== lastIsolated)) {
        lastSelection = state.selectedPart; lastIsolated = state.isolatedPart;
        const closePart = current.viewPreset === '05-analyzer-close' ? 'analyzer' : current.viewPreset === '06-stage-close' ? 'stage' : null;
        if (!drag) frameBounds(visibleBounds(state.isolatedPart ?? state.selectedPart ?? closePart), undefined, true);
      }
      if (focus) {
        const fraction = 1 - Math.exp(-6 * dt); camera.position.lerp(focus.position, fraction); controls.target.lerp(focus.target, fraction);
        orthographicScale = THREE.MathUtils.lerp(orthographicScale, focus.scale, fraction); camera.zoom = 1; projection();
        if (camera.position.distanceTo(focus.position) < extent * .0002 && controls.target.distanceTo(focus.target) < extent * .0002) focus = null;
      }
      if (!drag) controls.update();
      const fieldView = current.field;
      if (fieldView?.canvas && fieldView.canvas !== fieldCanvas) {
        fieldTexture?.dispose(); fieldCanvas = fieldView.canvas;
        fieldTexture = new THREE.CanvasTexture(fieldCanvas); fieldTexture.colorSpace = THREE.SRGBColorSpace; lastFieldVersion = -1;
      }
      if (fieldTexture && fieldView && fieldView.version !== lastFieldVersion) { fieldTexture.needsUpdate = true; lastFieldVersion = fieldView.version; }
      const optics = teaching?.update(state, explosion, tickAt / 1000, { transmission: fieldView?.transmission, fieldTexture, showField: fieldView?.show && conoscopeProgress < .02 || fieldView?.show && conoscopeProgress === 1 });
      if (sampleModel) sampleModel.material.emissiveIntensity = state.power && optics?.active ? (fieldView?.sampleGlow ?? 0) * .9 : 0;
      if (teaching) for (const label of teaching.labels) {
        const element = labelElements.get(label.key); if (!element) continue;
        projected.copy(label.position).project(camera);
        const show = label.visible && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .96 && Math.abs(projected.y) < .94;
        element.style.display = show ? '' : 'none';
        if (show) element.style.transform = `translate(${((projected.x + 1) * container.clientWidth / 2).toFixed(1)}px, ${((1 - projected.y) * container.clientHeight / 2).toFixed(1)}px) translate(-50%, -50%)`;
      }
      const selected = state.selectedPart && runtimes.get(state.selectedPart);
      halo.visible = !!selected && selected.node.visible && ['analyzer', 'stage', 'polarizer'].includes(state.selectedPart!);
      if (selected && halo.visible) { const box = new THREE.Box3().setFromObject(selected.node), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()); halo.position.copy(center); halo.position.y = box.max.y + extent * .003; halo.scale.setScalar(Math.max(size.x, size.z) * .52); }
      const placedLabels: { x: number; y: number }[] = [], width = container.clientWidth, height = container.clientHeight;
      const switchPart = runtimes.get('powerSwitch');
      let switchAnchor: { x: number; y: number } | null = null;
      if (switchPart?.node.visible) {
        projected.copy(switchPart.hotspot); switchPart.node.localToWorld(projected); projected.project(camera);
        if (projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1) switchAnchor = { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2 };
      }
      for (const [id, part] of runtimes) {
        const marker = markers.current.get(id); if (!marker) continue;
        projected.copy(part.hotspot); part.node.localToWorld(projected); projected.project(camera);
        const relevant = state.showAnnotations && (state.lesson === 'components' || state.selectedPart === id);
        const visible = relevant && part.node.visible && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .99 && Math.abs(projected.y) < .99;
        marker.style.display = visible ? '' : 'none';
        const anchorX = (projected.x + 1) * width / 2, anchorY = (1 - projected.y) * height / 2;
        let x = Math.max(24, Math.min(width - 24, anchorX)), y = Math.max(24, Math.min(height - 24, anchorY));
        if (visible) {
          // Reserve the physical button for every label, including the base's
          // marker, which projects onto the actuator in the front view.
          const alternatives = id === 'powerSwitch'
            ? [[52, -18], [-52, -18], [52, 30], [-52, 30], [0, -58], [0, 58]]
            : [[0, 0], [-46, 0], [46, 0], [0, -46], [0, 46], [-46, -46], [46, 46], [-92, 0], [92, 0]];
          alternatives.push([24 - anchorX, 24 - anchorY], [width - 24 - anchorX, 24 - anchorY], [24 - anchorX, height - 24 - anchorY], [width - 24 - anchorX, height - 24 - anchorY]);
          for (const [dx, dy] of alternatives) {
            const nx = Math.max(24, Math.min(width - 24, anchorX + dx)), ny = Math.max(24, Math.min(height - 24, anchorY + dy));
            if (switchAnchor && Math.hypot(nx - switchAnchor.x, ny - switchAnchor.y) < 43) continue;
            x = nx; y = ny; if (!placedLabels.some(label => Math.hypot(label.x - x, label.y - y) < 43)) break;
          }
          placedLabels.push({ x, y });
        }
        marker.style.left = `${x}px`; marker.style.top = `${y}px`;
        const leader = leaders.current.get(id);
        if (leader) { leader.style.display = visible && Math.hypot(x - anchorX, y - anchorY) > 2 ? '' : 'none'; leader.setAttribute('x1', String(anchorX)); leader.setAttribute('y1', String(anchorY)); leader.setAttribute('x2', String(x)); leader.setAttribute('y2', String(y)); }
      }
      renderer.render(scene, camera); renderedFrames++;
      if (renderedFrames % 30 === 0) {
        const now = performance.now(); canvas.dataset.fps = ((renderedFrames - renderedLast) * 1000 / (now - lastFpsAt)).toFixed(1);
        canvas.dataset.geometries = String(renderer.info.memory.geometries); canvas.dataset.textures = String(renderer.info.memory.textures);
        canvas.dataset.calls = String(renderer.info.render.calls); canvas.dataset.triangles = String(renderer.info.render.triangles);
        if (diagnostic.current) diagnostic.current.textContent = `${canvas.dataset.fps} fps · load ${canvas.dataset.loadMs ?? '…'} ms\nCSS viewport ${window.innerWidth} × ${window.innerHeight} · buffer ${canvas.width} × ${canvas.height}\n${current.quality} · ${renderer.info.memory.geometries} geometries / ${renderer.info.memory.textures} textures\npower ${state.power ? 'on' : 'off'} · internal ${effectiveInternal() ? 'on' : 'off'} · explode ${Math.round(explosion * 100)}%\nanalyzer ${state.analyzerAngle}° · stage ${state.stageAngle}° · frame ${renderedFrames}\nlesson ${state.lesson} · step ${state.pathStep} · transmission ${(optics?.relativeTransmission ?? 0).toFixed(4)}\noptics ${optics?.blockedReason ?? 'active'} · beams ${teaching?.diagnostics.beamIntensities ?? 'none'}\npress ${canvas.dataset.lastPointerDown ?? 'none'} · release ${canvas.dataset.lastPointerUp ?? 'none'} · cancel ${canvas.dataset.lastPointerCancel || 'none'}\ndown ${canvas.dataset.pointerDownPosition ?? 'none'}\nmax move ${canvas.dataset.pointerMaxMove ?? 'none'}\nup ${canvas.dataset.pointerUpPosition ?? 'none'}`;
        lastFpsAt = now; renderedLast = renderedFrames;
      }
      canvas.dataset.frames = String(renderedFrames); canvas.dataset.loaded = String(loaded); canvas.dataset.power = String(state.power);
      canvas.dataset.internalView = String(effectiveInternal()); canvas.dataset.shellOutline = String([...outlines.values()].some(outline => outline.visible));
      canvas.dataset.analyzerAngle = String(state.analyzerAngle); canvas.dataset.stageAngle = String(state.stageAngle); canvas.dataset.explosion = explosion.toFixed(4);
      canvas.dataset.lesson = state.lesson; canvas.dataset.pathStep = String(state.pathStep); canvas.dataset.principleExample = state.principleExample;
      canvas.dataset.relativeTransmission = String(optics?.relativeTransmission ?? 0); canvas.dataset.opticsActive = String(optics?.active ?? false);
      canvas.dataset.opticsBlockedReason = optics?.blockedReason ?? '';
      canvas.dataset.opticalOverlay = String(teaching?.diagnostics.overlayVisible ?? false);
      canvas.dataset.opticalAnchors = teaching?.diagnostics.pathAnchors ?? '';
      canvas.dataset.beamIntensities = teaching?.diagnostics.beamIntensities ?? '0,0,0,0,0';
      canvas.dataset.schematicSample = String(teaching?.diagnostics.sampleVisible ?? false);
      canvas.dataset.fieldDisc = String(teaching?.diagnostics.fieldVisible ?? false);
      canvas.dataset.fieldVectors = String(teaching?.diagnostics.vectors ?? 0);
      canvas.dataset.camera = camera.position.toArray().map(n => n.toFixed(4)).join(',');
      canvas.dataset.emitterIntensity = String([...emitters.keys()][0]?.emissiveIntensity ?? 0);
      const light = runtimes.get('light'); if (light) canvas.dataset.lightPosition = light.node.getWorldPosition(new THREE.Vector3()).toArray().map(n => n.toFixed(4)).join(',');
      const frame = runtimes.get('frame'); if (frame) canvas.dataset.framePosition = frame.node.getWorldPosition(new THREE.Vector3()).toArray().map(n => n.toFixed(4)).join(',');
      const button = runtimes.get('powerSwitch'); if (button) canvas.dataset.powerSwitchPosition = button.node.getWorldPosition(new THREE.Vector3()).toArray().map(n => n.toFixed(4)).join(',');
    };
    container.appendChild(labelLayer);
    resize(); tick();
    return () => {
      disposed = true; abort.abort(); clearTimeout(timeout); cancelAnimationFrame(animation);
      resetCamera.current = null; setCameraPreset.current = null; observer.disconnect();
      canvas.removeEventListener('pointerdown', down, true); canvas.removeEventListener('pointerdown', settleDown); ownerDocument.removeEventListener('pointermove', move, true); ownerDocument.removeEventListener('pointerup', up, true);
      ownerDocument.removeEventListener('pointercancel', cancel, true); canvas.removeEventListener('lostpointercapture', lostCapture, true); window.removeEventListener('blur', cancelAll); canvas.removeEventListener('webglcontextlost', contextLost);
      controls.removeEventListener('start', orbitStart); controls.dispose();
      disposeTree(scene, retainedMaterials); fieldTexture?.dispose(); key.shadow.dispose(); environment.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
      labelLayer.remove(); labelElements.clear();
      markers.current.clear(); leaders.current.clear();
    };
  }, [retry]);
  useEffect(() => { resetCamera.current?.(); }, [props.resetViewKey]);
  useEffect(() => { setCameraPreset.current?.(props.viewPreset ?? 'free'); }, [props.viewPreset]);

  return (
    <div className="polariscope-scene" data-testid="polariscope-scene" data-status={status} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 380 }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      {import.meta.env.DEV && new URLSearchParams(window.location.search).has('diagnostics') && <div ref={diagnostic} role="status" aria-live="off" data-testid="scene-diagnostics" style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 3, padding: '7px 10px', background: '#fffdf2de', color: '#26372e', border: '1px solid #d9dfd1', borderRadius: 7, font: '11px/1.5 monospace', whiteSpace: 'pre', pointerEvents: 'none' }} />}
      {status === 'ready' && <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>{parts.map(part => <line key={part.id} ref={line => { if (line) leaders.current.set(part.id, line); else leaders.current.delete(part.id); }} stroke="#98714e" strokeWidth="1" opacity=".65" />)}</svg>}
      {status === 'ready' && parts.map((part, index) => (
        <button key={part.id} ref={element => { if (element) markers.current.set(part.id, element); else markers.current.delete(part.id); }}
          className={`polariscope-hotspot${props.state.selectedPart === part.id ? ' is-selected' : ''}`}
          style={{ position: 'absolute', transform: 'translate(-50%, -50%)', zIndex: 2 }}
          data-part-id={part.id} aria-label={`定位${part.label}`} aria-pressed={props.state.selectedPart === part.id}
          onClick={() => props.onSelectPart(part.id)} title={part.label}>
          <span>{String(index + 1).padStart(2, '0')}</span>
        </button>
      ))}
      {status !== 'ready' && (
        <div className="polariscope-scene-fallback" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', justifyItems: 'center', padding: 28, textAlign: 'center', background: '#f1f0e9' }} role={status === 'error' ? 'alert' : 'status'}>
          <img src={`${STRUCTURE_ASSETS}poster.png`} alt="偏光镜结构模型示意图" style={{ width: 'min(300px, 65vw)', maxHeight: 320, objectFit: 'contain', mixBlendMode: 'multiply' }} />
          <p>{status === 'loading' ? '正在准备三维展台…' : failure}</p>
          {status === 'error' && <button className="pol-explore__button" onClick={() => setRetry(value => value + 1)}>重新加载三维场景</button>}
        </div>
      )}
    </div>
  );
}
