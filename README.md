# 宝石检测实训系统

本仓库是一个用于宝石检测教学的前端演示交付版项目。当前阶段只交付浏览器内运行的教学体验，不包含后端服务、账号体系、班级管理或云端评分。仓库根目录主要负责包装脚本和保存原始素材；实际可运行的 Vite 应用位于 `gem-lab/`。

## 当前实现状态

已实现的主要能力：

- 首页：折射仪、偏光镜、分光镜、宝石显微镜各一张仿真卡（「打开仿真」），下接综合检测与学习进度。
- 仪器仿真（PhET 风格，`/sim/…`）：折射仪、偏光镜、分光镜各有「认识 / 实验 / 挑战」三屏，显微镜目前只有「认识」屏。引导课程是仿真里可收起的任务卡，可选学员自学或讲师演示；挑战屏抽未知样品独立练习。
- 三类仪器知识库页面：基本介绍、结构讲解、使用方法；页面只留一个「打开仿真」入口，2D 经典演示作为备用。
- 检测流程：难度选择、复习优先抽样、仪器选择与检测记录汇总；三台仪器的检测一步都走仿真外壳的挑战台（三维不可用时可改用 2D）。
- 命名评估：根据当前检测会话生成候选答案和反馈，要求选择主要判断依据，可打印课堂练习记录。
- 学习进度持久化（知识库访问、引导课程完成、检测历史、积分）；学习图鉴展示样品掌握度，抽样优先照顾未测与答错样品。
- 当前检测会话支持刷新后继续。

整体结构与各阶段记录见 `docs/整体重构规划-PhET风格-2026-10-11.md`；面向公众的后续规划（讨论稿）见 `docs/线上实操教室与宝石数据库规划-2026-10-13.md`。

当前交付边界：

- 当前没有后端服务、账号体系、班级管理或云端评分。
- 已有单元测试、Playwright 浏览器回归与 GitHub Actions 检查（见「自动化验证」）。
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
npm run install:lab
```

启动开发服务器：

```bash
npm run dev
```

默认访问地址：

```text
http://127.0.0.1:5173/
```

如果需要显式指定端口：

```bash
cd gem-lab
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
npm run test:matrix   # 运行 当前全部样品 x 3 仪器检测矩阵
npm run test:unit     # 运行抽样、掌握度和计分纯逻辑测试
```

应用目录脚本：

```bash
cd gem-lab

npm install
npm run dev
npm run build
npm run preview
npm run test:smoke
npm run test:matrix
npm run test:unit
npm run prepare-assets
```

说明：

- `npm run build` 会执行 TypeScript 项目引用构建和 Vite 生产构建。
- `npm run preview` 默认使用 Vite preview，端口为 `4173`。
- `npm run test:smoke` 会通过 Playwright 启动生产预览，检查核心路由、会话恢复和练习反馈闭环。
- `npm run test:matrix` 会遍历当前全部样品和 3 台仪器的检测模式，检查未知样品遮蔽、页面错误和可提交状态；该检查较烟测更慢，适合交付前或交互改动后运行。
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
| `/` | 首页：四张仪器仿真卡、综合检测、学习进度 |
| `/sim/:simId/:screen` | 仪器仿真。`simId` 为 `refractometer`、`polariscope`、`spectroscope`、`microscope`；`screen` 为 `learn` 认识、`lab` 实验、`challenge` 挑战（显微镜只有 `learn`） |
| `/knowledge/:instrumentId` | 仪器知识库，`instrumentId` 为 `refractometer`、`polariscope`、`spectroscope` |
| `/demo/:instrumentId` | 2D 经典演示（设备较旧或三维无法加载时使用） |
| `/detection` | 综合检测流程 |
| `/assessment` | 命名评估 |
| `/progress` | 学习图鉴与最近练习 |

仿真地址常用参数（只在进入时读取一次）：

- `?mode=student` / `?mode=teacher`：直接开始引导课程（学员自学 / 讲师演示）；`&step=…` 直达某一步（记为跳步，当轮不写入学习进度）。
- 偏光镜：`?lesson=components|path|principle|sample|conoscope` 打开对应讲次；`?quality=standard` 用流畅画质（课堂低配电脑、CI）。
- 分光镜：`?machine=prism|grating`；实验屏还可带 `?sample=` 与 `?method=`。折射仪实验屏可带 `?sample=`。

旧的 3D 页面已删除，旧地址自动转到新地址并保留参数：`/explore/polariscope`、`/explore/microscope`（含 `#cam=`）、`/explore/optics/{prism,grating}-spectroscope`、`/explore/optics/refractometer`、`/explore/spectroscope-bench`。不认识的旧地址与未知路由都回到 `/`。

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

GitHub Actions（`.github/workflows/frontend-demo.yml`）在推送到 `main` 或向 `main` 发起 Pull Request 时运行三组任务：

1. **构建与烟测**：安装依赖、生产构建、单元测试（`npm run test:unit`）、测试代码类型检查（`npm run test:types --prefix gem-lab`）、CI 完整性脚本自检、核心烟测。
2. **偏光镜分片回归**：同一份构建，`npx playwright test sim-polariscope` 分 3 片在 Mesa 软件渲染下串行跑；`.github/scripts/verify-polariscope-shards.mjs` 核对三片合起来正好是全部用例（当前基线 72 项）。新增或删除 `sim-polariscope-*.spec.ts` 用例时要同步改基线。
3. **其余仪器回归**：折射仪、分光镜、显微镜、外壳与知识库相关的浏览器用例。

本地交接或改动后建议至少执行：

```bash
npm run build
npm run test:smoke
```

交互逻辑、样品数据或检测流程改动后，建议额外运行：

```bash
npm run test:matrix
```

本地与 CI 都使用 Playwright 配套 Chromium。首次安装或升级 Playwright 后，请执行：

```bash
cd gem-lab
npx playwright install chromium --no-shell
```

## 手动验收清单

自动化检查通过后，再启动前端并手动验证（阶段 5 的实机验收：Safari、真实手机与平板、投屏、课堂试用，见整体重构规划第四节）：

- 首页是否显示四张仪器卡；「打开仿真」进入各仪器认识屏，「开始检测」进入检测流程。
- 首次访问的新手引导是否可以关闭。
- 每台仪器在仿真里：底部「认识 / 实验 / 挑战」可切换且场景保留；右侧面板可操作；橙色「全部重置」只恢复当前屏。
- 引导任务：选学员自学后按步骤完成，做完一步停在结果上、点「下一步」才换场景；全部完成后「完成课程并记录」写入学习进度；讲师演示不写入。
- 挑战屏：抽样后不显示品种名，保存后揭示答案。
- 检测流程：选初级难度、抽取未知样品、进入仪器检测、保存后回到流程并能进入命名评估。
- 手机竖屏：任务卡在上、读数框在下，控制面板从右下「控制」打开；投屏模式按 Esc 退出。
- 无检测会话时访问 `/assessment` 是否引导回检测流程。
- 检测页选择难度、抽样后刷新，是否保留当前会话；“重新开始”是否清空会话。
- 学习图鉴是否展示样品状态；命名评估是否先选择依据，反馈后是否可打印课堂记录。

## 已知限制

- 本项目当前只覆盖前端教学演示，没有数据提交、登录、教师端或报表能力。
- 学习进度保存在当前浏览器的本地存储；当前检测会话保存在标签页会话存储。换浏览器或清理站点数据后，相关记录可能丢失。需要留存单次练习时，可在评估反馈页使用浏览器打印或保存为 PDF。
- 自动化测试已覆盖纯逻辑、核心页面、四台仪器仿真与检测矩阵；完整课堂演示节奏和不同设备上的触控体验仍需结合实际使用验证。
- 首页与仪器仿真按设备宽度排版（手机竖屏有专门布局）；知识库、检测流程、命名评估等页面仍以桌面端为主，手机上按固定宽度缩放显示。
- 显微镜只有「认识」屏；放大观察（真实照片、调焦与照明原理练习）待素材核对后再做。

## 偏光镜制作素材

网页运行所需模型与来源清单随源码保存；Blender 母版、原始生成候选和历史截图存入外部档案。继续制作时按[资产归档与恢复](docs/资产归档与恢复.md)取回，不影响普通克隆、安装和构建。
