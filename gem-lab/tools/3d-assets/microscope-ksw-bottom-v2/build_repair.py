"""KSW6000 preserved cloud exterior; local lower-light candidate v2.
No old asset writes. Ideal two-reflection teaching optics; mechanical dimensions
and short internal translation are not manufacturer measurements.
"""
import argparse,hashlib,json,math,sys,time
from pathlib import Path
import bpy,bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import geometry_contract as G
LAB=HERE.parents[2]
OUT=LAB/'assets-source/gem-microscope/tripo-trials/2026-10-08/repair-v2'
SOURCE=OUT.parent/'candidate-textured.glb'
ROOT=None;PARTS=[];ADDED=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def material(name,color,metal=0,rough=.4,trans=0,emit=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
 p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 p.inputs['Transmission Weight'].default_value=trans;p.inputs['IOR'].default_value=1.46
 p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emit
 return m
def parent_to(o,parent):
 world=o.matrix_world.copy();o.parent=parent;o.matrix_world=world
 return o
def add_mesh(name,vs,fs,mat,parent=None):
 mesh=bpy.data.meshes.new(name+'_mesh');mesh.from_pydata(vs,[],fs);mesh.update()
 o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
 if mat:mesh.materials.append(mat)
 for p in mesh.polygons:p.use_smooth=True
 parent_to(o,parent or ROOT);ADDED.append(o)
 return o
def cylinder(name,r,depth,pos,mat,parent=None,vertices=96):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=pos)
 o=bpy.context.object;o.name=name
 if mat:o.data.materials.append(mat)
 for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
 parent_to(o,parent or ROOT);ADDED.append(o);return o
def box(name,pos,size,mat,parent=None,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=name;o.dimensions=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if mat:o.data.materials.append(mat)
 if bevel:
  mod=o.modifiers.new('Machined soft edge','BEVEL');mod.width=bevel;mod.segments=3
  bpy.ops.object.modifier_apply(modifier=mod.name)
 parent_to(o,parent or ROOT);ADDED.append(o);return o
def empty(name,pos=(0,0,0)):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=ROOT;o.location=pos;bpy.context.view_layer.update();return o
def lathe(name,profile,mat,parent=None,n=192):
 vs=[(G.CX+r*math.cos(2*math.pi*i/n),G.CY+r*math.sin(2*math.pi*i/n),z) for r,z in profile for i in range(n)]
 fs=[]
 for j in range(len(profile)):
  jj=(j+1)%len(profile)
  for i in range(n):fs.append((j*n+i,j*n+(i+1)%n,jj*n+(i+1)%n,jj*n+i))
 o=add_mesh(name,vs,fs,mat,parent)
 # Recalculate outward normals only for newly authored closed parts.
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
 return o
def annulus(name,inner,outer,z,depth,mat,parent=None):
 return lathe(name,[(inner,z-depth/2),(outer,z-depth/2),(outer,z+depth/2),(inner,z+depth/2)],mat,parent)
def register(o,label,group,offset=(0,0,0),note='',shell=False):
 PARTS.append({'id':o.name,'node':o.name,'label':label,'group':group,'note':note or '通用教学内部结构，不代表厂家真实内部。','explodeOffset':list(offset),'defaultVisible':True,**({'transparentShell':True} if shell else {})})
 o['partId']=o.name;o['teachingNote']=PARTS[-1]['note']
def iris_blade(k,r):
 a=k*2*math.pi/G.IRIS_COUNT;step=2*math.pi/G.IRIS_COUNT
 z=G.IRIS_Z+k*G.IRIS_PITCH;segments=20
 inner=[(G.CX+r*math.cos(a+step*1.10*j/segments),G.CY+r*math.sin(a+step*1.10*j/segments)) for j in range(segments+1)]
 outer=[(G.CX+G.IRIS_OUTER*math.cos(a+step*(1.10-j*1.10/segments)),G.CY+G.IRIS_OUTER*math.sin(a+step*(1.10-j*1.10/segments))) for j in range(segments+1)]
 poly=inner+outer
 return [(x,y,z+dz) for dz in [-G.IRIS_DEPTH/2,G.IRIS_DEPTH/2] for x,y in poly]
def make_iris(mat):
 n=42
 fs=[tuple(range(n)),tuple(reversed([n+i for i in range(n)]))]+[(i+n,(i+1)%n+n,(i+1)%n,i) for i in range(n)]
 for k in range(G.IRIS_COUNT):
  o=add_mesh('irisLeaf%02d'%(k+1),iris_blade(k,G.IRIS_MAX),fs,mat)
  for p in o.data.polygons:p.use_smooth=False
  o.shape_key_add(name='Basis');key=o.shape_key_add(name='ApertureClosed')
  for v,p in zip(key.data,iris_blade(k,G.IRIS_MIN)):v.co=p
  key.value=0
  register(o,'虹彩光阑叶片 %d'%(k+1),'iris',(0,.065+(.004*k),0),'分层扇区形态目标演示孔径；非厂家连杆结构。')
def all_meshes():return [o for o in bpy.data.objects if o.type=='MESH' and not o.name.startswith('RENDER_')]
def tree(o):return BVHTree.FromPolygons([o.matrix_world@v.co for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons],all_triangles=False)
def blockers(trees,a,b,skip=(),pad=2e-5):
 a,b=Vector(a),Vector(b);d=b-a;length=d.length
 if length<2*pad:return []
 d.normalize();bad=[]
 for name,t in trees.items():
  if name in skip:continue
  p,n,i,dist=t.ray_cast(a+d*pad,d,length-2*pad)
  if p is not None:bad.append({'node':name,'position':G.gl(p)})
 return bad
def oriented_cylinder(name,r,depth,pos,mat,axis=(0,0,1),parent=None,vertices=96):
 o=cylinder(name,r,depth,pos,mat,parent,vertices);o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector(axis).to_track_quat('Z','Y');return o

def outer_reflector(mat):
 nr,nz=384,80;v=[];f=[]
 for side in [0,1]:
  for j in range(nz+1):
   z=G.REFLECTOR_Z[0]+(G.REFLECTOR_Z[1]-G.REFLECTOR_Z[0])*j/nz;r=G.outer_radius(z)+side*.0012
   for k in range(nr):v.append((G.CX+r*math.cos(math.tau*k/nr),G.CY+r*math.sin(math.tau*k/nr),z))
 layer=(nz+1)*nr
 for side in [0,1]:
  for j in range(nz):
   for k in range(nr):
    q=side*layer+j*nr+k;q1=side*layer+j*nr+(k+1)%nr;face=(q,q1,q1+nr,q+nr);f.append(face if side else tuple(reversed(face)))
 for j in [0,nz]:
  for k in range(nr):
   q=j*nr+k;q1=j*nr+(k+1)%nr;f.append((q,q1,q1+layer,q+layer) if j==0 else (q1,q,q+layer,q1+layer))
 return add_mesh('outerReflector',v,f,mat)

def check_geometry(manifest):
 eps=3e-6
 names=[o.name for o in all_meshes()]
 transparent={'collimatorExit'}
 trees={o.name:tree(o) for o in all_meshes() if o.name not in transparent}
 cone=trees['coneReflectorSurface'];outer=trees['outerReflector']
 reflected=[];unintended=[]
 for path in manifest['optics']['twoReflectionPaths']:
  def bl(p):return Vector((p[0],-p[2],p[1]))
  ex=bl(path['exitPoint']);up=Vector((0,0,1));hit,n,idx,dist=cone.ray_cast(ex+up*.001,up,.15)
  if hit is None:reflected.append({'passed':False,'reason':'no cone hit','input':path});continue
  ray1=(up-2*up.dot(n)*n).normalized();h2,n2,idx2,d2=outer.ray_cast(hit+ray1*eps,ray1,.2)
  if h2 is None:reflected.append({'passed':False,'reason':'no outer hit','conePoint':G.gl(hit)});continue
  ray2=(ray1-2*ray1.dot(n2)*n2).normalized()
  if ray2.z<=0:reflected.append({'passed':False,'reason':'not upward after second reflection'});continue
  final=h2+ray2*((G.SAMPLE[2]-h2.z)/ray2.z);miss=(final-Vector(G.SAMPLE)).length
  segments=[(ex+up*.001,hit,{'coneReflectorSurface','coneAbsorbingTip','coneBlackCap'}),(hit+ray1*eps,h2,{'coneReflectorSurface','outerReflector'}),(h2+ray2*eps,final,{'outerReflector'})]
  hits=[]
  for a,b,skip in segments:hits+=blockers(trees,a,b,skip=skip,pad=2e-5)
  # Specimen-holder partial shading remains visible and is not repaired away.
  unexpected=[q for q in hits if q['node'] not in {'tripo_part_21','coneSupportStem'}]
  if unexpected:unintended.extend(unexpected)
  reflected.append({'passed':miss<=G.SAMPLE_RADIUS and not unexpected,'sampleMiss':miss,'conePoint':G.gl(hit),'outerPoint':G.gl(h2),'samplePlane':G.gl(final),'blockers':hits})
 root=bpy.data.objects['centralCone'];rest=root.location.copy()
 direct={}
 for mode in ['darkfield','brightfield']:
  root.location=rest+Vector((G.CONE_TRAVEL if mode=='brightfield' else 0,0,0));bpy.context.view_layer.update()
  ts={o.name:tree(o) for o in all_meshes() if o.name not in transparent}
  rows=[]
  for r in [0,G.COLLIMATED_RADIUS/2,G.COLLIMATED_RADIUS]:
   for k in range(48):
    a=Vector((G.CX+r*math.cos(math.tau*k/48),G.CY+r*math.sin(math.tau*k/48),G.COLLIMATOR_Z+.001));b=Vector((a.x,a.y,G.SAMPLE[2]));hits=blockers(ts,a,b,pad=2e-5)
    rows.append({'radius':r,'hits':hits})
  direct[mode]={'rays':len(rows),'blocked':sum(bool(x['hits']) for x in rows),'unblocked':sum(not x['hits'] for x in rows),'failures':[x for x in rows if (not x['hits'] if mode=='darkfield' else any(q['node']!='tripo_part_21' for q in x['hits']))][:30]}
 root.location=rest;bpy.context.view_layer.update()
 allcoords=[o.matrix_world@v.co for o in root.children_recursive if o.type=='MESH' for v in o.data.vertices]
 # Conservative envelope for every position from centered to parked.
 envelope={'x':[min(p.x for p in allcoords),max(p.x for p in allcoords)+G.CONE_TRAVEL],'y':[min(p.y for p in allcoords),max(p.y for p in allcoords)],'z':[min(p.z for p in allcoords),max(p.z for p in allcoords)]}
 result={'schemaVersion':2,'modelSha256':manifest['modelSha256'],'method':'Actual authored triangles: exit-to-cone, first reflected ray to outer mirror, second reflected ray to sample plane; finite parallel-beam direct blocking/opening samples. Not an LED/lens image or irradiance simulation.','reflectedPaths':{'rays':len(reflected),'passed':all(r['passed'] for r in reflected),'maximumSampleMiss':max((r.get('sampleMiss',1) for r in reflected),default=1),'failures':[r for r in reflected if not r['passed']],'knownOcclusions':[r for r in reflected if r.get('blockers') and r['passed']]},'direct':direct,'coneSweptEnvelopeBlender':envelope,'passed':all(r['passed'] for r in reflected) and not direct['darkfield']['failures'] and not direct['brightfield']['failures'],'boundaries':['The ideal collimated output is specified, not optically solved from a finite LED source.','The cone support shades a narrow sector; sampled teaching rays avoid it.','Unmeasured shell and stereo pupil remain teaching proxies.','Intermediate cone positions do not constitute a stable observation mode.']}
 (OUT/'geometry-checks.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print('LOCAL_CHECKS',json.dumps({k:v for k,v in result.items() if k in ['passed','reflectedPaths','direct']})[:10000],flush=True)
 return result

def render_views():
 sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=40;sc.cycles.use_denoising=True;sc.render.resolution_x=1200;sc.render.resolution_y=1200;sc.render.resolution_percentage=100
 sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.21,.23,.26,1);sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.32
 sc.view_settings.view_transform='AgX'
 bpy.ops.object.camera_add();camera=bpy.context.object;sc.camera=camera;camera.data.type='ORTHO';camera.data.lens=50
 bounds=[o.matrix_world@Vector(v) for o in all_meshes() for v in o.bound_box]
 lo=Vector(tuple(min(v[k] for v in bounds) for k in range(3)));hi=Vector(tuple(max(v[k] for v in bounds) for k in range(3)));target=(lo+hi)/2
 camera.location=target+Vector((1,-1.5,.70));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
 qi=camera.rotation_euler.to_quaternion().inverted();projected=[qi@(v-target) for v in bounds]
 camera.data.ortho_scale=1.13*max(max(v[k] for v in projected)-min(v[k] for v in projected) for k in [0,1])
 for name,pos,power,size in [('StudioKey',(-.7,-1,.9),160,1.2),('StudioRim',(.6,.5,1),130,.8),('StudioFill',(.4,-.8,.4),35,.7)]:
  ld=bpy.data.lights.new(name,'AREA');o=bpy.data.objects.new(name,ld);sc.collection.objects.link(o);o.location=pos;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler();ld.energy=power;ld.shape='DISK';ld.size=size
 (OUT/'renders').mkdir(exist_ok=True)
 sc.render.filepath=str(OUT/'renders/hero.png');bpy.ops.render.render(write_still=True)
 # Render-only local section removes the front half of the shell and outer mirror.
 # The saved master/GLB are unchanged by this visibility aid.
 retain={'tripo_part_4','tripo_part_5','tripo_part_14','tripo_part_16','tripo_part_21','tripo_part_26'}
 for o in all_meshes():
  if o.name.startswith('tripo_part_') and o.name not in retain:o.hide_render=True
 clip={'tripo_part_4','tripo_part_5','lampHousingLiner','stageWellLiner','outerReflector','outerReflectorMount'}
 for name in clip:
  o=bpy.data.objects.get(name)
  if not o:continue
  dup=o.copy();dup.data=o.data.copy();dup.name='RENDER_Cutaway_'+name;sc.collection.objects.link(dup);o.hide_render=True
  bm=bmesh.new();bm.from_mesh(dup.data)
  # Mesh vertices are in object local coordinates, so transform clipping plane.
  inv=dup.matrix_world.inverted();plane=inv@Vector((G.CX,G.CY,.23));normal=(dup.matrix_world.to_3x3().transposed()@Vector((0,1,0))).normalized()
  bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=plane,plane_no=normal,clear_inner=True,clear_outer=False)
  bm.to_mesh(dup.data);bm.free()
 target=Vector((G.CX,G.CY,.231));camera.location=target+Vector((.35,-.60,.32));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=.29
 sc.render.filepath=str(OUT/'renders/lamp-chamber-cutaway.png');bpy.ops.render.render(write_still=True)

def main():
 global ROOT
 started=time.time();OUT.mkdir(parents=True,exist_ok=True)
 p=argparse.ArgumentParser();p.add_argument('--no-renders',action='store_true');p.add_argument('--render-only',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
 if args.render_only:
  bpy.ops.wm.open_mainfile(filepath=str(OUT/'microscope.blend'));render_views();return
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 original_sha=sha(SOURCE);bpy.ops.import_scene.gltf(filepath=str(SOURCE));ROOT=bpy.data.objects.get('ROOT')
 original_counts={o.name:len(o.data.polygons) for o in bpy.data.objects if o.type=='MESH'}
 bpy.data.objects.remove(bpy.data.objects['tripo_part_25'],do_unlink=True)
 labels={0:'顶照灯与鹅颈',1:'圆底座主体',2:'镜头主体',3:'镜臂与物镜外壳',4:'载物台',5:'台下灯室外壳',6:'调焦旋钮 A',7:'目镜 A',8:'目镜 B',9:'升降支架',10:'细鹅颈附件',11:'目镜安装筒 A',12:'目镜安装筒 B',13:'底座连接外壳',14:'台面窗口环',15:'镜头控制旋钮 A',16:'台面旋钮',17:'俯仰轴端 A',18:'俯仰轴端 B',19:'调焦旋钮 B',20:'底座俯仰连接座',21:'宝石夹持件',22:'镜头控制旋钮 B',23:'紧固杆 A',24:'紧固杆 B',26:'台面紧固件'}
 for k,label in labels.items():
  o=bpy.data.objects['tripo_part_'+str(k)];group='tripoExterior';offset=(0,.13,0)
  if k in [1,13,17,18,20]:group='base';offset=(0,-.12,0)
  elif k in [4,14,16,21,26]:group='stage';offset=(.14,.055,0)
  elif k==5:group='lampHousing';offset=(-.16,0,0)
  elif k in [3,6,9,19]:group='frame';offset=(.15,.06,0)
  register(o,label,group,offset,'保留 KSW6000 Tripo 外形、几何及纹理；名称按外形辨识，非厂家精确部件定义。',k in [4,5])
 black=material('Teaching matte black',(.012,.018,.020),.16,.5);steel=material('Teaching neutral optical reflector',(.72,.75,.76),.98,.08);mount=material('Teaching brushed metal',(.34,.38,.39),.80,.28);glass=material('Ideal collimator exit',(.83,.91,.94),0,.06,.96);emitter=material('LED emitting surface',(1,.93,.8),0,.42,0,2)
 lathe('lampHousingLiner',[(.1015,.169),(.103,.169),(.112,.273),(.1105,.273)],black,parent=bpy.data.objects['tripo_part_5'])
 lathe('stageWellLiner',[(.059,.277),(.0605,.277),(.055,.295),(.0535,.295)],black,parent=bpy.data.objects['tripo_part_4'])
 cap=cylinder('lampHousingCap',.104,.003,(G.CX,G.CY,.166),black);register(cap,'灯室底部封盖','lampHousing',(0,-.075,0),shell=True)
 ledmount=cylinder('ledHeatSink',.019,.010,(G.CX,G.CY,.1725),mount);register(ledmount,'LED 光源与散热座','source',(0,-.035,0))
 emitter_node=cylinder('lampEmitter',.008,.001,(G.CX,G.CY,.178),emitter,parent=ledmount)
 coll=empty('collimatorAssembly',(G.CX,G.CY,G.COLLIMATOR_Z));register(coll,'准直组件（功能示意）','source',(0,-.022,0),'示意准直输出，不逆向声称厂家镜组、焦距或LED辐射分布。')
 annulus('collimatorHousing',.0215,.0275,.184,.020,black,parent=coll)
 annulus('collimatorBaseSeat',.010,.0275,.171,.007,black,parent=coll)
 cylinder('collimatorExit',.021,.0012,(G.CX,G.CY,G.COLLIMATOR_Z),glass,parent=coll)
 annulus('collimatorRetainer',.020,.027,.196,.002,black,parent=coll)
 central=empty('centralCone',(G.CX,G.CY,G.CONE_APEX));register(central,'中央可退出锥形反射器','centralCone',(0,.035,0),'暗域时把准直光转为径向光；亮域时在灯室内部平移让开光束，传动为教学简化。')
 r0,r1=G.CONE_CORE_RADIUS,G.CONE_RADIUS
 lathe('coneReflectorSurface',[(r0,G.CONE_APEX+r0),(r1,G.CONE_APEX+r1),(r1,G.CONE_APEX+r1+G.CONE_DEPTH),(r0,G.CONE_APEX+r0+G.CONE_DEPTH)],steel,parent=central,n=384)
 cylinder('coneAbsorbingTip',r0,G.CONE_DEPTH,(G.CX,G.CY,G.CONE_APEX+r0+G.CONE_DEPTH/2),black,parent=central)
 cylinder('coneBlackCap',G.CONE_RADIUS,.0006,(G.CX,G.CY,G.CONE_APEX+G.CONE_RADIUS+.001),black,parent=central)
 # One narrow forward support shades a declared small azimuth sector.
 cylinder('coneSupportStem',.0007,.034,(G.CX,G.CY-.027,.219),mount,parent=central,vertices=32)
 box('coneCapArm',(G.CX,G.CY-.0245,.2325),(.002,.0045,.001),black,parent=central,bevel=.0002)
 box('coneSliderFoot',(G.CX,G.CY-.030,.202),(.013,.009,.004),black,parent=central,bevel=.0003)
 guide=empty('coneGuide',(G.CX+.029,G.CY-.030,.202));register(guide,'灯室内短行程导向','guide',(0,-.018,0),'滑轨位于水平出射光下方和准直束之外；不构造未知厂家齿轮或穿壳传动。')
 for name,y in [('coneGuideLeft',G.CY-.036),('coneGuideRight',G.CY-.024)]:box(name,(G.CX+.029,y,.202),(.077,.003,.005),black,parent=guide,bevel=.0003)
 box('coneGuideMount',(G.CX+.029,G.CY-.030,.1965),(.077,.017,.004),black,parent=guide,bevel=.0004)
 for x in [G.CX-.002,G.CX+.060]:box('coneGuidePillar',(x,G.CY-.030,.182),(.004,.008,.030),black,parent=guide,bevel=.0003)
 outer=outer_reflector(steel);register(outer,'外围腰形反射面（教学曲面）','reflector',(-.115,-.015,0),'把水平径向光再次反射到样品；参数独立设计，不使用旧椭球两焦点解释。')
 rtop=G.outer_radius(G.REFLECTOR_Z[1]);holder=annulus('outerReflectorMount',rtop-.0002,.102,.2335,.0025,black);register(holder,'外围反射器固定支架','reflector',(-.115,-.015,0))
 for k in range(3):
  phi=math.tau*k/3;cylinder('outerReflectorPost%d'%k,.0025,.067,(G.CX+.098*math.cos(phi),G.CY+.098*math.sin(phi),.2005),mount,parent=holder,vertices=32)
 modepos=(G.CX+.029,G.CY-.113,.202);mode=empty('bottomModeLever',modepos);register(mode,'底光明暗域选择拨钮','control',(0,0,.022),'拨钮表达控制关系；未知穿壳传动不建造，内部横移仅为教学简化。')
 oriented_cylinder('bottomModeKnob',.007,.007,modepos,black,(0,1,0),parent=mode)
 box('bottomModeIndex',(modepos[0],modepos[1]-.0038,modepos[2]+.003),(.001,.0005,.004),mount,parent=mode,bevel=.0002)
 carrier=annulus('irisCarrier',G.IRIS_MAX+.0004,G.IRIS_OUTER+.004,G.IRIS_Z+.0002,.0026,black);register(carrier,'独立虹彩光阑支承环','iris',(0,.065,0));make_iris(black)
 iriscontrol=empty('irisControl',(G.CX,G.CY,G.IRIS_Z+.004));register(iriscontrol,'光阑操作环与短柄','iris',(0,.065,0),'短柄、转环与叶片形变联动仅表达孔径控制，不代表厂家连杆。')
 annulus('irisControlRing',G.IRIS_OUTER+.002,G.IRIS_OUTER+.006,G.IRIS_Z+.004,.0025,black,parent=iriscontrol)
 handle=box('irisHandle',(G.CX+.044,G.CY-.065,G.IRIS_Z+.004),(.008,.027,.004),black,parent=iriscontrol,bevel=.001);handle.rotation_euler.z=math.radians(30)
 for o in ADDED:o['authoredForRepair']=True
 bpy.context.view_layer.update()
 manifest=G.contract();manifest['parts']=PARTS;manifest['source']['file']='../candidate-textured.glb';manifest['source']['sha256']=original_sha;manifest['source']['originalPolygonCounts']=original_counts
 manifest['source']['independentInnerWallNodes']=['lampHousingLiner','stageWellLiner'];manifest['source']['surfaceClippedNode']=None
 bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'microscope.blend'))
 bpy.ops.export_scene.gltf(filepath=str(OUT/'model.glb'),export_format='GLB',export_yup=True,export_apply=False,export_extras=True,export_morph=True,export_morph_normal=True,export_cameras=False,export_lights=False)
 manifest['modelSha256']=sha(OUT/'model.glb');manifest['modelBytes']=(OUT/'model.glb').stat().st_size
 (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');(OUT/'contract.json').write_text(json.dumps(G.contract(),ensure_ascii=False,indent=2)+'\n')
 provenance={'assetId':manifest['assetId'],'baseExterior':{'file':'../candidate-textured.glb','sha256':original_sha,'preservation':'All 26 retained cloud nodes keep original geometry and UV; part25 removed; no slot cut.'},'reference':{'title':'宝石显微镜光源系统设计与改造','year':2014,'section':'3.3, pp65-66','url':'https://jogg.cug.edu.cn/cn/article/pdf/preview/87b93053-b5d9-48cd-9ff2-1459ff0685bd.pdf','use':'LED-collimator-central withdrawable cone-outer reflector-sample route, and distinct bright/dark lighting states only.'},'authoredParameters':'All internal dimensions, optical surface formula, collimated beam and lateral travel are authored teaching parameters, not manufacturer measurements or manufacturing specifications.','omitted':'No unsupported protective window; no inferred internal manufacturer drive train.','sources':{name:sha(HERE/name) for name in ['build_repair.py','geometry_contract.py']},'modelSha256':manifest['modelSha256']}
 (OUT/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
 print('ASSET_READY '+json.dumps({'sha256':manifest['modelSha256'],'bytes':manifest['modelBytes'],'parts':len(PARTS)}),flush=True)
 result=check_geometry(manifest)
 if sha(SOURCE)!=original_sha:raise RuntimeError('Original input changed')
 if not args.no_renders:render_views()
 print('BUILD_FINISHED',round(time.time()-started,2),'checksPassed',result['passed'],flush=True)
if __name__=='__main__':main()
