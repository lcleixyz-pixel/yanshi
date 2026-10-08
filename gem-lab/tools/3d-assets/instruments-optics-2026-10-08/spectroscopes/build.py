"""Read existing public GLBs, write only independent optical-study candidates.
blender -b --python build.py -- --instrument prism-spectroscope
"""
import bpy,bmesh,json,math,hashlib,sys,argparse,shutil
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from optics import *
ROOT=next(p for p in Path(__file__).resolve().parents if p.name=='gem-lab' and (p/'public').is_dir())
HERE=Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--instrument',choices=['prism-spectroscope','grating-spectroscope'],required=True);args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ID=args.instrument;PRISM=ID=='prism-spectroscope';PREFIX='PrismSpectroscope' if PRISM else 'GratingSpectroscope'
BASE=ROOT/'public/assets/3d'/ID/'structure-v1';OUT=ROOT/'assets-source/optics-paper-review/2026-10-08'/ID
OUT.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0
def read(p):return json.loads(p.read_text())
def write(name,value):(OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def cv(p):return Vector((p[0],-p[2],p[1]))
def gv(p):return [float(p[0]),float(p[2]),float(-p[1])]
def clean():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def import_model(path):clean();bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update()
def mesh_signature(o):
 o.data.calc_loop_triangles();tris=[]
 for tri in o.data.loop_triangles:
  coords=sorted(tuple(round(v,8) for v in gv(o.matrix_world@o.data.vertices[i].co)) for i in tri.vertices)
  tris.append(coords)
 return hashlib.sha256(json.dumps(sorted(tris),separators=(',',':')).encode()).hexdigest()
def signatures(excluded):return {o.name:mesh_signature(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in excluded}
def tree(o):
 verts=[o.matrix_world@v.co for v in o.data.vertices]
 return BVHTree.FromPolygons(verts,[list(p.vertices) for p in o.data.polygons],all_triangles=False)
def refract(d,n,n0,n1):
 n=n.normalized()
 if n.dot(d)>0:n=-n
 eta=n0/n1;c=-n.dot(d);disc=1-eta*eta*(1-c*c)
 if disc<0:return None
 return (eta*d+(eta*c-math.sqrt(disc))*n).normalized()
def hit(t,o,d):
 p,n,idx,dist=t.ray_cast(o,d,1.)
 if p is None:raise RuntimeError('ray missed expected optical mesh')
 return p,n
original_sha=sha(BASE/'model.glb');manifest=read(BASE/'manifest.json')
import_model(BASE/'model.glb')
changed=[PREFIX+'_amici_'+str(i+1)+'_'+kind for i,kind in enumerate(['crown','flint','crown'])]+[PREFIX+'_amici_cement_interface_1',PREFIX+'_amici_cement_interface_2'] if PRISM else []
before_sig=signatures(changed)
# Capture exact baseline glass geometry refraction with its exported IOR values.
def prism_trace(wavelength,origin,objects,ior_override=None):
 d=cv((0,0,1));o=cv(origin);points=[list(origin)];events=[]
 n1,n2=(ior_override or [index('N-BK7',wavelength),index('N-F2',wavelength)])
 sequence=[(objects[0],1,n1),(objects[0],n1,n2),(objects[1],n2,n1),(objects[2],n1,1)]
 for obj,ni,no in sequence:
  at,normal=hit(tree(obj),o,d);new=refract(d,normal,ni,no)
  if new is None:raise RuntimeError('total internal reflection')
  points.append(gv(at));events.append({'node':obj.name,'point':gv(at),'normal':gv(normal),'nIncident':ni,'nTransmitted':no,'incident':gv(d),'outgoing':gv(new)})
  o=at+new*1e-7;d=new
 return points,events,d
baseline=None
if PRISM:
 objs=[bpy.data.objects.get(name) for name in changed[:3]]
 pts,events,d=prism_trace(550,[0,0,-.023],objs,[1.52,1.62])
 baseline={'modelSha256':original_sha,'points':pts,'events':events,'exitDegrees':math.degrees(math.atan2(d.x,-d.y)),'limitation':'Old exported material IOR only; the old asset declared no wavelength prescription.'}
 parent=bpy.data.objects.get(PREFIX+'_prismTrain')
 original_materials=[objs[0].data.materials[0].copy(),objs[1].data.materials[0].copy()]
 for name in changed:
  obj=bpy.data.objects.get(name)
  if obj:bpy.data.objects.remove(obj,do_unlink=True)
 for i,(section,glass) in enumerate(zip(sections(),['N-BK7','N-F2','N-BK7'])):
  name=changed[i];verts=[cv((x,y,z)) for y in [-HALF_HEIGHT,HALF_HEIGHT] for x,z in section]
  faces=[(3,2,1,0),(4,5,6,7)]+[(j,(j+1)%4,(j+1)%4+4,j+4) for j in range(4)]
  me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free()
  ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);ob.parent=parent;ob.matrix_parent_inverse=parent.matrix_world.inverted();ob['glassType']=glass;ob['teachingPrescription']=True
  material=original_materials[0 if glass=='N-BK7' else 1];material.name=glass+' educational design at 550nm';material.node_tree.nodes.get('Principled BSDF').inputs['IOR'].default_value=index(glass,550);me.materials.append(material)
  for face in me.polygons:face.use_smooth=False
 # New interface contours stay only at the outside top/bottom faces and never span the light path.
 for j,(a,b) in enumerate(PLANES[1:3],1):
  # Readable cement-line edge guide, very thin, entirely on the +/-Y side faces.
  verts=[];faces=[];h=HALF_HEIGHT;half=HALF_WIDTH-.0002;width=.00004;depth=.00003
  for sign in [-1,1]:
   off=len(verts)
   for y in [sign*h,sign*(h+depth)]:
    verts.extend(cv((x,y,a+b*x+dz)) for x,dz in [(-half,-width),(half,-width),(half,width),(-half,width)])
   faces.extend(tuple(off+k for k in f) for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
  me=bpy.data.meshes.new(changed[2+j]);me.from_pydata(verts,[],faces);me.update();ob=bpy.data.objects.new(changed[2+j],me);bpy.context.collection.objects.link(ob);ob.parent=parent;ob.matrix_parent_inverse=parent.matrix_world.inverted();ob['opticalLayer']=False
  material=bpy.data.materials.new('External cement edge guide '+str(j));material.diffuse_color=(.14,.18,.2,1);me.materials.append(material)
 bpy.context.view_layer.update()
 assert before_sig==signatures(changed),'Unexpected original mesh modification before export'
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'editable.blend'))
 bpy.ops.export_scene.gltf(filepath=str(OUT/'model.glb'),export_format='GLB',export_extras=True,export_yup=True,export_apply=False,export_materials='EXPORT',export_cameras=False,export_lights=False)
else:
 # Exact byte copy: lack of manufacturer prescription does not justify moving components.
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'editable.blend'))
 shutil.copy2(BASE/'model.glb',OUT/'model.glb')

# Verify and calculate ONLY from the actual exported/reimported meshes.
import_model(OUT/'model.glb')
after_sig=signatures(changed);preserved={name:after_sig.get(name)==sig for name,sig in before_sig.items()}
assert all(preserved.values()),[k for k,v in preserved.items() if not v]
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
optic_names={PREFIX+'_eyepiece_glass',PREFIX+'_achromat_crown',PREFIX+'_achromat_flint',PREFIX+'_collimator_glass',PREFIX+'_replica_grating_substrate'}|set(changed)
opaque=[(o,tree(o)) for o in meshes if o.name not in optic_names and 'rulings' not in o.name]
eye=bpy.data.objects.get(PREFIX+'_eyepiece_glass');eye_tree=tree(eye)
def terminate(points,d):
 origin=cv(points[-1])+d*2e-7;candidates=[]
 at,normal,idx,dist=eye_tree.ray_cast(origin,d,.3)
 if at is not None:candidates.append((dist,eye.name,at,'reaches-eyepiece-front'))
 for obj,bvh in opaque:
  at,normal,idx,dist=bvh.ray_cast(origin,d,.3)
  if at is not None:candidates.append((dist,obj.name,at,'blocked'))
 if not candidates:return points+[[a+b*.035 for a,b in zip(points[-1],gv(d))]],{'status':'escapes-pupil','node':None}
 distance,name,at,status=min(candidates,key=lambda x:x[0]);return points+[gv(at)],{'status':status,'node':name,'point':gv(at),'distanceMeters':distance}
paths=[];checks=[]
if PRISM:
 baseline['pointsToTermination'],baseline['termination']=terminate(baseline['points'],cv(baseline['events'][-1]['outgoing']))
 objs=[bpy.data.objects.get(n) for n in changed[:3]]
 for w in WAVELENGTHS:
  pts,events,d=prism_trace(w,[0,0,-.023],objs);pts,end=terminate(pts,d)
  angle=math.degrees(math.atan2(d.x,-d.y));checks.append({'wavelengthNm':w,'exitDegrees':angle,'events':events,'termination':end,'analyticDeltaDegrees':angle-math.degrees(deviation(PHI,w))})
  paths.append({'id':'prism-'+str(w),'kind':'refracted','color':COLORS[w],'wavelengthNm':w,'points':pts,'termination':end,'events':events})
 bundle=[]
 for w in WAVELENGTHS:
  for x in [-.001,0,.001]:
   for y in [-.001,0,.001]:
    pts,events,d=prism_trace(w,[x,y,-.023],objs);pts,end=terminate(pts,d);bundle.append({'nm':w,'x':x,'y':y,'termination':end['status']})
 cases=[{'id':'white-light','label':'白光：棱镜内四次折射','description':'假定准直组件输出平行白光。N-BK7/N-F2/N-BK7 为本候选教学处方；550nm 近轴直视，其他波长分散。光路止于真实目镜前表面，未模拟未知目镜的成像。','parameters':{'wavelengthsNm':WAVELENGTHS,'collimatedInput':True,'designWavelengthNm':550},'paths':paths,'readout':{'summary':'550 nm 直视；蓝紫端角分散较大。非厂家实测处方。','exitAnglesDegrees':{str(c['wavelengthNm']):c['exitDegrees'] for c in checks}}}]
 for w in [400,550,700]:
  path=next(p for p in paths if p['wavelengthNm']==w);check=next(c for c in checks if c['wavelengthNm']==w)
  cases.append({'id':'wavelength-'+str(w),'label':str(w)+' nm 单色光','description':'从准直后的入射光开始，以导出网格面法线计算 Snell 折射；末端为目镜前表面。','parameters':{'wavelengthNm':w,'collimatedInput':True},'paths':[path],'readout':{'summary':str(w)+' nm 出射角 '+format(check['exitDegrees'],'.4f')+'°','exitAngleDegrees':check['exitDegrees']}})
 after={'reimportedMeshChecks':checks,'finiteInputBundle':bundle,'allBundleRaysReachEyepiece':all(c['termination']=='reaches-eyepiece-front' for c in bundle),'designDeviationDegrees':next(c['exitDegrees'] for c in checks if c['wavelengthNm']==550),'maxMeshVsAnalyticDegrees':max(abs(c['analyticDeltaDegrees']) for c in checks),'prescription':prescription()}
 assert after['allBundleRaysReachEyepiece'],after
 assert abs(after['designDeviationDegrees'])<.001
 write('prescription.json',prescription())
else:
 # Positive/negative X diffraction, perpendicular to the actual +Y grooves.
 # Treat the thin, plane-parallel plate as normal-incidence transmission: at normal
 # incidence the slab has no angular deviation; the order launches on its rear face.
 grating=bpy.data.objects.get(PREFIX+'_replica_grating_substrate');gtree=tree(grating)
 at,n=hit(gtree,cv((0,0,-.009)),cv((0,0,1)));rear,rn=hit(gtree,at+cv((0,0,1))*1e-7,cv((0,0,1)))
 launch=gv(rear);entry=gv(at);cases=[];allchecks=[]
 for density in [150,300,600]:
  paths=[];records=[]
  for order in [-1,0,1]:
   for w in (WAVELENGTHS if order else [550]):
    angle=grating_angle(w,density,order);d=cv((math.sin(angle),0,math.cos(angle)))
    pts,end=terminate([[0,0,-.009],entry,launch],d)
    record={'wavelengthNm':w,'order':order,'lineDensityPerMm':density,'angleDegrees':math.degrees(angle),'termination':end};records.append(record)
    paths.append({'id':f'g{density}-m{order}-w{w}','kind':'zero-order' if order==0 else 'diffracted','color':'#d8e1e8' if order==0 else COLORS[w],'wavelengthNm':w,'order':order,'points':pts,'termination':end})
  accepted=sum(r['termination']['status']=='reaches-eyepiece-front' for r in records);allchecks+=records
  cases.append({'id':'density-'+str(density),'label':str(density)+' 线/mm'+(' · 教学白光' if density==150 else ' · 孔径限制对比'),'description':'正入射透射光栅：零级不分光，±1 级向两侧分开；红光偏转大于紫光。线密度是教学参数，不是这台实物参数。刻线已放大，不能用图中条纹数倒推线密度；遇到真实网格遮挡即截断，未穿过目镜成像。','parameters':{'lineDensityPerMm':density,'orders':[-1,0,1],'wavelengthsNm':WAVELENGTHS,'normalIncidence':True,'groovesDirection':[0,1,0]},'paths':paths,'readout':{'summary':f'{accepted}/{len(records)} 条代表光线到达目镜前；其余按实际遮挡截断。','reachesEyepiece':accepted,'total':len(records),'rays':records}})
 for order in [-1,0,1]:
  subset=[p for p in cases[0]['paths'] if p['order']==order]
  cases.append({'id':'order-'+str(order),'label':('零级：保持白光' if order==0 else ('+1 级光谱' if order==1 else '−1 级光谱')),'description':'150 线/mm 的教学参数；两侧一级光谱来自同一透射光栅，零级无色散。光路在目镜前结束。','parameters':{'lineDensityPerMm':150,'order':order},'paths':subset,'readout':{'summary':'零级沿轴向、各波长重合。' if order==0 else '一级按波长分开，红光偏角大于紫光。'}})
 after={'reimportedMeshChecks':allchecks,'gratingFrontPoint':entry,'gratingRearPoint':launch,'firstOrder150Pass':all(r['termination']['status']=='reaches-eyepiece-front' for r in allchecks if r['lineDensityPerMm']==150),'geometryChanged':False,'grooveDirection':[0,1,0],'dispersionPlane':'XZ','formula':'sin(theta_m)=m*lambda_nm*1e-6*line_density_per_mm','signConvention':'theta measured from +Z toward +X; both incident and transmitted rays propagate +Z'}
 assert after['firstOrder150Pass'],after
 baseline={'modelSha256':original_sha,'geometryReusedExactly':True,'finding':'Existing model contains only an element order list and no diffraction orders or angle calculation. True density, angles and imaging prescription are unknown.'}

manifest['id']=ID+'-paper-optics-candidate';manifest['revision']='paper-optics-2026-10-08';manifest['version']='paper-optics-1';manifest['model']='model.glb';manifest['sha256']=sha(OUT/'model.glb');manifest['byteLength']=(OUT/'model.glb').stat().st_size
manifest['sourceModelSha256']=original_sha;manifest['teachingOpticsSimulated']=True;manifest['opticalSimulation']='dispersive element only';manifest['opticalCases']='optical-cases.json';manifest['sources']='sources.json'
manifest['constructionNotes'].append('The new evidence-backed optical calculation begins after idealized collimation and terminates on the actual eyepiece front. Lens aberrations, spectral resolution, efficiency and real stone absorption are not simulated.')
if PRISM:
 manifest['amiciAssembly'].update({'sequence':['N-BK7','N-F2','N-BK7'],'glassIORsAtDesignWavelength':[index(g,550) for g in ['N-BK7','N-F2','N-BK7']],'note':'Truncated double-Amici teaching prescription solved at 550nm from official glass dispersion; not a manufacturer prescription.'})
 for p in manifest['parts']:
  if p['id']=='prismTrain':p['label']='直视棱镜组：N-BK7 / N-F2 / N-BK7（教学处方）';p['glassSequence']=['N-BK7','N-F2','N-BK7'];p['opticalSimulation']='four-interface Snell with Sellmeier dispersion'
if PRISM: update_prism_metadata(manifest)
for case in cases:
 for path in case['paths']:
  if PRISM:
   path['interactions']=[{'pointIndex':i+1,'kind':'refraction','surfaceNode':e['node'],'n1':e['nIncident'],'n2':e['nTransmitted'],'wavelengthNm':path['wavelengthNm']} for i,e in enumerate(path['events'])]
  else:
   path['interactions']=[{'pointIndex':2,'kind':'diffraction','surfaceNode':PREFIX+'_replica_grating_substrate','wavelengthNm':path['wavelengthNm'],'order':path['order'],'grooveDensityPerMm':case['parameters']['lineDensityPerMm'],'groovesDirection':[0,1,0],'normal':[0,0,1]}]
  path['interactions'].append({'pointIndex':len(path['points'])-1,'kind':'termination','surfaceNode':path['termination'].get('node'),'status':path['termination']['status']})
write('manifest.json',manifest);write('optical-cases.json',{'schemaVersion':1,'instrumentId':ID,'defaultCaseId':cases[0]['id'],'cases':cases});shutil.copy2(HERE/'sources.json',OUT/'sources.json')
write('audit.json',{'instrumentId':ID,'createdAt':'2026-10-08','status':'candidate; independently reimported mesh checks completed; browser and external optical review pending','before':baseline,'after':after,'modelSha256':manifest['sha256'],'sourceSha256':{n:sha(HERE/n) for n in ['build.py','optics.py','sources.json']},'preservedOriginalMeshes':preserved,'unchangedMeshCount':len(preserved),'inputUnchanged':sha(BASE/'model.glb')==original_sha,'changes':('Only three prism meshes and two external cement-edge guides rebuilt. All remaining meshes and world geometry retained.' if PRISM else 'No GLB geometry/material change: original bytes copied. Added evidence-based transmission orders and aperture-clipped ray cases.'),'limits':['No verified manufacturer internal prescription or calibrated instrument dimensions.','Collimation is an explicit idealized input condition; the current collimator is not optically prescribed.','Rays stop at the actual front of the unprescribed eyepiece; no invented downstream imaging.','Displayed path colors identify wavelengths, not radiometrically calculated intensities.','No coating/absorption/efficiency, slit resolution or real gemstone spectrum simulation.','Illustrative glass and grating densities are study parameters, not identified instrument properties.']})
print('CANDIDATE',ID,manifest['sha256'],OUT)
