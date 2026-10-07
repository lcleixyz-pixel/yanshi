#!/usr/bin/env python3
"""Inspect a self-contained GLB in an independent background Blender process.

Preserves the source file and imported meshes/materials. Adds only review cameras,
lights and a neutral world; writes a separate editable .blend and render report.
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
from mathutils import Vector


VIEWS = {
    "front": (0.0, 0.0),
    "back": (180.0, 0.0),
    "left": (-90.0, 0.0),
    "right": (90.0, 0.0),
    "top": (0.0, 89.99),
    "hero": (38.0, 20.0),
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def assert_self_contained_glb(path):
    """Refuse external resource fetching before calling Blender's importer."""
    with path.open("rb") as stream:
        header = stream.read(12)
        if len(header) != 12:
            raise ValueError("Incomplete GLB header")
        magic, version, total = struct.unpack("<4sII", header)
        if magic != b"glTF" or version != 2 or total != path.stat().st_size:
            raise ValueError("Expected a complete GLB 2.0 container")
        chunk_header = stream.read(8)
        if len(chunk_header) != 8:
            raise ValueError("Missing JSON chunk")
        length, kind = struct.unpack("<II", chunk_header)
        if kind != 0x4E4F534A or length > total - 20:
            raise ValueError("Invalid first JSON chunk")
        document = json.loads(stream.read(length).decode("utf-8"))
    if not isinstance(document, dict):
        raise ValueError("GLB JSON root must be an object")
    for key in ("buffers", "images"):
        entries = document.get(key, [])
        if not isinstance(entries, list):
            raise ValueError(f"{key} must be an array")
        for entry in entries:
            if not isinstance(entry, dict):
                raise ValueError(f"{key} entries must be objects")
            uri = entry.get("uri")
            if uri is not None and (not isinstance(uri, str) or not uri.startswith("data:")):
                raise ValueError(f"External {key} URI is not allowed; use an embedded GLB")
    return {
        "asset": document.get("asset", {}),
        "extensionsUsed": document.get("extensionsUsed", []),
        "extensionsRequired": document.get("extensionsRequired", []),
        "declaredMeshes": len(document.get("meshes", [])),
        "declaredMaterials": len(document.get("materials", [])),
        "declaredImages": len(document.get("images", [])),
        "externalResourcesAllowed": False,
    }


def serializable_default(socket):
    value = getattr(socket, "default_value", None)
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    try:
        return list(value)
    except TypeError:
        return str(value)


def describe_import(objects, materials, images):
    meshes = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        meshes.append({
            "object": obj.name,
            "mesh": mesh.name,
            "parent": obj.parent.name if obj.parent else None,
            "matrixWorld": [list(row) for row in obj.matrix_world],
            "vertices": len(mesh.vertices),
            "edges": len(mesh.edges),
            "polygons": len(mesh.polygons),
            "triangles": len(mesh.loop_triangles),
            "uvLayers": [layer.name for layer in mesh.uv_layers],
            "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
            "modifiers": [{"name": m.name, "type": m.type} for m in obj.modifiers],
        })
    material_records = []
    for material in materials:
        record = {"name": material.name, "diffuseColor": list(material.diffuse_color), "useNodes": material.use_nodes}
        if material.use_nodes and material.node_tree:
            record["nodes"] = []
            for node in material.node_tree.nodes:
                item = {
                    "name": node.name, "type": node.type, "blIdname": node.bl_idname,
                    "inputs": [{"name": socket.name, "linked": socket.is_linked, "default": serializable_default(socket)} for socket in node.inputs],
                }
                if node.type == "TEX_IMAGE":
                    item.update({"image": node.image.name if node.image else None, "interpolation": node.interpolation, "extension": node.extension, "projection": node.projection})
                record["nodes"].append(item)
            record["links"] = [{"fromNode": link.from_node.name, "fromSocket": link.from_socket.name, "toNode": link.to_node.name, "toSocket": link.to_socket.name} for link in material.node_tree.links]
        material_records.append(record)
    return {
        "objects": [{"name": obj.name, "type": obj.type, "parent": obj.parent.name if obj.parent else None} for obj in objects],
        "meshes": meshes,
        "materials": material_records,
        "images": [{"name": img.name, "width": img.size[0], "height": img.size[1], "channels": img.channels, "colorSpace": img.colorspace_settings.name, "source": img.source, "packed": bool(img.packed_file or img.packed_files), "filepath": img.filepath} for img in images],
        "totals": {"objects": len(objects), "meshObjects": len(meshes), "vertices": sum(m["vertices"] for m in meshes), "triangles": sum(m["triangles"] for m in meshes), "materials": len(materials), "images": len(images)},
    }


def point_at(obj, center):
    obj.rotation_euler = (center - obj.location).to_track_quat("-Z", "Y").to_euler()


def camera_pose(center, distance, azimuth, elevation):
    a, e = math.radians(azimuth), math.radians(elevation)
    return center + distance * Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))


def add_area(collection, center, size, name, offset, power, light_size):
    data = bpy.data.lights.new("REVIEW_" + name, "AREA")
    data.energy = power * size * size
    data.shape = "DISK"
    data.size = light_size * size
    data.color = (1.0, 1.0, 1.0)
    obj = bpy.data.objects.new(data.name, data)
    collection.objects.link(obj)
    obj.location = center + Vector(offset) * size
    point_at(obj, center)


def configure_render(scene, args):
    scene.render.engine = "CYCLES"
    scene.cycles.samples = args.samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.025
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 10
    scene.cycles.transmission_bounces = 8
    scene.cycles.transparent_max_bounces = 8
    scene.render.resolution_x = scene.render.resolution_y = args.resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = args.exposure
    scene.view_settings.gamma = 1.0
    scene.cycles.device = "CPU"
    devices, reason = [], None
    try:
        preferences = bpy.context.preferences.addons["cycles"].preferences
        preferences.compute_device_type = "METAL"
        preferences.get_devices()
        for device in preferences.devices:
            device.use = device.type == "METAL"
            if device.use:
                devices.append(device.name)
        if devices:
            scene.cycles.device = "GPU"
    except (KeyError, TypeError, RuntimeError, AttributeError) as error:
        reason = str(error)
    return {"engine": "Cycles", "device": scene.cycles.device, "metalDevices": devices, "metalUnavailableReason": reason, "samples": args.samples, "adaptiveThreshold": 0.025, "denoising": True, "viewTransform": scene.view_settings.view_transform, "look": scene.view_settings.look, "exposure": args.exposure, "resolution": args.resolution}


def setup_review(scene, objects, args):
    corners = [obj.matrix_world @ Vector(corner) for obj in objects if obj.type == "MESH" for corner in obj.bound_box]
    if not corners:
        raise ValueError("Imported candidate has no mesh bounding box")
    minimum = Vector([min(c[i] for c in corners) for i in range(3)])
    maximum = Vector([max(c[i] for c in corners) for i in range(3)])
    center = (minimum + maximum) * 0.5
    size = max(maximum - minimum)
    if not math.isfinite(size) or size <= 1e-9:
        raise ValueError("Imported mesh bounds are empty or invalid")
    helper = bpy.data.collections.new("REVIEW_HELPERS")
    scene.collection.children.link(helper)
    cameras = {}
    projected_extents = []
    for name, (azimuth, elevation) in VIEWS.items():
        data = bpy.data.cameras.new("REVIEW_" + name)
        data.type = "ORTHO"
        data.clip_start = size * 0.001
        data.clip_end = size * 100
        camera = bpy.data.objects.new(data.name, data)
        helper.objects.link(camera)
        camera.location = camera_pose(center, size * 4, azimuth + args.azimuth_offset, elevation)
        point_at(camera, center)
        rotation = camera.rotation_euler.to_matrix()
        right, up = rotation @ Vector((1, 0, 0)), rotation @ Vector((0, 1, 0))
        for axis in (right, up):
            projected = [(p - center).dot(axis) for p in corners]
            projected_extents.append(max(projected) - min(projected))
        cameras[name] = camera
    # One shared scale across all six views makes apparent part size comparable.
    ortho_scale = max(projected_extents) * 1.14
    for camera in cameras.values():
        camera.data.ortho_scale = ortho_scale
    add_area(helper, center, size, "key", (-2.0, -2.4, 3.2), 450, 2.5)
    add_area(helper, center, size, "fill", (2.8, -0.6, 1.8), 240, 3.0)
    add_area(helper, center, size, "back", (0.0, 2.5, 2.7), 350, 2.2)
    world = bpy.data.worlds.new("REVIEW_NEUTRAL_WORLD")
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputWorld")
    environment = nodes.new("ShaderNodeBackground")
    environment.inputs["Color"].default_value = (0.8, 0.8, 0.8, 1)
    environment.inputs["Strength"].default_value = 0.35
    background = nodes.new("ShaderNodeBackground")
    background.inputs["Color"].default_value = (0.48, 0.48, 0.48, 1)
    background.inputs["Strength"].default_value = 1
    light_path = nodes.new("ShaderNodeLightPath")
    mix = nodes.new("ShaderNodeMixShader")
    links.new(light_path.outputs["Is Camera Ray"], mix.inputs[0])
    links.new(environment.outputs["Background"], mix.inputs[1])
    links.new(background.outputs["Background"], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs["Surface"])
    scene.world = world
    return cameras, {"minimum": list(minimum), "maximum": list(maximum), "dimensions": list(maximum - minimum), "center": list(center), "orthographicScale": ortho_scale, "azimuthOffsetDegrees": args.azimuth_offset, "coordinateSystem": "Blender Z-up after glTF import; front at offset 0 looks from -Y; left from -X. View names describe model coordinates, not verified physical instrument orientation.", "normalization": "camera framing only; imported object transforms and geometry unchanged"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--azimuth-offset", type=float, default=0.0)
    parser.add_argument("--resolution", type=int, choices=(768, 1024), default=1024)
    parser.add_argument("--samples", type=int, default=64)
    parser.add_argument("--exposure", type=float, default=0.0)
    parser.add_argument("--views", default=",".join(VIEWS), help="Comma-separated names; use hero for an orientation preview")
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = parser.parse_args(argv)
    if not bpy.app.background:
        raise RuntimeError("Run in an independent --background --factory-startup Blender process")
    if not args.input.is_absolute() or not args.output.is_absolute():
        raise ValueError("Both input and output must be absolute paths")
    source, output = args.input.resolve(strict=True), args.output.resolve()
    if not source.is_file() or source.suffix.lower() != ".glb":
        raise ValueError("Input must be a local .glb file")
    if not 1 <= args.samples <= 256:
        raise ValueError("Samples must be within 1..256")
    if not math.isfinite(args.azimuth_offset) or not math.isfinite(args.exposure):
        raise ValueError("Camera offset and exposure must be finite")
    views = args.views.split(",")
    if not views or any(name not in VIEWS for name in views) or len(views) != len(set(views)):
        raise ValueError("Use unique view names: " + ", ".join(VIEWS))
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise ValueError("Output must be new or empty; existing review files are never overwritten")
    original_hash = sha256(source)
    glb_metadata = assert_self_contained_glb(source)
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    bpy.context.view_layer.update()
    objects = list(bpy.context.scene.objects)
    materials, images = list(bpy.data.materials), list(bpy.data.images)
    imported = describe_import(objects, materials, images)
    (output / "import-description.json").write_text(json.dumps(imported, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    scene = bpy.context.scene
    render_settings = configure_render(scene, args)
    cameras, framing = setup_review(scene, objects, args)
    report = {"startedAt": utc_now(), "source": str(source), "sourceSha256": original_hash, "scriptSha256": sha256(Path(__file__)), "blenderVersion": bpy.app.version_string, "glb": glb_metadata, "importTotals": imported["totals"], "framing": framing, "render": render_settings, "materialsOverridden": False, "geometryModified": False, "interpretation": "Generated candidate review only; not calibrated physical optics or verified instrument dimensions", "views": []}
    report_path = output / "review-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for name in views:
        scene.camera = cameras[name]
        image_path = output / (name + ".png")
        scene.render.filepath = str(image_path)
        bpy.ops.render.render(write_still=True)
        azimuth, elevation = VIEWS[name]
        report["views"].append({"name": name, "file": image_path.name, "sha256": sha256(image_path), "azimuthDegrees": azimuth + args.azimuth_offset, "elevationDegrees": elevation, "cameraLocation": list(scene.camera.location)})
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("CANDIDATE_VIEW_COMPLETE " + str(image_path), flush=True)
    scene.camera = cameras["hero"]
    scene.render.filepath = str(output / "hero.png")
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(output / "review.blend"))
    report["sourceUnchanged"] = sha256(source) == original_hash
    if not report["sourceUnchanged"]:
        raise RuntimeError("Source GLB hash changed during review")
    report["reviewBlend"] = "review.blend"
    report["finishedAt"] = utc_now()
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("CANDIDATE_REVIEW_COMPLETE " + str(report_path), flush=True)


if __name__ == "__main__":
    main()
