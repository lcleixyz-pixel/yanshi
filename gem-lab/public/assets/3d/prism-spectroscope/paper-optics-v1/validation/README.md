# 棱镜分光镜 paper-optics-v1 独立验证

验证日期：2026-10-08。验证输入是本目录上一级的新 public 文件；未修改旧 structure-v1 或主应用。

## 结果

| 验证层 | 结果 |
| --- | --- |
| 从实际 GLB 三角面独立验证光路 | 6 组通过，0 失败；覆盖 4 个展示案例、10 条光路、50 个界面交点 |
| 界面、折射与出射方向 | 最大界面偏差 4.12 × 10⁻⁹ m；最大 Snell 切向折射率向量残差 2.51 × 10⁻⁸；最大出射角偏差 4.53 × 10⁻⁶° |
| 实际遮挡与终点 | 全部路径与首个实际障碍或目镜前表面一致 |
| 正式 Khronos glTF Validator | 0 错误、4 警告、14 信息；包元数据检查 5/5 |

4 条警告均为 `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE`：网格 2、6、16、18 的材质需要切线空间，导出网格未包含 TANGENT，依赖运行时生成。涉及机筒、目镜外部环、狭缝调节环和入口唇边的黑色金属材质；可能产生跨渲染器的表面法线效果差异。此项未改写几何、IOR 或光路，仍需在浏览器图像检查中观察。14 条信息是未使用的 UV 属性。

详细报告：[独立光学](independent-spectroscopes.json)、[glTF 格式与包元数据](gltf-validator.json)。浏览器效果由共享 review 的独立 browser.json 与截图另行记录，不包含在上述数字验证结论中。

## 输入绑定

| 文件 | SHA-256 |
| --- | --- |
| model.glb（1,032,860 bytes） | `f46f1007cb9a17ade4b22dc411d1a8250fc4e34674fc58ba97f072dd37bbe0bd` |
| optical-cases.json | `348cec80d3f00d2b439110f9689bd1e8b3007035cbf3031ef5a07f9213b3019d` |
| prescription.json | `00ba17d26155f5bd4318136256228b3cc67b34d0b70a5366832c719dda566818` |

光路或模型更改后，应重新运行验证并更新绑定；海报不在光学检查的输入范围内。

## 复现

在 `yanshi-instrument-assets` 仓库根目录执行。使用已有 Node.js、`gem-lab/tools/3d-assets/node_modules` 中的 Three.js 与官方 `gltf-validator` 2.0.0-dev.3.10；不需要更新工程依赖。

```sh
node gem-lab/tools/3d-assets/instruments-optics-2026-10-08/polariscope/verify_other_optics.mjs \
  --instrument prism-spectroscope \
  --input-dir gem-lab/public/assets/3d/prism-spectroscope/paper-optics-v1 \
  --output-dir gem-lab/public/assets/3d/prism-spectroscope/paper-optics-v1/validation

node gem-lab/tools/3d-assets/instruments-optics-2026-10-08/polariscope/validate-public-asset.mjs \
  --input-dir gem-lab/public/assets/3d/prism-spectroscope/paper-optics-v1
```

两个入口均在失败时返回非零退出码。光学入口也保留不传参数时检查旧源候选目录的兼容行为。

## 结论适用范围

独立验证器直接读取导出 GLB 的实际三角面和法线，并从处方系数重新计算 Sellmeier 折射率、Snell 关系、实际障碍与终点；未导入模型作者的光学函数。玻璃处方是候选设计输入，并非独立测量得到的厂家玻璃参数。

计算以进入棱镜前已经准直的平行光为前提。未知准直镜不用于声称真实准直质量、狭缝成像或光谱分辨率；未知目镜止于其实际前表面，不预测视网膜成像。胶合面边缘说明线不属于实际遮光物。该结论确认候选内部的几何和方程一致性，不等于厂商内部结构复原、实物光学校准、用户验收或发布。

## 本轮浏览器与保护范围

2026-10-08，在本机 Chromium 审阅页直接加载本版本，1280 × 720 下完成 4 个光路案例、部件选择、聚焦、隔离/拆解暂停光路、准确复位及整机/内部视图切换；控制台 0 错误、0 警告。证据为 [browser.json](browser.json)、[内部光路截图](browser.jpg)、[整机截图](browser-whole.jpg)。未验证 Safari、持续帧率、真实光谱或实物读数。

[保护范围哈希报告](protected-files.json)：开工前登记的 115 个文件全部未变，保护范围无新增或删除文件；包括已有 structure-v1、整个显微镜 public 子树、src 与 tests。原先未提交的改动保留，不以 Git HEAD 冒充本轮基准。
