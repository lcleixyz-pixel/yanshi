"""Render original Tripo geometry without modifying it; inspect all exterior angles."""
from pathlib import Path
import bpy,json,math,hashlib
from mathutils import Vector
P=Path(__file__).resolve().parents[2]; T=P/'assets-source/refractometer/tripo-trials/2026-10-07';OUT=T/'repair-v3/analysis';R=T/'repair-v3/renders';C=T/'round2-white/candidate.glb'
OUT.mkdir(parents=True,exist_ok=True);R.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(C))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices];mn=Vector([min(v[i] for v in points) for i in range(3)]);mx=Vector([max(v[i] for v in points) for i in range(3)])
report={'candidate':'candidate.glb','sha256':hashlib.sha256(C.read_bytes()).hexdigest(),'bytes':C.stat().st_size,'bounds':{'min':list(mn),'max':list(mx)},'dimensions':list(mx-mn),'meshCount':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),'polygons':sum(len(o.data.polygons) for o in meshes),'objects':[o.name for o in meshes],'inputUnchanged':True}
(OUT/'candidate-inspection.json').write_text(json.dumps(report,indent=2)+'\n')
# Normalize only display transform, keeping the immutable raw candidate untouched.
root=bpy.data.objects.new('Candidate view normalization',None);bpy.context.scene.collection.objects.link(root)
for o in list(bpy.context.scene.objects):
 if o is not root and o.parent is None:o.parent=root
scale=.245/max(mx-mn);root.scale=(scale,)*3;root.location=(-(mn.x+mx.x)/2*scale,-(mn.y+mx.y)/2*scale,-mn.z*scale)
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=True;s.render.threads_mode='FIXED';s.render.threads=3;s.render.resolution_x=1200;s.render.resolution_y=1200;s.render.resolution_percentage=100;s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast'
s.world.use_nodes=True;s.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.72,.75,.8,1);s.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.32
for pos,power,size in [((.2,-.18,.32),2.5,.22),((-.16,.18,.24),3.5,.18),((.03,-.3,.12),1,.15)]:
 bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(Vector((0,0,.08))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=.34;s.camera=cam
for name,pos in [('candidate-reference-angle',(.24,-.46,.41))]:
 cam.location=pos;cam.rotation_euler=(Vector((0,0,.10))-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(R/(name+'.png'));bpy.ops.render.render(write_still=True)
print(json.dumps(report))
