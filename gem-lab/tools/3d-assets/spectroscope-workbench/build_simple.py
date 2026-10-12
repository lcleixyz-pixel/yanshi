"""Simple light source, precision tweezers and internal-reflection resting table; no supplier CAD/photo pixels.
Run: Blender --background --factory-startup --python-exit-code 1 --python build_bench.py -- --render
All geometry functions accept metre / Y-up coordinates, converted to Blender Z-up.
Mechanical dimensions, output aperture and reach are illustrative, not calibrated.
"""
import bpy, bmesh, json, hashlib, math, argparse, sys, shutil
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from math import sin, cos, pi
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
OUT=ROOT/'public/assets/3d/spectroscope-workbench/simple-v2'
SOURCE=ROOT/'assets-source/spectroscope-workbench/2026-10-10'
EDIT=SOURCE/'editable/simple-v2'; VALID=SOURCE/'validation/simple-v2'
for p in [OUT,EDIT,VALID]:p.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--render',action='store_true');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
parts=[];meshes=[]
def V(p):return Vector((p[0],-p[2],p[1]))
def mat(name,color,metal=0,rough=.4):
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(*color,1);s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=rough;return m
ivory=mat('Warm white painted enclosure',(.76,.78,.75),.16,.38)
blue=mat('Deep blue side trim',(.026,.063,.115),.52,.35)
black=mat('Black anodized aluminium',(.022,.028,.034),.72,.31)
rubber=mat('Black flexible elastomer',(.012,.015,.019),.02,.64)
slate=mat('Slate optical bench',(.105,.13,.15),.45,.36)
chrome=mat('Satin stainless steel',(.48,.52,.55),.90,.23)
dark=mat('Recess dark graphite',(.009,.013,.017),.20,.58)
mark=mat('Warm silver markings',(.62,.68,.69),.30,.44)
red=mat('Power index amber',(.91,.35,.055),.35,.32)
light=mat('Fiber exit diffuser',(.86,.84,.75),.1,.26)
node=light.node_tree.nodes.get('Principled BSDF');node.inputs['Emission Color'].default_value=(1,.89,.68,1);node.inputs['Emission Strength'].default_value=.9
indicator=mat('Red power indicator',(.40,.015,.012),.1,.25);s=indicator.node_tree.nodes.get('Principled BSDF');s.inputs['Emission Color'].default_value=(1,.025,.012,1);s.inputs['Emission Strength'].default_value=.6

def group(id,label,pivot=(0,0,0),motion=None,parent=None):
 o=bpy.data.objects.new('Bench_'+id,None);scene.collection.objects.link(o);o.location=V(pivot);bpy.context.view_layer.update()
 if parent:o.parent=parent;o.matrix_parent_inverse=parent.matrix_world.inverted()
 row={'id':id,'node':o.name,'label':label,'pivot':list(pivot),'defaultVisible':True,'hotspot':list(pivot)}
 if motion:row['motion']=motion
 o['partId']=id;o['illustrativeDimensions']=True;parts.append(row);return o
root=group('root','分光镜光源与夹样配件')
root['units']='meter';root['upAxis']='Y';root['dimensionsCalibrated']=False;root['opticalSimulation']=False

def attach(o,parent,material,bevel=0):
 o.data.materials.append(material);bpy.context.view_layer.objects.active=o
 if bevel:
  m=o.modifiers.new('Manufactured edge fillet','BEVEL');m.width=bevel;m.segments=3;bpy.ops.object.modifier_apply(modifier=m.name)
 for f in o.data.polygons:f.use_smooth=True
 m=o.modifiers.new('Weighted hard-surface normals','WEIGHTED_NORMAL');m.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=m.name)
 o.parent=parent;o.matrix_parent_inverse=parent.matrix_world.inverted();o['originalTeachingGeometry']=True;meshes.append(o);return o

def box(name,loc,dims,parent,material,bevel=.001):
 bpy.ops.mesh.primitive_cube_add(size=1,location=V(loc));o=bpy.context.object;o.name=name;o.dimensions=(dims[0],dims[2],dims[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return attach(o,parent,material,bevel)

def cyl(name,loc,radius,depth,parent,material,axis=(0,1,0),n=64,bevel=.0004):
 bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=radius,depth=depth,location=V(loc));o=bpy.context.object;o.name=name;o.rotation_mode='QUATERNION';o.rotation_quaternion=V(axis).to_track_quat('Z','Y');bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);return attach(o,parent,material,bevel)

def mesh(name,verts,faces,parent,material,bevel=0):
 d=bpy.data.meshes.new(name);d.from_pydata([V(p) for p in verts],[],faces);d.update();o=bpy.data.objects.new(name,d);scene.collection.objects.link(o)
 # Recalculate consistent outward normals for independent closed components.
 bm=bmesh.new();bm.from_mesh(d);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(d);bm.free();return attach(o,parent,material,bevel)

def annulus(name,loc,outer,inner,height,parent,material,axis=(0,1,0),n=96,bevel=.00025):
 q=Vector(axis).to_track_quat('Z','Y');p=Vector(loc);verts=[];faces=[]
 for z,r in [(-height/2,outer),(height/2,outer),(height/2,inner),(-height/2,inner)]:
  for i in range(n):verts.append(tuple(p+q@Vector((r*cos(i*2*pi/n),r*sin(i*2*pi/n),z))))
 for j in range(4):
  for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,((j+1)%4)*n+(i+1)%n,((j+1)%4)*n+i))
 return mesh(name,verts,faces,parent,material,bevel)

def tube(name,points,r,parent,material):
 # Explicit shallow corrugation; web export carries real geometry, not unsupported procedural bump.
 control=[Vector(p) for p in points];centers=[]
 for j in range(len(control)-1):
  a=control[max(0,j-1)];b=control[j];c=control[j+1];d=control[min(len(control)-1,j+2)]
  for k in range(90):
   t=k/90;centers.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
 centers.append(control[-1]);v=[];f=[];distance=0;n=20
 for j,p in enumerate(centers):
  if j:distance+=(p-centers[j-1]).length
  tangent=(centers[min(j+1,len(centers)-1)]-centers[max(0,j-1)]).normalized();ref=Vector((0,1,0))
  if abs(tangent.dot(ref))>.94:ref=Vector((1,0,0))
  u=tangent.cross(ref).normalized();w=tangent.cross(u).normalized();radius=r*(1+.075*cos(distance/.0028*2*pi))
  for k in range(n):v.append(tuple(p+radius*(u*cos(k*2*pi/n)+w*sin(k*2*pi/n))))
 for j in range(len(centers)-1):
  for k in range(n):f.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
 f.extend([tuple(reversed(range(n))),tuple((len(centers)-1)*n+k for k in range(n))]);return mesh(name,v,f,parent,material)

def knurl(name,loc,r,h,parent,material,axis=(0,0,1),n=128):
 q=Vector(axis).to_track_quat('Z','Y');p=Vector(loc);v=[];f=[]
 for z,factor in [(-h/2,.94),(-h/2+.0008,1),(h/2-.0008,1),(h/2,.94)]:
  for i in range(n):
   rr=r*factor*(1 if i%2==0 else .96);v.append(tuple(p+q@Vector((rr*cos(i*2*pi/n),rr*sin(i*2*pi/n),z))))
 for j in range(3):
  for i in range(n):f.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
 f.extend([tuple(reversed(range(n))),tuple(3*n+i for i in range(n))]);return mesh(name,v,f,parent,material)

def boolean_hole(o,loc,r,depth,axis=(0,0,1)):
 bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=r,depth=depth,location=V(loc));cut=bpy.context.object;cut.rotation_mode='QUATERNION';cut.rotation_quaternion=V(axis).to_track_quat('Z','Y');bpy.context.view_layer.objects.active=o;m=o.modifiers.new('Actual through aperture','BOOLEAN');m.operation='DIFFERENCE';m.solver='EXACT';m.object=cut;bpy.ops.object.modifier_apply(modifier=m.name);bpy.data.objects.remove(cut,do_unlink=True)

def screw(name,loc,parent,axis=(0,1,0),r=.002):
 o=cyl(name,loc,r,.0011,parent,chrome,axis,32,.00015)
 q=Vector(axis).to_track_quat('Z','Y');center=Vector(loc)+Vector(axis)*.0006;slit=box(name+'_recess',tuple(center),(r*1.2,.00015,.00045),parent,dark,.00005)
 # A shallow dark inlay marks the head; cosmetic recess is intentionally not a socket simulation.
 return o

def label(name,text,loc,size,parent,material,face='front'):
 c=bpy.data.curves.new(name,'FONT');c.body=text;c.size=size;c.extrude=.00008;c.resolution_u=3;c.align_x='CENTER';o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);o.location=V(loc)
 if face=='top':o.rotation_euler=(0,0,0)
 else:o.rotation_euler=(pi/2,0,0)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');return attach(bpy.context.object,parent,material)

# White single-guide lamp enclosure, visually constrained by FABLE FCL-100 and Baoguang sources.
source=group('lightSource','白色光纤光源主机',(-.205,.062,-.065),parent=root)
box('Source_black_bottom_seam',(-.205,.014,-.065),(.178,.006,.18),source,rubber,.004)
box('Source_bottom_shell',(-.205,.019,-.065),(.18,.008,.18),source,ivory,.004)
box('Source_left_white_wall',(-.292,.070,-.065),(.006,.102,.18),source,ivory,.003)
box('Source_right_white_wall',(-.118,.070,-.065),(.006,.102,.18),source,ivory,.003)
box('Source_plain_white_top',(-.205,.120,-.065),(.18,.006,.18),source,ivory,.003)
box('Source_front_panel',(-.205,.067,.024),(.172,.099,.004),source,ivory,.002)
box('Source_rear_panel',(-.205,.067,-.154),(.172,.099,.004),source,ivory,.002)
# Rear ventilation is a generic functional illustration, not a measured FCL-100 back panel.
rear=bpy.data.objects['Source_rear_panel']
for i in range(11):
 x=-.255+i*.010;boolean_hole(rear,(x,.086,-.154),.0025,.012)
for x in [-.267,-.143]:
 for z in [-.12,-.006]:cyl('Source_rubber_foot',(x,.007, z),.010,.014,source,rubber,bevel=.0015)
label('Source_generic_label','FIBER ILLUMINATOR',(-.241,.097,.0263),.0045,source,black)
port_center=(-.252,.045,.030)
annulus('Source_round_black_output_mount',port_center,.020,.007,.009,source,black,(0,0,1),128,.0007)
annulus('Source_connector_metal_collar',(-.252,.045,.036),.009,.0050,.011,source,chrome,(0,0,1),96,.0003)
annulus('Source_connector_nose',(-.252,.045,.043),.0075,.0048,.006,source,black,(0,0,1),96,.0003)
boolean_hole(bpy.data.objects['Source_front_panel'],(-.252,.045,.024),.007,.018)
knurl('Source_output_lock_screw',(-.235,.045,.034),.0035,.011,source,chrome,(1,0,0),48)
cyl('Source_fiber_plug',(-.252,.045,.048),.0046,.012,source,rubber,(0,0,1),64,.0003)
label('Source_output_label','Optical output',(-.252,.018,.0263),.0032,source,black)
# One knob provides power-off and continuous brightness; powerSwitch is a semantic helper, not an invented rocker.
switch=group('powerSwitch','旋钮关断段',(-.155,.087,.034),{'type':'shared-dimmer-off-detent','sharedNode':'Bench_dimmerKnob'},root)
knob=group('dimmerKnob','开关与亮度调节旋钮',(-.155,.087,.034),{'type':'rotation','axis':[0,0,1],'rangeDegrees':[-135,135],'defaultDegrees':35,'includesPowerOff':True},root)
annulus('Source_dial_metal_seat',(-.155,.087,.027),.0145,.009,.002,source,chrome,(0,0,1),96,.0003)
knurl('Source_dimmer_knurled_grip',(-.155,.087,.034),.012,.014,knob,black,(0,0,1),128)
cyl('Source_dimmer_end',(-.155,.087,.042),.0105,.002,knob,black,(0,0,1),96,.0003)
box('Source_dimmer_white_index',(-.148,.081,.0432),(.0036,.0008,.0004),knob,mark,.00015)
for i in range(23):
 angle=(-120+i*240/22)*pi/180;x=-.155+.019*sin(angle);y=.087+.019*cos(angle)
 cyl('Source_dial_arc_mark',(x,y,.0265),.0013,.0006,source,black,(0,0,1),16,.00015)
label('Source_off_label','OFF',(-.177,.079,.0264),.0032,source,black)
label('Source_on_label','ON',(-.134,.079,.0264),.0032,source,black)
cyl('Source_indicator_bezel',(-.155,.046,.027),.0038,.002,source,chrome,(0,0,1),48,.0003)
cyl('Source_indicator_lens',(-.155,.046,.0283),.0027,.001,source,indicator,(0,0,1),48,.0002)
label('Source_indicator_label','Indicator',(-.155,.034,.0263),.0031,source,black)
# Thin metal light-guide probe; emitter and pivot remain compatible with the established viewer.
head=group('lampHead','金属光导出光端',(0,.12,-.09),{'type':'rotation','axes':['Y','X'],'rangeDegrees':[-75,75],'emissionAxisLocal':[0,0,1],'illustrative':True},root)
annulus('Lamp_rear_metal_ferrule',(0,.12,-.115),.0065,.0046,.022,head,chrome,(0,0,1),96,.0005)
annulus('Lamp_thin_metal_output_tube',(0,.12,-.086),.0035,.0022,.034,head,chrome,(0,0,1),96,.00022)
annulus('Lamp_output_rim',(0,.12,-.0693),.0036,.0022,.001,head,chrome,(0,0,1),96,.00010)
for i in range(5):cyl('Lamp_rear_strain_relief',(0,.12,-.129-i*.002),.0049-i*.0002,.003,head,rubber,(0,0,1),48,.0002)
emitter=group('lampEmitter','细光导出光面',(0,.12,-.069),parent=head)
cyl('Lamp_fiber_exit_window',(0,.12,-.069),.0022,.0006,emitter,light,(0,0,1),96,.0001)
cable=group('fiberCable','柔性光纤导光束',(-.252,.045,.054),{'type':'runtime-curve','start':[-.252,.045,.054],'end':[0,.12,-.137],'radiusMeters':.0045},root)
FIBER_POINTS=[[-.252,.045,.054],[-.228,.047,.093],[-.17,.071,.116],[-.106,.134,.07],[-.073,.16,-.050],[-.026,.14,-.162],[0,.12,-.137]]
tube('Fiber_flexible_black_jacket',FIBER_POINTS,.0045,cable,rubber)
for i in range(5):cyl('Source_plug_strain_relief',(-.252,.045,.049+i*.002),.0054-i*.0002,.003,cable,rubber,(0,0,1),48)
# Handheld precision gemstone tweezers: two leaf-spring arms, independent jaws and tips.
tweezers=group('tweezers','宝石镊子',(0,.12,0),{'type':'translation','translationAxis':[1,0,0],'rangeMeters':[-.035,.035]},root)
TWEezER_ROOT=(.145,.157,0)
box('Tweezer_welded_spring_end',(.145,.157,0),(.007,.0074,.0032),tweezers,chrome,.001)
def blade(name,sections,parent,material):
 # Cross sections are (X,Y,Z,width along Y, thickness along Z), joined as a closed solid.
 vertices=[];faces=[]
 for x,y,z,width,thickness in sections:
  vertices.extend([(x,y-width/2,z-thickness/2),(x,y+width/2,z-thickness/2),(x,y+width/2,z+thickness/2),(x,y-width/2,z+thickness/2)])
 faces.append((3,2,1,0))
 for i in range(len(sections)-1):
  for k in range(4):faces.append((i*4+k,i*4+(k+1)%4,(i+1)*4+(k+1)%4,(i+1)*4+k))
 n=(len(sections)-1)*4;faces.append((n,n+1,n+2,n+3))
 return mesh(name,vertices,faces,parent,material,.00014)
for side,name in [(1,'A'),(-1,'B')]:
 jaw=group('tweezerJaw'+name,'镊子夹臂 '+name,TWEezER_ROOT,{'type':'rotation','axis':[0,1,0],'rangeDegrees':[0,4],'directionMultiplier':side,'defaultDegrees':0},tweezers)
 blade('Tweezer_spring_blade_'+name,[(.146,.157,side*.0006,.007,.0008),(.13,.154,side*.0017,.010,.0009),(.112,.1495,side*.0030,.010,.0009),(.080,.140,side*.0055,.0085,.0008),(.045,.130,side*.0072,.0065,.0007),(.017,.1235,side*.0080,.0035,.00065),(.004,.1205,side*.0073,.0019,.00065)],jaw,chrome)
 for i in range(16):
  x=.095+i*.0024;t=(x-.080)/(.13-.080);y=.140+t*.014;z=side*(.0055+t*(.0017-.0055)+.00053)
  ridge=box('Tweezer_fine_grip_ridge_'+name,(x,y,z),(.00042,.0066,.00027),jaw,chrome,.00010)
 tip=group('tweezerTip'+name,'镊尖接触部 '+name,(0,.12,side*.007),parent=jaw)
 blade('Tweezer_precision_tip_'+name,[(.004,.1205,side*.0073,.0019,.00068),(.0005,.12,side*.0070,.00145,.00072),(-.0012,.1199,side*.0070,.00085,.0007)],tip,chrome)
# Small plain black resting surface for internal-reflection observations. No rails, mask or holders.
reflection=group('reflectionTable','黑色观察放置台面',(0,.108,0),parent=root)
box('Reflection_simple_pedestal',(0,.047,0),(.037,.094,.030),reflection,rubber,.003)
box('Reflection_matte_top',(0,.101,0),(.078,.014,.062),reflection,rubber,.003)
# Recompute orientation and geometry checks, excluding no generated asset pieces.
bpy.context.view_layer.update()
check=[];triangles=0
for o in meshes:
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.normal_update()
 item={'node':o.name,'vertices':len(bm.verts),'faces':len(bm.faces),'nonManifoldEdges':sum(not e.is_manifold for e in bm.edges),'boundaryEdges':sum(e.is_boundary for e in bm.edges),'volumeCubicMeters':bm.calc_volume(signed=True)}
 check.append(item);o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles);bm.free()
# Bounds in external Y-up coordinates.
world=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
low=[min(v[i] for v in world) for i in range(3)];high=[max(v[i] for v in world) for i in range(3)]
bounds={'min':[low[0],low[2],-high[1]],'max':[high[0],high[2],-low[1]]}
# Targeted ray checks establish actual open paths, not optical performance.
def hit(o,origin,direction,length):
 bm=bmesh.new();bm.from_mesh(o.data);bm.transform(o.matrix_world);tree=BVHTree.FromBMesh(bm);found=tree.ray_cast(V(origin),V(direction),length)[0] is not None;bm.free();return found
aperture_checks={
 'headBoreIsOpen':not hit(bpy.data.objects['Lamp_thin_metal_output_tube'],(0,.12,-.064),(0,0,-1),.038),
 'sourceFrontSocketIsOpen':not hit(bpy.data.objects['Source_front_panel'],(-.252,.045,.044),(0,0,-1),.05),
}
assert all(aperture_checks.values()),aperture_checks
mesh_report={'sha256PendingExport':True,'checkedMeshes':len(check),'triangles':triangles,'allClosed':all(x['nonManifoldEdges']==0 for x in check),'allPositiveVolume':all(x['volumeCubicMeters']>1e-15 for x in check),'meshes':check,'apertureChecks':aperture_checks,'boundsMeters':bounds,'scope':'Mesh/manifold/nominal aperture checks only; not photometry, manufacturer measurements or physical acceptance.'}
assert mesh_report['allClosed'] and mesh_report['allPositiveVolume'],[c for c in check if c['nonManifoldEdges'] or c['volumeCubicMeters']<=1e-15]
# Only semantic components and asset meshes go into GLB; no camera/studio lights.
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects:
 if o==root or o.name.startswith('Bench_') or o in meshes:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'model.glb'),export_format='GLB',use_selection=True,export_apply=False,export_yup=True,export_materials='EXPORT',export_extras=True,export_cameras=False,export_lights=False)
digest=hashlib.sha256((OUT/'model.glb').read_bytes()).hexdigest();size=(OUT/'model.glb').stat().st_size
mesh_report['sha256PendingExport']=False;mesh_report['modelSha256']=digest
(VALID/'mesh-check.json').write_text(json.dumps(mesh_report,ensure_ascii=False,indent=2)+'\n')
manifest={
 'id':'spectroscope-workbench','version':'simple-2','date':'2026-10-10','title':'分光镜光源、宝石镊子与放置台面','model':'model.glb','poster':'poster.png','sha256':digest,'byteLength':size,'units':'meter','upAxis':'Y','rootNode':'Bench_root','boundsMeters':bounds,'dimensionsCalibrated':False,'opticalSimulation':False,'photometrySimulated':False,
 'parts':parts,'sampleCenter':[0,.12,0],'opticalAxis':[0,0,1],
 'lamp':{'pivot':[0,.12,-.09],'emitterNode':'Bench_lampEmitter','emitterWorld':[0,.12,-.069],'emitterLocal':[0,0,.021],'emissionAxisLocal':[0,0,1],'apertureDiameterMeters':.0044,'emitterRadiusMeters':.0022,'type':'illustrative broadband halogen fiber illuminator with a thin metal fiber probe','colorTemperatureCalibrated':False},
 'fiber':{'node':'Bench_fiberCable','radiusMeters':.0045,'points':FIBER_POINTS,'replaceWithRuntimeCurve':True,'headAttachmentLocal':[0,0,-.047]},
 'tweezers':{'node':'Bench_tweezers','pivot':[0,.12,0],'jawNodes':['Bench_tweezerJawA','Bench_tweezerJawB'],'jawPivotWorld':[.145,.157,0],'tipNodes':['Bench_tweezerTipA','Bench_tweezerTipB'],'tipWorldPositions':[[0,.12,.007],[0,.12,-.007]],'openingRangeDegrees':[0,4],'jawDirectionMultipliers':[1,-1],'translationAxis':[1,0,0],'translationRangeMeters':[-.035,.035]},
 'reflectionTable':{'node':'Bench_reflectionTable','topY':.108,'topSizeMeters':[.078,.062],'visibleForModes':['internal-reflection','surface-reflection']},
 'instrumentPlacement':{'opticalAxis':[0,0,1],'opticalAxisHeightMeters':.12,'suggestedEntranceZ':.045,'includedInThisAsset':False,'heldByViewer':True},
 'notes':['独立原创参数化教学资产，无品牌标识；未复刻特定厂家型号。','尺寸、灯头与样品夹行程属于教学设计，非实物测量。','卤素光纤宽带白光语义由课程定义，本模型不计算灯丝、色温、光谱响应或照度。','后板通风孔属于通用功能示意，未声称复制 FCL-100 后板。','外形参考 FABLE FCL-100 与南京宝光光纤灯，保留无品牌教学模型。','光路和样品分别由练习程序绘制；工作台 GLB 不含分光镜及样品，亦不提供谱带真值。','只包含光源、镊子与反射观察放置台；不含大底板、导轨、滑片、镜筒托架或额外灯架。','透射显示镊子；内反射与表面反射均默认显示黑色放置台面，灯和分光镜在两侧上方斜向观察；实际姿态由练习程序设置。','镊子开合为叶簧机构的简化转动示意，不是弹性有限元或真实夹持力计算。']}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
provenance={'id':manifest['id'],'date':'2026-10-10','version':'simple-2','method':'Original parametric hard-surface teaching design; no cloud triangles, manufacturer CAD or photographic pixels copied into GLB.','modelSha256':digest,'byteLength':size,'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'rebuildScript':'gem-lab/tools/3d-assets/spectroscope-workbench/build_simple.py','dimensionsCalibrated':False,'manufacturerAuthorizedDigitalTwin':False,'opticalSimulation':False,'photometrySimulated':False,'sources':[{'url':'https://www.szfable.com/product/optical-fiber-light-fcl-100/','title':'FABLE Optical Fiber Light FCL-100','use':'White single-guide enclosure, shared off/brightness knob, front red indicator and thin metal probe visual reference. Dimensions remain teaching design, no logo copied.','retrieved':'2026-10-10'},{'url':'http://bgyq.cn/iw/iw.html','title':'南京宝光 光纤冷光源 GI-I50WE/50W','use':'Corroboration of plain light-colour source enclosure, optical outlet, adjustable lamp and suitability for gemstone absorption observation.','retrieved':'2026-10-10'},{'url':'https://www.szfable.com/product/gem-tweezers-dt-m/','title':'FABLE Gem Tweezers DT-M','use':'Fine twin-arm non-locking gem-tweezer form only; no branding or manufacturer pixels copied.','retrieved':'2026-10-10'}],'cloudCandidateUsage':'Separate external appearance comparison if supplied; not used as this asset geometry.','verification':{'meshChecks':'validation/mesh-check.json','gltfValidator':'pending verify_simple.mjs','browserAcceptance':False,'userAppearanceAcceptance':False}}
(OUT/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
# Editable master has convenient product studio, separated from exported asset.
world=bpy.data.worlds.new('Cool neutral product studio');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.26,.30,.34,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
floor=box('STUDIO_FLOOR',(0,-.006,0),(200,.002,200),root,mat('Studio background',(.085,.105,.125),0,.7),0);floor.parent=None;meshes.remove(floor)
def area(name,loc,power,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=V(loc);o.rotation_euler=(V((-.05,.08,0))-o.location).to_track_quat('-Z','Y').to_euler()
area('Studio_large_soft_key',(.2,.65,.35),38,.6,(.92,.96,1));area('Studio_warm_rim',(-.4,.45,-.3),52,.4,(1,.93,.84));area('Studio_front_fill',(-.1,.3,.5),12,.4,(1,1,1))
d=bpy.data.cameras.new('Product camera');camera=bpy.data.objects.new('Product camera',d);scene.collection.objects.link(camera);scene.camera=camera;d.type='ORTHO';d.lens=55
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=48;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=8;scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.6
def viewpoint(loc,target,scale):camera.location=V(loc);camera.rotation_euler=(V(target)-camera.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=scale
viewpoint((.57,.43,.69),(-.075,.075,0),.62);bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(EDIT/'spectroscope-simple-master.blend'))
shutil.copy2(Path(__file__),EDIT/'build_simple.py')
if args.render:
 views=[('overview',(.57,.43,.69),(-.075,.08,0),.62),('tweezers',(.19,.28,.26),(.065,.133,0),.235),('light-source',(-.51,.27,.39),(-.205,.063,-.065),.34),('reflection-table',(.13,.21,.24),(0,.075,0),.215)]
 for name,loc,target,scale in views:
  viewpoint(loc,target,scale)
  if name=='top':camera.rotation_euler=(0,0,0)
  scene.render.filepath=str(VALID/(name+'.png'));bpy.ops.render.render(write_still=True)
 shutil.copy2(VALID/'overview.png',OUT/'poster.png')
# Reimport independently in an empty scene; historical source objects cannot satisfy node checks.
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/'model.glb'));names={o.name for o in bpy.data.objects};missing=[p['node'] for p in parts if p['node'] not in names]
reimport={'modelSha256':digest,'missingNodes':missing,'expectedParts':len(parts),'importedMeshes':sum(o.type=='MESH' for o in bpy.data.objects),'below10MiB':size<10*1024*1024,'pass':not missing and size<10*1024*1024}
(VALID/'reimport-check.json').write_text(json.dumps(reimport,ensure_ascii=False,indent=2)+'\n');assert reimport['pass'];print('BENCH_COMPLETE',json.dumps({'sha256':digest,'bytes':size,'meshes':len(check),'triangles':triangles,'parts':len(parts),'meshPass':True,'reimportPass':True}))
