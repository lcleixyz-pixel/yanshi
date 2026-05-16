# 宝石检测实训系统

本仓库是一个用于宝石检测教学的前端演示交付版项目。当前阶段只交付浏览器内运行的教学体验，不包含后端服务、账号体系、班级管理或云端评分。仓库根目录主要负责包装脚本和保存原始素材；实际可运行的 Vite 应用位于 `gem-lab/`。

## 当前实现状态

已实现的主要能力：

- 沉浸式工作台首页，包含折射仪、偏光镜、分光镜和样品盘入口。
- 三类仪器知识库页面，包含基本介绍、结构讲解、使用方法和交互演示入口。
- 三类仪器交互演示页面，支持学习模式和检测模式入口。
- 检测流程页面，支持难度选择、随机抽样、仪器选择、检测记录汇总。
- 命名评估页面，根据当前检测会话生成候选答案和反馈。
- 学习进度持久化，包括知识库访问、演示完成、检测历史和积分。

当前交付边界：

- 当前没有后端服务、账号体系、班级管理或云端评分。
- 当前加入了 Playwright 路由烟测和 GitHub Actions 构建检查，用于保障核心页面可打开。
- 命名评估和仪器交互以教学演示为主，不应直接作为真实鉴定结论。
- 部分资源和设计说明来自历史需求输入，实际运行资源以 `gem-lab/public/assets/` 为准。

## 环境要求

推荐环境：

```bash
node -v  # Node.js 22.x
npm -v   # npm 10.x
```

当前已验证环境：

```text
Node.js v22.22.2
npm 10.9.7
```

## 快速启动

从仓库根目录安装应用依赖：

```bash
cd /Users/lc.leixyz/Desktop/yanshi
npm run install:lab
```

启动开发服务器：

```bash
cd /Users/lc.leixyz/Desktop/yanshi
npm run dev
```

默认访问地址：

```text
http://127.0.0.1:5173/
```

如果需要显式指定端口：

```bash
cd /Users/lc.leixyz/Desktop/yanshi/gem-lab
npm run dev -- --host 127.0.0.1 --port 5173
```

## 常用命令

根目录脚本：

```bash
npm run install:lab   # 安装 gem-lab 依赖
npm run dev           # 启动开发服务器
npm run build         # 生产构建
npm run preview       # 预览构建产物
npm run test:smoke    # 运行核心页面烟测
npm run test:matrix   # 运行 28 样品 x 3 仪器检测矩阵
```

应用目录脚本：

```bash
cd /Users/lc.leixyz/Desktop/yanshi/gem-lab

npm install
npm run dev
npm run build
npm run preview
npm run test:smoke
npm run test:matrix
npm run prepare-assets
```

说明：

- `npm run build` 会执行 TypeScript 项目引用构建和 Vite 生产构建。
- `npm run preview` 默认使用 Vite preview，端口为 `4173`。
- `npm run test:smoke` 会通过 Playwright 启动生产预览并检查核心路由是否正常渲染。
- `npm run test:matrix` 会遍历 28 个样品和 3 台仪器的检测模式，检查未知样品遮蔽、页面错误和可提交状态；该检查较烟测更慢，适合交付前或交互改动后运行。
- `npm run prepare-assets` 会把根目录中文素材规范化复制到 `gem-lab/public/assets/`，并切分步骤/状态图标。

## 项目结构

```text
yanshi/
├── .github/workflows/        # GitHub Actions 构建和烟测配置
├── package.json              # 根目录包装脚本
├── 设计.md                    # 历史设计/需求输入，不完全等同当前实现
├── gem-lab/                  # 实际前端应用
│   ├── package.json          # 应用依赖和脚本
│   ├── playwright.config.ts  # Playwright 烟测配置
│   ├── src/                  # React + TypeScript 源码
│   ├── tests/                # Playwright 烟测与检测矩阵
│   ├── public/assets/        # 运行时静态资源
│   ├── scripts/              # 素材准备脚本
│   └── vite.config.ts        # Vite 配置
├── 折射仪/                    # 原始折射仪素材
├── 偏光镜/                    # 原始偏光镜素材
├── 分光镜/                    # 原始分光镜素材
├── 样品库/                    # 原始样品图
├── 参考/                      # 历史参考页面/代码
└── 参考原型图/                # 历史 UI 原型图
```

## 应用路由

| 路径 | 页面 |
| --- | --- |
| `/` | 工作台首页 |
| `/knowledge/:instrumentId` | 仪器知识库，`instrumentId` 为 `refractometer`、`polariscope`、`spectroscope` |
| `/demo/:instrumentId` | 仪器交互演示 |
| `/detection` | 检测流程 |
| `/assessment` | 命名评估 |

未知路由会重定向到 `/`。

## 技术栈

- Vite 5
- React 18
- TypeScript 5
- Tailwind CSS 3
- React Router 6
- Zustand
- Framer Motion
- Playwright 路由烟测
- Sharp / tsx 用于素材准备脚本

## 自动化验证

GitHub Actions 会在推送到 `main` 或向 `main` 发起 Pull Request 时运行：

```bash
npm ci --prefix gem-lab
npm run build
npx playwright install --with-deps chromium
npm run test:smoke --prefix gem-lab
```

本地交接或改动后建议至少执行：

```bash
cd /Users/lc.leixyz/Desktop/yanshi
npm run build
npm run test:smoke
```

交互逻辑、样品数据或检测流程改动后，建议额外运行：

```bash
cd /Users/lc.leixyz/Desktop/yanshi
npm run test:matrix
```

如果本地首次运行烟测时提示缺少浏览器，请执行：

```bash
cd /Users/lc.leixyz/Desktop/yanshi/gem-lab
npx playwright install chromium
```

## 手动验收清单

自动化检查通过后，再启动前端并手动验证：

- 首页是否显示工作台标题、三件仪器入口、样品盘入口和进度区。
- 新手引导是否可以关闭。
- 三个知识库页面是否能打开，并显示基本介绍、结构讲解、使用方法和演示入口。
- 三个演示页是否能打开，并显示学习模式、检测模式和主要操作控件。
- 检测流程是否能选择初级难度、抽取未知样品并进入仪器选择。
- 无检测会话时访问 `/assessment` 是否引导回检测流程。

## 已知限制

- 本项目当前只覆盖前端教学演示，没有数据提交、登录、教师端或报表能力。
- 学习进度保存在浏览器本地持久化存储中，换浏览器或清理站点数据后会丢失。
- 自动化测试已覆盖核心路由烟测和检测矩阵；完整课堂演示节奏、视觉细节和移动端体验仍需要结合手动浏览器验证。
- 部分页面面向桌面端体验设计，移动端适配没有作为当前版本的主目标。
