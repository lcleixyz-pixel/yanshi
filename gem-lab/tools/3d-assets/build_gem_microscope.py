"""Rebuild a source-referenced gem microscope teaching asset.
Run from anywhere: Blender --background --python this_file.py -- [--candidate PATH] [--render]
All default paths resolve relative to this script, never a developer's machine.
No photographic textures or trademarks are copied into the web model.
"""
import bpy, bmesh, math, json, hashlib, sys, argparse, shutil
from pathlib import Path
from mathutils import Vector, Matrix
from math import sin, cos, pi

# Shared pure-Python parameters are the source of meshes and round-4 checks.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import microscope_round3_geometry as geo

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT/'assets-source/gem-microscope'
OUT = ROOT/'public/assets/3d/gem-microscope/structure-v1'
WORK = SOURCE/'tripo-trials/2026-10-07/repair-v4'
UNIT = geo.UNIT  # approximately 0.4 m high; authoring units are not measurements.
parser=argparse.ArgumentParser()
parser.add_argument('--candidate',type=Path)
parser.add_argument('--render',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
WORK.mkdir(parents=True,exist_ok=True); OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name!='Collection': bpy.data.collections.remove(c)
scene=bpy.context.scene
scene.unit_settings.system='METRIC';scene.unit_settings.length_unit='METERS'
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
irisMat=mat('Dark matte bevelled iris metal - teaching schematic',(.018,.022,.026),.72,.66)
reflectorMetal=mat('Neutral polished aluminium reflector - schematic',(.68,.70,.72),.95,.16)
white=mat('Frosted illumination window',(.86,.9,.93),0,.68,.30)
polarizingGlass=mat('Neutral polarizing filter - appearance only',(.18,.20,.21),0,.15,.82)

def emission_material(name,color,on):
    material=mat(name,tuple(x*.32 for x in color),0,.45)
    shader=material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Emission Color'].default_value=(*color,1)
    # Export a nonzero factor for each independently switchable mesh. A zero
    # strength is omitted by Blender glTF exporter; runtime defaults are applied
    # from manifest, and render/master defaults are restored after GLB export.
    shader.inputs['Emission Strength'].default_value=3
    return material
bottomEmission=emission_material('Bottom LED independently switched',[1,.84,.58],True)
topEmission=emission_material('Top diffuser independently switched',[1,.95,.86],False)
fiberEmission=emission_material('Fiber tip independently switched',[.9,.96,1],False)

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

def plan_profile(name,profile,z,height,parent,material,bevel=.04):
    n=len(profile);v=[(x,y,z+dz) for dz in [-height/2,height/2] for x,y in profile]
    f=[tuple(reversed(range(n))),tuple(n+i for i in range(n))]
    f += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,v,f,parent,material,bevel)

def tube(name,points,r,parent,material,res=6,polyline=False):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=16;c.bevel_depth=r;c.bevel_resolution=res;c.use_fill_caps=True
    if polyline:
        s=c.splines.new('POLY');s.points.add(len(points)-1)
        for b,p in zip(s.points,points):b.co=(*p,1)
    else:
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

def fluted_annulus(name,loc,outer,inner,height,parent,n=64):
    # Closed fluted wall with a true open centre for the internal darkfield/illuminator.
    v=[];f=[]
    for z,r,fluted in [(-height/2,outer,True),(height/2,outer,True),(height/2,inner,False),(-height/2,inner,False)]:
        for i in range(n):
            rr=r*(1 if not fluted or i%2==0 else .925)
            v.append((loc[0]+rr*cos(i*2*pi/n),loc[1]+rr*sin(i*2*pi/n),loc[2]+z))
    for j in range(4):
        for i in range(n):f.append((j*n+i,j*n+(i+1)%n,((j+1)%4)*n+(i+1)%n,((j+1)%4)*n+i))
    return mesh(name,v,f,parent,black,.008)

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

arm=group('arm','粗 C 形镜臂与后立柱',(0,.76,2.35),(0,.55,0),note='粗 C 形黑镜臂和后白色立柱依据公开外观；倾斜轴与内部齿条未实测。')
box('White lower tilt support',(0,.67,.72),(.65,.62,.49),arm,ivory,.10)
box('White rear column segment',(0,1.025,1.88),(.58,.20,2.16),arm,ivory,.065)
extruded_profile('Continuous C arm with open inner recess',geo.C_ARM_PROFILE,.30,arm,black,.065)
box('Focus rail on rear upright',(0,.705,2.63),(.39,.065,1.17),arm,black,.018)
for z in [2.17,2.34]:
    cyl('Rail countersunk screw',(0,.662,z),.024,.015,arm,chrome,(0,1,0),.003,32)
carriage=group('focusCarriage','黑色横支架与升降滑架',(0,.25,3.35),(0,.18,.08),note='随调焦旋钮驱动光学头沿立柱上下移动；示意齿条传动，行程未实测。')
annulus('Thick objective support cradle',(0,-.14,3.35),.575,.325,.22,carriage,black)
box('Black upper forward head bracket',(0,.35,3.35),(.86,.89,.22),carriage,black,.07)
box('Focus moving slide',(0,.55,3.25),(.74,.22,.69),carriage,black,.025)

stage=group('stage','加厚圆角长方形载物台',(0,-.13,1.54),(0,-.4,0),note='本轮按用户确认保留长方形台面。')
o=plan_profile('Thick rounded rectangular stage',geo.STAGE_PROFILE,geo.STAGE_Z,geo.STAGE_THICKNESS,stage,black,.12)
# Taper the through-hole downwards; a straight bore clips the upper reflector rays at the thick stage underside.
bpy.ops.mesh.primitive_cone_add(vertices=128,radius1=geo.STAGE_CUTTER_RADII[0],radius2=geo.STAGE_CUTTER_RADII[1],depth=geo.STAGE_CUTTER_Z[1]-geo.STAGE_CUTTER_Z[0],location=(0,geo.CENTER_Y,sum(geo.STAGE_CUTTER_Z)/2));subtract(o,bpy.context.object)
annulus('Recessed stage bevel',(0,geo.CENTER_Y,1.68),.43,geo.WELL_RADIUS,.035,stage,black)

well=group('darkfield','台下灯室外壳与安装法兰',(0,geo.CENTER_Y,1.15),(0,0,-.35),note='悬装在载物台下的独立灯室，不是白色承重底座；有封底灯座与上安装法兰。内部构造为通用教学示意，不是 KRÜSS 厂家剖面。')
well_shell=fluted_annulus('Broad hollow darkfield vertical fluted cylinder',(0,geo.CENTER_Y,1.14),.62,.48,.65,well)
annulus('Well upper throat',(0,geo.CENTER_Y,geo.THROAT_Z),.48,geo.WELL_RADIUS,geo.THROAT_THICKNESS,well,black)
annulus('Upper chamber mounting flange',(0,geo.CENTER_Y,geo.MOUNT_FLANGE_Z),geo.MOUNT_FLANGE_OUTER,geo.MOUNT_FLANGE_INNER,geo.MOUNT_FLANGE_DEPTH,well,black)
# The mechanical slot is a real opening so the independent lever can slide.
slot=box('Temporary brightfield lever travel slot',(.18,geo.CENTER_Y-.55,geo.STOP_Z),(.67,.32,.072),well,black,.018)
meshes.remove(slot);subtract(well_shell,slot)

bottom=group('bottomLight','独立底部光源',geo.SOURCE,(0,0,-.43),note='示意 LED / 卤素出光面；独立自发光网格，可在网页单独开关；不计算照度。')
cyl('Bottom LED ceramic mount',(0,geo.CENTER_Y,geo.SOURCE[2]-.028),.085,.04,bottom,white)
cyl('GemMicroscope_BottomEmission',geo.SOURCE,geo.SOURCE_RADIUS,.008,bottom,bottomEmission,bevel=.001)
reflector=group('reflector','双焦点椭球反射碗',(0,geo.CENTER_Y,geo.ELLIPSOID_Z),(0,0,-.24),note='内侧为绕竖轴旋转的椭球带；底灯在下焦点，样品在上焦点；截断椭球和有限网格均为示意。')
rv,rf=geo.reflector_mesh();mesh('Ellipsoidal two focus reflector',rv,rf,reflector,reflectorMetal)
stop=group('darkfieldStop','可平移暗域挡板',(0,geo.CENTER_Y,geo.STOP_Z),(.40,0,-.05),note='合拢遮住完整底灯至物镜直射锥；平移至侧面后放开中央直射光。')
cyl('Opaque central darkfield baffle',(0,geo.CENTER_Y,geo.STOP_Z),geo.STOP_RADIUS,.015,stop,black,bevel=.004)
# A thin off-axis attachment avoids filling the newly opened central beam.
box('Offset baffle drive tab',(.095,geo.CENTER_Y-.025,geo.STOP_Z),(.032,.05,.013),stop,black,.003)
lever=group('brightfieldLever','亮域切换小拨杆',(.09,geo.CENTER_Y-.52,geo.STOP_Z),(.34,-.14,0),note='与暗域挡板同向平移；亮域仍包含反射碗斜照光。')
box('Brightfield offset drive stem',(.092,geo.CENTER_Y-.345,geo.STOP_Z),(.023,.64,.018),lever,chrome,.003)
box('Brightfield slider thumb pad',(.092,geo.CENTER_Y-.72,geo.STOP_Z),(.12,.11,.062),lever,rubber,.017)

iris=group('iris','十二片倒角哑光虹彩叶片',(0,geo.CENTER_Y,1.724),(0,0,.26),False,note='12 片弧形叶片用不相交薄层叠置；边缘真实小倒角。形变是教学近似，不复原连杆。')
iris_control=group('irisControl','虹彩操纵环与小拨杆',(0,geo.CENTER_Y,1.724),(0,0,.34),True,note='0–90° 驱动 ApertureOpen 0–1；圆孔约 7.5–40 mm，带止位，小拨杆便于辨认。')
annulus('Iris operating annulus',(0,geo.CENTER_Y,1.705),.354,.276,.014,iris_control,black)
annulus('Iris chrome rim',(0,geo.CENTER_Y,1.739),.32,.275,.008,iris_control,chrome)
IRIS_MIN,IRIS_MAX,IRIS_DEFAULT=geo.IRIS_MIN,geo.IRIS_MAX,geo.IRIS_DEFAULT
iris_blades=[]
for k in range(geo.IRIS_COUNT):
    leaf=mesh('GemMicroscope_IrisBlade_%02d'%k,geo.blade_vertices(k,IRIS_MIN),geo.blade_faces(),iris,irisMat)
    leaf.shape_key_add(name='Basis');key=leaf.shape_key_add(name='ApertureOpen')
    for vv,co in zip(key.data,geo.blade_vertices(k,IRIS_MAX)):vv.co=co
    key.value=IRIS_DEFAULT;iris_blades.append(leaf)
cyl('Iris adjusting lever',(.38,geo.CENTER_Y,geo.IRIS_LEVER_Z),geo.IRIS_LEVER_RADIUS,.18,iris_control,chrome,(1,0,0),.003,32)
box('Iris lever tip',(.48,geo.CENTER_Y,geo.IRIS_GRIP_Z),geo.IRIS_GRIP_SIZE,iris_control,rubber,.006)

diffuser=group('diffuser','可推入磨砂漫射板',(geo.FILTER_TRAVEL,geo.CENTER_Y,geo.DIFFUSER_Z),(.48,0,.12),note='向左推入后完整盖住光井，推出后完全离开光井。')
cyl('Frosted sliding diffuser',(geo.FILTER_TRAVEL,geo.CENTER_Y,geo.DIFFUSER_Z),geo.FILTER_RADIUS,.014,diffuser,white,bevel=.006)
annulus('Diffuser thin retaining rim',(geo.FILTER_TRAVEL,geo.CENTER_Y,geo.DIFFUSER_Z),geo.FILTER_RADIUS+.02,geo.FILTER_RADIUS,.014,diffuser,black)
box('Diffuser sliding tab',(geo.FILTER_TRAVEL+.41,geo.CENTER_Y,geo.DIFFUSER_Z),(.15,.075,.033),diffuser,white,.011)
polarizer=group('polarizer','可推入起偏片',(-geo.FILTER_TRAVEL,geo.CENTER_Y,geo.POLARIZER_Z),(-.48,0,.16),note='光阑上方的示意起偏片；偏振轴沿 X，不模拟偏振传输。')
cyl('Sliding polarizer glass',(-geo.FILTER_TRAVEL,geo.CENTER_Y,geo.POLARIZER_Z),geo.FILTER_RADIUS,.011,polarizer,polarizingGlass,bevel=.003)
annulus('Polarizer retaining rim',(-geo.FILTER_TRAVEL,geo.CENTER_Y,geo.POLARIZER_Z),geo.FILTER_RADIUS+.02,geo.FILTER_RADIUS,.014,polarizer,black)
box('Polarizer sliding tab',(-geo.FILTER_TRAVEL-.41,geo.CENTER_Y,geo.POLARIZER_Z),(.15,.075,.033),polarizer,black,.011)
analyzer=group('analyzer','物镜下方可装检偏夹片',(geo.ANALYZER_TRAVEL,geo.CENTER_Y,geo.ANALYZER_Z),(.42,0,-.14),note='随物镜升降；向左推入，检偏轴相对起偏轴为90°；未模拟真实双目成像。')
cyl('Clip on analyzer glass',(geo.ANALYZER_TRAVEL,geo.CENTER_Y,geo.ANALYZER_Z),geo.ANALYZER_RADIUS,.012,analyzer,polarizingGlass,bevel=.003)
annulus('Analyzer clip rim',(geo.ANALYZER_TRAVEL,geo.CENTER_Y,geo.ANALYZER_Z),geo.ANALYZER_RADIUS+.016,geo.ANALYZER_RADIUS,.018,analyzer,black)
box('Analyzer clip handle',(geo.ANALYZER_TRAVEL+.275,geo.CENTER_Y,geo.ANALYZER_Z),(.12,.06,.032),analyzer,black,.009)

lamp_cap=group('lampHousingBase','台下灯室检修底盖',(0,geo.CENTER_Y,geo.LAMP_CAP_Z),(0,0,-.51),note='底盖封住台下灯室的下口，并承托独立灯座；螺钉、接合与拆装关系为教学示意。')
lamp_mount=group('lampMount','灯座与导热支撑',(0,geo.CENTER_Y,geo.LAMP_SOCKET_Z),(0,0,-.46),note='连续连接检修底盖、陶瓷灯托和出光面；位于光源出射平面下方，不伸入通光锥。')
filter_guides=group('filterGuides','台面插片固定导轨',(0,geo.CENTER_Y,1.75),(0,.25,.16),note='漫射板与起偏片沿固定导轨推入；支脚、滑座和孔隙为通用机械示意，未复原厂家附件。')
analyzer_guide=group('analyzerGuide','检偏夹片固定导向架',(0,geo.CENTER_Y,3.075),(.35,.20,-.16),note='固定在光学头下方并随调焦升降；检偏片在导轨上横移，导轨不随插片横移。')
mount_groups={'lampHousingBase':lamp_cap,'lampMount':lamp_mount,'filterGuides':filter_guides,'analyzerGuide':analyzer_guide,
              'diffuser':diffuser,'polarizer':polarizer,'analyzer':analyzer,'reflector':reflector}
for spec in geo.mounting_solids():
    parent=mount_groups[spec['group']];material={'black':black,'chrome':chrome}[spec['material']]
    if spec['type']=='cylinder':
        o=cyl(spec['name'],spec['center'],spec['radius'],spec['depth'],parent,material,spec.get('axis',(0,0,1)),.003,64)
    elif spec['type']=='annulus':o=annulus(spec['name'],spec['center'],spec['outer'],spec['inner'],spec['depth'],parent,material)
    else:o=box(spec['name'],spec['center'],spec['size'],parent,material,.005)
    if 'guideBore' in spec:
        bore=spec['guideBore'];cut=cyl('Temporary guide running bore',bore['center'],bore['radius'],.15,parent,black,(1,0,0),0,48)
        meshes.remove(cut);subtract(o,cut)

clamp=group('gemClamp','宝石夹',(-.32,-.20,1.97),(-.5,-.25,.22),note='夹座避开完整插片行程，支杆重接；夹口与样品位置保留。安装和关节为教学示意，未按厂家校准。')
cyl('Clamp pedestal',(*geo.CLAMP_MOUNT,1.795),.055,.21,clamp,black)
cyl('Clamp swivel bead',(*geo.CLAMP_MOUNT,1.895),.052,.07,clamp,chrome)
tube('Clamp support rod',geo.smooth_path(geo.CLAMP_PATH),.014,clamp,chrome,4,polyline=True)
for s,jaw in zip([-1,1],geo.CLAMP_JAWS):
    tube('Spring gem jaw '+str(s),geo.smooth_path(jaw),.008,clamp,chrome,4,polyline=True)
cyl('Clamp thumb sleeve',geo.CLAMP_PATH[-2],.03,.1,clamp,black,geo.unit(geo.sub(geo.CLAMP_PATH[-1],geo.CLAMP_PATH[-2])),.006,32)

body=group('zoomBody','体视变倍光学体',(0,-.14,3.78),(0,-.30,.3),note='外壳与物镜外观示意；内部双光路和变倍凸轮未复原。')
# White housing has a profiled inclined shoulder, fine lower seam and shallow edge radii.
extruded_profile('White lower optical housing',[(-.57,3.48),(.28,3.48),(.312,3.668),(-.568,3.668)],.46,body,ivory,.047)
extruded_profile('White contoured upper housing',[(-.568,3.676),(.312,3.676),(.35,3.81),(.19,4.04),(-.23,3.99),(-.56,3.87)],.46,body,ivory,.047)
loft('Tapered black objective bell',geo.OBJECTIVE_BELL_PROFILE,(0,geo.CENTER_Y),body,black,96)
annulus('Lower objective silver retaining ring',(0,geo.CENTER_Y,3.12),.238,.19,.04,body,chrome)
cyl('Objective optical face',geo.OBJECTIVE,geo.OBJECTIVE_RADIUS,.016,body,glass)
# No invented manufacturer logo or numerical magnification scale.

focus=group('focusKnob','立柱调焦大旋钮',(0,.78,3.20),(.64,0,0),True,(1,0,0),note='大旋钮固定在后立柱支架，绕 X 轴驱动黑横支架及镜头组件沿立柱上下平移；示意总行程 20 mm，非厂家实测。')
for s in [-1,1]:
    cyl('Stand mounted focus axle '+str(s),(s*.37,.78,3.20),.13,.40,focus,black,(1,0,0))
    knurl('Large stand focus grip '+str(s),(s*.60,.78,3.20),.31,.35,focus,(1,0,0),n=64)
    cyl('Large focus cap '+str(s),(s*.784,.78,3.20),.267,.018,focus,rubber,(1,0,0),.010)
zoom=group('zoomKnob','镜头两侧变倍小旋钮',(0,-.09,3.72),(.57,-.1,.05),True,(1,0,0),note='小旋钮位于镜头两侧，随整个镜头升降；不赋予未经验证的倍率公式。')
for s in [-1,1]:
    knurl('Small optical body zoom grip '+str(s),(s*.53,-.09,3.72),.15,.18,zoom,(1,0,0),n=48)
    cyl('Small zoom control cap '+str(s),(s*.626,-.09,3.72),.132,.018,zoom,rubber,(1,0,0),.010)

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

light=group('topLight','正前方 45° 箱式顶灯与粗鹅颈',geo.TOP_CENTER,(0,-.55,.25),note='灯头在物镜前方、台面之上，光轴向下45°指向样品；独立出光网格。')
cyl('Front mounted top light plug',geo.TOP_KNOTS[0],.069,.16,light,chrome,(0,1,0))
tube('Front thick top gooseneck',geo.smooth_path(geo.TOP_KNOTS),geo.TOP_NECK_RADIUS,light,black,polyline=True)
lamp_dir=Vector(geo.TOP_DIRECTION);lamp_center=Vector(geo.TOP_CENTER);q=lamp_dir.to_track_quat('Z','Y')
lamp=box('Front box top lamp shell',tuple(lamp_center),geo.TOP_DIMENSIONS,light,black,.06)
lamp.rotation_mode='QUATERNION';lamp.rotation_quaternion=q
inside=box('Temporary lamp cavity',tuple(lamp_center+lamp_dir*.025),(.55,.32,.30),light,black,.035)
inside.rotation_mode='QUATERNION';inside.rotation_quaternion=q;meshes.remove(inside);subtract(lamp,inside)
for x in [-.22,-.13,-.043,.043,.13,.22]:
    p=lamp_center+q@Vector((x,0,-.14))
    vent=box('Temporary through vent',tuple(p),(.025,.23,.13),light,black,.009)
    vent.rotation_mode='QUATERNION';vent.rotation_quaternion=q;meshes.remove(vent);subtract(lamp,vent)
window=box('GemMicroscope_TopEmission',geo.TOP_SOURCE,(.53,.30,.009),light,topEmission,.022)
window.rotation_mode='QUATERNION';window.rotation_quaternion=q
for x in [-.29,.29]:
    p=lamp_center+q@Vector((x,0,-.045));cyl('Top lamp mount screw',tuple(p),.018,.012,light,chrome,tuple(q@Vector((1,0,0))),.002,24)

guide=group('lightGuide','侧面斜射光纤与独立出光端',geo.FIBER_CENTER,(.5,0,.18),note='出光端朝向样品侧面，约8.5°向下；光导仅示意固定曲线。')
cyl('Fiber guide plug',geo.FIBER_KNOTS[0],.055,.16,guide,chrome,(0,1,0))
tube('Fine flexible light guide',geo.smooth_path(geo.FIBER_KNOTS),geo.FIBER_NECK_RADIUS,guide,black,5,polyline=True)
cyl('Fiber guide tip',geo.FIBER_CENTER,.031,.16,guide,black,geo.FIBER_DIRECTION,.006)
cyl('GemMicroscope_FiberEmission',geo.FIBER_SOURCE,.022,.008,guide,fiberEmission,geo.FIBER_DIRECTION,.002,32)

# Normalize polygon winding; morph topology remains unchanged.
check=[]
for o in meshes:
    bm=bmesh.new();bm.from_mesh(o.data)
    if not o.data.shape_keys:bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    bm.normal_update();bm.to_mesh(o.data)
    check.append({'mesh':o.name,'vertices':len(bm.verts),'faces':len(bm.faces),'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonManifoldEdges':sum(not e.is_manifold for e in bm.edges),'volumeCubicMeters':bm.calc_volume(signed=True)*UNIT**3})
    bm.free()
assert all(x['nonManifoldEdges']==0 and x['volumeCubicMeters']>0 for x in check), 'Closed-positive-volume mesh gate failed: '+str([x for x in check if x['nonManifoldEdges'] or x['volumeCubicMeters']<=0])

# Bake real metre coordinates into mesh data with identity scales and pivot-centred children.
bpy.context.view_layer.update()
old_world={o:o.matrix_world.copy() for o in meshes}
for obj,row in parts:
    obj.location=Vector(row['pivot'])*UNIT
    obj['teachingOpticsSimulated']=False;obj['dimensionsCalibrated']=False;obj['partId']=row['id']
bpy.context.view_layer.update()
for o in meshes:
    pivot=o.parent.location.copy()
    o.data.transform(Matrix.Translation(-pivot) @ Matrix.Scale(UNIT,4) @ old_world[o],shape_keys=True)
    o.matrix_parent_inverse=Matrix.Identity(4);o.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
def gl(v,scaled=True):return [round(v[0]*(UNIT if scaled else 1),8),round(v[2]*(UNIT if scaled else 1),8),round(-v[1]*(UNIT if scaled else 1),8)]
manifest={'id':'gem-microscope-structure-v1','version':'structure-4','revision':'repair-v4','model':'model.glb','units':'m','dimensionsCalibrated':False,'teachingOpticsSimulated':False,'parts':[],'coordinates':'glTF right-handed: X right, Y up, Z toward front','construction':'KRUSS KSW6000 photograph constrained parametric reconstruction; approximate 0.40 m teaching size, not measured manufacturer CAD.','sourceCandidate':None,'scaleNote':'统一米制，约 40 cm 高；示意比例，未按实物校准。'}
for obj,row in parts:
    for key in ['pivot','explodeOffset','hotspot']:row[key]=gl(row[key])
    row['rotationAxisLocal']=gl(row['rotationAxisLocal'],False)
    if row['id'] in ['focusCarriage','zoomBody','zoomKnob','eyepieceLeft','eyepieceRight','photoTube','analyzer','analyzerGuide']:
        row['translationAxisLocal']=[0,1,0];row['translationRangeMeters']=[-.01,.01];row['translationRangeVerified']=False
    manifest['parts'].append(row)
manifest['irisMechanics']={
    'bladePartId':'iris','rotatingControlPartId':'irisControl','controlPart':'irisControl','controlNode':'GemMicroscope_irisControl',
    'controlAngleChangesAperture':True,'bladeLinkageModeled':False,'bladeCount':12,'edgeBevelMeters':geo.IRIS_BEVEL*UNIT,'layerGapMeters':(geo.IRIS_LAYER_PITCH-2*geo.IRIS_HALF_THICKNESS)*UNIT,'materialRoughness':.66,
    'angleRangeDegrees':[0,90],'defaultAngleDegrees':90*IRIS_DEFAULT,
    'apertureDiameterRangeMeters':[2*IRIS_MIN*UNIT,2*IRIS_MAX*UNIT],
    'defaultApertureDiameterMeters':2*(IRIS_MIN+(IRIS_MAX-IRIS_MIN)*IRIS_DEFAULT)*UNIT,
    'drive':{'type':'morphTarget','morphTargetName':'ApertureOpen','nodes':[o.name for o in iris_blades],'weightRange':[0,1]},
    'mapping':'t = clamp(angleDegrees / 90, 0, 1); each leaf ApertureOpen weight = t; diameter = diameterMin + t * (diameterMax - diameterMin). Ring rotation relative to rest = angleDegrees - defaultAngleDegrees.',
    'note':'十二片弧形叶片的连续形变会改变真实中心圆孔；叶片不做整体旋转冒充开度。叶片变形是教学近似，未建实际连杆、轴销或叶片数实测。'
}
manifest['focusMechanics']={
    'controlPart':'focusKnob','controlNode':'GemMicroscope_focusKnob','angleRangeDegrees':[-180,180],'defaultAngleDegrees':0,
    'translationRangeMeters':[-.01,.01],'translationAxisLocal':[0,1,0],'translationSpace':'asset-global',
    'drivenParts':['focusCarriage','zoomBody','zoomKnob','eyepieceLeft','eyepieceRight','photoTube','analyzer','analyzerGuide'],
    'mapping':'t = clamp((angleDegrees + 180) / 360, 0, 1); translation along asset-global Y = -0.01 + 0.02*t metres, added to each listed rest position.',
    'note':'立柱大旋钮驱动横支架和光学头整体升降；镜头两侧小旋钮仅表示变倍操作。20 mm 总行程是教学设定，不是厂家测量值。'
}
manifest.update(geo.manifest_fields())
manifest['lampChamberConstruction']={
    'location':'under-stage suspended lamp chamber, separate from white structural pedestal',
    'mountingParts':['darkfield','lampHousingBase','lampMount','bottomLight'],
    'supportChain':['stage','darkfield upper flange','darkfield cylinder','lampHousingBase','lampMount','bottomLight'],
    'reflectorMaterial':'neutral polished metal; no gold coating asserted',
    'filterGuides':['filterGuides','analyzerGuide'],
    'manufacturerInternalGeometryVerified':False,
    'note':'底盖、灯座、上法兰和附件导轨补足可理解的机械安装关系；内部构造、材料、尺寸与热设计均未按厂家或实物校准。'}
for row in manifest['parts']:
    for motion in manifest['illuminationMechanics'].values():
        if row['id']==motion['partId']:
            row['illuminationMotion']=motion
            row['translationAxisLocal']=motion['axisLocal']
            row['translationRangeMeters']=[min(motion['positionsMeters'].values()),max(motion['positionsMeters'].values())]
            row['translationRangeVerified']=False
points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
manifest['approximateDimensionsMeters']={k:round(max(p[i] for p in points)-min(p[i] for p in points),6) for i,k in [(0,'width'),(1,'depth'),(2,'height')]}
# Geometric opening evidence: inner arc radii of all leaves in each morph pose.
iris_check={'controlAngleChangesAperture':True,'testedAnglesDegrees':[0,45,90],'poses':[], 'geometryMode':'closed overlapping crescent leaf meshes with linearly interpolated inner circular arc', 'calibrated':False}
for angle in [0,45,90]:
    radius=(IRIS_MIN+(IRIS_MAX-IRIS_MIN)*angle/90)*UNIT
    radii=[]
    for leaf in iris_blades:
        key0=leaf.data.shape_keys.key_blocks['Basis'];key1=leaf.data.shape_keys.key_blocks['ApertureOpen']
        for v0,v1 in zip(list(key0.data)[26:39],list(key1.data)[26:39]):
            p=leaf.matrix_world@(v0.co+(v1.co-v0.co)*angle/90)
            radii.append(math.hypot(p.x,p.y+.23*UNIT))
    iris_check['poses'].append({'angleDegrees':angle,'expectedDiameterMeters':2*radius,'actualInnerDiameterMinMeters':2*min(radii),'actualInnerDiameterMaxMeters':2*max(radii),'maxRadiusErrorMeters':max(abs(r-radius) for r in radii),'passed':max(abs(r-radius) for r in radii)<1e-6})
(WORK/'iris-morph-geometry-check.json').write_text(json.dumps(iris_check,ensure_ascii=False,indent=2)+'\n')
assert all(p['passed'] for p in iris_check['poses']), 'Iris morph geometry mapping failed'
# Persist the same shared-geometry checks used before Blender execution.
round4_reports=geo.write_reports(ROOT/'assets-source/instruments-2026-10-07/round4')
assert all(report['ok'] for report in round4_reports.values()), 'Round-3 shared geometry gate failed'
(WORK/'source').mkdir(exist_ok=True)
for script in [Path(__file__),Path(geo.__file__),Path(__file__).with_name('compose_microscope_review.py')]:shutil.copy2(script,WORK/'source'/script.name)
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
bpy.ops.export_scene.gltf(filepath=str(OUT/'model.glb'),export_format='GLB',use_selection=True,export_apply=False,export_yup=True,export_morph=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_extras=True)
manifest['sha256']=hashlib.sha256((OUT/'model.glb').read_bytes()).hexdigest();manifest['byteLength']=(OUT/'model.glb').stat().st_size
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(WORK/'mesh-check.json').write_text(json.dumps({'checkedMeshes':len(check),'meshes':check,'allClosed':all(x['nonManifoldEdges']==0 for x in check),'allPositiveVolume':all(x['volumeCubicMeters']>0 for x in check),'dimensionsCalibrated':False},ensure_ascii=False,indent=2)+'\n')
# Restore default darkfield-only lighting for the editable master and renders.
for material in [topEmission,fiberEmission]:
    material.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=0
# Product rendering is only lighting/camera, not baked into the web material.
world=bpy.data.worlds.new('Neutral studio');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.30,.34,.39,1);world.node_tree.nodes['Background'].inputs[1].default_value=.4

def area(name,loc,power,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=power*UNIT*UNIT;d.shape='DISK';d.size=size*UNIT;d.color=color
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=Vector(loc)*UNIT;o.rotation_euler=(Vector((0,0,2.5))*UNIT-o.location).to_track_quat('-Z','Y').to_euler()
area('Large soft key',(3,-5,8),900,5,(.91,.95,1));area('White edge strip',(-4,1,6),1100,4,(1,.94,.86));area('Front fill',(-1,-4,3),300,3,(1,1,1))
camera_data=bpy.data.cameras.new('Product view');camera=bpy.data.objects.new('Product view',camera_data);scene.collection.objects.link(camera);scene.camera=camera
camera_data.type='ORTHO';camera_data.ortho_scale=5.95;camera_data.lens=55
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=64;scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=8
scene.render.resolution_x=1100;scene.render.resolution_y=1250;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.view_settings.view_transform='AgX';scene.render.image_settings.color_mode='RGBA'

def viewpoint(loc,scale=5.95):
    camera.location=Vector(loc)*UNIT;camera.rotation_euler=(Vector((0,-.02,2.45))*UNIT-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.ortho_scale=scale*UNIT
viewpoint((7,-10,7.2));bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'gem-microscope-master.blend'))
if args.render:
    views={'poster':(7,-10,7.2),'front':(0,-12,2.45),'rear':(0,12,2.45),'left':(-12,0,2.45),'right':(12,0,2.45),'top':(0,-.001,15),'bottom':(0,-.001,-12),'reference-angle':(7,-10,7.2)}
    for name,loc in views.items():
        viewpoint(loc);scene.render.filepath=str(OUT/'poster.png' if name=='poster' else WORK/(name+'.png'));bpy.ops.render.render(write_still=True)
    # Close-ups use the same master geometry. The cutaway hides complete outer
    # components for inspection; it is an exploded teaching view, not a photo.
    scene.render.resolution_x=1250;scene.render.resolution_y=1000
    camera.location=Vector((4,-7,4))*UNIT
    camera.rotation_euler=(Vector((0,geo.CENTER_Y,1.30))*UNIT-camera.location).to_track_quat('-Z','Y').to_euler()
    camera_data.ortho_scale=2.7*UNIT
    scene.render.filepath=str(WORK/'lamp-housing-closeup.png');bpy.ops.render.render(write_still=True)
    keep=[lamp_cap,lamp_mount,bottom,reflector,stop,lever,iris,iris_control]
    for o in meshes:o.hide_render=o.parent not in keep
    camera_data.ortho_scale=1.65*UNIT
    scene.render.filepath=str(WORK/'lamp-housing-cutaway.png');bpy.ops.render.render(write_still=True)
    # Separate technical evidence that the central hole changes, not just the control ring.
    for o in meshes:o.hide_render=o.parent not in [iris,iris_control]
    scene.render.resolution_x=700;scene.render.resolution_y=700
    camera.location=Vector((0,-.23,4))*UNIT
    camera.rotation_euler=(Vector((0,-.23,1.724))*UNIT-camera.location).to_track_quat('-Z','Y').to_euler()
    camera_data.ortho_scale=.072
    for angle in [0,45,90]:
        for leaf in iris_blades:leaf.data.shape_keys.key_blocks['ApertureOpen'].value=angle/90
        iris_control.rotation_euler.z=(angle-90*IRIS_DEFAULT)*pi/180
        scene.render.filepath=str(WORK/('iris-angle-%02d.png'%angle));bpy.ops.render.render(write_still=True)
# Reimport in a genuinely empty scene, including removal of hidden reference objects.
for old in list(bpy.data.objects):bpy.data.objects.remove(old,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/'model.glb'))
node_names={o.name for o in bpy.data.objects};missing=[p['node'] for p in manifest['parts'] if p['node'] not in node_names]
morph_report=[{'node':o.name,'targets':[k.name for k in o.data.shape_keys.key_blocks],'defaultWeight':o.data.shape_keys.key_blocks['ApertureOpen'].value} for o in bpy.data.objects if o.type=='MESH' and o.data.shape_keys and 'ApertureOpen' in o.data.shape_keys.key_blocks]
report={'irisMorphTargetsAfterReimport':morph_report,'irisMorphLeafCount':len(morph_report),'missingNamedParts':missing,'expectedParts':len(parts),'importedMeshObjects':sum(o.type=='MESH' for o in bpy.data.objects),'byteLength':manifest['byteLength'],'below10MB':manifest['byteLength']<=10_000_000,'sourceUnchanged':not args.candidate or hashlib.sha256(args.candidate.read_bytes()).hexdigest()==manifest['sourceSha256'],'allSourceMeshesClosed':all(x['nonManifoldEdges']==0 for x in check),'allSourceMeshesPositiveVolume':all(x['volumeCubicMeters']>0 for x in check),'formatValidation':'Run inspect-import.mjs separately; this file only covers Blender geometry/reimport.'}
(WORK/'blender-reimport-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
assert not missing and len(morph_report)==12 and report['sourceUnchanged'] and report['below10MB'], 'Round-4 Blender reimport gate failed'
# Rebuild provenance from this export; never retain older acceptance hashes.
provenance={
    'id':manifest['id'],'date':'2026-10-07','version':'structure-4','revision':'repair-v4',
    'status':'rebuilt_geometry_and_reimport_checked_pending_round4_validator_and_browser',
    'modelSha256':manifest['sha256'],'byteLength':manifest['byteLength'],
    'dimensionsCalibrated':False,'teachingOpticsSimulated':False,'photometrySimulated':False,
    'manufacturerAuthorizedDigitalTwin':False,
    'method':'Source-constrained parametric teaching reconstruction with shared mathematical geometry; no Tripo triangles or photographic pixels in web GLB.',
    'rebuildScript':'gem-lab/tools/3d-assets/build_gem_microscope.py',
    'sourceSha256':round4_reports['microscope-illumination-check.json']['sourceSha256'],
    'sources':[
        {'id':'kruess-ksw6000','author':'A. KRÜSS Optronic GmbH','title':'Stereo gemstone microscope KSW6000','retrieved':'2026-10-07','license':'No verified open redistribution license; source photo remains local.','url':'https://kruess-shop.de/en/products/gemstone-microscopes/stereo-microscopes/stereo-gemstone-microscope/','use':'Overall public exterior reference only; no assertion about internal illumination mechanism.'},
        {'id':'gemology-project-microscope','author':'The Gemology Project contributors','title':'Microscope - Types of illumination','retrieved':'2026-10-07','license':'Linked for reference; no source text or image is embedded in the GLB.','url':'https://gemologyproject.com/wiki/index.php?title=Microscope','use':'Illumination modes and polarizer/analyzer placement; educational secondary reference.'},
        {'id':'gemologyonline-bf-df','author':'GemologyOnline forum participants','title':'Microscope and Darkfield/Brightfield - Question','retrieved':'2026-10-07','license':'Public discussion linked for context; not copied as manufacturer documentation.','url':'https://www.gemologyonline.com/Forum/phpBB2/viewtopic.php?t=6477','use':'Mechanism discussion only; later posts correct SVH to GEMZ/BF-DF. Brightfield can retain reflector illumination; this is not manufacturer evidence for KRUSS.'}],
    'usageBoundary':['Source photos remain in assets-source; no verified open redistribution license.','Illustrative dimensions, ellipsoid, objective cone, focus and filter travel; not manufacturer CAD or measured optics.'],
    'cloudGeneration':{'historicalTaskId':'90bc057d-ece4-4872-b003-0ee90b415e52','historicalModel':'H3.1','historicalQuality':'highest/private/geometry-and-texture/4k','newCallsThisRound':0,'round4Cost':0,'historicalMicroscopeCost':55,'cumulativeProjectCost':275,'sourceCandidate':manifest.get('sourceCandidate'),'sourceSha256':manifest.get('sourceSha256')},
    'irisMechanics':manifest['irisMechanics'],'illuminationModes':manifest['illuminationModes'],
    'verification':{'blenderReimport':report,'mathematicalGeometry':{k:{'ok':v['ok'],'scope':v['scope']} for k,v in round4_reports.items()},
                    'glTFValidator':'pending separate verify-instruments.mjs --round3','browserAppearanceVerified':False,'userAppearanceAccepted':False},
    'pending':['Round-4 unified validator and regenerated comparison sheets','Browser interaction checks and user appearance review','No irradiance, calibrated aperture, real optics or manufacturer internal construction claim']}
(OUT/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
print('GEM_MICROSCOPE_COMPLETE',json.dumps(report))
