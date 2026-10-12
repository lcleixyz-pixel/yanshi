# 折射仪 paper-optics-v1 独立验证

验证日期：2026-10-08。验证输入是本目录上一级的新 public 文件；未修改旧 structure-v1 或主应用。

## 结果

| 验证层 | 结果 |
| --- | --- |
| 从实际 GLB 三角面独立验证光路 | 374 项通过，0 失败；覆盖全部 4 个展示案例 |
| 数学单元测试 test_optics.py | 4/4 通过，0 失败、0 错误 |
| 正式 Khronos glTF Validator | 0 错误、0 警告；包元数据检查 5/5 |

独立光学检查包括有限发光面、反射/折射点是否在实际网格表面、实际面法线下的反射和 Snell 定律、部分反射/临界/全反射分支、实际遮挡、接触条件、Fresnel 能量与有限视场。半圆柱保留 2048 段：实际三角面法线与连续圆面的角度偏差以 0.10° 为限，实测最大折射方向偏差约 0.03915°；平面角度容差为 0.003°，表面距离容差为 5 × 10⁻⁶ m。

详细报告：[独立光学](independent-refractometer.json)、[数学单元测试](test-optics.json)、[glTF 格式与包元数据](gltf-validator.json)。浏览器效果由共享 review 的独立 browser.json 与截图另行记录，不包含在上述数字验证结论中。

## 输入绑定

| 文件 | SHA-256 |
| --- | --- |
| model.glb（3,049,000 bytes） | `801a87705268e57f66603b476b29d00109e56cbce06f9e88ce1a59e493ea24d6` |
| optical-cases.json | `8c417684ccb4ea3f377702eff98e05f855652949173ca417d3f0fa15e02e2ba8` |

光路或模型更改后，应重新运行验证并更新绑定；海报不在光学检查的输入范围内。

## 复现

在 `yanshi-instrument-assets` 仓库根目录执行。使用已有 Python 3 / NumPy、Node.js 与 `gem-lab/tools/3d-assets/node_modules` 中的官方 `gltf-validator` 2.0.0-dev.3.10；不需要更新工程依赖。

```sh
python3 gem-lab/tools/3d-assets/instruments-optics-2026-10-08/spectroscopes/independent_refractometer.py \
  --input-dir gem-lab/public/assets/3d/refractometer/paper-optics-v1 \
  --output-dir gem-lab/public/assets/3d/refractometer/paper-optics-v1/validation \
  --expected-sha 801a87705268e57f66603b476b29d00109e56cbce06f9e88ce1a59e493ea24d6

python3 gem-lab/tools/3d-assets/instruments-optics-2026-10-08/polariscope/run-optics-unit-tests.py \
  --input-dir gem-lab/public/assets/3d/refractometer/paper-optics-v1

node gem-lab/tools/3d-assets/instruments-optics-2026-10-08/polariscope/validate-public-asset.mjs \
  --input-dir gem-lab/public/assets/3d/refractometer/paper-optics-v1
```

入口均在失败时返回非零退出码。独立光学入口保留不传输入目录时检查旧源候选的兼容行为。

## 结论适用范围

独立验证器自行解析实际 GLB，以 NumPy 世界坐标三角面作有限面投影与交点检查，再独立计算向量 Snell、反射和 Fresnel 关系；未导入作者的 optics 模块或 Blender。

4 项数学单元测试使用作者函数和数学案例，不读取 public GLB，因此不能替代 374 项实际网格检查。报告保留两类证据各自的脚本和输入哈希。

中继透镜仍是理想薄透镜教学近似，独立验证只检查其有限可视边界，不声称厚透镜处方、像差或真实仪器倍率正确。Fresnel 分数包含玻璃/接触层/样品的非相干多次反射级数；绘出的线是代表路径，没有画出全部多次反射，也未计入整机镀膜和吸收。透明标尺是教学叠加层。实物样品及厂家内部几何未经校准，本结论不等于实物验收、用户验收或发布。

## 本轮浏览器与保护范围

2026-10-08，在本机 Chromium 审阅页直接加载本版本，1280 × 720 下完成 4 个光路案例、部件选择、聚焦、隔离/拆解暂停光路、准确复位及整机/内部视图切换；控制台 0 错误、0 警告。证据为 [browser.json](browser.json)、[内部光路截图](browser.jpg)、[整机截图](browser-whole.jpg)。未验证 Safari、持续帧率、真实光谱或实物读数。

[保护范围哈希报告](protected-files.json)：开工前登记的 115 个文件全部未变，保护范围无新增或删除文件；包括已有 structure-v1、整个显微镜 public 子树、src 与 tests。原先未提交的改动保留，不以 Git HEAD 冒充本轮基准。
