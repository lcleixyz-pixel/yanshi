# 宝石检测实训系统（Gem Lab）

> 基于 Vite + React + TypeScript + Tailwind CSS 的教学演示平台首版。

## 启动

```bash
npm install
npm run dev          # http://127.0.0.1:5173
npm run slice-icons  # 切片操作步骤/状态反馈图标集（构建一次即可）
npm run build        # 生产构建
npm run preview      # 本地预览构建产物
```

## 目录概览

```
gem-lab/
├── public/assets/        # 运行时静态资源（来自 ../scripts/copy-assets 自动复制）
│   ├── scenes/           # 工作台主页背景
│   ├── instruments/      # 三件仪器产品图
│   ├── observations/     # 各仪器观察窗口状态图
│   ├── samples/          # 27 个宝石样品图
│   └── icons/            # 切片后的操作步骤/状态图标
├── scripts/
│   ├── copy-assets.ts    # 把 ../*.png 等素材按规范复制到 public/assets/
│   └── slice-icons.ts    # 用 sharp 将两张图标大图切成 25 个独立 PNG
└── src/
    ├── data/             # instruments / samples / spectra 数据源
    ├── store/            # zustand 状态（progress / detection）
    ├── components/       # 复用组件（按业务域分目录）
    ├── pages/            # 路由页面
    └── styles/           # 全局样式
```

## 路由

| 路径                        | 页面                         |
| --------------------------- | ---------------------------- |
| `/`                         | 工作台主页                   |
| `/knowledge/:instrumentId`  | 仪器知识库（refractometer / polariscope / spectroscope） |
| `/demo/:instrumentId`       | 交互式演示                   |
| `/detection`                | 检测流程                     |
| `/assessment`               | 命名评估                     |

## 风格

- 主页：深色沉浸式工作台（`bg-workbench-gradient`）
- 内页：蓝白学术风（`bg-brand-50` / 白卡片 / 蓝色高亮）
- 字体：Noto Sans SC（中文）+ Manrope（西文 display）+ JetBrains Mono（数据）
