# Tripo 等外部 GLB 的本地检查

在本目录执行：

```sh
npm run inspect:import -- /绝对路径/下载的模型.glb
```

需要指定报告位置时追加 `--out /绝对路径/报告目录`。只接受一个完整文件路径和可选的报告目录，不接受通配符、优化选项或远程 URL。输入应为内嵌几何与纹理的完整 GLB；引用外部 buffer 或图片的文件会被标记，外部资源不会被读取。

默认报告写入 `gem-lab/assets-source/polariscope/tooling-validation/YYYY-MM-DD/` 下新建的唯一子目录。每次保留独立报告，不覆盖之前的报告，更不替换输入或现行网页资产。

- `summary.json`：输入 SHA-256、前后哈希一致性、版本、节点、材质、贴图、扩展及格式校验概览。
- `gltf-validation.json`：Khronos glTF Validator 的完整结果（最多 1000 条问题）。
- `gltf-inspect.md`：glTF Transform 的几何、材质、纹理尺寸及内存统计。

入口只执行固定的 `inspect` 和内置格式校验，不执行 `optimize`、合并、展平、减面、重拓扑或贴图重压缩。现有 `npm run verify` 仍专用于已整理好的偏光镜 GLB、manifest 和八部件契约。

格式错误为零不代表仪器外形、薄片、通光孔、转轴、机械联动或光学现象正确。导回后仍需用 Blender 和实际浏览器做多视角对照；原始下载模型保留，修整结果另存。

## 工具版本与当前依赖限制

2026-10-05 安装 `@gltf-transform/cli@4.5.1`，保留原有 `three@0.183.2` 和 `gltf-validator@2.0.0-dev.3.10`。工具依赖隔离在本目录，不进入网页打包依赖。Node.js 需 >=20。

当日 npm 审计报告 `micromatch → braces@3.0.3` 存在深层嵌套通配符导致栈耗尽的拒绝服务问题：[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)。npm 显示的 3 个 high 项来自同一依赖链；当日 registry 的 braces 最新版仍为 3.0.3。当前入口不接收或处理用户通配符，固定调用离线 inspect，不启用网络或外部资源读取。这限制了使用范围，不能等同依赖漏洞已修复。未采用会将 CLI 降到 2.0.5 的强制自动修复；后续有兼容修复版本时再更新验证。

安装时另出现上游 `glob@10.5.0` 弃用提示。npm 在 Sharp 的可选 WASM 依赖上显示 `extraneous`；本机实际使用的 CLI 与原生图像库已完成启动验证，未借此改动应用依赖。

参考：[glTF Transform 官方说明](https://gltf-transform.dev/cli)、[Khronos Validator](https://github.com/KhronosGroup/glTF-Validator)。
