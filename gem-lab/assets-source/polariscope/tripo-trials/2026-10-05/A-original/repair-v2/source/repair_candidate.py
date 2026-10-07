#!/usr/bin/env python3
"""Make a separate, editable hybrid repair of the original Tripo candidate.

Coordinates retain the uncalibrated source scale: Blender X forward, Y across,
Z up. Geometry cutouts preserve source UVs; analytic replacement solids remove
unsupported rear features and provide independent optical/mechanical groups.
No original or public asset is overwritten.
"""
import argparse
import hashlib
import json
import math
import sys
import struct
from datetime import datetime, timezone
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'candidate.glb'
EXPECTED = '37886a63481139b2e385b7b531e1308a597c8df7c86b82b1ba4ea88401553e3a'
PARTS = {}
MESHES = []
RECORDS = []
CX = .178
LABELS = {'base':'底座','frame':'支架（与底座一体）','light':'底座内部光源','polarizer':'下偏光片','stage':'载物台','analyzer':'上偏光片','conoscope':'干涉球','powerSwitch':'电源按钮'}
EXPLODE = {'base':[0,0,0],'frame':[0,0,0],'light':[0,0,0],'polarizer':[0,.20,0],'stage':[0,.32,0],'analyzer':[0,.34,0],'conoscope':[0,.06,.24],'powerSwitch':[0,0,0]}

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def write(p, data):
    p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

def delivery(v):
    return [float(v[0]),float(v[2]),float(-v[1])]

def mat(name, color, rough=.3, metal=0, trans=0, emission=0, ior=1.5):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
    n=m.node_tree.nodes.get('Principled BSDF')
    for key,val in {'Base Color':(*color,1),'Roughness':rough,'Metallic':metal,'Transmission Weight':trans,'IOR':ior,'Coat Weight':.08 if name=='Repair_paint' else 0}.items():
        n.inputs[key].default_value=val
    if emission:
        n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
    m['provenance']='authored replacement material; visually chosen, not measured'
    return m

def part(pid, loc):
    o=bpy.data.objects.new('Polariscope_'+pid,None);bpy.context.collection.objects.link(o);o.location=loc
    o['teachingPart']=pid;o['label']=LABELS[pid];o['dimensionsCalibrated']=False
    o['provenance']='Tripo candidate repair; teaching relationship from existing project reference'
    PARTS[pid]=o
    return o

def adopt(o, pid, material=None, provenance='rebuilt analytic geometry'):
    bpy.context.view_layer.update();world=o.matrix_world.copy();o.parent=PARTS[pid];o.matrix_world=world
    o['teachingPart']=pid;o['provenance']=provenance
    if material:
        o.data.materials.clear();o.data.materials.append(material)
    MESHES.append(o)
    return o

def normals(o):
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.update()

def bevel(o,width=.002,segments=4):
    b=o.modifiers.new('Editable edge radius','BEVEL');b.width=width;b.segments=segments;b.limit_method='ANGLE';b.harden_normals=True
    n=o.modifiers.new('Weighted hard surface normals','WEIGHTED_NORMAL');n.keep_sharp=True;n.weight=50

def cube(name,pid,loc,dims,material,edge=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    if edge:bevel(o,edge)
    return adopt(o,pid,material)

def cylinder(name,pid,loc,radius,depth,material,axis=(0,0,1),edge=.0007,segments=128):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=radius,depth=depth,location=loc)
    o=bpy.context.object;o.name=name;o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector((0,0,1)).rotation_difference(Vector(axis))
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    if edge:bevel(o,edge,3)
    return adopt(o,pid,material)

def ring(name,pid,loc,profile,material,axis=(0,0,1),segments=192):
    rot=Vector((0,0,1)).rotation_difference(Vector(axis));verts=[];faces=[]
    for r,z in profile:
        for i in range(segments):
            a=math.tau*i/segments;verts.append(rot@Vector((r*math.cos(a),r*math.sin(a),z)))
    for k in range(len(profile)):
        for i in range(segments):
            faces.append((k*segments+i,k*segments+(i+1)%segments,((k+1)%len(profile))*segments+(i+1)%segments,((k+1)%len(profile))*segments+i))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.location=loc
    normals(o)
    for p in mesh.polygons:
        k=p.index//segments;p.use_smooth=abs(profile[k][1]-profile[(k+1)%len(profile)][1])>1e-6
    bevel(o,.00055,3);o['clearAperture']=min(x[0] for x in profile)
    return adopt(o,pid,material)

def raw_mesh(name,verts,faces,fix_normals=True):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    if fix_normals:normals(o)
    return o

def boolean(o, cutter, operation):
    bpy.context.view_layer.objects.active=o
    m=o.modifiers.new(operation,'BOOLEAN');m.operation=operation;m.solver='EXACT';m.object=cutter
    bpy.ops.object.modifier_apply(modifier=m.name);bpy.data.objects.remove(cutter,do_unlink=True)

def make_frame(paint):
    # Continuous thickened side section; short circular fillets are the bevel modifier.
    path=[(-.461,.420),(-.461,.681),(-.164,.912),(-.155,.912)]
    half=.010;outer=[];inner=[]
    directions=[Vector((path[i+1][0]-path[i][0],path[i+1][1]-path[i][1])).normalized() for i in range(len(path)-1)]
    for i,p in enumerate(path):
        left=directions[max(0,i-1)];right=directions[min(i,len(directions)-1)]
        a=Vector((-left.y,left.x));b=Vector((-right.y,right.x));normal=(a+b).normalized();offset=normal*half/max(normal.dot(a),.25)
        outer.append((p[0]+offset.x,p[1]+offset.y));inner.append((p[0]-offset.x,p[1]-offset.y))
    section=outer+list(reversed(inner));n=len(section);width=.618
    verts=[(x,y,z) for y in (-width/2,width/2) for x,z in section]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    frame=raw_mesh('Frame_continuous_folded_shell',verts,faces)
    # Rounded nose plate overlaps the horizontal terminal of the folded support.
    outline=[(-.160,-width/2),(-.160,width/2)]
    outline += [(.155+.283*math.cos(math.pi/2-math.pi*i/96),.283*math.sin(math.pi/2-math.pi*i/96)) for i in range(97)]
    n=len(outline);verts=[(x,y,z) for z in (.902,.922) for x,y in outline]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    plate=raw_mesh('Temporary_round_nose_plate',verts,faces);boolean(frame,plate,'UNION')
    bpy.ops.mesh.primitive_cylinder_add(vertices=192,radius=.163,depth=.12,location=(CX,0,.912));boolean(frame,bpy.context.object,'DIFFERENCE')
    normals(frame)
    for p in frame.data.polygons:p.use_smooth=True
    bevel(frame,.0018,4);frame['throughHole']=True;frame['apertureRadius']=.163
    return adopt(frame,'frame',paint)

def source_arrays(source):
    mesh=source.data
    pos=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',pos);pos=pos.reshape(-1,3)
    tris=np.empty(len(mesh.loops),dtype=np.int32);mesh.loops.foreach_get('vertex_index',tris);tris=tris.reshape(-1,3)
    uv=np.empty(len(mesh.loops)*2,dtype=np.float32);mesh.uv_layers.active.data.foreach_get('uv',uv);uv=uv.reshape(-1,3,2)
    centers=pos[tris].mean(axis=1)
    corner_normals=np.empty(len(mesh.loops)*3,dtype=np.float32);mesh.corner_normals.foreach_get('vector',corner_normals);corner_normals=corner_normals.reshape(-1,3,3)
    return pos,tris,uv,centers,corner_normals

def extract(name,pid,mask,arrays,material,translation=(0,0,0)):
    pos,tris,uv,_,corner_normals=arrays;indices=np.flatnonzero(mask);assert len(indices)>20,name
    chosen=tris[indices];unique,inverse=np.unique(chosen,return_inverse=True);newpos=pos[unique]+np.array(translation)
    o=raw_mesh(name,newpos.tolist(),inverse.reshape(-1,3).tolist(),fix_normals=False);layer=o.data.uv_layers.new(name='UVMap')
    layer.data.foreach_set('uv',uv[indices].flatten());o.data.update()
    for face in o.data.polygons:face.use_smooth=True
    o.data.normals_split_custom_set(corner_normals[indices].reshape(-1,3).tolist())
    adopt(o,pid,material,'selected original Tripo triangles with original UVs; local seam hidden by replacement solids')
    o['retainedSourceTriangles']=len(indices);o['sourceSha256']=EXPECTED
    RECORDS.append({'mesh':name,'sourceTriangles':len(indices),'translationNative':list(translation),'materialRetained':material.name.startswith('tripo_')})
    return o

def build():
    assert sha(SOURCE)==EXPECTED,'Original Tripo candidate changed'
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE));source=next(o for o in bpy.context.scene.objects if o.type=='MESH');arrays=source_arrays(source)
    tripo=source.data.materials[0]
    # Remove redundant imported image nodes only when image, UV source and sampling match.
    canonical={}
    for node in list(tripo.node_tree.nodes):
        if node.type!='TEX_IMAGE' or not node.image or node.inputs['Vector'].is_linked:continue
        key=(node.image.name,node.interpolation,node.extension,node.projection)
        if key in canonical:
            keeper=canonical[key]
            for output in node.outputs:
                for link in list(output.links):tripo.node_tree.links.new(keeper.outputs[output.name],link.to_socket)
            tripo.node_tree.nodes.remove(node)
        else:canonical[key]=node
    grip=tripo.copy();grip.name='tripo_grips_refined'
    bsdf=next(n for n in grip.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    color_input=bsdf.inputs['Base Color'];color_source=color_input.links[0].from_socket
    multiply=grip.node_tree.nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;multiply.inputs[2].default_value=(.72,.72,.72,1)
    grip.node_tree.links.new(color_source,multiply.inputs[1]);grip.node_tree.links.new(multiply.outputs[0],color_input)
    metal_input=bsdf.inputs['Metallic'];metal_source=metal_input.links[0].from_socket
    metal_factor=grip.node_tree.nodes.new('ShaderNodeMath');metal_factor.operation='MULTIPLY';metal_factor.inputs[1].default_value=.62
    grip.node_tree.links.new(metal_source,metal_factor.inputs[0]);grip.node_tree.links.new(metal_factor.outputs[0],metal_input)
    grip['repairBaseColorFactor']=.72;grip['repairMetallicFactor']=.62
    paint=mat('Repair_paint',(.78,.785,.76),.34)
    black=mat('Repair_satin_black',(.012,.015,.018),.27,.65)
    rubber=mat('Repair_rubber',(.012,.015,.016),.72)
    chrome=mat('Repair_bright_metal',(.48,.52,.55),.24,.9)
    glass=mat('Repair_clear_glass',(.965,.987,.97),.035,trans=1,ior=1.52)
    optic=mat('Repair_optical_sheet',(.80,.85,.79),.045,trans=.98,ior=1.49)
    emitter=mat('Repair_internal_light_emitter',(1,.69,.32),.42,emission=2.1)
    amber=mat('Repair_amber_switch_button',(.82,.30,.045),.28)
    marking=mat('Repair_switch_marking',(.94,.94,.88),.5)
    pivots={'base':(0,0,0),'frame':(-.461,0,.42),'light':(CX,0,.350),'polarizer':(CX,0,.455),'stage':(CX,0,.495),'analyzer':(CX,0,.947),'conoscope':(-.1974,-.249,.7273),'powerSwitch':(.478,0,.219)}
    for pid,loc in pivots.items():part(pid,loc)
    # Hollow base with a real roof aperture; optical illumination begins inside.
    base=cube('Base_clean_powder_coat','base',(-.003,0,.246),(.942,.628,.358),paint,0)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(-.003,0,.246));cavity=bpy.context.object;cavity.dimensions=(.914,.600,.316)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);boolean(base,cavity,'DIFFERENCE')
    bpy.ops.mesh.primitive_cylinder_add(vertices=192,radius=.164,depth=.12,location=(CX,0,.427));boolean(base,bpy.context.object,'DIFFERENCE')
    bpy.ops.mesh.primitive_cube_add(size=1,location=(.471,0,.219));socket=bpy.context.object;socket.dimensions=(.050,.056,.122)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);boolean(base,socket,'DIFFERENCE')
    normals(base);bevel(base,.003,4)
    base['throughHole']=True;base['apertureRadius']=.164;base['internalCavity']=True
    base['evidence']='Internal light location and side power button confirmed by user; housing details schematic'
    # The raised rim belongs to the base exit port, not to the light source.
    ring('Base_top_open_light_port','base',(CX,0,.438),[(.164,-.015),(.193,-.015),(.196,-.008),(.196,.015),(.164,.015)],black)

    c=arrays[3];x,y,z=c.T
    for fx in (-.409,.398):
        for fy in (-.252,.252):
            cylinder('Foot_regular_rubber','base',(fx,fy,.036),.0545,.072,rubber,edge=.007,segments=96)
    make_frame(paint)

    # User-confirmed power control on the visible end/side face of the base.
    bezel=cylinder('Side_power_switch_bezel','base',(.471,0,.219),.100,.010,black,axis=(1,0,0),edge=.002)
    bezel.scale.y=.82
    button=cube('Side_power_switch_button','powerSwitch',(.480,0,.219),(.011,.050,.119),amber,.007)
    button['interactionRole']='power-toggle';button['functionalIdentity']='power switch confirmed by user'
    # An authored power symbol makes the click target legible in close views.
    symbol_verts=[];symbol_faces=[];segments=56
    for i in range(segments+1):
        angle=math.radians(42)+(math.tau-math.radians(84))*i/segments
        for radius in (.010,.012):
            symbol_verts.append((.48565,radius*math.sin(angle),.219+radius*math.cos(angle)))
    for i in range(segments):symbol_faces.append((i*2,i*2+1,i*2+3,i*2+2))
    symbol=raw_mesh('Power_symbol_arc',symbol_verts,symbol_faces);adopt(symbol,'powerSwitch',marking);symbol['interactionRole']='power-toggle'
    bar=cube('Power_symbol_bar','powerSwitch',(.4857,0,.229),(.0004,.0022,.012),marking,.0002);bar['interactionRole']='power-toggle'
    for sign in (-1,1):
        cylinder('Switch_fastener_'+str(sign),'base',(.478,sign*.060,.219),.008,.005,chrome,axis=(1,0,0),edge=.0006,segments=48)
        cube('Switch_screw_slot_'+str(sign),'base',(.481,sign*.060,.219),(.0008,.010,.0018),black,.00015)

    # Coaxial optical stack. Original lower center is translated by a small fit offset.
    upper_r=np.sqrt((x-.1735)**2+y*y)
    extract('Tripo_analyzer_grip_detail','analyzer',(z>.9235)&(upper_r>.182)&(upper_r<.218),arrays,grip,(CX-.1735,0,0))
    ring('Analyzer_regular_open_body','analyzer',(CX,0,.947),[(.160,-.0235),(.197,-.0235),(.197,-.021),(.184,-.021),(.184,.021),(.160,.021)],black)
    sheet=cylinder('Analyzer_independent_glass','analyzer',(CX,0,.941),.162,.004,optic,edge=.00045);sheet['opticalRole']='analyzer-sheet'
    low_r=np.sqrt((x-.183)**2+y*y)
    extract('Tripo_stage_grip_detail','stage',(z>.474)&(z<.527)&(low_r>.177)&(low_r<.242),arrays,grip,(CX-.183,0,0))
    # A compact recessed lighting module, entirely within the hollow base.
    # Its internals are a teaching envelope, not an invented manufacturing drawing.
    cylinder('Internal_light_module_body','light',(CX,0,.349),.150,.050,black,edge=.003)
    ring('Internal_light_module_recess','light',(CX,0,.376),[(.142,-.002),(.150,-.002),(.150,.004),(.142,.004)],black)
    light=cylinder('Internal_light_emitting_surface','light',(CX,0,.377),.141,.003,emitter,edge=.0006)
    light['opticalRole']='emitter';light['locationRole']='inside-base'
    PARTS['light']['installation']='fixed inside base; not an external optical sheet'
    PARTS['light']['evidence']='Location confirmed by user; emitter module form is schematic'

    ring('Fixed_polarizer_open_seat','polarizer',(CX,0,.458),[(.163,-.005),(.195,-.005),(.198,.007),(.164,.007)],black)
    sheet=cylinder('Fixed_lower_polarizer_glass','polarizer',(CX,0,.459),.164,.003,optic,edge=.0003);sheet['opticalRole']='polarizer-sheet'
    ring('Stage_regular_open_body','stage',(CX,0,.496),[(.164,-.023),(.218,-.023),(.218,-.019),(.179,-.019),(.179,.028),(.165,.028)],black)
    support=cylinder('Stage_clear_sample_support','stage',(CX,0,.515),.164,.003,glass,edge=.0004);support['opticalRole']='clear-support';support['evidence']='transparent specimen support is a teaching approximation, not measured construction'

    # Retain the characteristic handle's original silhouette; replace its opaque disc.
    handlemask=(x>-.244)&(x<-.171)&(y>-.288)&(y<-.220)&(z>.427)&(z<.660)
    extract('Tripo_retained_conoscope_handle','conoscope',handlemask,arrays,tripo)
    ring('Conoscope_regular_open_ring','conoscope',(-.1974,-.249,.7273),[(.0405,-.019),(.074,-.019),(.0798,-.013),(.0798,.013),(.073,.019),(.0405,.019)],black,axis=(0,-1,0),segments=144)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96,ring_count=48,radius=.0408,location=(-.1974,-.249,.7273));sphere=bpy.context.object;sphere.name='Conoscope_clear_lens';sphere.scale=(1,1,1)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in sphere.data.polygons:p.use_smooth=True
    adopt(sphere,'conoscope',glass);sphere['opticalRole']='conoscope-lens';sphere['evidence']='visually fitted optical element, no optical prescription'
    bpy.data.objects.remove(source,do_unlink=True)
    bpy.context.view_layer.update()
    return pivots

def save_export(pivots):
    bpy.context.scene.unit_settings.system='NONE'
    for o in bpy.context.selected_objects:o.select_set(False)
    for o in MESHES:
        if not o.get('retainedSourceTriangles'):
            # Constant analytic materials need no UVs; collapsed bevel UVs can
            # otherwise produce invalid zero tangents in the glTF exporter.
            for layer in list(o.data.uv_layers):o.data.uv_layers.remove(layer)
            o.modifiers.new('Export triangulation', 'TRIANGULATE')
    for o in list(PARTS.values())+MESHES:o.select_set(True)
    bpy.context.view_layer.objects.active=MESHES[0]
    # GLB + working blend retain editable modifiers and group origins.
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'repaired.blend'))
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'repaired.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_tangents=True,export_animations=False,export_cameras=False,export_lights=False,export_keep_originals=False,export_image_quality=100)
    # Blender 5.2 omits this constant MixRGB color multiplier while preserving the
    # unmodified embedded image. Write the equivalent standard glTF factor explicitly;
    # BIN/image bytes remain untouched and the Blender node graph matches the result.
    glb_path=ROOT/'repaired.glb';raw=glb_path.read_bytes();json_len=struct.unpack_from('<I',raw,12)[0]
    document=json.loads(raw[20:20+json_len]);grip_material=next(m for m in document['materials'] if m['name']=='tripo_grips_refined')
    grip_material['pbrMetallicRoughness']['baseColorFactor']=[.72,.72,.72,1]
    assert len(document.get('images',[]))==3,'Source textures must survive export'
    encoded=json.dumps(document,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);tail=raw[20+json_len:]
    glb_path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)
    manifest={'id':'polariscope-tripo-repair-v2','version':'repair-2','model':'repaired.glb','source':'../candidate.glb','sourceSha256':EXPECTED,'sha256':sha(ROOT/'repaired.glb'),'units':'uncalibrated source model units','dimensionsCalibrated':False,'teachingOpticsSimulated':False,'parts':[],'retainedGeometry':RECORDS,'materialAdjustment':{'gripBaseColorFactor':.72,'gripMetallicFactor':.62,'handleOriginalMaterial':True,'texturePixelValuesUnchanged':True},'changes':['Rebuilt regular base and continuous folded support with actual optical aperture','Removed unreferenced opposite-end window and invented shell seams','Kept original Tripo grip detail and handle geometry with UVs','Light source recessed inside hollow base, shining through real top aperture into lower polarizer','User-confirmed side power button with shared on/off interaction'],'materialReference':'https://docs.blender.org/manual/en/5.2/addons/scene_gltf2.html','createdAt':datetime.now(timezone.utc).isoformat()}
    manifest['powerControl']={'partId':'powerSwitch','pressOffset':[-.0035,0,0]}
    # 2026-10-06 用户确认：支架与底座为同一金属外壳；下偏光片固定、与载物台分开，只转载物台。
    manifest['integralShell']={'meshes':['Base_clean_powder_coat','Frame_continuous_folded_shell'],'material':'white-coated sheet metal, one piece with the base','confirmedBy':'user 2026-10-06'}
    manifest['mechanics']={'lowerPolarizer':'fixed, separate from the stage','stage':'rotates independently','confirmedBy':'user 2026-10-06'}
    manifest['internalLight']={'partId':'light','baseShellMesh':'Base_clean_powder_coat','remainsInsideDuringExplode':True,'opticalPath':['Internal_light_emitting_surface','Base_top_open_light_port','Fixed_lower_polarizer_glass'],'emitterHeightNative':.377,'baseTopHeightNative':.425,'exitApertureRadius':.164,'construction':'schematic module; location and light path confirmed by user 2026-10-05'}
    for pid,pivot in pivots.items():
        manifest['parts'].append({'id':pid,'label':LABELS[pid],'node':'Polariscope_'+pid,'pivot':delivery(pivot),'rotationAxisLocal':[0,1,0],'rotatable':pid in ('stage','analyzer'),'explodeOffset':EXPLODE[pid],**({'integralWith':'base'} if pid=='frame' else {})})
    write(ROOT/'manifest.json',manifest)
    print('REPAIR_COMPLETE '+str(ROOT/'repaired.glb'),flush=True)
    assert sha(SOURCE)==EXPECTED

if __name__=='__main__':
    pivots=build();save_export(pivots)
