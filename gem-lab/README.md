# 宝石检测实训系统（Gem Lab）

`gem-lab` 是本仓库实际运行的前端应用，基于 Vite + React + TypeScript + Tailwind CSS 构建。它面向宝石检测教学场景，提供仪器知识库、交互式演示、检测流程和命名评估。

## 运行环境

推荐版本：

```bash
node -v  # Node.js 22.x
npm -v   # npm 10.x
```

当前验证版本：

```text
Node.js v22.22.2
npm 10.9.7
```

## 安装与启动

在应用目录内运行：

```bash
cd /Users/lc.leixyz/Desktop/yanshi/gem-lab
npm install
npm run dev
```

默认开发地址：

```text
http://127.0.0.1:5173/
```

也可以从仓库根目录运行：

```bash
cd /Users/lc.leixyz/Desktop/yanshi
npm run install:lab
npm run dev
```

## 脚本说明

```bash
npm run dev             # 启动 Vite 开发服务器
npm run build           # TypeScript 项目引用构建 + Vite 生产构建
npm run preview         # 预览 dist 构建产物，默认端口 4173
npm run prepare-assets  # 从仓库根目录复制/切分运行时素材
```

注意：当前项目没有 `npm run slice-icons` 脚本。图标切片逻辑已经整合到 `npm run prepare-assets`。

## 目录结构

```text
gem-lab/
├── public/assets/              # 运行时静态资源
│   ├── scenes/                 # 工作台背景
│   ├── instruments/            # 三件仪器产品图
│   ├── observations/           # 仪器观察窗口状态图
│   ├── samples/                # 28 个宝石样品图
│   └── icons/                  # 操作步骤和状态反馈图标
├── scripts/
│   └── prepare-assets.ts       # 素材复制与图标切片脚本
├── src/
│   ├── App.tsx                 # 路由定义
│   ├── components/             # 业务组件和共享组件
│   ├── data/                   # 仪器、样品、类型定义
│   ├── pages/                  # 路由页面
│   ├── store/                  # Zustand 状态
│   ├── styles/                 # Tailwind 全局样式
│   └── utils/                  # 小工具函数
├── index.html
├── package.json
├── tailwind.config.ts
├── tsconfig*.json
└── vite.config.ts
```

## 路由

| 路径 | 页面 |
| --- | --- |
| `/` | 工作台首页 |
| `/knowledge/:instrumentId` | 仪器知识库 |
| `/demo/:instrumentId` | 仪器交互演示 |
| `/detection` | 检测流程 |
| `/assessment` | 命名评估 |

`instrumentId` 支持：

- `refractometer`：折射仪
- `polariscope`：偏光镜
- `spectroscope`：分光镜

## 应用结构说明

页面层：

- `src/pages/HomePage.tsx`：沉浸式工作台首页，提供仪器入口、样品盘入口、学习进度展示和新手引导。
- `src/pages/KnowledgeBasePage.tsx`：仪器知识库通用页面，根据 `instrumentId` 渲染不同仪器内容。
- `src/pages/InteractiveDemoPage.tsx`：交互演示路由分发页。
- `src/pages/DetectionWorkflowPage.tsx`：检测流程，包括难度选择、抽样、仪器选择、检测操作和记录汇总。
- `src/pages/NamingAssessmentPage.tsx`：命名评估，根据当前检测会话生成候选答案与反馈。

核心组件：

- `src/components/workbench/`：首页热区和新手引导。
- `src/components/knowledge/`：结构热点图、方法标签、章节导航。
- `src/components/refractometer/`：折射仪交互演示。
- `src/components/polariscope/`：偏光镜交互演示。
- `src/components/spectroscope/`：分光镜交互演示。
- `src/components/workflow/`：检测流程步骤条。
- `src/components/shared/`：页头、面包屑、标签等共享组件。

数据层：

- `src/data/instruments.ts`：三类仪器的介绍、结构热点、使用方法和主题配置。
- `src/data/samples.ts`：宝石样品库、难度分组、折射率、光性、光谱和提示信息。
- `src/data/types.ts`：仪器、样品、光学特征等 TypeScript 类型。
- `src/data/refractometerSampleMethod.ts`：根据样品形态判断折射仪应使用刻面法或点测法。

状态层：

- `src/store/progressStore.ts`：使用 Zustand persist 持久化学习进度，key 为 `gem-lab-progress-v1`。包含新手引导状态、已访问知识库、已完成演示、检测历史和总积分。
- `src/store/detectionStore.ts`：保存当前检测会话，不做持久化。包含难度、样品、已使用仪器，以及三类仪器检测数据。

## 素材维护

运行时素材统一由 `public/assets/` 提供，源码中使用 `/assets/...` 绝对路径引用。

如果根目录原始素材发生变化，可运行：

```bash
cd /Users/lc.leixyz/Desktop/yanshi/gem-lab
npm run prepare-assets
```

该脚本会：

- 复制工作台、仪器、观察窗口和样品素材。
- 将 `操作步骤图标集.png` 切分到 `public/assets/icons/steps/`。
- 将 `状态反馈图标集.png` 切分到 `public/assets/icons/status/`。

执行后建议检查 Git diff，确认生成资源是预期变化。

## 验证方法

当前没有单元测试或 E2E 测试配置。推荐的基础验证命令：

```bash
cd /Users/lc.leixyz/Desktop/yanshi/gem-lab
npm exec tsc -- -p tsconfig.app.json --noEmit --pretty false
npm exec tsc -- -p tsconfig.node.json --noEmit --pretty false
npm exec vite -- build
```

素材引用检查：

```bash
cd /Users/lc.leixyz/Desktop/yanshi
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
const root = '/Users/lc.leixyz/Desktop/yanshi/gem-lab';
const files = ['src/data/instruments.ts','src/data/samples.ts'];
const refs = new Set();
for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const m of text.matchAll(/['"](\/assets\/[^'"]+)['"]/g)) refs.add(m[1]);
}
const missing = [];
for (const ref of refs) {
  if (!fs.existsSync(path.join(root, 'public', ref))) missing.push(ref);
}
console.log(JSON.stringify({ assetReferences: refs.size, missing }, null, 2));
if (missing.length) process.exit(1);
NODE
```

手动前端验证建议：

- 首页：确认标题、仪器热区、样品盘入口、进度区和新手引导。
- 知识库：逐一打开折射仪、偏光镜、分光镜，确认基本介绍、结构讲解、使用方法和演示入口。
- 演示页：逐一打开三类仪器演示，确认学习模式、检测模式和主要控件存在。
- 检测流程：选择初级难度，抽取未知样品，确认进入仪器选择状态。
- 命名评估：无检测会话时访问 `/assessment`，应提示并引导回检测流程。
- 控制台：React Router future flag 警告可接受；其他运行时 error 需要调查。

## 当前边界

- 这是前端教学演示系统，不包含后端、账号、班级、真实评分同步或部署流水线。
- 检测数据和评估反馈用于教学训练，不代表真实宝石鉴定结论。
- 当前项目没有自动化回归测试；涉及交互或样式改动时，需要至少做一次浏览器验证。
- 页面主要面向桌面端使用，移动端体验尚未作为当前版本重点。
