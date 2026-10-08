"""Reference-constrained teaching refractometer. Blender 5.2, no external add-ons.
Run from any cwd: blender --background --python gem-lab/tools/3d-assets/build_refractometer.py -- [--candidate relative.glb] [--render] [--samples 40]
Paths resolve relative to gem-lab. Never edits or replaces the Tripo original.
Blender native axes X=width, Y=rearward, Z=up. glTF Y=up conversion is explicit in manifest.
"""
from pathlib import Path
import bpy, bmesh, math, json, sys, hashlib, shutil, argparse
from mathutils import Vector, Matrix
from datetime import datetime, timezone
sys.path.insert(0, str(Path(__file__).resolve().parent))
from refractometer_round3_geometry import GEOMETRY as G, make_paths, write_report, add, mul, basis
P = next(p for p in Path(__file__).resolve().parents if (p/'public/assets').is_dir() and (p/'tools/3d-assets').is_dir())
SRC = P / 'assets-source/refractometer/tripo-trials/2026-10-07'
OUT = SRC / 'repair-v3'
PUB = P / 'public/assets/3d/refractometer/structure-v1'
for d in [OUT/'renders', OUT/'analysis', OUT/'source', PUB]: d.mkdir(parents=True, exist_ok=True)
a=argparse.ArgumentParser(); a.add_argument('--candidate',default='assets-source/refractometer/tripo-trials/2026-10-07/round2-white/candidate.glb'); a.add_argument('--render',action='store_true'); a.add_argument('--samples',type=int,default=40)
args=a.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
CAND=(P/args.candidate).resolve()
# Documented nominal design dimensions, not measurements of the branded reference.
D={'width':.068,'length':.165,'rear_y':.0825,'front_y':-.0825,'bottom_z':.004,'stage_z':.0755,'cover_open_degrees':100,'cover_hinge':[0,.078,.084],'eyepiece_axis':[0,-.48,.877268],'shellThickness':.003,'stageTiltDegrees':8.5}
D['dimensionsCalibrated']=False
D['opticalGeometry']=G
D['eyepiece_axis']=G['eyeAxis']
optical_check=write_report(P/'assets-source/instruments-2026-10-07/round3/refractometer-optical-path-check.json', G)
if not optical_check['ok']:raise RuntimeError('Round-3 optical geometry checks failed')
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for dat in list(bpy.data.materials): bpy.data.materials.remove(dat)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
scene.render.engine='CYCLES'; scene.cycles.samples=args.samples; scene.cycles.use_denoising=True
scene.render.resolution_x=1400; scene.render.resolution_y=1400; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=False
scene.render.threads_mode='FIXED'; scene.render.threads=3
scene.view_settings.view_transform='AgX'; scene.view_settings.look='AgX - Medium High Contrast'
scene.world.color=(.35,.35,.35)
world=bpy.data.worlds.new('Studio neutral') if not scene.world else scene.world
scene.world=world; world.use_nodes=True; world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.72,.75,.8,1); world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.32
root=bpy.data.objects.new('Refractometer',None); scene.collection.objects.link(root)
root['instrumentId']='refractometer'; root['dimensionsCalibrated']=False; root['teachingOpticsSimulated']=False; root['internalOpticsIllustrative']=True; root['opticalSimulation']=False
parts=[]
def gl(v):return [round(v[0],7),round(v[2],7),round(-v[1],7)]
def mat(name,col,metal=0,rough=.3,trans=0,ior=1.5):
 m=bpy.data.materials.new(name); m.use_nodes=True; n=m.node_tree.nodes.get('Principled BSDF'); n.inputs['Base Color'].default_value=(*col,1); n.inputs['Metallic'].default_value=metal; n.inputs['Roughness'].default_value=rough; n.inputs['Transmission Weight'].default_value=trans; n.inputs['IOR'].default_value=ior; m.diffuse_color=(*col,1); return m
coat=mat('Body ivory white coated shell',(.88,.90,.91),.05,.31)
inner=mat('Internal non-reflective black',(.006,.008,.011),0,.62)
satin=mat('Stage brushed stainless steel',(.61,.64,.65),.9,.28)
silver=mat('Turned silver edges',(.53,.56,.58),.92,.18)
anod=mat('Eyepiece anodized black',(.008,.009,.011),.45,.25)
rubber=mat('Base rubber pads',(.018,.019,.021),0,.7)
glass=mat('Dark high RI contact prism - uncalibrated schematic',(.035,.068,.083),0,.085,.83,1.88)
lens=mat('Optical lens - visual schematic',(.12,.18,.21),0,.075,.94,1.52)
polglass=mat('Polarizing filter - visual schematic',(.075,.092,.075),0,.1,.56,1.5)
mirror=mat('Internal mirror surface - schematic',(.84,.87,.89),1,.08)
scale_white=mat('Transparent scale reticle plate',(.75,.84,.86),0,.14,.91,1.52)
scale_ink=mat('Scale ticks',(.024,.032,.036),0,.5)
portglass=mat('Built-in monochromatic filter - illustration',(.98,.61,.025),0,.18,.35,1.5)
# Microfinish in Cycles only. Core PBR values and complete geometry remain usable in glTF.
for m,scale,strength,distance in [(coat,3500,.08,.00007),(satin,1200,.025,.00001)]:
 n=m.node_tree.nodes; l=m.node_tree.links; noise=n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=scale
 bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=strength; bump.inputs['Distance'].default_value=distance
 l.new(noise.outputs['Fac'],bump.inputs['Height']); l.new(bump.outputs['Normal'],n.get('Principled BSDF').inputs['Normal'])

def part(id,label,pivot=(0,0,0),axis=(0,0,1),rot=False,explode=(0,0,0),note=None,hotspot=None):
 o=bpy.data.objects.new('Refractometer_'+id,None); scene.collection.objects.link(o); o.parent=root; o.location=pivot; o['partId']=id; o['label']=label
 p={'id':id,'label':label,'node':o.name,'pivot':gl(pivot),'rotationAxisLocal':gl(axis),'rotatable':rot,'explodeOffset':gl(explode),'hotspot':gl(hotspot or pivot)}
 if note:p['evidenceNote']=note
 parts.append(p); return o

def parent(obj,p):
 mw=obj.matrix_world.copy(); obj.parent=p; obj.matrix_world=mw; return obj

def finish(obj,name,m,p=None,bevel=.0005):
 obj.name=name
 if m:obj.data.materials.append(m)
 if bevel:
  mod=obj.modifiers.new('Manufactured edge radius','BEVEL'); mod.width=bevel; mod.segments=4
  bpy.context.view_layer.objects.active=obj; bpy.ops.object.modifier_apply(modifier=mod.name)
 for f in obj.data.polygons:f.use_smooth=True
 try:
  mod=obj.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL'); mod.keep_sharp=True; mod.weight=50
  bpy.context.view_layer.objects.active=obj; bpy.ops.object.modifier_apply(modifier=mod.name)
 except RuntimeError:pass
 if p:parent(obj,p)
 return obj

def cube(name,loc,dim,m,p=None,b=.0005):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,m,p,b)

def cyl(name,loc,r,depth,m,p=None,axis=(0,0,1),verts=96,b=.0003):
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=depth,location=loc);o=bpy.context.object;o.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler();bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);return finish(o,name,m,p,b)

def lathe(name,profile,m,p=None,center=(0,0,0),axis=(0,0,1),segments=128):
 # Revolve closed section: profile lists(radius, axisDistance), final-to-first closed.
 vs=[];fs=[];N=len(profile)
 for r,z in profile:
  for i in range(segments):
   t=2*math.pi*i/segments;vs.append((r*math.cos(t),r*math.sin(t),z))
 for j in range(N):
  k=(j+1)%N
  for i in range(segments):q=(i+1)%segments;fs.append((j*segments+i,j*segments+q,k*segments+q,k*segments+i))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],fs);mesh.update();o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o)
 o.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler();o.location=center
 return finish(o,name,m,p,0)

def boolean(obj,tool,op='DIFFERENCE'):
 bpy.context.view_layer.objects.active=obj;mod=obj.modifiers.new('True optical opening','BOOLEAN');mod.operation=op;mod.solver='EXACT';mod.object=tool;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(tool,do_unlink=True)

def mesh_obj(name,vs,fs,m,p=None,b=.0005):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free();return finish(o,name,m,p,b)

def wedge(name,width,profile,m,p=None,b=.0005):
 vs=[(x,y,z) for x in [-width/2,width/2] for y,z in profile];N=len(profile);fs=[tuple(range(N-1,-1,-1)),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)];return mesh_obj(name,vs,fs,m,p,b)

# WHITE MODEL: only the project product photograph controls exterior form.
white=coat
label_white=mat('Unprinted white accessory label',(.93,.93,.91),0,.5)
amber=mat('Amber oil bottle - schematic',(.13,.035,.008),0,.18,.45,1.5)
led=mat('Built-in warm source - schematic',(.95,.50,.04),0,.25)
body=part('body','白色机身外壳',hotspot=(.034,-.008,.043),explode=(-.105,0,0),note='以项目白色产品图为外形依据；165 mm教学设计比例。')
parts[-1].update({'shell':True})
# Nominal solids are shared with the standalone mathematical obstruction check.
def solid_box(spec,m,p=None,b=.0003):
 o=cube(spec['name'],spec['center'],spec['size'],m,p,b)
 o.rotation_euler=Matrix(spec['axes']).transposed().to_euler()
 return o
case=wedge('White hollow sloping enclosure',G['outerWidth'],G['outerProfile'],white,body,.0011)
cut=wedge('cut',G['innerWidth'],G['innerProfile'],None,b=.0003);boolean(case,cut)
cut=solid_box(G['shellAperture'],None,b=0);boolean(case,cut)
axis=Vector(G['eyeAxis']);eye_base=Vector(G['eyeBase'])
cut=cyl('cut',eye_base,G['eyeOpening']['radius'],G['eyeOpening']['halfLength']*2,None,axis=axis,b=0);boolean(case,cut)
for x in [-.023,.023]:
 for y in [-.064,.064]:cyl('Anti-slip foot',(x,y,.003),.005,.004,rubber,body,verts=48,b=.00045)
# Fixed black switch bezel belongs to body; moving actuator is an independent part.
cube('Recessed power switch bezel',(.0346,.047,.034),(.0025,.022,.033),anod,body,b=.0012)

stageC=Vector(G['stageCenter']);stage_angle=math.radians(D['stageTiltDegrees']);stageM=Matrix(G['stageAxes']).transposed()
def stagepoint(x,y,z):return stageC+stageM@Vector((x,y,z))
stage=part('metal_stage','不锈钢测台与一级白色台阶',pivot=stageC,hotspot=stagepoint(.017,0,.0012),explode=(0,0,.060),note='收小至44×62 mm钢台，坐在50×70 mm白色台阶；深色玻璃条平面与台面齐平。尺寸与倾角仅示意。')
parts[-1].update({'steelSizeMeters':[.044,.062,.0016],'whiteStepSizeMeters':[.050,.070,.0096],'contactWindowMeters':[.017,.012],'prismWindowVisible':True})
step=solid_box(G['solids'][0],white,stage,b=.0004)
boolean(step,solid_box(G['stepAperture'],None,b=0))
plate=solid_box(G['solids'][1],satin,stage,b=.00025)
boolean(plate,solid_box(G['prismAperture'],None,b=0))
prism_center=Vector(G['prism']['center'])
prism=part('test_prism','半圆柱高折射率棱镜 / 深色接触窗口',pivot=prism_center,explode=(.060,0,.065),hotspot=prism_center,note='半圆柱轴沿机身宽度X；接触面为平面，n≈1.88为教学玻璃参数；非本白色机型拆机或刻线校准。')
parts[-1].update({'cylinderAxis':gl(G['prism']['axis']),'refractiveIndexIllustrative':1.88,'radiusMeters':G['prism']['radius'],'lengthMeters':G['prism']['length'],'contactNormal':gl(G['stageNormal'])})
R=G['prism']['radius'];L=G['prism']['length'];N=64
# Semicircular cross section lies in native YZ; extrude along X (body width).
profile=[(R*math.cos(math.pi*i/N),-R*math.sin(math.pi*i/N)) for i in range(N+1)]
vs=[prism_center+stageM@Vector((x,y,z)) for x in [-L/2,L/2] for y,z in profile];n=len(profile)
fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
mesh_obj('Dark contact glass semicylinder - width axis',vs,fs,glass,prism,0)

hinge=Vector(D['cover_hinge'])
cover=part('cover','白色盒形翻盖（内外白）',pivot=hinge,axis=(1,0,0),rot=True,explode=(0,.070,.020),hotspot=(.025,.080,.130),note='后上方横向铰轴及可见螺钉；默认打开100°。白色盒形盖有侧壁、内腔和前沿斜面；限位为教学参数。')
# A genuinely deep open-bottom box: 2.8 mm side walls and a beveled front lip.
lid=wedge('White box lid with sloped front lip',.064,[(-.014,.071),(.080,.085),(.080,.106),(-.009,.093),(-.017,.083)],white,cover,.0007)
cut=wedge('cut',.0584,[(-.010,.060),(.076,.074),(.076,.102),(-.007,.089),(-.012,.081)],None,b=.0002);boolean(lid,cut)
for x in [-.0285,.0285]:
 cyl('White rear upper hinge knuckle',(x,.078,.084),.0036,.010,white,cover,axis=(1,0,0),verts=64,b=.0004)
 cyl('Exposed hinge screw head',(x*1.17,.078,.084),.0022,.0013,silver,body,axis=(1,0,0),verts=48,b=.00015)
 cube('Hinge screw slot',(x*1.195,.078,.084),(.00012,.0027,.00035),anod,body,b=.00004)
cover.rotation_euler.x=math.radians(-100)
parts[-1].update({'defaultAngleDegrees':100,'angleLimitsDegrees':[0,100],'angleConvention':'localRotationRadians = -openingAngleDegrees * PI / 180; zero closes cover','motion':{'type':'rotation','axis':[1,0,0],'inputRange':[0,100],'inputUnit':'degree','rotationMultiplier':-1,'defaultValue':100},'closedClearanceMeters':.0018,'lidConstruction':{'form':'open-bottom box','sideWallMeters':.0028,'depthMeters':.021,'innerColor':'white','frontLip':'sloped','hingeLocation':'rear upper','visibleHingeScrews':True}})

# Thick black knurled barrel, clear recessed lens and visible side screw.
eye=part('eyepiece','滚花目镜 / 轴向调焦',pivot=eye_base,axis=axis,explode=tuple(axis*.046),hotspot=tuple(eye_base+axis*.010),note='较粗滚花短筒、凹入镜片和小侧螺钉；沿自身光轴0–6 mm调焦为教学行程。')
parts[-1].update({'translationAxisLocal':gl(axis),'translationRangeMeters':[0,G['focusTravel']],'translationIsIllustrative':True,'motion':{'type':'translation','axis':gl(axis),'inputRange':[0,6],'inputUnit':'mm','outputRangeMeters':[0,G['focusTravel']],'defaultValue':0,'followers':['polarizer']}})
lathe('Black recessed knurled eyepiece barrel',[(.0128,-.005),(.0174,-.005),(.0184,-.001),(.0184,.012),(.0178,.014),(.0129,.014),(.0126,.005)],anod,eye,eye_base,axis,96)
cyl('Eyepiece recessed glass',eye_base+axis*.0068,.0127,.0014,lens,eye,axis=axis,verts=96,b=.00015)
u=Vector((1,0,0));v=axis.cross(u).normalized()
for i in range(64):
 t=2*math.pi*i/64;radial=u*math.cos(t)+v*math.sin(t)
 cyl('Eyepiece axial knurl ridge',eye_base+axis*.006+radial*.0183,.00036,.011,anod,eye,axis=axis,verts=8,b=.00006)
cyl('Eyepiece side screw',eye_base+Vector((.0186,0,0))+axis*.002,.00145,.0013,silver,eye,axis=(1,0,0),verts=40,b=.00012)
cube('Eyepiece screw slot',eye_base+Vector((.0193,0,0))+axis*.002,(.00008,.0018,.0003),anod,eye,b=0)
polpos=eye_base+axis*.0145
polarizer=part('polarizer','可拆偏光片（目镜外侧圆片）',pivot=polpos,axis=axis,rot=True,explode=tuple(axis*.089),hotspot=polpos+axis*.001,note='按本轮指定教学部件单独制作；旋转/拆卸自由度为教学演示，不宣称该原图中的附件规格经厂家核实。')
lathe('Thin detachable polarizer rim',[(.0130,0),(.0187,0),(.0190,.001),(.0190,.003),(.0185,.004),(.0130,.004)],anod,polarizer,polpos,axis,96)
cyl('Polarizer optical disc',polpos+axis*.0017,.0129,.001,polglass,polarizer,axis=axis,verts=96,b=.00012)
parts[-1].update({'detachmentAxis':gl(axis),'angleLimitsDegrees':[0,180],'defaultAngleDegrees':0,'followsPart':'eyepiece','visibilityToggle':True,'defaultVisible':True})

switch=part('power_switch','内置光源电源开关（I / O）',pivot=(.0361,.047,.034),axis=(1,0,0),explode=(.060,0,0),hotspot=(.039,.047,.034),note='侧面黑色翘板形态依原图；以0.8 mm按压位移作交互示意，真实翘板机构与电路未实测。')
rockerProfile=[(.0350,.021),(.0372,.021),(.0390,.030),(.0390,.047),(.0350,.047)]
vs=[(x,y,z) for y in [.0385,.0555] for x,z in rockerProfile];n=len(rockerProfile)
fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
mesh_obj('Black rocker actuator',vs,fs,anod,switch,b=.00075)
# Raised vector geometry markings I and O; no reference image pixel or brand texture.
cube('Power symbol I',(.03910,.047,.041),(.00012,.0004,.0043),label_white,switch,b=.00005)
lathe('Power symbol O',[(.0019,-.00006),(.00245,-.00006),(.00245,.00006),(.0019,.00006)],label_white,switch,(.03830,.047,.026),(1,0,-.2),48)
parts[-1].update({'translationAxisLocal':[1,0,0],'translationRangeMeters':[-.0008,0],'defaultTranslationMeters':0,'motion':{'type':'translation','axis':[1,0,0],'inputRange':[0,1],'inputUnit':'normalized','outputRangeMeters':[0,-.0008],'defaultValue':0},'switchStates':{'0':'O / off','1':'I / on'},'translationIsIllustrative':True})

light=part('internal_light','后部内置钠黄光示意 LED',pivot=G['sourcePanel']['center'],explode=(.060,.045,.01),hotspot=G['source'],note='后部独立发光面；颜色示意589 nm钠黄光，不把LED材质当单色波长或照度模拟。')
parts[-1].update({'wavelengthNanometersIllustrative':589,'internalOpticsIllustrative':True})
solid_box(G['solids'][2],inner,light,b=.0004)
led.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(1,.46,.015,1)
led.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=1.2
solid_box(G['sourcePanel'],led,light,b=.0001)

# Separate mirrors, reticle and lens; finite apertures use the checked geometry.
def optical_part(name,label,explode):
 spec=G['surfaces'][name]
 p=part(name,label,pivot=spec['center'],explode=explode,hotspot=spec['center'],note='机内教学示意；位置/法线用于几何通路检查，不代表厂家内部尺寸或读数校准。')
 parts[-1].update({'internalOpticsIllustrative':True,'surfaceCenter':gl(spec['center']),'surfaceNormal':gl(spec['normal']),'clearRadiusMeters':spec['radius']})
 return p,spec
for name,label,offset in [('first_mirror','第一反射镜',(-.045,.025,.032)),('second_mirror','第二反射镜',(-.055,-.040,.012))]:
 p,spec=optical_part(name,label,offset)
 carrier=next(x for x in G['solids'] if x['name']==name+' carrier')
 solid_box(carrier,anod,p,b=.00018)
 # front reflecting face is centred on the checked plane; backing stays behind.
 cyl(name+' reflective surface',Vector(spec['center'])+Vector(spec['normal'])*.00015,spec['radius'],.0003,mirror,p,axis=spec['normal'],verts=96,b=0)
scale,spec=optical_part('internal_scale','透明分划标尺（刻线未校准）',(-.060,-.010,.048))
cyl('Transparent uncalibrated reticle',spec['center'],spec['radius'],.00035,scale_white,scale,axis=spec['normal'],verts=96,b=0)
u,v,n=basis(spec['normal']);u=Vector(u);v=Vector(v);n=Vector(n)
# Place the illustrative ticks off the centre-ray plane to avoid opaque ray blocks.
for i in range(21):
 q=Vector(spec['center'])+u*((i-10)*.00064)+v*.0045-n*.00023
 o=cube('Uncalibrated offset reticle tick',q,(.00008,.0016 if i%5==0 else .0009,.00006),scale_ink,scale,b=0)
 o.rotation_euler=Matrix((u,v,n)).transposed().to_euler()
parts[-1].update({'tickPositionsCalibrated':False})
lenses,spec=optical_part('lens_group','透镜组（独立双片示意）',(.055,-.020,.036))
for offset in [-.0012,.0012]:
 cyl('Illustrative clear lens',Vector(spec['center'])+Vector(spec['normal'])*offset,spec['radius'],.0013,lens,lenses,axis=spec['normal'],verts=96,b=.00045)
parts[-1].update({'lensCount':2,'imagingCalibrated':False,'chiefRayModel':'central ray passes without angular change; no lens field or aberration simulation'})

optical_path=part('optical_path','光路示意线 / 临界角扇',note='主线完整；角扇只传播至标尺，不用于读数、焦距或透镜成像校准。')
parts[-1].update({'defaultVisible':False,'visibilityToggle':True,'teachingOverlay':True,'internalOpticsIllustrative':True})
optical_path['visible']=False;optical_path['defaultVisible']=False;optical_path['teachingOverlay']=True
raymat=mat('Chief ray warm yellow overlay',(1,.47,.025),0,.4)
fanmat=mat('Critical angle fan amber overlay',(.68,.24,.018),0,.5)
raymat.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(1,.35,.01,1)
raymat.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=.5
main_path,fan_paths=make_paths(G)
def rayline(points,m,radius):
 for a,b in zip(points,points[1:]):
  a=Vector(a);b=Vector(b)
  if (b-a).length>1e-9:cyl('Optical teaching line',(a+b)/2,radius,(b-a).length,m,optical_path,axis=b-a,verts=8,b=0)
rayline(main_path,raymat,.00019)
for row in fan_paths:rayline(row['points'],fanmat,.00007)
# glTF has no native visibility flag: extras plus manifest are the loader contract.
# Keep selected geometry exportable, then hide it for saved Blender scenes/renders.

bottleC=Vector((.067,.038,.004))
bottle=part('oil_bottle','折射油瓶（独立附件）',pivot=bottleC,explode=(.035,.025,0),hotspot=bottleC+Vector((0,0,.028)),note='独立可隐藏附件，依据原图的棕色瓶和白色盖；无化学配方、折射率、危险品标签或容量承诺。')
parts[-1].update({'accessory':True,'visibilityToggle':True,'defaultVisible':True,'attachment':'separate freestanding accessory','teachingRole':'接触液附件外观示意'})
# Closed amber bottle, unprinted white sleeve and white knurled cap.
lathe('Amber bottle wall',[(.00002,0),(.010,0),(.0115,.002),(.0115,.034),(.010,.038),(.0068,.041),(.0068,.047),(.0052,.047),(.0052,.040),(.0095,.034),(.0095,.003),(.00002,.003)],amber,bottle,bottleC,segments=96)
lathe('Plain white bottle label',[(.01155,.007),(.01170,.007),(.01170,.028),(.01155,.028)],label_white,bottle,bottleC,segments=96)
cyl('White screw cap',bottleC+Vector((0,0,.047)),.0106,.016,white,bottle,verts=96,b=.001)
for i in range(64):
 t=i*2*math.pi/64;loc=bottleC+Vector((.01055*math.cos(t),.01055*math.sin(t),.047))
 o=cube('Bottle cap fine grip',loc,(.0007,.00055,.012),white,bottle,b=.00015);o.rotation_euler.z=t
# Candidate audit is non-destructive and excluded from the final export/master scene.
source_info={'present':CAND.exists(),'file':str(CAND.relative_to(P)) if CAND.is_relative_to(P) else args.candidate,'geometryRetained':False,'decision':'Round-2 white-model cloud candidate is comparison only; parametric final geometry is rebuilt from project white reference.','generation':{'provider':'Tripo Studio','model':'H3.1','taskId':'7296572f-cac8-43ba-b870-2a5b51b15296','quality':'highest','privacy':'private','credits':55,'budgetCumulative':275,'balanceBefore':5925,'balanceAfter':5870}}
if CAND.exists():
 data=CAND.read_bytes();source_info.update({'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
 metadata=CAND.with_name('candidate-metadata.json')
 if not metadata.exists():metadata=CAND.with_name('download-verification.json')
 if metadata.exists():source_info['downloadMetadata']=json.loads(metadata.read_text())
# Boolean cuts alter adjacency; recalculate weighted normals after all manufacturing cuts.
for obj in [case,step,plate,lid]:
 bpy.context.view_layer.objects.active=obj
 mod=obj.modifiers.new('Post machining flat panel normals','WEIGHTED_NORMAL');mod.keep_sharp=True;mod.weight=100
 bpy.ops.object.modifier_apply(modifier=mod.name)
# Determine world bounds; exports have no lights, stage, camera or text labels.
bpy.context.view_layer.update()
meshes=[o for o in scene.objects if o.type=='MESH']
points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
mins=[min(v[i] for v in points) for i in range(3)];maxs=[max(v[i] for v in points) for i in range(3)]
meshchecks=[]
for o in meshes:
 bm=bmesh.new();bm.from_mesh(o.data)
 meshchecks.append({'mesh':o.name,'vertices':len(bm.verts),'faces':len(bm.faces),'nonManifoldEdges':sum(not e.is_manifold for e in bm.edges),'boundaryEdges':sum(e.is_boundary for e in bm.edges),'wireEdges':sum(e.is_wire for e in bm.edges)})
 bm.free()
# Deferred to Claude's Blender run: verify actual evaluated opaque triangles,
# including the lid, ticks and all mechanical details not in nominal solids.
from mathutils.bvhtree import BVHTree
opaque_trees=[]
for obj in meshes:
 if obj.parent is optical_path:continue
 materials=[m for m in obj.data.materials if m]
 if materials and all(m is led or (m.use_nodes and m.node_tree.nodes.get('Principled BSDF') and m.node_tree.nodes.get('Principled BSDF').inputs['Transmission Weight'].default_value>.01) for m in materials):continue
 obj.data.calc_loop_triangles()
 vertices=[obj.matrix_world@v.co for v in obj.data.vertices]
 opaque_trees.append((obj.name,BVHTree.FromPolygons(vertices,[tuple(t.vertices) for t in obj.data.loop_triangles],all_triangles=True)))
mesh_obstructions=[]
for tag,points in [('main',main_path)]+[(f'fan-{i}',row['points']) for i,row in enumerate(fan_paths)]:
 for seg,(a,b) in enumerate(zip(points,points[1:])):
  a=Vector(a);b=Vector(b);distance=(b-a).length;direction=(b-a).normalized();epsilon=.000001
  if distance<2*epsilon:continue
  for name,tree in opaque_trees:
   hit=tree.ray_cast(a+direction*epsilon,direction,distance-2*epsilon)
   if hit[0] is not None:mesh_obstructions.append({'path':tag,'segment':seg,'mesh':name,'hitNative':list(hit[0])})
evaluated_check={'ok':not mesh_obstructions,'scope':'Blender evaluated opaque triangle ray intersections; main ray to eyepiece and 17 fan rays through scale','obstructions':mesh_obstructions,'nominalGeometrySourceSha256':optical_check['sourceSha256'],'limits':optical_check['limitations'][1:]}
(OUT/'analysis/evaluated-optical-path-check.json').write_text(json.dumps(evaluated_check,ensure_ascii=False,indent=2)+'\n')
if not evaluated_check['ok']:raise RuntimeError('Evaluated mesh blocks optical route; see repair-v3/analysis/evaluated-optical-path-check.json')
# Batch same-material children within each anatomical part for low browser draw-call count.
# No cross-part joining; pivots and all detailed geometry are preserved.
batch_report=[]
for group in list(root.children):
 buckets={}
 for obj in list(group.children):
  if obj.type=='MESH':
   # Boolean cutters can leave unused empty material slots.
   for j in reversed(range(len(obj.data.materials))):
    if obj.data.materials[j] is None and not any(f.material_index==j for f in obj.data.polygons):obj.data.materials.pop(index=j)
   key=tuple(m.name if m else '' for m in obj.data.materials)
   buckets.setdefault(key,[]).append(obj)
 for index,items in enumerate(buckets.values()):
  if len(items)>1:
   bpy.ops.object.select_all(action='DESELECT')
   for obj in items:obj.select_set(True)
   bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join()
  obj=items[0];obj.name=group.name+'_mesh_'+str(index+1)
  batch_report.append({'part':group.name,'mesh':obj.name,'joinedObjects':len(items)})
(OUT/'analysis/drawcall-batching.json').write_text(json.dumps(batch_report,indent=2)+'\n')
# Export deterministic named part tree. PBR microbump texture nodes are Cycles-only, no image/branding embedded.
for o in scene.objects:o.select_set(False)
for o in [root]+list(root.children_recursive):o.select_set(True)
bpy.context.view_layer.objects.active=root
webpath=PUB/'model.glb'
bpy.ops.export_scene.gltf(filepath=str(webpath),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
data=webpath.read_bytes();sha=hashlib.sha256(data).hexdigest()
manifest={'id':'refractometer-structure-v1','version':'structure-3','revision':'repair-v3','model':'model.glb','sha256':sha,'byteLength':len(data),'units':'meter','dimensionsCalibrated':False,'teachingOpticsSimulated':False,'internalOpticsIllustrative':True,'opticalSimulation':False,'parts':parts,'coordinateSystem':'glTF right-handed Y-up. X width, -Z rearward. Native Blender points converted (x,y,z)->(x,z,-y).','nominalDimensions':{'bodyWidthMeters':.068,'bodyLengthMeters':.165,'bodyHeightMeters':.079,'note':'教学示意比例，非厂商实测；油瓶为独立附件。'},'boundsNative':{'min':mins,'max':maxs},'opticalBehavior':'静态结构教学模型；不模拟真实临界角、偏振或折射率读数。','sourceCandidate':source_info,'appearanceReference':'折射仪/折射仪_产品图.png','attachments':{'oil_bottle':{'defaultVisible':True,'visibilityToggle':True}},'opticalPath':{'node':'Refractometer_optical_path','partId':'optical_path','defaultVisible':False,'elementOrder':['internal_light','first_mirror','test_prism','internal_scale','lens_group','second_mirror','eyepiece'],'fanValidatedThrough':'internal_scale','mainRayPointsMeters':optical_check['mainRayPointsMeters'],'mainAngleDegrees':optical_check['mainAngleDegrees'],'criticalAngleRangeDegrees':optical_check['criticalAngleRangeDegrees'],'geometryCheck':'assets-source/instruments-2026-10-07/round3/refractometer-optical-path-check.json','scope':optical_check['scope'],'limitations':optical_check['limitations']},'createdAt':datetime.now(timezone.utc).isoformat()}
(PUB/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
provenance={'instrument':'白色宝石折射仪教学候选 · 第3轮','selectionStatus':'当前白色款候选，待用户外观审阅','dimensionsCalibrated':False,'manufacturerReplica':False,'teachingOpticsSimulated':False,'internalOpticsIllustrative':True,'opticalSimulation':False,'referenceSources':[{'path':'折射仪/折射仪_产品图.png','title':'用户项目白色产品原图','authorOrManufacturer':'未知；来自用户已有材料','retrievedAt':'2026-10-07','role':'本轮主要外形依据','sha256':'7290154affc9213bcc242a711d52a79f0114ba0fc93c3a6ac5d377435915f6dd'},{'path':'docs/新仪器3D资产-修改说明-第3轮-2026-10-07.md','title':'用户确认第3轮结构修改要求','role':'教学分件和运动约束'}],'referenceLicense':'项目已有原图许可未核实，仅留assets-source与原项目资料；用于用户授权的本地教学重建和Tripo比较，不主张厂商授权。','imagePixelsEmbeddedInWebAsset':False,'brandingReproduced':False,'sourceCandidate':source_info,'reconstruction':'白色盒盖、白台阶承托缩小钢台、深色宽度轴半圆柱、滚花凹入镜片及调焦目镜；独立后部光源、两反射镜、透明标尺与双透镜，以及默认隐藏主线和角扇。','alternative':{'path':'assets-source/refractometer/alternatives/gem-a-black','status':'备选，未采用','legacyRepair':'repair-v1原样保留；旧路径相对软链接保持历史记录可用'},'internalAssumptions':['依Gemology Project通用结构建立光路，全部内部件为教学示意，未经该白色机型厂家结构核实。','盖100°及开关0.8mm位移为教学交互限位，不是实測机械数据。','主线完整几何通路与17条临界角扇只验证至标尺；不做透镜成像或刻线校准。','油瓶只示意附件形态；白色无字标签不表达化学配方、危险等级、容量或实际折射率。'],'materials':{'Cycles':'白色涂层/不锈钢/黑色金属与塑料/玻璃PBR，细微程序噪声','web':'PBR与KHR_materials_transmission/ior，无参考图片和品牌贴图'},'tripoBudget':{'thisRound':0,'cumulativeAllFour':275,'pauseAt':1600,'ceiling':2000,'recharged':False},'script':'tools/3d-assets/build_refractometer.py','userReviewRequired':['白色盒盖、台阶钢台/深色窗口和粗目镜比例是否贴近原图','内部通用光路示意是否符合课程用途','独立油瓶比例以及内部示意教学范围']}
provenance['referenceSources'] += [{'url':'https://gemologyproject.com/wiki/index.php?title=Refractometer','title':'Gemology Project Refractometer','retrievedAt':'2026-10-07','role':'Eickhorst通用剖面顺序、约1.88半圆柱、589nm照明及可滑动目镜；内置照明机型说明'},{'url':'https://gemologyproject.com/wiki/index.php?title=Course%3ATotal_internal_reflection','title':'Gemology Project Total internal reflection','retrievedAt':'2026-10-07','role':'临界角公式、接触面法线和曲面径向出入'}]
provenance['revision']='repair-v3'
provenance['opticalGeometryCheck']={'ok':optical_check['ok'],'scope':optical_check['scope'],'limitations':optical_check['limitations'],'tickPositionsCalibrated':False}
(PUB/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
(OUT/'source/design-parameters.json').write_text(json.dumps(D,ensure_ascii=False,indent=2)+'\n')
(OUT/'analysis/mesh-checks.json').write_text(json.dumps({'source':'Blender evaluated/rebuilt meshes before export','allClosed':all(x['nonManifoldEdges']==0 for x in meshchecks),'meshes':meshchecks},ensure_ascii=False,indent=2)+'\n')
if Path(__file__).resolve() != (OUT/'source/build_refractometer.py').resolve():shutil.copyfile(__file__,OUT/'source/build_refractometer.py')
geometry_source=Path(__file__).with_name('refractometer_round3_geometry.py')
if geometry_source.resolve() != (OUT/'source/refractometer_round3_geometry.py').resolve():shutil.copyfile(geometry_source,OUT/'source/refractometer_round3_geometry.py')
# Complete editable geometry/material scene; retain studio after saving a clean asset master below.
for o in [optical_path]+list(optical_path.children_recursive):o.hide_render=True;o.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'refractometer-master.blend'))
# Export/reimport check in isolated collection, preserving master and render scene.
original=set(scene.objects); bpy.ops.import_scene.gltf(filepath=str(webpath)); imported=set(scene.objects)-original
iparts=[o for o in imported if o.name.split('.')[0] in {p['node'] for p in parts}]
ipt=[o.matrix_world@v.co for o in imported if o.type=='MESH' for v in o.data.vertices]
reimport={'file':'model.glb','sha256':sha,'bytes':len(data),'partCount':len(parts),'reimportPartCount':len(iparts),'allPartsPresent':len(iparts)==len(parts),'meshCount':sum(o.type=='MESH' for o in imported),'sizeTargetPassed':len(data)<=10*1024*1024,'boundsNativeAfterImport':{'min':[min(v[i] for v in ipt) for i in range(3)],'max':[max(v[i] for v in ipt) for i in range(3)]}}
reimport['boundsMaxDifference']=max(abs(reimport['boundsNativeAfterImport'][k][i]-{'min':mins,'max':maxs}[k][i]) for k in ['min','max'] for i in range(3))
reimport['pass']=reimport['allPartsPresent'] and reimport['sizeTargetPassed'] and reimport['boundsMaxDifference']<.00001
reimport['opticalOverlayPresent']=any(o.name.split('.')[0]=='Refractometer_optical_path' and o.get('defaultVisible') is False for o in imported)
reimport['pass']=reimport['pass'] and reimport['opticalOverlayPresent']
(OUT/'analysis/reimport-check.json').write_text(json.dumps(reimport,ensure_ascii=False,indent=2)+'\n')
for o in imported:bpy.data.objects.remove(o,do_unlink=True)
if args.render:
 floor_mat=mat('Studio surface',(.78,.80,.83),0,.65)
 floor=cube('Studio floor',(0,0,-.005),(200,200,.01),floor_mat,b=0)
 def area(name,pos,power,size,col):
  bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=col;o.rotation_euler=(Vector((0,0,.07))-o.location).to_track_quat('-Z','Y').to_euler()
 area('Softbox key',(.20,-.18,.32),2.5,.22,(1,.97,.92));area('Long rim',(-.16,.18,.24),3.5,.18,(.83,.90,1));area('Front fill',(.03,-.3,.12),1,.15,(1,1,1))
 bpy.ops.object.camera_add();camera=bpy.context.object;camera.name='Review camera';scene.camera=camera;camera.data.type='ORTHO';camera.data.lens=60
 def view(name,pos,target=(0,0,.083),ortho=.29,side=1200):
  camera.location=pos;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=ortho
  scene.render.resolution_x=side;scene.render.resolution_y=side;scene.render.filepath=str(OUT/'renders'/f'{name}.png');bpy.ops.render.render(write_still=True)
 view('reference-angle',(.38,-.42,.32),target=(.018,.008,.082),ortho=.27)
 shutil.copyfile(OUT/'renders/reference-angle.png',PUB/'poster.png')
 for name,pos in [('front',(0,-.5,.082)),('back',(0,.5,.082)),('left',(-.5,0,.082)),('right',(.5,0,.082)),('top',(0,0,.58)),('bottom',(0,0,-.5))]:
  # Bottom reference avoids occlusion by studio floor.
  floor.hide_render=True;view(name,pos,side=1000)
 floor.hide_render=False
 cover.rotation_euler.x=0
 view('cover-closed',(.38,-.42,.32),target=(.018,0,.049),ortho=.25)
 cover.rotation_euler.x=math.radians(-D['cover_open_degrees'])
 view('stage-closeup',(.17,-.15,.32),target=(0,.025,.078),ortho=.12)
 # Explicit technical cutaway: keep default poster/GLB presentation unchanged.
 hidden_for_optics=[o for group in [body,cover,stage,bottle] for o in group.children_recursive if o.type=='MESH']
 for o in hidden_for_optics:o.hide_render=True
 for o in [optical_path]+list(optical_path.children_recursive):o.hide_render=False;o.hide_set(False)
 view('optical-path-schematic',(.38,-.015,.13),target=(0,.014,.054),ortho=.20,side=1400)
 for o in hidden_for_optics:o.hide_render=False
 for o in [optical_path]+list(optical_path.children_recursive):o.hide_render=True;o.hide_set(True)
 # A distinct interior exploded view is technical review only, not the web poster.
 originals={o:o.location.copy() for o in root.children}
 for p in parts:
  o=bpy.data.objects.get(p['node']);off=p['explodeOffset'];o.location+=Vector((off[0],-off[2],off[1]))*.60
 view('exploded',(.38,-.5,.40),target=(.005,0,.09),ortho=.42,side=1200)
 for o,loc in originals.items():o.location=loc
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'refractometer-studio.blend'))
print('REFRACTOMETER_RESULT '+json.dumps({'model':str(webpath),'bytes':len(data),'sha256':sha,'parts':len(parts),'closed':all(x['nonManifoldEdges']==0 for x in meshchecks),'reimportPass':reimport['pass']}))
