# 光栅式分光镜 paper-optics-v1

应用接入用的网页版本。`model.glb` 与 `../structure-v1/model.glb` 逐字节相同（SHA-256 `bc1ae40ae18b12942b5edbd13a4ca5506fe5351d603293ce5274d54d1757e16b`，1,204,720 B），没有改几何或材质；本目录只补充 2026-10-08 复核的 `optical-cases.json` 与 `sources.json`，使应用不读取被 Git 忽略的 `assets-source/`。

入射白光与零级在应用中画成灰线（`src/components/optics3d/displayPaths.js`，与审阅页 `display-paths.mjs` 同源），不写入光路数据。

2026-10-08 由 Claude Code 打包后复核：`validate-public-asset.mjs` 全部通过（glTF 0 错误），`verify_other_optics.mjs --instrument grating-spectroscope --input-dir` 指向本目录 7/7 通过。线密度 150/300/600 线/mm 为教学假设。
