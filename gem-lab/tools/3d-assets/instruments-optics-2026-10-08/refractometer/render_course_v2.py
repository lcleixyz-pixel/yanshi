"""Poster from the exact staged master; never edits GLB or the candidate master."""
from pathlib import Path
import bpy,json,hashlib
from mathutils import Vector
HERE=Path(__file__).resolve().parent
OUT=HERE.parents[3]/'assets-source/refractometer/course-v2'
MASTER=OUT/'editable.blend'
bpy.ops.wm.open_mainfile(filepath=str(MASTER))
for id in ['contact_layer','isotropic_sample']:
    o=bpy.data.objects.get('Refractometer_'+id)
    if o:
        for child in o.children_recursive:child.hide_render=True
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=192;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.render.threads_mode='FIXED';scene.render.threads=8
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
world=bpy.data.worlds.new('Paper optics poster neutral world');world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.69,.74,.79,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.20;scene.world=world
scene.view_settings.exposure=-.25
def light(name,pos,energy,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;data.color=color
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,.07))-o.location).to_track_quat('-Z','Y').to_euler()
light('Poster key',(.20,-.23,.33),3.2,.24,(1,.93,.84))
light('Poster fill',(-.18,-.06,.19),1.2,.20,(.80,.90,1))
light('Poster rim',(.08,.23,.29),2.5,.18,(1,1,1))
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.0006));floor=bpy.context.object;floor.name='Poster floor only'
mat=bpy.data.materials.new('Poster warm grey surface');mat.diffuse_color=(.52,.55,.57,1);mat.use_nodes=True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.52,.55,.57,1)
mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.78;floor.data.materials.append(mat)
data=bpy.data.cameras.new('Poster camera');cam=bpy.data.objects.new('Poster camera',data);scene.collection.objects.link(cam);scene.camera=cam
cam.location=(.29,-.34,.25);target=Vector((.018,.003,.10));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO'
bpy.context.view_layer.update()
points=[o.matrix_world@Vector(c) for o in bpy.data.objects if o.type=='MESH' and o!=floor for c in o.bound_box]
local=[cam.matrix_world.inverted()@p for p in points]
lo=Vector(tuple(min(p[i] for p in local) for i in range(3)));hi=Vector(tuple(max(p[i] for p in local) for i in range(3)))
cam.location+=cam.matrix_world.to_3x3()@Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,0))
aspect=scene.render.resolution_x/scene.render.resolution_y;data.ortho_scale=max(hi.x-lo.x,(hi.y-lo.y)*aspect)*1.15
scene.render.filepath=str(OUT/'poster.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'poster-studio.blend'))
bpy.ops.render.render(write_still=True)
record=dict(masterSha256=hashlib.sha256(MASTER.read_bytes()).hexdigest(),posterSha256=hashlib.sha256((OUT/'poster.png').read_bytes()).hexdigest(),width=1600,height=1400,render='Cycles',samples=192,modelChanges=False)
(OUT/'poster-render.json').write_text(json.dumps(record,indent=2)+'\n')
# Fixed top view of the actual steel surface and directly exposed prism.
# Optional sample and film remain hidden so the contact opening can be reviewed.
normal=Vector((0,-.14780941112961063,.9890158633619168))
centre=Vector((0,.025822628706644468,.0766868190360343))
cam.location=centre+normal*.20
cam.rotation_euler=(centre-cam.location).to_track_quat('-Z','Y').to_euler()
data.ortho_scale=.068
scene.render.resolution_x=1400;scene.render.resolution_y=1200
scene.render.filepath=str(OUT/'narrow-stage-top.png')
bpy.ops.render.render(write_still=True)
