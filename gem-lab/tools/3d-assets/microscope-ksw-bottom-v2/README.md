# KSW6000 候选 · 底光局部修整

保留既有 Tripo KSW6000 整机候选的外形，仅重做底部照明和讲解。原始候选、`repair-v1` 与现有公共资产保留；不使用已被否决的原创整机。

原理依据为《宝石显微镜光源系统设计与改造》(2014) §3.3：LED 经准直，暗域时经中央锥形反射器和外围反射器两次反射照向样品；亮域时中央组件退出，使用直接照明。具体曲面参数、尺寸和短行程机构是教学简化，不是 KSW6000 或 FABLE 的实测剖面。

## 入口

从工作树根目录运行已有本机服务器：

```sh
python3 -m http.server 5189 --bind 127.0.0.1 --directory gem-lab
```

已有同目录服务器时直接打开，不重复启动：

<http://127.0.0.1:5189/tools/3d-assets/microscope-ksw-bottom-v2/review/>

`review/` 使用项目已安装的 Three.js。模型与母版在 `gem-lab/assets-source/gem-microscope/tripo-trials/2026-10-08/repair-v2/`，原始输入是其相邻的 `candidate-textured.glb`。这些素材被 Git 忽略，恢复构建时须保留输入原件。

## 验证边界

`verify-export.py` 独立读取实际导出网格检查光路与外形；网页状态检查与浏览器目视检查另行记录。样品只是固定散射体，没有真实宝石折射、包裹体或目镜成像。准直束和观察入口是教学代理，不能把检查通过称为实物光学校准。

[本轮依据、结果与限制](../../../../docs/KSW6000底光修整-2026-10-08.md)。

## 重建与复核

以下命令从工作树根目录运行。本轮使用 Blender 5.2.2 LTS，构建 `d13f752e3b9c`；可执行文件在用户的 `Applications` 目录。重建会更新独立 `repair-v2` 候选，先保留需要对照的候选版本。

```sh
'/Users/lc.leixyz/Applications/Blender 5.2.app/Contents/MacOS/Blender' --background --factory-startup --disable-autoexec --python gem-lab/tools/3d-assets/microscope-ksw-bottom-v2/build_repair.py
```

仅重新渲染已有母版，在同一命令后加 `-- --render-only`；只构建而不渲染则加 `-- --no-renders`。

独立检查实际 GLB（不重新生成几何）：

```sh
'/Users/lc.leixyz/Applications/Blender 5.2.app/Contents/MacOS/Blender' --background --factory-startup --disable-autoexec --python gem-lab/tools/3d-assets/microscope-ksw-bottom-v2/verify-export.py -- gem-lab/assets-source/gem-microscope/tripo-trials/2026-10-08/repair-v2
node --test gem-lab/tools/3d-assets/microscope-ksw-bottom-v2/review/review-state.test.mjs
```

实际独立复核为 17/17 通过，最终模型 SHA-256 为 `b55e7b8299d63814409b955b1a8279cfff3dd401456e43520f98a1a938c98f68`。各次独立报告包含模型哈希；首轮失败报告保留，不能混作最终结果。
