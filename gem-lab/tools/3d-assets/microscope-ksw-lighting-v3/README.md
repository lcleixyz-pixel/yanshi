# KSW6000 候选 · 三路照明（顶光 / 底光 / 侧光）

在 `microscope-ksw-bottom-v2` 的底光基础上，按《宝石显微镜光源系统设计与改造》（2014，宝石和宝石学杂志 16(4):61–69）补齐顶光与侧光，三路独立开关（对应文献图 1 的 #8 侧光、#9 底光、#10 顶光开关）。只改网页层；模型直接读取 `repair-v2/model.glb`，不重建、不改 GLB。`microscope-ksw-bottom-v2/` 保持原样。

## 入口

已有 `gem-lab/` 目录的本机服务器时直接打开：

<http://127.0.0.1:5189/tools/3d-assets/microscope-ksw-lighting-v3/review/>

可复现机位：`#view=structure&cam=px,py,pz,tx,ty,tz`（资产坐标）。例如灯头漫射板近景 `#view=structure&cam=0.10,0.34,0.22,-0.11,0.49,-0.033`。

## 新增内容

| 照明 | 依据 | 本页实现 | 教学简化 |
| --- | --- | --- | --- |
| 顶光 | §3.1：6 W LED 灯珠群 + 漫射板，亮度连续可调，6500 K | 灯头出光面加漫射板与灯珠排布，开关和亮度可调；照亮散射体与台面 | 出光面由 `tripo_part_0` 实际三角面拟合（法线偏离样品约 4°）；灯珠数量与尺寸为示意 |
| 底光 | §3.3 | 沿用 v2：准直、可退出锥形反射器、外围腰形反射面 | 同 v2 |
| 侧光 | 图 1 #25 鹅颈侧光源 | 细鹅颈末端出光口，开关和亮度可调，定向照射散射体 | 模型中鹅颈轴线偏离样品 44–54°，实机需手动弯折；本页按已对准样品示意 |

顶光、侧光从台面上方照射，不受光阑与明暗域切换影响；拆解或隔离时与底光一并暂停。灯头被隐藏的视图（灯室剖解）保留照明，只隐藏对应光路。

光路颜色：紫线为顶光，橙线为侧光，金色为底光（同 v2）。

## 文件

- `review/incident-lighting.mjs`：顶光、侧光（新增）；顶部 `INCIDENT_GEOMETRY` 记录测得位置
- `review/review-state.mjs`：新增 `topOn / topBrightness / sideOn / sideBrightness`
- `review/lighting.mjs`：与 v2 相同，仅多导出 `litGroup`
- 浏览器检查与截图：`gem-lab/assets-source/gem-microscope/tripo-trials/2026-10-08/lighting-v3/validation/`（Git 忽略）

## 复核

```sh
cd gem-lab && node --test tools/3d-assets/microscope-ksw-lighting-v3/review/review-state.test.mjs
```

2026-10-08 结果：8/8 通过（v2 原有 6 项 + 三路独立、真实 Three 光源 2 项）；浏览器控制台 0 错误 0 警告。未测 Safari、手机、帧率（审阅页）；接入应用见下节；不模拟真实宝石反射、薄膜干涉或目镜成像。文献 §3.4 的偏光系统本轮未做。

## 接入应用（2026-10-08）

- 路由 `/explore/microscope`（`src/pages/MicroscopeExplorePage.tsx`），首页页眉与触屏入口各加一处链接。知识库、互动演示、检测流程与进度统计没有接入显微镜。
- 场景代码在 `src/components/microscope3d/`：`reviewState.js`、`bottomLighting.js`、`incidentLighting.js` 与本目录 `review/` 同源，`viewer.js` 是 `review.mjs` 去掉 DOM 后的版本，界面由 React 渲染。改动其一时需同步另一处。
- 网页模型 `public/assets/3d/gem-microscope/lighting-v3/`，由 `build-web.mjs` 从 `repair-v2/model.glb` 生成：只简化 `tripo_part_*` 外形网格（三角形 2,025,182 → 568,942），纹理转 WebP（最大 1024），EXT_meshopt_compression；54.1 MB → 4.89 MB。旧 `structure-v1` 未改动。
- `check-web.mjs` 对照原模型：64 个网格节点世界包围盒，教学部件最大偏差 0.000009、外形 0.000107 场景单位；光阑叶片形态目标保留；glTF Validator 0 错误 0 警告。有 4 个节点（`ledHeatSink`、`outerReflectorMount`、`tripo_part_4`、`tripo_part_5`）因有子节点，网格被量化移到无名子节点；应用按名称查找后遍历子节点，不受影响。

```sh
cd gem-lab
node tools/3d-assets/microscope-ksw-lighting-v3/build-web.mjs   # 重建网页模型
node tools/3d-assets/microscope-ksw-lighting-v3/check-web.mjs   # 对照校验
npx tsx --test tests/unit/microscope3d.test.ts
npx playwright test tests/microscope3d.spec.ts
```

验证：类型检查与 `npm run build` 通过；单元测试 57/57（含新增 3 项）；Playwright `microscope3d.spec.ts` + `smoke.spec.ts` 32/32 通过（收尾时 worker 退出超时为既有问题）。浏览器检查了开发与生产构建、1600 宽桌面与 390 宽手机布局（本页与偏光镜页一样切换为响应式 viewport，离开时恢复）、离开页面后画布释放、控制台无错误警告。未测 Safari、真机、公网冷加载和帧率；CI 工作流未加入新测试。
