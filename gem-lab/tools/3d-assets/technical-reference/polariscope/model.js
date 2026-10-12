/**
 * Parametric polariscope teaching asset, authored for Gem Lab.
 *
 * Units: metres. Y is up; the optical axis is x = z = 0; the front is +Z.
 * Dimensions and hidden construction are illustrative, not a measured replica.
 * Surface transmission is an appearance material, not a polarisation solver.
 *
 * No imports: the caller supplies its Three.js and RoundedBoxGeometry versions.
 * Every part can be translated vertically for an exploded view. The analyzer,
 * stage and sample origins lie on the optical axis for independent Y rotation.
 */
export function createPolariscope(THREE, RoundedBoxGeometry) {
  const root = new THREE.Group();
  root.name = 'Polariscope';
  root.userData.label = '偏光镜教学模型';
  root.userData.assetKind = 'original-parametric-teaching-model';
  root.userData.units = 'metre';
  root.userData.front = '+Z';
  root.userData.note = '示意比例与结构；非实物测绘，非专业光学重建。';

  const parts = {};
  const materials = {
    enamel: new THREE.MeshStandardMaterial({ color: 0xe8e9e4, roughness: 0.28, metalness: 0.10 }),
    enamelEdge: new THREE.MeshStandardMaterial({ color: 0xd5d8d4, roughness: 0.36, metalness: 0.13 }),
    black: new THREE.MeshStandardMaterial({ color: 0x171b20, roughness: 0.31, metalness: 0.45 }),
    knurl: new THREE.MeshStandardMaterial({ color: 0x22272d, roughness: 0.36, metalness: 0.48 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1c2023, roughness: 0.76, metalness: 0.02 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xbfc9cb, roughness: 0.21, metalness: 0.88 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x67737b, roughness: 0.32, metalness: 0.85 }),
    mark: new THREE.MeshStandardMaterial({ color: 0xe4e6df, roughness: 0.50, metalness: 0.10 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xc59445, roughness: 0.28, metalness: 0.65 }),
    light: new THREE.MeshStandardMaterial({ color: 0xffeac9, emissive: 0xffd39a, emissiveIntensity: 0.9, roughness: 0.52 }),
    switch: new THREE.MeshStandardMaterial({ color: 0xc69c55, roughness: 0.33, metalness: 0.14 }),
    indicator: new THREE.MeshStandardMaterial({ color: 0x86d8bf, emissive: 0x5bb598, emissiveIntensity: 0.8, roughness: 0.3 }),
    polarGlass: new THREE.MeshPhysicalMaterial({ color: 0x9aaa9d, transmission: 0.80, opacity: 1, roughness: 0.08, metalness: 0, thickness: 0.002, ior: 1.49, clearcoat: 1, clearcoatRoughness: 0.08 }),
    stageGlass: new THREE.MeshPhysicalMaterial({ color: 0xe3efea, transmission: 0.96, opacity: 1, roughness: 0.05, metalness: 0, thickness: 0.002, ior: 1.49, clearcoat: 1 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xdeeee6, transmission: 0.94, opacity: 1, roughness: 0.045, metalness: 0, thickness: 0.008, ior: 1.5, clearcoat: 1 }),
    sample: new THREE.MeshPhysicalMaterial({ color: 0xa793de, transmission: 0.72, opacity: 1, roughness: 0.07, metalness: 0, thickness: 0.013, ior: 1.54, clearcoat: 1, clearcoatRoughness: 0.06, flatShading: true }),
  };
  Object.entries(materials).forEach(([key, value]) => { value.name = `Polariscope_Material_${key}`; });

  function part(key, label, y = 0) {
    const group = new THREE.Group();
    group.name = `Polariscope_${key}`;
    group.userData.label = label;
    group.userData.part = key;
    group.position.y = y;
    group.userData.assembledPosition = [0, y, 0];
    parts[key] = group;
    root.add(group);
    return group;
  }

  function mesh(parent, name, label, geometry, material, position = [0, 0, 0]) {
    const object = new THREE.Mesh(geometry, material);
    object.name = `Polariscope_${name}`;
    object.userData.label = label;
    object.position.set(...position);
    object.castShadow = material.transmission == null;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function box(width, height, depth, radius = 0.001, segments = 2) {
    return new RoundedBoxGeometry(width, height, depth, segments, radius);
  }

  function cylinder(radius, height, segments = 64) {
    return new THREE.CylinderGeometry(radius, radius, height, segments);
  }

  // Closed bevelled annulus. It retains a genuine hole along the optical axis.
  function ring(inner, outer, height, bevel = 0.0005, segments = 80) {
    const b = Math.min(bevel, height * 0.24, (outer - inner) * 0.24);
    const h = height / 2;
    const outline = [
      [inner + b, -h], [outer - b, -h], [outer, -h + b],
      [outer, h - b], [outer - b, h], [inner + b, h],
      [inner, h - b], [inner, -h + b], [inner + b, -h],
    ];
    return new THREE.LatheGeometry(outline.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  }

  // Many small ribs/ticks share one mesh, keeping the model's draw calls low.
  function radialBoxes(items) {
    const positions = [];
    const faces = [
      [0, 2, 1, 0, 3, 2], [4, 5, 6, 4, 6, 7],
      [0, 1, 5, 0, 5, 4], [3, 7, 6, 3, 6, 2],
      [1, 2, 6, 1, 6, 5], [0, 4, 7, 0, 7, 3],
    ];
    for (const { angle, radius, width, height, depth, y = 0 } of items) {
      const w = width / 2, h = height / 2, d = depth / 2;
      const points = [[-w, -h, -d], [w, -h, -d], [w, h, -d], [-w, h, -d], [-w, -h, d], [w, -h, d], [w, h, d], [-w, h, d]];
      const s = Math.sin(angle), c = Math.cos(angle);
      for (const face of faces) {
        for (const i of face) {
          const [x, py, z] = points[i];
          positions.push(x * c + (z + radius) * s, py + y, -x * s + (z + radius) * c);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  function knurl(parent, name, radius, height, y, count = 96) {
    const items = Array.from({ length: count }, (_, i) => ({
      angle: i * Math.PI * 2 / count, radius,
      width: 0.00115, depth: 0.00080, height, y,
    }));
    return mesh(parent, name, '防滑滚花', radialBoxes(items), materials.knurl);
  }

  function graduations(parent, name, inner, outer, y, count = 72) {
    const items = Array.from({ length: count }, (_, i) => {
      const length = i % 18 === 0 ? outer - inner : i % 6 === 0 ? (outer - inner) * 0.78 : (outer - inner) * 0.40;
      return { angle: i * Math.PI * 2 / count, radius: outer - length / 2, width: i % 18 === 0 ? 0.00075 : 0.00038, height: 0.00015, depth: length, y };
    });
    return mesh(parent, name, '旋转方向刻度', radialBoxes(items), materials.mark);
  }

  function screw(parent, name, position, along = 'z') {
    const head = mesh(parent, `${name}_Head`, '固定螺钉', cylinder(0.0023, 0.0009, 16), materials.steel, position);
    if (along === 'z') head.rotation.x = Math.PI / 2;
    if (along === 'x') head.rotation.z = Math.PI / 2;
    const slot = mesh(parent, `${name}_Slot`, '螺钉槽', box(0.0026, 0.00023, 0.00048, 0.00008, 1), materials.darkSteel);
    slot.position.copy(head.position);
    if (along === 'z') { slot.rotation.x = Math.PI / 2; slot.position.z += 0.00052; }
    else if (along === 'x') { slot.rotation.z = Math.PI / 2; slot.position.x += 0.00052; }
    else slot.position.y += 0.00052;
  }

  const base = part('base', '仪器底座与开关');
  mesh(base, 'Base_EnamelShell', '圆角白色底座', box(0.195, 0.040, 0.179, 0.006, 3), materials.enamel, [0, 0.031, -0.005]);
  mesh(base, 'Base_LowerSeam', '底座接缝', box(0.188, 0.003, 0.172, 0.003, 2), materials.enamelEdge, [0, 0.012, -0.005]);
  [-1, 1].forEach((x, i) => [-1, 1].forEach((z, j) => {
    mesh(base, `Foot_${i}_${j}`, '橡胶脚垫', cylinder(0.010, 0.008, 32), materials.rubber, [x * 0.073, 0.005, z * 0.065 - 0.005]);
  }));
  const switchMount = mesh(base, 'Switch_Bezel', '电源开关座', box(0.026, 0.026, 0.0045, 0.006, 3), materials.black, [0.057, 0.031, 0.086]);
  const rocker = mesh(base, 'Switch_Rocker', 'LED 电源开关', box(0.013, 0.019, 0.004, 0.0025, 2), materials.switch, [0.057, 0.031, 0.089]);
  rocker.rotation.x = -0.10;
  rocker.userData.action = 'toggle-light';
  switchMount.userData.action = 'toggle-light';
  mesh(base, 'Switch_OnMark', '开关方向标记', box(0.00055, 0.0035, 0.00015, 0.00005, 1), materials.mark, [0.057, 0.035, 0.0913]);
  const status = mesh(base, 'Power_Indicator', '电源指示灯', cylinder(0.0016, 0.0008, 20), materials.indicator, [0.032, 0.032, 0.085]);
  status.rotation.x = Math.PI / 2;
  screw(base, 'Switch_LeftScrew', [0.047, 0.031, 0.0885]);
  screw(base, 'Switch_RightScrew', [0.067, 0.031, 0.0885]);
  // Side vents are separate short slots, not an opening through the optical path.
  for (let i = 0; i < 7; i += 1) {
    mesh(base, `Base_SideVent_${i}`, '散热槽', box(0.0004, 0.007, 0.0013, 0.0002, 1), materials.darkSteel, [0.0972, 0.029, -0.040 + i * 0.007]);
  }

  const frame = part('frame', '后立柱与中空顶臂');
  mesh(frame, 'Frame_BackUpright', '后部支架', box(0.156, 0.195, 0.013, 0.004, 3), materials.enamel, [0, 0.149, -0.084]);
  mesh(frame, 'Frame_BackFoot', '支架底部连接座', box(0.163, 0.009, 0.023, 0.003, 2), materials.enamelEdge, [0, 0.054, -0.080]);
  [-1, 1].forEach((sign, i) => {
    mesh(frame, `Frame_TopArm_${i}`, '顶臂侧支撑', box(0.023, 0.007, 0.060, 0.003, 2), materials.enamel, [sign * 0.053, 0.242, -0.057]);
    screw(frame, `Frame_Fixing_${i}`, [sign * 0.064, 0.212, -0.0769]);
  });
  mesh(frame, 'Frame_OpenTopRing', '中央留孔的检偏器支架', ring(0.0495, 0.070, 0.007, 0.0015, 96), materials.enamel, [0, 0.242, 0]);
  mesh(frame, 'Frame_AnalyzerSeat', '检偏器装配座', ring(0.047, 0.0575, 0.0025, 0.0005), materials.darkSteel, [0, 0.2465, 0]);
  // Fixed witness mark; analyzer's own marks rotate against this index.
  mesh(frame, 'Frame_AnalyzerIndex', '检偏器固定指示线', box(0.0012, 0.0002, 0.005, 0.0001, 1), materials.accent, [0, 0.2457, 0.064]);

  const light = part('light', 'LED 光源', 0.055);
  mesh(light, 'Light_Housing', '光源金属座', ring(0.032, 0.045, 0.009, 0.0009), materials.black);
  mesh(light, 'Light_ReflectorRim', '光源反射杯边缘', ring(0.0325, 0.0358, 0.003, 0.0005), materials.steel, [0, 0.002, 0]);
  const diffuser = mesh(light, 'Light_Diffuser', '暖白 LED 扩散面', cylinder(0.0323, 0.0015, 64), materials.light, [0, 0.0038, 0]);
  diffuser.castShadow = false;
  mesh(light, 'Light_FrontAlignmentMark', '光源中心方向标记', box(0.0010, 0.0002, 0.003, 0.0001, 1), materials.accent, [0, 0.0047, 0.040]);

  const polarizer = part('polarizer', '下偏光片（起偏器）', 0.075);
  mesh(polarizer, 'Polarizer_LowerTube', '起偏器下镜筒', ring(0.034, 0.0425, 0.014, 0.0006), materials.black, [0, -0.008, 0]);
  mesh(polarizer, 'Polarizer_MainRing', '起偏器固定环', ring(0.034, 0.048, 0.008, 0.0007), materials.black);
  mesh(polarizer, 'Polarizer_RetainingRim', '下偏光片压圈', ring(0.0337, 0.037, 0.0016, 0.0003), materials.darkSteel, [0, 0.0038, 0]);
  mesh(polarizer, 'Polarizer_Glass', '下偏光片玻璃', cylinder(0.0338, 0.0018, 64), materials.polarGlass, [0, 0.0028, 0]);
  knurl(polarizer, 'Polarizer_GripRibs', 0.0478, 0.0056, 0, 88);
  mesh(polarizer, 'Polarizer_AxisMark', '起偏器方向标记', box(0.0011, 0.0002, 0.005, 0.0001, 1), materials.accent, [0, 0.0043, 0.042]);

  const stage = part('stage', '可旋转载物台', 0.100);
  mesh(stage, 'Stage_Bearing', '物台旋转轴承', ring(0.0345, 0.045, 0.016, 0.0006), materials.darkSteel, [0, -0.013, 0]);
  mesh(stage, 'Stage_MainRing', '载物台刻度环', ring(0.034, 0.053, 0.009, 0.0008), materials.black);
  mesh(stage, 'Stage_InnerRim', '载物玻璃固定圈', ring(0.0334, 0.0361, 0.0015, 0.0003), materials.steel, [0, 0.0040, 0]);
  mesh(stage, 'Stage_ClearDisc', '透明载物面', cylinder(0.0336, 0.0020, 72), materials.stageGlass, [0, 0.0037, 0]);
  knurl(stage, 'Stage_GripRibs', 0.05285, 0.0065, -0.0002, 96);
  graduations(stage, 'Stage_DegreeTicks', 0.041, 0.0505, 0.00462, 72);
  stage.userData.action = 'rotate-stage';
  stage.userData.rotationAxis = 'Y';
  mesh(polarizer, 'Stage_FixedIndex', '物台固定指示针', box(0.0014, 0.002, 0.007, 0.0004, 1), materials.accent, [0, 0.023, 0.054]);

  const sample = part('sample', '透明刻面教学样品', 0.115);
  // Closed, flat-faceted stone. Ring vertices preserve explicit facet breaks.
  function gemGeometry() {
    const vertices = [];
    const count = 12;
    const profile = [
      { radius: 0.0075, y: 0.009, phase: 0 },
      { radius: 0.0145, y: 0.003, phase: 0 },
      { radius: 0.0145, y: 0.0018, phase: 0 },
      { radius: 0.0028, y: -0.0099, phase: Math.PI / count },
    ];
    const rings = profile.map(({ radius, y, phase }) => Array.from({ length: count }, (_, i) => {
      const a = i * 2 * Math.PI / count + phase;
      return [Math.sin(a) * radius, y, Math.cos(a) * radius * 0.82];
    }));
    const triangle = (a, b, c) => vertices.push(...a, ...b, ...c);
    for (let i = 0; i < count; i += 1) {
      const n = (i + 1) % count;
      triangle([0, profile[0].y, 0], rings[0][i], rings[0][n]);
      for (let r = 0; r < rings.length - 1; r += 1) {
        triangle(rings[r][i], rings[r + 1][i], rings[r + 1][n]);
        triangle(rings[r][i], rings[r + 1][n], rings[r][n]);
      }
      triangle([0, profile[3].y, 0], rings[3][n], rings[3][i]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
  mesh(sample, 'Sample_FacetedStone', '淡紫色刻面样品（教学外观）', gemGeometry(), materials.sample);
  sample.userData.rotationAxis = 'Y';
  sample.userData.note = '仅示意样品外观，不代表具体实物及其光学取向。';

  const analyzer = part('analyzer', '上偏光片（检偏器）', 0.250);
  mesh(analyzer, 'Analyzer_MainBarrel', '检偏器旋转镜筒', ring(0.044, 0.058, 0.014, 0.001), materials.black, [0, 0.005, 0]);
  mesh(analyzer, 'Analyzer_LowerLip', '检偏器下装配边', ring(0.044, 0.0545, 0.003, 0.0005), materials.black, [0, -0.003, 0]);
  mesh(analyzer, 'Analyzer_Glass', '上偏光片玻璃', cylinder(0.0441, 0.0022, 80), materials.polarGlass, [0, 0.005, 0]);
  mesh(analyzer, 'Analyzer_InnerRetainingRing', '检偏器内压圈', ring(0.0432, 0.0468, 0.0025, 0.0004), materials.darkSteel, [0, 0.0092, 0]);
  knurl(analyzer, 'Analyzer_GripRibs', 0.0579, 0.0098, 0.0048, 108);
  graduations(analyzer, 'Analyzer_DegreeTicks', 0.0495, 0.0559, 0.01212, 72);
  mesh(analyzer, 'Analyzer_AxisStripe', '检偏器振动方向标记', box(0.0014, 0.0002, 0.007, 0.0001, 1), materials.accent, [0, 0.01223, 0.0518]);
  analyzer.userData.action = 'rotate-analyzer';
  analyzer.userData.rotationAxis = 'Y';

  const conoscope = part('conoscope', '侧置锥光干涉球及支架');
  mesh(conoscope, 'Conoscope_Foot', '干涉球支架座', cylinder(0.009, 0.005, 32), materials.steel, [-0.066, 0.054, -0.029]);
  mesh(conoscope, 'Conoscope_Stem', '干涉球支杆', cylinder(0.0036, 0.071, 24), materials.black, [-0.066, 0.092, -0.029]);
  mesh(conoscope, 'Conoscope_StemCollar', '干涉球支杆金属箍', cylinder(0.0046, 0.011, 24), materials.steel, [-0.066, 0.064, -0.029]);
  const ballHolder = mesh(conoscope, 'Conoscope_LensRing', '干涉球固定环', ring(0.0088, 0.014, 0.006, 0.0007, 56), materials.black, [-0.066, 0.137, -0.029]);
  ballHolder.rotation.x = Math.PI / 2;
  mesh(conoscope, 'Conoscope_GlassBall', '锥光干涉球（收纳位置）', new THREE.SphereGeometry(0.0092, 40, 24), materials.lens, [-0.066, 0.137, -0.029]);
  const retaining = mesh(conoscope, 'Conoscope_RetainingRim', '干涉球金属压圈', ring(0.009, 0.0101, 0.0012, 0.0002, 48), materials.steel, [-0.066, 0.137, -0.0256]);
  retaining.rotation.x = Math.PI / 2;
  conoscope.userData.note = '侧置为收纳示意，未模拟插入光路及锥光观测。';

  // Purely declarative metadata survives GLB export and can drive other viewers.
  for (const [key, group] of Object.entries(parts)) {
    group.userData.explodeAxis = [0, 1, 0];
    group.userData.partId = key;
  }
  return { root, parts };
}
