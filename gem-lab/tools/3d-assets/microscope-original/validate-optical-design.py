#!/usr/bin/env python3
"""Independent geometric checks for the authored microscope lighting layout.

The finite emitting patch is conservatively enclosed in a sphere. All emitted
directions remain within the contract's half-angle of the nominal LED axis.
The aperture tests concern unscattered direct rays, not microscope imaging.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path


def analyze(contract: dict) -> dict:
    o = contract["optics"]
    df, bf = o["darkfield"], o["brightfield"]
    sample = o["samplePosition"]
    pupil = o["observationEntrance"]
    source = df["center"]
    radius = df["radius"]
    patch = df["emittingPatchRadius"]
    half = math.radians(df["divergenceHalfAngleDegrees"])
    focus_range = contract["rigs"]["focus"]["rangeMeters"]
    sample_height = sample[1] - source[1]
    beta = math.atan2(radius, sample_height)
    checks = []

    def check(name, passed, **values):
        checks.append({"id": name, "passed": bool(passed), **values})

    aligned = all(abs(p[i] - sample[i]) < 1e-10
                  for p in (pupil, source, bf["center"], df["target"])
                  for i in (0, 2))
    check("analytical_assumptions", aligned and sample_height > 0
          and contract["rigs"]["focus"]["axisLocal"] == [0, 1, 0]
          and focus_range[0] <= focus_range[1] and 0 < half < beta
          and beta + half < math.pi / 2 and patch > 0,
          note="Coaxial ring and pupil; optical head translates on +Y; fixed nominal LED axes; patch enclosed by sphere.")

    # For every source point in a sphere of radius `patch`, the set of possible
    # direct intersections is contained in the cone from the nominal source to
    # a sphere around the pupil with radius pupilRadius+patch (Minkowski bound).
    # Increasing pupil Y strictly increases axis separation and decreases the
    # sphere's angular radius in this coaxial layout: minimum focus is the
    # worst case, so the full continuous focus interval is covered.
    pupil_results = []
    for focus in focus_range:
        height = pupil[1] + focus - source[1]
        distance = math.hypot(radius, height)
        separation = beta - math.atan2(radius, height)
        angular_radius = math.asin((o["observationRadius"] + patch) / distance)
        clearance = separation - half - angular_radius
        # A second, independent plane-intersection lower bound. It is valid
        # once the entire cone has crossed the optical axis before the pupil.
        closest = height * math.tan(beta - half) - radius - patch / math.cos(beta - half)
        pupil_results.append({"focusMeters": focus,
                              "angularClearanceDegrees": math.degrees(clearance),
                              "minimumDirectRayRadiusMeters": closest,
                              "pupilEdgeClearanceMeters": closest - o["observationRadius"]})
    check("finite_source_full_cone_misses_pupil_all_focus",
          all(v["angularClearanceDegrees"] > 0 and v["pupilEdgeClearanceMeters"] > 0
              for v in pupil_results),
          endpoints=pupil_results,
          continuousIntervalProof="Minimum focus is worst case; separation increases and inflated pupil angular radius decreases as the pupil moves upward.")

    def inward_edge(y):
        # Radial minimum before the cone crosses the axis. Every tangential
        # component can only increase the distance from that axis.
        return radius - (y - source[1]) * math.tan(beta + half) - patch / math.cos(beta + half)

    separator = o["separator"]
    separator_clearance = inward_edge(separator["heightRange"][1]) - separator["outerRadius"]
    check("darkfield_full_cone_clears_separator", separator_clearance > 0,
          minimumRadialClearanceMeters=separator_clearance,
          note="Upper end is the worst case before the crossover; whole finite-source beam stays outside the tube.")

    shutter = df["shutter"]
    shutter_top = shutter["center"][1] + shutter["thickness"] / 2
    shutter_bottom = shutter["center"][1] - shutter["thickness"] / 2
    shutter_clearance = inward_edge(shutter_top) - shutter["radius"]
    check("darkfield_full_cone_clears_closed_black_shutter", shutter_clearance > 0,
          minimumRadialClearanceMeters=shutter_clearance)

    stage = o["fixedAperture"]
    # A Lipschitz bound for the slope map (dx/dy,dz/dy) over the full cone.
    # This is intentionally wider than its actual elliptical intersection.
    # Its piecewise convex radial envelope reaches its maximum at an endpoint.
    slope_delta = half / (math.cos(beta + half) ** 2)
    def outer_envelope(y):
        h = y - source[1]
        return abs(radius - h * math.tan(beta)) + abs(h) * slope_delta + patch / math.cos(beta + half)
    stage_radius = max(outer_envelope(y) for y in stage["heightRange"])
    check("darkfield_full_cone_passes_stage_aperture", stage_radius < stage["radius"],
          maximumConservativeBeamRadiusMeters=stage_radius,
          minimumRadialClearanceMeters=stage["radius"] - stage_radius)

    sample_distance = math.hypot(radius, sample_height)
    sample_angle = math.asin(o["sampleRadius"] / sample_distance)
    check("nominal_led_cones_cover_fixed_sample", sample_angle < half,
          sampleAngularRadiusDegrees=math.degrees(sample_angle),
          halfAngleDegrees=df["divergenceHalfAngleDegrees"],
          note="Every sample point is inside every nominal source-point cone. This establishes coverage, not uniform intensity or coverage by every point of the finite emitting patch.")

    # BF bundle: direct rays connecting any diffuser point to any pupil point.
    def bf_bundle_radius(y, focus):
        t = (y - bf["center"][1]) / (pupil[1] + focus - bf["center"][1])
        return (1 - t) * bf["radius"] + t * o["observationRadius"]

    tube_bf_radius = max(bf_bundle_radius(y, f)
                         for y in separator["heightRange"] if y >= bf["center"][1]
                         for f in focus_range)
    check("brightfield_pupil_bundle_clears_separator", tube_bf_radius < separator["innerRadius"],
          minimumRadialClearanceMeters=separator["innerRadius"] - tube_bf_radius)
    shutter_bf_radius = max(bf_bundle_radius(y, f)
                            for y in (shutter_bottom, shutter_top) for f in focus_range)
    closed_offset = math.hypot(shutter["closedTranslation"][0], shutter["closedTranslation"][2])
    closed_clearance = shutter["radius"] - shutter_bf_radius - closed_offset
    check("closed_shutter_blocks_direct_diffuser_to_pupil_bundle", closed_clearance > 0,
          minimumRadialCoverageMeters=closed_clearance)
    open_offset = math.hypot(shutter["openTranslation"][0], shutter["openTranslation"][2])
    open_clearance = open_offset - shutter["radius"] - shutter_bf_radius
    check("open_shutter_clears_brightfield_bundle", open_clearance > 0,
          minimumRadialClearanceMeters=open_clearance)

    check("rigid_tilt_preserves_optical_geometry", contract["rigs"]["focus"]["parent"] == contract["rigs"]["tilt"]["node"],
          note="Rigid transformation preserves these distances and angles only if lamps, sample, entrance and optical head share the tilt rig. Actual glTF hierarchy is a separate check.")
    return {
        "schemaVersion": 1,
        "assetId": contract["assetId"],
        "passed": all(c["passed"] for c in checks),
        "method": "Conservative analytic bounds for a finite source sphere and full divergent cone; all azimuths and continuous allowed focus range.",
        "checks": checks,
        "limitations": [
            "Author-created dimensions; no manufacturer reconstruction or physical calibration.",
            "Simulated entrance is a geometric acceptance proxy, not a measured optical entrance pupil or numerical aperture.",
            "No gemstone refraction, multiple scattering, diffraction, stereo imaging, magnification, depth of field or radiometric calibration is calculated.",
            "Direct geometric beam checks do not certify real stray-light suppression, internal reflections, LED lens performance, thermal safety or manufacturability.",
            "Actual mesh clearances, control behavior and browser output require separate verification.",
        ],
        "sources": [
            {"url": "https://www.microscopyu.com/techniques/stereomicroscopy/darkfield-illumination", "use": "Principle only: unscattered oblique illumination must miss the objective; some light redirected by the specimen can be collected."},
            {"url": "https://www.gia.edu/gems-gemology/summer-2015-digital-photomicrography-gemologists", "use": "Teaching context: brightfield and darkfield reveal different features; dust and surface scratches may also scatter light."},
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    here = Path(__file__).resolve().parent
    parser.add_argument("--contract", type=Path, default=here / "contract.json")
    parser.add_argument("--output", type=Path, default=here / "validation" / "optical-design-check.json")
    args = parser.parse_args()
    raw = args.contract.read_bytes()
    result = analyze(json.loads(raw))
    result["checkedAt"] = datetime.now(timezone.utc).isoformat()
    result["contractSha256"] = hashlib.sha256(raw).hexdigest()
    sibling_model = args.contract.parent / contract_model_name(raw)
    if sibling_model.is_file():
        result["associatedModelSha256"] = hashlib.sha256(sibling_model.read_bytes()).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"passed": result["passed"], "checks": len(result["checks"]),
                      "failed": [c["id"] for c in result["checks"] if not c["passed"]],
                      "output": str(args.output)}, ensure_ascii=False))
    raise SystemExit(0 if result["passed"] else 1)


def contract_model_name(raw):
    return json.loads(raw).get("model", "model.glb")


if __name__ == "__main__":
    main()
