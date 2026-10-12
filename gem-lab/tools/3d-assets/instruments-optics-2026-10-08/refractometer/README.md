# 折射仪论文核查候选

从现有 `public/assets/3d/refractometer/structure-v1/model.glb` 导入，输出到 `assets-source/optics-paper-review/2026-10-08/refractometer/`。不会覆盖主应用或原模型。

```sh
python3 -B gem-lab/tools/3d-assets/instruments-optics-2026-10-08/refractometer/test_optics.py
'/Users/lc.leixyz/Applications/Blender 5.2.app/Contents/MacOS/Blender' --background --factory-startup --python gem-lab/tools/3d-assets/instruments-optics-2026-10-08/refractometer/build_candidate.py
'/Users/lc.leixyz/Applications/Blender 5.2.app/Contents/MacOS/Blender' --background --factory-startup --python gem-lab/tools/3d-assets/instruments-optics-2026-10-08/refractometer/verify_export.py
```

本轮依据 GIA Hurlbut（1981）和 Gem-A Cartier（2000）的原论文，保留机身、测台、目镜、翻盖、偏光片和两个反射镜等 10 组原几何，细化相同半径和接触平面的半圆柱，修改内部标尺、镜组和静态光路，增加理想均质样品和接触层。

原版的临界角扇叠放了不同 RI 的边界，不是一个固定样品的入射束。本版的四个案例明确区分部分反射、临界切线、全反射，以及缺光学接触和超接触液量程。读数、图线和反射比例来自同一案例。刻线依据相同几何转换生成，仍不是厂家刻度或实物校准。

角度参考统一为**玻璃内部光线与接触平面法线的夹角**。兼容字段 `sampleCriticalAngleDegrees = asin(n样品 / n玻璃)`；n玻璃=1.88、n样品=1.60 时为 58.3276°，表示玻璃内对应的临界入射角，不是液体—样品界面的入射角。液体—样品的实际临界角应为 `asin(n样品 / n液体)`。`contactCriticalAngleDegrees = asin(n接触层 / n玻璃)` 则是玻璃—接触层界面的临界角。样品超过接触液折射率时，前一个玻璃角仅为理论映射，光线将先遇到玻璃—接触液的全反射限制，不能给出有效样品读数。

中继是明示焦距的理想薄透镜；凸透镜实体仅提供视觉形状。未假称已恢复实际镜片曲率、厚度、玻璃处方、像差或各向异性宝石行为。Fresnel 强度使用无吸收的非相干平行三层模型，未绘出所有多次反射；临界切线表示方向极限，法向透射功率为零。

`audit.json` 来自导出后重新导入 GLB：核对原几何世界坐标、曲面实际入射/出射交点、不透光三角面遮挡，并分别记录理想光学孔径检查。原半圆柱曲面为有限三角面近似；它不能替代精密光学表面校准。浏览器验收由公共审阅页另行记录。

`sources.json` 保存来源、页码、证据支持范围和教学假设；论文 PDF/页图仅留本地参考目录，不嵌入网页资产。

2026-10-08 本机验证：4 项数值单测、5 组导出检查通过；另有 66 项读取 GLB 三角面法线与交点的独立界面检查通过，最大 Snell 残差 0.000748、反射方向误差 0.0313°、表面交点误差 2.54e-8 m。复核程序不导入建模参数，仅使用导出案例和重新导入网格。薄透镜层仍单独标作理想假设并跳过厚透镜 Snell 验证。母版与网页模型不含论文页面像素。

审核中实际修复过两项问题：原光源路径从发光面板实体中心出发，现改为从朝向第一镜面的实际表面出发；原 64 分段半圆柱曲面法线残差过大，现细化为 2048 段，半径、轴和接触平面保持不变。

## 接入前打包

`package_public.py` 将已审核模型字节复制到 `public/assets/3d/refractometer/paper-optics-v1/`，统一版本、哈希、案例和来源清单；不会写旧 `structure-v1`。`render_poster.py` 使用复制到 `assets-source/optics-paper-review/2026-10-08/publication-prep/refractometer/` 的同版母版渲染海报，只增加摄影棚和摄影机。

执行顺序：先 `python3 -B .../package_public.py`，再通过 Blender `--background --factory-startup --python .../render_poster.py`，最后再次运行打包脚本纳入海报与海报哈希。推荐继续采用 2048 分段、3.05 MB 网格；保证交付和验证读的是同一几何，比未经独立复核的细分降级更可靠。测台窗口收为窄条仅列待办，本轮不改。
