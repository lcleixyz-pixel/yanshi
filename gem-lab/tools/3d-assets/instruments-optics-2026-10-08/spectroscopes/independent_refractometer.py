"""Independent audit: parse glTF binary triangles, no author model/optics imports.
python3 independent_refractometer.py --expected-sha <final model SHA> [--input-dir DIR] [--output-dir DIR]
"""
import argparse,json,math,struct,hashlib
from pathlib import Path
import numpy as np
ROOT=next(p for p in Path(__file__).resolve().parents if p.name=='gem-lab' and (p/'public').is_dir())
OUT=ROOT/'assets-source/optics-paper-review/2026-10-08/refractometer'

def unit(v):
 a=np.asarray(v,dtype=float);return a/np.linalg.norm(a)
def angle(a,b):return math.degrees(math.acos(float(np.clip(unit(a).dot(unit(b)),-1,1))))

def matrix(n):
 if 'matrix'in n:return np.array(n['matrix'],float).reshape((4,4),order='F')
 x,y,z,w=n.get('rotation',[0,0,0,1]);m=np.eye(4)
 m[:3,:3]=np.array([[1-2*y*y-2*z*z,2*x*y-2*w*z,2*x*z+2*w*y],[2*x*y+2*w*z,1-2*x*x-2*z*z,2*y*z-2*w*x],[2*x*z-2*w*y,2*y*z+2*w*x,1-2*x*x-2*y*y]])@np.diag(n.get('scale',[1,1,1]))
 m[:3,3]=n.get('translation',[0,0,0]);return m

class GLB:
 def __init__(self,p):
  self.bytes=p.read_bytes();self.sha=hashlib.sha256(self.bytes).hexdigest();ln=struct.unpack_from('<I',self.bytes,12)[0];self.d=json.loads(self.bytes[20:20+ln]);self.bin=self.bytes[28+ln:];self.nodes=self.d['nodes'];self.parents={c:i for i,n in enumerate(self.nodes) for c in n.get('children',[])};self.world={};self.triangles={};self.opaque=[]
  def world(i):
   if i not in self.world:self.world[i]=(world(self.parents[i]) if i in self.parents else np.eye(4))@matrix(self.nodes[i])
   return self.world[i]
  for i,n in enumerate(self.nodes):
   if 'mesh'not in n:continue
   arrays=[]
   for prim in self.d['meshes'][n['mesh']]['primitives']:
    if prim.get('mode',4)!=4:raise ValueError('Only triangle primitives expected')
    v=self.access(prim['attributes']['POSITION']);v=np.c_[v,np.ones(len(v))]@world(i).T;idx=self.access(prim['indices']).reshape(-1,3).astype(int);tris=v[idx,:3];arrays.append(tris)
    mat=self.d.get('materials',[])[prim.get('material',0)];trans=mat.get('extensions',{}).get('KHR_materials_transmission',{}).get('transmissionFactor',0)
    if trans<.01 and not n.get('name','').startswith('RI tick '):self.opaque.append((n['name'],tris))
   self.triangles[i]=np.concatenate(arrays)
  self.name_to_id={n['name']:i for i,n in enumerate(self.nodes)};self.cache={}
 def access(self,i):
  a=self.d['accessors'][i];v=self.d['bufferViews'][a['bufferView']];count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];item=np.dtype(dtype).itemsize;stride=v.get('byteStride',item*count);off=v.get('byteOffset',0)+a.get('byteOffset',0)
  return np.ndarray((a['count'],count),dtype=dtype,buffer=self.bin,offset=off,strides=(stride,item)).copy()
 def surface(self,name):
  if name in self.cache:return self.cache[name]
  i=self.name_to_id[name]
  def descend(j):
   result=[self.triangles[j]] if j in self.triangles else []
   for c in self.nodes[j].get('children',[]):result+=descend(c)
   return result
  self.cache[name]=np.concatenate(descend(i));return self.cache[name]
 def nearest(self,name,point):
  t=self.surface(name);e1=t[:,1]-t[:,0];e2=t[:,2]-t[:,0];n=np.cross(e1,e2);norm=np.linalg.norm(n,axis=1);valid=norm>1e-18;n[valid]/=norm[valid,None]
  p=np.array(point)-t[:,0];signed=np.einsum('ij,ij->i',p,n);q=p-signed[:,None]*n
  aa=np.einsum('ij,ij->i',e1,e1);bb=np.einsum('ij,ij->i',e1,e2);cc=np.einsum('ij,ij->i',e2,e2);dd=np.einsum('ij,ij->i',q,e1);ee=np.einsum('ij,ij->i',q,e2);denom=aa*cc-bb*bb
  with np.errstate(divide='ignore',invalid='ignore'):u=(cc*dd-bb*ee)/denom;v=(aa*ee-bb*dd)/denom
  valid&=(u>=-1e-6)&(v>=-1e-6)&(u+v<=1+1e-6)
  distances=np.where(valid,np.abs(signed),np.inf);ix=np.argmin(distances)
  return {'distance':float(distances[ix]),'normal':n[ix],'projected':np.array(point)-signed[ix]*n[ix],'triangle':int(ix)}

def ray_segment(tris,a,b):
 # Vectorized Moller-Trumbore finite segment, independently implemented.
 a=np.array(a);direction=np.array(b)-a;length=np.linalg.norm(direction);direction/=length
 e1=tris[:,1]-tris[:,0];e2=tris[:,2]-tris[:,0];h=np.cross(np.broadcast_to(direction,e2.shape),e2);det=np.einsum('ij,ij->i',e1,h);mask=np.abs(det)>1e-16;inv=np.zeros_like(det);inv[mask]=1/det[mask];s=a-tris[:,0];u=inv*np.einsum('ij,ij->i',s,h);q=np.cross(s,e1);v=inv*(q@direction);dist=inv*np.einsum('ij,ij->i',e2,q)
 mask&=(u>=0)&(v>=0)&(u+v<=1)&(dist>5e-6)&(dist<length-5e-6)
 if not mask.any():return None
 k=np.argmin(np.where(mask,dist,np.inf));return float(dist[k]),(a+direction*dist[k]).tolist()

def evaluate(glb,cases,window=None):
 checks=[];details=[];failures=[]
 def check(name,value,metrics=None):
  row={'name':name,'pass':bool(value)}
  if metrics is not None:row['metrics']=metrics
  checks.append(row)
  if not value:failures.append(row)
 curve_tol_deg=.10;plane_tol_deg=.003;point_tol_m=5e-6
 if window:
  center=np.asarray(window['center']);axes=np.asarray(window['axes']);normal=unit(window['normal']);half=np.asarray(window['sizeMeters'])/2
  # Independently probe the actual exported steel triangles at the top opening.
  steel=glb.surface('Refractometer_metal_stage')
  # 2026-10-25: window is 3.6 (X) x 10 (T) mm; probe steel 3 mm along X, outside the strip.
  top=glb.nearest('Refractometer_metal_stage',center+axes[0]*.003)
  check('actual steel top faces outward for browser backface culling',top['normal'].dot(normal)>.9999,top['normal'].tolist())
  separation=(top['projected']-(center+axes[0]*.003)).dot(normal)
  check('steel and prism are not coplanar; offset below contact film',6e-6<separation<12e-6 and separation<cases['cases'][0]['parameters']['contactThicknessMeters'],float(separation))
  contact=glb.nearest('Refractometer_test_prism',center)
  check('actual prism contact plane faces outward',contact['normal'].dot(normal)>.9999,contact['normal'].tolist())
  for x,z,inside in [(0,0,True),(0,.004,True),(0,-.004,True),(.0012,0,True),(-.0012,0,True),(.0024,0,False),(-.0024,0,False),(0,.0058,False),(0,-.0058,False)]:
   point=center+axes[0]*x+axes[1]*z
   hit=ray_segment(steel,point+normal*.0003,point-normal*.00002)
   check(f'narrow top opening real steel probe {x},{z}',(hit is None)==inside,{'insideExpected':inside,'steelHit':hit})
 for case in cases['cases']:
  if window:
   for path in case['paths']:
    for event in path.get('interactions',[]):
     if event['surfaceNode'] not in ['Refractometer_test_prism','Refractometer_isotropic_sample']:continue
     point=np.asarray(path['points'][event['pointIndex']]);delta=point-center
     # Contact/film surfaces only; curved prism entry and exit are audited below.
     if abs(delta.dot(normal)) > .00005:continue
     local=axes@delta
     check(case['id']+'/'+path['id']+f'/contact{event["pointIndex"]} in narrow strip',bool(np.all(np.abs(local)<=half+1e-8)),{'offsetMeters':local.tolist(),'halfWindowMeters':half.tolist()})
  c=case['id'];paths={p['id']:p for p in case['paths']};par=case['parameters'];ng=par['glassIndex'];nc=par['contactIndex'];ns=par['sampleIndex'];rows=case['readout']['rows']
  critical_g=math.degrees(math.asin(min(1,ns/ng)));critical_c=math.degrees(math.asin(min(1,nc/ng)))
  check(c+' critical angles',abs(case['readout']['sampleCriticalAngleDegrees']-critical_g)<1e-7 and abs(case['readout']['contactCriticalAngleDegrees']-critical_c)<1e-7)
  check(c+' valid RI only with transmissible contact', (case['readout']['sampleRI'] is None)==(nc<=ns))
  for path in case['paths']:
   pts=np.array(path['points']);suffix=path['id'].rsplit('-',1)[-1]
   if path['id'].startswith('incident-'):
    source=glb.nearest('Refractometer_internal_light',pts[0]);check(c+'/'+path['id']+' starts on finite source surface',source['distance']<point_tol_m,source['distance'])
   for event in path.get('interactions',[]):
    ix=event['pointIndex'];kind=event['kind'];name=event['surfaceNode'];label=f'{c}/{path["id"]}/{ix}:{kind}'
    if kind=='ideal-thin-lens':
     # Only finite aperture is testable: the ray bends at an explicitly ideal
     # principal plane inside the solid, not a claim of thick-glass refraction.
     tri=glb.surface(name);lo=tri.min(axis=(0,1));hi=tri.max(axis=(0,1));inside=bool(np.all(pts[ix]>=lo-1e-6) and np.all(pts[ix]<=hi+1e-6));check(label+' within visual lens bounds',inside);continue
    nearest=glb.nearest(name,pts[ix]);n=nearest['normal'];check(label+' on finite actual surface',nearest['distance']<=point_tol_m,nearest['distance'])
    if ix:
     incoming=unit(pts[ix]-pts[ix-1])
    elif path['id'].startswith('reflected-'):
     ip=np.array(paths['incident-'+suffix]['points']);incoming=unit(ip[-1]-ip[-2]);check(label+' branch connected',np.linalg.norm(ip[-1]-pts[ix])<1e-10)
    else:raise ValueError('Unknown path branch')
    outgoing=unit(pts[ix+1]-pts[ix]);curved=name=='Refractometer_test_prism' and abs(n.dot(unit([0,.9890158633619168,.14780941112961063])))<.99999
    tolerance=curve_tol_deg if curved else plane_tol_deg
    if n.dot(incoming)>0:n=-n
    if kind=='refraction':
     eta=event['n1']/event['n2'];ci=-incoming.dot(n);discriminant=1-eta*eta*(1-ci*ci)
     if discriminant<0:check(label+' non-TIR required',False,discriminant);continue
     expected=eta*incoming+(eta*ci-math.sqrt(discriminant))*n;error=angle(expected,outgoing)
     residual=abs(event['n1']*np.linalg.norm(np.cross(incoming,n))-event['n2']*np.linalg.norm(np.cross(outgoing,n)))
     check(label+' Snell using actual face normal',error<=tolerance,{'errorDegrees':error,'toleranceDegrees':tolerance,'sinResidual':residual,'curvedFacet':curved});details.append({'case':c,'path':path['id'],'kind':kind,'errorDegrees':error,'distanceMeters':nearest['distance'],'curvedFacet':curved})
    elif kind in ['reflection','partial-reflection','critical','total-internal-reflection']:
     expected=incoming-2*incoming.dot(n)*n;error=angle(expected,outgoing);check(label+' actual-face reflection',error<=tolerance,error)
     if kind!='reflection':
      value=event['n1']/event['n2']*np.linalg.norm(np.cross(incoming,n));relation=abs(value-1)<=2e-5 if kind=='critical' else value>1 if kind=='total-internal-reflection' else value<1
      check(label+' physical branch condition',relation,{'sinTransmitted':value,'kind':kind})
    else:check(label+' recognized',False)
   # Finite obstruction check over actual opaque triangles. Mathematical tick
   # marks are reticle notation, not an opaque stop; list exclusion explicitly.
   for ix,(a,b) in enumerate(zip(pts,pts[1:])):
    if path['kind']=='grazing-boundary':continue
    blockers=[]
    for name,tris in glb.opaque:
     hit=ray_segment(tris,a,b)
     if hit:blockers.append({'node':name,'distanceMeters':hit[0],'point':hit[1]})
    check(f'{c}/{path["id"]}/segment{ix} opaque clearance',not blockers,blockers[:3] if blockers else None)
  # Independent contact reflection and transmission balance at each sample hit.
  for i,row in enumerate(rows):
   p=paths['reflected-'+str(i)];pts=np.array(p['points']);interaction=next((e for e in p['interactions'] if e['kind'] in ['partial-reflection','critical','total-internal-reflection']),None)
   ng_angle=math.degrees(math.acos(np.clip(abs(unit(np.array(paths['incident-'+str(i)]['points'])[-1]-np.array(paths['incident-'+str(i)]['points'])[-2]).dot(unit([0,.9890158633619168,.14780941112961063]))),0,1)))
   check(c+f'/ray{i} input angle equals readout',abs(ng_angle-row['angleDegrees'])<1e-6)
   check(c+f'/ray{i} energy fractions sum one',abs(row['reflectedFraction']+row['transmittedFraction']-1)<1e-10)
   if row['kind']=='contact-limit':check(c+f'/ray{i} air gap TIR',row['angleDegrees']>critical_c and row['reflectedFraction']==1);continue
   if not interaction:check(c+f'/ray{i} sample interaction exists',False);continue
   j=interaction['pointIndex'];normal=glb.nearest(interaction['surfaceNode'],pts[j])['normal'];inc=unit(pts[j]-pts[j-1]);ci=abs(inc.dot(normal));sine_t=(nc/ns)*math.sqrt(max(0,1-ci*ci))
   if sine_t>=1-1e-10:expected_R=1.
   else:
    # Two incoherent parallel interfaces: sum the geometric series separately
    # for s and p. Do not average first, since that changes the result.
    ct=math.sqrt(1-sine_t*sine_t);r23=[((nc*ci-ns*ct)/(nc*ci+ns*ct))**2,((nc*ct-ns*ci)/(nc*ct+ns*ci))**2]
    cg=math.cos(math.radians(ng_angle));r12=[((ng*cg-nc*ci)/(ng*cg+nc*ci))**2,((ng*ci-nc*cg)/(ng*ci+nc*cg))**2]
    expected_R=sum(a+(1-a)**2*b/(1-a*b) for a,b in zip(r12,r23))/2
   check(c+f'/ray{i} incoherent layer Fresnel sum',abs(expected_R-row['reflectedFraction'])<2e-5,{'expected':expected_R,'reported':row['reflectedFraction'],'normalization':'incident inside glass; incoherent glass/contact/sample layer'})
   transmitted=paths.get('transmitted-'+str(i))
   if transmitted:
    out=unit(np.array(transmitted['points'])[1]-np.array(transmitted['points'])[0]);continuity=np.linalg.norm(np.array(transmitted['points'])[0]-pts[j])<1e-10;res=abs(nc*np.linalg.norm(np.cross(inc,normal))-ns*np.linalg.norm(np.cross(out,normal)));check(c+f'/ray{i} transmitted branch Snell/continuity',continuity and res<2e-5,{'sinResidual':res,'connected':bool(continuity)})
 return {'ok':not failures,'checks':checks,'failures':failures,'refractionDetails':details,'tolerances':{'finiteSurfaceDistanceMeters':point_tol_m,'planarAngleDegrees':plane_tol_deg,'curvedFacetAngleDegrees':curve_tol_deg,'curveReason':'Triangulated circular surface approximates the continuous semicylinder; preserve measured residual rather than accept ideal normal as actual geometry.'},'limits':['Ideal relay checked for finite visual bounds only; no real thick-lens prescription or aberration claim.','Fresnel fractions combine the glass/contact/sample incoherent multiple-reflection series; drawn lines are representative routes, not all physical multiple-reflection paths. Whole-instrument coating/absorption remains excluded.','Reticle mathematical tick marks excluded from opaque obstruction list; transparent reticle is a teaching overlay.','Physical sample and manufacturer internal geometry remain uncalibrated.']}

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--expected-sha',required=True);p.add_argument('--input-dir',type=Path,default=OUT);p.add_argument('--output-dir',type=Path);args=p.parse_args();input_dir=args.input_dir.resolve();glb=GLB(input_dir/'model.glb');assert glb.sha==args.expected_sha,(glb.sha,args.expected_sha)
 cases=json.loads((input_dir/'optical-cases.json').read_text());manifest=json.loads((input_dir/'manifest.json').read_text());report=evaluate(glb,cases,manifest.get('contactWindow'));report.update({'schemaVersion':1,'instrumentId':'refractometer','inputDirectory':str(input_dir),'method':'independent direct GLB parse, numpy world triangles, finite face projection, vector Snell/reflection, Moller-Trumbore intersections; no author optics or Blender imports','modelSha256':glb.sha,'casesSha256':hashlib.sha256((input_dir/'optical-cases.json').read_bytes()).hexdigest(),'validatorSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'checkCount':len(report['checks']),'failureCount':len(report['failures'])})
 target=(args.output_dir.resolve() if args.output_dir else input_dir/'validation')/'independent-refractometer.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(report,ensure_ascii=False,indent=2,default=lambda o:o.item() if isinstance(o,np.generic) else o.tolist())+'\n');print(json.dumps({k:report[k] for k in ['ok','modelSha256','checkCount','failureCount']},indent=2));print(json.dumps(report['failures'][:10],ensure_ascii=False,indent=2,default=lambda o:o.item() if isinstance(o,np.generic) else o.tolist()));raise SystemExit(0 if report['ok'] else 1)
