# 仪器光路论文复核候选

独立本地审阅，不替换已有 `structure-v1` 或教学主应用。棱镜、折射仪现已准备为独立的 `public/assets/3d/*/paper-optics-v1/` 版本；这只是本机静态资产交付，尚未接入应用或部署。

在 `gem-lab` 的现有 Vite 服务中打开：

`/tools/3d-assets/instruments-optics-2026-10-08/review/`

输出位于 `gem-lab/assets-source/optics-paper-review/2026-10-08/`。每台包含 GLB、部件清单、光路案例、来源和构建检查；棱镜、光栅、折射仪另保存可编辑 Blender 母版。偏光镜使用原资产的相同字节与原始来源登记，只新增示意数据。

重建命令、论文支持范围和独立验证入口见三个仪器子目录 README。详细发现见仓库 `docs/仪器光路论文复核与修整-2026-10-08.md`。

共享审阅器按模型哈希核对清单；整机模式保留材质，内部模式使用透明外壳及光路透视叠加。拆解和隔离暂停光路，不把失去装配关系的线条表现为工作状态。示例参数和相机状态分离。

此页面用于结构/光路候选审阅，不含真实样品读数、评分或后端接口。分光镜采用准直输出假设，光路止于目镜前；折射仪采用明确的理想薄透镜；偏光镜代表方向不是球镜定量追迹。不要把页面检查当作实物光学校准。

## 2026-10-08 接入前修正

共享审阅页的棱镜和折射仪直接读取上述新 public 目录中的 GLB、manifest、optical-cases 和 sources；加载时核对模型 SHA-256 与字节数。光栅、偏光镜仍读取原研究候选。新版本各自的 `validation/README.md` 提供实际 public 输入的独立检查命令、报告和浏览器记录。

光栅公共入射段只画一次中性灰线，到实际衍射点之后才按波长分色，零级保持中性；棱镜白光采用同样的入射段处理，单色案例保留波长色。`review/display-paths.mjs` 只拆分显示线条，不改已验证的光路数据。可用 `node gem-lab/tools/3d-assets/instruments-optics-2026-10-08/review/verify-display-paths.mjs` 从仓库根目录重跑 10 个显示案例检查。

本轮浏览器核对 14 个光路案例、25 个可选部件与新模型的聚焦、隔离、拆解、复位、整机/内部视图；Chromium 1280 × 720 下控制台 0 错误、0 警告。没有扩展为 Safari 或性能验收。源素材、可编辑母版及保护范围记录保留在 `assets-source/optics-paper-review/2026-10-08/publication-prep/`。

## 接入应用（2026-10-08，Claude Code）

棱镜式、光栅式分光镜与折射仪已接入应用：路由 `/explore/optics/:instrumentId`（`prism-spectroscope`、`grating-spectroscope`、`refractometer`），入口在分光镜与折射仪知识库「结构讲解」一节的 3D 卡片。三台都读取 `public/assets/3d/<id>/paper-optics-v1/`；光栅为此新建了同名目录（模型与 structure-v1 逐字节相同，补光路与来源数据）。偏光镜不在本次范围，应用仍用原 `/explore/polariscope`。

应用代码 `src/components/optics3d/opticsViewer.js` 由本目录 `review/review.mjs` 去掉 DOM 后改写，`displayPaths.js` 与 `review/display-paths.mjs` 同源；修改光路显示规则时需两处同步。
