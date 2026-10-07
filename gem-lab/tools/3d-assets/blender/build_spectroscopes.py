"""Rebuild portable spectroscope teaching assets. Blender 5.2, no external packages.
Usage: blender -b --python tools/3d-assets/blender/build_spectroscopes.py -- --instrument prism-spectroscope
All paths derive from this file. Original candidate.glb is never overwritten.
"""
import bpy, bmesh, math, json, hashlib, argparse, sys, random
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser(); parser.add_argument('--instrument',choices=['prism-spectroscope','grating-spectroscope'],required=True);parser.add_argument('--samples',type=int,default=64);parser.add_argument('--no-render',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ID=args.instrument; PRISM=ID.startswith('prism'); PREFIX='PrismSpectroscope' if PRISM else 'GratingSpectroscope'
SOURCE=ROOT/'assets-source'/ID; TRIAL=SOURCE/'tripo-trials'/'2026-10-07'; OUT=ROOT/'public/assets/3d'/ID/'structure-v1'; REPAIR=TRIAL/'repair-v1'
for d in [OUT,REPAIR,REPAIR/'renders',REPAIR/'analysis']: d.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):
    if col.name!='Collection': bpy.data.collections.remove(col)
COL=bpy.data.collections.get('Collection'); COL.name='Teaching assembly'
PARTS=[]; ASSET=[]; INTERNAL=[]
def cv(p): return Vector((p[0],-p[2],p[1]))
def mat(name,color,metal=.0,rough=.35,glass=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 if glass:n.inputs['Transmission Weight'].default_value=.92;n.inputs['IOR'].default_value=1.52
 return m
BLACK=mat('Black anodised machined aluminium',(.012,.014,.016),.08,.59)
EDGE=mat('Satin black end rings',(.016,.019,.022),.20,.50)
DARK=mat('Internal matte optical baffles',(.008,.009,.010),.12,.61)
STEEL=mat('Unbranded nickel plated side control',(.52,.53,.50),.95,.24)
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

def lens(name,z,r,parent):
 profile=[(0,z-.0011),(.25*r,z-.00103),(.55*r,z-.00085),(.85*r,z-.00048),(r,z-.00018),(r,z+.00018),(.85*r,z+.00048),(.55*r,z+.00085),(.25*r,z+.00103),(0,z+.0011)]
 return lathe(name,profile,GLASS,parent)

def prism_mesh(name,z,flip,parent):
 # Three alternating triangular prisms are an explicit illustrative count, not a product specification.
 # triangular cross section is X/Z, extrusion Y: vertices along y are separate.
 tri=[(-.008,z-.006),(.008,z-.006),(.004,z+.006)]
 if flip:tri=[(x,2*z-zz) for x,zz in tri]
 vs=[(x,y,zz) for y in [-.007,.007] for x,zz in tri]
 o=mesh(name,vs,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],GLASS,parent,False)
 bevel=o.modifiers.new('Polished edge bevel','BEVEL');bevel.width=.00012;bevel.segments=3;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=bevel.name)
 return o

L=.145 if PRISM else .083; R=.0128 if PRISM else .0119; entry=-L/2; eye=L/2
body=part('barrel','消光主镜筒',hotspot=[0,R,0]);barrelMesh=ring(PREFIX+'_hollow_barrel',entry+.004,eye-.0075 if PRISM else eye-.010,R,R-.00135,BLACK,body)
# End bands are separate solid annuli, with real openings and recessed inner rims.
slit=part('slitHousing','入光端与狭缝座',pivot=(0,0,entry+.003),explode=(0,0,-.018),hotspot=[0,0,entry]);ring(PREFIX+'_entry_lip',entry,entry+.004,R*.99,R*.63,EDGE,slit)
ring(PREFIX+'_entry_recess',entry+.003,entry+.008,R*.77,R*.62,DARK,slit)
# True light slit between two knife plates. Model gap .12 mm is illustrative, not calibrated.
for sign,suffix,label in [(-1,'Left','左狭缝片'),(1,'Right','右狭缝片')]:
 kwargs=dict(translationAxisLocal=[sign,0,0],translatable=True,translationRange=[0,.00065],motionEvidence='Opening is a teaching mechanism only; selected product linkage/scale is unverified.') if PRISM else dict(translatable=False,motionEvidence='GIA SKU 735032 has a fixed slit; no adjustment mechanism added.')
 p=part('slit'+suffix,label+('（开合示意）' if PRISM else '（固定）'),pivot=(sign*.004,0,entry+.008),explode=(sign*.018,0,-.012),internal=True,**kwargs)
 r=R*.75; a=math.acos(.00006/r); profile=[(sign*r*math.cos(-a+2*a*i/96),r*math.sin(-a+2*a*i/96)) for i in range(97)]; N=len(profile)
 vs=[(x,y,entry+.008+dz) for dz in [-.00027,.00027] for x,y in profile]; fs=[tuple(reversed(range(N))),tuple(range(N,2*N))]
 for i in range(N):fs.append((i,(i+1)%N,(i+1)%N+N,i+N))
 mesh(PREFIX+'_knife_'+suffix,vs,fs,DARK,p,False)
coll=part('collimator','准直透镜（结构示意）',pivot=(0,0,entry+.018),explode=(0,.017,-.009),internal=True)
lens(PREFIX+'_collimator_glass',entry+.018,R*.67,coll);ring(PREFIX+'_collimator_retainer',entry+.0167,entry+.0193,R*.76,R*.66,DARK,coll,.00012)
if PRISM:
 pp=part('prismTrain','直视棱镜组（数量与排布示意）',pivot=(0,0,-.011),explode=(0,.026,0),internal=True,illustrative=True,opticalSimulation=False)
 for i in range(3):prism_mesh(PREFIX+'_illustrative_prism_'+str(i+1),-.028+i*.017,i%2==1,pp)
 carrier=part('prismCarrier','棱镜夹持架（结构示意）',pivot=(0,0,-.011),explode=(0,-.024,0),internal=True,illustrative=True)
 for x in [-.0079,.0079]:box(PREFIX+'_prism_support', (x,-.0068,-.011),(.0012,.0012,.051),DARK,carrier)
 focus=part('focusTube','调焦管',pivot=(0,0,eye-.026),explode=(0,0,.025),translationAxisLocal=[0,0,1],translatable=True,translationRange=[0,.012],motionEvidence='Focus adjustment confirmed by Gem-A; axis and illustrative travel are not measured.')
 ring(PREFIX+'_sliding_focus_tube',eye-.039,eye-.004,R-.00155,R-.00265,BLACK,focus)
 eyepiece=part('eyepiece','观察端与目口',pivot=(0,0,eye-.003),explode=(0,0,.047),integralWith='focusTube',parentPart='focusTube')
 # One continuous closed profile, not two rings sharing the same inner cylinder.
 # The former shared R*.53 bore over 4 mm produced visible depth fighting.
 eyemesh=lathe(PREFIX+'_continuous_eyepiece_and_recess',[(R*.69-.00015,eye-.008),(R*.69,eye-.00785),(R*.69,eye-.006),(R*1.055-.00048,eye-.006),(R*1.055,eye-.00552),(R*1.055,eye-.00048),(R*1.055-.00048,eye),(R*.53+.00048,eye),(R*.53,eye-.00048),(R*.53,eye-.00785),(R*.53+.00015,eye-.008)],EDGE,eyepiece)
 eyemesh.data.materials.append(DARK)
 for poly in eyemesh.data.polygons:
  if poly.index//192 in [7,8,9,10]:poly.material_index=1
 # Axial shallow slot and nickel knob match visible external evidence. Function not asserted.
 slot=part('sideControl','侧调节钮（功能对应待核实）',pivot=(R+.002,0,eye-.022),explode=(.016,0,.012),functionUnverified=True)
 cutter=box(PREFIX+'_slot_cutter',(R-.00060,0,eye-.022),(.0040,.0037,.017),DARK,body,.00075)
 bpy.context.view_layer.update();mod=barrelMesh.modifiers.new('Evidence-backed side slot','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter;bpy.context.view_layer.objects.active=barrelMesh;bpy.ops.object.modifier_apply(modifier=mod.name);ASSET.remove(cutter);bpy.data.objects.remove(cutter,do_unlink=True)
 # Cylinders built along optic Z then rotated locally to face +Y.
 v=[];f=[];N=96
 for yy,rr in [(R+.0003,.00285),(R+.0005,.00315),(R+.0033,.00315),(R+.0035,.00285)]:
  for i in range(N):
   a=2*math.pi*i/N;rad=rr*(1.035 if i%2==0 else .965);v.append((yy,rad*math.cos(a),eye-.022+rad*math.sin(a)))
 v.extend([(R+.0003,0,eye-.022),(R+.0035,0,eye-.022)])
 for j in range(3):
  for i in range(N):f.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
 for i in range(N):f.append((4*N,(i+1)%N,i));f.append((4*N+1,3*N+i,3*N+(i+1)%N))
 mesh(PREFIX+'_machined_knurled_side_knob',v,f,STEEL,slot,False)
else:
 gp=part('grating','透射光栅（刻线放大示意）',pivot=(0,0,.004),explode=(0,.024,0),internal=True,illustrative=True,opticalSimulation=False)
 box(PREFIX+'_transmission_grating_plate',(0,0,.004),(.0134,.0134,.0005),GRATING,gp,.00008)
 # 48 engraved-looking ruled strips are intentionally enlarged to remain legible as a structural cue.
 for i in range(48):box(PREFIX+'_enlarged_parallel_ruling_%02d'%i,(-.0061+i*.00026,0,.00427),(.000035,.012,.000025),GROOVE,gp,0)
 gf=part('gratingFrame','光栅固定框（夹持示意）',pivot=(0,0,.004),explode=(0,-.022,0),internal=True,illustrative=True)
 for x in [-.0071,.0071]:box(PREFIX+'_grating_frame_side',(x,0,.004),(.0006,.0148,.0011),DARK,gf)
 for y in [-.0071,.0071]:box(PREFIX+'_grating_frame_end',(0,y,.004),(.0148,.0006,.0011),DARK,gf)
 eyepiece=part('eyepiece','固定观察端与目口',pivot=(0,0,eye-.004),explode=(0,0,.027),motionEvidence='Fixed focus confirmed by GIA; no focus tube, knob or active control.')
 lathe(PREFIX+'_tapered_fixed_eyepiece',[(R-.0002,eye-.010),(R,eye-.0093),(R,eye-.0077),(R-.0003,eye-.0074),(R-.0003,eye-.0068),(R-.001,eye-.004),(R-.0047,eye-.0006),(R-.0052,eye),(R-.0063,eye),(R-.0067,eye-.0006),(R-.0067,eye-.007),(R-.0062,eye-.010)],EDGE,eyepiece)
 ring(PREFIX+'_entry_satin_band',entry+.0005,entry+.008,R+.00010,R-.0010,EDGE,slit,.0003)
# Internal baffles are visual teaching apparatus, not a claim about actual hidden hardware.
baff=part('baffles','镜筒内消光环（示意）',pivot=(0,0,.023 if PRISM else .020),explode=(.023,0,0),internal=True,illustrative=True)
for z in ([.023,.035] if PRISM else [.021,.028]):ring(PREFIX+'_internal_baffle',z,z+.0010,R-.00165,R*.56,DARK,baff,.00012)

# Merge ruled strips into one draw call without changing separate grating/frame parts.
if not PRISM:
 strips=[o for o in ASSET if o.name.startswith(PREFIX+'_enlarged_parallel_ruling_')]
 bpy.ops.object.select_all(action='DESELECT')
 for o in strips:o.select_set(True)
 bpy.context.view_layer.objects.active=strips[0]
 for o in strips[1:]:ASSET.remove(o)
 bpy.ops.object.join();strips[0].name=PREFIX+'_enlarged_parallel_rulings'

# Convert pivots/group positions without altering world geometry. Groups enable future UI picking/explode.
bpy.context.view_layer.update()
for o in ASSET:
 if o.type=='MESH' and o.parent:
  # Meshes were authored in global coordinates. Account for parent's requested pivot.
  o.matrix_parent_inverse=o.parent.matrix_world.inverted()
if PRISM:
 bpy.context.view_layer.update();world=eyepiece.matrix_world.copy();eyepiece.parent=focus;eyepiece.matrix_world=world
 bpy.context.view_layer.update();before=eyepiece.matrix_world.translation.copy();focus.location+=cv((0,0,.005));bpy.context.view_layer.update();delta=eyepiece.matrix_world.translation-before;focus.location-=cv((0,0,.005));bpy.context.view_layer.update()
 (REPAIR/'analysis/focus-hierarchy.json').write_text(json.dumps({'eyepieceParent':focus.name,'testTranslationMeters':.005,'eyepieceTranslationBlender':list(delta),'pass':(delta-cv((0,0,.005))).length<1e-7},indent=2))
for ob in ASSET:
 if ob.type=='MESH':
  mod=ob.modifiers.new('Explicit triangles for portable normal tangents','TRIANGULATE');mod.keep_custom_normals=True;bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=mod.name)
# Restore exact cylinder normals after side-slot Boolean triangulation.  The Boolean
# changes topology, but must not produce long shading creases on manufactured tube walls.
normals=[tuple(n.vector) for n in barrelMesh.data.corner_normals]
for poly in barrelMesh.data.polygons:
 radii=[math.hypot(barrelMesh.data.vertices[i].co.x,barrelMesh.data.vertices[i].co.z) for i in poly.vertices]
 for radius,sign in [(R,1),(R-.00135,-1)]:
  if all(abs(r-radius)<.000012 for r in radii):
   for li in poly.loop_indices:
    v=barrelMesh.data.vertices[barrelMesh.data.loops[li].vertex_index].co;normal=Vector((v.x,0,v.z)).normalized()*sign;normals[li]=tuple(normal)
barrelMesh.data.normals_split_custom_set(normals)
# Export only assembly: staging, cameras, lights and reference images never enter GLB.
bpy.ops.object.select_all(action='DESELECT')
for o in ASSET:o.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.export_scene.gltf(filepath=str(OUT/'model.glb'),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_apply=True,export_tangents=True,export_image_format='AUTO',export_materials='EXPORT',export_cameras=False,export_lights=False)
sha=hashlib.sha256((OUT/'model.glb').read_bytes()).hexdigest()
candidates=list(TRIAL.glob('candidate.glb'))+list(TRIAL.glob('*/candidate.glb'))
candidate=candidates[0] if candidates else None
manifest=dict(id=ID+'-structure-v1',version='structure-1',model='model.glb',sha256=sha,byteLength=(OUT/'model.glb').stat().st_size,units='meters',dimensionsCalibrated=False,teachingOpticsSimulated=False,internalOpticsIllustrative=True,opticalSimulation=False,opticalAxisLocal=[0,0,1],entryDirection='-Z',observationDirection='+Z',parts=PARTS,createdAt='2026-10-07',constructionNotes=['Exterior scale is illustrative, inferred from published photographs.','Hidden optics, supports and distances are teaching diagrams, not verified internal metrology.','No brand names/logos or source image pixels are embedded.','Explode offsets are explanatory separation, not mechanical freedoms.'],boundsNominalMeters={'length':L,'diameter':R*2})
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
provenance=dict(instrument=ID,createdAt='2026-10-07',dimensionsCalibrated=False,referenceManifest='assets-source/'+ID+'/references/sources.json',references=json.loads((SOURCE/'references/sources.json').read_text())['sources'],originalCandidate={'path':str(candidate.relative_to(ROOT)) if candidate else None,'sha256':hashlib.sha256(candidate.read_bytes()).hexdigest() if candidate else None,'preservedUnmodified':bool(candidate)},reconstruction={'script':'tools/3d-assets/blender/build_spectroscopes.py','blenderVersion':bpy.app.version_string,'method':'Reference constrained parametric reconstruction of manufactured surfaces. Raw Tripo candidate retained as comparison; geometric retention assessed separately.','geometrySource':'Original parametric mesh authored in Blender; not a textured reproduction of source photographs.','retainedCandidateGeometry':[]},tripo={'submittedBy':'parent task via Studio','credits':'See root generation ledger; this rebuild makes no paid call.'},licenseBoundary='Published reference photographs have no verified open licence. Originals and side-by-side comparisons remain only in ignored assets-source. Public assets contain independently authored geometry/materials with no logo. Manufacturer endorsement, measured dimensions and optical calibration are not claimed.',reviewRequired=['Proportions and side-control appearance' if PRISM else 'GIA-style tube proportions and fixed controls','Illustrative internal optics and supports','No physical specimen or optical calibration performed'])
# Public provenance keeps source identity and relative archive names, never host paths.
provenance['references']=[{k:v for k,v in item.items() if k!='original_path'} for item in provenance['references']]
metadata=TRIAL/'candidate-metadata.json'
if metadata.exists():provenance['tripo']=json.loads(metadata.read_text())
inspection=REPAIR/'analysis/candidate-inspection.json'
if inspection.exists():provenance['candidateInspection']=json.loads(inspection.read_text())
provenance['reconstruction']['retentionDecision']='No original candidate triangles retained: continuous lathed hardware is rebuilt to remove warped shells, false interior closures and generated lettering. Original candidate and its inspection are retained for comparison.'
(OUT/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2))
if PRISM:
 from mathutils.bvhtree import BVHTree
 hits=[]
 for ob in ASSET:
  if not ob.name.startswith(PREFIX+'_illustrative_prism_'):continue
  world=[ob.matrix_world@v.co for v in ob.data.vertices];tree=BVHTree.FromPolygons(world,[list(p.vertices) for p in ob.data.polygons]);origin=cv((0,0,entry-.01));direction=cv((0,0,1));coords=[];faces=[]
  for iteration in range(6):
   co,normal,index,distance=tree.ray_cast(origin,direction,.25)
   if co is None:break
   coords.append([co.x,co.z,-co.y]);faces.append(index);origin=co+direction*.000001
  clearance=min(math.hypot(v.x,v.z) for v in world)
  hits.append({'mesh':ob.name,'centerAxisHits':coords,'hitFaceIndices':faces,'crossesTwoFaces':len(coords)==2,'nearestVertexDistanceToAxisMeters':clearance,'vertexClearanceAbove1mm':clearance>.001})
 nominal=[(-.008,-.006),(.008,-.006),(.004,.006)];sectionHits=[]
 for i in range(3):
  a,b=nominal[i],nominal[(i+1)%3]
  if a[0]*b[0]<0:
   t=-a[0]/(b[0]-a[0]); sectionHits.append({'sectionEdge':[i,(i+1)%3],'fractionAlongFace':t,'zRelative':a[1]+t*(b[1]-a[1]),'distanceToFaceBoundaryMeters':min(.007,min(t,1-t)*math.dist(a,b))})
 (REPAIR/'analysis/prism-center-ray.json').write_text(json.dumps({'crossSectionXZRelative':[[-.008,-.006],[.008,-.006],[.004,.006]],'alternateSecondPrism':True,'apexRidgeDistanceToCenterAxisMeters':.004,'sectionEntryExit':sectionHits,'entryExitInsideFaces':len(sectionHits)==2 and all(h['distanceToFaceBoundaryMeters']>.001 for h in sectionHits),'construction':'Illustrative three-prism geometry; no Snell tracing or calibrated spectrum implied.','pass':all(h['crossesTwoFaces'] and h['vertexClearanceAbove1mm'] for h in hits) and len(hits)==3,'checks':hits},indent=2))
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
  containment.append(dict(name=o.name,maxRadialMeters=radius,innerBarrelRadius=R-.00135,insideBarrel=radius<=R-.00135+1e-7))
(REPAIR/'analysis/internal-containment.json').write_text(json.dumps({'allInsideBarrel':all(c['insideBarrel'] for c in containment),'checks':containment},indent=2))
(REPAIR/'analysis/mesh-closure.json').write_text(json.dumps({'allClosed':all(c['nonManifoldEdges']==0 for c in closure),'meshes':closure},indent=2))
# Reimport delivered GLB into a temporary scene and independently check names and world extents.
original=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(OUT/'model.glb')); imported=[o for o in bpy.data.objects if o not in original];names=[o.name.split('.')[0] for o in imported];reimport={'meshCount':sum(o.type=='MESH' for o in imported),'allPartsPresent':all(p['node'] in names for p in PARTS),'finiteTransforms':all(all(math.isfinite(v) for row in o.matrix_world for v in row) for o in imported)}
for o in imported:bpy.data.objects.remove(o,do_unlink=True)
(REPAIR/'analysis/reimport.json').write_text(json.dumps(reimport,indent=2))
# Studio rendering: no fixed-angle lighting is baked into model textures.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=args.samples;scene.cycles.use_denoising=True;scene.render.image_settings.file_format='PNG';scene.render.resolution_percentage=100;scene.render.film_transparent=False;scene.world.color=(.6,.6,.6)
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.80,.83,.86,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
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
 render('reference-angle',(.19,.08,-.05) if PRISM else (.08,.17,.10),L*1.4,(1200,1000),axis_angle=165 if PRISM else 90)
 # Annotatable separated structure: enclosure moves sideways, optics remain on the optical axis.
 saved={o:o.location.copy() for o in ASSET if o.type=='EMPTY'}
 for p in PARTS:
  o=bpy.data.objects.get(p['node']); o.location+=cv(p['explodeOffset'])
 render('exploded',(.17,.14,.20),L*1.65,(1600,1100),.65 if PRISM else 0)
 for o,loc in saved.items():o.location=loc
 render('closeup',(.042,.032,eye+.036),.047,(1100,900),.25,target=(0,0,eye-.008))
 hidden={o:o.hide_render for o in ASSET if o.type=='MESH'}
 for o in hidden:o.hide_render=o.parent!=eyepiece
 render('eyepiece-isolated',(.020,.023,eye+.035),.037,(1200,1100),.15,target=(0,0,eye-.004))
 for o,value in hidden.items():o.hide_render=value
# Keep only assembly selected for review; complete reusable lighting stays editable in master.
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body;bpy.ops.wm.save_as_mainfile(filepath=str(REPAIR/'master.blend'))
print(json.dumps({'instrument':ID,'glb':str(OUT/'model.glb'),'bytes':manifest['byteLength'],'parts':len(PARTS),'closure':all(c['nonManifoldEdges']==0 for c in closure),'reimport':reimport}))
