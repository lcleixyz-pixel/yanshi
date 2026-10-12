#!/usr/bin/env python3
"""Rebuild a teaching polariscope from the project's existing visual references.

Coordinates accepted by geometry helpers are delivery coordinates (X, Y-up, Z-front),
in metres. Blender storage uses (X, -Z, Y). Exported glTF converts back to Y-up.
Dimensions are provisional, not measured. Reference images are not embedded as textures.
"""
import argparse
import hashlib
import json
import math
import struct
import sys
from datetime import datetime, timezone
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[2]
SOURCE = PROJECT / "assets-source" / "polariscope"
OUTPUT = PROJECT / "public" / "assets" / "3d" / "polariscope"
PART_ORDER = ["base", "frame", "light", "polarizer", "stage", "sample", "analyzer", "conoscope"]
LABELS = {"base": "底座", "frame": "机身支架", "light": "光源", "polarizer": "下偏光片", "stage": "载物台", "sample": "示意样品", "analyzer": "上偏光片", "conoscope": "干涉球"}
EXPLODE = {"base": [0, 0, 0], "frame": [0, 0, -0.075], "light": [0, 0.018, 0], "polarizer": [0, 0.045, 0], "stage": [0, 0.082, 0], "sample": [0, 0.115, 0], "analyzer": [0, 0.155, 0], "conoscope": [-0.065, 0.03, 0]}


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--params", type=Path, default=SOURCE / "parameters.json")
    parser.add_argument("--skip-renders", action="store_true")
    parser.add_argument("--render-existing", action="store_true", help="Render the saved verified master without rebuilding or changing the GLB")
    parser.add_argument("--resolution", type=int)
    parser.add_argument("--samples", type=int)
    parser.add_argument("--device", choices=["AUTO", "METAL", "CPU"], default=None)
    parser.add_argument("--view", choices=["01-front", "02-side", "03-top", "04-three-quarter", "05-analyzer-close", "06-stage-close"], help="Render one inspection view; omit for the complete six-view acceptance set")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def native(p):
    return Vector((p[0], -p[2], p[1]))


def delivery(p):
    return [float(p[0]), float(p[2]), float(-p[1])]


def round_vec(p):
    return [round(float(v), 7) for v in p]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def json_write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def set_input(node, key, value):
    if key in node.inputs:
        node.inputs[key].default_value = value


def make_material(name, color, roughness=.3, metal=0, transmission=0, ior=1.5, emission=0, micro=False, coat=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    set_input(bsdf, "Base Color", (*color, 1))
    set_input(bsdf, "Roughness", roughness)
    set_input(bsdf, "Metallic", metal)
    set_input(bsdf, "Transmission Weight", transmission)
    set_input(bsdf, "IOR", ior)
    set_input(bsdf, "Coat Weight", coat)
    set_input(bsdf, "Coat Roughness", .22)
    if emission:
        set_input(bsdf, "Emission Color", (*color, 1))
        set_input(bsdf, "Emission Strength", emission)
    if micro:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.name = "Cycles only micro finish"
        noise.inputs["Scale"].default_value = 2400
        noise.inputs["Detail"].default_value = 2
        coord = nodes.new("ShaderNodeTexCoord")
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = .14
        bump.inputs["Distance"].default_value = .00008
        mat.node_tree.links.new(coord.outputs["Object"], noise.inputs["Vector"])
        mat.node_tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        mat.node_tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def material_sets():
    definitions = {
        "paint": dict(color=(.79, .79, .755), roughness=.3, coat=.14),
        "frame_graphite": dict(color=(.035, .045, .050), roughness=.32, metal=.6),
        "brushed_metal": dict(color=(.23, .27, .29), roughness=.3, metal=.9),
        "black_metal": dict(color=(.013, .017, .019), roughness=.29, metal=.7),
        "black_satin": dict(color=(.021, .025, .027), roughness=.34, metal=.4),
        "rubber": dict(color=(.018, .021, .022), roughness=.72),
        "silver": dict(color=(.57, .62, .64), roughness=.24, metal=.94),
        "optic": dict(color=(.34, .39, .32), roughness=.065, transmission=.78, ior=1.49),
        "clear_glass": dict(color=(.95, .99, 1), roughness=.035, transmission=1, ior=1.52),
        "light_emitter": dict(color=(1, .59, .22), roughness=.48, emission=1.8),
        "front_window_light": dict(color=(1, .47, .12), roughness=.2, transmission=.15, emission=.35),
        "teaching_mark": dict(color=(.19, .48, .29), roughness=.45),
        "sample": dict(color=(.27, .14, .52), roughness=.075, transmission=.85, ior=1.62),
    }
    result = {"WEB": {}, "CYCLES": {}}
    for kind in result:
        for key, kwargs in definitions.items():
            settings = dict(kwargs)
            if kind == "CYCLES" and key == "light_emitter":
                settings["emission"] = 8
            result[kind][key] = make_material(f"{kind}_{key}", **settings, micro=kind == "CYCLES" and key in ("paint", "black_satin", "rubber"))
            result[kind][key].use_fake_user = True
    return result


class Instrument:
    def __init__(self, params):
        self.p = params
        self.materials = material_sets()
        self.parts = {}
        self.meshes = []
        self.holes = []
        self.root = bpy.data.objects.new("Polariscope", None)
        bpy.context.collection.objects.link(self.root)
        self.root["assetId"] = params["assetId"]
        self.root["version"] = params["version"]
        self.root["units"] = "meter"
        self.root["provisional"] = params["provisional"]
        self.root["designStatus"] = params["designStatus"]
        self.root["dimensionBasis"] = params["dimensionBasis"]
        self.root["physicalInstrumentVerified"] = False
        self.root["manufacturingValidated"] = False
        self.root["dimensionsCalibrated"] = False
        self.root["gemstoneOpticsSimulated"] = False
        self.root["sourceNote"] = params["source"]["note"]
        self.root["webCoordinates"] = "Y up; +Y optical axis; +Z front"

    def part(self, pid, pivot):
        obj = bpy.data.objects.new(f"Polariscope_{pid}", None)
        bpy.context.collection.objects.link(obj)
        obj.parent = self.root
        obj.location = native(pivot)
        obj.empty_display_type = "PLAIN_AXES"
        obj.empty_display_size = .014
        obj["partId"] = pid
        obj["provisional"] = self.p["provisional"]
        obj["sourceStatus"] = self.p["status"]
        obj["dimensionsCalibrated"] = False
        obj["label"] = LABELS[pid]
        self.parts[pid] = obj
        return obj

    def adopt(self, obj, pid, mat):
        bpy.context.view_layer.update()
        world = obj.matrix_world.copy()
        obj.parent = self.parts[pid]
        obj.matrix_world = world
        obj["partId"] = pid
        obj["materialRole"] = mat
        obj["provisional"] = self.p["provisional"]
        obj["sourceStatus"] = self.p["status"]
        obj.data.materials.append(self.materials["CYCLES"][mat])
        self.meshes.append(obj)
        return obj

    def bevel(self, obj, width, segments=5):
        modifier = obj.modifiers.new("Editable edge radius", "BEVEL")
        modifier.width = width
        modifier.segments = segments
        modifier.limit_method = "ANGLE"
        modifier.angle_limit = .45
        modifier.harden_normals = True
        normal = obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
        normal.keep_sharp = True
        normal.weight = 50

    def cube(self, name, pid, center, dims, mat, bevel=.001):
        bpy.ops.mesh.primitive_cube_add(size=1, location=native(center))
        obj = bpy.context.object
        obj.name = name
        obj.dimensions = (dims[0], dims[2], dims[1])
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        # Smooth bevel arcs; weighted normals keep the large housing planes planar.
        for face in obj.data.polygons:
            face.use_smooth = True
        if bevel:
            self.bevel(obj, bevel)
        return self.adopt(obj, pid, mat)

    def cylinder(self, name, pid, center, radius, depth, mat, axis=(0, 1, 0), bevel=.0005, vertices=96):
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=native(center))
        obj = bpy.context.object
        obj.name = name
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(native(axis).normalized())
        for face in obj.data.polygons:
            face.use_smooth = len(face.vertices) == 4
        if bevel:
            self.bevel(obj, bevel)
        return self.adopt(obj, pid, mat)

    def ring(self, name, pid, center, profile, mat, axis=(0, 1, 0), segments=128, bevel=.00015):
        """Lathe a closed radial/axial profile, leaving the centre physically open."""
        axis_native = native(axis).normalized()
        rotate = Vector((0, 0, 1)).rotation_difference(axis_native)
        vertices = []
        for radius, height in profile:
            for i in range(segments):
                theta = 2 * math.pi * i / segments
                vertices.append(tuple(rotate @ Vector((radius * math.cos(theta), radius * math.sin(theta), height))))
        faces = []
        n = len(profile)
        for j in range(n):
            for i in range(segments):
                faces.append((j * segments + i, j * segments + (i + 1) % segments, ((j + 1) % n) * segments + (i + 1) % segments, ((j + 1) % n) * segments + i))
        mesh = bpy.data.meshes.new(f"{name}_mesh")
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.location = native(center)
        # Profile polygon is oriented counterclockwise in (radius,height): faces outward.
        for j in range(n):
            smooth = abs(profile[j][1] - profile[(j + 1) % n][1]) > .00001
            for i in range(segments):
                mesh.polygons[j * segments + i].use_smooth = smooth
        if bevel:
            self.bevel(obj, bevel, 2)
        obj["throughHole"] = True
        obj["clearRadius"] = min(point[0] for point in profile)
        self.holes.append(obj)
        return self.adopt(obj, pid, mat)

    def torus(self, name, pid, center, radius, tube, mat, axis=(0, 1, 0)):
        bpy.ops.mesh.primitive_torus_add(major_segments=96, minor_segments=12, location=native(center), major_radius=radius, minor_radius=tube)
        obj = bpy.context.object
        obj.name = name
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(native(axis).normalized())
        for poly in obj.data.polygons:
            poly.use_smooth = True
        return self.adopt(obj, pid, mat)

    def outline_plate(self, name, pid, outline, height, thickness, mat, hole_radius=None):
        count = len(outline)
        vertices = [tuple(native((x, height + dy, z))) for dy in (-thickness / 2, thickness / 2) for x, z in outline]
        # Web X/Z polygon maps to Blender X/-Y, so reverse the conventional cap winding.
        faces = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
        faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
        mesh = bpy.data.meshes.new(name + "_mesh")
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        self.adopt(obj, pid, mat)
        if hole_radius:
            bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=hole_radius, depth=.045, location=native((0, height, 0)))
            cutter = bpy.context.object
            cutter.name = "Temporary aperture cutter"
            modifier = obj.modifiers.new("Actual optical aperture", "BOOLEAN")
            modifier.operation = "DIFFERENCE"
            modifier.solver = "EXACT"
            modifier.object = cutter
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            bpy.data.objects.remove(cutter, do_unlink=True)
            obj["throughHole"] = True
            obj["clearRadius"] = hole_radius
            self.holes.append(obj)
        self.bevel(obj, .00085)
        return obj

    def knurls(self, pid, center, radius, height, count):
        # A single native mesh with real fluted ribs, not a painted normal-map illusion.
        verts, faces = [], []
        for i in range(count):
            theta = i * math.tau / count
            ct, st = math.cos(theta), math.sin(theta)
            start = len(verts)
            for y in (-height / 2, height / 2):
                for radial, tangent in ((-.00028, -.00052), (.00032, -.00052), (.00032, .00052), (-.00028, .00052)):
                    p = (center[0] + (radius + radial) * ct - tangent * st, center[1] + y, center[2] + (radius + radial) * st + tangent * ct)
                    verts.append(tuple(native(p)))
            faces += [tuple(start + j for j in f) for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7))]
        mesh = bpy.data.meshes.new(pid + "_grip_flutes_mesh")
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(pid + "_grip_flutes", mesh)
        bpy.context.collection.objects.link(obj)
        self.bevel(obj, .00012, 2)
        return self.adopt(obj, pid, "black_satin")

    def bent_frame(self, top, frame):
        """Closed, editable continuous folded sheet plus round-nose aperture shelf.

        The smooth quarter bend and nominal thickness are approximations of the visible
        project silhouette; hidden fasteners and manufacturer construction are not inferred.
        """
        width, thickness = frame["width"], frame["thickness"]
        rear, upper, radius = frame["rearZ"], frame["upperHeight"], frame["bendRadius"]
        # Side-section centreline and normal, in delivery (Y,Z), from foot to shelf.
        path = [(top - .002, rear, 0, 1)]
        for i in range(33):
            angle = math.pi * .5 * i / 32
            path.append((upper - radius + radius * math.sin(angle), rear + radius * (1 - math.cos(angle)), -math.sin(angle), math.cos(angle)))
        outline = [(y + ny * thickness / 2, z + nz * thickness / 2) for y, z, ny, nz in path]
        outline += [(y - ny * thickness / 2, z - nz * thickness / 2) for y, z, ny, nz in reversed(path)]
        count = len(outline)
        verts = [tuple(native((x, y, z))) for x in (-width / 2, width / 2) for y, z in outline]
        faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
        faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
        mesh = bpy.data.meshes.new("continuous_folded_support_mesh")
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        # Establish normals before the union; the final global pass also checks the result.
        edit = bmesh.new()
        edit.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(edit, faces=list(edit.faces))
        edit.to_mesh(mesh)
        edit.free()
        bend = bpy.data.objects.new("frame_continuous_bent_sheet", mesh)
        bpy.context.collection.objects.link(bend)
        self.adopt(bend, "frame", "paint")
        shelf_outline = [(-width / 2, rear + radius), (width / 2, rear + radius)]
        shelf_outline += [(frame["noseRadius"] * math.cos(math.pi * i / 64), frame["noseRadius"] * math.sin(math.pi * i / 64)) for i in range(65)]
        shelf = self.outline_plate("frame_round_nose_open_shelf", "frame", shelf_outline, upper, thickness, "paint", frame["apertureRadius"])
        # Stitch equal boundary loops. A boolean union of coplanar thin faces can leave
        # duplicate edges; joining the explicit boundary preserves a clean sheet solid.
        for modifier in list(shelf.modifiers):
            shelf.modifiers.remove(modifier)
        edit = bmesh.new()
        edit.from_mesh(shelf.data)
        edit.from_mesh(bend.data)
        join_z = rear + radius
        seam_caps = [face for face in edit.faces if all(abs(-vertex.co.y - join_z) < 1e-7 for vertex in face.verts)]
        assert len(seam_caps) == 2, "Unexpected folded support joining boundary"
        bmesh.ops.delete(edit, geom=seam_caps, context="FACES_ONLY")
        bmesh.ops.remove_doubles(edit, verts=list(edit.verts), dist=.0000001)
        bmesh.ops.recalc_face_normals(edit, faces=list(edit.faces))
        edit.to_mesh(shelf.data)
        edit.free()
        shelf.data.update()
        self.meshes.remove(bend)
        bpy.data.objects.remove(bend, do_unlink=True)
        shelf.name = "frame_continuous_folded_open_support"
        for polygon in shelf.data.polygons:
            polygon.use_smooth = True
        self.bevel(shelf, .00065, 4)
        shelf["sourceStatus"] = "project-image-silhouette-with-provisional-bend-radius"

    def build(self):
        p, b, f, low, a, c, sample = self.p, self.p["base"], self.p["frame"], self.p["lowerAssembly"], self.p["analyzer"], self.p["conoscope"], self.p["sample"]
        top = b["footHeight"] + b["bodyHeight"]
        pivots = {"base": (0, 0, 0), "frame": (0, (top + f["upperHeight"]) / 2, f["rearZ"]), "light": (0, low["lightHeight"], 0), "polarizer": (0, low["polarizerHeight"], 0), "stage": (0, low["stagePivotHeight"], 0), "sample": sample["center"], "analyzer": (0, a["pivotHeight"], 0), "conoscope": c["center"]}
        for pid in PART_ORDER:
            self.part(pid, pivots[pid])
        self.cube("base_powder_coated_shell", "base", (0, b["footHeight"] + b["bodyHeight"] / 2, b["centerZ"]), (b["width"], b["bodyHeight"], b["depth"]), "paint", b["cornerRadius"])
        inset = b.get("footInset", .024)
        for x in (-b["width"] / 2 + inset, b["width"] / 2 - inset):
            for z in (b["centerZ"] - b["depth"] / 2 + inset, b["centerZ"] + b["depth"] / 2 - inset):
                self.cylinder(f"rubber_foot_{x:.3f}_{z:.3f}", "base", (x, b["footHeight"] / 2, z), b["footRadius"], b["footHeight"], "rubber", bevel=.0025, vertices=64)
        # The project illustration shows this visible oval amber window. Its exact
        # function conflicts with other project records, so it is not a power button.
        front = b["centerZ"] + b["depth"] / 2
        control_y = b["footHeight"] + b["bodyHeight"] / 2
        window_x = .043
        bezel = self.cylinder("front_oval_window_bezel", "base", (window_x, control_y, front + .0012), .024, .0028, "black_satin", axis=(0, 0, 1), bevel=.0008)
        bezel.scale.x = .78
        bezel["functionalIdentity"] = "visible-reference-appearance-only-not-a-confirmed-power-switch"
        self.cube("front_amber_light_window", "light", (window_x, control_y, front + .0031), (.0105, .029, .002), "front_window_light", .0025)
        for dx in (-.014, .014):
            self.cylinder("front_window_visible_screw", "base", (window_x + dx, control_y, front + .003), .0023, .0012, "silver", axis=(0, 0, 1), bevel=.00025, vertices=48)
            self.cube("front_window_screw_slot", "base", (window_x + dx, control_y, front + .0037), (.0025, .00055, .0003), "black_metal", .0001)

        self.bent_frame(top, f)

        # Lower light, polarizing sheet and specimen support remain separate teachable parts.
        self.ring("light_housing_open", "light", (0, top + .003, 0), [(.047, -.003), (.0578, -.003), (.06, -.001), (.06, .0035), (.058, .005), (.0488, .005), (.047, .002)], "black_metal")
        self.cylinder("light_emitter_diffuser", "light", (0, low["lightHeight"], 0), .0472, .002, "light_emitter", bevel=.0004)
        self.ring("polarizer_retaining_ring_open", "polarizer", (0, low["polarizerHeight"], 0), [(.0469, -.0025), (.0535, -.0025), (.0545, -.001), (.0545, .0018), (.0525, .003), (.0469, .003)], "black_metal")
        self.cylinder("polarizer_optical_sheet", "polarizer", (0, low["polarizerHeight"] + .0001, 0), .0475, .0012, "optic", bevel=.00012)
        stage_profile = [(low["clearRadius"], -.0095), (.0565, -.0095), (low["outerRadius"], -.0028), (low["outerRadius"], .0065), (.0595, .009), (.0545, .009), (.0535, .0077), (.051, .0077), (.050, .005), (low["clearRadius"], .005)]
        self.ring("stage_open_stepped_ring", "stage", (0, low["stagePivotHeight"], 0), stage_profile, "black_metal")
        self.knurls("stage", (0, low["stagePivotHeight"] + .001, 0), low["outerRadius"], .0082, low["knurlCount"])
        self.torus("stage_inner_edge", "stage", (0, low["topHeight"] - .001, 0), .0526, .00045, "black_satin")
        # A clear placement surface is an explicit teaching approximation of the load area.
        self.cylinder("stage_clear_teaching_support", "stage", (0, low["topHeight"] - .0018, 0), low["clearRadius"] - .0004, .001, "clear_glass", bevel=.00012)
        bpy.context.object["sourceStatus"] = "original-transparent-specimen-support"

        analyzer_profile = [(a["clearRadius"], -.006), (.058, -.006), (a["outerRadius"], -.0042), (a["outerRadius"], .0064), (.0598, .0085), (.0512, .0085), (.0492, .0068), (a["clearRadius"], .0058)]
        self.ring("analyzer_open_stepped_ring", "analyzer", (0, a["pivotHeight"], 0), analyzer_profile, "black_metal")
        self.knurls("analyzer", (0, a["pivotHeight"] - .0002, 0), a["outerRadius"], .0087, a["knurlCount"])
        self.cylinder("analyzer_optical_sheet", "analyzer", (0, a["pivotHeight"] - .002, 0), a["clearRadius"] + .0003, .0012, "optic", bevel=.00012)
        self.torus("analyzer_inner_retaining_lip", "analyzer", (0, a["pivotHeight"] + .0048, 0), a["clearRadius"] + .0007, .00065, "black_satin")
        if p["teachingMarkers"]["enabled"]:
            for pid, height, radius in (("analyzer", a["pivotHeight"] + .0088, .0551), ("polarizer", low["polarizerHeight"] + .0032, .05)):
                mark = self.cube(pid + "_teaching_axis_mark", pid, (0, height, radius), (.0015, .0003, .0041), "teaching_mark", .00012)
                mark["sourceStatus"] = "pedagogical-addition"

        # Stored hand-held conoscope: appearance only, no claimed optical prescription.
        cx, cy, cz = c["center"]
        self.cylinder("conoscope_storage_socket", "conoscope", (cx, top + .0027, cz), .010, .0054, "silver", bevel=.0007)
        self.cylinder("conoscope_storage_collar", "conoscope", (cx, top + .009, cz), .0058, .014, "silver", bevel=.0006)
        handle_bottom, handle_top = top + .01, cy - c["outerRadius"] + .002
        self.cylinder("conoscope_handle", "conoscope", (cx, (handle_bottom + handle_top) / 2, cz), c["handleRadius"], handle_top - handle_bottom, "black_satin", bevel=.0005, vertices=64)
        self.ring("conoscope_lens_ring_open", "conoscope", c["center"], [(c["lensRadius"] + .0002, -.0038), (c["outerRadius"] - .0013, -.0038), (c["outerRadius"], -.0024), (c["outerRadius"], .0024), (c["outerRadius"] - .0013, .0038), (c["lensRadius"] + .0002, .0038)], "black_metal", axis=(0, 0, 1), segments=96, bevel=.0002)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=c["lensRadius"], location=native(c["center"]))
        sphere = bpy.context.object
        sphere.name = "conoscope_clear_teaching_sphere"
        sphere.scale = (1, 1, 1)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        for face in sphere.data.polygons:
            face.use_smooth = True
        self.adopt(sphere, "conoscope", "clear_glass")
        sphere["sourceStatus"] = "generic-sphere-without-optical-prescription"

        self.build_sample(sample)
        bpy.context.view_layer.update()
        # Recalculate all mesh normals; cap/profile winding must survive both material sets.
        bpy.ops.object.select_all(action="DESELECT")
        for obj in self.meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = self.meshes[0]
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.select_all(action="DESELECT")

    def build_sample(self, sample):
        # Closed faceted mesh with a flat table, deliberately unidentified.
        r, h, center = sample["radius"], sample["height"], sample["center"]
        rings = [(0, -.42 * h), (r, -.07 * h), (r, .02 * h), (.55 * r, .46 * h)]
        n, verts = 12, []
        for radius, y in rings:
            for i in range(n):
                theta = math.tau * i / n
                verts.append(tuple(native((center[0] + radius * math.cos(theta), center[1] + y, center[2] + radius * math.sin(theta)))))
        faces = []
        for j in range(3):
            for i in range(n):
                k = (i + 1) % n
                if j == 0:
                    faces.append((i, n + k, n + i))
                else:
                    faces.append((j * n + i, j * n + k, (j + 1) * n + k, (j + 1) * n + i))
        faces.append(tuple(range(3 * n, 4 * n)))
        mesh = bpy.data.meshes.new("unidentified_sample_facets_mesh")
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        # Weld the repeated tip into one vertex so the solid remains manifold.
        edit = bmesh.new()
        edit.from_mesh(mesh)
        bmesh.ops.remove_doubles(edit, verts=list(edit.verts), dist=.0000001)
        edit.to_mesh(mesh)
        edit.free()
        obj = bpy.data.objects.new("sample_unidentified_faceted_teaching_object", mesh)
        bpy.context.collection.objects.link(obj)
        self.adopt(obj, "sample", "sample")
        obj["sourceStatus"] = "pedagogical-addition"
        obj["opticalResponseSimulated"] = False
        obj.hide_render = not sample["visibleInRenders"]

    def switch_materials(self, kind):
        for obj in self.meshes:
            obj.data.materials[0] = self.materials[kind][obj["materialRole"]]

    def bounds(self):
        graph = bpy.context.evaluated_depsgraph_get()
        coords = [delivery(obj.matrix_world @ Vector(corner)) for original in self.meshes for obj in [original.evaluated_get(graph)] for corner in obj.bound_box]
        return {"min": round_vec([min(c[i] for c in coords) for i in range(3)]), "max": round_vec([max(c[i] for c in coords) for i in range(3)])}


def aim(obj, target):
    obj.rotation_euler = (native(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def studio(params, args):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = args.samples or params["render"]["samples"]
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = params["render"]["adaptiveThreshold"]
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 12
    scene.cycles.transmission_bounces = 10
    scene.cycles.transparent_max_bounces = 12
    scene.render.resolution_x = scene.render.resolution_y = args.resolution or params["render"]["resolution"]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = params["render"]["transparent"]
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get("Background").inputs[0].default_value = (.18, .22, .24, 1)
    scene.world.node_tree.nodes.get("Background").inputs[1].default_value = .35
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -1.1
    requested = args.device or params["render"]["device"]
    device_info = {"requested": requested, "selected": "CPU", "devices": []}
    if requested != "CPU":
        try:
            pref = bpy.context.preferences.addons["cycles"].preferences
            pref.compute_device_type = "METAL"
            pref.get_devices()
            for device in pref.devices:
                device.use = device.type == "METAL"
                device_info["devices"].append({"name": device.name, "type": device.type, "enabled": device.use})
            if any(device.type == "METAL" for device in pref.devices):
                scene.cycles.device = "GPU"
                device_info["selected"] = "METAL"
            elif requested == "METAL":
                raise RuntimeError("Metal requested but no Metal device available")
        except Exception as error:
            if requested == "METAL":
                raise
            device_info["fallbackReason"] = str(error)
    if device_info["selected"] == "CPU":
        scene.cycles.device = "CPU"
    # Session-only device preferences: never call save_userpref.
    bpy.ops.mesh.primitive_plane_add(size=200, location=native((0, -.0004, 0)))
    ground = bpy.context.object
    ground.name = "STUDIO_ground_not_exported"
    ground.data.materials.append(make_material("STUDIO_slate", (.027, .042, .047), roughness=.52))
    for name, pos, power, size, color in [
        ("key", (-.34, .54, .38), 12, .40, (1, .94, .86)),
        ("fill", (.36, .35, .20), 5, .32, (.80, .88, 1)),
        ("rim", (.15, .42, -.35), 18, .28, (.87, .95, 1)),
    ]:
        data = bpy.data.lights.new("STUDIO_" + name, "AREA")
        data.energy, data.shape, data.size, data.color = power, "DISK", size, color
        light = bpy.data.objects.new("STUDIO_" + name, data)
        bpy.context.collection.objects.link(light)
        light.location = native(pos)
        aim(light, (0, .115, 0))
    camera_data = bpy.data.cameras.new("STUDIO_camera")
    camera = bpy.data.objects.new("STUDIO_camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.lens = 70
    camera_data.clip_start = .001
    camera_data.clip_end = 250
    scene.camera = camera
    return camera, device_info


VIEWS = [
    # Longer orthographic camera distances keep all primary rays above the floor.
    ("01-front", (0, .231, 2.92), (0, .126, -.005), .32),
    ("02-side", (2.9, .241, .048), (0, .126, -.012), .32),
    ("03-top", (0, .65, -.0189), (0, .10, -.019), .30),
    ("04-three-quarter", (-.38, .316, .47), (0, .127, -.013), .345),
    ("05-analyzer-close", (.18, .358, .23), (0, .241, -.006), .187),
    ("06-stage-close", (.17, .248, .24), (-.008, .10, -.002), .193),
]


def configure_view(camera, view):
    _, pos, target, scale = view
    camera.location = native(pos)
    aim(camera, target)
    camera.data.ortho_scale = scale


def export_glb(instrument):
    instrument.switch_materials("WEB")
    bpy.ops.object.select_all(action="DESELECT")
    instrument.root.select_set(True)
    for obj in list(instrument.parts.values()) + instrument.meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = instrument.root
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / "polariscope.glb"), export_format="GLB", use_selection=True, export_extras=True, export_yup=True, export_apply=True, export_materials="EXPORT", export_cameras=False, export_lights=False, export_animations=False, export_texcoords=True, export_normals=True, export_tangents=False)
    instrument.switch_materials("CYCLES")
    bpy.ops.object.select_all(action="DESELECT")


def read_glb(path):
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", raw, 0)
    assert magic == b"glTF" and version == 2 and length == len(raw), "Invalid GLB container"
    size, kind = struct.unpack_from("<II", raw, 12)
    assert kind == 0x4E4F534A, "Missing GLB JSON chunk"
    return json.loads(raw[20:20 + size].decode("utf-8"))


def validate(instrument, bounds):
    glb = OUTPUT / "polariscope.glb"
    doc = read_glb(glb)
    nodes = doc.get("nodes", [])
    report = {"status": "pending", "createdAt": datetime.now(timezone.utc).isoformat(), "blenderVersion": bpy.app.version_string, "assetVersion": instrument.p["version"], "provisional": instrument.p["provisional"], "dimensionBasis": instrument.p["dimensionBasis"], "physicalInstrumentVerified": False, "manufacturingValidated": False, "dimensionsCalibrated": False, "file": str(glb.relative_to(PROJECT)), "sha256": sha256(glb), "byteLength": glb.stat().st_size, "checks": {}, "bounds": bounds, "meshCount": len(doc.get("meshes", [])), "triangleCount": sum(doc["accessors"][p["indices"]]["count"] // 3 for m in doc.get("meshes", []) for p in m["primitives"] if "indices" in p), "extensionsUsed": doc.get("extensionsUsed", [])}
    checks = report["checks"]
    parts = []
    for pid in PART_ORDER:
        match = [n for n in nodes if n.get("name") == f"Polariscope_{pid}"]
        assert len(match) == 1, f"Missing or duplicate part group {pid}"
        node = match[0]
        assert node.get("extras", {}).get("partId") == pid
        assert all(abs(v - e) < 1e-5 for v, e in zip(node.get("rotation", [0, 0, 0, 1]), [0, 0, 0, 1])), f"Nonidentity local axes for {pid}"
        assert all(abs(v - 1) < 1e-5 for v in node.get("scale", [1, 1, 1]))
        expected = delivery(instrument.parts[pid].matrix_world.translation)
        actual = node.get("translation", [0, 0, 0])
        assert max(abs(a - b) for a, b in zip(actual, expected)) < 1e-5, f"Bad axis conversion for {pid}: {actual} vs {expected}"
        parts.append({"id": pid, "translation": round_vec(actual), "localRotation": node.get("rotation", [0, 0, 0, 1]), "children": len(node.get("children", []))})
    checks["eightPartGroupsAndIds"] = True
    checks["yUpLocalAxesAndMeterTransforms"] = True
    mesh_nodes = [node for node in nodes if "mesh" in node]
    assert all(node.get("extras", {}).get("partId") in PART_ORDER for node in mesh_nodes)
    checks["allMeshNodesHavePartId"] = True
    assert all(mat["name"].startswith("WEB_") for mat in doc.get("materials", []))
    checks["webMaterialsOnly"] = True
    assert all(not n.get("name", "").startswith("STUDIO_") for n in nodes)
    checks["studioExcluded"] = True
    solid_results = []
    for obj in instrument.meshes:
        edit = bmesh.new()
        edit.from_mesh(obj.data)
        invalid = sum(not edge.is_manifold for edge in edit.edges)
        edit.free()
        assert invalid == 0, f"Nonmanifold source mesh {obj.name}: {invalid} edges"
        solid_results.append(obj.name)
    checks["sourceMeshesClosedManifold"] = solid_results
    support_top = instrument.p["lowerAssembly"]["topHeight"] - .0018 + .0005
    sample_tip = instrument.p["sample"]["center"][1] - .42 * instrument.p["sample"]["height"]
    assert abs(sample_tip - support_top) < .00001, "Teaching sample must rest on its support surface"
    checks["sampleSupportContactDeltaMeters"] = abs(sample_tip - support_top)
    # Verify actual holes by ray-casting through the axis of the evaluated geometry.
    graph = bpy.context.evaluated_depsgraph_get()
    hole_results = []
    for obj in instrument.holes:
        evaluated = obj.evaluated_get(graph)
        if obj["partId"] == "conoscope":
            center = native(instrument.p["conoscope"]["center"])
            ray = native((0, 0, 1)).normalized()
        else:
            center = Vector((0, 0, obj.matrix_world.translation.z))
            ray = Vector((0, 0, 1))
        inv = evaluated.matrix_world.inverted()
        origin = inv @ (center - ray * .03)
        direction = (inv.to_3x3() @ ray).normalized()
        hit, *_ = evaluated.ray_cast(origin, direction, distance=.06)
        assert not hit, f"Blocked central hole in {obj.name}"
        hole_results.append(obj.name)
    checks["physicalOpeningsRaycast"] = hole_results
    # Test a usable central bore across the entire support, not only each ring hole.
    bore_probes = [(0, 0), (.042, 0), (-.042, 0), (0, .042), (0, -.042), (.03, .03), (.03, -.03), (-.03, .03), (-.03, -.03)]
    for obj in (mesh for mesh in instrument.meshes if mesh["partId"] == "frame"):
        evaluated = obj.evaluated_get(graph)
        inv = evaluated.matrix_world.inverted()
        ray = (inv.to_3x3() @ native((0, 1, 0))).normalized()
        for x, z in bore_probes:
            hit, *_ = evaluated.ray_cast(inv @ native((x, .045, z)), ray, distance=.21)
            assert not hit, f"Frame obstructs the optical bore: {obj.name} at {x}, {z}"
    checks["frameOpticalBoreClearAtNineProbes"] = True
    # Import into a separate scene so the editable master remains untouched.
    master_scene = bpy.context.scene
    imported_scene = bpy.data.scenes.new("GLB_roundtrip_validation")
    bpy.context.window.scene = imported_scene
    bpy.ops.import_scene.gltf(filepath=str(glb))
    imported = list(imported_scene.objects)
    imported_parts = {obj.get("partId") for obj in imported if obj.type == "EMPTY" and obj.name.split(".")[0].startswith("Polariscope_")}
    assert imported_parts == set(PART_ORDER), f"Roundtrip part IDs: {imported_parts}"
    imported_meshes = [obj for obj in imported if obj.type == "MESH"]
    assert len(imported_meshes) == len(mesh_nodes), "Roundtrip mesh count mismatch"
    bpy.context.view_layer.update()
    coords = [delivery(obj.matrix_world @ Vector(c)) for obj in imported_meshes for c in obj.bound_box]
    imported_bounds = {"min": [min(c[i] for c in coords) for i in range(3)], "max": [max(c[i] for c in coords) for i in range(3)]}
    delta = max(abs(imported_bounds[side][i] - bounds[side][i]) for side in ("min", "max") for i in range(3))
    assert delta < .0001, f"Roundtrip bounds drift: {delta}"
    checks["roundtripImported"] = True
    checks["roundtripBoundsMaxDeltaMeters"] = delta
    report["partNodes"] = parts
    bpy.context.window.scene = master_scene
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(imported_scene)
    report["status"] = "passed"
    return report


def manifest(instrument, report, params_path):
    p = instrument.p
    result = {
        "id": p["assetId"], "version": p["version"], "format": "glTF 2.0 binary", "file": "polariscope.glb", "units": "meter", "provisional": p["provisional"], "status": p["status"], "designStatus": p["designStatus"], "dimensionBasis": p["dimensionBasis"], "geometryType": "Blender-native project-reference teaching model", "dimensionsCalibrated": False, "physicalInstrumentVerified": False, "manufacturingValidated": False, "gemstoneOpticsSimulated": False,
        "generator": "Blender " + bpy.app.version_string, "byteLength": report["byteLength"], "sha256": report["sha256"], "meshes": report["meshCount"], "triangles": report["triangleCount"], "animations": [],
        "coordinateSystem": {"handedness": "right", "up": "+Y", "front": "+Z", "units": "meter"}, "opticalAxis": {"origin": [0, 0, 0], "direction": [0, 1, 0]}, "bounds": report["bounds"], "cameraTarget": [0, .127, -.013],
        "source": {**p["source"], "physicalInstrumentVerified": False, "dimensions": "Provisional dimensions from visual modeling; no measured manufacturer dimensions or physical calibration claimed", "master": "assets-source/polariscope/polariscope-master.blend", "parameters": "assets-source/polariscope/parameters.json", "generator": "tools/3d-assets/blender/build_polariscope.py"},
        "materials": {"web": "WEB_*: glTF metallic-roughness, transmission and IOR", "offline": "CYCLES_*: same geometry, additional microfinish and path-traced studio lighting", "opticalCalibration": False},
        "parts": [], "renders": [{"id": name, "file": f"renders/{name}.png", "cameraPosition": list(pos), "target": list(target), "orthographicScale": scale} for name, pos, target, scale in VIEWS],
        "scope": "Project-reference teaching interpretation. External image provenance is unverified. Not a calibrated digital twin, manufacturing drawing, physical disassembly instruction, gemstone optical simulation or diagnostic result.", "layoutAssumptions": p["evidence"]["layoutAssumptions"], "knownUnknowns": p["evidence"]["knownUnknowns"], "validation": {"status": report["status"], "report": "assets-source/polariscope/validation.json", "roundtripImported": True}
    }
    for pid in PART_ORDER:
        pivot = round_vec(delivery(instrument.parts[pid].matrix_world.translation))
        b, f, low, a, c = p["base"], p["frame"], p["lowerAssembly"], p["analyzer"], p["conoscope"]
        hotspot = {"base": [.068, b["footHeight"] + b["bodyHeight"] / 2, b["centerZ"] + b["depth"] / 2 + .003], "frame": [-f["width"] / 2 + .02, (b["footHeight"] + b["bodyHeight"] + f["upperHeight"]) / 2, f["rearZ"] + f["thickness"] / 2], "light": [0, low["lightHeight"], .043], "polarizer": [0, low["polarizerHeight"] + .003, .05], "stage": [.055, low["stagePivotHeight"] + .005, .018], "sample": [0, p["sample"]["center"][1] + .004, 0], "analyzer": [.052, a["pivotHeight"] + .007, .026], "conoscope": [c["center"][0], c["center"][1], c["center"][2] + c["lensRadius"]]}[pid]
        result["parts"].append({"id": pid, "label": LABELS[pid], "node": f"Polariscope_{pid}", "pivot": pivot, "pivotSpace": "world", "rotationAxis": [0, 1, 0], "rotationAxisLocal": [0, 1, 0], "rotatable": pid in ("analyzer", "stage", "sample"), "rotationStatus": "designed-teaching-operation" if pid in ("analyzer", "stage", "sample") else "not-a-rotating-control", "explodeOffset": EXPLODE[pid], "explodeSpace": "world", "hotspot": round_vec(hotspot), "hotspotSpace": "world", "source": {"status": p["status"], "dimensionBasis": p["dimensionBasis"], "measured": False}, "defaultVisible": pid != "sample"})
    return result


def render_views(args, camera, report):
    # Rerendering a saved master must not cause a second export with a different hash.
    for view in (v for v in VIEWS if args.view is None or args.view == v[0]):
        configure_view(camera, view)
        output = OUTPUT / "renders" / (view[0] + ".png")
        bpy.context.scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
        report["renders"] = [r for r in report["renders"] if r["file"] != str(output.relative_to(PROJECT))]
        report["renders"].append({"file": str(output.relative_to(PROJECT)), "sha256": sha256(output), "assetVersion": report["assetVersion"], "glbSha256": report["sha256"]})
        json_write(SOURCE / "validation.json", report)
        print("ASSET_RENDER_COMPLETE " + view[0], flush=True)
    configure_view(camera, VIEWS[3])
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "polariscope-master.blend"))


def render_existing(args, params_path):
    report = json.loads((SOURCE / "validation.json").read_text(encoding="utf-8"))
    assert report["sha256"] == sha256(OUTPUT / "polariscope.glb"), "GLB changed since validation"
    assert report["parametersSha256"] == sha256(params_path), "Parameters changed; rebuild required"
    assert report["scriptSha256"] == sha256(Path(__file__)), "Builder changed; rebuild required"
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / "polariscope-master.blend"))
    scene = bpy.context.scene
    if report["renderDevice"]["selected"] == "METAL":
        pref = bpy.context.preferences.addons["cycles"].preferences
        pref.compute_device_type = "METAL"
        pref.get_devices()
        for device in pref.devices:
            device.use = device.type == "METAL"
        scene.cycles.device = "GPU"
    if args.resolution:
        scene.render.resolution_x = scene.render.resolution_y = args.resolution
    if args.samples:
        scene.cycles.samples = args.samples
    report["renderSettings"] = {"resolution": scene.render.resolution_x, "samples": scene.cycles.samples, "denoising": True}
    render_views(args, scene.camera, report)
    assert report["sha256"] == sha256(OUTPUT / "polariscope.glb"), "Render-only operation altered GLB"
    print("ASSET_RENDER_EXISTING_COMPLETE " + report["sha256"], flush=True)


def main():
    args = arguments()
    params_path = args.params.resolve()
    if args.render_existing:
        render_existing(args, params_path)
        return
    params = json.loads(params_path.read_text(encoding="utf-8"))
    assert params["status"] == "project-reference-derived-teaching-model" and params["dimensionsCalibrated"] is False, "This builder defines a virtual teaching design, not a calibrated product"
    SOURCE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "renders").mkdir(exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Factory empty files do not always contain a World.
    if bpy.context.scene.world is None:
        bpy.context.scene.world = bpy.data.worlds.new("Studio world")
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1
    bpy.context.scene.unit_settings.length_unit = "MILLIMETERS"
    instrument = Instrument(params)
    instrument.build()
    camera, device_info = studio(params, args)
    configure_view(camera, VIEWS[3])
    bounds = instrument.bounds()
    export_glb(instrument)
    report = validate(instrument, bounds)
    report["renderDevice"] = device_info
    report["parametersSha256"] = sha256(params_path)
    report["scriptSha256"] = sha256(Path(__file__))
    report["renderSettings"] = {"resolution": bpy.context.scene.render.resolution_x, "samples": bpy.context.scene.cycles.samples, "denoising": True}
    report["renders"] = []
    json_write(OUTPUT / "manifest.json", manifest(instrument, report, params_path))
    # Keep source parameters and caveats inside the editable master for portability.
    textblock = bpy.data.texts.new("ASSET_STATUS_AND_PARAMETERS.json")
    textblock.write(json.dumps(params, ensure_ascii=False, indent=2))
    bpy.context.scene["assetStatus"] = "Project-reference teaching interpretation: provisional dimensions; external reference provenance and physical instrument unverified"
    bpy.context.scene["renderDeviceEvidence"] = json.dumps(device_info)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "polariscope-master.blend"))
    json_write(SOURCE / "validation.json", report)
    print("ASSET_EXPORT_COMPLETE " + json.dumps({"glb": str(OUTPUT / "polariscope.glb"), "validation": report["status"], "bytes": report["byteLength"], "triangles": report["triangleCount"], "renderDevice": device_info}, ensure_ascii=False), flush=True)
    if not args.skip_renders:
        render_views(args, camera, report)
    print("ASSET_BUILD_COMPLETE " + str(SOURCE / "validation.json"), flush=True)


if __name__ == "__main__":
    main()
