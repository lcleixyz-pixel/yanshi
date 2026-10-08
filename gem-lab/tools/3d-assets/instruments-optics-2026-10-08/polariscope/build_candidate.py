#!/usr/bin/env python3
"""Build a separate, source-preserving polariscope optical-path candidate.

No Blender re-export is needed: model.glb is copied byte-for-byte. Standard
library only. All coordinates are glTF Y-up in uncalibrated model units.
"""
from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import math
from pathlib import Path
import shutil
import struct

WORKTREE_ROOT = Path(__file__).resolve().parents[5]
SOURCE_ROOT = WORKTREE_ROOT
OUTPUT_RELATIVE = Path('gem-lab/assets-source/optics-paper-review/2026-10-08/polariscope')
SOURCE_ASSET = Path('gem-lab/public/assets/3d/polariscope/structure-v1')
EXPECTED_MODEL_SHA = '0d4eb62f630e74915d31524010e51e1ce031c9b50f00314a1195b7c8ce469a7b'
IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def add(a, b): return [x + y for x, y in zip(a, b)]
def sub(a, b): return [x - y for x, y in zip(a, b)]
def scale(a, s): return [x * s for x in a]
def norm(a): return math.sqrt(sum(x * x for x in a))
def unit(a): return scale(a, 1 / norm(a))
def dot(a, b): return sum(x * y for x, y in zip(a, b))
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def qmul(a, b):
    av, bv = a[:3], b[:3]
    return add(add(scale(bv, a[3]), scale(av, b[3])), cross(av, bv)) + [a[3]*b[3]-dot(av, bv)]


def qrotate(q, v):
    return add(v, scale(cross(q[:3], add(cross(q[:3], v), scale(v, q[3]))), 2))


def qbetween(a, b):
    a, b = unit(a), unit(b)
    q = cross(a, b) + [1 + dot(a, b)]
    if norm(q) < 1e-10:
        basis = [1, 0, 0] if abs(a[0]) < .8 else [0, 1, 0]
        return unit(cross(a, basis)) + [0]
    return unit(q)


def mmul(a, b):
    return [sum(a[k*4+r] * b[c*4+k] for k in range(4)) for c in range(4) for r in range(4)]


def transform(a, p):
    return [sum(a[c*4+r] * p[c] for c in range(3)) + a[12+r] for r in range(3)]


def node_matrix(node):
    if 'matrix' in node:
        return node['matrix']
    t, s = node.get('translation', [0, 0, 0]), node.get('scale', [1, 1, 1])
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    a = [1-2*y*y-2*z*z, 2*x*y+2*z*w, 2*x*z-2*y*w, 0,
         2*x*y-2*z*w, 1-2*x*x-2*z*z, 2*y*z+2*x*w, 0,
         2*x*z+2*y*w, 2*y*z-2*x*w, 1-2*x*x-2*y*y, 0, *t, 1]
    for c in range(3):
        for r in range(3): a[c*4+r] *= s[c]
    return a


def geometry(source):
    data = source.read_bytes()
    length = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20+length])
    boxes, origins = {}, {}

    def walk(index, parent):
        node = gltf['nodes'][index]
        matrix = mmul(parent, node_matrix(node))
        name = node.get('name', str(index))
        origins[name] = transform(matrix, [0, 0, 0])
        if 'mesh' in node:
            points = []
            for primitive in gltf['meshes'][node['mesh']]['primitives']:
                accessor = gltf['accessors'][primitive['attributes']['POSITION']]
                points.extend(transform(matrix, p) for p in itertools.product(*zip(accessor['min'], accessor['max'])))
            boxes[name] = ([min(p[k] for p in points) for k in range(3)], [max(p[k] for p in points) for k in range(3)])
        for child in node.get('children', []): walk(child, matrix)

    for index in gltf['scenes'][gltf.get('scene', 0)]['nodes']: walk(index, IDENTITY)
    return boxes, origins


def center(box): return [(a+b)/2 for a, b in zip(*box)]
def size(box): return [b-a for a, b in zip(*box)]


def sources():
    return {
        'schemaVersion': 1, 'instrumentId': 'polariscope', 'reviewDate': '2026-10-08',
        'sources': [
            {'id': 'gia-polariscope-guide', 'title': 'GIA Polariscope User Guide',
             'publisher': 'Gemological Institute of America',
             'url': 'https://www.gia.edu/doc/GIA-Polariscope-User-Guide-English.pdf',
             'pages': 'Printed pp. 4–5, 7–10; Fig. 2 on p. 9',
             'supports': ['Bottom polarizer, rotatable sample plate, top analyzer.', 'Sphere above and close to or touching an appropriate bright interference-colour area.'],
             'retrieval': 'Official PDF text read; screenshot extraction unavailable.', 'redistributedContent': 'none'},
            {'id': 'nelson-1985', 'title': 'A Low-Cost Spectroscope Unit Having Additional Gemmological Applications',
             'authors': ['James B. Nelson'], 'year': 1985, 'journal': 'Journal of Gemmology',
             'volume': '19(6)', 'pages': '500–520; relevant pp. 509–511, Figs. 5–6',
             'doi': '10.15506/jog.1985.19.6.500',
             'url': 'https://gem-a.com/wp-content/uploads/2023/11/JoG1985_19_6.pdf',
             'supports': ['Height-adjustable sphere arm; sphere placed at the specimen surface.'],
             'retrieval': 'Official PDF search-index text for target pages; full PDF fetch timed out.',
             'notTransferred': 'Accessory hardware and dimensions are not copied into this instrument.', 'redistributedContent': 'none'},
            {'id': 'samlan-2016', 'title': 'Isogyres – Manifestation of Spin-orbit interaction in uniaxial crystal: A closed-fringe Fourier analysis of conoscopic interference',
             'authors': ['C. T. Samlan', 'Dinesh N. Naik', 'Nirmal K. Viswanathan'], 'year': 2016,
             'journal': 'Scientific Reports', 'volume': '6', 'article': '33141', 'doi': '10.1038/srep33141',
             'url': 'https://www.nature.com/articles/srep33141', 'figures': ['1', '3'],
             'supports': ['Conoscopic figures combine different propagation directions through the crystal and analysis by the second polarizer.'],
             'notTransferred': 'The research apparatus uses a laser and separate lenses; these are not a gem-polariscope assembly prescription.',
             'retrieval': 'Official full HTML text read.', 'redistributedContent': 'none'},
            {'id': 'veiras-2012', 'title': 'Wide angle conoscopic interference patterns in uniaxial crystals',
             'authors': ['Francisco E. Veiras', 'María T. Garea', 'Liliana I. Perez'], 'year': 2012,
             'journal': 'Applied Optics', 'volume': '51(15)', 'pages': '3081–3090',
             'doi': '10.1364/AO.51.003081', 'url': 'https://opg.optica.org/ao/abstract.cfm?uri=ao-51-15-3081',
             'supports': ['High-angle quantitative modelling needs explicit treatment of approximation limits.'],
             'retrieval': 'Official bibliographic record and abstract read; full equations not validated in this candidate.',
             'redistributedContent': 'none'},
        ],
        'licenseNote': 'Reference-only citations. No paper figures, manufacturer photos, or new external geometry are redistributed. The unchanged GLB retains its original provenance and license boundaries.',
    }


def build(source_root, output):
    source_asset = source_root / SOURCE_ASSET
    original_model = source_asset / 'repaired.glb'
    original_sha = sha(original_model)
    if original_sha != EXPECTED_MODEL_SHA:
        raise RuntimeError('Source GLB changed; review its geometry before rebuilding this candidate.')
    output.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(original_model, output / 'model.glb')
    manifest = json.loads((source_asset / 'manifest.json').read_text())
    preserved_parts = json.loads(json.dumps(manifest['parts']))
    manifest.update({'model': 'model.glb', 'sha256': original_sha, 'candidateId': 'polariscope-paper-optics-2026-10-08',
                     'opticalCases': 'optical-cases.json', 'sourceProvenance': 'original-provenance.json',
                     'geometryUnchanged': True, 'teachingOpticsSimulated': True})
    shutil.copyfile(source_asset / 'provenance.json', output / 'original-provenance.json')
    write_json(output / 'manifest.json', manifest)
    write_json(output / 'sources.json', sources())

    boxes, origins = geometry(original_model)
    support = boxes['Stage_clear_sample_support']; sample_base = support[1][1]
    cx, _, cz = center(support)
    diameter = max(size(support)[0], size(support)[2]) * .4
    sphere_box = boxes['Conoscope_clear_lens']; radius = max(size(sphere_box)) / 2
    sphere_center = center(sphere_box); original_origin = origins['Polariscope_conoscope']
    gap = radius * 2 * .04
    ring_size = size(boxes['Conoscope_regular_open_ring'])
    normal = [0, 0, 0]; normal[ring_size.index(min(ring_size))] = 1
    align = qbetween(normal, [0, 1, 0])
    handle = qrotate(align, sub(center(boxes['Tripo_retained_conoscope_handle']), sphere_center))
    handle[1] = 0
    heading = math.atan2(handle[2], handle[0])
    align = qmul([0, math.sin(heading/2), 0, math.cos(heading/2)], align)
    align = unit(align)
    light_offset = manifest['internalLight'].get('teachingOffsetNative', [0, 0, 0])
    emitter = add(center(boxes['Internal_light_emitting_surface']), light_offset)
    lower = center(boxes['Fixed_lower_polarizer_glass'])
    analyzer = center(boxes['Analyzer_independent_glass'])
    after = [cx, analyzer[1]+.075, cz]
    common_offsets = {'light': light_offset}

    def path(pid, kind, points, color='#efbd67'):
        return {'id': pid, 'kind': kind, 'color': color, 'points': points}

    def ordinary(crossed=False):
        paths = [path('source-to-polarizer', 'unpolarized-guide', [emitter, lower], '#efbd67'),
                 path('polarizer-to-analyzer', 'linear-polarization-guide', [lower, [cx, sample_base, cz], analyzer], '#71d2c5')]
        if not crossed: paths.append(path('analyzer-output', 'analyzed-output-guide', [analyzer, after], '#c5b3ff'))
        return paths

    def sample_mesh(kind):
        if kind == 'gem':
            h = diameter * .61
            return {'id': 'schematic-specimen', 'label': '刻面几何示意样品（非实测宝石）', 'shape': 'gem',
                    'position': [cx, sample_base+h/2, cz], 'scale': [diameter/2, h/2, diameter/2],
                    'color': '#88d3c8', 'opacity': .44}, h
        h = diameter * .3
        return {'id': 'schematic-specimen', 'label': '弧面几何示意样品（非实测宝石）', 'shape': 'cabochon',
                'position': [cx, sample_base, cz], 'scale': [diameter/2, h, diameter*.4],
                'color': '#abc8eb', 'opacity': .44}, h

    cases = [
        {'id': 'empty-parallel', 'label': '空载 · 平行', 'description': '保留正确的部件次序：底座内光源 → 下偏光片 → 空载物台 → 上偏光片。透过率以下片后光强为 100%；光线和颜色均为教学叠层。',
         'parameters': {'power': True, 'analyzerDeg': 0, 'sample': None, 'conoscopeInserted': False},
         'paths': ordinary(), 'readout': {'relativeTransmission': 1, 'display': '理想相对透过率 100%（以下片后为基准）'},
         'partOffsets': common_offsets, 'teachingMeshes': []},
        {'id': 'empty-crossed', 'label': '空载 · 正交', 'description': '上、下偏光片正交；空载理想出射为零。光源至检偏器的前段仍有光，不把整个光路一并熄灭。',
         'parameters': {'power': True, 'analyzerDeg': 90, 'sample': None, 'conoscopeInserted': False},
         'paths': ordinary(True), 'readout': {'relativeTransmission': 0, 'display': '理想空载消光；前段光路保持'},
         'partOffsets': common_offsets, 'partRotations': {'analyzer': [0, math.sqrt(.5), 0, math.sqrt(.5)]}, 'teachingMeshes': []},
    ]
    mesh, h = sample_mesh('gem')
    cases.append({'id': 'orthoscopic-gem', 'label': '样品位置 · 干涉球收纳',
                  'description': '只展示样品与偏振片的相对位置。此独立候选没有为几何示意样品指定光性、厚度或观察结论；原教学页的明暗与干涉图算法保持不变。',
                  'parameters': {'power': True, 'analyzerDeg': 90, 'sample': 'gem', 'conoscopeInserted': False},
                  'paths': [path('incident-guide', 'incident-direction-guide', [emitter, lower, [cx, sample_base, cz]], '#efbd67')],
                  'readout': {'display': '几何示意样品；本候选不判读光性'}, 'partOffsets': common_offsets,
                  'partRotations': {'analyzer': [0, math.sqrt(.5), 0, math.sqrt(.5)]}, 'teachingMeshes': [mesh]})

    pose_checks = []
    for kind in ('gem', 'cabochon'):
        mesh, h = sample_mesh(kind)
        top = sample_base + h
        target_center = [cx, top+gap+radius, cz]
        rotated_lens_offset = qrotate(align, sub(sphere_center, original_origin))
        target_origin = sub(target_center, rotated_lens_offset)
        offset = sub(target_origin, original_origin)
        sample_mid = sample_base + h*.42
        rays = []
        directions = [(0, 0), (.12, 0), (-.12, 0), (0, .12), (0, -.12)]
        for i, (sx, sz) in enumerate(directions):
            def at(y): return [cx+sx*(y-sample_mid), y, cz+sz*(y-sample_mid)]
            # The change of direction is a schematic collection cue, not a
            # ray/sphere surface intersection or a computed focus.
            sphere_point = at(target_center[1])
            upper_point = [cx+sx*.40, analyzer[1], cz+sz*.40]
            points = [at(emitter[1]), at(lower[1]), at(sample_base), at(sample_mid), sphere_point, upper_point,
                      [upper_point[0], after[1], upper_point[2]]]
            rays.append(path(f'direction-{i}', 'conoscopic-direction-schematic', points, '#f4c87c' if i == 0 else '#70d5ca'))
        actual_center = add(add(original_origin, qrotate(align, sub(sphere_center, original_origin))), offset)
        actual_gap = actual_center[1] - radius - top
        cases.append({'id': f'conoscopic-{kind}', 'label': f'锥光 · {"刻面" if kind == "gem" else "弧面"}样品',
                      'description': '干涉球靠近样品上方，收集来自样品不同传播方向的光，经检偏器观察。5 条折线仅代表方向关系，转折点不是计算焦点；未给球镜处方，也未模拟折射、反射或实际角孔径。',
                      'parameters': {'power': True, 'analyzerDeg': 90, 'sample': kind, 'conoscopeInserted': True,
                                     'directionCount': 5, 'rayTracing': False},
                      'paths': rays, 'readout': {'display': '5 个代表传播方向 · 非真实镜头追迹',
                                                'sphereSampleGapModelUnits': actual_gap,
                                                'gapAsSphereDiameter': actual_gap/(radius*2),
                                                'quantitativeObservation': False},
                      'partOffsets': {**common_offsets, 'conoscope': offset},
                      'partRotations': {'conoscope': align, 'analyzer': [0, math.sqrt(.5), 0, math.sqrt(.5)]},
                      'teachingMeshes': [mesh],
                      'geometryEvidence': {'sampleTopY': top, 'sphereCenter': actual_center, 'sphereRadius': radius,
                                           'supportTopY': sample_base, 'ringNormalAfterRotation': qrotate(align, normal)}})
        pose_checks.append({'caseId': f'conoscopic-{kind}', 'gap': actual_gap, 'sphereCenter': actual_center,
                            'sampleTopY': top, 'ringNormal': qrotate(align, normal)})

    mesh_definitions = {
        'gem': {'constructor': 'THREE.OctahedronGeometry(1)', 'position': 'geometry center', 'scale': 'XYZ radii; y extrema are +/- scale.y', 'rotation': 'identity'},
        'cabochon': {'constructor': 'THREE.SphereGeometry(1,48,24,0,2*Math.PI,0,Math.PI/2)',
                    'position': 'flat-base center', 'scale': 'XYZ radii; y range is [0,scale.y]', 'rotation': 'identity'},
    }
    write_json(output / 'optical-cases.json', {
        'schemaVersion': 1, 'instrumentId': 'polariscope', 'label': '偏光镜 / 干涉球', 'defaultCaseId': 'conoscopic-gem',
        'coordinateSystem': 'glTF Y-up, uncalibrated source-model units; no values are millimetres',
        'transformSemantics': {'partRotations': 'world incremental quaternion [x,y,z,w] about original part world origin; restore original assembly first',
                               'partOffsets': 'world translation applied after partRotations; these are absolute deltas from original assembly, not cumulative'},
        'teachingMeshDefinitions': mesh_definitions, 'cases': cases,
    })
    code_evidence = []
    for relative, lines, issue in [
        ('gem-lab/src/components/polariscope3d/PolariscopeScene.tsx', '490–508, 556–570', 'Fixed sphere height does not follow generated sample height.'),
        ('gem-lab/src/components/polariscope3d/OpticalTeachingOverlay.ts', '137–141, 168–185', 'The existing five axial columns omit the conoscope from the spatial path.'),
        ('gem-lab/src/domain/polarizedLight.ts', '8–24, 339–380', 'Existing ideal-plate interference model already states approximation limits; unchanged.'),
    ]:
        code_evidence.append({'path': relative, 'sha256': sha(source_root/relative), 'linesAtReview': lines, 'finding': issue})
    audit = {
        'schemaVersion': 1, 'instrumentId': 'polariscope', 'date': '2026-10-08',
        'status': 'independent local optical-path candidate; not applied to teaching application',
        'sourceAsset': {'path': str(SOURCE_ASSET/'repaired.glb'), 'sha256': original_sha,
                        'manifestSha256': sha(source_asset/'manifest.json'), 'provenanceSha256': sha(source_asset/'provenance.json')},
        'candidateModel': {'file': 'model.glb', 'sha256': sha(output/'model.glb'), 'bytes': (output/'model.glb').stat().st_size,
                           'byteIdenticalToOriginal': sha(output/'model.glb') == original_sha, 'geometryChanged': False, 'parts': len(preserved_parts)},
        'confirmedRetained': ['Original eight-part instrument exterior, UVs and textures.', 'Bottom light → lower polarizer → sample → upper analyzer order.',
                              'Fixed lower polarizer, independently rotating stage and analyzer.', 'Existing Malus-law, half-wave and sample/interference algorithms in the main project.'],
        'candidateChanges': [
            {'id': 'sphere-placement', 'classification': 'geometry and operation alignment', 'change': 'Sphere placement follows the actual schematic mesh top plus sphere radius and a small gap.', 'sourceIds': ['gia-polariscope-guide', 'nelson-1985']},
            {'id': 'direction-collection', 'classification': 'teaching representation improvement, not a calibrated ray trace',
             'change': 'Five representative directions illustrate collection by the sphere and analysis by the upper polarizer.', 'sourceIds': ['samlan-2016']},
        ],
        'codeEvidence': code_evidence, 'teachingMeshDefinitions': mesh_definitions,
        'geometryChecks': pose_checks,
        'limits': ['No real optical prescription, measured dimensions or angular aperture.', 'The five paths are schematic; no Snell-law, Fresnel or image-formation simulation is claimed.',
                   'The two sample shapes have no assigned gem identity or measured observation.', 'The research lens apparatus is not copied into the gem instrument.',
                   'No main-project files, public assets, sample scoring or existing interference algorithms are changed.', 'Browser review is a separate root-task check.'],
    }
    write_json(output / 'audit.json', audit)
    return {'output': str(output), 'modelSha256': original_sha, 'parts': len(preserved_parts), 'cases': len(cases), 'geometryChecks': pose_checks}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=SOURCE_ROOT)
    parser.add_argument('--output', type=Path, default=WORKTREE_ROOT/OUTPUT_RELATIVE)
    args = parser.parse_args()
    print(json.dumps(build(args.source_root, args.output), ensure_ascii=False, indent=2))
