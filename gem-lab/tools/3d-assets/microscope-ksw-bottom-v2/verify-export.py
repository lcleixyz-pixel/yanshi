"""Independent GLB checks for the KSW exterior / illustrative lower-light repair.

Run Blender -b --factory-startup --python verify-export.py -- /absolute/repair-v2
No authoring module is imported. The manifest defines sampling and node identities;
intersections and both reflections use re-imported, evaluated triangle geometry.
Only independent-*.json files in the chosen output validation directory are written.
"""
import argparse
import datetime
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import subprocess
import sys

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree


def sha(data):
    return hashlib.sha256(data).hexdigest()


def glb(path):
    raw = path.read_bytes()
    assert raw[:4] == b'glTF', 'Expected GLB'
    offset = 12
    doc = binary = None
    while offset < len(raw):
        length, kind = struct.unpack_from('<II', raw, offset)
        chunk = raw[offset + 8:offset + 8 + length]
        if kind == 0x4E4F534A:
            doc = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        offset += length + 8
    return doc, binary, sha(raw)


def accessor(doc, binary, index):
    entry = doc['accessors'][index]
    dtype = {5120: '<i1', 5121: '<u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}[entry['componentType']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[entry['type']]
    result = np.zeros((entry['count'], width), dtype=dtype)
    if 'bufferView' in entry:
        view = doc['bufferViews'][entry['bufferView']]
        start = view.get('byteOffset', 0) + entry.get('byteOffset', 0)
        step = view.get('byteStride', np.dtype(dtype).itemsize * width)
        result[:] = np.ndarray(result.shape, dtype=dtype, buffer=binary, offset=start, strides=(step, np.dtype(dtype).itemsize))
    if 'sparse' in entry:
        sp = entry['sparse']
        ix = sp['indices']; iv = doc['bufferViews'][ix['bufferView']]
        itype = {5121: '<u1', 5123: '<u2', 5125: '<u4'}[ix['componentType']]
        indices = np.frombuffer(binary, dtype=itype, count=sp['count'], offset=iv.get('byteOffset', 0) + ix.get('byteOffset', 0))
        vx = sp['values']; vv = doc['bufferViews'][vx['bufferView']]
        values = np.frombuffer(binary, dtype=dtype, count=sp['count'] * width, offset=vv.get('byteOffset', 0) + vx.get('byteOffset', 0)).reshape(-1, width)
        result[indices] = values
    return result


def world_matrices(doc):
    result = {}
    def walk(index, parent):
        node = doc['nodes'][index]
        if 'matrix' in node:
            local = np.array(node['matrix'], dtype=float).reshape(4, 4).T
        else:
            x, y, z, w = node.get('rotation', [0, 0, 0, 1])
            local = np.array(Matrix.LocRotScale(Vector(node.get('translation', [0, 0, 0])), Quaternion((w, x, y, z)), Vector(node.get('scale', [1, 1, 1]))))
        result[index] = parent @ local
        for child in node.get('children', []):
            walk(child, result[index])
    child_ids = {v for n in doc['nodes'] for v in n.get('children', [])}
    for index in range(len(doc['nodes'])):
        if index not in child_ids:
            walk(index, np.eye(4))
    return result


def texture_signature(doc, binary, material_index):
    material = doc.get('materials', [])[material_index]
    images = []
    def visit(value, key=''):
        if isinstance(value, dict):
            if key.endswith('Texture') and 'index' in value:
                texture = doc['textures'][value['index']]
                image = doc['images'][texture['source']]
                view = doc['bufferViews'][image['bufferView']]
                content = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
                images.append({'role': key, 'sha256': sha(content), 'texCoord': value.get('texCoord', 0)})
            for k, v in value.items():
                visit(v, k)
        elif isinstance(value, list):
            for v in value:
                visit(v, key)
    visit(material)
    return sorted(images, key=lambda x: (x['role'], x['sha256']))


def exterior_signature(doc, binary, node_index, matrix):
    """Order-independent world-space triangles plus per-corner UVs, at 1e-5 units.

    Re-export may reorder split vertices, primitives, and triangles. Quantization
    is stated explicitly; it is not a measured or exact CAD equivalence claim.
    Embedded reference texture bytes are checked exactly, separately.
    """
    mesh = doc['meshes'][doc['nodes'][node_index]['mesh']]
    primitives = []
    for primitive in mesh['primitives']:
        assert primitive.get('mode', 4) == 4, 'Only triangle meshes supported'
        points = accessor(doc, binary, primitive['attributes']['POSITION']).astype(float)
        points = (np.column_stack([points, np.ones(len(points))]) @ matrix.T)[:, :3]
        uv_index = primitive['attributes'].get('TEXCOORD_0')
        uvs = accessor(doc, binary, uv_index).astype(float) if uv_index is not None else np.zeros((len(points), 2))
        ix = accessor(doc, binary, primitive['indices']).ravel() if 'indices' in primitive else np.arange(len(points))
        triangle = np.rint(np.column_stack([points, uvs])[ix].reshape(-1, 3, 5) * 1e5).astype('<i8')
        order = np.lexsort(tuple(triangle[:, :, k] for k in reversed(range(5))), axis=1)
        triangle = np.take_along_axis(triangle, order[:, :, None], axis=1).reshape(-1, 15)
        ordered = np.sort(np.ascontiguousarray(triangle).view('V120').ravel())
        primitives.append({'triangles': len(triangle), 'triangleUvSha256': sha(ordered.tobytes()), 'textures': texture_signature(doc, binary, primitive['material'])})
    return sorted(primitives, key=lambda x: x['triangleUvSha256'])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('asset', type=Path)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    asset = args.asset.resolve()
    source_path = (args.source or asset.parent / 'candidate-textured.glb').resolve()
    output = (args.out or asset / 'validation').resolve()
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((asset / 'manifest.json').read_text())
    model_path = asset / manifest.get('model', 'model.glb')
    doc, binary, model_sha = glb(model_path)
    opt = manifest['optics']
    checks = []
    def record(name, passed, **details):
        entry = {'name': name, 'passed': bool(passed), **details}
        checks.append(entry)
        print('CHECK', name, bool(passed), flush=True)
    def vec(v):
        return Vector((v[0], -v[2], v[1]))
    def radial(p, center):
        return math.hypot(p.x - center.x, p.y - center.y)

    record('GLB hash matches manifest', model_sha == manifest.get('modelSha256'), actualSha256=model_sha, declaredSha256=manifest.get('modelSha256'))
    # Compare the actual source and export; no author-provided signature is trusted.
    src_doc, src_binary, source_sha = glb(source_path)
    src_matrices, out_matrices = world_matrices(src_doc), world_matrices(doc)
    src_nodes = {n.get('name'): i for i, n in enumerate(src_doc['nodes']) if 'mesh' in n}
    out_nodes = {n.get('name'): i for i, n in enumerate(doc['nodes']) if 'mesh' in n}
    expected_retained = sorted(n for n in src_nodes if n.startswith('tripo_part_') and n != 'tripo_part_25')
    exterior = []
    for name in expected_retained:
        if name not in out_nodes:
            exterior.append({'node': name, 'passed': False, 'reason': 'missing'})
            continue
        a = exterior_signature(src_doc, src_binary, src_nodes[name], src_matrices[src_nodes[name]])
        b = exterior_signature(doc, binary, out_nodes[name], out_matrices[out_nodes[name]])
        exterior.append({'node': name, 'passed': a == b, 'original': a, 'exported': b})
    record('all 26 retained cloud meshes preserve world triangles UVs and original encoded textures', len(exterior) == 26 and all(x['passed'] for x in exterior), quantization=1e-5, rows=exterior, sourceSha256=source_sha)
    record('old opaque part25 is removed without adding a speculative protective window', 'tripo_part_25' not in out_nodes and 'protectiveWindow' not in out_nodes)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(model_path))
    bpy.context.view_layer.update()
    objects = {o.name: o for o in bpy.context.scene.objects}
    meshes = {n: o for n, o in objects.items() if o.type == 'MESH'}
    def evaluated(o):
        ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = ev.to_mesh(); me.calc_loop_triangles()
        vs = [ev.matrix_world @ v.co for v in me.vertices]
        fs = [tuple(t.vertices) for t in me.loop_triangles]
        ev.to_mesh_clear()
        return vs, fs
    def tree(o):
        vs, fs = evaluated(o)
        return BVHTree.FromPolygons(vs, fs, all_triangles=True)
    trees = {n: tree(o) for n, o in meshes.items()}
    def cast(a, b, exclude=(), only=None, eps=2e-6):
        delta = b - a; length = delta.length
        if length <= 2 * eps:
            return None
        direction = delta.normalized(); best = None
        for name, bvh in trees.items():
            if name in exclude or (only is not None and name not in only):
                continue
            point, normal, face, distance = bvh.ray_cast(a + direction * eps, direction, length - 2 * eps)
            if point is not None and (best is None or distance < best['distance']):
                best = {'node': name, 'point': point, 'normal': normal.normalized(), 'face': face, 'distance': distance}
        return best
    def brief(hit):
        return None if hit is None else {'node': hit['node'], 'pointBlender': list(hit['point'])}
    def reflected(direction, normal):
        return (direction - 2 * direction.dot(normal) * normal).normalized()
    def plane_hit(point, direction, z):
        if abs(direction.z) < 1e-10:
            return None
        t = (z - point.z) / direction.z
        return point + direction * t if t > 0 else None
    cone_node = opt['coneReflector']['node']
    outer_node = opt['outerReflector']['node']
    cone_root = objects[manifest['centralCone']['node']]
    moving_names = {o.name for o in [cone_root, *cone_root.children_recursive] if o.type == 'MESH'}
    receiver_names = set(opt.get('receiverNodes', []))
    transparent = set(manifest.get('transparentOpticalNodes', opt.get('transparentOpticalNodes', [])))
    for name, obj in meshes.items():
        for slot in obj.material_slots:
            material = slot.material
            for n in material.node_tree.nodes if material and material.use_nodes else []:
                if n.type == 'BSDF_PRINCIPLED' and n.inputs['Transmission Weight'].default_value > .8:
                    transparent.add(name)
    source = vec(opt['collimatorExit']); sample = vec(manifest['samplePosition']); objective = vec(opt['objectiveCenter'])
    axis = vec(opt['collimatedDirection']).normalized()
    record('declared parallel optical axis matches tested Z-up geometry', (axis - Vector((0, 0, 1))).length < 1e-8, axisBlender=list(axis))
    radius = opt['collimatedBeamRadius']
    fractions = [.08, .22, .40, .60, .80, .97, 1.0]
    emitters = []
    for fraction in fractions:
        for i in range(48):
            phi = 2 * math.pi * i / 48
            emitters.append((source + Vector((radius * fraction * math.cos(phi), radius * fraction * math.sin(phi), 0)), phi))
    rows = []; direct_closed = []
    expected_support = opt.get('supportOcclusion', {})
    support_node = expected_support.get('node')
    for emitter, phi in emitters:
        first = cast(emitter, emitter + axis * .2, only={cone_node})
        row = {'azimuthDegrees': math.degrees(phi), 'emissionRadius': radial(emitter, source)}
        direct = cast(emitter, emitter + axis * (objective.z + max(opt['focusRange']) - source.z), exclude=transparent | receiver_names)
        direct_closed.append({'firstBlocker': direct['node'] if direct else None})
        if not first:
            row['failure'] = 'misses central cone'; rows.append(row); continue
        d1 = reflected(axis, first['normal'])
        second = cast(first['point'], first['point'] + d1 * .4, only={outer_node})
        row['firstReflectedVerticalComponent'] = float(d1.z)
        if not second:
            row['failure'] = 'misses outer reflector'; rows.append(row); continue
        d2 = reflected(d1, second['normal'])
        hit_sample = plane_hit(second['point'], d2, sample.z)
        if hit_sample is None:
            row['failure'] = 'second reflection does not travel to sample plane'; rows.append(row); continue
        row['sampleError'] = radial(hit_sample, sample)
        stage_hits = [cast(emitter, first['point'], exclude=transparent | {cone_node}), cast(first['point'], second['point'], exclude=transparent | {cone_node, outer_node}), cast(second['point'], hit_sample, exclude=transparent | {outer_node})]
        row['blockers'] = [brief(h) for h in stage_hits if h]
        row['upstreamBlockers'] = [brief(h) for h in stage_hits[:2] if h]
        row['conePointBlender'] = list(first['point']); row['outerPointBlender'] = list(second['point'])
        row['samplePointBlender'] = list(hit_sample)
        zlo = objective.z + min(opt['focusRange']); zhi = objective.z + max(opt['focusRange'])
        vx, vy = d2.x / d2.z, d2.y / d2.z
        ux, uy = second['point'].x - objective.x - vx * second['point'].z, second['point'].y - objective.y - vy * second['point'].z
        denominator = vx * vx + vy * vy
        zmin = max(zlo, min(zhi, -(ux * vx + uy * vy) / denominator)) if denominator > 1e-20 else zlo
        row['objectiveClearance'] = math.hypot(ux + vx * zmin, uy + vy * zmin) - opt['objectiveRadius']
        rows.append(row)
    valid = [r for r in rows if 'failure' not in r]
    center_hit = cast(source, source + axis * (objective.z - source.z), exclude=transparent | receiver_names)
    record('absorbing center tip blocks the otherwise singular axial center ray', center_hit is not None and center_hit['node'] in moving_names, blocker=brief(center_hit), note='Central tip absorption is checked separately from the reflective annular rays.')
    record('centered cone blocks sampled axial light before the receiver', all(r['firstBlocker'] in moving_names for r in direct_closed), sampledRays=len(direct_closed), unexpected=[r for r in direct_closed if r['firstBlocker'] not in moving_names][:24])
    admitted = [r for r in valid if not r['blockers']]
    record('actual two triangle reflections send admitted rays toward sample', bool(admitted) and len(valid) == len(rows) and max([r['sampleError'] for r in valid], default=1) <= manifest['sampleRadius'], rays=len(rows), fullyAdmittedRays=len(admitted), maxSampleError=max([r['sampleError'] for r in valid], default=None), failures=[r for r in rows if 'failure' in r][:24])
    record('actual darkfield rays miss receiver proxy across continuous focus interval', bool(valid) and min(r['objectiveClearance'] for r in valid) > 0, minimumClearance=min([r['objectiveClearance'] for r in valid], default=None), focusRange=opt['focusRange'])
    unexpected_blockers = []
    for r in valid:
        for h in r['blockers']:
            delta = abs((r['azimuthDegrees'] - expected_support.get('azimuthDegrees', 0) + 180) % 360 - 180)
            permitted_stem = h['node'] == support_node and delta <= expected_support.get('halfSectorDegrees', 0)
            permitted_iris = h['node'] in manifest['iris']['bladeNodes']
            permitted_holder = h['node'] == 'tripo_part_21'
            if not (permitted_stem or permitted_iris or permitted_holder):
                unexpected_blockers.append({'azimuthDegrees': r['azimuthDegrees'], **h})
    record('sampled reflected paths have no unexplained obstruction', not unexpected_blockers, unexpected=unexpected_blockers[:40], permittedTypes=['explicit support azimuth sector', 'actual iris clipping', 'retained sample holder'], obstructedRayCount=sum(bool(r['blockers']) for r in valid), completelyClearRayCount=sum(not r['blockers'] for r in valid))

    # Cone motion: inspect actual cone surface vertices and actual mesh intersections.
    origin = cone_root.location.copy(); offset = vec(manifest['centralCone']['openOffset'])
    transform = cone_root.parent.matrix_world.inverted().to_3x3() if cone_root.parent else Matrix.Identity(3)
    local_offset = transform @ offset
    envelope = manifest['lampHousingEnvelope']; chamber_center = vec(envelope['center'])
    allowed_pairs = {frozenset(pair) for pair in manifest.get('mechanicalContactPairs', [])}
    static_names = set(meshes) - moving_names - set(manifest['iris']['bladeNodes'])
    motion_rows = []
    for fraction in [0, .25, .5, .75, 1]:
        cone_root.location = origin + local_offset * fraction; bpy.context.view_layer.update()
        for name in moving_names:
            trees[name] = tree(meshes[name])
        verts, _ = evaluated(meshes[cone_node]); bounds_ok = True; min_margin = float('inf')
        for p in verts:
            lo, hi = envelope['heightRange']; inner0, inner1 = envelope['innerRadiusRange']
            inner = inner0 + (inner1 - inner0) * (p.z - lo) / (hi - lo)
            margin = min(inner - radial(p, chamber_center), p.z - lo, hi - p.z)
            min_margin = min(min_margin, margin); bounds_ok &= margin >= -1e-6
        collisions = []
        for moving in moving_names:
            for fixed in static_names:
                if frozenset([moving, fixed]) in allowed_pairs:
                    continue
                overlap = trees[moving].overlap(trees[fixed])
                if overlap:
                    collisions.append({'moving': moving, 'fixed': fixed, 'triangleIntersectionPairs': len(overlap)})
        motion_rows.append({'fraction': fraction, 'coneInsideDeclaredLampCavity': bool(bounds_ok), 'minimumCavityMargin': min_margin, 'meshIntersections': collisions})
    record('central cone stays within lamp cavity at five travel positions', all(r['coneInsideDeclaredLampCavity'] for r in motion_rows), positions=motion_rows, note='Cone vertices checked against declared cavity envelope; actual mesh collision check is separate.')
    record('moving cone assembly has no undeclared stationary mesh intersection', all(not r['meshIntersections'] for r in motion_rows), allowedContactPairs=[sorted(p) for p in allowed_pairs], positions=motion_rows, note='Triangle intersection sampling does not prove all continuous positions or detect wholly enclosed volumes.')
    # Brightfield uses the same parallel aperture; no peripheral reflector is energized.
    open_rows = []
    for emitter, _ in [(source.copy(), 0), *emitters]:
        target = emitter + axis * (objective.z - source.z)
        hit = cast(emitter, target, exclude=transparent | receiver_names)
        open_rows.append({'radius': radial(emitter, source), 'blocker': brief(hit)})
    record('parked cone restores central brightfield', open_rows[0]['blocker'] is None, central=open_rows[0])
    record('parked cone leaves parallel bundle clear of added internals', all(r['blocker'] is None or r['blocker']['node'] == 'tripo_part_21' for r in open_rows), sampledRays=len(open_rows), retainedHolderShadows=[r for r in open_rows if r['blocker'] and r['blocker']['node'] == 'tripo_part_21'], unexpected=[r for r in open_rows if r['blocker'] and r['blocker']['node'] != 'tripo_part_21'][:32])
    cone_root.location = origin; bpy.context.view_layer.update()
    for name in moving_names:
        trees[name] = tree(meshes[name])

    iris_rows = []; iris_names = set(manifest['iris']['bladeNodes']); iris_center = vec(opt['irisCenter'])
    mapping = manifest['iris']['radiusMapping']
    for fraction in [0, .25, .5, .75, 1]:
        for name in iris_names:
            keys = meshes[name].data.shape_keys
            keys.key_blocks[manifest['iris']['morphTarget']].value = 1 - fraction
        bpy.context.view_layer.update()
        for name in iris_names:
            trees[name] = tree(meshes[name])
        opening = mapping['min'] + fraction * (mapping['max'] - mapping['min'])
        clear = blocked = 0
        for k in range(32):
            phi = 2 * math.pi * (k + .17) / 32
            for factor in [.92, 1.08]:
                p = iris_center + Vector((factor * opening * math.cos(phi), factor * opening * math.sin(phi), 0))
                hit = cast(p - axis * .012, p + axis * .012, only=iris_names)
                clear += factor < 1 and hit is None
                blocked += factor > 1 and hit is not None
        paths_pass = 0
        for row in valid:
            a, b = Vector(row['outerPointBlender']), Vector(row['samplePointBlender'])
            paths_pass += cast(a, b, only=iris_names) is None
        iris_rows.append({'openFraction': fraction, 'radius': opening, 'clearHoleProbes': clear, 'blockedOuterProbes': blocked, 'admittedReflectedSamples': paths_pass})
    record('actual exported iris changes aperture monotonically and clips reflected paths', all(r['clearHoleProbes'] == 32 and r['blockedOuterProbes'] == 32 for r in iris_rows) and all(a['admittedReflectedSamples'] <= b['admittedReflectedSamples'] for a, b in zip(iris_rows, iris_rows[1:])), positions=iris_rows)

    # Validate exact illustrated paths, with physical iris clipping recorded.
    displayed = []
    for route in opt['twoReflectionPaths']:
        points = [vec(route[k]) for k in ['exitPoint', 'conePoint', 'outerPoint', 'samplePoint']]
        blockers = [cast(points[i], points[i+1], exclude=transparent | ({cone_node} if i == 0 else {cone_node, outer_node} if i == 1 else {outer_node})) for i in range(3)]
        displayed.append({'azimuthDegrees': route['azimuthDegrees'], 'radius': route['beamRadius'], 'blockers': [brief(h) for h in blockers if h]})
    record('illustrated routes contain only explicitly clipped paths', all(all(h['node'] in iris_names or h['node'] == support_node or h['node'] == 'tripo_part_21' for h in r['blockers']) for r in displayed), paths=len(displayed), obstructed=[r for r in displayed if r['blockers']], note='UI must omit any path listed as obstructed at the current iris opening; no browser claim made here.')

    validator = None
    try:
        module = Path(__file__).resolve().parents[1] / 'node_modules/gltf-validator/index.js'
        js = "const fs=require('fs');const v=require(process.argv[1]);v.validateBytes(new Uint8Array(fs.readFileSync(process.argv[2])),{uri:'model.glb',maxIssues:1000}).then(x=>process.stdout.write(JSON.stringify(x)))"
        proc = subprocess.run([shutil.which('node') or '/opt/homebrew/bin/node', '-e', js, str(module), str(model_path)], capture_output=True, text=True, check=True)
        validator = json.loads(proc.stdout)
        record('Khronos glTF Validator has no errors', validator['issues']['numErrors'] == 0, issues=validator['issues'])
    except Exception as error:
        record('Khronos glTF Validator has no errors', False, error=str(error))
    record('checked GLB and source stayed unchanged during the independent run', sha(model_path.read_bytes()) == model_sha and sha(source_path.read_bytes()) == source_sha)
    report = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'modelSha256': model_sha, 'sourceSha256': source_sha, 'method': 'Independent GLB import; actual evaluated triangle normals for two reflections; fixed parallel-beam sampling; raw GLB exterior/UV/encoded-texture comparison.', 'coordinateUnits': manifest['units'], 'checks': checks, 'reflectionSamples': rows, 'passed': all(c['passed'] for c in checks), 'limitations': ['No authoring modules imported.', 'Ideal collimation begins at declared exit; real lens transport and LED etendue are not tested.', 'Discrete rays, finite motion positions, and conservative receiver proxy do not constitute continuous optical proof or manufacturer calibration.', 'Retained holder shadows and declared support sector are recorded, not converted to optical-power percentages.', 'No browser, real sample, manufacturing, radiometry, or physical acceptance claim.']}
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    path = output / ('independent-export-' + model_sha[:12] + '-' + stamp + '.json')
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    (output / 'independent-export-latest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'report': str(path), 'passed': report['passed'], 'checks': len(checks), 'failed': [c['name'] for c in checks if not c['passed']]}, ensure_ascii=False), flush=True)
    if not report['passed']:
        sys.exit(2)


if __name__ == '__main__':
    main()
