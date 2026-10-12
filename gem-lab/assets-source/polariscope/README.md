# 项目原有形态参考偏光镜 · Blender 教学母版 v0.4.0

> 本文记录旧 v0.4 参数化母版。当前网页使用后续 `repair-v2` 修整资产，当前可编辑母版是 `tripo-trials/2026-10-05/A-original/repair-v2/repaired.blend`，不是顶层 `polariscope-master.blend`。大素材现已外部归档，小脚本和参数保留原路径；需要制作时按[资产归档与恢复](../../../docs/资产归档与恢复.md)恢复。以下为保留的历史制作说明。

用户明确要求参考原本演示项目中的仪器形态和资料。当前恢复厚白底座、后侧连续白色折板支架、圆滑转折、向前伸出的圆头通孔顶托、上下黑环及左侧干涉球。几何为本地原生参数建模，外形依据项目原图；不再称为独立原创通用外壳。

所有数值均为视觉建模暂定尺寸，尚未实测。`status` 为 `project-reference-derived-teaching-model`，`dimensionBasis` 为 `provisional-visual-reference-dimensions`，`provisional: true`，`dimensionsCalibrated`、`physicalInstrumentVerified`、`manufacturingValidated` 均为 `false`。它是教学参考模型，不是实物数字孪生或制造图。

## 形态与资料依据

- `../../../偏光镜/偏光镜_产品图.png` 是主要可见形态参考；它与 `../../public/assets/instruments/polariscope.png` 的 SHA-256 完全一致：`99180744ea3ddceaf5ffd0910f5acc1a5f9bffee4ca4208e3715155dd145c4aa`。
- `../../../偏光镜/偏光镜.pdf` 第 11 页，图 2-2-9 与图 2-2-10，核对底座光源、固定下偏光片、样品载物台和可旋转上偏光片的关系。
- 既有原图与 PDF 图片的外部作者及复用来源尚未核明。用户明确选择其作为本地建模参考；这一选择不等于已核清外部权利。不嵌入图片、页面、标识或现成第三方网格。
- 前方黑色椭圆框与橙色窗口按原图可见外观表现。PDF 照片显示顶面近后侧电源开关，旧数据描述称电源在背面，早期演示又写右侧，因此模型不将前橙窗武断标为电源按钮。发光片属于 `light` 部件，随示意光源状态显示。
- 背面接口、内部布线、隐蔽连接与制造工艺未获证实，不补造。连续支架厚度、弯曲半径、透明样品承托和工具收纳细节只满足虚拟教学装配。

## 版本沿革与文件

v0.2 曾依据项目原图探索外观，已保留于 `archive-reference-v02/`。v0.3 调整为独立双柱教学布局，v0.3.1 根据底座反馈改为紧凑厚箱体。用户随后要求回到原演示项目的仪器形态，v0.4 重新以原图为外形依据，并按 PDF 核机械关系。`parameters.json` 的 `revisionHistory` 保留 v0.3.1 参数；不以改换来源表述抹去实际参考历史。

- `parameters.json`：暂定尺寸、具体来源、历史和边界。
- `polariscope-master.blend`：原生部件、可编辑倒角、光学片、贯通环孔与 Web/Cycles 两套材质。
- `validation.json`：GLB 哈希、八部件坐标、闭合几何、通孔射线、样品接触、重导入及渲染证据。
- `../../tools/3d-assets/blender/build_polariscope.py`：本地参数化构建脚本。
- `../../public/assets/3d/polariscope/`：网页 GLB、manifest 和固定视角图。

## 功能与科学边界

下偏振片、样品区域与上检偏器共用 Y 光轴；上检偏器和载物台绕各自局部 Y 轴转动。可见孔洞为真实几何，样品与透明承托接触；这不能证明实物规格、公差或材料。样品是未定名刻面示意体，默认隐藏；方向标记默认关闭。

干涉球表现为收纳中的透明球体，不指定焦距、真实光学处方或锥光干涉图。材质没有偏振追迹、宝石品种鉴定或诊断能力。拆解动画说明部件关系，不是制造、维修或安全操作文件。

后续优先使用已有项目资料、公开原理和必要记录，无需完整拍摄品牌设备。只有教学操作确实无法从资料确认时，再补最小范围的样品视场记录、辅助工具姿态或放样位置；不将模拟图样当作检测结论。

## 材质和坐标契约

同几何两套材质：`WEB_*` 使用 glTF 金属度、粗糙度、透射与折射率；`CYCLES_*` 添加微表面和离线路径追踪布光。两者分别调节发光强度，不承诺画面或光学结果完全一致。

Blender 原生 Z 向上；GLB/manifest 为右手坐标、Y 向上、光轴 +Y、前方 +Z，单位米。八个 `Polariscope_<partId>` 节点及子网格均带 `partId`。`pivot`、`hotspot` 是装配世界坐标，`explodeOffset` 是世界位移，局部 Y 为旋转轴。

## 重建与渲染

```sh
/path/to/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python gem-lab/tools/3d-assets/blender/build_polariscope.py -- --view 04-three-quarter
```

主图确认后，用 `-- --render-existing` 从同一母版补齐六视图，不重导出 GLB，保证审阅与正式验收绑定同一 GLB 哈希。该模式检查参数、脚本及 GLB 哈希一致。`-- --skip-renders` 可仅构建。默认六图均为 1200 × 1200、Cycles 96 采样、降噪。

运行会更新母版与派生产物，请先保留人工修改。脚本不安装软件、不配置全局 MCP、不上传资料。几何检查、浏览器验证与用户验收是独立证据层。
