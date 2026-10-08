# 偏光镜光路论文复核候选

2026-10-08。独立候选；不替换教学主应用。

保留已有偏光镜 GLB 的全部 8 个部件、原始纹理和形态，文件逐字节复制为 `model.glb`。候选只增加两个示意样品、按样品顶面联动的干涉球就位姿态，以及五条代表传播方向。原有干涉图、样品判定、课程与计分代码均未修改。

输出目录：`gem-lab/assets-source/optics-paper-review/2026-10-08/polariscope/`。

在资产工作树根目录重建和检查：

```sh
python3 gem-lab/tools/3d-assets/instruments-optics-2026-10-08/polariscope/build_candidate.py
node gem-lab/tools/3d-assets/instruments-optics-2026-10-08/polariscope/verify-candidate.mjs
```

构建默认从旁边的 `yanshi` 主项目读入已有资产；可传 `--source-root` 与 `--output`。模型 SHA-256 有前置检查，来源模型改变后应重新复核几何，不直接沿用旧参数。

`manifest.json` 保留原 `parts` 协议；`original-provenance.json` 保留来源说明；`sources.json` 是论文和 GIA 手册索引；`audit.json` 记录保留项、改动依据、主项目源码哈希及边界；`optical-cases.json` 供公共审阅器读取；`validation/geometry-checks.json` 是实际 GLB/Three 几何检查。

## 审阅器协议

- 坐标为 glTF Y-up，源模型单位未校准，不能把数值当作毫米。
- 每次切换 case 先恢复原始装配姿态。`partRotations` 为绕部件原始 world origin 施加的世界增量四元数 `[x,y,z,w]`；再施加世界坐标 `partOffsets`。均为相对初始姿态的绝对差值，不能累积应用。
- 每个 case 已包含光源的 `light: [0,-0.17,0]` 位移，不能重复应用清单中的 `internalLight.teachingOffsetNative`。
- `gem` 用 `THREE.OctahedronGeometry(1)`，`position` 为中心，`scale` 是 XYZ 半径。
- `cabochon` 用 `THREE.SphereGeometry(1,48,24,0,2*Math.PI,0,Math.PI/2)` 上半球，`position` 为平底中心，局部 y 从 0 到 1。两种样品都不附加旋转。
- 两种样品只有几何意义，不指定矿物身份、实测厚度或偏光观察结论。顶部间隙为球直径的 4%，用于表达“靠近”，不是厂家尺寸。
- 五条锥光路径表示“球收集穿过样品的不同方向，经上片观察”。线段转折不是计算焦点，不构成 Snell 定律、菲涅耳、实际孔径或镜头处方的仿真。

GIA 手册和 Nelson 1985 支持干涉球靠近/接触样品的放置方法；Samlan 2016 支持角度方向与锥光图的关系。科研论文中的激光、双透镜与调节机构不移植为这台仪器的实物附件。具体来源及阅读范围见 `sources.json`。
