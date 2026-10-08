"""Blender --background --python check_mesh_optics.py -- [--model ...]

Re-imports the actual GLB in an empty scene and ray-checks its opaque geometry.
This finite sampling detects obstructions; the continuous entrance-cone proof
is supplied separately by validate-optical-design.py.
"""
import argparse
import collections
import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
DEFAULT_ASSET = HERE.parents[2] / 'assets-source/gem-microscope/original-design/2026-10-08/v1'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--model', type=Path, default=DEFAULT_ASSET / 'model.glb')
parser.add_argument('--contract', type=Path, default=DEFAULT_ASSET / 'contract.json')
parser.add_argument('--output', type=Path, default=DEFAULT_ASSET / 'validation/mesh-optics-check.json')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
contract_raw = args.contract.read_bytes()
contract = json.loads(contract_raw)
o, df = contract['optics'], contract['optics']['darkfield']
pivot = Vector(contract['rigs']['tilt']['pivot'])
EPS = .000025


def blender_vector(gltf):
    return Vector((gltf[0], -gltf[2], gltf[1]))


def world_point(local_gltf):
    return blender_vector(Vector(local_gltf) + pivot)


def ancestor_names(obj):
    names = []
    while obj:
        names.append(obj.name)
        obj = obj.parent
    return names


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(args.model.resolve()))
bpy.context.view_layer.update()
ignored, included = [], []
for ob in bpy.context.scene.objects:
    if ob.type != 'MESH':
        continue
    ancestors = ancestor_names(ob)
    if 'Part_LightWindow' in ancestors or 'Part_Sample' in ancestors:
        ignored.append({'node': ob.name, 'reason': 'Transparent dust window or illustrative sample proxy; no refraction traced.'})
    else:
        included.append(ob)


def make_bvh():
    vertices, triangles, owners = [], [], []
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in included:
        evaluated = ob.evaluated_get(dg)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        offset = len(vertices)
        vertices.extend(evaluated.matrix_world @ v.co for v in mesh.vertices)
        for triangle in mesh.loop_triangles:
            triangles.append(tuple(offset + index for index in triangle.vertices))
            owners.append(ob.name)
        evaluated.to_mesh_clear()
    return BVHTree.FromPolygons(vertices, triangles, all_triangles=True), owners


def cast(bvh, owners, origin, endpoint):
    delta = endpoint - origin
    length = delta.length
    if length <= EPS:
        return None
    pos, normal, index, distance = bvh.ray_cast(origin, delta / length, length - EPS)
    return None if index is None else {'node': owners[index], 'distanceMeters': distance, 'pointBlenderWorld': list(pos)}


def disk_offsets(radius, normal, perimeter_count=12):
    # One centre and 12 evenly spaced finite emitting patch boundary points.
    reference = Vector((0, 0, 1)) if abs(normal.z) < .95 else Vector((0, 1, 0))
    a = normal.cross(reference).normalized()
    b = normal.cross(a).normalized()
    return [Vector((0, 0, 0))] + [radius * (math.cos(2 * math.pi * i / perimeter_count) * a + math.sin(2 * math.pi * i / perimeter_count) * b) for i in range(perimeter_count)]


sample = world_point(o['samplePosition'])
ring_center = world_point(df['center'])
half = math.radians(df['divergenceHalfAngleDegrees'])
dark_bvh, dark_owners = make_bvh()
df_count = 0
df_collisions = []
sample_bound_ray_count = 0
sample_bound_collisions = []
for index in range(df['rayCount']):
    angle = index * math.tau / df['rayCount']
    source = ring_center + blender_vector([math.cos(angle) * df['radius'], 0, math.sin(angle) * df['radius']])
    axis = (sample - source).normalized()
    # The authored patch is a 0.5mm-thick disk. Begin immediately in front of
    # its front optical surface, retaining its full 1.5mm radial extent.
    patch_points = disk_offsets(df['emittingPatchRadius'], axis)
    a = axis.cross(Vector((0, 0, 1))).normalized()
    b = axis.cross(a).normalized()
    directions = [axis]
    for polar in (half / 2, half):
        for azimuth_index in range(24):
            azimuth = math.tau * azimuth_index / 24
            directions.append(axis * math.cos(polar) + (a * math.cos(azimuth) + b * math.sin(azimuth)) * math.sin(polar))
    for patch_index, offset in enumerate(patch_points):
        origin = source + offset + axis * (.00025 + EPS)
        for direction_index, direction in enumerate(directions):
            length = (sample.z - origin.z) / direction.z
            endpoint = origin + direction * length
            hit = cast(dark_bvh, dark_owners, origin, endpoint)
            df_count += 1
            # Independently check illumination up to the actual 3D sample
            # envelope, including rays reaching it above its centre plane.
            relative = origin - sample
            along = relative.dot(direction)
            discriminant = along * along - (relative.length_squared - o['sampleRadius'] ** 2)
            if discriminant >= 0:
                entry_length = -along - math.sqrt(discriminant)
                if entry_length > EPS:
                    sample_bound_ray_count += 1
                    bound_hit = cast(dark_bvh, dark_owners, origin, origin + direction * entry_length)
                    if bound_hit:
                        sample_bound_collisions.append({**bound_hit, 'led': index, 'patchPoint': patch_index, 'direction': direction_index})
            if hit:
                radial = (Vector((endpoint.x, endpoint.y, sample.z)) - sample).length
                df_collisions.append({**hit, 'led': index, 'patchPoint': patch_index,
                                      'direction': direction_index, 'samplePlaneRadiusMeters': radial,
                                      'withinFixedSampleProjection': radial <= o['sampleRadius']})


bf_source = world_point(o['brightfield']['center']) + Vector((0, 0, .0004 + EPS))
bf_origins = [bf_source + offset for offset in disk_offsets(o['brightfield']['radius'] * .98, Vector((0, 0, 1)), 16)]
bf_targets = [sample + offset for offset in disk_offsets(o['sampleRadius'], Vector((0, 0, 1)), 12)]
bf_closed = []
for origin in bf_origins:
    for endpoint in bf_targets:
        bf_closed.append(cast(dark_bvh, dark_owners, origin, endpoint))

shutter = bpy.data.objects.get(df['shutter']['node'])
assert shutter is not None, 'Export is missing shutter node'
shutter.matrix_world.translation += blender_vector(df['shutter']['openTranslation'])
bpy.context.view_layer.update()
bf_bvh, bf_owners = make_bvh()
bf_open = []
for origin in bf_origins:
    for endpoint in bf_targets:
        bf_open.append(cast(bf_bvh, bf_owners, origin, endpoint))

by_node = collections.Counter(hit['node'] for hit in df_collisions)
bad_closed = [hit for hit in bf_closed if hit is None or 'Central_black_shutter_blade' not in hit['node'].replace(' ', '_')]
open_hits = [hit for hit in bf_open if hit]
report = {
    'schemaVersion': 1,
    'checkedAt': datetime.now(timezone.utc).isoformat(),
    'modelSha256': hashlib.sha256(args.model.read_bytes()).hexdigest(),
    'contractSha256': hashlib.sha256(contract_raw).hexdigest(),
    'passed': not sample_bound_collisions and not bad_closed and not open_hits,
    'method': 'Actual GLB imported in empty Blender scene; combined world-space BVH of all opaque exported triangles; 16 sources × 13 finite patch positions × 49 beam directions. Focus does not move the path below the specimen. Rigid tilt preserves intersections.',
    'darkfield': {'rayCount': df_count, 'collisionCount': len(df_collisions),
                  'sampleBoundRayCount': sample_bound_ray_count,
                  'sampleBoundCollisionCount': len(sample_bound_collisions),
                  'firstSampleBoundCollisions': sample_bound_collisions[:16],
                  'insideSampleProjectionCollisionCount': sum(hit['withinFixedSampleProjection'] for hit in df_collisions),
                  'collisionNodes': dict(by_node), 'firstCollisions': df_collisions[:32]},
    'brightfield': {'rayCountEachState': len(bf_closed), 'closedShutterFailureCount': len(bad_closed),
                    'openShutterCollisionCount': len(open_hits), 'firstOpenCollisions': open_hits[:16],
                    'closedCollisionNodes': dict(collections.Counter(hit['node'] if hit else 'NONE' for hit in bf_closed))},
    'includedOpaqueMeshCount': len(included),
    'acceptanceScope': 'No sampled path that reaches the fixed 4mm 3D sample envelope is blocked before entry; BF shutter blocks/releases the sampled BF bundle. Out-of-field spill may hit the holder and is reported, not hidden.',
    'excludedMeshes': ignored,
    'limitations': ['Finite angular/area sampling, not proof against every possible mesh obstruction.',
                    'Transparent protective window is treated as transmitting without refraction; sample proxy is excluded so this checks illumination delivery only.',
                    'No wave optics, lens transfer, gemstone refraction, real optical calibration, radiometry or manufacturing tolerance is simulated.',
                    'All source and control dimensions are authored educational parameters.'],
}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print('MESH_OPTICS_RESULT ' + json.dumps({key: report[key] for key in ('passed', 'modelSha256', 'darkfield', 'brightfield')}, ensure_ascii=False))
if not report['passed']:
    raise RuntimeError('Actual mesh optical obstruction detected; inspect ' + str(args.output))
