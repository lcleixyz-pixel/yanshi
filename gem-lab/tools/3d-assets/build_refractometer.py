"""Reference-constrained teaching refractometer. Blender 5.2, no external add-ons.
Run from any cwd: blender --background --python gem-lab/tools/3d-assets/build_refractometer.py -- [--candidate relative.glb] [--render] [--samples 40]
Paths resolve relative to gem-lab. Never edits or replaces the Tripo original.
Blender native axes X=width, Y=rearward, Z=up. glTF Y=up conversion is explicit in manifest.
"""
from pathlib import Path
import bpy, bmesh, math, json, sys, hashlib, shutil, argparse
from mathutils import Vector, Matrix
from datetime import datetime, timezone
P = next(p for p in Path(__file__).resolve().parents if (p/'public/assets').is_dir() and (p/'tools/3d-assets').is_dir())
SRC = P / 'assets-source/refractometer/tripo-trials/2026-10-07'
OUT = SRC / 'repair-v1'
PUB = P / 'public/assets/3d/refractometer/structure-v1'
for d in [OUT/'renders', OUT/'analysis', OUT/'source', PUB]: d.mkdir(parents=True, exist_ok=True)
a=argparse.ArgumentParser(); a.add_argument('--candidate',default='assets-source/refractometer/tripo-trials/2026-10-07/candidate.glb'); a.add_argument('--render',action='store_true'); a.add_argument('--samples',type=int,default=40)
args=a.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
CAND=(P/args.candidate).resolve()
# Documented nominal design dimensions, not measurements of the branded reference.
D={'width':.073,'length':.195,'rear_y':.090,'front_y':-.105,'bottom_z':.006,'stage_z':.062,'stage_front_y':-.045,'cover_open_degrees':102,'cover_hinge':[0,.083,.064],'eyepiece_axis':[0,-.438371,.898794]}
D['dimensionsCalibrated']=False
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for dat in list(bpy.data.materials): bpy.data.materials.remove(dat)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
scene.render.engine='CYCLES'; scene.cycles.samples=args.samples; scene.cycles.use_denoising=True
scene.render.resolution_x=1400; scene.render.resolution_y=1400; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=False
scene.render.threads_mode='FIXED'; scene.render.threads=8
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
coat=mat('Body fine black powder coat',(.005,.006,.008),.02,.43)
inner=mat('Internal non-reflective black',(.006,.008,.011),0,.62)
satin=mat('Stage brushed stainless steel',(.61,.64,.65),.9,.28)
silver=mat('Turned silver edges',(.53,.56,.58),.92,.18)
anod=mat('Eyepiece anodized black',(.008,.009,.011),.45,.25)
rubber=mat('Base rubber pads',(.018,.019,.021),0,.7)
glass=mat('High RI test prism - visual schematic',(.86,.94,.96),0,.07,.98,1.81)
lens=mat('Optical lens - visual schematic',(.12,.18,.21),0,.075,.94,1.52)
polglass=mat('Polarizing filter - visual schematic',(.075,.092,.075),0,.1,.56,1.5)
mirror=mat('Internal mirror surface - schematic',(.84,.87,.89),1,.08)
scale_white=mat('Scale ivory plate',(.84,.85,.78),0,.45)
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

body=part('body','机身外壳',hotspot=(.036,0,.034),explode=(-.115,0,0),note='轮廓由 Gem-A 官方两视角约束，尺寸为教学设计值；未复刻品牌标识。')
outerprofile=[(-.105,.006),(.09,.006),(.09,.0615),(-.044,.0615),(-.105,.032)]
case=wedge('Continuous hollow sloped enclosure',.073,outerprofile,coat,body,.0012)
# Internal chamber, stage opening and real front lens passage.
cut=wedge('cut',.067,[(-.101,.010),(.086,.010),(.086,.057),(-.044,.057),(-.101,.029)],None,b=.0005);boolean(case,cut)
cut=cube('cut',(0,.019,.064),(.062,.12,.026),None,b=.001);boolean(case,cut)
axis=Vector(D['eyepiece_axis']).normalized();eye_base=Vector((0,-.073,.048))
cut=cyl('cut',eye_base,.018,.045,None,axis=axis,b=0);boolean(case,cut)
# Back illumination aperture is explicitly an inferred teaching location.
cut=cyl('cut',(0,.089,.034),.008,.025,None,axis=(0,1,0),b=0);boolean(case,cut)
# Foot pads and understated lower seam do not add fictitious controls.
for x in [-.025,.025]:
 for y in [-.084,.067]:cyl('Recessed anti-slip foot', (x,y,.004),.0065,.005,rubber,body,verts=48,b=.0008)
# Actual body fasteners, shallow side slots are not invented.
for x in [-.030,.030]:
 for y in [-.084,.069]:
  s=cyl('Underside assembly screw',(x,y,.0047),.002,.001,silver,body,verts=32,b=.00012)
  slot=cube('Screw recess',(x,y,.0041),(.0022,.0004,.0003),inner,body,b=.00004)

stage=part('metal_stage','金属测台',pivot=(0,.020,.0624),hotspot=(.025,.007,.064),explode=(0,0,.075),note='固定金属台；中央为真实通孔，玻璃顶面与测面齐平。')
plate=cube('Satin metal stage with real prism opening',(0,.020,.0624),(.069,.125,.0023),satin,stage,b=.0008)
cut=cube('cut',(0,.016,.063),(.0145,.025,.012),None,b=.00035);boolean(plate,cut)
# Delicate opening chamfer surround, no false opaque glass cover.
# Closed rectangular ring, with a real through hole and exact manifold topology.
loops=[]
for z in [.0605,.0617]:
 for w,l in [(.0178,.0283),(.0145,.025)]:
  loops.append([(-w/2,.016-l/2,z),(w/2,.016-l/2,z),(w/2,.016+l/2,z),(-w/2,.016+l/2,z)])
vs=[v for loop in loops for v in loop];fs=[]
for a,b in [(0,4),(8,12),(0,8),(4,12)]:
 for i in range(4):j=(i+1)%4;fs.append((a+i,a+j,b+j,b+i))
retainer=mesh_obj('Prism mounting lip',vs,fs,silver,stage,b=.00012)

prism=part('test_prism','高折射率玻璃测台棱镜',pivot=(0,.016,.06355),explode=(.07,0,.08),hotspot=(0,.016,.0636),note='可见矩形测面有照片依据；曲面采用半圆柱教学示意，Gem-A 具体内部形状未经证实。')
# Half cylinder length Y; flat top contacts stone. Cross section semicircle below Z=0.
R=.0071;L=.0246;N=64;profile=[(R*math.cos(math.pi*i/N),-.0-R*math.sin(math.pi*i/N)) for i in range(N+1)]
vs=[(x,y,z+.06355) for y in [.016-L/2,.016+L/2] for x,z in profile];n=len(profile)
fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
mesh_obj('Semicylindrical contact prism - schematic',vs,fs,glass,prism,.00010)

hinge=Vector(D['cover_hinge'])
cover=part('cover','后铰遮光盖',pivot=hinge,axis=(1,0,0),rot=True,explode=(0,.065,.035),hotspot=(.031,.103,.127),note='后部横向铰轴有两视角依据；默认开角102°，0°为闭盖。限位为教学值。')
# Model in closed pose in world, then apply hinge rotation. Curved cup rim and inset inner panel.
# Variable-depth curved hood, constrained by both official views and raw Tripo silhouette.
# Unlike an equal-thickness tray, the upper/free edge tapers down to a fine lip.
hood_keys=[(-.0425,.069),(-.015,.089),(.010,.105),(.030,.110),(.057,.106),(.076,.091),(.0845,.069)]
def interpolate_hood(keys,steps=8):
 result=[]
 for i in range(len(keys)-1):
  p0=Vector(keys[max(i-1,0)]);p1=Vector(keys[i]);p2=Vector(keys[i+1]);p3=Vector(keys[min(i+2,len(keys)-1)])
  for j in range(steps):
   t=j/steps;v=.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t);result.append(tuple(v))
 result.append(keys[-1]);return result
D['hoodProfileNativeYZ']=hood_keys
D['stage']={'centerNative':[0,.020,.0624],'dimensions':[.069,.125,.0023],'prismFlatSurfaceHeight':.06355}
roof=interpolate_hood(hood_keys)
lid=wedge('Cover shell - curved variable depth hood',.073,[(-.0425,.0658),(.0845,.0658)]+list(reversed(roof)),coat,None,.0013)
inner_roof=[(y,z-.0026) for y,z in roof if -.039<y<.081]
cut=wedge('cut',.067,[(-.039,.051),(.081,.051),(.081,.069)]+list(reversed(inner_roof))+[(-.039,.066)],None,b=.0008);boolean(lid,cut);parent(lid,cover)

for x in [-.0348,.0348]:
 # hinge bosses belong to rotating cover, pin is static body
 cyl('Cover hinge knuckle',(x,.083,.064),.0044,.005,coat,cover,axis=(1,0,0),verts=64,b=.0006)
 cyl('Polished hinge pin',(x*1.035,.083,.064),.0025,.0018,silver,body,axis=(1,0,0),verts=48,b=.0002)
 # screw head groove oriented along Z
 cube('Hinge pin slot',(x*1.063,.083,.064),(.0002,.0028,.0005),inner,body,b=.00004)
cover.rotation_euler.x=math.radians(-D['cover_open_degrees'])
parts[-1]['defaultAngleDegrees']=D['cover_open_degrees'];parts[-1]['angleLimitsDegrees']=[0,110];parts[-1]['angleConvention']='rotation about glTF local +X = negative opening angle; zero closes cover'

# Eyepiece uses a hollow lathed barrel, distinct threaded collar and real glass, with fine machined knurl.
eye=part('eyepiece','目镜与调焦套筒',pivot=eye_base,axis=axis,rot=True,explode=tuple(axis*.08),hotspot=tuple(eye_base+axis*.025),note='外形依据照片；轴向调焦行程及螺距未核定，演示平移上限2 mm。')
barrel=lathe('Hollow stepped eyepiece barrel',[(.0183,-.003),(.0245,-.003),(.0254,-.002),(.0254,.001),(.0233,.003),(.0220,.009),(.0213,.026),(.0170,.026),(.0167,.022),(.0167,.0)],anod,eye,eye_base,axis)
lathe('Eyepiece retaining bright edge',[(.0221,.004),(.0227,.004),(.0227,.0051),(.0221,.0051)],silver,eye,eye_base,axis)
lathe('Focus knurled collar',[(.0216,.019),(.0248,.019),(.0252,.020),(.0252,.029),(.0246,.030),(.0208,.030),(.0208,.021)],anod,eye,eye_base,axis)
# Three-sided ridges, individually closed and smooth-highlighted; not texture-baked view lighting.
q=axis.to_track_quat('Z','Y');M=q.to_matrix()
for i in range(96):
 t=2*math.pi*i/96;v=Vector((.02525*math.cos(t),.02525*math.sin(t),.024));world=eye_base+M@v
 ridge=cube('Fine focus grip flute',world,(.00065,.0005,.007),anod,eye,b=.00012);ridge.rotation_euler=(q @ __import__('mathutils').Quaternion((0,0,1),t)).to_euler()
# Convex lens formed by closed lathed spherical section.
lensprof=[(.0153,.0215),(.0155,.0225),(.012,.0234),(.007,.0240),(.00002,.0243),(.00002,.0234),(.007,.0232),(.012,.0228)]
lathe('Recessed eyepiece lens',lensprof,lens,eye,eye_base,axis,segments=96)
parts[-1]['translationAxisLocal']=gl(axis);parts[-1]['translationRangeMeters']=[0,.002]

polpos=eye_base+axis*.031
polarizer=part('polarizer','可拆旋转偏光片',pivot=polpos,axis=axis,rot=True,explode=tuple(axis*.13),hotspot=tuple(polpos+axis*.008),note='可拆偏光片由官方产品说明证实；无固定方位光学标定。')
lathe('Removable polarizer ring',[(.0183,0),(.0266,0),(.0270,.001),(.0270,.006),(.0260,.0072),(.0190,.0072),(.0179,.0052)],anod,polarizer,polpos,axis)
cyl('Polarizing optical disc',polpos+axis*.002,.0182,.0012,polglass,polarizer,axis=axis,verts=128,b=.0002)
for i in range(100):
 t=2*math.pi*i/100;v=Vector((.027*math.cos(t),.027*math.sin(t),.0034));world=polpos+M@v
 o=cube('Polarizer fine rim knurl',world,(.00045,.00035,.0035),anod,polarizer,b=.0001);o.rotation_euler=(q @ __import__('mathutils').Quaternion((0,0,1),t)).to_euler()
parts[-1]['detachmentAxis']=gl(axis)

# Interior teaching assemblies are separate, not exposed as external controls.
scale=part('internal_scale','内部标尺位置示意',pivot=(0,-.026,.028),explode=(.085,-.02,.055),hotspot=(0,-.026,.031),note='位于棱镜到折返反射镜的光路区；位置/角度及刻线为教学示意，不是可用于读数的校准标尺。')
splate=cube('Internal scale carrier',(0,-.026,.028),(.021,.0011,.022),scale_white,scale,b=.0003)
for i in range(31):
 z=.018+i*.00062;length=.010 if i%5==0 else .0064
 cube('Schematic internal index tick',(-.002,-.02661,z),(length,.00012,.00009),scale_ink,scale,b=0)
# No numeric RI scale is claimed for this internal schematic.
reflect=part('reflector','内部折返反射镜示意',pivot=(0,-.055,.024),explode=(-.075,-.025,.038),hotspot=(0,-.055,.027),note='反射镜承担折返光路的原理有教材依据；倾角及曲率未经厂家核实。')
o=cube('Internal tilted mirror support',(0,-.055,.024),(.028,.025,.0016),anod,reflect,b=.001);o.rotation_euler.x=math.radians(30)
o=cube('Internal mirror surface',(0,-.055,.025),(.025,.022,.0008),mirror,reflect,b=.0006);o.rotation_euler.x=math.radians(30)
port=part('light_port','后部进光口与单色滤光片示意',pivot=(0,.091,.034),explode=(0,.072,0),hotspot=(0,.094,.034),note='内置单色滤光片有官方说明；此参考未展示背面，后部小型入光口位置属于教学补足。')
lathe('Rear incident-light port ferrule',[(.0067,-.002),(.010,-.002),(.010,.002),(.009,.003),(.0067,.003)],anod,port,(0,.091,.034),(0,1,0),96)
cyl('Illustrative monochromatic filter',(0,.091,.034),.0066,.0015,portglass,port,axis=(0,1,0),verts=96,b=.0001)
# Candidate audit is non-destructive and excluded from the final export/master scene.
source_info={'present':CAND.exists(),'file':str(CAND.relative_to(P)) if CAND.is_relative_to(P) else args.candidate,'geometryRetained':False,'decision':'Rule surfaces rebuilt from official image constraints; raw candidate retained separately for comparison, not authoritative internal geometry.'}
if CAND.exists():
 data=CAND.read_bytes();source_info.update({'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
 metadata=CAND.with_name('candidate-metadata.json')
 if metadata.exists():source_info['generation']=json.loads(metadata.read_text())
 source_info['review']='Four-angle Tripo inspection: consistent box/eyepiece/cover silhouette; fused parts, opaque optics and distorted manufacturer lettering removed during reconstruction.'
# Boolean cuts alter adjacency; recalculate weighted normals after all manufacturing cuts.
for obj in [case,plate,lid]:
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
manifest={'id':'refractometer-structure-v1','version':'structure-1','model':'model.glb','sha256':sha,'byteLength':len(data),'units':'meter','dimensionsCalibrated':False,'teachingOpticsSimulated':False,'internalOpticsIllustrative':True,'opticalSimulation':False,'parts':parts,'coordinateSystem':'glTF right-handed Y-up. X width, -Z rearward. Native Blender points converted (x,y,z)->(x,z,-y).','nominalDimensions':{'bodyWidthMeters':.073,'bodyLengthMeters':.195,'bodyHeightMeters':.0555,'note':'Teaching design proportions, not measured manufacturer dimensions.'},'boundsNative':{'min':mins,'max':maxs},'opticalBehavior':'Static geometry for structural teaching; no calibrated critical-angle simulation or real RI readout.','sourceCandidate':source_info,'createdAt':datetime.now(timezone.utc).isoformat()}
(PUB/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
provenance={'instrument':'通用宝石折射仪教学候选','dimensionsCalibrated':False,'manufacturerReplica':False,'teachingOpticsSimulated':False,'internalOpticsIllustrative':True,'opticalSimulation':False,'referenceSources':[{'url':'https://shop.gem-a.com/product/gem-a-refractometer/','title':'Gem-A official refractometer product and detachable polarizer description'},{'url':'https://shop.gem-a.com/wp-content/uploads/2018/05/ref0006_1new.jpg','title':'Primary exterior view'},{'url':'https://shop.gem-a.com/wp-content/uploads/2018/05/ref0006_anew.jpg','title':'Secondary exterior view'},{'url':'https://kruess-shop.de/en/methods/refractometry-determine-optical-characteristics-of-gemstones/','title':'Optical principles, not shape reference'}],'referenceLicense':'Manufacturer images publicly accessible, not found under open license. Originals remain assets-source only. Upload authorized by user for this task; manufacturer endorsement not claimed.','imagePixelsEmbeddedInWebAsset':False,'brandingReproduced':False,'sourceCandidate':source_info,'reconstruction':'Photograph-constrained parametric hollow shell, fitted true stage opening, half-cylinder glass teaching prism, concave hinged cover, lathed hollow eyepiece and removable polarizer with physical knurl geometry.','internalAssumptions':['Semicylindrical prism selected for cutaway teaching; exact Gem-A internal geometry unverified.','Internal scale and reflector are schematic, uncalibrated and not suitable for RI measurement.','Back incident-light port position is inferred because the reference photos do not show the back.','Focus travel and cover stop angles are teaching limits rather than measured mechanics.'],'materials':{'Cycles':'Same PBR base with fine procedural microfinish','web':'PBR metal/roughness and KHR_materials_transmission/ior, full geometry; procedural microfinish not baked into basecolor'},'generationRecord':'Tripo task and credit record stored with original candidate and in project production log.','script':'tools/3d-assets/build_refractometer.py','userReviewRequired':['Black box-form proportions and neutral no-brand appearance','Cover concavity and closure clearance','Internal prism/scale/reflector and rear light port schematic positions']}
(PUB/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
(OUT/'source/design-parameters.json').write_text(json.dumps(D,ensure_ascii=False,indent=2)+'\n')
(OUT/'analysis/mesh-checks.json').write_text(json.dumps({'source':'Blender evaluated/rebuilt meshes before export','allClosed':all(x['nonManifoldEdges']==0 for x in meshchecks),'meshes':meshchecks},ensure_ascii=False,indent=2)+'\n')
shutil.copyfile(__file__,OUT/'source/build_refractometer.py')
# Complete editable geometry/material scene; retain studio after saving a clean asset master below.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'refractometer-master.blend'))
# Export/reimport check in isolated collection, preserving master and render scene.
original=set(scene.objects); bpy.ops.import_scene.gltf(filepath=str(webpath)); imported=set(scene.objects)-original
iparts=[o for o in imported if o.name.split('.')[0] in {p['node'] for p in parts}]
ipt=[o.matrix_world@v.co for o in imported if o.type=='MESH' for v in o.data.vertices]
reimport={'file':'model.glb','sha256':sha,'bytes':len(data),'partCount':len(parts),'reimportPartCount':len(iparts),'allPartsPresent':len(iparts)==len(parts),'meshCount':sum(o.type=='MESH' for o in imported),'sizeTargetPassed':len(data)<=10*1024*1024,'boundsNativeAfterImport':{'min':[min(v[i] for v in ipt) for i in range(3)],'max':[max(v[i] for v in ipt) for i in range(3)]}}
reimport['boundsMaxDifference']=max(abs(reimport['boundsNativeAfterImport'][k][i]-{'min':mins,'max':maxs}[k][i]) for k in ['min','max'] for i in range(3))
reimport['pass']=reimport['allPartsPresent'] and reimport['sizeTargetPassed'] and reimport['boundsMaxDifference']<.00001
(OUT/'analysis/reimport-check.json').write_text(json.dumps(reimport,ensure_ascii=False,indent=2)+'\n')
for o in imported:bpy.data.objects.remove(o,do_unlink=True)
if args.render:
 floor_mat=mat('Studio surface',(.78,.80,.83),0,.65)
 floor=cube('Studio floor',(0,0,-.005),(200,200,.01),floor_mat,b=0)
 def area(name,pos,power,size,col):
  bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=col;o.rotation_euler=(Vector((0,0,.07))-o.location).to_track_quat('-Z','Y').to_euler()
 area('Softbox key',(.20,-.18,.32),2.5,.22,(1,.93,.84));area('Long rim',(-.16,.18,.24),3.5,.18,(.83,.90,1));area('Front fill',(.03,-.3,.12),1,.15,(1,1,1))
 bpy.ops.object.camera_add();camera=bpy.context.object;camera.name='Review camera';scene.camera=camera;camera.data.type='ORTHO';camera.data.lens=60
 def view(name,pos,target=(0,0,.083),ortho=.31,side=1400):
  camera.location=pos;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=ortho
  scene.render.resolution_x=side;scene.render.resolution_y=side;scene.render.filepath=str(OUT/'renders'/f'{name}.png');bpy.ops.render.render(write_still=True)
 view('reference-angle',(-.46,-.24,.41),target=(0,.012,.092),ortho=.30)
 shutil.copyfile(OUT/'renders/reference-angle.png',PUB/'poster.png')
 for name,pos in [('front',(0,-.5,.082)),('back',(0,.5,.082)),('left',(-.5,0,.082)),('right',(.5,0,.082)),('top',(0,0,.58)),('bottom',(0,0,-.5))]:
  # Bottom reference avoids occlusion by studio floor.
  floor.hide_render=True;view(name,pos,side=1000)
 floor.hide_render=False
 cover.rotation_euler.x=0
 view('cover-closed',(-.46,-.24,.35),target=(0,0,.049),ortho=.27)
 cover.rotation_euler.x=math.radians(-D['cover_open_degrees'])
 view('stage-closeup',(-.17,-.15,.32),target=(0,.014,.063),ortho=.14)
 # A distinct interior exploded view is technical review only, not the web poster.
 originals={o:o.location.copy() for o in root.children}
 for p in parts:
  o=bpy.data.objects.get(p['node']);off=p['explodeOffset'];o.location+=Vector((off[0],-off[2],off[1]))*.60
 view('exploded',(-.38,-.5,.40),target=(0,0,.09),ortho=.42,side=1400)
 for o,loc in originals.items():o.location=loc
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'refractometer-studio.blend'))
print('REFRACTOMETER_RESULT '+json.dumps({'model':str(webpath),'bytes':len(data),'sha256':sha,'parts':len(parts),'closed':all(x['nonManifoldEdges']==0 for x in meshchecks),'reimportPass':reimport['pass']}))
