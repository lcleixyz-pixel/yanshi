# 折射仪 · paper-optics-v1

本目录是本机准备好的独立网页资产版本，尚未接入应用，也没有部署。

- `model.glb`：16 个部件，3,049,000 bytes，SHA-256 `801a87705268e57f66603b476b29d00109e56cbce06f9e88ce1a59e493ea24d6`。
- `manifest.json`：版本标签 `paper-optics-v1`，部件协议、模型哈希与字节数。
- `optical-cases.json`：固定各向同性样品 nD 1.600、1.700，以及空气间隙、超接触液上限四个案例。
- `provenance.json`、`sources.json`：模型来历、论文依据、哈希与适用边界；不依赖本机论文路径。
- `poster.png`：由该版可编辑母版渲染的海报。母版、摄影棚场景和论文原件保留在制作档案，不放入 public。

## 网格选择

保留经过独立检查的 2048 分段半圆柱及约 3.05 MB GLB。旧 64 分段的面法线曾导致明显 Snell 残差；降低细分可能改变已验证的光路。此次让浏览器实际使用的网格与校验网格保持一致，不另藏高精度校验模型来替代网页交付检查。

## 使用边界

589 nm、n玻璃=1.88、n接触液=1.78、n样品=1.60/1.70 都是教学条件，不是厂商或天然宝石实测参数。玻璃内临界角以接触平面法线为参考，不能当成液体—样品界面角。强度包含三层系统非相干多次反射等效和，图线只是代表主路径。

中继使用明确标注的理想薄透镜，未恢复厂家厚透镜处方或像差，不保证整个量程的实物成像。`validation/candidate-*.json` 是候选阶段附带的历史验证记录；发布目录的独立重跑结果另行保存，不能把历史报告当成本次新路径重跑。

## 新目录验证

2026-10-08，另一执行者直接读取本目录重新验证：

- [独立光路检查](validation/independent-refractometer.json)：374 项，0 失败，输入模型哈希与上文一致。
- [数学单测](validation/test-optics.json)：4 项通过；该层单测不替代导出网格核查。
- [glTF Validator](validation/gltf-validator.json)：0 错误。

[本轮浏览器记录](validation/browser.json)：4 个案例与 15 个可选部件通过，拆解、隔离、聚焦、复位及视图切换正常，控制台无错误。[保护报告](validation/protected-files.json)确认 115 个保护文件未变。该本机 Chromium 检查不等于真实 Safari、实物或用户验收。

## 待办

测台窗口应进一步收成窄条；本轮按用户要求不修改，待确认后单独处理。不修改 `structure-v1`、主应用代码、测试或现有显微镜资产。

## 重建与打包

仓库源码位于 `gem-lab/tools/3d-assets/instruments-optics-2026-10-08/refractometer/`。`package_public.py` 只复制已审核 GLB 并编写本目录元数据；`render_poster.py` 从同版母版制作海报，不重建几何。制作归档为 `gem-lab/assets-source/optics-paper-review/2026-10-08/publication-prep/refractometer/`。
