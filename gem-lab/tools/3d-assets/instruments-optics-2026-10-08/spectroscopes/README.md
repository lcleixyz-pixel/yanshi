# 两类分光镜：文献支持的内部光路候选

本目录仅读取 `public/assets/3d/` 中已有资产，将独立候选写到 `assets-source/optics-paper-review/2026-10-08/`。不会覆盖原资产、旧母版或主教学页。

## 修改与证据

- 棱镜：原 GLB 三块玻璃拼成长方体，前后面平行；用原材质 IOR 1.52/1.62 做四次 Snell 折射，轴向入射出射偏角约 14.275°，被现有消光环挡住。旧“中心线穿过玻璃”检查不包含折射。
- 新棱镜仅替换三块玻璃及两个外侧胶合边线。使用 SCHOTT N-BK7/N-F2/N-BK7 作为明确声明的教学玻璃，采用 Hagen & Tkaczyk (2011) §9 的四界面非线性折射思路，解出 550 nm 直视。制造尺寸与玻璃型号不代表任何厂家实测处方。
- 光栅：保持原 GLB 字节。实际密度未知，150、300、600 线/mm 是三个教学参数；以 Newport 光栅方程计算零级、±一级的透射方向。刻线沿 +Y，光谱在 XZ 平面展开，红光偏转较大。密度改变后，现有孔径挡住的光线在实际网格处截断。
- 准直镜及目镜的曲率、像差没有实物处方依据。本轮从“准直组件已经输出平行光”开始，光路终止于真实目镜前表面；不能据此宣称全系统成像、光谱分辨率或实物视野校准。

来源、原文定位和访问限制见 `sources.json`。未复制论文或厂商图片到公开资源中。

## 重建

从 `yanshi-instrument-assets` 仓库根执行：

```sh
'/Users/lc.leixyz/Applications/Blender 5.2.app/Contents/MacOS/Blender' --factory-startup -b --python-exit-code 1 --python gem-lab/tools/3d-assets/instruments-optics-2026-10-08/spectroscopes/build.py -- --instrument prism-spectroscope
'/Users/lc.leixyz/Applications/Blender 5.2.app/Contents/MacOS/Blender' --factory-startup -b --python-exit-code 1 --python gem-lab/tools/3d-assets/instruments-optics-2026-10-08/spectroscopes/build.py -- --instrument grating-spectroscope
```

Blender 是本机已验证的 5.2.2 LTS。换机器时替换可执行程序路径即可；输出定位由脚本相对目录计算。无需安装插件或使用网络服务。`--factory-startup` 避免启动用户配置的 Tripo Bridge。

每台输出：`model.glb`、`editable.blend`、`manifest.json`、`sources.json`、`optical-cases.json`、`audit.json`；棱镜另有 `prescription.json`。

## 已完成的构建检查

- 候选导出后清空场景并重新导入 GLB，以实际三角面和 BVH 计算界面交点、法线、折射和遮挡；不会拿一条不折射的中心直线代替光路。
- 棱镜外形及其他 17 个网格的世界三角形签名保持一致，63 条有限入射束全部到达目镜前。550 nm 出射偏角约 0.0000017°（网格浮点误差）；400–700 nm 角分散约 1.89745°。
- 光栅原文件字节不变。三个密度示例分别有 15/15、7/15、1/15 条代表光线到达目镜前。余下光线被实际壳体、消光环或观察口截断，保留这一结果。
- 光路 JSON 附 `interactions`：每个界面具有实际节点名、点序号、折射率或光栅级次/密度，供独立复核。

这只是构建者的网格检查；独立复核、网页显示与实物验收分别记录，不能相互替代。

## 对另一作者折射仪候选的独立复核

`independent_refractometer.py` 未导入折射仪构建者的光学计算函数，也不依赖 Blender；它直接解析 GLB 二进制、节点变换和真实三角面，以 NumPy 投影与有限线段相交检查验证界面、Snell 定律、反射、临界条件与不透明遮挡。理想中继只核对有限边界，不把它当作真实厚透镜。

```sh
python3 gem-lab/tools/3d-assets/instruments-optics-2026-10-08/spectroscopes/independent_refractometer.py --expected-sha 801a87705268e57f66603b476b29d00109e56cbce06f9e88ce1a59e493ea24d6
```

报告写到折射仪候选的 `validation/independent-refractometer.json`，绑定实际 GLB、光路 JSON 与复核脚本 SHA。该模型的离散曲面折射方向容差为 0.10°，平面容差为 0.003°；原始观测误差完整保留。不能将这一数值误差解释为实物测量精度。

强度另按 s/p 两种偏振分别求玻璃—接触液—样品非相干多次反射总和，再取非偏振平均；该合并能量与图中代表主路径的含义不同，报告明确保留这一限制。
