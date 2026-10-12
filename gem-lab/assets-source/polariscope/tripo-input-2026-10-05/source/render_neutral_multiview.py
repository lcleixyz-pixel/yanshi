#!/usr/bin/env python3
"""Render an isolated neutral reference pack; never save or export the source model.

Run with Blender --background --python-exit-code 1 --python this-file -- --preview
Use --final only after preview review to render the four 2048px input views and top check.
"""
import argparse
import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import bpy
from mathutils import Vector


PACK = Path(__file__).resolve().parents[1]
SOURCE = PACK.parent
PROJECT = SOURCE.parents[1]
MASTER = SOURCE / "polariscope-master.blend"
GLB = PROJECT / "public/assets/3d/polariscope/polariscope.glb"
TARGET = (0, .127, -.010)
SCALE = .320
DISTANCE = 3.0
ELEVATION_DEGREES = 10.0
EXPECTED_GLB = "c72a598eddf78efddbd5a1dfb9da1deb82e00cc0aa06fc9df22a8fcdd5373559"
EXPECTED_MASTER = "561ee72ee101b51bcb9f63f641e36de64bb9a7a54735676a30e2c08b917ba7bf"
VIEWS = [("01-front", 0), ("02-left", -90), ("03-back", 180), ("04-right", 90)]
LIGHTS = [
    {"name": "front_soft", "position": (-.28, .57, .48), "powerW": 2.0, "size": .85},
    {"name": "back_soft", "position": (.28, .57, -.48), "powerW": 2.0, "size": .85},
    {"name": "left_fill", "position": (-.48, .40, -.15), "powerW": 1.0, "size": .70},
    {"name": "right_fill", "position": (.48, .40, .15), "powerW": 1.0, "size": .70},
]
MATERIAL_OVERRIDES = {
    "paint": {"Base Color": [.78, .78, .755, 1], "Roughness": .48, "Metallic": 0, "Coat Weight": 0, "Specular IOR Level": .25},
    "black_metal": {"Base Color": [.016, .018, .02, 1], "Roughness": .48, "Metallic": .35, "Coat Weight": 0, "Specular IOR Level": .3},
    "black_satin": {"Base Color": [.018, .020, .022, 1], "Roughness": .54, "Metallic": .22, "Coat Weight": 0, "Specular IOR Level": .28},
    "rubber": {"Base Color": [.015, .016, .017, 1], "Roughness": .80, "Metallic": 0, "Specular IOR Level": .2},
    "silver": {"Base Color": [.46, .48, .49, 1], "Roughness": .43, "Metallic": .8, "Coat Weight": 0},
    "optic": {"Base Color": [.52, .55, .50, 1], "Roughness": .075, "Transmission Weight": .92, "IOR": 1.49, "Coat Weight": 0},
    "clear_glass": {"Base Color": [.98, 1, 1, 1], "Roughness": .065, "Transmission Weight": 1, "IOR": 1.52, "Coat Weight": 0},
    "light_emitter": {"Base Color": [.92, .71, .38, 1], "Emission Color": [.92, .71, .38, 1], "Emission Strength": .65, "Roughness": .65},
    "front_window_light": {"Base Color": [.94, .49, .14, 1], "Emission Color": [.94, .49, .14, 1], "Emission Strength": .08, "Roughness": .42, "Transmission Weight": .1, "Coat Weight": 0},
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def native(p):
    return Vector((p[0], -p[2], p[1]))


def aim(obj, target):
    obj.rotation_euler = (native(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def protected_hashes():
    paths = [MASTER, GLB, SOURCE / "parameters.json", SOURCE / "validation.json", PROJECT / "tools/3d-assets/blender/build_polariscope.py", PROJECT / "public/assets/3d/polariscope/manifest.json"]
    return {str(path.relative_to(PROJECT)): digest(path) for path in paths}


def setup(resolution):
    scene = bpy.context.scene
    # All changes below exist only in memory. Hide the original stage and studio lights.
    for obj in scene.objects:
        if obj.name.startswith("STUDIO_") and obj.type != "CAMERA":
            obj.hide_render = True
        if obj.get("partId") == "sample":
            obj.hide_render = True
    for role, changes in MATERIAL_OVERRIDES.items():
        mat = bpy.data.materials.get("CYCLES_" + role)
        assert mat, role
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        for key, value in changes.items():
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = value
        for node in mat.node_tree.nodes:
            if node.type == "BUMP":
                node.inputs["Strength"].default_value = .055
        # An explicitly illustrative input-render override reduces mirror ambiguity at
        # grazing angles. It is not a calibrated optical material and is never saved.
        if role in ("optic", "clear_glass"):
            transparent = mat.node_tree.nodes.new("ShaderNodeBsdfTransparent")
            transparent.inputs["Color"].default_value = (.965, .98, .958, 1)
            mix = mat.node_tree.nodes.new("ShaderNodeMixShader")
            mix.inputs[0].default_value = .72 if role == "optic" else .65
            output = mat.node_tree.nodes.get("Material Output")
            mat.node_tree.links.new(bsdf.outputs["BSDF"], mix.inputs[1])
            mat.node_tree.links.new(transparent.outputs[0], mix.inputs[2])
            mat.node_tree.links.new(mix.outputs[0], output.inputs["Surface"])
        mat.diffuse_color = tuple(changes.get("Base Color", mat.diffuse_color))
    world = bpy.data.worlds.new("Neutral_reference_world_unsaved")
    world.use_nodes = True
    scene.world = world
    nodes = world.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    background.name = "Even neutral environment"
    background.inputs["Color"].default_value = (.8, .8, .8, 1)
    background.inputs["Strength"].default_value = .7
    camera_background = nodes.new("ShaderNodeBackground")
    camera_background.name = "Solid offwhite camera background"
    camera_background.inputs["Color"].default_value = (.94, .94, .94, 1)
    camera_background.inputs["Strength"].default_value = 1
    lightpath = nodes.new("ShaderNodeLightPath")
    mix = nodes.new("ShaderNodeMixShader")
    world.node_tree.links.new(lightpath.outputs["Is Camera Ray"], mix.inputs[0])
    world.node_tree.links.new(background.outputs["Background"], mix.inputs[1])
    world.node_tree.links.new(camera_background.outputs["Background"], mix.inputs[2])
    world.node_tree.links.new(mix.outputs[0], output.inputs["Surface"])
    for setting in LIGHTS:
        data = bpy.data.lights.new("NEUTRAL_" + setting["name"], "AREA")
        data.energy = setting["powerW"]
        data.shape = "DISK"
        data.size = setting["size"]
        data.color = (1, 1, 1)
        obj = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(obj)
        obj.location = native(setting["position"])
        aim(obj, TARGET)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 128
    scene.cycles.adaptive_threshold = .009
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 16
    scene.cycles.transmission_bounces = 12
    scene.cycles.transparent_max_bounces = 16
    scene.render.resolution_x = scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    pref = bpy.context.preferences.addons["cycles"].preferences
    pref.compute_device_type = "METAL"
    pref.get_devices()
    enabled = []
    for device in pref.devices:
        device.use = device.type == "METAL"
        if device.use:
            enabled.append(device.name)
    assert enabled, "This reference pack requires the verified local Metal renderer"
    scene.cycles.device = "GPU"
    camera = scene.camera
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = SCALE
    camera.data.clip_start = .001
    camera.data.clip_end = 100
    return camera, enabled


def render(camera, output, azimuth, elevation=ELEVATION_DEGREES, resolution=None, scale=SCALE):
    angle, pitch = math.radians(azimuth), math.radians(elevation)
    offset = (DISTANCE * math.cos(pitch) * math.sin(angle), DISTANCE * math.sin(pitch), DISTANCE * math.cos(pitch) * math.cos(angle))
    position = tuple(TARGET[i] + offset[i] for i in range(3))
    camera.location = native(position)
    camera.data.ortho_scale = scale
    aim(camera, TARGET)
    scene = bpy.context.scene
    if resolution:
        scene.render.resolution_x = scene.render.resolution_y = resolution
    output.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    record = {"file": str(output.relative_to(PACK)), "sha256": digest(output), "width": scene.render.resolution_x, "height": scene.render.resolution_y, "azimuthDegrees": azimuth, "elevationDegrees": elevation, "positionDeliveryYUp": list(position), "targetDeliveryYUp": list(TARGET), "orthographicScaleMeters": scale, "forUpload": output.parent.name == "B-multiview"}
    print("NEUTRAL_RENDER_COMPLETE " + json.dumps(record), flush=True)
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--preview", action="store_true")
    group.add_argument("--final", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    before = protected_hashes()
    assert digest(GLB) == EXPECTED_GLB
    assert digest(MASTER) == EXPECTED_MASTER
    bpy.ops.wm.open_mainfile(filepath=str(MASTER))
    camera, devices = setup(1024 if args.preview else 2048)
    report = {"createdAt": datetime.now(timezone.utc).isoformat(), "packPurpose": "Local neutral multi-view inputs for user-operated Tripo/Meshy evaluation; no cloud upload performed", "sourceAssetVersion": "0.4.0", "sourceStatus": "project-reference-derived-teaching-model; provisional/unmeasured", "sourceFiles": before, "scriptSha256": digest(Path(__file__)), "blenderVersion": bpy.app.version_string, "devices": devices, "camera": {"projection": "orthographic", "targetDeliveryYUp": TARGET, "distanceMeters": DISTANCE, "scaleMeters": SCALE, "elevationDegrees": ELEVATION_DEGREES, "sharedForAllFourUploadViews": True}, "lighting": {"worldEnvironmentColor": [.8, .8, .8], "worldEnvironmentStrength": .7, "cameraBackgroundLinearRGB": [.94, .94, .94], "lights": LIGHTS, "floor": "hidden; no contact/drop shadow"}, "colorManagement": {"viewTransform": "Standard", "look": "None", "exposure": 0, "gamma": 1, "pngMode": "RGB 8bit"}, "materials": MATERIAL_OVERRIDES, "render": {"engine": "Cycles Metal", "samples": 128, "adaptiveThreshold": .009, "denoising": True}, "geometryChanged": False, "sampleVisible": False, "annotations": False, "views": []}
    if args.preview:
        report["views"].append(render(camera, PACK / "review/hero.png", -38, 18, scale=.35))
        report["views"].append(render(camera, PACK / "review/front-preview.png", 0))
    else:
        for name, azimuth in VIEWS:
            report["views"].append(render(camera, PACK / "B-multiview" / (name + ".png"), azimuth))
        report["views"].append(render(camera, PACK / "review/hero.png", -38, 18, resolution=1024, scale=.35))
        report["views"].append(render(camera, PACK / "review/top.png", 0, 89.99, resolution=1024))
    after = protected_hashes()
    assert before == after, "Protected current asset files were modified"
    report["protectedSourceFilesUnchanged"] = True
    report["illustrativeTransparencyOverride"] = {"opticTransparentMix": .72, "clearGlassTransparentMix": .65, "transparentColor": [.965, .98, .958, 1], "reason": "Reduce mirror-disc ambiguity for image-to-3D input; this is not calibrated glass or polarized-light simulation."}
    report["finishedAt"] = datetime.now(timezone.utc).isoformat()
    report_path = PACK / ("source/preview-settings.json" if args.preview else "source/render-manifest.json")
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("NEUTRAL_PACK_COMPLETE " + str(report_path), flush=True)


if __name__ == "__main__":
    main()
