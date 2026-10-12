import * as THREE from 'three';
import type { PolariscopeSampleProfile } from '../../domain/polariscopeSamples';

/**
 * 载物台上的示意样品（程序生成，不依赖外部模型）：
 * - 刻面型：圆明亮琢型，台面朝下放置（偏光镜的常规放法）；
 * - 素面：椭圆弧面；雕件/异形：起伏的扁圆体。
 * 尺寸、比例只为示意。体色取自样品光学参数；透明度决定透射材质。
 */
export function createSampleModel(profile: PolariscopeSampleProfile, diameter: number): { group: THREE.Group; height: number; material: THREE.MeshPhysicalMaterial } {
  const group = new THREE.Group(); group.name = `Teaching_sample_${profile.id}`;
  const body = new THREE.Color().setRGB(...profile.bodyColor);
  const opaque = profile.observation === 'opaque';
  const translucent = !opaque && profile.depolarization > 0.2;
  const material = new THREE.MeshPhysicalMaterial({
    color: body, roughness: opaque ? 0.42 : translucent ? 0.28 : 0.02, metalness: 0,
    transmission: opaque ? 0 : translucent ? 0.45 : 0.92, thickness: diameter * 0.6, ior: 1.62,
    attenuationColor: body, attenuationDistance: diameter * (translucent ? 0.5 : 1.4),
    flatShading: profile.shape === 'faceted', clearcoat: profile.shape === 'faceted' ? 0 : 0.6,
    emissive: body, emissiveIntensity: 0, specularIntensity: 1,
  });
  const d = diameter;
  let geometry: THREE.BufferGeometry, height: number;
  if (profile.shape === 'faceted') {
    // 台面 57%、冠部 15%、腰 3%、亭部 43%（以直径计），台面朝下。
    const points = [[0, 0], [0.285, 0], [0.5, 0.15], [0.5, 0.18], [0, 0.61]].map(([r, y]) => new THREE.Vector2(r * d, y * d));
    geometry = new THREE.LatheGeometry(points, 16); height = 0.61 * d;
  } else if (profile.shape === 'cabochon') {
    const points = Array.from({ length: 13 }, (_, i) => { const t = (i / 12) * Math.PI / 2; return new THREE.Vector2(Math.cos(t) * d / 2, Math.sin(t) * d * 0.3); });
    points.unshift(new THREE.Vector2(0, 0));
    geometry = new THREE.LatheGeometry(points, 48); geometry.scale(1, 1, 0.8); height = 0.3 * d;
  } else {
    geometry = new THREE.IcosahedronGeometry(d / 2, 4);
    const position = geometry.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
    let seed = 0; for (const ch of profile.id) seed = (seed * 31 + ch.charCodeAt(0)) % 997;
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      const n = 1 + 0.09 * Math.sin(v.x * 9 / d + seed) * Math.cos(v.z * 7 / d - seed * .3) + 0.05 * Math.sin(v.y * 13 / d + seed * .7);
      v.multiplyScalar(n); v.y = v.y * 0.5 + d * 0.25; v.z *= 0.85;
      position.setXYZ(i, v.x, Math.max(0, v.y), v.z);
    }
    geometry.computeVertexNormals(); height = 0.52 * d;
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Teaching_sample_body'; mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  return { group, height, material };
}
