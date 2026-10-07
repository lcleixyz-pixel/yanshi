# 偏光镜公开参考原件

收集日期：2026-10-05。

本目录为通用宝石教学仪器提供有出处的结构参考与光学现象案例。无需将某一现售仪器完整复刻，也不将用户补拍整套仪器作为教学内容推进的前提。公开图片不能自动证明本模型尺寸、装配关系或某个样品的完整观察结果。

## 文件与来源

- `original/`：从 Wikimedia Commons 原始文件地址取得的文件，保留下载原始字节，未裁剪、转码、重新压缩或去除元数据。
- `sources.json`：每件已取得素材的作者、文件页、原件地址、许可及许可链接、SHA-256、已知条件、缺失条件与项目适用范围。
- `commons-imageinfo.json`：收集时 Commons 官方 API 返回的文件信息与许可元数据快照，用于复核源文件大小、SHA-1 和许可证。

| 素材 | 作者 / 许可 | 教学用途 | 不支持的推断 |
| --- | --- | --- | --- |
| 金红石单晶正交偏光 GIF | FDominec / CC BY-SA 3.0 | 真实单晶双折射现象案例 | 不自动生成物台角度序列、完整 360° 观察或鉴定结论 |
| 方解石与旋转偏振滤镜 GIF | Aldoaldoz / CC BY-SA 3.0 | 双影与偏振方向说明 | 不是样品在正交双偏光片间转动的完整记录 |
| 橄榄石刻面棱重影照片 | GlobalGemology / CC BY-SA 4.0 | 放大观察中的双影案例 | 不是偏光镜旋转明暗记录 |
| 受力梁等色线照片 | Trociny-fotografujo / CC0 | 光弹性、应力导致双折射的概念 | 不是宝石异常双折射实测证据，不能反算应力 |
| 透射平面偏光镜中文 SVG | Laor；中文版本由老陳上传 / CC BY-SA 3.0 | 教学光路与元件关系 | 不是某型号的 CAD、尺寸或机械装配依据 |
| 历史 Biot 偏光镜馆藏照片 | Daderot / CC0 | 光学仪器历史与外观参考 | 不是当代宝石偏光镜的结构验收依据 |

以上 6 件原件均已下载，共 14,547,751 字节；下载状态、原件路径和校验值以 `sources.json` 为准。GIF 检查结果：金红石 5 帧、总时长 2.5 秒；方解石 12 帧、总时长 6 秒。SVG 通过 XML 解析，未发现 `script` 标签或事件属性，唯一 `href` 为内部路径引用；这不替代发布前的图示内容复核。

## 使用边界

1. **许可与科学用途分别核查。** `status: reference-only` 与 `practiceRecordApproved: false` 表示它们是参考案例，尚未批准为本项目可计入完成状态的观察记录。不得填入 `observations.json` 的严格实训 `series` 后补造样品编号、取向、逐帧角度或时间。
2. 金红石 GIF 是真实摄影案例，但源文件只有 5 帧；原页对偏振片角度的文字说明不等于本项目已测定的逐帧物台角。它应有独立“公开现象案例”入口。
3. 方解石滤镜、橄榄石重影和受力梁各有不同实验条件，不能统一标成“宝石偏光镜四明四暗”。
4. CC BY-SA 素材使用时保留作品名、作者、原始文件页、许可链接；如改编，注明改动并按相同或兼容许可处理相应改编素材。CC0 素材也保留来源以便教学追溯。不要把素材许可等同于整套应用的许可证。
5. `permittedUse` 记录的是本项目选择的用途与限制，不替代原始许可证，也不是对第三方权利的法律保证。
6. SVG 为原始矢量文件。发布前应以普通图片方式显示，另行检查文字可读性与光学标注，避免将未知 SVG 内联执行。

## 仅供后续选择的外部资料

- [Greg Zaal / Poly Haven 的偏振片支架](https://blog.polyhaven.com/3d-printable-godox-ar400-polarizer/)：作者明确提供 STL 与 Blender 文件，标注 CC0。可参考环、偏振片支撑与紧固件的零件划分；用途为摄影偏振支架，不是宝石偏光镜成套 CAD。本轮未下载此模型。
- [PUMA 3D 打印显微镜](https://github.com/TadPath/PUMA)：仓库明确 CAD、STL 与程序为 GPL-3.0，文档为 GFDL-1.3；支持偏振观察，可借鉴模块化光学结构。不是 MIT/CC0，也不是本项目已导入模型。本轮未下载代码或模型库。
- [Open-Source 3D-Printable Optics Equipment，Zhang 等，PLOS ONE 2013](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0059840)：论文及其原始插图标为 CC BY，可参考参数化滤镜架、样品架与光学导轨；外链模型须逐文件另核许可。
- [OpenStax 偏振章节](https://openstax.org/books/university-physics-volume-3/pages/1-7-polarization)：用于物理事实查阅。2026-10-05 核查页面显示 CC BY-NC-SA 及额外使用说明；本轮没有下载其图片，也不将当前页面素材标成 CC BY。
- [GIA 偏光镜官方页面](https://store.gia.edu/products/gia-polariscope)及[版权说明](https://www.gia.edu/UK-EN/copyrights-trademarks)：可作为现售仪器功能与名称的外链参考；本轮未下载或保管厂商图片，不将公开展示视为开放许可。
- [Gemology Project 偏光镜章节](https://gemologyproject.com/wiki/index.php?title=Polariscope)：有操作、锥光与样品图例，部分内容明确为计算生成图或第三方提供照片；本轮未将图像整体视为许可清楚的原件，也未下载媒体。

## 整周实训记录的定向检索

2026-10-05 补充核查以下 6 组原始来源。结论是**本轮未确认可直接替代本项目严格宝石实训记录的公开素材**；这不表示网上不存在，亦不要求用户先完成整套仪器拍摄。公开案例可先用于现象辨识教学，完整角度回放另行补足证据。下列未收集项目仅保留链接，没有下载其影像。

| 来源 | 许可及已知内容 | 未能直接用于当前实训的原因 |
| --- | --- | --- |
| [FDominec 的金红石 GIF](https://commons.wikimedia.org/wiki/File:Rutile_birefringence.gif) | CC BY-SA 3.0；正交偏光下的真实单晶；本地原件 5 帧、2.5 秒 | 缺逐帧标定角度、完整取向和整周采集记录；不能从循环播放推断真实转过 360° |
| [Aldoaldoz 的方解石 GIF](https://commons.wikimedia.org/wiki/File:Calcite_and_polarizing_filter.gif) | CC BY-SA 3.0；本地原件 12 帧、6 秒 | 实验是旋转观察滤镜，不是本设计中的物台整周观察 |
| [Multicherry 的塑料托盘光弹性录像](https://commons.wikimedia.org/wiki/File:Plastic_fruit_tray_showing_photoelasticity_through_crossed_polarisers.webm) | CC BY-SA 4.0；约 31 秒；作者说明 LCD 光源、相机前第二偏光片转过 90°，除转码外未调饱和度、亮度或对比度 | 对象是塑料托盘，缺逐时角度标定；不能改标为宝石样品记录 |
| ESO 的 [Polarised light](https://www.eso.org/public/videos/polarisedlight1/) 与 [Light polarised by a planet](https://www.eso.org/public/videos/polarisedlight2/) | Commons 对应文件明确 CC BY 4.0；作者原站分别称其为动画与艺术示意 | 不是实物宝石录像，只能支持偏振原理说明 |
| [Frank K. Mazdab / rockPTX 薄片视频图谱](https://www.rockptx.com/video-atlas-of-minerals-in-thin-section/) | 作者站明确提供约 30 秒、720p、360° 的矿物薄片 PPL/XP 录像，关联薄片及微探针数据，并说明一般下片 E-W 方向；页脚为 All rights reserved | 内容条件较完整，但未找到允许本项目转载的开放许可，且薄片与裸石装样条件不同；仅外链候选 |
| [UAB Minescope](https://ddd.uab.cat/collection/minescope) 及[尖晶石记录](https://ddd.uab.cat/record/207719/) | 机构检索摘要明确为薄片旋转 360° 的图片序列；尖晶石条目写未加检偏器的平面偏光照片，并有 Creative Commons 提示 | 本轮原记录页超时，未确认具体许可版本、逐角度记录与所需取向；元数据的 CC0 不能代替影像文件许可，暂不下载或导入 |

## 校验方法

下载时逐文件检查 Commons API 中的许可名称，验证原件字节数和源 SHA-1，再计算项目 SHA-256。SHA-256 用于证明保存后原件未变，不代表科学条件或版权权属获得额外验证。

从项目 `gem-lab/` 目录可复核：

```sh
python3 - <<'PY'
import hashlib, json
from pathlib import Path
root = Path('assets-source/polariscope/references')
manifest = json.loads((root / 'sources.json').read_text())
for source in manifest['sources']:
    data = (root / source['localPath']).read_bytes()
    assert len(data) == source['byteLength']
    assert hashlib.sha256(data).hexdigest() == source['sha256']
    print(source['id'], 'OK')
PY
```
