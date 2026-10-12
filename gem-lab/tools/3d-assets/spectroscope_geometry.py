"""Shared Amici construction and pure geometry checks; never imports Blender.

python3 gem-lab/tools/3d-assets/spectroscope_geometry.py --check
The report checks the authored geometry only, not exported meshes or dispersion.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

ROOT = next(p for p in Path(__file__).resolve().parents if p.name == 'gem-lab' and (p / 'public').is_dir())
AMICI_HALF_WIDTH = .0056
AMICI_HALF_LENGTH = .013
AMICI_HALF_HEIGHT = .0040
AMICI_GUIDE_WIDTH = .00014
AMICI_GUIDE_DEPTH = .00008
AMICI_GUIDE_END_TRIM = .00020
AMICI_SECTIONS = [
    [(-AMICI_HALF_WIDTH, -AMICI_HALF_LENGTH), (AMICI_HALF_WIDTH, -AMICI_HALF_LENGTH), (-AMICI_HALF_WIDTH, 0)],
    [(-AMICI_HALF_WIDTH, 0), (AMICI_HALF_WIDTH, -AMICI_HALF_LENGTH), (AMICI_HALF_WIDTH, AMICI_HALF_LENGTH)],
    [(-AMICI_HALF_WIDTH, 0), (AMICI_HALF_WIDTH, AMICI_HALF_LENGTH), (-AMICI_HALF_WIDTH, AMICI_HALF_LENGTH)],
]
AMICI_APPEARANCE = {
    'crown': {'baseColor': [.80, .91, .98], 'transmission': .92, 'roughness': .055, 'ior': 1.52},
    'flint': {'baseColor': [.96, .91, .74], 'transmission': .86, 'roughness': .065, 'ior': 1.62},
}


def interface_descriptions():
    """Two alternating planes, represented in the exported XZ optical section."""
    slope = AMICI_HALF_LENGTH / (2 * AMICI_HALF_WIDTH)
    return [{
        'node': f'PrismSpectroscope_amici_cement_interface_{index}',
        'planeXZ': {'zInterceptMeters': sign * AMICI_HALF_LENGTH / 2, 'zSlopePerX': sign * slope},
        'between': ['crown', 'flint'] if index == 1 else ['flint', 'crown'],
        'edgeGuidesOnly': True,
        'widthMeters': AMICI_GUIDE_WIDTH,
        'depthMeters': AMICI_GUIDE_DEPTH,
        'guideFaces': ['+Y', '-Y'],
    } for index, sign in [(1, -1), (2, 1)]]


def interface_guide_mesh(index):
    """Two closed narrow ribbons on the outside Y faces; no internal air gap.

    The strips exaggerate cement-edge visibility. They are NOT physical opaque
    layers spanning the glass or additional dispersive optical elements.
    """
    interface = interface_descriptions()[index - 1]['planeXZ']
    slope, intercept = interface['zSlopePerX'], interface['zInterceptMeters']
    half = AMICI_HALF_WIDTH - AMICI_GUIDE_END_TRIM
    start, end = (-half, intercept - slope * half), (half, intercept + slope * half)
    dx, dz = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dz)
    nx, nz = -dz / length * AMICI_GUIDE_WIDTH / 2, dx / length * AMICI_GUIDE_WIDTH / 2
    vertices, faces = [], []
    for side in [-1, 1]:
        offset = len(vertices)
        for y in [side * AMICI_HALF_HEIGHT, side * (AMICI_HALF_HEIGHT + AMICI_GUIDE_DEPTH)]:
            vertices.extend([(start[0] - nx, y, start[1] - nz), (end[0] - nx, y, end[1] - nz),
                             (end[0] + nx, y, end[1] + nz), (start[0] + nx, y, start[1] + nz)])
        faces.extend(tuple(offset + j for j in face) for face in
                     [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
    return vertices, faces


def _area(section):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(section, section[1:] + section[:1])) / 2


def _center_interval(section):
    hits = []
    for a, b in zip(section, section[1:] + section[:1]):
        if (a[0] < 0 < b[0]) or (b[0] < 0 < a[0]):
            factor = -a[0] / (b[0] - a[0])
            hits.append(a[1] + factor * (b[1] - a[1]))
    return sorted(hits)


def geometry_report():
    intervals = [_center_interval(s) for s in AMICI_SECTIONS]
    expected = [[-.013, -.0065], [-.0065, .0065], [.0065, .013]]
    areas = [_area(s) for s in AMICI_SECTIONS]
    interfaces = interface_descriptions()
    shared_edges = [[AMICI_SECTIONS[0][2], AMICI_SECTIONS[0][1]], [AMICI_SECTIONS[2][0], AMICI_SECTIONS[2][1]]]
    guides = [interface_guide_mesh(i) for i in [1, 2]]
    all_vertices = [v for vertices, _ in guides for v in vertices]
    containment = max(math.hypot(v[0], v[1]) for v in all_vertices)
    manifold_edges = []
    for _, faces in guides:
        counts = {}
        for face in faces:
            for a, b in zip(face, face[1:] + face[:1]):
                key = tuple(sorted((a, b)))
                counts[key] = counts.get(key, 0) + 1
        manifold_edges.append(all(count == 2 for count in counts.values()))
    checks = {
        'threePositiveTriangularSections': len(areas) == 3 and all(a > 0 for a in areas),
        'sectionsTileOpticalBlock': math.isclose(sum(areas), 4 * AMICI_HALF_WIDTH * AMICI_HALF_LENGTH, abs_tol=1e-15),
        'centerlineIntervalsPreserveRound2': all(len(actual) == 2 and all(math.isclose(x, y, abs_tol=1e-12) for x, y in zip(actual, target)) for actual, target in zip(intervals, expected)),
        'twoSharedCementInterfaces': all(all(point in AMICI_SECTIONS[1] and math.isclose(point[1], item['planeXZ']['zInterceptMeters'] + item['planeXZ']['zSlopePerX'] * point[0], abs_tol=1e-12) for point in edge) for item, edge in zip(interfaces, shared_edges)),
        'alternatingSlopes': interfaces[0]['planeXZ']['zSlopePerX'] * interfaces[1]['planeXZ']['zSlopePerX'] < 0,
        'glassHasNoAxialAirGaps': all(math.isclose(intervals[i][1], intervals[i + 1][0], abs_tol=1e-12) for i in [0, 1]),
        'guideMeshesClosed': all(manifold_edges),
        'guidesLeaveOpticalCenterlineClear': all(abs(v[1]) >= AMICI_HALF_HEIGHT for v in all_vertices),
        'guidesInsideBarrel': containment < .009 - .00085,
        'guidesStayInsideOpticalBlockLength': all(abs(v[2]) < AMICI_HALF_LENGTH for v in all_vertices),
        'distinctGlassAppearance': AMICI_APPEARANCE['crown']['baseColor'] != AMICI_APPEARANCE['flint']['baseColor'] and AMICI_APPEARANCE['crown']['transmission'] != AMICI_APPEARANCE['flint']['transmission'],
        'flintSlightYellowAndHigherIOR': AMICI_APPEARANCE['flint']['baseColor'][0] >= AMICI_APPEARANCE['flint']['baseColor'][1] > AMICI_APPEARANCE['flint']['baseColor'][2] and AMICI_APPEARANCE['flint']['ior'] > AMICI_APPEARANCE['crown']['ior'],
    }
    return {
        'ok': all(checks.values()), 'scope': 'pure-mathematical-authored-geometry',
        'round': 3, 'revision': 'repair-v3', 'instrument': 'prism-spectroscope', 'checks': checks,
        'centerlineIntervalsMeters': intervals, 'sectionAreasSquareMeters': areas,
        'interfaces': interfaces, 'materialAppearance': AMICI_APPEARANCE,
        'maxGuideRadialMeters': containment,
        'sourceSha256': {name: hashlib.sha256((ROOT / 'tools/3d-assets' / name).read_bytes()).hexdigest()
                         for name in ['spectroscope_geometry.py', 'blender/build_spectroscopes.py']},
        'boundary': 'Checks shared construction parameters only. Blender export, material appearance, rendered interface visibility and browser rendering remain unverified. No dispersion calculation, glass prescription or wavelength calibration.',
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'assets-source/instruments-2026-10-07/round3/amici-geometry-check.json')
    options = parser.parse_args()
    report = geometry_report()
    options.output.parent.mkdir(parents=True, exist_ok=True)
    options.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report['ok'] else 1)
