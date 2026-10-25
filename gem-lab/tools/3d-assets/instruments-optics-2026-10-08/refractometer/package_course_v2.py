"""Package v2 only after the build and independent GLB optics audits pass."""
from pathlib import Path
import json,hashlib,shutil
HERE=Path(__file__).resolve().parent;LAB=HERE.parents[3]
SOURCE=LAB/'assets-source/refractometer/course-v2';PUBLIC=LAB/'public/assets/3d/refractometer/paper-optics-v2';OLD=PUBLIC.parent/'paper-optics-v1'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
assert read(SOURCE/'audit.json')['ok'],'Build obstruction/mesh audit failed'
report=read(SOURCE/'validation/independent-refractometer.json');assert report['ok'] and report['modelSha256']==sha(SOURCE/'model.glb'),'Independent optics audit failed/stale'
PUBLIC.mkdir(parents=True,exist_ok=True);(PUBLIC/'validation').mkdir(exist_ok=True)
for name in ['model.glb','optical-cases.json']:shutil.copy2(SOURCE/name,PUBLIC/name)
for name in ['sources.json']:shutil.copy2(OLD/name,PUBLIC/name)
old=read(OLD/'optical-cases.json');new=read(PUBLIC/'optical-cases.json')
assert all(next(c for c in new['cases'] if c['id']==v['id'])==v for v in old['cases']),'Original v1 cases changed'
manifest=read(SOURCE/'manifest.json');manifest.pop('sourceCandidate',None);manifest.pop('appearanceReference',None)
manifest.update(id='refractometer-paper-optics-v2',version='paper-optics-v2',revision='paper-optics-v2',modelSha256=sha(PUBLIC/'model.glb'),modelBytes=(PUBLIC/'model.glb').stat().st_size,poster='poster.png',opticalCases='optical-cases.json',sources='sources.json',provenance='provenance.json',publicationStatus='local-course-candidate')
manifest['opticalPath']['geometryCheck']='validation/candidate-build-audit.json';write(PUBLIC/'manifest.json',manifest)
shutil.copy2(SOURCE/'audit.json',PUBLIC/'validation/candidate-build-audit.json');shutil.copy2(SOURCE/'validation/independent-refractometer.json',PUBLIC/'validation/independent-refractometer.json')
if (SOURCE/'poster.png').exists():shutil.copy2(SOURCE/'poster.png',PUBLIC/'poster.png')
provenance=dict(schemaVersion=1,instrumentId='refractometer',version='paper-optics-v2',date='2026-10-08',modelSha256=sha(PUBLIC/'model.glb'),modelBytes=(PUBLIC/'model.glb').stat().st_size,
 predecessor={'version':'paper-optics-v1','modelSha256':sha(OLD/'model.glb'),'preserved':True},editableMaster={'path':'assets-source/refractometer/course-v2/editable.blend','sha256':sha(SOURCE/'editable.blend'),'bundledInPublic':False},
 generator='tools/3d-assets/instruments-optics-2026-10-08/refractometer/build_course_v2.py',sampleSource='src/data/samples.ts spinel.characteristics.refractiveIndex; exported by write_course_sample.ts',
 changes=['测台开口直接露出棱镜：窄条3.6×10mm，长边沿钢台长边（前后方向T），2026-10-25按用户更正由横向X改来；不另加深色玻璃条。','钢台底面退让腔12.4mm：用户确认的教学设计，避免窄口直壁阻挡原斜向光线。','新建v2网格统一向外法线；钢面与棱镜面错开10μm，避免共面竞争，不改棱镜接触平面，低于40μm教学膜厚。','四个v1案例原样保留，增加同源尖晶石良好接触/空气间隙案例。'],
 preserved=['半圆柱半径6mm、长17mm、轴X、接触平面及法线不变','玻璃1.88、接触液1.78、波长589nm、理想中继透镜不变','原v1及其他仪器文件全部原样保留'],
 contactWindow=manifest['contactWindow'],appearanceReference={'file':'assets/instruments/refractometer.png','use':'Only strip proportions and orientation; no photo pixels embedded in model or poster'},deferred=[],
 assets={n:{'sha256':sha(PUBLIC/n),'bytes':(PUBLIC/n).stat().st_size} for n in ['model.glb','optical-cases.json','sources.json']},
 limitations=['退让腔不是厂家内部测绘；仪器尺寸与标尺未经实物校准。','理想均质体、平行接触层和薄透镜；2D视场按样品数据模拟，不是GLB的实测光学成像。','尖晶石1.718为固定课程参数，不推广为所有天然样品的实测值。','无付费云生成，无提交推送部署。'])
if (PUBLIC/'poster.png').exists():provenance['poster']={'sha256':sha(PUBLIC/'poster.png'),'masterSha256':sha(SOURCE/'editable.blend'),'method':'Cycles; identical geometry, hide optional teaching sample/film only'}
write(PUBLIC/'provenance.json',provenance)
print(json.dumps({'modelSha256':manifest['modelSha256'],'modelBytes':manifest['modelBytes'],'public':str(PUBLIC)},ensure_ascii=False))
