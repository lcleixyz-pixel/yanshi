# 折射仪基础读数课资产 · paper-optics-v2

本地课程候选，接入 `/explore/optics/refractometer`。不是厂家内部测绘或实物标定结果。

已完成原 v1 的窄条测台待办：有效露出棱镜约 17 × 3.6 mm，长边沿 X，短边沿仪器前后方向。直接露出原半圆柱棱镜，没有另加玻璃覆盖条。钢台下方退让到 12.4 mm，以免原斜向光线被直壁挡住；用户于 2026-10-08 确认该教学结构。钢面高于棱镜平面 10 μm，用于避免共面竞争，低于 40 μm 的教学接触膜厚度。内部退让腔、膜厚和尺寸均不代表实物测量。

棱镜半径 6 mm、轴向 X、长度 17 mm、接触平面与法线保持不变。玻璃折射率 1.88、接触液上限 1.78、589 nm 单色条件与理想薄透镜中继保持原值。

四个 v1 案例逐对象原样保留；新增 `spinel-good`、`spinel-air-gap`。尖晶石参数从 `src/data/samples.ts` 导出，3D 案例与 2D 读数窗口共用这一来源。课堂中的样品是理想均质抛光块，不是真实样品观察视频的重建。

- `manifest.json`：16 个部件清单（15 个可选部件；旧静态光路节点作为教学覆盖层隐藏）、轴、尺寸、SHA-256 和文件大小。
- `optical-cases.json`：六个理想案例及代表路径。
- `provenance.json` / `sources.json`：变更、制作依据和来源限制；不分发论文 PDF 或厂家图片。
- `poster.png`：同一母版的 Cycles 渲染，隐藏可选教学样品及接触膜。
- `validation/`：实际导出 GLB 的独立光学核查、格式核查及建模后重新导入的检查。

重建在 `gem-lab` 中执行，先将 `BLENDER_BIN` 设置为本机 Blender 5.2.2 可执行文件路径：

```sh
npx tsx tools/3d-assets/instruments-optics-2026-10-08/refractometer/write_course_sample.ts
"$BLENDER_BIN" --background --factory-startup --python-exit-code 1 --python tools/3d-assets/instruments-optics-2026-10-08/refractometer/build_course_v2.py
```

母版和中间材料写入忽略目录 `assets-source/refractometer/course-v2/`。独立核查使用 `spectroscopes/independent_refractometer.py --expected-sha <本次GLB哈希> --input-dir assets-source/refractometer/course-v2`；通过后运行 `refractometer/package_course_v2.py`。再用 `polariscope/validate-public-asset.mjs --expected-version paper-optics-v2 --input-dir public/assets/3d/refractometer/paper-optics-v2` 检查格式。最后运行 `refractometer/render_course_v2.py` 并再次打包，保留对应母版和海报哈希。所有脚本均在同一 `instruments-optics-2026-10-08` 目录下。

原 `paper-optics-v1`、`structure-v1` 及其他仪器资源完整保留。旧版只读；重建流程不向旧版写文件。独立校验并不证明厂家处方、全量程读数精度或所有天然宝石现象。
