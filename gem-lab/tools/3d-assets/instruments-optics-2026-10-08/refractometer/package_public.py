"""Package the already-validated candidate without rebuilding or decimating it.

Only writes refractometer/paper-optics-v1 and its source publication-prep archive.
Run before rendering to stage the exact master, then again after render_poster.py.
"""
from pathlib import Path
import hashlib,json,shutil

HERE=Path(__file__).resolve().parent
LAB=HERE.parents[3]
ROOT=LAB/'assets-source/optics-paper-review/2026-10-08'
SOURCE=ROOT/'refractometer'
PREP=ROOT/'publication-prep/refractometer'
PUBLIC=LAB/'public/assets/3d/refractometer/paper-optics-v1'
EXPECTED='801a87705268e57f66603b476b29d00109e56cbce06f9e88ce1a59e493ea24d6'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path):return json.loads(path.read_text())
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')

assert sha(SOURCE/'model.glb')==EXPECTED,'Validated input GLB has changed; re-audit before packaging.'
PREP.mkdir(parents=True,exist_ok=True);PUBLIC.mkdir(parents=True,exist_ok=True)
(PUBLIC/'validation').mkdir(exist_ok=True)
for name in ['model.glb','optical-cases.json']:
    shutil.copy2(SOURCE/name,PUBLIC/name)
shutil.copy2(SOURCE/'editable.blend',PREP/'editable.blend')
manifest=read(SOURCE/'manifest.json')
old_source=manifest.pop('sourceCandidate',None)
old_appearance=manifest.pop('appearanceReference',None)
manifest.update(id='refractometer-paper-optics-v1',version='paper-optics-v1',revision='paper-optics-v1',
    model='model.glb',sha256=EXPECTED,byteLength=(PUBLIC/'model.glb').stat().st_size,
    modelSha256=EXPECTED,modelBytes=(PUBLIC/'model.glb').stat().st_size,
    poster='poster.png',opticalCases='optical-cases.json',sources='sources.json',provenance='provenance.json',
    publicationStatus='local-public-asset-prepared-not-app-integrated')
manifest['opticalPath']['geometryCheck']='validation/candidate-build-audit.json'
write(PUBLIC/'manifest.json',manifest)
sources=read(SOURCE/'sources.json')
for source in sources['sources']:
    if 'localFile' in source:
        source.pop('localFile')
        source['documentBundled']=False
        source['accessNote']='原文和目标页已在本机核查；公开资产目录只提供原出版方URL与文档哈希，不分发论文PDF或页图。'
sources['license']='来源URL与阅读记录随资产提供。论文PDF/页图不在public内；GLB和海报不含论文或厂商品牌像素。'
write(PUBLIC/'sources.json',sources)
for old,new in [('audit.json','candidate-build-audit.json'),('export-surface-audit.json','candidate-export-surface-audit.json')]:
    data=read(SOURCE/old)
    data['reportScope']='历史候选导出验证随包附带；新public路径的独立重跑报告另行保存，不混作本次重新运行。'
    write(PUBLIC/'validation'/new,data)
if (PREP/'poster.png').exists():shutil.copy2(PREP/'poster.png',PUBLIC/'poster.png')
base=LAB/'public/assets/3d/refractometer/structure-v1/model.glb'
provenance=dict(schemaVersion=1,instrumentId='refractometer',version='paper-optics-v1',date='2026-10-08',
    modelSha256=EXPECTED,modelBytes=(PUBLIC/'model.glb').stat().st_size,
    predecessor=dict(version='structure-3',directoryLabel='structure-v1',modelSha256=sha(base),modelBytes=base.stat().st_size),
    validatedCandidate=dict(revision='paper-optics-v1-candidate',modelSha256=EXPECTED,modelBytes=(SOURCE/'model.glb').stat().st_size,sourceManifestSha256=sha(SOURCE/'manifest.json')),
    editableMaster=dict(sha256=sha(PREP/'editable.blend'),bundledInPublic=False,description='完整可编辑母版保留在制作归档；海报由同一母版渲染。'),
    sourceReferences='sources.json',caseData='optical-cases.json',
    assets={name:dict(sha256=sha(PUBLIC/name),bytes=(PUBLIC/name).stat().st_size) for name in ['model.glb','optical-cases.json','sources.json']},
    changes=['以固定样品取代不同RI临界线叠放；部分反射/透射/临界/全反射来自同一状态。','增加空气间隙及超接触液量程案例。','刻线按教学角度映射；透镜明确是理想薄透镜中继。','半圆柱维持原半径与接触平面，2048分段支撑导出网格法线检查。','公开版本标签、模型哈希及独立自包含案例清单统一。'],
    preserved=['10组既有外形和机构几何','旧structure-v1目录原样保留','本次模型字节与已独立审核候选完全一致'],
    meshChoice=dict(selectedSegments=2048,selectedBytes=3049000,reason='原64分段实际网格法线误差明显；2048段已有374项独立检查依据。保持同一网页与校验网格，避免只验证高精度隐藏网格却交付低精度模型。未为减少约3.05MB文件而改变已审核几何。'),
    deferred=['测台接触窗口应收成窄条；本轮按用户明确边界不修改，待确认后单独处理。'],
    limitations=['理想各向同性单色例子，不是实测样品或厂家内部处方。','薄透镜不等同真实厚透镜面形/像差验证；不承诺全量程精度。','未接入应用、未提交推送部署、未调用付费生成。'])
if (PUBLIC/'poster.png').exists():
    provenance['poster']=dict(file='poster.png',sha256=sha(PUBLIC/'poster.png'),bytes=(PUBLIC/'poster.png').stat().st_size,masterSha256=sha(PREP/'editable.blend'),method='Blender Cycles from identical candidate editable master; studio camera, lights and floor only.')
write(PUBLIC/'provenance.json',provenance)
write(PREP/'packaging-record.json',dict(modelSha256=EXPECTED,modelBytes=3049000,sourceMasterSha256=sha(SOURCE/'editable.blend'),stagedMasterSha256=sha(PREP/'editable.blend'),caseSha256=sha(PUBLIC/'optical-cases.json'),posterReady=(PUBLIC/'poster.png').exists(),publicVersion='paper-optics-v1'))
print(json.dumps({'publicDirectory':str(PUBLIC),'modelSha256':EXPECTED,'posterReady':(PUBLIC/'poster.png').exists()},ensure_ascii=False))
