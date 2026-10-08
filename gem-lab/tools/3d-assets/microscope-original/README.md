# 原创宝石显微镜试作

> **用户审阅未通过（2026-10-08）**：与实操仪器差别过大，停止作为教学接入候选；保留源码与产物供技术参考。具体结论见[制作记录](../../../../docs/原创显微镜教学候选-2026-10-08.md)。

自行设计的外壳、机械与双路照明原理机构。未导入厂家/Tripo 网格、图片纹理或商标。全部尺寸为教学设计参数；不代表厂家内部结构、制造公差或真实样品观察。

## 产物与预览

从工作树根目录启动 `python3 -m http.server 5189 --bind 127.0.0.1 --directory gem-lab`，打开：

<http://127.0.0.1:5189/tools/3d-assets/microscope-original/review/>

母版、GLB、清单、五方向/细节静帧与验证位于 `gem-lab/assets-source/gem-microscope/original-design/2026-10-08/v1/`。大文件仍在被忽略的素材目录，不替换 public 或应用资产。源代码按项目版本机制保存在本目录。

## 重建

在工作树根目录运行（Blender 5.2.2 LTS）：

```sh
"/Users/lc.leixyz/Applications/Blender 5.2.app/Contents/MacOS/Blender" --background --factory-startup --disable-autoexec --python-exit-code 1 --python gem-lab/tools/3d-assets/microscope-original/build_original.py -- --render all
```

`--render hero` 只出主视图，`--render none` 只构建和导出。脚本只写本候选输出与本目录 contract，不修改旧资产。再次重建会更新候选模型及其母版；重要审阅节点应先保存现有版本。

## 检查

```sh
node gem-lab/tools/3d-assets/microscope-original/verify-export.mjs
node --test gem-lab/tools/3d-assets/microscope-original/review/review-state.test.mjs
python3 gem-lab/tools/3d-assets/microscope-original/validate-optical-design.py --output gem-lab/assets-source/gem-microscope/original-design/2026-10-08/v1/validation/optical-design-check.json
node gem-lab/tools/3d-assets/inspect-import.mjs gem-lab/assets-source/gem-microscope/original-design/2026-10-08/v1/model.glb --out gem-lab/assets-source/gem-microscope/original-design/2026-10-08/v1/validation
```

独立实际三角面检查：

```sh
"/Users/lc.leixyz/Applications/Blender 5.2.app/Contents/MacOS/Blender" --background --factory-startup --disable-autoexec --python-exit-code 1 --python gem-lab/tools/3d-assets/microscope-original/check_mesh_optics.py
```

最后一项为严格“每条入样品抽样光束均无遮挡”检查，**当前会报告失败**：6928 条进入示意样品球的路径中有 15 条被下夹爪局部遮住。保留严格结果，不为获得全绿结果挪开夹具。`mesh-optics-review.json` 单列核心灯室通路通过与夹持阴影限制；计数比例不等于光通量损失。

网页使用独立场景照亮同一散射体；等效点光源没有计算夹具阴影、真实宝石折射或目镜成像。模型选择与说明、实体电源/模式按钮、拆解、复位、倾斜、镜头升降均已在本机内置 Chromium 检查。没有做本轮 Safari、手机、持续帧率或长期资源验收。

最终版本与分层检查见[本轮记录](../../../../docs/原创显微镜教学候选-2026-10-08.md)。
