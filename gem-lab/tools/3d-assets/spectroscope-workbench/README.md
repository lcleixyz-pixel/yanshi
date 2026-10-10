# 当前采用 simple-v2：光源、镊子和放置台面

2026-10-10，按用户纠正收窄到实际所需器材。当前 `simple-v2` 只有白色光纤灯、细金属光导端、宝石镊子，以及内反射观察用的简洁黑色放置台。旧 `bench-v1` 为历史候选，原件保留，不再是当前练习入口。

```sh
"/Users/lc.leixyz/Applications/Blender 5.2.app/Contents/MacOS/Blender" --background --factory-startup --python-exit-code 1 --python gem-lab/tools/3d-assets/spectroscope-workbench/build_simple.py -- --render
node gem-lab/tools/3d-assets/spectroscope-workbench/verify_simple.mjs
```

当前网页资源：`gem-lab/public/assets/3d/spectroscope-workbench/simple-v2/`。母版：`gem-lab/assets-source/spectroscope-workbench/2026-10-10/editable/simple-v2/spectroscope-simple-master.blend`。1920×1080 渲染及验收：同来源目录下 `validation/simple-v2/`。

外形主要参考 [FABLE FCL-100](https://www.szfable.com/product/optical-fiber-light-fcl-100/) 的白色简盒、左下出光口、右上开关调光旋钮、红指示灯和细金属出光端，并用 [南京宝光光纤冷光源](http://bgyq.cn/iw/iw.html) 核对常见形态；镊子参考 [FABLE DT-M](https://www.szfable.com/product/gem-tweezers-dt-m/) 的细长双臂形式。均为无品牌教学自建模型，未复制厂商图片像素，未宣称尺寸复刻。参考原件只存于 `references/`，索引为 `simple-v2-sources.json`。

当前节点沿用 `Bench_lightSource`、`Bench_dimmerKnob`、`Bench_lampHead`、`Bench_lampEmitter`、`Bench_fiberCable`。`Bench_powerSwitch` 是共享调光旋钮关断段的语义 helper，没有凭空添加独立翘板。灯头 pivot `[0,.12,-.09]`、出光面 `[0,.12,-.069]` 保持原接口；出光半径为示意值 2.2 mm，读取 `manifest.lamp.emitterRadiusMeters`。光纤起点读取 `manifest.fiber.points[0]`。

`Bench_tweezers` 的中心为 `[0,.12,0]`，`Bench_tweezerJawA/B` 在根部 `[.145,.157,0]` 分别绕 Y 反向开合 0–4°；`Bench_tweezerTipA/B` 默认为 `[0,.12,±.007]`。透射和表面反射时显示镊子。内反射时隐藏镊子、显示 `Bench_reflectionTable`，默认台面 Y=.108、底面 Y=0；其两块简单黑色几何没有导轨、滑片、仪器托架或调节机构。运动量与光谱/亮度效应由应用定义，非真实夹持力或照度标定。

---

# 分光镜共享工作台资产

2026-10-10，原创参数化教学候选。保留独立光源、控制件、灯头、导光束、夹持器、通孔遮光片与台板；分光镜和样品由应用单独加载。未发布、未声称实物标定。

```sh
"/Users/lc.leixyz/Applications/Blender 5.2.app/Contents/MacOS/Blender" --background --factory-startup --python-exit-code 1 --python gem-lab/tools/3d-assets/spectroscope-workbench/build_bench.py -- --render
node gem-lab/tools/3d-assets/spectroscope-workbench/verify_bench.mjs
```

脚本从自身位置定位工作树。Blender 命令中的路径可替换成该机器的 Blender 可执行文件。输出：

- 已移出网页目录：`gem-lab/assets-source/spectroscope-workbench/2026-10-10/superseded/bench-v1-web/` 的 GLB、清单、provenance、poster。
- 编辑母版：`gem-lab/assets-source/spectroscope-workbench/2026-10-10/editable/spectroscope-workbench-master.blend`，含自建可编辑部件、材质及产品摄影场景。
- 核验：同级 `validation/`，包含六个观察角度、逐网格封闭和正体积检查、真实通孔射线测试、glTF 格式验证与重新导入检查。

`assets-source` 为本机忽略目录，只克隆 Git 无法恢复母版和参考图。需交接或清理时保全这些原件。

## 界面约定

米制 Y 向上，台板 X 横向、Z 深度；样品中心 `[0,0.12,0]`，灯头位于负 Z 侧，出光朝局部 `+Z`。

| 节点 | 作用 |
| --- | --- |
| `Bench_lightSource` | 光源机箱，银灰金属与深蓝侧饰；真实顶部通风缝 |
| `Bench_powerSwitch` | 独立电源翘板，局部 X 转动示意 |
| `Bench_dimmerKnob` | 独立调光旋钮，局部 Z 转动示意 |
| `Bench_lampHead` | pivot `[0,0.12,-0.09]`，可转向；真实开口灯筒 |
| `Bench_lampEmitter` | 灯头子节点，世界默认 `[0,0.12,-0.069]` |
| `Bench_fiberCable` | 可隐藏并重绘的柔性导光束；控制点见 manifest |
| `Bench_sampleHolder` | 独立夹持器，样品由应用生成，不包含在 GLB |
| `Bench_shutter` | 带真实直径 22 mm 通孔的遮光片，沿 X 移动 0–75 mm |
| `Bench_instrumentRest` | 双托架，需由应用按所载仪器对位 |

固定组包括 `Bench_base`、`Bench_lampStand` 与 `Bench_sampleStage`。所有节点和 pivot 以网页目录内 `manifest.json` 为准。

主机采用通用卤素光纤宽带白光语义，KRÜSS 页面仅作为功能及外观类别参考，未复刻 KL5120 尺寸。原图不进入 GLB；光路、照明效应及光谱观察由应用的教学模型决定。材质发光不等于光谱分布或照度计算。运动行程、中心高度、孔径均为教学设计，未做真实设备测量。

两只 V 型托架分别为 `Bench_instrumentRestFront` 和 `Bench_instrumentRestRear`，均为 `Bench_instrumentRest` 子节点。默认世界 Z 为 0.074 / 0.14 m，可根据所载分光镜长度缩小间距。V 型软垫内表面的等效顶点 Y 为 0.109828 m，整体高度建议修正为 `0.12 - (0.109828 + sqrt(2) * 镜筒半径)`，让不同半径镜筒获得合理接触。此为简化机械对位，不是夹持载荷计算。

样品夹有横向导轨支持 ±35 mm 平移；样品转动建议在样品本身实现，夹具组不随样品绕 Y 旋转。灯头出光窗口与柔性导光束分开，转灯头时应更新运行时曲线末端。灯头支架的偏转范围和光纤弯曲半径尚未实物校准。
