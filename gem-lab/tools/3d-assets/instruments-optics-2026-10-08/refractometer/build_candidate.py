"""Build isolated optics candidate; never writes public assets."""
from pathlib import Path
import bpy, sys, math, json, hashlib
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from optics import *
LAB=HERE.parents[3]
OUT=LAB/'assets-source/optics-paper-review/2026-10-08/refractometer'
INPUT=LAB/'public/assets/3d/refractometer/structure-v1'
OUT.mkdir(parents=True,exist_ok=True)
def write(name,value): (OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(INPUT/'model.glb'))
manifest=json.loads((INPUT/'manifest.json').read_text())
modified={'internal_scale','lens_group','optical_path','test_prism'}
def descendant(o, ancestor):
    while o:
        if o==ancestor:return True
        o=o.parent
    return False
def mesh_digest(objects):
    rows=[]
    for o in objects:
        if o.type!='MESH':continue
        o.data.calc_loop_triangles()
        for t in o.data.loop_triangles:
            rows.append(sorted([tuple(round(x,6) for x in (o.matrix_world@o.data.vertices[i].co)) for i in t.vertices]))
    return hashlib.sha256(json.dumps(sorted(rows),separators=(',',':')).encode()).hexdigest(),len(rows)
unchanged={}
before_points={}
for p in manifest['parts']:
    if p['id'] not in modified:
        parent=bpy.data.objects[p['node']];unchanged[p['id']]=mesh_digest([o for o in bpy.data.objects if descendant(o,parent)])
        before_points[p['id']]=[tuple(o.matrix_world@v.co) for o in bpy.data.objects if o.type=='MESH' and descendant(o,parent) for v in o.data.vertices]
for id in modified:
    p=next(p for p in manifest['parts'] if p['id']==id);o=bpy.data.objects[p['node']]
    for child in list(o.children_recursive):bpy.data.objects.remove(child,do_unlink=True)
def material(name,color,transmission=0,ior=1.5):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.09;p.inputs['Transmission Weight'].default_value=transmission;p.inputs['IOR'].default_value=ior;return m
glass=material('Ideal relay glass - no commercial prescription',(.63,.77,.86),.97,1.52)
reticle_mat=material('Teaching reticle',(.80,.90,.94),.95,1.5)
ink=material('Mathematical RI tick marks',(.025,.05,.07))
film_mat=material('Contact layer schematic - liquid or air by case',(.60,.72,.52),.98,1.78)
sample_mat=material('Isotropic example - visual material only',(.38,.60,.68),.92,1.60)
prism_mat=material('Refined high RI glass - n 1.88 teaching model',(.035,.068,.083),.83,1.88)
def mesh(name,vs,fs,mat,parent):
    me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);bpy.context.scene.collection.objects.link(o);o.data.materials.append(mat);w=o.matrix_world.copy();o.parent=parent;o.matrix_world=w;return o
def sphere_lens(parent):
    centre=Vector(G['surfaces']['lens_group']['center']);axis=Vector(G['outgoing']);u=Vector((1,0,0));v=axis.cross(u)
    R=2*(1.52-1)*FOCAL;rad=.010;edge=.00015;N=128;steps=16;vs=[]
    sag=lambda r:R-math.sqrt(R*R-r*r)
    # Convex surfaces accompany a paraxial ideal-lens calculation; geometry is not a ray-traced prescription.
    for side in [-1,1]:
        for j in range(steps+1):
            r=rad*j/steps;z=side*(edge/2+sag(rad)-sag(r))
            for i in range(N):
                t=2*math.pi*i/N;vs.append(tuple(centre+axis*z+u*(r*math.cos(t))+v*(r*math.sin(t))))
    fs=[];K=(steps+1)*N
    for side in [0,1]:
        for j in range(steps):
            for i in range(N):
                q=(i+1)%N; f=(side*K+j*N+i,side*K+j*N+q,side*K+(j+1)*N+q,side*K+(j+1)*N+i);fs.append(f if side else tuple(reversed(f)))
    for i in range(N):q=(i+1)%N;fs.append((steps*N+i,steps*N+q,K+steps*N+q,K+steps*N+i))
    return mesh('Ideal relay biconvex visual solid',vs,fs,glass,parent)
def box_mesh(name,centre,dims,axes,mat,parent):
    vs=[tuple(Vector(centre)+sum((Vector(a)*s*d/2 for a,s,d in zip(axes,sign,dims)),Vector())) for sign in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]]
    return mesh(name,vs,[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)],mat,parent)
# Refine the same analytical semicylinder so exported face normals support the ray audit.
prism_parent=bpy.data.objects['Refractometer_test_prism'];steps=2048;r=G['prism']['radius'];ell=G['prism']['length']
profile=[(r*math.cos(math.pi*i/steps),-r*math.sin(math.pi*i/steps)) for i in range(steps+1)]
vs=[tuple(Vector(C)+Vector((x,0,0))+Vector(G['stageAxes'][1])*y+Vector(N)*z) for x in [-ell/2,ell/2] for y,z in profile];nn=len(profile)
fs=[tuple(range(nn-1,-1,-1)),tuple(range(nn,2*nn))]+[(i,(i+1)%nn,(i+1)%nn+nn,i+nn) for i in range(nn)]
mesh('Refined semicylinder same radius and contact plane',vs,fs,prism_mat,prism_parent)
scale_parent=bpy.data.objects['Refractometer_internal_scale'];spec=G['surfaces']['internal_scale'];u=Vector((1,0,0));n=Vector(spec['normal']);v=n.cross(u)
box_mesh('Transparent reticle for calculated angles',spec['center'],(.012,.018,.00020),(u,v,n),reticle_mat,scale_parent)
tick_positions=[]
for k in range(141,178):
    ns=k/100;theta=math.asin(ns/NG);row=trace(theta,ns,1.78);pos=Vector(row['apertures']['internal_scale']['point']);offset=(pos-Vector(spec['center'])).dot(v)
    if abs(offset)>.0085:continue
    loc=pos+u*.0038-n*.00015
    box_mesh(f'RI tick {ns:.2f}',loc,(.0018 if k%5==0 else .001,.000065,.00006),(u,v,n),ink,scale_parent)
    tick_positions.append(dict(index=ns,position=gl(tuple(pos)),markCenter=gl(tuple(loc))))
sphere_lens(bpy.data.objects['Refractometer_lens_group'])
root=bpy.data.objects.get('Refractometer')
def new_part(id,label,centre,offset,note):
    o=bpy.data.objects.new('Refractometer_'+id,None);bpy.context.scene.collection.objects.link(o);o.parent=root
    manifest['parts'].append(dict(id=id,label=label,node=o.name,pivot=gl(centre),hotspot=gl(centre),rotationAxisLocal=[0,1,0],rotatable=False,explodeOffset=offset,evidenceNote=note,internalOpticsIllustrative=True))
    return o
axes=((1,0,0),T,N)
film=new_part('contact_layer','接触层（液体 / 空气间隙由案例指定）',add(C,mul(N,FILM/2)),[.020,.016,0],'40 μm 厚度是假设；光线按平行三层界面计算，不是实测油膜。')
box_mesh('Parallel contact layer',add(C,mul(N,FILM/2)),(.011,.011,FILM),axes,film_mat,film)
sample=new_part('isotropic_sample','固定各向同性示例样品',add(C,mul(N,FILM+.002)),[0,.028,0],'理想均质抛光块；nD 按所选案例指定，不代表任何天然宝石的校准值。')
box_mesh('Flat polished isotropic sample',add(C,mul(N,FILM+.002)),(.011,.011,.004),axes,sample_mat,sample)
for p in manifest['parts']:
    if p['id']=='internal_scale':p.update(label='按教学光路计算的非等距分划',evidenceNote='位置由 n玻璃·sinθ 与实际接触层和标尺平面映射计算；不是厂家标尺标定。',tickPositionsCalibrated=False,teachingTickMapping=tick_positions)
    if p['id']=='lens_group':p.update(label='理想中继透镜（薄透镜计算）',lensCount=1,imagingCalibrated=False,idealFocalLengthMeters=FOCAL,evidenceNote='指定窄角案例使用理想薄透镜；曲面仅视觉载体，未做厚透镜、像差、光谱或厂家处方复原。')
    if p['id']=='test_prism':p.update(curvedSurfaceSegments=2048,evidenceNote='保留原半径、轴和接触平面，将半圆曲面细化至2048分段，供导出网格法线核查；n=1.88仍为教学参数。')
    if p['id']=='optical_path':p.update(label='案例光路由审阅页计算显示',evidenceNote='静态多样品临界扇已移除；使用 optical-cases.json 同一案例的入射、反射和透射路径。')
manifest.update(id='refractometer-paper-optics-2026-10-08',revision='paper-optics-v1',opticalSimulation='ideal-isotropic-ray-model',internalOpticsIllustrative=True,teachingOpticsSimulated=True)
manifest['opticalBehavior']='固定各向同性、单色、平行接触膜与理想中继透镜教学；不表示厂家真实内部处方或实测宝石读数。'
manifest['opticalPath']['limitations']=['示例窄角束按三层折射、圆柱出射及理想薄透镜传播至目镜。','胶合/厚透镜处方、像差、相干薄膜、吸收与各向异性未模拟。','几何与曲面仅教学设计，不是厂家测绘。']
manifest['opticalPath']['fanValidatedThrough']='example paths through ideal relay to eyepiece'
manifest['opticalPath']['geometryCheck']='audit.json'
manifest['opticalPath']['scope']='Fixed case optics and independent reimported GLB mesh intersections.'
manifest['opticalPath']['mainRayPointsMeters']=[]
for k in ['criticalAngleRangeDegrees','mainAngleDegrees']:manifest['opticalPath'].pop(k,None)
cases=make_cases()
raw_traces={c['id']:c.pop('verification') for c in cases}
casefile=dict(schemaVersion=1,instrumentId='refractometer',defaultCaseId='isotropic-160',cases=cases)
casefile['conditions']=['589 nm 单色理想光','各向同性、非吸收、平行接触层','薄膜干涉不计；Fresnel 强度含非相干多次反射的等效和','每段图线为代表路径，未绘出所有微弱多次反射','临界透射切线仅方向极限，法向透射功率为零','视觉材质颜色不用于光学读数计算']
write('optical-cases.json',casefile)
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'editable.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'model.glb'),export_format='GLB',export_apply=True,export_extras=True,export_yup=True)
manifest.update(model='model.glb',sha256=sha(OUT/'model.glb'),byteLength=(OUT/'model.glb').stat().st_size)
write('manifest.json',manifest)
# Independent mesh pass: clear scene and read only exported triangles.
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(OUT/'model.glb'))
bpy.context.view_layer.update()
preserved={}
for id,expected in unchanged.items():
    parent=bpy.data.objects['Refractometer_'+id];actual=mesh_digest([o for o in bpy.data.objects if descendant(o,parent)])
    after=[tuple(o.matrix_world@v.co) for o in bpy.data.objects if o.type=='MESH' and descendant(o,parent) for v in o.data.vertices]
    def nearest_distance(a,b):
        tree=KDTree(len(b))
        for i,p in enumerate(b):tree.insert(p,i)
        tree.balance();return max(tree.find(p)[2] for p in a)
    deviation=max(nearest_distance(before_points[id],after),nearest_distance(after,before_points[id]))
    preserved[id]=dict(match=deviation<1e-7 and actual[1]==expected[1],quantizedHashExact=actual==expected,maximumVertexDeviationMeters=deviation,triangles=actual[1],sha256=actual[0])
trees={}
for o in bpy.data.objects:
    if o.type!='MESH':continue
    o.data.calc_loop_triangles();verts=[o.matrix_world@v.co for v in o.data.vertices];tris=[tuple(t.vertices) for t in o.data.loop_triangles]
    if tris:trees[o.name]=(o,BVHTree.FromPolygons(verts,tris,all_triangles=True))
def first_hit(start,end,names):
    a,b=Vector(start),Vector(end);d=b-a;hits=[]
    for name in names:
        if name not in trees:continue
        p,n,face,t=trees[name][1].ray_cast(a,d.normalized(),d.length)
        if p is not None:hits.append((t,name,p,n))
    return min(hits,key=lambda r:r[0]) if hits else None
mesh_checks=[];max_curve_error=0.
opaque_trees={}
for name,(o,tree) in trees.items():
    solid=[]
    for tri in o.data.loop_triangles:
        mat=o.data.materials[tri.material_index] if o.data.materials else None
        bsdf=mat.node_tree.nodes.get('Principled BSDF') if mat and mat.use_nodes else None
        transmission=bsdf.inputs['Transmission Weight'].default_value if bsdf else 0
        if transmission<.1:solid.append(tuple(tri.vertices))
    if solid:opaque_trees[name]=BVHTree.FromPolygons([o.matrix_world@v.co for v in o.data.vertices],solid,all_triangles=True)
opaque_hits=[]
prism_names=[name for name,(o,_) in trees.items() if descendant(o,bpy.data.objects['Refractometer_test_prism'])]
for cid,rows in raw_traces.items():
    for i,t in enumerate(rows):
        # Actual exported prism curved face is met at ray entry; facet error bounded.
        a,b=t['pre'][1],t['pre'][-1];h=first_hit(a,b,prism_names)
        err=length(sub(tuple(h[2]),t['pre'][2])) if h else None
        if err is not None:max_curve_error=max(max_curve_error,err)
        mesh_checks.append(dict(caseId=cid,ray=i,entryHit=bool(h),entryDistanceErrorMeters=err,pass_=h is not None and err<3e-6))
        # Validate each stated exit from glass intersects its actual exported curved surface.
        p=t['post'][-6];exitp=t['post'][-5] # exit, scale, lens, mirror, eye at end
        end=add(exitp,mul(unit(sub(exitp,p)),.001));h=first_hit(add(p,mul(unit(sub(exitp,p)),1e-7)),end,prism_names)
        err=length(sub(tuple(h[2]),exitp)) if h else None
        mesh_checks.append(dict(caseId=cid,ray=i,exitHit=bool(h),exitDistanceErrorMeters=err,pass_=h is not None and err<3e-6))
        for chain in [t['pre'],t['post']]:
            for seg,(aa,bb) in enumerate(zip(chain,chain[1:])):
                a,b=Vector(aa),Vector(bb);d=b-a
                if d.length<1e-5:continue
                a+=d.normalized()*4e-6
                for name,tree in opaque_trees.items():
                    hit=tree.ray_cast(a,d.normalized(),d.length-8e-6)
                    if hit[0] is not None:opaque_hits.append(dict(caseId=cid,ray=i,segment=seg,object=name,point=list(hit[0])))
for check in mesh_checks:check['pass']=check.pop('pass_')
aperture_ok=all(h['withinAperture'] for rows in raw_traces.values() for t in rows for h in t['apertures'].values())
checks=[dict(name='unmodified part triangle counts and world vertices preserved within 0.1 micrometre',pass_=all(v['match'] for v in preserved.values())),dict(name='all specified case routes meet finite optical apertures with ideal relay',pass_=aperture_ok),dict(name='exported prism ray entry and exit intersections',pass_=all(c['pass'] for c in mesh_checks)),dict(name='three physical branches and energy balance',pass_=all(abs(r['reflectedFraction']+r['transmittedFraction']-1)<1e-10 for c in cases for r in c['readout']['rows'])),dict(name='exported opaque triangle ray obstruction check',pass_=not opaque_hits)]
for ch in checks:ch['pass']=ch.pop('pass_')
write('audit.json',dict(schemaVersion=1,instrumentId='refractometer',modelSha256=manifest['sha256'],sourceModelSha256=sha(INPUT/'model.glb'),checks=checks,ok=all(c['pass'] for c in checks),preservedParts=preserved,meshIntersections=mesh_checks,opaqueObstructions=opaque_hits,maximumCurvedEntryErrorMeters=max_curve_error,idealApertures={k:[t['apertures'] for t in v] for k,v in raw_traces.items()},limitations=['实际导出半圆柱三角网格和不透光物体遮挡验证；透明组件的孔径仍按数学模型计算。','透镜为明确标注的理想薄透镜；表面造型不是独立光学处方验证。','未验收真实设备尺寸、标尺精度、样品视频或生产应用。']))
print('OUTPUT',OUT,'CHECKS',checks)
