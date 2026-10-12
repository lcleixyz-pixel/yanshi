# Blender 资产构建

这里的脚本重建旧 v0.4 参数化模型，不是当前网页 `repair-v2` 的修整生成器。旧母版、渲染与当前修整素材的恢复方式见[资产归档与恢复](../../../../docs/资产归档与恢复.md)；当前网页运行及 npm 构建不依赖这些归档素材。

`build_polariscope.py` 只依赖 Blender 自带的 `bpy`，不需要第三方插件、MCP、在线服务或付费模型。

它读取 `../../../assets-source/polariscope/parameters.json`，建立部件层级和可编辑修改器，为同一几何保留 Web/Cycles 两套材质，导出带 `partId` 的 GLB，检查导出容器和重新导入的节点/包围盒，并可生成六张 Cycles 固定视角渲染图。

```sh
/path/to/blender --background --python-exit-code 1 --python gem-lab/tools/3d-assets/blender/build_polariscope.py
```

可用脚本参数（置于 `--` 后）：`--params /path/to/parameters.json`、`--skip-renders`、`--resolution 800`、`--samples 32`、`--view 04-three-quarter`、`--device AUTO|METAL|CPU`。`--view` 只输出指定验收视角。主图确认后使用 `--render-existing` 读取已验证母版补齐六图，保持 GLB 二进制及哈希不变；该模式检查参数、脚本与 GLB 哈希一致。AUTO 在可用时使用 Metal，否则记录后回退 CPU；指定 METAL 但不可用会报错，不静默宣称 GPU 渲染。

产物、项目原图与 PDF 来源、暂定尺寸和必要补充资料说明见 `assets-source/polariscope/README.md`。当前 v0.4 按用户要求，以原演示项目仪器外形为参考；未实测、未核外部图片来源，不声称独立原创外壳或实物数字孪生，也不要求完整拍摄品牌设备。本流程不安装 Blender，不改全局 MCP 配置，不上传资料。
