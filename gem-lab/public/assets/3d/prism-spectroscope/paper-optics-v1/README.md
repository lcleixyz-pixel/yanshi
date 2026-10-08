# 棱镜式分光镜 paper-optics-v1

本目录是待接入的新静态资产版本；没有修改 structure-v1，也没有接入应用或部署。

蓝色 N-BK7 冕牌与暖色 N-F2 火石仅用于部件识别，不表示实际玻璃颜色、吸收或透射率。IOR、几何、光路计算与 2026-10-08 候选一致。外观封面和玻璃近景由导入本目录 GLB 的同版 Blender 母版渲染。

来源链、来源许可边界见 provenance.json；论文和玻璃数据链接见 sources.json；四界面教学处方见 prescription.json。光路从理想准直之后开始，止于未给定光学处方的目镜前面，不宣称真实光谱成像或厂家内部结构。

validation/material-only.json 证明二进制数据及全部非材质字段未变。独立光学检查 6 组通过，glTF Validator 0 错误、4 条黑色金属网格切线警告；浏览器 4 个案例、10 个可选部件通过且控制台无错误。详细结果见 [validation/README.md](validation/README.md)，打包日志不替代这些检查。
