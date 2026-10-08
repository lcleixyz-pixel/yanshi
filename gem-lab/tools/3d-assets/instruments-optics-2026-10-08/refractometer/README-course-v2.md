# v2 课程制作与恢复入口

运行和光学范围见 `public/assets/3d/refractometer/paper-optics-v2/README.md`。本目录新增脚本只写 v2 忽略目录或 v2 公共目录，不覆盖 v1。

顺序：`write_course_sample.ts` → `build_course_v2.py` → `../spectroscopes/independent_refractometer.py` → `package_course_v2.py` → 官方 glTF 格式核查 → `render_course_v2.py` → 再次打包。光学核查不通过时打包脚本拒绝发布。重建所得模型哈希必须重新绑定独立检查，不能复制旧报告当作重跑结果。

`assets-source/refractometer/course-v2/` 中 `editable.blend` 是母版，`sample-input.json` 记录同源样品参数，`manifest.json` 记录窗口尺寸及退让腔，`audit.json` 记录重新导入 GLB 后的检查。`poster-studio.blend` 是派生渲染场景，不替代母版。`protected-before.json` / `protected-after.json` 记录旧资产保护；`all-browser-results.json` 是 193 项全量断言报告（收尾曾人工 SIGINT），`final-browser-results.json` 是最终 12 项正常退出报告。

大体积浏览器取证仍在忽略目录下，不推入 Git。当前代码、GLB 与文档尚未提交；版本保存由用户后续决定。
