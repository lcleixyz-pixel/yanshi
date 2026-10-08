"""Rebuild portable spectroscope teaching assets. Blender 5.2, no external packages.
Usage: blender -b --python tools/3d-assets/blender/build_spectroscopes.py -- --instrument prism-spectroscope
All paths derive from this file. Original candidate.glb is never overwritten.
"""
import bpy, bmesh, math, json, hashlib, argparse, sys, random
from pathlib import Path
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from spectroscope_geometry import (AMICI_APPEARANCE, AMICI_HALF_HEIGHT,
 AMICI_SECTIONS, interface_descriptions, interface_guide_mesh, geometry_report)

ROOT=next(p for p in Path(__file__).resolve().parents if p.name=='gem-lab' and (p/'public').is_dir())
parser=argparse.ArgumentParser(); parser.add_argument('--instrument',choices=['prism-spectroscope','grating-spectroscope'],required=True);parser.add_argument('--samples',type=int,default=64);parser.add_argument('--no-render',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ID=args.instrument; PRISM=ID.startswith('prism'); PREFIX='PrismSpectroscope' if PRISM else 'GratingSpectroscope'
SOURCE=ROOT/'assets-source'/ID; TRIAL=SOURCE/'tripo-trials'/'2026-10-07'; OUT=ROOT/'public/assets/3d'/ID/'structure-v1'; REPAIR=TRIAL/'repair-v3'
for d in [OUT,REPAIR,REPAIR/'renders',REPAIR/'analysis']: d.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):
    if col.name!='Collection': bpy.data.collections.remove(col)
COL=bpy.data.collections.get('Collection')
if COL is None:
 COL=bpy.data.collections.new('Teaching assembly');bpy.context.scene.collection.children.link(COL)
else:COL.name='Teaching assembly'
bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1.0
PARTS=[]; ASSET=[]; INTERNAL=[]
def cv(p): return Vector((p[0],-p[2],p[1]))
def mat(name,color,metal=.0,rough=.35,glass=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 if glass:n.inputs['Transmission Weight'].default_value=.92;n.inputs['IOR'].default_value=1.52
 return m
BLACK=mat('Black anodised machined aluminium',(.004,.005,.006),.18,.68)
EDGE=mat('Satin black end rings',(.016,.018,.021),.62,.36)
DARK=mat('Internal matte optical baffles',(.008,.009,.010),.12,.61)
STEEL=mat('Satin sliding aluminium sleeve',(.10,.115,.13),.85,.28)
CROWN=mat('Crown glass teaching identity IOR 1.52',(.69,.89,.99),0,.055,True)
FLINT=mat('Flint glass teaching identity IOR 1.62',(.86,.77,.98),0,.055,True)
FLINT.node_tree.nodes.get('Principled BSDF').inputs['IOR'].default_value=1.62
# Round 3 changes the Amici glass identity only; retain the round-2 achromat.
AMICI_MATERIALS={}
for kind,appearance in AMICI_APPEARANCE.items():
 material=mat('Amici '+kind+' teaching glass',appearance['baseColor'],0,appearance['roughness'],True)
 node=material.node_tree.nodes.get('Principled BSDF')
 node.inputs['Transmission Weight'].default_value=appearance['transmission'];node.inputs['IOR'].default_value=appearance['ior']
 AMICI_MATERIALS[kind]=material
CEMENT_EDGE=mat('Amici cement-edge visibility guides teaching exaggeration',(.24,.29,.31),.05,.42)
GLASS=mat('Clear optical glass schematic',(.82,.93,.99),0,.06,True)
GRATING=mat('Transmission grating substrate schematic',(.83,.90,.95),.06,.18,True)
GROOVE=mat('Enlarged grating rulings schematic',(.18,.22,.24),.38,.44)
# Embedded normal texture contains microgeometry only: no reference pixels or baked light.
rng=random.Random(1007); im=bpy.data.images.new('Anodised_micro_normal_original',width=128,height=128); pix=[]
for i in range(128*128):
 x=rng.uniform(-.047,.047);y=rng.uniform(-.047,.047);z=math.sqrt(1-x*x-y*y);pix.extend((.5+x*.5,.5+y*.5,.5+z*.5,1))
im.pixels=pix;im.colorspace_settings.name='Non-Color'; im.filepath_raw=str(REPAIR/'anodised-normal.png');im.file_format='PNG';im.save();im.pack()
for material in [BLACK,EDGE]:
 n=material.node_tree.nodes; tx=n.new('ShaderNodeTexImage');tx.image=im; uv=n.new('ShaderNodeTexCoord'); mapping=n.new('ShaderNodeVectorMath');mapping.operation='SCALE';mapping.inputs[3].default_value=28;material.node_tree.links.new(uv.outputs['UV'],mapping.inputs[0]);material.node_tree.links.new(mapping.outputs[0],tx.inputs[0]); normal=n.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.35;material.node_tree.links.new(tx.outputs['Color'],normal.inputs['Color']);material.node_tree.links.new(normal.outputs[0],n.get('Principled BSDF').inputs['Normal'])
 # glTF cannot export arbitrary VectorMath UV mapping; use repeated UVs authored on meshes instead.
 material.node_tree.links.remove(tx.inputs[0].links[0]);material.node_tree.links.new(uv.outputs['UV'],tx.inputs[0])
def part(id,label,pivot=(0,0,0),explode=(0,0,0),internal=False,**extras):
 o=bpy.data.objects.new(PREFIX+'_'+id,None);COL.objects.link(o);o.location=cv(pivot);o['partId']=id;o['teachingSchematic']=internal;ASSET.append(o)
 d=dict(id=id,label=label,node=o.name,pivot=list(pivot),rotationAxisLocal=[0,0,1],rotatable=False,translatable=False,explodeOffset=list(explode),hotspot=list(pivot));d.update(extras);PARTS.append(d)
 if internal:INTERNAL.append(o)
 return o

def mesh(name,verts,faces,material,parent,smooth=True):
 me=bpy.data.meshes.new(name);me.from_pydata([cv(v) for v in verts],[],faces);me.update(); bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free()
 ob=bpy.data.objects.new(name,me);COL.objects.link(ob);ob.parent=parent;ob.matrix_parent_inverse=parent.matrix_world.inverted();me.materials.append(material);ASSET.append(ob)
 for p in me.polygons:p.use_smooth=smooth
 uv=me.uv_layers.new(name='UVMap')
 for poly in me.polygons:
  angles=[math.atan2(verts[me.loops[li].vertex_index][1],verts[me.loops[li].vertex_index][0]) for li in poly.loop_indices];crossesSeam=max(angles)-min(angles)>math.pi
  for li,angle in zip(poly.loop_indices,angles):
   v=verts[me.loops[li].vertex_index]
   if crossesSeam and angle<0:angle+=2*math.pi
   uv.data[li].uv=(28*angle/(2*math.pi),28*(v[2]/.145+.5))
 return ob

def lathe(name,profile,material,parent,n=192):
 vs=[];rows=[]
 for r,z in profile:
  if abs(r)<1e-12:rows.append([len(vs)]);vs.append((0,0,z))
  else:
   rows.append(list(range(len(vs),len(vs)+n)));vs.extend((r*math.cos(2*math.pi*j/n),r*math.sin(2*math.pi*j/n),z) for j in range(n))
 faces=[]
 for k in range(len(rows)):
  a,b=rows[k],rows[(k+1)%len(rows)]
  if len(a)==len(b)==1:continue
  for j in range(n):
   q=(j+1)%n
   if len(a)==1:faces.append((a[0],b[q],b[j]))
   elif len(b)==1:faces.append((a[j],a[q],b[0]))
   else:faces.append((a[j],a[q],b[q],b[j]))
 ob=mesh(name,vs,faces,material,parent)
 # UV V follows the manufactured cross-section arc, including radial end faces.
 # Using optical Z for V makes flat annular faces degenerate (zero tangent area).
 arc=[0.]
 for i in range(1,len(profile)):arc.append(arc[-1]+math.dist(profile[i-1],profile[i]))
 circumference=arc[-1]+math.dist(profile[-1],profile[0]);vertexRow={idx:i for i,row in enumerate(rows) for idx in row};uv=ob.data.uv_layers.active.data
 for poly in ob.data.polygons:
  angles=[math.atan2(vs[ob.data.loops[li].vertex_index][1],vs[ob.data.loops[li].vertex_index][0]) for li in poly.loop_indices];wrapU=max(angles)-min(angles)>math.pi
  values=[arc[vertexRow[ob.data.loops[li].vertex_index]] for li in poly.loop_indices];wrapV=max(values)-min(values)>circumference*.5
  for li,angle,v in zip(poly.loop_indices,angles,values):
   if wrapU and angle<0:angle+=2*math.pi
   if wrapV and v<circumference*.5:v+=circumference
   uv[li].uv=(28*angle/(2*math.pi),v*28/.145)
 # Analytic meridian normals: face-area weighted profile tangent avoids a long tube
 # inheriting a spurious axial tilt from its tiny end bevels.
 normals=[None]*len(vs)
 for i,row in enumerate(rows):
  prev=profile[(i-1)%len(profile)];following=profile[(i+1)%len(profile)];dr=following[0]-prev[0];dz=following[1]-prev[1]
  if len(row)==1:
   normals[row[0]]=cv((0,0,-1 if i==0 else 1));continue
  for j,idx in enumerate(row):
   a=2*math.pi*j/n;normal=Vector((dz*math.cos(a),dz*math.sin(a),-dr)).normalized();normals[idx]=cv(normal)
 ob.data.normals_split_custom_set_from_vertices(normals)
 return ob

def ring(name,z0,z1,r,inner,material,parent,bevel=.00035):
 b=min(bevel,(z1-z0)*.24,(r-inner)*.24)
 return lathe(name,[(r-b,z0),(r,z0+b),(r,z1-b),(r-b,z1),(inner+b,z1),(inner,z1-b),(inner,z0+b),(inner+b,z0)],material,parent)

def box(name,center,size,material,parent,bevel=.0001):
 bpy.ops.mesh.primitive_cube_add(size=1,location=cv(center));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material);o.parent=parent;o.matrix_parent_inverse=parent.matrix_world.inverted();ASSET.append(o)
 if bevel:
  mod=o.modifiers.new('Manufactured edge bevel','BEVEL');mod.width=bevel;mod.segments=3;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o

def lens(name,z,r,parent,material=None):
 profile=[(0,z-.0011),(.25*r,z-.00103),(.55*r,z-.00085),(.85*r,z-.00048),(r,z-.00018),(r,z+.00018),(.85*r,z+.00048),(.55*r,z+.00085),(.25*r,z+.00103),(0,z+.0011)]
 return lathe(name,profile,material or GLASS,parent)


# All dimensions are metres; selected nominal dimensions are schematic, not calibrated.
L=.095 if PRISM else .055; R=.009 if PRISM else .00725; WALL=.00085
entry=-L/2; eye=L/2; OPTICAL=[]; PRISMS=[]
body=part('barrel','独立消光镜筒外壳',explode=(0,0,-.180 if PRISM else -.105),hotspot=[0,R,0],transparentShell=True,shellMode='independent-closed-hollow-mesh',materialIntent='matte-black-anodised-aluminium')
barrelMesh=ring(PREFIX+'_hollow_barrel',entry+.005,eye-.013 if PRISM else eye-.009,R,R-WALL,BLACK,body,.00022)
slit=part('slitHousing','入光端与固定狭缝座',pivot=(0,0,entry+.003),explode=(0,0,-.090 if PRISM else -.043),hotspot=[0,0,entry],illustrative=True)
ring(PREFIX+'_entry_lip',entry,entry+.003,R*.985,R*.66,EDGE,slit,.00019)
ring(PREFIX+'_entry_recess',entry+.0025,entry+.007,R*.78,R*.65,DARK,slit,.00013)
if PRISM:
 control=part('slitControl','同轴滚花狭缝调节环',pivot=(0,0,entry+.0045),explode=(0,0,-.115),rotatable=True,rotationAxisLocal=[0,0,1],rotationRangeDegrees=[0,90],angleStopsDegrees=[0,90],motionEvidence='Penrose catalogue confirms rotation of the entrance end adjusts the slit; 0–90 degree range/linkage is teaching-only.',controlAngleChangesAperture=True)
 knurl=ring(PREFIX+'_coaxial_knurled_slit_ring',entry+.001,entry+.0075,R*1.04,R*.99,EDGE,control,.00014)
 for v in knurl.data.vertices:
  a=math.atan2(v.co.z,v.co.x);rr=math.hypot(v.co.x,v.co.z)
  if rr>R*1.02:
   scale=1+.010*math.cos(96*a);v.co.x*=scale;v.co.z*=scale
 knurl.data.update();knurl.data.normals_split_custom_set([(0,0,0)]*len(knurl.data.loops))
 # Tiny engraved-like index dot is a closed mesh, not a fake wavelength scale.
 box(PREFIX+'_slit_control_index',(0,R*1.045,entry+.0045),(.00035,.00016,.00125),STEEL,control,.00006)
SLIT_Z=entry+.0085; GAP_MIN=.00004; GAP_MAX=.00080
for sign,suffix,label in [(-1,'Left','左狭缝刃口'),(1,'Right','右狭缝刃口')]:
 extras=dict(translationAxisLocal=[sign,0,0],translatable=True,translationRange=[0,(GAP_MAX-GAP_MIN)/2],drivenBy='slitControl',motionEvidence='Symmetric linear teaching linkage; minimum gap 40 micrometres prevents blade collision.') if PRISM else dict(translatable=False,motionEvidence='GIA fixed slit; no movable control.')
 parent=part('slit'+suffix,label+('（联动）' if PRISM else '（固定）'),pivot=(sign*.003,0,SLIT_Z),explode=(0,0,-.055 if PRISM else -.025),internal=True,**extras)
 r=R*.72;a=math.acos(GAP_MIN/(2*r));section=[(sign*r*math.cos(-a+2*a*i/96),r*math.sin(-a+2*a*i/96)) for i in range(97)];N=len(section)
 vs=[(x,y,SLIT_Z+dz) for dz in [-.00020,.00020] for x,y in section];faces=[tuple(reversed(range(N))),tuple(range(N,2*N))]
 for i in range(N):faces.append((i,(i+1)%N,(i+1)%N+N,i+N))
 mesh(PREFIX+'_knife_'+suffix,vs,faces,DARK,parent,False)
COLL_Z=entry+.022 if PRISM else entry+.016
coll=part('collimator','消色差准直透镜（胶合双片示意）' if PRISM else '准直透镜（示意）',pivot=(0,0,COLL_Z),explode=(0,0,-.030 if PRISM else -.011),internal=True,illustrative=True)
r=R*.63
if PRISM:
 # Positive crown + negative flint teaching doublet share one curved cement surface.
 # Crown is centre-thick and flint is centre-thin; these are not an optical prescription.
 radial=[0,.25,.55,.85,1]
 front=lambda t:COLL_Z-.0012+.0010*t*t
 cement=lambda t:COLL_Z+.0008-.0008*t*t
 rear=lambda t:COLL_Z+.0012
 first=[(r*t,front(t)) for t in radial]+[(r*t,cement(t)) for t in reversed(radial)]
 second=[(r*t,cement(t)) for t in radial]+[(r*t,rear(t)) for t in reversed(radial)]
 for suffix,profile,material in [('crown',first,CROWN),('flint',second,FLINT)]:OPTICAL.append(lathe(PREFIX+'_achromat_'+suffix,profile,material,coll))
else:OPTICAL.append(lens(PREFIX+'_collimator_glass',COLL_Z,r,coll))
ring(PREFIX+'_collimator_retainer',COLL_Z-.0015,COLL_Z+.0015,R*.74,R*.645,DARK,coll,.00010)
if PRISM:
 pp=part('prismTrain','Amici 直视棱镜组：冕–火石–冕（3块示意）',pivot=(0,0,0),explode=(0,0,.018),internal=True,illustrative=True,opticalSimulation=False,glassSequence=['crown','flint','crown'],prismCount=3,cemented=True,countIsTeachingSchematic=True)
 # Three triangular cross sections tessellate a single optical block, with matching
 # oblique interfaces and no air gaps; central axis crosses face interiors, not apexes.
 for i,(section,kind) in enumerate(zip(AMICI_SECTIONS,['crown','flint','crown'])):
  vs=[(x,y,z) for y in [-AMICI_HALF_HEIGHT,AMICI_HALF_HEIGHT] for x,z in section]
  material=AMICI_MATERIALS[kind]
  ob=mesh(PREFIX+'_amici_'+str(i+1)+'_'+kind,vs,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],material,pp,False)
  ob['glassType']=kind;ob['cementedTeachingPrism']=True;PRISMS.append(ob);OPTICAL.append(ob)
 # Narrow closed ribbons mark only the outer edges of the two actual shared
 # glass planes. They introduce neither an air gap nor an opaque optical layer.
 for i,interface in enumerate(interface_descriptions(),1):
  vertices,faces=interface_guide_mesh(i)
  seam=mesh(interface['node'],vertices,faces,CEMENT_EDGE,pp,False)
  seam['cementInterfaceEdgeGuide']=True;seam['opticalLayer']=False
 report=geometry_report();assert report['ok'],report
 (REPAIR/'analysis/amici-geometry-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 for x in [-.0052,.0052]:box(PREFIX+'_prism_support',(x,-.0043,0),(.00055,.00055,.027),DARK,pp,.00008)
 focus=part('focusTube','目镜抽拉套筒',pivot=(0,0,eye-.021),explode=(0,0,.075),translationAxisLocal=[0,0,1],translatable=True,translationRange=[0,.020],motionEvidence='Friction draw tube confirmed in mineralogy.eu collection. 20 mm illustrative travel yields 95–115 mm overall length, not a specific measured specimen.')
 ring(PREFIX+'_sliding_focus_tube',eye-.039,eye-.006,R-.00105,R-.00185,STEEL,focus,.00019)
 eyepiece=part('eyepiece','目镜与目口（随抽拉套筒）',pivot=(0,0,eye-.003),explode=(0,0,.045),integralWith='focusTube',parentPart='focusTube')
 eyemesh=lathe(PREFIX+'_continuous_eyepiece_and_recess',[(R*.69-.00015,eye-.008),(R*.69,eye-.00785),(R*.69,eye-.006),(R*1.04-.00035,eye-.006),(R*1.04,eye-.00565),(R*1.04,eye-.00035),(R*1.04-.00035,eye),(R*.53+.00035,eye),(R*.53,eye-.00035),(R*.53,eye-.00785),(R*.53+.00015,eye-.008)],EDGE,eyepiece)
 eyemesh.data.materials.append(DARK)
 for poly in eyemesh.data.polygons:
  if poly.index//192 in [7,8,9,10]:poly.material_index=1
else:
 gp=part('grating','透射式复制光栅（树脂复制母版刻线）',pivot=(0,0,.003),explode=(0,0,.011),internal=True,illustrative=True,opticalSimulation=False,manufacturingPrinciple='复制光栅（树脂复制母版刻线）',rulingsEnlarged=True)
 OPTICAL.append(box(PREFIX+'_replica_grating_substrate',(0,0,.003),(.0076,.0076,.0005),GRATING,gp,.00006))
 for i in range(36):box(PREFIX+'_enlarged_parallel_ruling_%02d'%i,(-.0035+i*.0002,0,.003265),(.000025,.0068,.000023),GROOVE,gp,0)
 gf=part('gratingFrame','光栅固定框（示意）',pivot=(0,0,.003),explode=(0,0,.028),internal=True,illustrative=True)
 for x in [-.0041,.0041]:box(PREFIX+'_grating_frame_side',(x,0,.003),(.0005,.0086,.0010),DARK,gf,.00006)
 for y in [-.0041,.0041]:box(PREFIX+'_grating_frame_end',(0,y,.003),(.0086,.0005,.0010),DARK,gf,.00006)
 eyepiece=part('eyepiece','固定目镜与目口',pivot=(0,0,eye-.004),explode=(0,0,.054),motionEvidence='GIA confirms fixed focus and slit. This asset has no movable part.')
 lathe(PREFIX+'_tapered_fixed_eyepiece',[(R-.0002,eye-.009),(R,eye-.0083),(R,eye-.0070),(R-.0003,eye-.0067),(R-.0003,eye-.0061),(R-.0008,eye-.0035),(R-.0025,eye-.0006),(R-.0028,eye),(R-.0038,eye),(R-.0041,eye-.0006),(R-.0041,eye-.0065),(R-.0038,eye-.009)],EDGE,eyepiece)
 ring(PREFIX+'_entry_satin_band',entry+.0006,entry+.005,R,R-.00060,EDGE,slit,.00013)
OPTICAL.append(lens(PREFIX+'_eyepiece_glass',eye-.0045,R*.43,eyepiece))
baff=part('baffles','内部消光环（示意）',pivot=(0,0,eye-.014),explode=(0,0,.057 if PRISM else .041),internal=True,illustrative=True)
for z in ([eye-.017,eye-.012] if PRISM else [eye-.014]):ring(PREFIX+'_internal_baffle',z,z+.0007,R-.0020,R*.49,DARK,baff,.00010)

if not PRISM:
 strips=[o for o in ASSET if o.name.startswith(PREFIX+'_enlarged_parallel_ruling_')]
 bpy.ops.object.select_all(action='DESELECT')
 for o in strips:o.select_set(True)
 bpy.context.view_layer.objects.active=strips[0]
 for o in strips[1:]:ASSET.remove(o)
 bpy.ops.object.join();strips[0].name=PREFIX+'_enlarged_parallel_rulings'

# Respect requested pivot positions while preserving world-authored mesh coordinates.
bpy.context.view_layer.update()
for o in ASSET:
 if o.type=='MESH' and o.parent:o.matrix_parent_inverse=o.parent.matrix_world.inverted()
if PRISM:
 bpy.context.view_layer.update();world=eyepiece.matrix_world.copy();eyepiece.parent=focus;eyepiece.matrix_world=world
 bpy.context.view_layer.update();before=eyepiece.matrix_world.translation.copy();focus.location+=cv((0,0,.020));bpy.context.view_layer.update();delta=eyepiece.matrix_world.translation-before;focus.location-=cv((0,0,.020));bpy.context.view_layer.update()
 (REPAIR/'analysis/focus-hierarchy.json').write_text(json.dumps({'eyepieceParent':focus.name,'testTranslationMeters':.020,'eyepieceTranslationGLB':[delta.x,delta.z,-delta.y],'pass':(delta-cv((0,0,.020))).length<1e-7},indent=2))
for ob in ASSET:
 if ob.type=='MESH':
  mod=ob.modifiers.new('Explicit portable triangles','TRIANGULATE');mod.keep_custom_normals=True;bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.context.view_layer.update()
# Validate optical intersections on meshes before export: no dispersion or ray tracing implied.
from mathutils.bvhtree import BVHTree
hits=[]
for ob in OPTICAL:
 world=[ob.matrix_world@v.co for v in ob.data.vertices];tree=BVHTree.FromPolygons(world,[list(p.vertices) for p in ob.data.polygons]);origin=cv((0,0,entry-.01));direction=cv((0,0,1));coords=[]
 for iteration in range(8):
  co,normal,index,distance=tree.ray_cast(origin,direction,.25)
  if co is None:break
  coords.append([co.x,co.z,-co.y]);origin=co+direction*.0000001
 hits.append({'mesh':ob.name,'centerAxisHits':coords,'crossesTwoFaces':len(coords)==2})
raypass=all(h['crossesTwoFaces'] for h in hits)
(REPAIR/'analysis/optical-center-ray.json').write_text(json.dumps({'pass':raypass,'axisGLB':[0,0,1],'slit':'40 micrometre minimum gap contains the centre axis; blades are not expected to intersect it.','checks':hits,'boundary':'Geometric centreline intersections only; no refraction, diffraction, dispersion or wavelength calibration.'},indent=2))
if PRISM:
 checks=[h for h in hits if '_amici_' in h['mesh']]
 (REPAIR/'analysis/prism-center-ray.json').write_text(json.dumps({'pass':len(checks)==3 and all(h['crossesTwoFaces'] for h in checks),'checks':checks,'glassSequence':['crown','flint','crown'],'cementedInterfaces':True,'sharedInterfacePlanesXZ':['z=-0.0065-1.1607142857*x','z=0.0065+1.1607142857*x'],'apexOffAxisMeters':.0056,'countIsTeachingSchematic':True},indent=2))
 # Check drive at five positions, including hard stops; a closed setting retains a safe teaching gap.
 states=[{'angleDegrees':angle,'apertureMeters':GAP_MIN+(GAP_MAX-GAP_MIN)*angle/90,'leftTranslationMeters':-(GAP_MAX-GAP_MIN)/2*angle/90,'rightTranslationMeters':(GAP_MAX-GAP_MIN)/2*angle/90} for angle in [0,22.5,45,67.5,90]]
 (REPAIR/'analysis/slit-linkage.json').write_text(json.dumps({'pass':all(s['apertureMeters']>0 for s in states),'hardStopsDegrees':[0,90],'states':states,'couplingIsTeachingSchematic':True},indent=2))

bpy.ops.object.select_all(action='DESELECT')
for o in ASSET:o.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.export_scene.gltf(filepath=str(OUT/'model.glb'),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_apply=True,export_tangents=True,export_image_format='AUTO',export_materials='EXPORT',export_cameras=False,export_lights=False)
sha=hashlib.sha256((OUT/'model.glb').read_bytes()).hexdigest();candidate=TRIAL/'candidate.glb'
if not candidate.exists():candidate=next(TRIAL.glob('*/candidate.glb'),None)
conflict={'taskText':'棱镜式紫端压缩、红端展开','adoptedText':'棱镜式紫端展开、红端压缩','reason':'Lotus Gemology primary practitioner article describes prism models as pulling violet and pushing red. Skyjems handheld page agrees; its Beck page contradicts both. Use Lotus and retain discrepancy for review.','primarySource':'https://lotusgemology.com/index.php/en/resources/articles/282-gem-testing-with-the-spectroscope-lotus-gemology'}
manifest=dict(id=ID+'-structure-v1',version='structure-3',revision='repair-v3',model='model.glb',sha256=sha,byteLength=(OUT/'model.glb').stat().st_size,units='meters',dimensionsCalibrated=False,teachingOpticsSimulated=False,internalOpticsIllustrative=True,opticalSimulation=False,opticalAxisLocal=[0,0,1],entryDirection='-Z',observationDirection='+Z',parts=PARTS,createdAt='2026-10-07',transparentShellParts=['barrel'],explodeAlongOpticalAxis=True,constructionNotes=['Relative scale is educational and uncalibrated. All exported geometry and metadata use metres.','Internal optics, glass recipes, supports and mechanical ranges are illustrative.','No side slot, side knob, external wavelength tube, brand/logo or reference photograph pixels.','Exploded layout separates only along the optical axis; it is not a mechanical travel limit.'],boundsNominalMeters={'length':L,'diameter':.019 if PRISM else .0145,'barrelDiameter':R*2,'lengthAtMaximumFocus':.115 if PRISM else .055},opticalPath=['adjustableSlit','achromaticCollimator','AmiciCrownFlintCrown','eyepiece'] if PRISM else ['fixedSlit','collimator','replicaTransmissionGrating','eyepiece'],wavelengthScale={'externalTube':False,'physicalReticleIncluded':False,'plannedDisplay':'Future webpage eyepiece-view teaching overlay only.'},teachingComparison={'grating':'光栅式波长分布较线性、均匀；本袖珍款狭缝和焦距固定。','prism':'棱镜式紫端展开、红端压缩；通常透光效率较高，亮度取决于狭缝、镀膜和照明；此款可调狭缝与抽拉调焦。','sourceConflict':conflict})
if PRISM:
 manifest['controlLinkages']=[dict(type='symmetricSlit',controlPart='slitControl',drivenParts=['slitLeft','slitRight'],angleRangeDegrees=[0,90],apertureRangeMeters=[GAP_MIN,GAP_MAX],perBladeTravelMeters=(GAP_MAX-GAP_MIN)/2,closedStopGapMeters=GAP_MIN,hardStops=True,formula='gap = 0.00004 + 0.00076 * clamp(angleDegrees, 0, 90) / 90; left/right move by -/+0.00038 * angleDegrees / 90 along X',couplingIsTeachingSchematic=True)]
 manifest['amiciAssembly']={'count':3,'sequence':['crown','flint','crown'],'cemented':True,'countIsTeachingSchematic':True,'historicalBeckReplica':False,'glassIORsAtDesignWavelength':None,'note':'3-block Amici teaching construction; actual historic Beck examples may have five prisms. Glass recipe/apex angles are not an optical prescription.'}
 manifest['amiciAssembly'].update(interfaces=interface_descriptions(),alternatingSlopes=True,materialAppearance=AMICI_APPEARANCE,interfaceVisibility='Two narrow edge guides on both exterior Y faces make the shared alternating cement planes visible; no air gap or opaque layer across the optical path.',appearanceValuesIllustrative=True)
else:
 manifest['controlLinkages']=[];manifest['fixedSlitAndFocus']=True;manifest['sizeBasis']={'length':'55 mm from OPL comparable pocket model; not specified by GIA.','diameter':'14.5 mm is the round-2 requested illustrative diameter. OPL specifies 12.5 mm; no 14.5 mm manufacturer measurement claimed.'}
 manifest['replicaGrating']={'description':'复制光栅（树脂复制母版刻线）','transmission':True,'rulingCountIllustrative':36,'rulingsEnlarged':True,'grooveDensityCalibrated':False}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
refs=json.loads((SOURCE/'references/sources-round2.json').read_text())['sources']
provenance=dict(instrument=ID,createdAt='2026-10-07',revision='repair-v3',dimensionsCalibrated=False,referenceManifest='assets-source/'+ID+'/references/sources-round2.json',references=[{k:v for k,v in item.items() if k!='original_path'} for item in refs],originalCandidate={'path':str(candidate.relative_to(ROOT)) if candidate else None,'sha256':hashlib.sha256(candidate.read_bytes()).hexdigest() if candidate else None,'preservedUnmodified':bool(candidate)},reconstruction={'script':'tools/3d-assets/blender/build_spectroscopes.py','blenderVersion':bpy.app.version_string,'method':'Round 3 independent parametric rebuild; Amici boundary visibility and glass identity updated, round-2 exterior geometry and mechanical ranges retained. No source photo pixels or original cloud triangles retained.','round1Archive':'assets-source/'+ID+'/tripo-trials/2026-10-07/repair-v1/','round2Archive':'assets-source/'+ID+'/tripo-trials/2026-10-07/repair-v2/','master':'assets-source/'+ID+'/tripo-trials/2026-10-07/repair-v3/master.blend'},tripo={'round2Credits':0,'round3Credits':0,'newCloudGeneration':False,'reason':'Existing round-1 candidate is preserved for comparison. Requested structural changes are directly rebuilt parametrically.','round1InstrumentCredits':55,'globalLedger':'assets-source/instruments-2026-10-07/tripo-ledger.json'},licenseBoundary='Published photographs are reference-only with no verified open licence. Source photographs and comparisons remain in ignored assets-source. Public files contain independently authored geometry/materials and model-only renders.',sourceConflict=conflict,reviewRequired=['Relative proportions and black surface/knurled collar appearance','Illustrative internal optics, supports and requested geometry','No optical prescription, physical calibration or user appearance acceptance claimed'])
provenance['reconstruction']['round3Change']=('Preserve the round-2 three-block tessellation and add two peripheral cement-edge guides; crown glass stays cooler and flint slightly yellow with a higher illustrative material IOR.' if PRISM else 'No geometry or controls changed from round 2; rebuild only for a uniform structure-3 / repair-v3 review set.')
provenance['reconstruction']['sharedGeometryScript']='tools/3d-assets/spectroscope_geometry.py'
if PRISM:provenance['reviewRequired'].insert(0,'Two alternating cement interfaces and subtle crown/flint material contrast must be inspected in the new isolated closeup and transparent-shell browser view.')
(OUT/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2))
uvChecks=[]
for ob in ASSET:
 if ob.type!='MESH' or not ob.data.uv_layers.active:continue
 bad=0;checked=0
 for poly in ob.data.polygons:
  material=ob.data.materials[poly.material_index]
  if material not in [BLACK,EDGE]:continue
  uv=[ob.data.uv_layers.active.data[i].uv for i in poly.loop_indices]
  if len(uv)==3:
   area=abs((uv[1].x-uv[0].x)*(uv[2].y-uv[0].y)-(uv[2].x-uv[0].x)*(uv[1].y-uv[0].y));checked+=1;bad+=int(area<1e-10)
 if checked:uvChecks.append({'mesh':ob.name,'normalMappedTriangles':checked,'degenerateUvTriangles':bad})
(REPAIR/'analysis/normal-tangent-uv.json').write_text(json.dumps({'pass':all(c['degenerateUvTriangles']==0 for c in uvChecks),'checks':uvChecks,'eyepieceBoreConstruction':'Single continuous closed lathe profile, with dark inner wall; no overlapping equal-radius recess shell.' if PRISM else 'Single continuous closed lathe profile.'},indent=2))
# Mesh closure check: every part may contain multiple closed shells; no open shell is accepted.
closure=[]
for o in ASSET:
 if o.type!='MESH':continue
 bm=bmesh.new();bm.from_mesh(o.data);bad=sum(not e.is_manifold for e in bm.edges);vol=bm.calc_volume(signed=True);closure.append(dict(name=o.name,vertices=len(bm.verts),faces=len(bm.faces),nonManifoldEdges=bad,volume=vol));bm.free()
containment=[]
for o in ASSET:
 if o.type=='MESH' and o.parent in INTERNAL:
  radius=max(math.hypot((o.matrix_world@v.co).x,(o.matrix_world@v.co).z) for v in o.data.vertices)
  containment.append(dict(name=o.name,maxRadialMeters=radius,innerBarrelRadius=R-WALL,insideBarrel=radius<=R-WALL+1e-7))
(REPAIR/'analysis/internal-containment.json').write_text(json.dumps({'allInsideBarrel':all(c['insideBarrel'] for c in containment),'checks':containment},indent=2))
(REPAIR/'analysis/mesh-closure.json').write_text(json.dumps({'allClosed':all(c['nonManifoldEdges']==0 for c in closure),'meshes':closure},indent=2))
# Reimport delivered GLB into a temporary scene and independently check names and world extents.
original=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(OUT/'model.glb')); imported=[o for o in bpy.data.objects if o not in original];names=[o.name.split('.')[0] for o in imported];reimport={'meshCount':sum(o.type=='MESH' for o in imported),'allPartsPresent':all(p['node'] in names for p in PARTS),'finiteTransforms':all(all(math.isfinite(v) for row in o.matrix_world for v in row) for o in imported)}
bpy.context.view_layer.update()
repoints=[o.matrix_world@Vector(v) for o in imported if o.type=='MESH' for v in o.bound_box]
reimport['boundsMetersGLB']={'min':[min(v.x for v in repoints),min(v.z for v in repoints),min(-v.y for v in repoints)],'max':[max(v.x for v in repoints),max(v.z for v in repoints),max(-v.y for v in repoints)]}
reimport['boundsSizeMetersGLB']=[reimport['boundsMetersGLB']['max'][i]-reimport['boundsMetersGLB']['min'][i] for i in range(3)]
reimport['lengthMatchesNominal']=abs(reimport['boundsSizeMetersGLB'][2]-L)<1e-6
for o in imported:bpy.data.objects.remove(o,do_unlink=True)
(REPAIR/'analysis/reimport.json').write_text(json.dumps(reimport,indent=2))
# Studio rendering: no fixed-angle lighting is baked into model textures.
scene=bpy.context.scene;scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=args.samples;scene.cycles.use_denoising=True;scene.render.image_settings.file_format='PNG';scene.render.resolution_percentage=100;scene.render.film_transparent=False
if scene.world is None:scene.world=bpy.data.worlds.new('Spectroscope studio')
scene.world.color=(.6,.6,.6)
scene.view_settings.exposure=0;scene.view_settings.gamma=1;scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.80,.83,.86,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
# Light powers are adapted to centimetre-size studio objects.
for name,loc,power,size in [('Key',(0.05,-.10,.16),.7,.12),('Strip',(-.08,.02,.07),.35,.09),('Rim',(.05,.13,.02),.45,.08)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;o=bpy.data.objects.new(name,data);COL.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
camd=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',camd);COL.objects.link(cam);scene.camera=cam;camd.type='ORTHO';camd.lens=65;camd.clip_start=.0005;camd.clip_end=10
# Reference frame: +Z optical maps to Blender -Y.
def render(name,position,scale,res=(1100,760),roll=0,axis_angle=None,target=(0,0,0)):
 cam.location=cv(position);cam.rotation_euler=(cv(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.rotation_euler.rotate_axis('Z',roll);
 if axis_angle is not None:
  projected=cam.rotation_euler.to_matrix().transposed()@cv((0,0,1)); cam.rotation_euler.rotate_axis('Z',math.atan2(projected.y,projected.x)-math.radians(axis_angle))
 camd.ortho_scale=scale;scene.render.resolution_x=res[0];scene.render.resolution_y=res[1];scene.render.filepath=str(REPAIR/'renders'/(name+'.png'));bpy.ops.render.render(write_still=True)
# White gallery background; alpha disabled to give consistent image inspection.
if not args.no_render:
 render('hero',(.12,.14,.19) if not PRISM else (.12,.11,.15),L*1.27,(1400,1000),.65 if PRISM else 0)
 import shutil;shutil.copy2(REPAIR/'renders/hero.png',OUT/'poster.png')
 for name,pos in [('front',(0,0,-1)),('back',(0,0,1)),('left',(-1,0,0)),('right',(1,0,0)),('top',(0,1,.00001)),('bottom',(0,-1,.00001))]:render(name,pos,L*1.18,(900,900))
 # Same-angle view approximately follows the public product photograph; never claims calibrated camera matching.
 render('reference-angle',(.19,.08,-.065) if PRISM else (.08,.17,.10),L*1.4,(1200,1000),axis_angle=8 if PRISM else 90)
 # Axial exploded layout: all parts remain centred on the optical axis.
 saved={o:o.location.copy() for o in ASSET if o.type=='EMPTY'}
 for p in PARTS:
  o=bpy.data.objects.get(p['node']); o.location+=cv(p['explodeOffset'])
 bpy.context.view_layer.update();points=[o.matrix_world@Vector(v) for o in ASSET if o.type=='MESH' for v in o.bound_box];lo=Vector(tuple(min(v[i] for v in points) for i in range(3)));hi=Vector(tuple(max(v[i] for v in points) for i in range(3)));center=(lo+hi)*.5
 render('exploded',(.30,.24,.28),max(hi-lo)*1.20,(1800,1050),axis_angle=10,target=(center.x,center.z,-center.y))
 for o,loc in saved.items():o.location=loc
 render('closeup',(.042,.032,eye+.036),.033,(1100,900),.25,target=(0,0,eye-.008))
 hidden={o:o.hide_render for o in ASSET if o.type=='MESH'}
 for o in hidden:o.hide_render=o.parent!=eyepiece
 render('eyepiece-isolated',(.020,.023,eye+.035),.027,(1200,1100),.15,target=(0,0,eye-.004))
 for o,value in hidden.items():o.hide_render=value
 if PRISM:
  hidden={o:o.hide_render for o in ASSET if o.type=='MESH'}
  for o in hidden:o.hide_render=o.parent!=pp
  render('amici-interfaces',(.026,.046,.020),.036,(1500,1100),axis_angle=10)
  for o,value in hidden.items():o.hide_render=value
if not args.no_render:
 shellMeshes=[o for o in ASSET if o.type=='MESH' and o.parent==body]
 for o in shellMeshes:o.hide_render=True
 render('shell-hidden-internals',(.09,.08,.105),L*1.45,(1500,1100),axis_angle=20)
 for o in shellMeshes:o.hide_render=False
 if PRISM:
  focus.location+=cv((0,0,.020));bpy.context.view_layer.update()
  render('focus-extended',(.12,.11,.15),.115*1.30,(1400,1000),.65,target=(0,0,.010))
  focus.location-=cv((0,0,.020));bpy.context.view_layer.update()
  for name in ['slitLeft','slitRight']:
   o=bpy.data.objects.get(PREFIX+'_'+name);o.location+=cv(((-1 if name=='slitLeft' else 1)*.00038,0,0))
  control.rotation_euler.rotate_axis('Y',-math.pi/2);bpy.context.view_layer.update()
  render('slit-open-entry',(0,0,entry-.08),.026,(1000,1000),target=(0,0,entry))
  control.rotation_euler.rotate_axis('Y',math.pi/2)
  for name in ['slitLeft','slitRight']:
   o=bpy.data.objects.get(PREFIX+'_'+name);o.location-=cv(((-1 if name=='slitLeft' else 1)*.00038,0,0))
  bpy.context.view_layer.update()
# Keep only assembly selected for review; complete reusable lighting stays editable in master.
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body;bpy.ops.wm.save_as_mainfile(filepath=str(REPAIR/'master.blend'))
print(json.dumps({'instrument':ID,'glb':str(OUT/'model.glb'),'bytes':manifest['byteLength'],'parts':len(PARTS),'closure':all(c['nonManifoldEdges']==0 for c in closure),'reimport':reimport}))
