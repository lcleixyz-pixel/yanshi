"""Read-only Tripo candidate inspection and rendering. Original bytes never modified."""
import bpy, sys, argparse, json, hashlib, numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[3]
p=argparse.ArgumentParser();p.add_argument('--instrument',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);trial=ROOT/'assets-source'/a.instrument/'tripo-trials/2026-10-07';candidate=trial/'candidate.glb';out=trial/'repair-v1/analysis';out.mkdir(parents=True,exist_ok=True)
before=hashlib.sha256(candidate.read_bytes()).hexdigest();bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(candidate));objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];points=[]
for o in objects:points.extend(tuple(o.matrix_world@v.co) for v in o.data.vertices)
pts=np.asarray(points);center=pts.mean(0);vals,axes=np.linalg.eigh(np.cov((pts-center).T));axis=axes[:,2];side=axes[:,1];up=np.cross(side,axis);basis=np.vstack([side,axis,up]);normalized=(pts-center)@basis.T;size=np.ptp(normalized,axis=0);scale=1/size[1]
transform=Matrix.Identity(4)
for i in range(3):
 for j in range(3):transform[i][j]=basis[i,j]*scale
 transform[i][3]=-float(np.dot(basis[i],center))*scale
for o in list(bpy.context.scene.objects):
 if not o.parent:o.matrix_world=transform@o.matrix_world
report={'candidateSha256':before,'meshCount':len(objects),'vertices':len(points),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),'principalExtentsRaw':size.tolist(),'lengthDiameterRatio':float(size[1]/max(size[0],size[2])),'materialNames':[m.name for m in bpy.data.materials],'note':'PCA normalization only for this review render; input untouched. Candidate topology is not evidence of true hidden structure.'}
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True;scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.8,.83,.86,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45;scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
for name,loc,power,size in [('Key',(1,-1,2),100,2),('Rim',(-1,.5,1),70,1.5)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Candidate review');o=bpy.data.objects.new('Candidate review',d);scene.collection.objects.link(o);scene.camera=o;d.type='ORTHO';d.ortho_scale=1.35;o.location=(1,-.8,.65);o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/'raw-candidate.png');bpy.ops.render.render(write_still=True)
report['inputUnchanged']=before==hashlib.sha256(candidate.read_bytes()).hexdigest();(out/'candidate-inspection.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
