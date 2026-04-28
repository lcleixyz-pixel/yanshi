/**
 * 把仓库根目录散落的中文文件名素材，规范化复制到 public/assets/
 * 并把两张图标集大图切成 25 个独立 PNG。
 *
 * 用法：npm run prepare-assets
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJ_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(PROJ_ROOT, '..');
const PUBLIC_ASSETS = path.join(PROJ_ROOT, 'public', 'assets');

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

async function copy(src: string, dst: string) {
  const from = path.join(REPO_ROOT, src);
  const to = path.join(PUBLIC_ASSETS, dst);
  await ensureDir(path.dirname(to));
  await fs.copyFile(from, to);
  console.log(`  ✓ ${src}  →  assets/${dst}`);
}

async function copyMany(pairs: Array<[string, string]>) {
  for (const [a, b] of pairs) {
    try {
      await copy(a, b);
    } catch (err) {
      console.warn(`  ✗ 跳过：${a}（${(err as Error).message}）`);
    }
  }
}

// 整图切片为 cols × rows 个 PNG
async function sliceGrid(opts: {
  src: string;
  outDir: string;
  cols: number;
  rows: number;
  names: string[];
}) {
  const fullSrc = path.join(REPO_ROOT, opts.src);
  const meta = await sharp(fullSrc).metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`无法读取 ${opts.src} 元数据`);
  }
  const cellW = Math.floor(meta.width / opts.cols);
  const cellH = Math.floor(meta.height / opts.rows);
  await ensureDir(path.join(PUBLIC_ASSETS, opts.outDir));

  let idx = 0;
  for (let r = 0; r < opts.rows; r++) {
    for (let c = 0; c < opts.cols; c++) {
      const name = opts.names[idx];
      if (!name) {
        idx++;
        continue;
      }
      const out = path.join(PUBLIC_ASSETS, opts.outDir, `${name}.png`);
      // 切下网格单元，再切掉边缘 8% 的文字标签和外边框，得到纯图标
      const cropTop = Math.floor(cellH * 0.06);
      const cropBottom = Math.floor(cellH * 0.22); // 底部有"开启光源"等中文标签
      const cropSide = Math.floor(cellW * 0.08);
      await sharp(fullSrc)
        .extract({
          left: c * cellW + cropSide,
          top: r * cellH + cropTop,
          width: cellW - cropSide * 2,
          height: cellH - cropTop - cropBottom,
        })
        .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(out);
      idx++;
    }
  }
  console.log(`  ✓ 切片 ${opts.src} → ${opts.outDir}/  (${idx} 个)`);
}

async function main() {
  console.log('▶ 复制场景与仪器素材');
  await copyMany([
    ['工作台主页背景.png', 'scenes/workbench.png'],
    ['折射仪/折射仪_产品图.png', 'instruments/refractometer.png'],
    ['偏光镜/偏光镜_产品图.png', 'instruments/polariscope.png'],
    ['分光镜/分光镜_产品图.png', 'instruments/spectroscope.png'],
  ]);

  console.log('\n▶ 复制折射仪观察窗口状态图');
  await copyMany([
    ['折射仪/有折射油，未放置样品.png', 'observations/refractometer/empty.png'],
    ['折射仪/有折射油，单折射1.718.png', 'observations/refractometer/single-1.718.png'],
    ['折射仪/有折射油，双折射1.544-1.553.png', 'observations/refractometer/double-1.544-1.553.png'],
    ['折射仪/有折射油，点测法，1.61（点测）.png', 'observations/refractometer/spot-1.61.png'],
    ['折射仪/标尺区域1-圆形视图无阴影.png', 'observations/refractometer/scale.png'],
    ['折射仪/可旋转目镜读数标尺元件.png', 'observations/refractometer/eyepiece-scale.png'],
  ]);

  console.log('\n▶ 复制偏光镜参考图（观察窗已改为 Canvas 实时渲染，无需静态观察图）');
  await copyMany([
    ['偏光镜/偏光镜观察现象系列图_修正版.png', 'observations/polariscope/series.png'],
    ['偏光镜/上偏光片俯视图.png', 'observations/polariscope/upper-polar.png'],
  ]);

  console.log('\n▶ 复制分光镜状态图');
  await copyMany([
    ['分光镜/分光镜_无样品光谱窗口.png', 'observations/spectroscope/empty.png'],
  ]);

  console.log('\n▶ 复制样品库（28 个）');
  // [中文文件名（不含 .png）, 英文 id]
  const samples: Array<[string, string]> = [
    ['红宝石', 'ruby'],
    ['蓝宝石', 'sapphire'],
    ['祖母绿', 'emerald'],
    ['紫水晶', 'amethyst'],
    ['黄水晶', 'citrine'],
    ['石榴石', 'garnet'],
    ['橄榄石', 'peridot'],
    ['托帕石', 'topaz'],
    ['碧玺', 'tourmaline'],
    ['尖晶石', 'spinel'],
    ['坦桑石', 'tanzanite'],
    ['海蓝宝石', 'aquamarine'],
    ['锆石', 'zircon'],
    ['翡翠', 'jadeite'],
    ['和田玉', 'nephrite'],
    ['和田玉碧玉', 'nephrite-jasper'],
    ['欧泊', 'opal'],
    ['月光石', 'moonstone'],
    ['玛瑙', 'agate'],
    ['玉髓', 'chalcedony'],
    ['珍珠', 'pearl'],
    ['琥珀', 'amber'],
    ['钻石', 'diamond'],
    ['绿松石', 'turquoise'],
    ['大理石', 'marble'],
    ['葡萄石', 'prehnite'],
    ['岫玉', 'serpentine'],
    ['金丝玉', 'jinsi-jade'],
  ];
  await copyMany(
    samples.map(([cn, en]): [string, string] => [
      `样品库/${cn}样品.png`,
      `samples/${en}.png`,
    ]),
  );

  console.log('\n▶ 切片操作步骤图标集（5×3 = 15 个）');
  await sliceGrid({
    src: '操作步骤图标集.png',
    outDir: 'icons/steps',
    cols: 5,
    rows: 3,
    names: [
      'power-on',     // ① 开启光源
      'liquid-drop',  // ② 滴加液体
      'place-sample', // ③ 放置样品
      'observe',      // ④ 观察
      'record',       // ⑤ 记录数据
      'rotate',       // ⑥ 旋转样品
      'focus',        // ⑦ 调整焦距
      'read-scale',   // ⑧ 读取刻度
      'compare',      // ⑨ 对比结果
      'clean',        // ⑩ 清洁表面
      'remove',       // ⑪ 取出样品
      'power-off',    // ⑫ 关闭光源
      'align',        // ⑬ 检查对准
      'wait',         // ⑭ 等待
      'done',         // ⑮ 完成
    ],
  });

  console.log('\n▶ 切片状态反馈图标集（5×2 = 10 个）');
  await sliceGrid({
    src: '状态反馈图标集.png',
    outDir: 'icons/status',
    cols: 5,
    rows: 2,
    names: [
      'success',  // 成功
      'error',    // 错误
      'warning',  // 警告
      'info',     // 信息
      'help',     // 帮助
      'achieved', // 已完成
      'loading',  // 进行中
      'locked',   // 已锁定
      'unlocked', // 已解锁
      'tip',      // 提示
    ],
  });

  console.log('\n✓ 全部完成');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
