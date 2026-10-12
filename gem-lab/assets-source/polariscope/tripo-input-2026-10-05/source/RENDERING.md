# B 组中性多视图的生成方式

`render_neutral_multiview.py` 只读取现有 v0.4 母版，在独立 Blender 进程中临时更换灯光与材质。它不保存 `.blend`，不导出 GLB，不改现行网页、参数或正式渲染图。

四张输入图为同一模型的正面、左侧、背面、右侧：2048 × 2048，正交投影，方位角依次 0°、−90°、180°、90°，相机均抬高 10°，共同观察点为交付坐标 `(0, 0.127, -0.010)` 米，正交画幅 0.320 米。模型不随视角重塑；背面保持现有干净表面，不增加未获证实的接口或开关。

场景采用浅白背景和四盏柔光，无地面投影，无样品、标签或拼接。黑环、白漆和金属局部提高粗糙度、收敛高光；光学片临时混入透明着色以减少低角度镜面被误读为堵孔，并保留下层弱暖光。该透明处理只服务图转三维输入的可读性，不是实物光学校准结果，不写回正式材料。

`review/hero.png` 是 18°、0.350 米画幅的三分之四检查图；`review/top.png` 为顶部检查图。它们不属于四视图输入组。父任务生成的 AI 材质目标图同样只放在 `review`，不作为模型几何来源。

```sh
/path/to/Blender --background --python-exit-code 1 --python source/render_neutral_multiview.py -- --preview
/path/to/Blender --background --python-exit-code 1 --python source/render_neutral_multiview.py -- --final
```

实际运行请使用脚本的完整路径。预览生成 `preview-settings.json`；正式运行生成 `render-manifest.json`，记录每张图的相机、尺寸、哈希、材质、灯光、渲染设备与源文件哈希。脚本在运行前后核验母版、GLB、参数、原构建脚本、正式 manifest 和 validation 未变化。

原母版仍是参考项目图像的未实测教学模型。输入图不能补足未知的真实背面结构，也不能证明后续服务生成的网格具有正确部件、孔洞、比例或旋转轴。本目录未执行云上传或付费调用。
