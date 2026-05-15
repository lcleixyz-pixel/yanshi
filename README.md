# 宝石检测实训系统

本仓库是一个用于宝石检测教学的半成品前端项目。当前远端版本已经覆盖到本地，仓库根目录主要负责包装脚本和保存原始素材；实际可运行的 Vite 应用位于 `gem-lab/`。

## 当前实现状态

已实现的主要能力：

- 沉浸式工作台首页，包含折射仪、偏光镜、分光镜和样品盘入口。
- 三类仪器知识库页面，包含基本介绍、结构讲解、使用方法和交互演示入口。
- 三类仪器交互演示页面，支持学习模式和检测模式入口。
- 检测流程页面，支持难度选择、随机抽样、仪器选择、检测记录汇总。
- 命名评估页面，根据当前检测会话生成候选答案和反馈。
- 学习进度持久化，包括知识库访问、演示完成、检测历史和积分。

仍属于半成品的部分：

- 当前没有后端服务、账号体系、班级管理或云端评分。
- 当前没有 Vitest、Playwright 等自动化测试配置。
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
```

应用目录脚本：

```bash
cd /Users/lc.leixyz/Desktop/yanshi/gem-lab

npm install
npm run dev
npm run build
npm run preview
npm run prepare-assets
```

说明：

- `npm run build` 会执行 TypeScript 项目引用构建和 Vite 生产构建。
- `npm run preview` 默认使用 Vite preview，端口为 `4173`。
- `npm run prepare-assets` 会把根目录中文素材规范化复制到 `gem-lab/public/assets/`，并切分步骤/状态图标。

## 项目结构

```text
yanshi/
├── package.json              # 根目录包装脚本
├── 设计.md                    # 历史设计/需求输入，不完全等同当前实现
├── gem-lab/                  # 实际前端应用
│   ├── package.json          # 应用依赖和脚本
│   ├── src/                  # React + TypeScript 源码
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
- Sharp / tsx 用于素材准备脚本

## 验证建议

当前项目没有自动化测试套件。交接或改动后建议至少执行：

```bash
cd /Users/lc.leixyz/Desktop/yanshi/gem-lab
npm exec tsc -- -p tsconfig.app.json --noEmit --pretty false
npm exec tsc -- -p tsconfig.node.json --noEmit --pretty false
npm exec vite -- build
```

再启动前端，手动验证：

- 首页是否显示工作台标题、三件仪器入口、样品盘入口和进度区。
- 新手引导是否可以关闭。
- 三个知识库页面是否能打开，并显示基本介绍、结构讲解、使用方法和演示入口。
- 三个演示页是否能打开，并显示学习模式、检测模式和主要操作控件。
- 检测流程是否能选择初级难度、抽取未知样品并进入仪器选择。
- 无检测会话时访问 `/assessment` 是否引导回检测流程。

## 已知限制

- 本项目当前只覆盖前端教学演示，没有数据提交、登录、教师端或报表能力。
- 学习进度保存在浏览器本地持久化存储中，换浏览器或清理站点数据后会丢失。
- 当前没有自动化回归测试；前端改动后需要结合手动浏览器验证。
- 部分页面面向桌面端体验设计，移动端适配没有作为当前版本的主目标。
