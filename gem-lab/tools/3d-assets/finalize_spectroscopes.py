"""Validate finished round-3 spectroscopes and compose archival review images.
No cloud calls. Requires Blender export/render outputs; refuses previous-round assets.
"""
from pathlib import Path
import argparse, hashlib, json, shutil, subprocess, sys
ROOT=next(p for p in Path(__file__).resolve().parents if p.name=='gem-lab' and (p/'public').is_dir())
p=argparse.ArgumentParser();p.add_argument('--instrument',choices=['prism-spectroscope','grating-spectroscope'],required=True);args=p.parse_args()
ID=args.instrument;archive=ROOT/'assets-source'/ID/'tripo-trials/2026-10-07';repair=archive/'repair-v3';out=ROOT/'public/assets/3d'/ID/'structure-v1'
def read(path):return json.loads(path.read_text())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
manifest=read(out/'manifest.json');assert manifest.get('revision')=='repair-v3' and manifest.get('version')=='structure-3','Round-3 export has not run; refusing to certify old assets.'
subprocess.run([sys.executable,str(ROOT/'tools/3d-assets/spectroscope-review-sheets.py'),'--instrument',ID,'--round','3'],check=True)
result=subprocess.run(['node',str(ROOT/'tools/3d-assets/inspect-import.mjs'),str(out/'model.glb'),'--out',str(repair/'analysis/gltf-final')],check=True,capture_output=True,text=True)
inspection=json.loads(result.stdout);report_dir=Path(inspection['reportDir']);summary=read(report_dir/'summary.json')
closure=read(repair/'analysis/mesh-closure.json');containment=read(repair/'analysis/internal-containment.json');reimport=read(repair/'analysis/reimport.json');uv=read(repair/'analysis/normal-tangent-uv.json');rays=read(repair/'analysis/optical-center-ray.json');provenance=read(out/'provenance.json')
model=out/'model.glb';current_sha=sha(model);names=[n['name'] for n in summary['nodes']]
images=['hero','front','back','left','right','top','bottom','reference-angle','reference-comparison','six-views','candidate-comparison','exploded','closeup','eyepiece-isolated','shell-hidden-internals']
if ID.startswith('prism'):images+=['focus-extended','slit-open-entry','amici-interfaces']
old=read(archive/'repair-v1/analysis/verification.json');candidate=archive/'candidate.glb'
checks={
 'manifestHashAndBytes':manifest['sha256']==current_sha and manifest['byteLength']==model.stat().st_size,
 'under10MB':model.stat().st_size<=10_000_000,
 'validatorZeroErrors':summary['validation']['errors']==0,
 'allPartNodesUnique':all(names.count(p['node'])==1 for p in manifest['parts']),
 'noUnverifiedSideControl':not any('sideControl' in n or 'slot_cutter' in n for n in names),
 'allMeshShellsClosed':closure['allClosed'],
 'positiveMeshVolumes':all(m['volume']>0 for m in closure['meshes']),
 'internalPartsContained':containment['allInsideBarrel'],
 'reimportPartsPresent':reimport['allPartsPresent'],
 'reimportTransformsFinite':reimport['finiteTransforms'],
 'reimportLengthMatchesNominal':reimport['lengthMatchesNominal'],
 'candidateUnchanged':sha(candidate)==old['candidateSha256'],
 'metersAndUncalibrated':manifest['units']=='meters' and manifest['dimensionsCalibrated'] is False,
 'staticOpticsDeclaration':manifest['teachingOpticsSimulated'] is False and manifest['opticalSimulation'] is False,
 'allExplodeAlongAxis':all(p['explodeOffset'][:2]==[0,0] for p in manifest['parts']),
 'independentTransparentShell':manifest['transparentShellParts']==['barrel'] and next(p for p in manifest['parts'] if p['id']=='barrel')['transparentShell'] is True,
 'masterExists':(repair/'master.blend').exists(),
 'requiredImagesExist':all((repair/'renders'/(name+'.png')).exists() for name in images),
 'imagesAfterModel':all((repair/'renders'/(name+'.png')).stat().st_mtime>=model.stat().st_mtime for name in images),
 'masterAfterModel':(repair/'master.blend').stat().st_mtime>=model.stat().st_mtime,
 'posterMatchesHero':sha(out/'poster.png')==sha(repair/'renders/hero.png'),
 'uvNondegenerate':uv['pass'],
 'opticalCenterlineIntersectsElements':rays['pass'],
 'noPersonalHostPathsInPublicProvenance':'/Users/' not in json.dumps(provenance),
}
if ID.startswith('prism'):
 checks['centerRayCrossesThreeCementedPrisms']=read(repair/'analysis/prism-center-ray.json')['pass']
 checks['focusMovesEyepiece20mm']=read(repair/'analysis/focus-hierarchy.json')['pass']
 checks['slitHardStopsPreventCollision']=read(repair/'analysis/slit-linkage.json')['pass']
 checks['crownFlintCrown']=manifest['amiciAssembly']['sequence']==['crown','flint','crown'] and manifest['amiciAssembly']['count']==3
 amici=manifest['amiciAssembly'];interfaces=amici.get('interfaces',[]);appearance=amici.get('materialAppearance',{})
 checks['amiciGeometryMath']=read(repair/'analysis/amici-geometry-check.json')['ok']
 checks['twoVisibleCementInterfaceNodes']=len(interfaces)==2 and all(names.count(item['node'])==1 and item['edgeGuidesOnly'] for item in interfaces)
 checks['alternatingCementPlanes']=amici.get('alternatingSlopes') is True and len(interfaces)==2 and interfaces[0]['planeXZ']['zSlopePerX']*interfaces[1]['planeXZ']['zSlopePerX']<0
 checks['distinctFlintAppearance']=appearance.get('flint',{}).get('baseColor')!=appearance.get('crown',{}).get('baseColor') and appearance.get('flint',{}).get('ior',0)>appearance.get('crown',{}).get('ior',0)
else:
 checks['noMovableParts']=all(not p['rotatable'] and not p.get('translatable',False) for p in manifest['parts'])
 checks['replicaGratingDeclared']=manifest['replicaGrating']['description']=='复制光栅（树脂复制母版刻线）'
verification={'instrument':ID,'revision':'repair-v3','date':'2026-10-07','sha256':current_sha,'bytes':model.stat().st_size,'parts':len(manifest['parts']),'meshes':summary['counts']['meshes'],'triangles':summary['counts']['triangles'],'errors':summary['validation']['errors'],'warnings':summary['validation']['warnings'],'candidateSha256':sha(candidate),'checks':checks,'technicalPass':all(checks.values()),'formatReport':str(report_dir.relative_to(repair)),'actualBoundsMetersGLB':reimport['boundsSizeMetersGLB'],'verificationBoundaries':['Blender geometry/reimport/render and glTF format checks.','Browser checks are performed and archived by the root task, not asserted by this script.','No calibrated dimension, real optical simulation or user appearance acceptance.']}
(repair/'analysis/verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2)+'\n')
assert verification['technicalPass'],{k:v for k,v in checks.items() if not v}
sourceHashes={}
for relative in ['blender/build_spectroscopes.py','spectroscope_geometry.py','finalize_spectroscopes.py','spectroscope-review-sheets.py']:
 source=ROOT/'tools/3d-assets'/relative;destination=repair/'source'/relative
 destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,destination)
 sourceHashes[relative]=sha(destination)
provenance['reconstruction']['sourceSnapshot']='assets-source/'+ID+'/tripo-trials/2026-10-07/repair-v3/source/'
provenance['reconstruction']['sourceSnapshotSha256']=sourceHashes
provenance['verification']={'modelSha256':current_sha,'technicalPass':True,'gltfErrors':verification['errors'],'gltfWarnings':verification['warnings'],'report':'assets-source/'+ID+'/tripo-trials/2026-10-07/repair-v3/analysis/verification.json','browserValidation':'Pending round-3 browser review; prior-round records do not certify this export.','userAppearanceAccepted':False}
(out/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(verification,ensure_ascii=False,indent=2))
