"""Original parametric educational microscope. No imported geometry/textures.
Blender --background --python build_original.py -- [--render hero|all|none]
The original design deliberately uses independent BF / DF sources and a black
central slider; it does not claim to reproduce a manufacturer's internal optics.
"""
import bpy, math, json, sys, argparse, hashlib
from pathlib import Path
from mathutils import Vector
from math import sin, cos, pi
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
OUT=ROOT/'assets-source/gem-microscope/original-design/2026-10-08/v1'
PARAM=json.loads((HERE/'parameters.json').read_text())
CONTRACT=json.loads((HERE/'contract.json').read_text())
parser=argparse.ArgumentParser();parser.add_argument('--render',choices=['hero','all','none'],default='hero')
a=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT.mkdir(parents=True,exist_ok=True);(OUT/'renders').mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
sc=bpy.context.scene;sc.unit_settings.system='METRIC';sc.unit_settings.length_unit='METERS'
parts=[];meshes=[]
def gl(p):return [round(p[0],6),round(p[2],6),round(-p[1],6)]
def mat(name,c,metal=0,rough=.4,trans=0,emit=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(*c,1);s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=rough;s.inputs['Transmission Weight'].default_value=trans
 if trans:s.inputs['IOR'].default_value=1.46
 if emit:s.inputs['Emission Color'].default_value=(*c,1);s.inputs['Emission Strength'].default_value=emit
 return m
sage=mat('Mineral sage satin powder coat',(.235,.327,.304),.18,.3)
ivory=mat('Warm porcelain satin coating',(.79,.80,.745),.12,.3)
graphite=mat('Graphite anodized metal',(.028,.039,.043),.55,.31)
rubber=mat('Soft black elastomer',(.009,.013,.016),0,.6)
metal=mat('Satin titanium accent',(.48,.53,.52),.86,.24)
black=mat('Light absorbing chamber black',(.008,.010,.012),.03,.8)
glass=mat('Clear protective optical surface',(.84,.91,.89),0,.09,.94)
lens=mat('Neutral coated optical lens',(.048,.081,.078),.1,.09,.8)
bfmat=mat('Brightfield diffuser independent LED',(.91,.94,1),0,.55,0,1)
dfmat=mat('Darkfield directed LED independent circuit',(1,.94,.81),0,.48,0,1)
gemmat=mat('Teaching specimen translucent blue green',(.17,.53,.50),.05,.09,.65)
labelmat=mat('Control markings',(.70,.75,.70),.1,.45)
def empty(name,at=(0,0,0),parent=None):
 o=bpy.data.objects.new(name,None);sc.collection.objects.link(o);o.location=at
 if parent:o.parent=parent;o.matrix_parent_inverse=parent.matrix_world.inverted()
 bpy.context.view_layer.update();return o
asset=empty('OriginalTeachingMicroscope');tilt=empty('Rig_Tilt',PARAM['tiltPivot'],asset);focus=empty('Rig_Focus',(0,-.01,.260),tilt)
def part(id,label,parent,at,offset=(0,0,0),group='mechanics',note='原创教学结构，尺寸为设计值。'):
 o=empty('Part_'+id,at,parent);parts.append({'id':id,'node':o.name,'label':label,'note':note,'group':group,'explodeOffset':gl(offset),'hotspot':gl(at),'parentRig':'Rig_Focus' if parent==focus else ('Rig_Tilt' if parent==tilt else 'OriginalTeachingMicroscope')});return o

def attach(o,p,m,bev=0):
 o.data.materials.append(m);bpy.context.view_layer.objects.active=o
 if bev:
  mod=o.modifiers.new('Edge fillet','BEVEL');mod.width=bev;mod.segments=4
  bpy.ops.object.modifier_apply(modifier=mod.name)
 for f in o.data.polygons:f.use_smooth=True
 try:
  mod=o.modifiers.new('Machined surface normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 except Exception:pass
 o.parent=p;o.matrix_parent_inverse=p.matrix_world.inverted();meshes.append(o);return o

def mesh(name,v,f,p,m,bev=0):
 d=bpy.data.meshes.new(name);d.from_pydata(v,[],f);d.update();o=bpy.data.objects.new(name,d);sc.collection.objects.link(o);return attach(o,p,m,bev)
def box(name,loc,dim,p,m,bev=.002):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return attach(o,p,m,bev)
def cyl(name,loc,r,h,p,m,axis=(0,0,1),bev=.0006,n=64):
 bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=h,location=loc);o=bpy.context.object;o.name=name;o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector(axis).to_track_quat('Z','Y');bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);return attach(o,p,m,bev)
def ring(name,loc,ro,ri,h,p,m,axis=(0,0,1),n=96,bev=.0004):
 q=Vector(axis).to_track_quat('Z','Y');v=[];f=[]
 for z,r in [(-h/2,ro),(h/2,ro),(h/2,ri),(-h/2,ri)]:
  v.extend(tuple(Vector(loc)+q@Vector((r*cos(2*pi*i/n),r*sin(2*pi*i/n),z))) for i in range(n))
 for j in range(4):
  for i in range(n):f.append((j*n+i,j*n+(i+1)%n,((j+1)%4)*n+(i+1)%n,((j+1)%4)*n+i))
 return mesh(name,v,f,p,m,bev)
def tube(name,pts,r,p,m):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.resolution_u=16;d.bevel_depth=r;d.bevel_resolution=3;d.use_fill_caps=True;s=d.splines.new('BEZIER');s.bezier_points.add(len(pts)-1)
 for b,pt in zip(s.bezier_points,pts):b.co=pt;b.handle_left_type='AUTO';b.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,d);sc.collection.objects.link(o);bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');return attach(o,p,m)
def screw(name,loc,p,axis=(0,0,1),r=.002):
 cyl(name,loc,r,.001,p,metal,axis,bev=.00015,n=24)
 # Dark inset is a recessed hexagonal socket, not a flat printed screw texture.
 cyl(name+'_socket',Vector(loc)+Vector(axis)*.00053,r*.43,.00012,p,black,axis,bev=0,n=6)
def textmark(name,string,loc,size,p,m,rotation=(0,0,0)):
 d=bpy.data.curves.new(name,'FONT');d.body=string;d.size=size;d.extrude=.00003;d.align_x='CENTER';d.align_y='CENTER';o=bpy.data.objects.new(name,d);sc.collection.objects.link(o);o.location=loc;o.rotation_euler=rotation;bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');return attach(o,p,m)
def knurl(name,loc,r,h,p,m,axis=(1,0,0),n=96):
 q=Vector(axis).to_track_quat('Z','Y');v=[];f=[]
 for z,scale in [(-h/2,.93),(-h/2+.001,1),(h/2-.001,1),(h/2,.93)]:
  for i in range(n):
   rr=r*scale*(1 if i%2==0 else .967);v.append(tuple(Vector(loc)+q@Vector((rr*cos(2*pi*i/n),rr*sin(2*pi*i/n),z))))
 for j in range(3):
  for i in range(n):f.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
 f += [tuple(reversed(range(n))),tuple(3*n+i for i in range(n))]
 return mesh(name,v,f,p,m,.00025)
# Stationary original wedge base: broad front shoulders and narrower rear.
base=part('Base','楔形稳固底座',asset,(0,0,.032),(0,0,-.035),'base')
v=[(-.113,-.101,.012),(.113,-.101,.012),(.098,.097,.012),(-.098,.097,.012),(-.110,-.098,.044),(.110,-.098,.044),(.095,.094,.054),(-.095,.094,.054)]
f=[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
mesh('Wedge_base_shell',v,f,base,sage,.010)
deck=part('BaseDeck','底座上盖与装配缝',asset,(0,0,.049),(0,0,.008),'base');box('Graphite floating upper deck',(0,-.001,.051),(.195,.173,.010),deck,graphite,.008)
feet=part('Feet','隔振脚垫',asset,(0,0,.008),(0,0,-.018),'base')
for x in [-.085,.085]:
 for y in [-.073,.073]:cyl('Foot', (x,y,.008),.012,.012,feet,rubber,bev=.002)
power=part('PowerButton','侧面电源键',asset,(.108,-.065,.032),(.028,0,0),'base','侧面开关控制两路照明总电源。')
cyl('Power bezel',(.107,-.065,.032),.0067,.003,power,metal,(1,0,0));cyl('Power push surface',(.109,-.065,.032),.0053,.003,power,graphite,(1,0,0));ring('Power icon arc',(.1107,-.065,.032),.0027,.00235,.0001,power,labelmat,(1,0,0),48,0)
mode=part('ModeSelector','明域与暗域选择器',asset,(-.049,-.077,.057),(0,-.025,0),'base','选择明域或暗域，电路互斥；结构与操作均为原创设定。')
knurl('Mode selector',(-.049,-.077,.057),.009,.008,mode,graphite,(0,0,1));box('Mode index',(-.049,-.081,.0613),(.0013,.005,.0003),mode,labelmat,.0001)
textmark('BF mark','BF',(-.069,-.077,.0565),.004,mode,labelmat);textmark('DF mark','DF',(-.029,-.077,.0565),.004,mode,labelmat)
brightness=part('BrightnessDial','照明强度旋钮',asset,(.042,-.077,.057),(0,-.025,0),'base');knurl('Brightness control',(.042,-.077,.057),.009,.008,brightness,graphite,(0,0,1));box('Intensity marker',(.042,-.081,.0613),(.0013,.005,.0003),brightness,labelmat,.0001)
# Central transverse tilt bearing, stationary saddles and moving shaft.
saddles=part('TiltSaddles','倾斜轴支座',asset,(0,-.010,.065),(0,.025,0),'mechanics')
for x in [-.067,.067]:box('Bearing saddle',(x,-.01,.064),(.018,.037,.026),saddles,sage,.005)
hinge=part('TiltHinge','整组倾斜轴与锁紧旋钮',tilt,(0,-.01,.075),(0,.030,0),'mechanics','同轴带动灯室、载物台、镜臂、夹具与镜头；底座保持固定。')
cyl('Tilt cross shaft',(0,-.01,.075),.009,.143,hinge,metal,(1,0,0));cyl('Lamp carrier central shaft sleeve',(0,-.01,.075),.012,.070,hinge,graphite,(1,0,0));knurl('Tilt lock',(-.080,-.01,.075),.017,.012,hinge,graphite,(1,0,0));cyl('Tilt lock cap',(-.0865,-.01,.075),.011,.001,hinge,metal,(1,0,0))
# Rounded continuous rear arch, authored sweep sections in Y/Z.
arm=part('Arm','连续弧形后支臂',tilt,(0,.068,.19),(0,.045,0),'mechanics')
centers=[(.040,.080,.025,.013),(.079,.095,.026,.014),(.103,.140,.026,.015),(.105,.195,.024,.015),(.088,.241,.023,.014),(.050,.275,.025,.014),(.008,.286,.030,.013)]
v=[];n=32
for j,(y,z,rx,rt) in enumerate(centers):
 before=Vector(centers[max(0,j-1)][:2]);after=Vector(centers[min(len(centers)-1,j+1)][:2]);d=(after-before).normalized();norm=Vector((-d.y,d.x))
 for i in range(n):
  t=2*pi*i/n;v.append((rx*math.copysign(abs(cos(t))**.45,cos(t)),y+rt*math.copysign(abs(sin(t))**.45,sin(t))*norm.x,z+rt*math.copysign(abs(sin(t))**.45,sin(t))*norm.y))
f=[]
for j in range(len(centers)-1):
 for i in range(n):f.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
f.extend([tuple(reversed(range(n))),tuple((len(centers)-1)*n+i for i in range(n))]);o=mesh('Sculpted arch support',v,f,arm,ivory)
mod=o.modifiers.new('Continuous support curvature','SUBSURF');mod.levels=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
tube('Rear joint accent',[(0,.109,.121),(0,.120,.174),(0,.115,.208)],.0007,arm,metal)
# Bottom light chamber.
chamber=part('LampHousing','台下双路照明灯室',tilt,(0,-.01,.107),(0,0,-.040),'illumination','独立中央扩散明域与环形准直暗域；此灯室为原创教学设计。')
ring('Lamp chamber wall',(0,-.01,.107),.0515,.048,.038,chamber,sage,n=128,bev=.0015)
cyl('Lamp chamber floor',(0,-.01,.0875),.050,.004,chamber,graphite,bev=.0015)
ring('Upper lamp bezel',(0,-.01,.126),.052,.041,.005,chamber,metal,n=128,bev=.0006)
for ang in [30,150,270]:
 t=math.radians(ang);screw('Lamp assembly screw',(.047*cos(t),-.01+.047*sin(t),.129),chamber)
bf=part('BrightfieldLED','中央明域扩散光源',tilt,(0,-.01,.101),(0,0,-.023),'illumination','中央光路提供透射明域；与暗域电路互斥。')
cyl('Brightfield diffuser mount',(0,-.01,.099),.0125,.004,bf,metal)
cyl('Emitter_Brightfield',(0,-.01,.101),.0115,.0008,bf,bfmat,bev=.00015)
sep=part('OpticalSeparator','中心黑色隔光管',tilt,(0,-.01,.109),(0,0,.017),'illumination','环形暗域与中央扩散光路之间的黑色隔光结构。')
ring('Central black tube',(0,-.01,.109),.0145,.0125,.030,sep,black,n=96,bev=.0004)
df=part('DarkfieldLED','环形定向暗域光源',tilt,(0,-.01,.110),(0,0,-.015),'illumination','16 个独立准直单元指向样品；每单元半发散角 4° 为教学设计参数。')
dfemit=empty('Emitter_Darkfield',(0,-.01,.110),df)
ring('Annular LED carrier',(0,-.01,.099),.040,.030,.003,df,graphite)
for i in range(PARAM['darkfieldLedCount']):
 t=2*pi*i/PARAM['darkfieldLedCount'];loc=Vector((.035*cos(t),-.01+.035*sin(t),.110));direction=(Vector(PARAM['sampleCenter'])-loc).normalized()
 cyl('DF collimator barrel %02d'%i,loc-direction*.005,.0038,.010,df,black,direction,bev=.00045,n=32)
 cyl('DF emission patch %02d'%i,loc,.0015,.0005,dfemit,dfmat,direction,bev=.00008,n=32)
window=part('LightWindow','环形防尘透光窗',tilt,(0,-.01,.126),(0,0,.026),'illumination','防尘窗的透明材质仅为外观；浏览器光路采用显式示意。')
ring('Annular clear protective pane',(0,-.01,.126),.040,.016,.001,window,glass,n=128,bev=.0001)
shutter=part('DarkfieldShutter','中央明域遮光快门',tilt,(0,-.01,.130),(.035,0,.02),'illumination','原创滑动挡片：暗域时覆盖中央明域口，明域时平移至侧边保护仓。')
cyl('Central black shutter blade',(0,-.01,.130),.015,.0012,shutter,black,bev=.0002)
tongue=box('Shutter guide tongue',(.024,-.01,.130),(.028,.0018,.0012),shutter,black,.00025)
# Narrow guide tongue passes between adjacent DF collimators, not across a beam.
slant=math.radians(11.25)
for ob in [tongue]:
 rel=ob.location-Vector((0,-.01,.130));ob.location=Vector((rel.x*cos(slant)-rel.y*sin(slant),-.01+rel.x*sin(slant)+rel.y*cos(slant),ob.location.z));ob.rotation_euler.z+=slant
rail=part('ShutterGuide','遮光片侧向导轨与保护仓',tilt,(.053,-.01,.131),(.030,0,0),'mechanics')
railmesh=[]
for yy in [-.015,-.005]:railmesh.append(box('Slider rail',(.058,yy,.130),(.032,.002,.003),rail,graphite,.0003))
railmesh.append(box('Shutter pocket cover',(.055,-.01,.1327),(.058,.035,.002),rail,graphite,.001))
for ob in railmesh:
 rel=ob.location-Vector((0,-.01,.130));ob.location=Vector((rel.x*cos(slant)-rel.y*sin(slant),-.01+rel.x*sin(slant)+rel.y*cos(slant),ob.location.z));ob.rotation_euler.z+=slant
# Fixed stage, clearly open light well.
stage=part('Stage','固定通光口载物台',tilt,(0,-.01,.137),(0,0,.043),'mechanics','固定 88 mm 通光孔；未构造缺少依据的虹彩光阑。')
ring('Satin stage platform',(0,-.01,.137),.069,.044,.010,stage,graphite,n=128,bev=.0015)
ring('Stage polished edge',(0,-.01,.137),.070,.068,.004,stage,metal,n=128,bev=.0003)
for ang in [50,130,230,310]:
 t=math.radians(ang);screw('Stage assembly fastener',(.059*cos(t),-.01+.059*sin(t),.1425),stage,r=.0015)
# Holder suspended sample, with physical clearance to light opening.
holder=part('GemHolder','悬持式宝石夹',tilt,(.044,-.01,.157),(.033,0,.03),'specimen','样品悬置于通光口上方；不把样品放在灯窗表面。')
cyl('Holder mounting post',(.057,-.01,.151),.004,.023,holder,metal)
cyl('Holder ball',(.057,-.01,.162),.006,.009,holder,graphite)
tube('Holder upper jaw',[(.058,-.01,.165),(.024,-.01,.168),(.006,-.01,.165)],.0012,holder,metal)
tube('Holder lower jaw',[(.058,-.01,.161),(.025,-.01,.158),(.006,-.01,.163)],.0012,holder,metal)
knurl('Holder adjustment knob',(.061,-.01,.162),.005,.007,holder,graphite,(1,0,0))
sample=part('Sample','固定示意样品',tilt,PARAM['sampleCenter'],(0,-.025,.023),'specimen','原创透明示意样品；颜色与亮度不代表实测宝石观察结果。')
v=[(0,-.01,.1688)]+[(.0038*cos(2*pi*i/8),-.01+.0038*sin(2*pi*i/8),.165) for i in range(8)]+[(.0028*cos(2*pi*i/8),-.01+.0028*sin(2*pi*i/8),.163) for i in range(8)]+[(0,-.01,.1612)];f=[]
for i in range(8):f.extend([(0,1+i,1+(i+1)%8),(1+i,9+i,9+(i+1)%8,1+(i+1)%8),(17,9+(i+1)%8,9+i)])
samplemesh=mesh('Faceted teaching specimen',v,f,sample,gemmat)
for p in samplemesh.data.polygons:p.use_smooth=False
# Focus mechanics + optical head.
track=part('FocusTrack','调焦导轨',tilt,(0,.012,.261),(0,.02,.015),'mechanics');box('Fixed vertical focus rail',(0,.019,.260),(.027,.016,.060),track,graphite,.003)
carrier=part('FocusCarrier','镜头调焦滑座',focus,(0,.0,.267),(0,.012,.025),'mechanics');box('Optical head focus carrier',(0,.005,.264),(.052,.033,.040),carrier,sage,.004)
knobs=part('FocusKnobs','双侧调焦旋钮',tilt,(0,.016,.261),(.035,0,0),'mechanics','旋钮对应镜头沿观察轴升降；灯室与样品位置不随调焦改变。')
for x in [-.039,.039]:
 knurl('Focus grip',(x,.016,.262),.019,.019,knobs,graphite,(1,0,0));cyl('Focus cap',(x+(.010 if x>0 else -.010),.016,.262),.012,.0015,knobs,metal,(1,0,0))
body=part('Head','双目观察镜体',focus,(0,-.014,.277),(0,0,.050),'optics','镜头外壳为原创设计；内部光学系统未完整光线追迹。')
box('Rounded binocular bridge',(0,-.020,.280),(.082,.065,.039),body,ivory,.012)
obj=part('Objective','物镜与观察入口',focus,(0,-.01,.246),(0,0,-.019),'optics','观察入口半径 13 mm 是教学包络参数，不是厂家实测入瞳。')
ring('Objective housing',(0,-.01,.252),.023,.014,.026,obj,graphite,bev=.002)
ring('Objective protective rim',(0,-.01,.240),.022,.014,.003,obj,metal,bev=.0004)
cyl('Observation_Entrance',(0,-.01,.244),.013,.001,obj,lens,bev=.0002)
zoom=part('ZoomRing','倍率调节环',focus,(0,-.010,.264),(.026,0,0),'optics','当前只提供结构介绍；不以模型缩放模拟真实变倍成像。')
knurl('Zoom ring',(0,-.01,.263),.025,.011,zoom,graphite,(0,0,1));ring('Zoom accent',(0,-.01,.268),.0255,.024,.0015,zoom,metal)
eyes=part('Eyepieces','倾斜双目目镜',focus,(0,-.05,.313),(0,-.026,.033),'optics','双目目镜结构示意；未实现双路真实成像或瞳距调节。')
axis=Vector((0,-.68,.733)).normalized()
for x in [-.024,.024]:
 start=Vector((x,-.039,.293));center=start+axis*.016
 cyl('Inclined eyepiece tube',center,.015,.042,eyes,graphite,axis,bev=.0012)
 ring('Eyepiece metal collar',start+axis*.029,.0156,.0125,.006,eyes,metal,axis,bev=.0005)
 ring('Soft eyecup',start+axis*.038,.018,.011,.014,eyes,rubber,axis,bev=.002)
 cyl('Eyepiece dark interior',start+axis*.041,.0108,.001,eyes,black,axis,bev=.0001)
 ring('Eyecup lip',start+axis*.045,.017,.011,.003,eyes,rubber,axis,bev=.0007)
 cyl('Eyepiece lens',start+axis*.044,.0105,.001,eyes,lens,axis,bev=.0001)
# Cable belongs to moving rig and follows its curve; static power cord not invented.
cable=part('InternalCable','灯室低压线保护套',tilt,(.033,.043,.098),(0,.023,0),'mechanics','原创低压线保护示意；不包含真实电路规格。')
tube('Flexible cable sheath',[(.039,.012,.092),(.043,.049,.09),(.025,.07,.12)],.002,cable,rubber)
# Baseline contract and manifest; all optical coordinates already glTF local.
CONTRACT['optics']['darkfield']['emittingPatchRadius']=.0015
CONTRACT['optics']['fixedAperture']['heightRange']=[.057,.067]
CONTRACT['optics']['darkfield']['shutter']['thickness']=.0012
(OUT/'contract.json').write_text(json.dumps(CONTRACT,ensure_ascii=False,indent=2)+'\n')
(HERE/'contract.json').write_text(json.dumps(CONTRACT,ensure_ascii=False,indent=2)+'\n')
# Export just asset nodes. Emission factor retained to permit independent runtime switching.
bpy.ops.object.select_all(action='DESELECT')
for o in [asset,tilt,focus]+[o for o in bpy.data.objects if o.type=='EMPTY' and o not in [asset,tilt,focus]]+meshes:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'model.glb'),export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_apply=True)
sha=hashlib.sha256((OUT/'model.glb').read_bytes()).hexdigest()
triangles=sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons)
coords=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box];mins=[min(v[k] for v in coords) for k in range(3)];maxs=[max(v[k] for v in coords) for k in range(3)]
manifest={**CONTRACT,'title':'原创宝石显微镜 · 双路照明教学候选','parts':parts,'shellIds':['Base','BaseDeck','LampHousing','Stage','Head','Arm','LightWindow','ShutterGuide'],'modelSha256':sha,'poster':'renders/hero.png','statistics':{'meshes':len(meshes),'triangles':triangles,'fileBytes':(OUT/'model.glb').stat().st_size,'dimensionsMeters':gl([maxs[i]-mins[i] for i in range(3)])},'defaultState':{'power':False,'mode':'darkfield','brightness':.7,'tiltDegrees':0,'focusMeters':0},'acceptance':'Original appearance candidate and explicit educational optical arrangement; not manufacturer reproduction, physical calibration or observed gemstone data.'}
manifest['statistics']['dimensionsMeters']=[abs(n) for n in manifest['statistics']['dimensionsMeters']]
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
prov={'assetId':PARAM['assetId'],'createdDate':'2026-10-08','origin':'All geometry and materials authored by local parameterized Blender script; no manufacturer image, mesh or texture imported.','designDimensions':'Original design choices, not measurements.','references':[{'url':'https://www.szfable.cn/product/1132.html','use':'Functional reference for mutually exclusive bright/dark illumination only. Exterior, component geometry and hidden illumination construction not copied.'},{'url':'http://bgyq.cn/M/M.html','use':'General functional context of gemstone darkfield microscopy only; no ellipsoid dimensions or manufacturer layout adopted.'}], 'opticalBoundary':'Independent axial diffused BF and collimated oblique DF emitters with central black shutter are an original teaching arrangement, not evidence of either reference manufacturer internal construction. LED divergence and sample/entrance are assumed design envelopes. No specimen observations claimed.','sourceFiles':['tools/3d-assets/microscope-original/build_original.py','tools/3d-assets/microscope-original/parameters.json','tools/3d-assets/microscope-original/contract.json'],'modelSha256':sha}
prov['sourceSha256']={name:hashlib.sha256((HERE/name).read_bytes()).hexdigest() for name in ['build_original.py','parameters.json','contract.json']}
(OUT/'provenance.json').write_text(json.dumps(prov,ensure_ascii=False,indent=2)+'\n')
# Controlled studio rendering rig, excluded from GLB.
sc.render.engine='CYCLES';sc.cycles.samples=PARAM['renderSamples'];sc.cycles.use_denoising=True
sc.render.resolution_x=1500;sc.render.resolution_y=1500;sc.render.resolution_percentage=100
sc.world.color=(.17,.19,.21)
world=sc.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.24,.28,.28,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.33
sc.view_settings.view_transform='AgX'
floorMat=mat('Studio warm grey',(.16,.175,.17),0,.78)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,.001));floor=bpy.context.object;floor.name='Studio floor';floor.data.materials.append(floorMat)
def light(name,loc,energy,size,color,target=(0,0,.16)):
 d=bpy.data.lights.new(name,'AREA');o=bpy.data.objects.new(name,d);sc.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();d.energy=energy;d.shape='DISK';d.size=size;d.color=color
light('Large warm key',(-.36,-.35,.55),18,.45,(1,.92,.82));light('Cool edge',(.29,.15,.43),25,.32,(.80,.90,1));light('Front fill',(.32,-.45,.28),8,.32,(1,1,1))
bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Review camera';sc.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=.425;cam.data.lens=55
cam.location=(.47,-.62,.40);cam.rotation_euler=(Vector((0,0,.17))-cam.location).to_track_quat('-Z','Y').to_euler()
for m in [bfmat,dfmat]:m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=0
# Closed darkfield shutter / lamp off are the stored master defaults.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'microscope.blend'))
def render(name,loc,target,scale=.43,hide=[]):
 cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
 for id in hide:
  p=next((o for o in bpy.data.objects if o.name=='Part_'+id),None)
  if p:
   for o in p.children_recursive:o.hide_render=True
 sc.render.filepath=str(OUT/'renders'/f'{name}.png');bpy.ops.render.render(write_still=True)
 for id in hide:
  p=next((o for o in bpy.data.objects if o.name=='Part_'+id),None)
  if p:
   for o in p.children_recursive:o.hide_render=False
if a.render!='none':render('hero',(.47,-.62,.40),(0,0,.17),.425)
if a.render=='all':
 render('front',(0,-.70,.26),(0,0,.17),.425)
 render('side',(.70,0,.26),(0,0,.17),.425)
 render('back',(.25,.65,.30),(0,0,.17),.425)
 render('light-chamber',(.17,-.22,.25),(0,-.01,.115),.19,['LampHousing','Stage','LightWindow','Head','Objective','ZoomRing','Eyepieces','GemHolder','Sample','ShutterGuide'])
print('ORIGINAL_ASSET_RESULT '+json.dumps({'output':str(OUT),'sha256':sha,**manifest['statistics']}))
