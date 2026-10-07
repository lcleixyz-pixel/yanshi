"""Rebuild a source-referenced gem microscope teaching asset.
Run from anywhere: Blender --background --python this_file.py -- [--candidate PATH] [--render]
All default paths resolve relative to this script, never a developer's machine.
No photographic textures or trademarks are copied into the web model.
"""
import bpy, bmesh, math, json, hashlib, sys, argparse
from pathlib import Path
from mathutils import Vector
from math import sin, cos, pi

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT/'assets-source/gem-microscope'
OUT = ROOT/'public/assets/3d/gem-microscope/structure-v1'
WORK = SOURCE/'tripo-trials/2026-10-07/repair-v1'
parser=argparse.ArgumentParser()
parser.add_argument('--candidate',type=Path)
parser.add_argument('--render',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
WORK.mkdir(parents=True,exist_ok=True); OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name!='Collection': bpy.data.collections.remove(c)
scene=bpy.context.scene
scene.unit_settings.system='NONE'
parts=[]; meshes=[]

def mat(name,color,metal=0,rough=.35,trans=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    p.inputs['Transmission Weight'].default_value=trans
    if trans:p.inputs['IOR'].default_value=1.48
    return m
ivory=mat('Satin warm white coated housing',(.78,.81,.79),.18,.27)
black=mat('Satin graphite metal',(.021,.027,.032),.42,.3)
rubber=mat('Matte black elastomer',(.012,.015,.017),0,.55)
chrome=mat('Brushed steel',(.51,.56,.59),.9,.2)
glass=mat('Optical glass - surface appearance only',(.045,.095,.10),.05,.1,.8)
irisMat=mat('Dark iris blades - teaching schematic',(.095,.108,.118),.75,.3)
gold=mat('Warm darkfield well reflector - schematic',(.33,.16,.047),.74,.27)
white=mat('Frosted illumination window',(.86,.9,.93),0,.33,.12)

def group(id,label,pivot,offset=(0,0,0),rot=False,axis=(0,0,1),note=None):
    o=bpy.data.objects.new('GemMicroscope_'+id,None);scene.collection.objects.link(o);o.location=pivot;bpy.context.view_layer.update()
    row={'id':id,'label':label,'node':o.name,'pivot':list(pivot),'rotationAxisLocal':list(axis),'rotatable':rot,'explodeOffset':list(offset),'hotspot':list(pivot)}
    if note:row['note']=note
    parts.append((o,row));return o

def attach(o,parent,material,bevel=0):
    o.data.materials.append(material);bpy.context.view_layer.objects.active=o
    if bevel:
        mod=o.modifiers.new('Manufactured edge radius','BEVEL');mod.width=bevel;mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if o.type=='MESH':
        for p in o.data.polygons:p.use_smooth=True
        try:
            mod=o.modifiers.new('Stable surface normals','WEIGHTED_NORMAL');mod.keep_sharp=True
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception:pass
    o.parent=parent;o.matrix_parent_inverse=parent.matrix_world.inverted();meshes.append(o);return o

def mesh(name,verts,faces,parent,material,bevel=0):
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update()
    o=bpy.data.objects.new(name,m);scene.collection.objects.link(o);return attach(o,parent,material,bevel)

def box(name,loc,dim,parent,material,bevel=.02):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=dim
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return attach(o,parent,material,bevel)

def cyl(name,loc,radius,depth,parent,material,axis=(0,0,1),bevel=.012,n=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=radius,depth=depth,location=loc)
    o=bpy.context.object;o.name=name;o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector(axis).to_track_quat('Z','Y')
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);return attach(o,parent,material,bevel)

def annulus(name,loc,outer,inner,height,parent,material,axis=(0,0,1),n=96):
    verts=[];faces=[];q=Vector(axis).to_track_quat('Z','Y');p=Vector(loc)
    for z,r in [(-height/2,outer),(height/2,outer),(height/2,inner),(-height/2,inner)]:
        for i in range(n):verts.append(tuple(p+q@Vector((r*cos(i*2*pi/n),r*sin(i*2*pi/n),z))))
    for j in range(4):
        for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,((j+1)%4)*n+(i+1)%n,((j+1)%4)*n+i))
    return mesh(name,verts,faces,parent,material,.005)

def loft(name,levels,center,parent,material,n=128):
    verts=[];faces=[]
    for z,rx,ry in levels:
        for i in range(n):verts.append((center[0]+rx*cos(i*2*pi/n),center[1]+ry*sin(i*2*pi/n),z))
    for j in range(len(levels)-1):
        for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    faces.append(tuple(reversed(range(n))));faces.append(tuple((len(levels)-1)*n+i for i in range(n)))
    return mesh(name,verts,faces,parent,material)

def extruded_profile(name,profile,halfwidth,parent,material,bevel=.04):
    # Polygon is in Y/Z. Capped and manifold; source proportions remain uncalibrated.
    n=len(profile);verts=[(x,y,z) for x in [-halfwidth,halfwidth] for y,z in profile]
    faces=[tuple(reversed(range(n))),tuple(n+i for i in range(n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,verts,faces,parent,material,bevel)

def tube(name,points,r,parent,material,res=6):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=16;c.bevel_depth=r;c.bevel_resolution=res;c.use_fill_caps=True
    s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for b,p in zip(s.bezier_points,points):b.co=p;b.handle_left_type='AUTO';b.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.convert(target='MESH');o=bpy.context.object;o.select_set(False);return attach(o,parent,material)

def knurl(name,loc,r,h,parent,axis=(0,0,1),material=black,n=80):
    q=Vector(axis).to_track_quat('Z','Y');v=[];f=[]
    for z,scale in [(-h/2,.95),(-h/2+.012,1),(h/2-.012,1),(h/2,.95)]:
        for i in range(n):
            rr=r*scale*(1 if i%2==0 else .956);v.append(tuple(Vector(loc)+q@Vector((rr*cos(i*2*pi/n),rr*sin(i*2*pi/n),z))))
    for j in range(3):
        for i in range(n):f.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    f.extend([tuple(reversed(range(n))),tuple(3*n+i for i in range(n))]);return mesh(name,v,f,parent,material)

def subtract(o,cut):
    bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Real through aperture','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut
    bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)

base=group('base','底座',(0,0,.25),(0,0,-.2))
loft('Elliptical lower gasket',[(.025,1.05,.99),(.045,1.13,1.05),(.10,1.14,1.06),(.14,1.12,1.04)],(0,0),base,rubber)
loft('Continuous rounded white base',[(.12,1.11,1.035),(.15,1.17,1.09),(.21,1.19,1.105),(.40,1.19,1.105),(.48,1.16,1.075),(.53,1.08,1.01),(.55,.95,.9)],(0,0),base,ivory)
for x in [-.65,.65]:
    for y in [-.55,.55]:cyl('Rubber support foot',(x,y,.045),.14,.08,base,rubber)
box('Rear black control panel',(0,.80,.56),(.83,.48,.15),base,black,.10)
box('Recessed front switch bezel',(.55,-1.00,.30),(.28,.045,.10),base,black,.024)
box('Power rocker',(.55,-1.025,.30),(.16,.03,.064),base,rubber,.008)

arm=group('arm','镜臂与调焦架',(0,.67,2.35),(0,.55,0),note='公开外观比例重建；倾斜轴及内部齿条不作实测复原。')
box('White lower tilt support',(0,.67,.72),(.65,.62,.49),arm,ivory,.10)
extruded_profile('Continuous sculpted rear arm',[(.52,.68),(.92,.68),(.95,3.72),(.83,3.9),(.46,3.86),(.42,3.63),(-.25,3.50),(-.28,3.24),(.32,3.25),(.49,3.06)],.20,arm,black,.07)
box('Focus rail front cover',(0,.43,2.72),(.28,.095,1.72),arm,black,.018)
for z in [1.9,2.07]:
    cyl('Rail countersunk screw',(0,.371,z),.024,.015,arm,chrome,(0,1,0),.003,32)
# Head cradle has a genuine central opening around the objective housing.
annulus('Objective support cradle',(0,-.14,3.36),.55,.33,.15,arm,black)
box('Cradle rear connection',(0,.30,3.36),(.74,.73,.15),arm,black,.045)

stage=group('stage','悬台',(0,-.13,1.54),(0,-.4,0))
o=box('Rounded floating stage',(0,-.08,1.54),(2.11,1.70,.23),stage,black,.13)
bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=.365,depth=.6,location=(0,-.23,1.54));subtract(o,bpy.context.object)
# Recess is an actual opening, not a black disc painted on the stage.
annulus('Recessed stage bevel',(0,-.23,1.615),.43,.345,.035,stage,black)

well=group('darkfield','暗域照明器与底光',(0,-.23,1.26),(0,0,-.35),note='底光与暗域配置有公开来源；内置光阑、反光腔和遮光体是功能位置教学示意。')
knurl('Darkfield well outer housing',(0,-.23,1.26),.475,.37,well,n=96)
annulus('Well upper throat',(0,-.23,1.47),.43,.30,.06,well,black)
annulus('Recessed warm reflector',(0,-.23,1.405),.31,.23,.095,well,gold)
cyl('Bottom illumination window',(0,-.23,1.28),.235,.028,well,white)
cyl('Central darkfield stop schematic',(0,-.23,1.335),.133,.021,well,black)

iris=group('iris','光阑叶片（固定开度示意）',(0,-.23,1.65),(0,0,.26),False,note='八片叶片保持固定示意开度；不能整体旋转叶片来声称改变孔径。叶片数与驱动连杆未核实。')
iris_control=group('irisControl','光阑操纵环（未关联开度）',(0,-.23,1.65),(0,0,.34),True,note='仅操纵环和手柄可转动；本模型没有叶片开合联动，旋转此节点不会改变孔径。')
annulus('Iris operating annulus',(0,-.23,1.655),.34,.265,.060,iris_control,black)
annulus('Iris chrome rim',(0,-.23,1.691),.308,.265,.008,iris_control,chrome)
# Eight closed overlapping curved lamellae leave a genuine aperture.
for k in range(8):
    a=k*2*pi/8;poly=[]
    for r,angles in [(.266,[0,.10,.22,.34,.47,.60]),(.146,[.60,.47,.34,.22,.10,0])]:
        for theta in angles:poly.append((r*cos(a+theta),-.23+r*sin(a+theta)))
    n=len(poly);z=1.667+k*.00055;v=[(x,y,z+dz) for dz in [-.0015,.0015] for x,y in poly]
    f=[tuple(reversed(range(n))),tuple(n+i for i in range(n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh('Iris schematic lamella %02d'%k,v,f,iris,irisMat)
cyl('Iris adjusting lever',(.365,-.23,1.675),.024,.18,iris_control,chrome,(1,0,0),.005,32)
cyl('Iris lever tip',(.46,-.23,1.675),.038,.07,iris_control,rubber,(1,0,0),.008,32)

clamp=group('gemClamp','宝石夹',(-.32,-.20,1.87),(-.5,-.25,.22),note='可见细夹构型重建；未提供真实关节行程。')
cyl('Clamp pedestal',(-.55,-.07,1.70),.055,.13,clamp,black)
cyl('Clamp swivel bead',(-.55,-.07,1.795),.052,.07,clamp,chrome)
tube('Clamp support rod',[(-.55,-.07,1.78),(-.41,-.14,1.89),(-.13,-.24,1.84)],.014,clamp,chrome,4)
for s in [-1,1]:
    tube('Spring gem jaw '+str(s),[(-.19,-.24+s*.025,1.85),(-.07,-.24+s*.057,1.81),(.015,-.24+s*.029,1.79),(.034,-.24+s*.013,1.815)],.008,clamp,chrome,4)
cyl('Clamp thumb sleeve',(-.37,-.11,1.89),.03,.1,clamp,black,(1,0,-.15),.006,32)

body=group('zoomBody','体视变倍光学体',(0,-.14,3.78),(0,-.30,.3),note='外壳与物镜外观示意；内部双光路和变倍凸轮未复原。')
# White housing has a profiled inclined shoulder, fine lower seam and shallow edge radii.
extruded_profile('White lower optical housing',[(-.57,3.48),(.28,3.48),(.312,3.668),(-.568,3.668)],.46,body,ivory,.047)
extruded_profile('White contoured upper housing',[(-.568,3.676),(.312,3.676),(.35,3.81),(.19,4.04),(-.23,3.99),(-.56,3.87)],.46,body,ivory,.047)
loft('Tapered black objective bell',[(3.11,.23,.23),(3.13,.30,.30),(3.20,.32,.32),(3.29,.41,.41),(3.46,.42,.42)],(0,-.14),body,black,96)
annulus('Lower objective silver retaining ring',(0,-.14,3.12),.238,.19,.04,body,chrome)
cyl('Objective optical face',(0,-.14,3.112),.185,.016,body,glass)
# No invented manufacturer logo or numerical magnification scale.

focus=group('focusKnob','调焦旋钮',(0,.69,3.59),(.55,0,0),True,(1,0,0),note='绕 X 轴旋转；头部平移行程仅可由应用另设教学约定。')
for s in [-1,1]:
    cyl('Focus axle '+str(s),(s*.31,.69,3.59),.11,.35,focus,black,(1,0,0))
    knurl('Large focus grip '+str(s),(s*.49,.69,3.59),.255,.28,focus,(1,0,0),n=80)
    cyl('Focus cap '+str(s),(s*.639,.69,3.59),.219,.016,focus,rubber,(1,0,0),.008)
zoom=group('zoomKnob','变倍旋钮',(0,-.09,3.70),(.57,-.1,.05),True,(1,0,0),note='旋钮轴有外观依据；不赋予未经验证的倍率公式。')
for s in [-1,1]:
    knurl('Zoom control grip '+str(s),(s*.53,-.09,3.70),.178,.20,zoom,(1,0,0),n=48)
    cyl('Zoom control cap '+str(s),(s*.636,-.09,3.70),.159,.018,zoom,rubber,(1,0,0),.01)

ocular_axis=Vector((0,.66,.75)).normalized()
for side,s in [('eyepieceLeft',-1),('eyepieceRight',1)]:
    start=Vector((s*.265,.00,4.00))
    ocular=group(side,'左目镜' if s<0 else '右目镜',tuple(start+ocular_axis*.60),(s*.38,-.20,.30),False,tuple(ocular_axis))
    cyl('White binocular prism housing '+str(s),tuple(start+ocular_axis*.16),.224,.43,ocular,ivory,ocular_axis,.035)
    cyl('Black ocular sleeve '+str(s),tuple(start+ocular_axis*.405),.18,.18,ocular,black,ocular_axis,.012)
    annulus('Polished ocular collar '+str(s),tuple(start+ocular_axis*.465),.183,.145,.026,ocular,chrome,ocular_axis)
    knurl('Diopter grip '+str(s),tuple(start+ocular_axis*.56),.181,.16,ocular,ocular_axis,n=96)
    cyl('Eyepiece barrel '+str(s),tuple(start+ocular_axis*.70),.179,.15,ocular,black,ocular_axis,.012)
    annulus('Soft eyecup '+str(s),tuple(start+ocular_axis*.82),.205,.139,.125,ocular,rubber,ocular_axis)
    cyl('Recessed ocular glass '+str(s),tuple(start+ocular_axis*.82),.138,.016,ocular,glass,ocular_axis,.002)

photo=group('photoTube','摄影口',(0,-.32,4.47),(.4,.3,.4),note='参考实物可见附件；不把它当作第三个目镜。')
cyl('White camera port riser',(0,-.32,4.13),.17,.30,photo,ivory)
cyl('Black photo tube',(0,-.32,4.48),.157,.46,photo,black,(0,0,1),.012)
annulus('Camera mount collar',(0,-.32,4.75),.121,.088,.115,photo,chrome)
cyl('Photo port recessed glass',(0,-.32,4.715),.085,.012,photo,glass)
knurl('Photo tube set screw',(.17,-.32,4.59),.048,.05,photo,(1,0,0),n=32)

light=group('topLight','鹅颈顶灯',(-.77,-.37,2.64),(-.55,-.25,.25),note='柔性鹅颈以固定曲线表示，不设置虚假的单一刚体转轴。')
cyl('Top light plug',(-1.07,-.38,1.51),.070,.21,light,chrome,(1,0,0))
tube('Broad light flexible gooseneck',[(-1.15,-.38,1.51),(-1.65,-.55,1.66),(-1.67,-.52,2.26),(-1.33,-.41,2.72),(-.96,-.32,2.92)],.033,light,black)
# Wide lamp head with rounded shell and inset diffusing window, aimed at the gem stage.
lamp_dir=Vector((.36,.06,-.86)).normalized();lamp_center=Vector((-.91,-.29,2.85))
lamp=box('Wide rounded top lamp shell',tuple(lamp_center),(.80,.48,.30),light,black,.11)
q=lamp_dir.to_track_quat('Z','Y');lamp.rotation_mode='QUATERNION';lamp.rotation_quaternion=q
window=box('Top lamp frosted window',tuple(lamp_center+lamp_dir*.155),(.66,.35,.015),light,white,.07);window.rotation_mode='QUATERNION';window.rotation_quaternion=q
for x in [-.17,.17]:
    p=lamp_center+q@Vector((x,.16,.025));cyl('Top lamp mounting screw',tuple(p),.018,.012,light,chrome,tuple(q@Vector((0,1,0))),.003,24)

guide=group('lightGuide','细鹅颈光导',(.63,-.03,2.04),(.50,.0,.18))
cyl('Fiber guide plug',(.55,-.90,1.50),.055,.16,guide,chrome,(0,1,0))
tube('Fine flexible light guide',[(.55,-.98,1.5),(1.06,-.78,1.62),(.99,-.03,2.33),(.68,.07,2.43),(.30,-.13,2.05)],.018,guide,black,5)
a=Vector((-.4,-.2,-.5)).normalized();cyl('Fiber guide tip',(.26,-.15,2.00),.031,.16,guide,black,a,.006)
cyl('Fiber guide glass tip',tuple(Vector((.26,-.15,2.00))+a*.083),.022,.008,guide,glass,a,.002,32)

# Normalize all polygon winding and certify each separate closed manufactured surface.
check=[]
for o in meshes:
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data)
    check.append({'mesh':o.name,'vertices':len(bm.verts),'faces':len(bm.faces),'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonManifoldEdges':sum(not e.is_manifold for e in bm.edges)})
    bm.free()

# Parent transforms use their own pivot; GLB coordinates convert Blender XYZ -> X Z -Y.
def gl(v):return [round(v[0],6),round(v[2],6),round(-v[1],6)]
manifest={'id':'gem-microscope-structure-v1','version':'structure-1','model':'model.glb','units':'uncalibrated teaching model units','dimensionsCalibrated':False,'teachingOpticsSimulated':False,'parts':[],'coordinates':'glTF right-handed: X right, Y up, Z toward front','construction':'Reference-constrained parametric reconstruction, with candidate used for appearance review; no calibrated optics or manufacturer CAD.','sourceCandidate':None}
for obj,row in parts:
    for key in ['pivot','rotationAxisLocal','explodeOffset','hotspot']:row[key]=gl(row[key])
    if row['id']=='zoomBody':row['translationAxisLocal']=[0,1,0];row['translationRangeVerified']=False
    manifest['parts'].append(row)
manifest['irisMechanics']={'fixedBladePartId':'iris','rotatingControlPartId':'irisControl','controlAngleChangesAperture':False,'bladeLinkageModeled':False,'note':'操纵环的旋转只表达其操作轴；实际开孔变化必须另建可验证叶片联动，不能转动整个叶片组冒充。'}
# Keep raw candidate intact, imported into a hidden reference collection in the editable master only.
if args.candidate:
    candidate=args.candidate.resolve();manifest['sourceCandidate']=str(candidate.relative_to(ROOT)) if candidate.is_relative_to(ROOT) else candidate.name
    manifest['sourceSha256']=hashlib.sha256(candidate.read_bytes()).hexdigest()
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(candidate));added=set(bpy.data.objects)-before
    refs=bpy.data.collections.new('SOURCE_Tripo_candidate_UNMODIFIED');scene.collection.children.link(refs)
    for o in added:
        for col in list(o.users_collection):col.objects.unlink(o)
        refs.objects.link(o);o.hide_render=True;o.hide_set(True)
    refs.hide_render=True;refs.hide_viewport=True

bpy.ops.object.select_all(action='DESELECT')
for o,_ in parts:o.select_set(True)
for o in meshes:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'model.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_extras=True)
manifest['sha256']=hashlib.sha256((OUT/'model.glb').read_bytes()).hexdigest();manifest['byteLength']=(OUT/'model.glb').stat().st_size
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(WORK/'mesh-check.json').write_text(json.dumps({'checkedMeshes':len(check),'meshes':check,'allClosed':all(x['nonManifoldEdges']==0 for x in check),'dimensionsCalibrated':False},ensure_ascii=False,indent=2)+'\n')
# Product rendering is only lighting/camera, not baked into the web material.
world=bpy.data.worlds.new('Neutral studio');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.30,.34,.39,1);world.node_tree.nodes['Background'].inputs[1].default_value=.4

def area(name,loc,power,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,2.5))-o.location).to_track_quat('-Z','Y').to_euler()
area('Large soft key',(3,-5,8),900,5,(.91,.95,1));area('White edge strip',(-4,1,6),1100,4,(1,.94,.86));area('Front fill',(-1,-4,3),300,3,(1,1,1))
camera_data=bpy.data.cameras.new('Product view');camera=bpy.data.objects.new('Product view',camera_data);scene.collection.objects.link(camera);scene.camera=camera
camera_data.type='ORTHO';camera_data.ortho_scale=5.95;camera_data.lens=55
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1100;scene.render.resolution_y=1250;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.view_settings.view_transform='AgX';scene.render.image_settings.color_mode='RGBA'

def viewpoint(loc,scale=5.95):
    camera.location=loc;camera.rotation_euler=(Vector((0,-.02,2.45))-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.ortho_scale=scale
viewpoint((7,-10,7.2));bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'gem-microscope-master.blend'))
if args.render:
    views={'poster':(7,-10,7.2),'front':(0,-12,2.45),'rear':(0,12,2.45),'left':(-12,0,2.45),'right':(12,0,2.45),'top':(0,-.001,15),'bottom':(0,-.001,-12),'reference-angle':(7,-10,7.2)}
    for name,loc in views.items():
        viewpoint(loc);scene.render.filepath=str(OUT/'poster.png' if name=='poster' else WORK/(name+'.png'));bpy.ops.render.render(write_still=True)
# Reimport in a genuinely empty scene, including removal of hidden reference objects.
for old in list(bpy.data.objects):bpy.data.objects.remove(old,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/'model.glb'))
node_names={o.name for o in bpy.data.objects};missing=[p['node'] for p in manifest['parts'] if p['node'] not in node_names]
report={'missingNamedParts':missing,'expectedParts':len(parts),'importedMeshObjects':sum(o.type=='MESH' for o in bpy.data.objects),'byteLength':manifest['byteLength'],'below10MB':manifest['byteLength']<=10_000_000,'sourceUnchanged':not args.candidate or hashlib.sha256(args.candidate.read_bytes()).hexdigest()==manifest['sourceSha256'],'allSourceMeshesClosed':all(x['nonManifoldEdges']==0 for x in check),'formatValidation':'Run inspect-import.mjs separately; this file only covers Blender geometry/reimport.'}
(WORK/'blender-reimport-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('GEM_MICROSCOPE_COMPLETE',json.dumps(report))
