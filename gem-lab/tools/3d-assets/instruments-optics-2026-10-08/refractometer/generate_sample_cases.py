"""离线生成逐教学样品的光路案例（不需要 Blender）。

沿用 optics.py 同一套已验证的单色理想光学计算：与 public/assets/3d/refractometer/paper-optics-v2/
里已复核的六个案例同源（本脚本会把那六个逐字复算一遍做自检，去掉 verification 字段后必须完全一致）。

输入：assets-source/refractometer/sample-cases-v1/sample-inputs.json
      （由 write_sample_cases_input.ts 从 src/data/samples.ts 导出）
输出：public/assets/3d/refractometer/sample-cases-v1/sample-cases.json

不改动 paper-optics-v2 包。用法：
    npx tsx tools/3d-assets/instruments-optics-2026-10-08/refractometer/write_sample_cases_input.ts
    python3 -B tools/3d-assets/instruments-optics-2026-10-08/refractometer/generate_sample_cases.py
"""
from pathlib import Path
import json, sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from optics import make_cases  # noqa: E402

LAB = HERE.parents[3]
INPUT = LAB / 'assets-source/refractometer/sample-cases-v1/sample-inputs.json'
PUBLIC = LAB / 'public/assets/3d/refractometer/sample-cases-v1'
REFERENCE = LAB / 'public/assets/3d/refractometer/paper-optics-v2/optical-cases.json'
COURSE_RI = 1.718  # 与 domain/refractometerCourse.ts 的 COURSE_SAMPLE（尖晶石）一致
CONTACT_INDEX = 1.78
ROUND = 6  # 坐标与角度保留位数：0.001 mm 级，远细于教学比例


def strip(case):
    return {k: v for k, v in case.items() if k != 'verification'}


def rounded(value):
    if isinstance(value, float):
        return round(value, ROUND)
    if isinstance(value, list):
        return [rounded(v) for v in value]
    if isinstance(value, dict):
        return {k: rounded(v) for k, v in value.items()}
    return value


def self_check():
    """确认本机 optics.py 与已发布的六个案例逐字一致（去掉 verification）。"""
    published = json.loads(REFERENCE.read_text())['cases']
    regenerated = [strip(c) for c in make_cases(COURSE_RI)]
    if json.dumps(regenerated, sort_keys=True) != json.dumps(published, sort_keys=True):
        raise SystemExit('自检失败：optics.py 的复算结果与 paper-optics-v2 已发布案例不一致，停止生成。')
    print('自检通过：optics.py 复算的六个案例与已发布资产逐字一致。')


def wanted_ris(samples):
    """每个样品在三维里需要显示的折射率：单值取本身；区间取两端，点测再取两位小数中值。"""
    values = set()
    for sample in samples:
        ri = sample['refractiveIndex']
        if ri == 'over-1.78':
            continue  # 超接触液上限：沿用现有 over-liquid 案例
        if isinstance(ri, list):
            low, high = ri
            values.update([round(low, 3), round(high, 3)])
            midpoint = round((low + high) / 2, 2)
            if midpoint <= CONTACT_INDEX:
                values.add(round(midpoint, 3))
        elif ri <= CONTACT_INDEX:
            values.add(round(ri, 3))
    return sorted(v for v in values if v <= CONTACT_INDEX)


def build():
    payload = json.loads(INPUT.read_text())
    cases = []
    for ri in wanted_ris(payload['samples']):
        case = strip(make_cases(ri)[4])  # 第 5 个定义即「接触良好」案例
        case['id'] = f'sample-{ri:.3f}'
        case['label'] = f'教学样品 · nD {ri:.3f}（接触良好）'
        case['parameters'] = {**case['parameters'], 'sampleIndex': ri}
        case['readout'] = {**case['readout'], 'sampleRI': f'{ri:.3f}'}
        cases.append(rounded(case))
    reference = json.loads(REFERENCE.read_text())
    PUBLIC.mkdir(parents=True, exist_ok=True)
    out = {
        'schemaVersion': 1,
        'instrumentId': 'refractometer',
        'generator': 'tools/3d-assets/instruments-optics-2026-10-08/refractometer/generate_sample_cases.py',
        'source': 'optics.py make_cases(ri)，与 paper-optics-v2 同一套已复核计算',
        'sampleSource': 'src/data/samples.ts SAMPLES',
        'conditions': reference['conditions'],
        'scope': '逐教学样品的理想均质、单色、平行接触层代表光路；不代表厂商实测处方或天然样品实测值。',
        'cases': cases,
    }
    target = PUBLIC / 'sample-cases.json'
    target.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'已生成 {len(cases)} 个样品案例 → {target.relative_to(LAB)}（{target.stat().st_size // 1024} KB）')


if __name__ == '__main__':
    self_check()
    build()
