"""Independent exported-triangle mirror and planar-interface audit. No GLB writes."""
from pathlib import Path
import bpy,math,json
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE=Path(__file__).resolve().parent
OUT=HERE.parents[3]/'assets-source/optics-paper-review/2026-10-08/refractometer'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(OUT/'model.glb'))
bpy.context.view_layer.update()
data=json.loads((OUT/'optical-cases.json').read_text());trees={}
def native(p):return Vector((p[0],-p[2],p[1]))
def below(o,p):
    while o:
        if o==p:return True
        o=o.parent
    return False
for part in ['Refractometer_first_mirror','Refractometer_second_mirror','Refractometer_isotropic_sample','Refractometer_test_prism']:
    parent=bpy.data.objects[part];vertices=[];triangles=[]
    for o in bpy.data.objects:
        if o.type!='MESH' or not below(o,parent):continue
        o.data.calc_loop_triangles();start=len(vertices);vertices.extend(o.matrix_world@v.co for v in o.data.vertices)
        triangles.extend(tuple(start+i for i in t.vertices) for t in o.data.loop_triangles)
    trees[part]=BVHTree.FromPolygons(vertices,triangles,all_triangles=True)
results=[]
for case in data['cases']:
    for path in case['paths']:
        pts=list(map(native,path['points']))
        for e in path.get('interactions',[]):
            idx=e['pointIndex']
            if idx==0 or idx==len(pts)-1 or e['kind']=='ideal-thin-lens':continue
            node=e['surfaceNode'];a,p,b=pts[idx-1:idx+2];d=(p-a).normalized();out=(b-p).normalized()
            if node not in trees:continue
            hit,normal,_,distance=trees[node].ray_cast(a+d*1e-7,d,(p-a).length+.0001)
            error=(hit-p).length if hit is not None else None
            # At exit from a closed solid, the nearest intersection can be the opposite start boundary.
            if error is not None and error>.0001 and e['kind']=='refraction':
                start=p-d*.00005;hit,normal,_,distance=trees[node].ray_cast(start,d,.0001);error=(hit-p).length if hit is not None else None
            if hit is None:
                results.append(dict(caseId=case['id'],path=path['id'],kind=e['kind'],surface=node,pass_=False,reason='no actual surface hit'));continue
            if e['kind'] in ['reflection','partial-reflection','critical','total-internal-reflection']:
                predicted=d-2*d.dot(normal)*normal;angle=math.degrees(math.acos(max(-1,min(1,predicted.dot(out)))))
                results.append(dict(caseId=case['id'],path=path['id'],kind=e['kind'],surface=node,positionErrorMeters=error,reflectionAngleErrorDegrees=angle,pass_=error<3e-6 and angle<.05))
            elif e['kind']=='refraction':
                ni,no=e['n1'],e['n2'];si=d.cross(normal).length;so=out.cross(normal).length;res=abs(ni*si-no*so)
                # The refined half-circle has 2048 facets; allow only its measured discretization scale.
                tol=.0015
                results.append(dict(caseId=case['id'],path=path['id'],kind=e['kind'],surface=node,positionErrorMeters=error,snellResidual=res,tolerance=tol,pass_=error<3e-6 and res<tol))
for row in results:row['pass']=row.pop('pass_')
report=dict(schemaVersion=1,instrumentId='refractometer',ok=all(r['pass'] for r in results),checks=results,limitations=['2048面半圆曲面的离散法线残差单列，不是精密面形或标尺校准。','薄透镜显式跳过曲面Snell验证；无厂家光学处方，不用薄透镜数值冒充真实厚透镜。'])
(OUT/'export-surface-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('EXPORTED SURFACE AUDIT',report['ok'],'ROWS',len(results),'FAILED',[r for r in results if not r['pass']])
