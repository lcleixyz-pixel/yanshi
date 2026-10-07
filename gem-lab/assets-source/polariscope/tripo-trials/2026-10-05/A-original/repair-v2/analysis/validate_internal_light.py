#!/usr/bin/env python3
"""Independent exported GLB checks of the user-specified light/base relationship.

Does not alter modeling, materials, model files, or the browser implementation.
Coordinates in the file are glTF Y-up; native Blender [x,y,z] maps to [x,z,-y].
"""
from pathlib import Path
import hashlib
import json
import math
import struct
import numpy as np
from scipy.spatial.transform import Rotation

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def read_glb(path):
    raw = path.read_bytes()
    assert raw[:4] == b'glTF'
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+length])
    binary_offset = 28 + length

    def access(index):
        entry = doc['accessors'][index]
        view = doc['bufferViews'][entry['bufferView']]
        assert not view.get('byteStride'), 'Handle interleaved accessors explicitly'
        dtype = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[entry['componentType']]
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[entry['type']]
        return np.frombuffer(raw, dtype=dtype, count=entry['count']*width,
                             offset=binary_offset+view.get('byteOffset', 0)+entry.get('byteOffset', 0)).reshape(-1, width).copy()
    return doc, access, hashlib.sha256(raw).hexdigest()


doc, access, sha = read_glb(ROOT/'repaired.glb')
manifest = json.loads((ROOT/'manifest.json').read_text())
world, parents = {}, {}
roots = doc['scenes'][doc.get('scene', 0)]['nodes']


def walk(index, ancestor):
    node = doc['nodes'][index]
    if 'matrix' in node:
        local = np.array(node['matrix']).reshape(4, 4).T
    else:
        local = np.eye(4)
        local[:3, :3] = Rotation.from_quat(node.get('rotation', [0, 0, 0, 1])).as_matrix() @ np.diag(node.get('scale', [1, 1, 1]))
        local[:3, 3] = node.get('translation', [0, 0, 0])
    world[index] = ancestor @ local
    for child in node.get('children', []):
        parents[child] = index
        walk(child, world[index])


for root in roots:
    walk(root, np.eye(4))
meshes = []
for index, node in enumerate(doc['nodes']):
    if 'mesh' not in node:
        continue
    ancestor = index
    while ancestor in parents:
        ancestor = parents[ancestor]
    for primitive in doc['meshes'][node['mesh']]['primitives']:
        xyz = access(primitive['attributes']['POSITION'])
        xyz = xyz @ world[index][:3, :3].T + world[index][:3, 3]
        faces = access(primitive['indices']).reshape(-1, 3)
        material = doc['materials'][primitive['material']]
        strength = material.get('extensions', {}).get('KHR_materials_emissive_strength', {}).get('emissiveStrength', 1)
        meshes.append(dict(name=node['name'], node=index, part=doc['nodes'][ancestor].get('extras', {}).get('teachingPart'),
                           vertices=xyz, triangles=xyz[faces], material=material['name'], extras=node.get('extras', {}),
                           min=xyz.min(axis=0), max=xyz.max(axis=0),
                           transmission=material.get('extensions', {}).get('KHR_materials_transmission', {}).get('transmissionFactor', 0),
                           emissive=np.asarray(material.get('emissiveFactor', [0, 0, 0]))*strength))


def ray_hits(point, axis=1, near=1.05, far=.05, predicate=lambda mesh: True):
    """Return exact triangle intersections along an axis; no physics simulation."""
    others = [i for i in range(3) if i != axis]
    hits = []
    for mesh in meshes:
        if not predicate(mesh):
            continue
        if mesh['min'][axis] > near or mesh['max'][axis] < far:
            continue
        if any(point[k] < mesh['min'][j] or point[k] > mesh['max'][j] for k, j in enumerate(others)):
            continue
        tris = mesh['triangles']
        tris = tris[(tris[:, :, axis].max(axis=1) > far) & (tris[:, :, axis].min(axis=1) < near)]
        q = tris[:, :, others]
        candidates = ((q[:, :, 0].min(axis=1) <= point[0]) & (q[:, :, 0].max(axis=1) >= point[0]) &
                      (q[:, :, 1].min(axis=1) <= point[1]) & (q[:, :, 1].max(axis=1) >= point[1]))
        tris, q = tris[candidates], q[candidates]
        if not len(q):
            continue
        v0, v1, v2 = q[:, 1]-q[:, 0], q[:, 2]-q[:, 0], np.asarray(point)-q[:, 0]
        den = v0[:, 0]*v1[:, 1]-v1[:, 0]*v0[:, 1]
        valid = abs(den) > 1e-14
        u, v = np.full(len(q), -1.), np.full(len(q), -1.)
        u[valid] = (v2[valid, 0]*v1[valid, 1]-v1[valid, 0]*v2[valid, 1])/den[valid]
        v[valid] = (v0[valid, 0]*v2[valid, 1]-v2[valid, 0]*v0[valid, 1])/den[valid]
        heights = tris[:, 0, axis]+u*(tris[:, 1, axis]-tris[:, 0, axis])+v*(tris[:, 2, axis]-tris[:, 0, axis])
        keep = valid & (u >= -1e-8) & (v >= -1e-8) & (u+v <= 1+1e-8) & (heights > far) & (heights < near)
        if keep.any():
            hits.append(dict(mesh=mesh['name'], positions=np.unique(np.round(heights[keep], 8)).tolist()))
    return hits


def bounds(mesh):
    return dict(name=mesh['name'], min=mesh['min'].tolist(), max=mesh['max'].tolist(),
                material=mesh['material'], extras=mesh['extras'])


def radial_probes(radii):
    probes = [(0., 0.)]
    for radius in radii:
        probes.extend((radius*math.cos(i*math.tau/16), radius*math.sin(i*math.tau/16)) for i in range(16))
    return probes


light_meshes = [m for m in meshes if m['part'] == 'light']
emitters = [m for m in light_meshes if np.max(m['emissive']) > 0]
emitter_names = {m['name'] for m in emitters}
ray_results = []
for dx, dz in radial_probes([.025, .05, .075, .1, .125, .139]):
    point = [.178+dx, dz]
    emitter_hits = ray_hits(point, far=.3, predicate=lambda m: m['name'] in emitter_names)
    surface = max((h for item in emitter_hits for h in item['positions']), default=None)
    obstruction = None if surface is None else ray_hits(point, far=surface+1e-6,
        predicate=lambda m: m['transmission'] == 0 and m['name'] not in emitter_names)
    ray_results.append(dict(offsetXZ=[dx, dz], emitterHits=emitter_hits, emitterTop=surface, opaqueHits=obstruction))

aperture_results = []
upper_bore_results = []
for dx, dz in radial_probes([.04, .08, .12, .15, .158, .159]):
    hits = ray_hits([.178+dx, dz], near=.5, far=.39, predicate=lambda m: m['part'] == 'base')
    aperture_results.append(dict(offsetXZ=[dx, dz], opaqueBaseHits=hits))
    hits = ray_hits([.178+dx, dz], near=1.05, far=.39, predicate=lambda m: m['transmission'] == 0)
    upper_bore_results.append(dict(offsetXZ=[dx, dz], opaqueHits=hits))

shells = [m for m in meshes if m['name'].startswith('Base_') and m['material'] == 'Repair_paint']
shell_names = {m['name'] for m in shells}
shell_cross_sections = []
for point in [[-.20, 0.], [.178, 0.], [.178, .18]]:
    hits = ray_hits(point, near=.5, far=.05, predicate=lambda m: m['name'] in shell_names)
    shell_cross_sections.append(dict(pointXZ=point, intersections=hits))
# A hollow solid away from the aperture has bottom/outside, bottom/inside,
# roof/inside and roof/outside intersections. The aperture center has only the floor pair.
cross_heights = [sorted(set(y for hit in c['intersections'] for y in hit['positions'])) for c in shell_cross_sections]
cavity_evidenced = (len(cross_heights[0]) == 4 and len(cross_heights[1]) == 2 and len(cross_heights[2]) == 4
                     and abs(cross_heights[0][-1]-.425) < .002
                     and abs(cross_heights[0][-2]-.404) < .003
                     and abs(cross_heights[0][1]-.088) < .003)

parts = []
for part in manifest['parts']:
    index = next(i for i, n in enumerate(doc['nodes']) if n['name'] == part['node'])
    parts.append(dict(id=part['id'], independentRoot=index in roots,
                      pivot=world[index][:3, 3].tolist(), manifestPivotDelta=float(np.max(abs(world[index][:3, 3]-part['pivot']))),
                      explodeOffset=part['explodeOffset'], extras=doc['nodes'][index].get('extras', {})))
switch = next((p for p in parts if p['id'] == 'powerSwitch'), None)
switch_meshes = [m for m in meshes if m['part'] == 'powerSwitch']
base_min = np.array([-.474, .067, -.314])
base_max = np.array([.468, .425, .314])
contained = all(np.all(m['min'] >= base_min-1e-5) and np.all(m['max'] <= base_max+1e-5) for m in light_meshes)
light_part = next((p for p in parts if p['id'] == 'light'), None)
black_lips = [m for m in meshes if m['part'] == 'base' and m['material'] == 'Repair_satin_black' and m['max'][1] > .445]
forbidden = [m['name'] for m in meshes if m['name'] in ['Light_open_housing', 'Light_independent_emitting_diffuser']]
checks = dict(manifestHashMatches=sha == manifest['sha256'],
              eightIndependentParts=len(parts) == 8 and all(p['independentRoot'] for p in parts),
              manifestPivotsMatch=all(p['manifestPivotDelta'] < 1e-6 for p in parts),
              hasInternalEmitter=bool(emitters), lightFullyWithinBase=bool(light_meshes) and contained,
              lightStaysWithBaseWhenExploded=bool(light_part) and light_part['explodeOffset'] == [0, 0, 0],
              opticalRaysReachEmitter=len(ray_results) == 97 and all(r['emitterHits'] and not r['opaqueHits'] for r in ray_results),
              baseTopApertureOpen=len(aperture_results) == 97 and all(not r['opaqueBaseHits'] for r in aperture_results),
              upperOpticalBoreOpen=len(upper_bore_results) == 97 and all(not r['opaqueHits'] for r in upper_bore_results),
              hollowBaseEvidenced=cavity_evidenced,
              noOldExternalLightMeshes=not forbidden,
              exitLipIsNonemissive=bool(black_lips) and all(not np.any(m['emissive']) for m in black_lips),
              powerSwitchTaggedAndNonemissive=bool(switch_meshes) and all(m['extras'].get('interactionRole') == 'power-toggle'
                  and not np.any(m['emissive']) for m in switch_meshes),
              powerSwitchStaysWithBaseWhenExploded=bool(switch) and switch['explodeOffset'] == [0, 0, 0],
              visibleEndSwitch=bool(switch_meshes) and switch is not None and switch['pivot'][0] > .468
                  and all(m['max'][0] > .468 for m in switch_meshes))
report = dict(sourceSha256=sha, coordinateSystem='glTF Y-up; native Blender [x,y,z] maps to [x,z,-y]',
              scope='Exported assembled geometry and metadata only; sampled rays are not a continuous proof or a physical photometric simulation.',
              checks=checks, allChecksPassed=all(checks.values()), meshCount=len(meshes),
              triangles=sum(len(m['triangles']) for m in meshes), parts=parts,
              baseEnvelope=[base_min.tolist(), base_max.tolist()], internalLightMeshes=[bounds(m) for m in light_meshes],
              emitterMaterials=[dict(name=m['name'], material=m['material'], effectiveEmission=m['emissive'].tolist()) for m in emitters],
              translucentOptics=[dict(name=m['name'], transmission=m['transmission']) for m in meshes if m['transmission'] > 0],
              opticalRayTest=dict(probeCount=len(ray_results), failCount=sum(not r['emitterHits'] or bool(r['opaqueHits']) for r in ray_results), probes=ray_results),
              baseApertureTest=dict(probeCount=len(aperture_results), failCount=sum(bool(r['opaqueBaseHits']) for r in aperture_results), probes=aperture_results),
              upperBoreTest=dict(probeCount=len(upper_bore_results), failCount=sum(bool(r['opaqueHits']) for r in upper_bore_results), probes=upper_bore_results),
              hollowBaseCrossSections=shell_cross_sections, outletLip=[bounds(m) for m in black_lips],
              powerSwitch=dict(part=switch, meshes=[bounds(m) for m in switch_meshes]), forbiddenExternalMeshes=forbidden)
(HERE/'internal-light-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(dict(sha256=sha, allChecksPassed=report['allChecksPassed'], checks=checks,
                     triangles=report['triangles'], meshCount=report['meshCount'], crossSections=cross_heights), ensure_ascii=False, indent=2))
