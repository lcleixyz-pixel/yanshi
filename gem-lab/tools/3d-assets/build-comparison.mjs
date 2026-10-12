/** Self-contained review sheet made from this project's own renders and browser captures. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const asset = path.join(root, 'public/assets/3d/polariscope');
const evidence = path.join(root, 'assets-source/polariscope/validation');
const manifest = JSON.parse(await fs.readFile(path.join(asset, 'manifest.json'), 'utf8'));
const browser = JSON.parse(await fs.readFile(path.join(evidence, 'browser/chrome-evidence.json'), 'utf8'));
if (browser.assetSha256 !== manifest.sha256) throw new Error('Browser evidence does not match the current GLB');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const titles = ['正面', '侧面', '俯视', '前方斜视', '检偏环近景', '载物台近景'];
const cards = [];
const referenceData = (await fs.readFile(path.join(root, '../偏光镜/偏光镜_产品图.png'))).toString('base64');
const webHeroData = (await fs.readFile(path.join(evidence, 'browser/04-three-quarter.png'))).toString('base64');
const referenceCard = `<section id="project-reference"><h2>原项目形态对照</h2><p>先对照厚底座、连续白色折板、圆头顶托及上下镜环的位置。原图没有相机参数，两图视角和灯光不同，不作像素级或实物尺寸比对。</p><div class="pair"><figure><img src="data:image/png;base64,${referenceData}" alt="原演示项目的偏光镜仪器图"><figcaption>原项目 · 偏光镜_产品图.png</figcaption></figure><figure><img src="data:image/png;base64,${webHeroData}" alt="修正后的网页模型"><figcaption>当前网页模型 · 实际 Chrome 截图</figcaption></figure></div></section>`;
for (const [index, camera] of manifest.renders.entries()) {
  const images = [];
  for (const [label, file] of [
    ['Blender · Cycles', path.join(asset, 'renders', `${camera.id}.png`)],
    ['Chrome · Three.js', path.join(evidence, 'browser', `${camera.id}.png`)],
  ]) {
    const data = (await fs.readFile(file)).toString('base64');
    images.push(`<figure><img loading="lazy" src="data:image/png;base64,${data}" alt="${titles[index]} · ${label}"><figcaption>${label}</figcaption></figure>`);
  }
  cards.push(`<section id="${camera.id}"><h2>${index + 1}. ${titles[index]}</h2><div class="pair">${images.join('')}</div></section>`);
}
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>偏光镜 · 母版与网页对照</title>
<style>body{margin:0;background:#eeeae3;color:#292a26;font:16px/1.65 system-ui,sans-serif}main{max-width:1400px;margin:auto;padding:40px 24px}h1{font-size:34px;letter-spacing:-.04em;margin:0 0 12px}p{max-width:880px}nav{display:flex;gap:20px;flex-wrap:wrap}a{color:#456959}section{margin:40px 0}h2{font-size:20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}figure{margin:0;background:#fff;border-radius:12px;overflow:hidden}img{display:block;width:100%;height:auto}figcaption{padding:12px 18px}code{overflow-wrap:anywhere;font-size:12px}footer{border-top:1px solid #c8c6be;padding-top:20px;color:#666}@media(max-width:700px){main{padding:24px 12px}.pair{grid-template-columns:1fr}}</style>
<main><h1>偏光镜 · 原图、母版与网页对照</h1><p>版本 ${escape(manifest.version)}。六个固定视图使用同一几何、相机位置、观察目标与正交比例；两种渲染器使用各自的灯光和材质设置。请重点对照轮廓、孔洞、装配位置、玻璃边缘与细节。外形参考原项目仪器图；尺寸为暂定参考比例，尚未进行实物校准。</p><nav><a href="#project-reference">原图对照</a>${manifest.renders.map((camera, i) => `<a href="#${camera.id}">${titles[i]}</a>`).join('')}</nav>${referenceCard}${cards.join('')}<footer>浏览器采集时间：${escape(browser.date)} · Chrome ${escape(browser.browser)}<br>GLB SHA-256：<code>${escape(manifest.sha256)}</code><p>离线图不能替代网页验收；本页右侧均来自实际运行的教学页面。原图为用户指定的项目既有参考，外部作者与许可尚未核实；其余图像由本项目建模、渲染及截图生成。本页用于本地审阅。</p></footer></main></html>`;
const destination = path.join(evidence, '母版与网页六视图对照.html');
await fs.writeFile(destination, html);
console.log(destination);
