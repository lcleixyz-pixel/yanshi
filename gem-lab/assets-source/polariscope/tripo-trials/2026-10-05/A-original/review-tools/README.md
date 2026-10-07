# Tripo 候选本地导入检查

此脚本只在独立 Blender 后台进程导入自包含 GLB，保留导入得到的几何、对象变换及材质。新增中性环境、三盏面积灯和检查相机；不覆盖候选原件，不修改现有母版或网页 GLB。

从仓库根目录运行，并将 Blender 路径替换为本机实际安装路径：

```sh
"/path/to/Blender.app/Contents/MacOS/Blender" \
  --background --factory-startup --python-exit-code 1 \
  --python "gem-lab/assets-source/polariscope/tripo-trials/2026-10-05/A-original/review-tools/render_candidate.py" \
  -- --input "/absolute/path/candidate.glb" \
  --output "/absolute/path/new-empty-review-directory" \
  --azimuth-offset 0 --resolution 1024 --samples 64
```

先用另一个新目录加 `--views hero --resolution 768 --samples 32` 检查导入朝向；确认仪器正面后通过 `--azimuth-offset` 调整方位。默认正面相机位于 Blender 的 −Y 方向，左侧相机位于 −X；偏移以 Blender Z 轴为轴。这里只调整相机，不旋转或重塑模型。六个方位共用同一正交比例，角度对应前、后、左、右、俯视、3/4 视图。前后左右仅为模型坐标约定，不表示已验证实物方向。完整检查的 hero 方位为 +38°、仰角 20°，更接近 Studio 初始视图和输入图；先前 `preview/hero.png` 使用 −38°，保留为背侧证据。

默认 1024 × 1024、64 采样、AgX、曝光 0；可调 `--exposure`。有 Metal 则使用 GPU，否则明确记录 CPU 回退。光照适合观察材质和形状，不能代表校准的仪器光学现象。脚本不会将任何材质改成透明，也不会补造通光孔或部件。

输出：

- `front.png`、`back.png`、`left.png`、`right.png`、`top.png`、`hero.png`
- `import-description.json`：导入后对象、网格数量、材质节点连线及贴图描述
- `review-report.json`：来源 SHA-256、包围盒、相机、渲染参数及原件未修改核验
- `review.blend`：可继续检查的独立场景，含导入候选及 `REVIEW_HELPERS` 集合

输入和输出必须是绝对路径。输出目录需不存在或为空，防止覆盖既有审阅。输入中的外部文件/网络 URI 在导入前被拒绝；嵌入式资源允许。几何缺陷、缺失材质和贴图均应在原样检查结果中如实保留。
