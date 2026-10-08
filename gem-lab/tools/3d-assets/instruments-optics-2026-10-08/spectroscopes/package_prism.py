"""Package the verified prism candidate without re-exporting its geometry.

Run with Blender --factory-startup -b --python-exit-code 1 --python this_file.
Only paper-optics-v1 and the dedicated publication-prep archive are written.
"""
import copy
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = next(p for p in HERE.parents if p.name == 'gem-lab')
SOURCE = ROOT / 'assets-source/optics-paper-review/2026-10-08/prism-spectroscope'
OLD = ROOT / 'public/assets/3d/prism-spectroscope/structure-v1'
OUT = ROOT / 'public/assets/3d/prism-spectroscope/paper-optics-v1'
ARCHIVE = ROOT / 'assets-source/optics-paper-review/2026-10-08/publication-prep/prism-spectroscope'
OLD_SHA = 'ba3d45fb33ff390a4759c84845ba3e55d185a4ae24b6811913a1e1403b58d14d'
SOURCE_SHA = 'e49c2a6ca2b8171c0f90fec5e358a4a43f8e7f28441982caec2413c46117d536'
COLORS = {'N-BK7': [0.13, 0.55, 0.95, 1.0], 'N-F2': [0.97, 0.39, 0.075, 1.0]}
TRANSMISSION = {'N-BK7': 0.70, 'N-F2': 0.64}


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def write(p, value):
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def unpack(path):
    data = path.read_bytes()
    assert struct.unpack_from('<4sII', data) == (b'glTF', 2, len(data))
    length, kind = struct.unpack_from('<I4s', data, 12)
    assert kind == b'JSON'
    return json.loads(data[20:20 + length]), data[20 + length:]


def cv(point):
    return Vector((point[0], -point[2], point[1]))


def geometry_signatures():
    result = {}
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        obj.data.calc_loop_triangles()
        triangles = []
        for tri in obj.data.loop_triangles:
            triangles.append(sorted(tuple(round(v, 9) for v in obj.matrix_world @ obj.data.vertices[i].co) for i in tri.vertices))
        result[obj.name] = hashlib.sha256(json.dumps(sorted(triangles)).encode()).hexdigest()
    return result


assert sha(OLD / 'model.glb') == OLD_SHA
assert sha(SOURCE / 'model.glb') == SOURCE_SHA
protected = {str(p): sha(p) for folder in [OLD, SOURCE] for p in folder.rglob('*') if p.is_file()}
OUT.mkdir(parents=True, exist_ok=True)
ARCHIVE.mkdir(parents=True, exist_ok=True)
(OUT / 'validation').mkdir(exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0

# Editing the JSON chunk preserves every binary accessor, image, mesh and node.
before, binary = unpack(SOURCE / 'model.glb')
after = copy.deepcopy(before)
changes = []
for index, material in enumerate(after['materials']):
    glass = next((g for g in COLORS if material.get('name', '').startswith(g + ' educational')), None)
    if glass:
        previous = copy.deepcopy(material)
        material['pbrMetallicRoughness']['baseColorFactor'] = COLORS[glass]
        material['extensions']['KHR_materials_transmission']['transmissionFactor'] = TRANSMISSION[glass]
        changes.append({'materialIndex': index, 'glass': glass, 'before': previous, 'after': copy.deepcopy(material)})
assert len(changes) == 2
encoded = json.dumps(after, ensure_ascii=False, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
(OUT / 'model.glb').write_bytes(struct.pack('<4sII', b'glTF', 2, 20 + len(encoded) + len(binary)) + struct.pack('<I4s', len(encoded), b'JSON') + encoded + binary)
actual, actual_binary = unpack(OUT / 'model.glb')
assert binary == actual_binary
assert {k: v for k, v in before.items() if k != 'materials'} == {k: v for k, v in actual.items() if k != 'materials'}
for i, (first, second) in enumerate(zip(before['materials'], actual['materials'])):
    restored = copy.deepcopy(second)
    if any(c['materialIndex'] == i for c in changes):
        restored['pbrMetallicRoughness']['baseColorFactor'] = first['pbrMetallicRoughness']['baseColorFactor']
        restored['extensions']['KHR_materials_transmission']['transmissionFactor'] = first['extensions']['KHR_materials_transmission']['transmissionFactor']
    assert restored == first
model_sha = sha(OUT / 'model.glb')
model_bytes = (OUT / 'model.glb').stat().st_size
for filename in ['optical-cases.json', 'prescription.json', 'sources.json']:
    shutil.copy2(SOURCE / filename, OUT / filename)

manifest = json.loads((SOURCE / 'manifest.json').read_text())
manifest.update({'id': 'prism-spectroscope', 'version': 'paper-optics-v1', 'revision': 'paper-optics-v1', 'modelSha256': model_sha, 'modelBytes': model_bytes, 'sha256': model_sha, 'byteLength': model_bytes, 'poster': 'poster.png', 'opticsPoster': 'poster-optics.png', 'provenance': 'provenance.json', 'publicationStatus': 'local-public-directory-candidate; not application-integrated or deployed'})
appearance_note = '蓝色冕牌与暖色火石仅作部件识别；不是实际玻璃固有颜色、吸收光谱或透射率。材质外观不参与折射和色散计算。'
manifest['materialAppearanceNote'] = appearance_note
manifest['amiciAssembly']['appearanceValuesIllustrative'] = True
for kind, glass in [('crown', 'N-BK7'), ('flint', 'N-F2')]:
    manifest['amiciAssembly']['materialAppearance'][kind]['baseColor'] = COLORS[glass][:3]
    manifest['amiciAssembly']['materialAppearance'][kind]['transmission'] = TRANSMISSION[glass]
manifest['constructionNotes'].append(appearance_note)
write(OUT / 'manifest.json', manifest)

# Import the exact packaged bytes to create the matching editable master.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(OUT / 'model.glb'))
bpy.context.view_layer.update()
geometry_before_render = geometry_signatures()
asset_meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
scene = bpy.context.scene
scene['packagedGLBSha256'] = model_sha
scene['appearanceNote'] = appearance_note
scene['geometrySource'] = str((OUT / 'model.glb').relative_to(ROOT))
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.render.threads_mode = 'FIXED'
scene.render.threads = 12
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = 0
scene.world = bpy.data.worlds.new('Publication studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.80, 0.83, 0.86, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.55
for name, loc, power, size in [('Key', (.05, -.10, .16), .9, .12), ('Fill', (-.08, .02, .07), .45, .09), ('Rim', (.05, .13, .02), .65, .08)]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size = power, 'DISK', size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (-obj.location).to_track_quat('-Z', 'Y').to_euler()
camera_data = bpy.data.cameras.new('Publication camera')
camera = bpy.data.objects.new('Publication camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.type = 'ORTHO'
camera_data.clip_start, camera_data.clip_end = .0001, 10


def set_view(position, scale, axis_angle):
    camera.location = cv(position)
    camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
    projected = camera.rotation_euler.to_matrix().transposed() @ cv((0, 0, 1))
    camera.rotation_euler.rotate_axis('Z', math.atan2(projected.y, projected.x) - math.radians(axis_angle))
    camera_data.ortho_scale = scale
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1100


set_view((.12, .11, .15), .126, 24)
scene.render.filepath = str(OUT / 'poster.png')
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ARCHIVE / 'editable.blend'))
bpy.ops.render.render(write_still=True)
for obj in asset_meshes:
    obj.hide_render = not obj.name.startswith('PrismSpectroscope_amici_')
set_view((.026, .046, .020), .039, 6)
scene.render.filepath = str(OUT / 'poster-optics.png')
bpy.ops.render.render(write_still=True)
for obj in asset_meshes:
    obj.hide_render = False
assert geometry_before_render == geometry_signatures()
set_view((.12, .11, .15), .126, 24)
scene.render.filepath = str(OUT / 'poster.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ARCHIVE / 'editable.blend'))
shutil.copy2(Path(__file__), ARCHIVE / 'package_prism.py')

report = {'status': 'pass', 'createdAt': '2026-10-08', 'candidateModelSha256': SOURCE_SHA, 'modelSha256': model_sha, 'modelBytes': model_bytes, 'binaryChunkUnchanged': True, 'binaryChunkSha256': hashlib.sha256(binary).hexdigest(), 'allNonMaterialGLTFFieldsUnchanged': True, 'nodeCount': len(actual['nodes']), 'meshCount': len(actual['meshes']), 'materialChanges': changes, 'onlyChangedFields': ['materials[7].pbrMetallicRoughness.baseColorFactor', 'materials[7].extensions.KHR_materials_transmission.transmissionFactor', 'materials[8].pbrMetallicRoughness.baseColorFactor', 'materials[8].extensions.KHR_materials_transmission.transmissionFactor'], 'allIORFieldsUnchanged': True, 'opticalCasesByteIdentical': sha(SOURCE / 'optical-cases.json') == sha(OUT / 'optical-cases.json'), 'prescriptionByteIdentical': sha(SOURCE / 'prescription.json') == sha(OUT / 'prescription.json'), 'blenderImportedWorldMeshSignatures': geometry_before_render, 'masterImportedExactPublicGLB': True, 'masterSha256': sha(ARCHIVE / 'editable.blend'), 'posterSha256': sha(OUT / 'poster.png'), 'opticsPosterSha256': sha(OUT / 'poster-optics.png'), 'packageScriptSha256': sha(Path(__file__)), 'protectedInputFilesUnchanged': all(sha(Path(p)) == digest for p, digest in protected.items()), 'protectedInputSha256': protected, 'limitations': [appearance_note, 'Geometry preservation does not replace independent optical validation of the public model.', 'Posters are renders of this exact packaged model, with camera and lighting added only in the editable master. The optics closeup hides other meshes without changing glass geometry.']}
assert report['protectedInputFilesUnchanged']
write(OUT / 'validation/material-only.json', report)
write(ARCHIVE / 'packaging-log.json', report)
old_provenance = json.loads((OLD / 'provenance.json').read_text())
audit = json.loads((SOURCE / 'audit.json').read_text())
provenance = {'instrument': 'prism-spectroscope', 'version': 'paper-optics-v1', 'createdAt': '2026-10-08', 'modelSha256': model_sha, 'modelBytes': model_bytes, 'sources': 'sources.json', 'prescription': 'prescription.json', 'opticalCases': 'optical-cases.json', 'dimensionsCalibrated': False, 'internalOpticsIllustrative': True, 'manufacturerPrescriptionKnown': False, 'licenseBoundary': old_provenance['licenseBoundary'], 'sourceChain': [{'stage': 'historical-parametric-structure-v1', 'model': '../structure-v1/model.glb', 'sha256': OLD_SHA, 'bytes': (OLD / 'model.glb').stat().st_size, 'finding': 'Three old blocks formed parallel outer faces. Snell tracing from the actual exported mesh at illustrative IOR 1.52/1.62 gave 14.275 degrees deviation and hit the existing baffle.', 'preservedUnmodified': True}, {'stage': 'paper-optics-candidate-2026-10-08', 'archiveModel': str((SOURCE / 'model.glb').relative_to(ROOT)), 'sha256': SOURCE_SHA, 'bytes': (SOURCE / 'model.glb').stat().st_size, 'method': 'Rebuilt only three glass meshes and two exterior cement-edge guides; retained the remaining 17 meshes. Four-interface nonlinear Snell tracing with official SCHOTT Sellmeier data solves 550 nm direct vision. Explicit teaching prescription, not a measured manufacturer construction.', 'preservedUnmodified': True, 'source': ['hagen-tkaczyk-2011', 'schott-nbk7', 'schott-nf2'], 'designDeviationDegrees': audit['after']['designDeviationDegrees']}, {'stage': 'paper-optics-v1-local-public-package', 'model': 'model.glb', 'sha256': model_sha, 'bytes': model_bytes, 'method': 'Only two material base colors and transmission values changed in the GLB JSON. Binary data, node transforms, mesh/accessor fields, IOR and optical calculations unchanged.', 'appearanceNote': appearance_note, 'geometryEvidence': 'validation/material-only.json'}], 'historicalProvenance': old_provenance, 'reconstruction': {'script': str(Path(__file__).relative_to(ROOT)), 'scriptSha256': sha(Path(__file__)), 'editableMasterArchive': str((ARCHIVE / 'editable.blend').relative_to(ROOT)), 'editableMasterSha256': sha(ARCHIVE / 'editable.blend'), 'blenderVersion': bpy.app.version_string, 'masterMethod': 'Imported the exact packaged GLB; all images packed; added render camera/lights only.', 'poster': 'poster.png', 'posterSha256': sha(OUT / 'poster.png'), 'opticsPoster': 'poster-optics.png', 'opticsPosterSha256': sha(OUT / 'poster-optics.png')}, 'verification': {'packaging': 'validation/material-only.json', 'independentOptics': 'pending; see validation directory after independent runner finishes', 'browserReview': 'pending; model itself is not application-integrated or deployed', 'userAppearanceAccepted': False}, 'limits': audit['limits'] + [appearance_note, 'Archive paths preserve provenance only; runtime review needs only files in this public version directory.']}
write(OUT / 'provenance.json', provenance)
(OUT / 'README.md').write_text('# 棱镜式分光镜 paper-optics-v1\n\n本目录是待接入的新静态资产版本；没有修改 structure-v1，也没有接入应用或部署。\n\n蓝色 N-BK7 冕牌与暖色 N-F2 火石仅用于部件识别，不表示实际玻璃颜色、吸收或透射率。IOR、几何、光路计算与 2026-10-08 候选一致。外观封面和玻璃近景由导入本目录 GLB 的同版 Blender 母版渲染。\n\n来源链、来源许可边界见 provenance.json；论文和玻璃数据链接见 sources.json；四界面教学处方见 prescription.json。光路从理想准直之后开始，止于未给定光学处方的目镜前面，不宣称真实光谱成像或厂家内部结构。\n\nvalidation/material-only.json 证明二进制数据及全部非材质字段未变。独立光学检查、glTF Validator 和浏览器验收由另一路复核，结果写入 validation/；打包日志不能替代这些检查。\n\n本轮不改测台窗口形状；其窄条化待用户确认，属于折射仪后续事项。\n')
print(json.dumps({'modelSha256': model_sha, 'modelBytes': model_bytes, 'publicDirectory': str(OUT), 'master': str(ARCHIVE / 'editable.blend'), 'protectedInputsUnchanged': True}, ensure_ascii=False))
