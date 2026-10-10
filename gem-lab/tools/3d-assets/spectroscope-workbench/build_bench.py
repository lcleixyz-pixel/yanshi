"""Original, editable gem-spectroscope teaching bench; no supplier CAD/photo pixels.
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
OUT=ROOT/'assets-source/spectroscope-workbench/2026-10-10/superseded/bench-v1-web'
SOURCE=ROOT/'assets-source/spectroscope-workbench/2026-10-10'
EDIT=SOURCE/'editable'; VALID=SOURCE/'validation'
for p in [OUT,EDIT,VALID]:p.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--render',action='store_true');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
parts=[];meshes=[]
def V(p):return Vector((p[0],-p[2],p[1]))
def mat(name,color,metal=0,rough=.4):
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(*color,1);s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=rough;return m
ivory=mat('Silver grey satin coated metal',(.58,.62,.65),.64,.30)
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
indicator=mat('Power indicator warm green',(.22,.72,.42),.25,.28);s=indicator.node_tree.nodes.get('Principled BSDF');s.inputs['Emission Color'].default_value=(.2,.8,.43,1);s.inputs['Emission Strength'].default_value=.5

def group(id,label,pivot=(0,0,0),motion=None,parent=None):
 o=bpy.data.objects.new('Bench_'+id,None);scene.collection.objects.link(o);o.location=V(pivot);bpy.context.view_layer.update()
 if parent:o.parent=parent;o.matrix_parent_inverse=parent.matrix_world.inverted()
 row={'id':id,'node':o.name,'label':label,'pivot':list(pivot),'defaultVisible':True,'hotspot':list(pivot)}
 if motion:row['motion']=motion
 o['partId']=id;o['illustrativeDimensions']=True;parts.append(row);return o
root=group('root','分光镜练习工作台')
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

# Low floating optical bench, soft edge and independent rubber feet.
base=group('base','工作台底板',(0,.014,0),parent=root)
box('Bench_lower_black_edge',(0,.014,0),(.62,.018,.42),base,rubber,.012)
box('Bench_slate_top',(0,.024,0),(.61,.012,.41),base,slate,.010)
for x in [-.265,.265]:
 for z in [-.165,.165]:cyl('Bench_isolation_foot',(x,.005,z),.018,.010,base,rubber,bevel=.002)
for x in [-.287,.287]:
 for z in [-.182,.182]:screw('Bench_top_screw',(x,.0302,z),base)
# Discrete alignment markings around usable optical axis; no arbitrary measuring scale.
for z in [-.145,-.11,-.075,.060,.095,.13,.165]:
 for x in [-.052,.052]:box('Optical_axis_alignment_tick',(x,.0303,z),(.008,.0003,.0006),base,mark,.0001)
box('Optical_axis_center_reference',(0,.0303,.165),(.0006,.0003,.015),base,mark,.0001)
label('Bench_process_label','ILLUMINATE  /  ALIGN  /  OBSERVE',(.153,.0304,.177),.0045,base,mark,'top')

# Light source with real hollow construction and open louvres, not a textured box.
source=group('lightSource','光纤光源主机',(-.205,.078,-.065),parent=root)
box('Source_rubber_lower_seam',(-.205,.038,-.065),(.155,.010,.166),source,rubber,.007)
box('Source_bottom_shell',(-.205,.044,-.065),(.154,.008,.167),source,ivory,.006)
box('Source_left_wall',(-.279,.087,-.065),(.006,.083,.16),source,ivory,.003)
box('Source_right_wall',(-.131,.087,-.065),(.006,.083,.16),source,ivory,.003)
box('Source_back_wall',(-.205,.087,-.145),(.15,.083,.006),source,ivory,.003)
box('Source_front_bezel',(-.205,.087,.015),(.15,.083,.008),source,ivory,.005)
for x in [-.285,-.125]:box('Source_deep_blue_side_trim',(x,.087,-.065),(.010,.038,.153),source,blue,.004)
box('Source_upper_front_panel',(-.205,.13,-.012),(.15,.007,.057),source,ivory,.003)
box('Source_upper_rear_panel',(-.205,.13,-.128),(.15,.007,.028),source,ivory,.003)
for x in [-.271,-.139]:box('Source_vent_border',(x,.13,-.079),(.018,.007,.078),source,ivory,.002)
for i in range(15):
 z=-.116+i*.0053;box('Source_open_vent_louvre_%02d'%i,(-.205,.13,z),(.116,.005,.0020),source,ivory,.0007)
cyl('Source_dark_fan_recess',(-.205,.102,-.08),.045,.004,source,dark)
for x in [-.266,-.144]:
 for z in [-.13,-.025]:screw('Source_cover_fastener',(x,.134,z),source)
# Front face: output connector, separate rocker and readable current control.
label('Source_label','FIBER ILLUMINATOR',(-.205,.108,.0195),.0052,source,black)
port=annulus('Source_fiber_socket',(-.245,.079,.023),.012,.007,.010,source,chrome,(0,0,1))
annulus('Source_connector_black_gasket',(-.245,.079,.0198),.014,.007,.002,source,rubber,(0,0,1))
# A real opening is present through the front panel behind the socket.
boolean_hole(bpy.data.objects['Source_front_bezel'],(-.245,.079,.015),.007,.022)
knurl('Source_connector_retaining_ring',(-.245,.079,.029),.010,.007,source,black)
# Plug rear is closed intentionally: fiber enters a connector, not an empty bore.
cyl('Source_fiber_plug',(-.245,.079,.034),.0058,.016,source,rubber,(0,0,1))
switch=group('powerSwitch','电源开关',(-.162,.077,.024),{'type':'rotation','axis':[1,0,0],'rangeDegrees':[-12,12],'defaultDegrees':-12},root)
box('Source_switch_recess',(-.162,.077,.020),(.023,.029,.004),source,dark,.003)
box('Source_rocker_switch',(-.162,.077,.024),(.019,.025,.005),switch,rubber,.002)
box('Source_switch_index',(-.162,.083,.027),(.001,.006,.0005),switch,mark,.0002)
label('Source_switch_label','POWER',(-.162,.056,.0195),.0037,source,black)
cyl('Source_indicator_bezel',(-.182,.096,.020),.0031,.002,source,chrome,(0,0,1),32)
cyl('Source_indicator_lens',(-.182,.096,.0212),.0021,.001,source,indicator,(0,0,1),32)
knob=group('dimmerKnob','光源调光旋钮',(-.205,.074,.027),{'type':'rotation','axis':[0,0,1],'rangeDegrees':[-135,135],'defaultDegrees':35},root)
annulus('Source_knob_silver_seat',(-.205,.074,.020),.016,.008,.002,source,chrome,(0,0,1))
knurl('Source_dimmer_knurled_grip',(-.205,.074,.027),.0125,.011,knob,black)
cyl('Source_dimmer_end',(-.205,.074,.033),.0108,.002,knob,black,(0,0,1))
box('Source_dimmer_white_index',(-.205,.082,.0342),(.0010,.0035,.0006),knob,mark,.0002)
for i in range(11):
 a=(-135+i*27)*pi/180;x=-.205+.018*sin(a);y=.074+.018*cos(a);cyl('Dimmer_setting_dot',(x,y,.0199),.0006,.0004,source,black,(0,0,1),16,.0001)
label('Source_intensity_label','INTENSITY',(-.205,.047,.0195),.0037,source,black)
for x in [-.266,-.144]:screw('Source_front_fastener',(x,.05,.020),source,(0,0,1))
# Rear IEC inlet outline and mechanical retaining screws. No mains cable is needed for pedagogy.
box('Source_rear_inlet_recess',(-.205,.069,-.149),(.034,.026,.002),source,dark,.003)
box('Source_rear_inlet_insert',(-.205,.069,-.151),(.024,.017,.003),source,rubber,.002)
for x in [-.212,-.198]:box('Source_rear_connector_pin',(x,.069,-.154),(.0018,.005,.002),source,chrome,.0003)

# Directional lamp head, supported by independent stand/trunnion (not a floating cone).
stand=group('lampStand','灯头支架',(0,.073,-.09),parent=root)
box('Lamp_weighted_foot',(0,.039,-.10),(.074,.014,.075),stand,black,.006)
cyl('Lamp_post_steel',(0,.074,-.09),.006,.058,stand,chrome)
annulus('Lamp_height_collar',(0,.096,-.09),.010,.006,.010,stand,black)
knurl('Lamp_height_lock',(.013,.096,-.09),.006,.015,stand,black,(1,0,0),64)
# Cradle ears sit beside the barrel so its central optical bore remains clear.
for x in [-.023,.023]:
 box('Lamp_yoke_upright',(x,.109,-.09),(.006,.032,.021),stand,black,.002)
 cyl('Lamp_tilt_trunnion',(x,.12,-.09),.008,.009,stand,chrome,(1,0,0),48)
head=group('lampHead','可转向光纤灯头',(0,.12,-.09),{'type':'rotation','axes':['Y','X'],'rangeDegrees':[-35,35],'emissionAxisLocal':[0,0,1],'illustrative':True},root)
annulus('Lamp_body_open_bore',(0,.12,-.09),.018,.0115,.056,head,black,(0,0,1),128,.0006)
for z in [-.111,-.107,-.103]:annulus('Lamp_cooling_ring',(0,.12,z),.0193,.017,.0018,head,black,(0,0,1),96,.0003)
annulus('Lamp_front_metal_rim',(0,.12,-.060),.019,.0115,.006,head,chrome,(0,0,1),128,.0004)
annulus('Lamp_front_black_aperture',(0,.12,-.0568),.0175,.0105,.0017,head,black,(0,0,1),128,.0002)
annulus('Lamp_recessed_baffle',(0,.12,-.067),.014,.0087,.002,head,dark,(0,0,1),96,.0002)
annulus('Lamp_focus_grip',(0,.12,-.077),.0189,.0180,.010,head,black,(0,0,1),128,.0002)
# Genuine optical window is recessed within the open barrel, with nonzero thickness.
emitter=group('lampEmitter','灯头出光面',(0,.12,-.069),parent=head)
cyl('Lamp_fiber_exit_window',(0,.12,-.069),.0084,.0015,emitter,light,(0,0,1),96,.0002)
annulus('Lamp_rear_cable_collar',(0,.12,-.121),.012,.0054,.007,head,chrome,(0,0,1))
for i in range(5):cyl('Lamp_rear_strain_relief',(0,.12,-.127-i*.0025),.0062-i*.0003,.003,head,rubber,(0,0,1),48)
# Runtime may replace this deliberately separate flexible fiber with a dynamic curve.
cable=group('fiberCable','柔性光纤导光束',(-.245,.079,.043),{'type':'runtime-curve','start':[-.245,.079,.043],'end':[0,.12,-.137],'radiusMeters':.005},root)
FIBER_POINTS=[[-.245,.079,.043],[-.228,.075,.086],[-.17,.09,.109],[-.105,.15,.067],[-.085,.17,-.045],[-.05,.145,-.145],[0,.12,-.137]]
tube('Fiber_flexible_black_jacket',FIBER_POINTS,.005,cable,rubber)
for i in range(5):cyl('Source_plug_strain_relief',(-.245,.079,.037+i*.002),.0061-i*.0003,.003,cable,rubber,(0,0,1),48)

# Sample support with a genuine vertical transmission opening and lateral jaws.
stage=group('sampleStage','样品台与透射孔',(0,.081,0),parent=root)
cyl('Sample_stage_weighted_base',(0,.038,0),.047,.014,stage,black,bevel=.002)
cyl('Sample_stage_steel_column',(0,.059,0),.007,.037,stage,chrome)
annulus('Sample_stage_open_top',(0,.082,0),.036,.017,.010,stage,black,(0,1,0),128,.001)
annulus('Sample_stage_inner_edge',(0,.0873,0),.019,.017,.0007,stage,chrome,(0,1,0),96,.0001)
for x in [-.026,.026]:
 cyl('Sample_holder_mount',(x,.088,0),.0045,.010,stage,chrome)
box('Sample_holder_horizontal_guide',(0,.091,0),(.136,.005,.017),stage,chrome,.0008)
holder=group('sampleHolder','通用样品夹持器',(0,.12,0),{'type':'translation','translationAxis':[1,0,0],'rangeMeters':[-.035,.035],'illustrative':True},root)
box('Sample_holder_moving_carriage',(0,.094,0),(.066,.005,.018),holder,black,.001)
for side in [-1,1]:
 x=side*.026
 box('Sample_jaw_arm', (x,.102,0),(.004,.021,.012),holder,chrome,.001)
 box('Sample_jaw_inward_finger',(side*.020,.112,0),(.016,.004,.012),holder,chrome,.0008)
 box('Sample_jaw_soft_tip',(side*.0135,.114,0),(.004,.004,.009),holder,rubber,.0007)
 knurl('Sample_jaw_adjustment',(side*.038,.099,0),.006,.012,holder,black,(1,0,0),64)
# A black aperture frame slides laterally, retaining a clearly modelled through hole.
box('Shutter_support_rail',(.025,.064,.026),(.17,.006,.012),stage,chrome,.001)
for x in [-.049,.099]:box('Shutter_rail_feet',(x,.047,.026),(.014,.034,.023),stage,black,.002)
shutter=group('shutter','可移动遮光片',(0,.12,.024),{'type':'translation','axis':[1,0,0],'rangeMeters':[0,.075],'defaultMeters':0},root)
box('Shutter_rail_slider',(0,.071,.026),(.023,.010,.020),shutter,black,.002)
box('Shutter_vertical_stem',(0,.082,.025),(.012,.021,.005),shutter,black,.001)
plate=box('Shutter_through_aperture_plate',(0,.12,.024),(.068,.064,.003),shutter,black,.003)
boolean_hole(plate,(0,.12,.024),.011,.014)
annulus('Shutter_aperture_inner_rim',(0,.12,.026),.013,.011,.0011,shutter,black,(0,0,1),96,.0002)
knurl('Shutter_slide_handle',(.040,.113,.024),.0045,.018,shutter,black,(0,1,0),64)
box('Shutter_handle_bridge',(.035,.113,.024),(.008,.007,.003),shutter,black,.001)
# An illustrative tabletop instrument support leaves the supplied instrument to the runtime.
rest=group('instrumentRest','分光镜托架',(0,.075,.104),parent=root)
for index,z in enumerate([.074,.14]):
 support=group('instrumentRestFront' if index==0 else 'instrumentRestRear','分光镜前托架' if index==0 else '分光镜后托架',(0,.075,z),{'type':'translation','axis':[0,0,1],'illustrative':True},rest)
 box('Instrument_rest_base',(0,.038,z),(.070,.012,.026),support,black,.004)
 for side in [-1,1]:
  box('Instrument_rest_upright',(side*.021,.083,z),(.006,.080,.018),support,black,.002)
  # 90-degree V cradle; nominal 8.5 mm radius tube centre is approximately Y=.12.
  q=box('Instrument_rest_V_soft_pad',(side*.010,.117,z),(.030,.004,.018),support,rubber,.001)
  q.rotation_euler[1]=-side*pi/4

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
 'shutterCenterIsOpen':not hit(plate,(0,.12,-.001),(0,0,1),.050),
 'shutterOpaqueSurroundBlocks':hit(plate,(.024,.12,-.001),(0,0,1),.050),
 'headBoreIsOpen':not hit(bpy.data.objects['Lamp_body_open_bore'],(0,.12,-.06),(0,0,-1),.06),
 'sourceFrontSocketIsOpen':not hit(bpy.data.objects['Source_front_bezel'],(-.245,.079,.04),(0,0,-1),.05),
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
 'id':'spectroscope-workbench','version':'bench-1','date':'2026-10-10','title':'分光镜共享照明与样品工作台','model':'model.glb','poster':'poster.png','sha256':digest,'byteLength':size,'units':'meter','upAxis':'Y','rootNode':'Bench_root','boundsMeters':bounds,'dimensionsCalibrated':False,'opticalSimulation':False,'photometrySimulated':False,
 'parts':parts,'sampleCenter':[0,.12,0],'opticalAxis':[0,0,1],
 'lamp':{'pivot':[0,.12,-.09],'emitterNode':'Bench_lampEmitter','emitterWorld':[0,.12,-.069],'emitterLocal':[0,0,.021],'emissionAxisLocal':[0,0,1],'apertureDiameterMeters':.0174,'type':'illustrative broadband halogen fiber illuminator','colorTemperatureCalibrated':False},
 'fiber':{'node':'Bench_fiberCable','radiusMeters':.005,'points':FIBER_POINTS,'replaceWithRuntimeCurve':True,'headAttachmentLocal':[0,0,-.047]},
 'shutter':{'node':'Bench_shutter','apertureDiameterMeters':.022,'translationAxis':[1,0,0],'rangeMeters':[0,.075],'defaultMeters':0},
 'instrumentPlacement':{'opticalAxis':[0,0,1],'opticalAxisHeightMeters':.12,'suggestedEntranceZ':.045,'includedInThisAsset':False,'restType':'90 degree V cradle','restApexY':.1098284271,'nominalTubeRadiusMeters':.0085,'adjustRestHeightForInstrumentRadius':True,'supportNodes':['Bench_instrumentRestFront','Bench_instrumentRestRear'],'supportDefaultWorldZ':[.074,.14]},
 'notes':['独立原创参数化教学资产，无品牌标识；未复刻特定厂家型号。','尺寸、灯头与样品夹行程属于教学设计，非实物测量。','卤素光纤宽带白光语义由课程定义，本模型不计算灯丝、色温、光谱响应或照度。','光路和样品分别由练习程序绘制；工作台 GLB 不含分光镜及样品，亦不提供谱带真值。','遮光片和灯头为真实开口；可动范围需由运行时限制并检查机械避碰。']}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
provenance={'id':manifest['id'],'date':'2026-10-10','version':'bench-1','method':'Original parametric hard-surface teaching design; no cloud triangles, manufacturer CAD or photographic pixels copied into GLB.','modelSha256':digest,'byteLength':size,'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'rebuildScript':'gem-lab/tools/3d-assets/spectroscope-workbench/build_bench.py','dimensionsCalibrated':False,'manufacturerAuthorizedDigitalTwin':False,'opticalSimulation':False,'photometrySimulated':False,'sources':[{'url':'https://www.kruess.com/produkte/kaltlichtquellen/kaltlichtquellen-mit-helligkeitsreglung/','title':'KRÜSS cold light sources with brightness control','use':'Functional reference for separate light-source box, intensity control and fiber light-guide head. Not a dimensional copy.','retrieved':'2026-10-10'}],'cloudCandidateUsage':'Separate external appearance comparison if supplied; not used as this asset geometry.','verification':{'meshChecks':'validation/mesh-check.json','gltfValidator':'pending verify_bench.mjs','browserAcceptance':False,'userAppearanceAcceptance':False}}
(OUT/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
# Editable master has convenient product studio, separated from exported asset.
world=bpy.data.worlds.new('Cool neutral product studio');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.26,.30,.34,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
floor=box('STUDIO_FLOOR',(0,-.006,0),(200,.002,200),root,mat('Studio background',(.085,.105,.125),0,.7),0);floor.parent=None;meshes.remove(floor)
def area(name,loc,power,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=V(loc);o.rotation_euler=(V((-.05,.08,0))-o.location).to_track_quat('-Z','Y').to_euler()
area('Studio_large_soft_key',(.2,.65,.35),38,.6,(.92,.96,1));area('Studio_warm_rim',(-.4,.45,-.3),52,.4,(1,.93,.84));area('Studio_front_fill',(-.1,.3,.5),12,.4,(1,1,1))
d=bpy.data.cameras.new('Product camera');camera=bpy.data.objects.new('Product camera',d);scene.collection.objects.link(camera);scene.camera=camera;d.type='ORTHO';d.lens=55
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=48;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=8;scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.6
def viewpoint(loc,target,scale):camera.location=V(loc);camera.rotation_euler=(V(target)-camera.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=scale
viewpoint((.62,.5,.75),(-.03,.07,0),.78);bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(EDIT/'spectroscope-workbench-master.blend'))
shutil.copy2(Path(__file__),EDIT/'build_bench.py')
if args.render:
 views=[('overview',(.62,.5,.75),(-.03,.07,0),.78),('light-source',(-.51,.30,.40),(-.205,.087,-.065),.31),('lamp-head',(.15,.21,.11),(0,.12,-.086),.19),('sample-shutter',(.13,.22,.25),(0,.105,.01),.205),('top',(-.03,.9,0),(-.03,.07,0),.72),('rear',(-.52,.38,-.60),(-.03,.07,0),.75)]
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
