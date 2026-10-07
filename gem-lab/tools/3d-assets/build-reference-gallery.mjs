import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=path.join(root,'assets-source/polariscope/references');
const target=path.join(root,'public/assets/3d/polariscope/references');
const manifest=JSON.parse(await fs.readFile(path.join(source,'sources.json'),'utf8'));
await fs.mkdir(path.join(target,'original'),{recursive:true});
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const items=[];
for(const item of manifest.sources){
 if(item.downloadStatus!=='downloaded'||!item.originalUnmodified)continue;
 const bytes=await fs.readFile(path.join(source,item.localPath));
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('Hash mismatch: '+item.id);
 await fs.writeFile(path.join(target,item.localPath),bytes);
 items.push(item);
}
await fs.writeFile(path.join(target,'sources.json'),JSON.stringify(manifest,null,2));
const cards=items.map((item,index)=>`<article><div class="image"><img loading="lazy" src="${escape(item.localPath)}" alt="${escape(item.title)}"></div><div class="body"><span class="number">${String(index+1).padStart(2,'0')} / ${escape(item.license)}</span><h2>${escape(item.title)}</h2><p class="credit">${escape(item.author)} · 原件未修改</p><p>${escape(item.knownconditions[0])}</p><details><summary>拍摄条件、用途与限制</summary><h3>来源已知条件</h3><ul>${item.knownconditions.map(x=>`<li>${escape(x)}</li>`).join('')}</ul><h3>缺失或不适用</h3><ul>${item.missingconditions.map(x=>`<li>${escape(x)}</li>`).join('')}</ul></details><div class="links"><a href="${escape(item.pageURL)}" target="_blank" rel="noreferrer">原作者与来源 ↗</a><a href="${escape(item.licenceURL)}" target="_blank" rel="noreferrer">许可条款 ↗</a><a href="${escape(item.localPath)}" target="_blank">查看原件 ↗</a></div></div></article>`).join('');
await fs.writeFile(path.join(target,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>偏光与双折射 · 公开参考图库</title><style>*{box-sizing:border-box}body{margin:0;background:#f7f7f1;color:#27342e;font-family:system-ui,-apple-system,sans-serif;line-height:1.7}main{max-width:1320px;margin:auto;padding:45px 32px}header{padding:25px 0 35px;max-width:850px}header small,.number{font:11px ui-monospace,monospace;letter-spacing:.12em;color:#617969}h1{font-size:38px;line-height:1.3;font-weight:550;margin:15px 0}header p{color:#626f66}.notice{padding:18px 22px;border-left:3px solid #688574;background:#edf0e7;font-size:14px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}article{background:#fffefa;border:1px solid #dedfd5;border-radius:14px;overflow:hidden}.image{height:340px;background:#eaece5;display:grid;place-items:center;overflow:hidden}.image img{max-width:100%;max-height:100%;object-fit:contain}.body{padding:26px}h2{font-size:21px;margin:8px 0;font-weight:550}h3{font-size:14px}p,li{font-size:14px}.credit{color:#7e847c;font-size:12px}.links{display:flex;gap:18px;flex-wrap:wrap;border-top:1px solid #e3e4d9;padding-top:17px;margin-top:24px}a{color:#35614e;font-size:13px}summary{cursor:pointer;font-size:14px;color:#3f6250}details{margin-top:20px}footer{padding:35px 0;color:#737d74;font-size:12px}@media(max-width:720px){.grid{grid-template-columns:1fr}main{padding:24px 18px}h1{font-size:29px}.image{height:270px}}</style><main><a href="../../../../explore/polariscope">← 回到通用教学偏光镜</a><header><small>GEM LAB / OPEN REFERENCES</small><h1>偏光与双折射<br>公开参考图库</h1><p>从真实照片、动图和结构图理解现象。6 件原始资料逐项保留作者与许可，供课堂讲解和模型制作参考。</p><div class="notice">这些资料是独立案例：金红石正交偏光、方解石单滤镜双影、橄榄石棱重影、工程应力与历史仪器的观察条件各不相同。它们不作为当前 3D 样品的实测曲线，也不计入完整一周实训。</div></header><div class="grid">${cards}</div><footer>收集日期 ${escape(manifest.collectedOn)} · 所有图片按各自许可提供，图像文件未修改。<a href="sources.json">完整来源与文件校验信息</a>。本图库页面与教学代码不是第三方作者的作品。</footer></main></html>`);
console.log(JSON.stringify({count:items.length,bytes:items.reduce((a,x)=>a+x.byteLength,0),gallery:path.join(target,'index.html')}));
