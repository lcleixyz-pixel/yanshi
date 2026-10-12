/** Native Safari/WebDriver verification; never changes Safari security preferences. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(project, 'assets-source/polariscope/validation/browser');
await fs.mkdir(output, { recursive: true });
const endpoint = process.env.POLARISCOPE_WEBDRIVER_URL || 'http://localhost:4445';
const baseURL = process.env.POLARISCOPE_PREVIEW_URL || 'http://127.0.0.1:5178';
async function request(url, method = 'GET', body) {
 const response = await fetch(endpoint + url, { method, headers:{'Content-Type':'application/json'}, ...(body ? {body:JSON.stringify(body)} : {}) });
 const result = await response.json(); if (result.value?.error) throw new Error(`${result.value.error}: ${result.value.message}`); return result.value;
}
const created = process.env.POLARISCOPE_SAFARI_SESSION ? {sessionId:process.env.POLARISCOPE_SAFARI_SESSION} : await request('/session','POST',{capabilities:{alwaysMatch:{browserName:'safari'}}});
const session = '/session/' + created.sessionId;
const execute = (script, args = []) => request(session+'/execute/sync','POST',{script,args});
const wait = async (predicate, ms = 15000) => {const start=Date.now();while(Date.now()-start<ms){const value=await predicate();if(value)return value;await new Promise(r=>setTimeout(r,120));}throw new Error('Timed out waiting for browser condition');};
const element = async selector => (await request(session+'/element','POST',{using:'css selector',value:selector}))['element-6066-11e4-a52e-4f735466cecf'];
const click = async selector => request(session+'/element/'+await element(selector)+'/click','POST',{});
const keys = async (selector,text) => request(session+'/element/'+await element(selector)+'/value','POST',{text});
const ready = ()=>wait(()=>execute('return document.querySelector("[data-testid=polariscope-scene]")?.dataset.status === "ready";'));
const snapshot = ()=>execute('return {canvas:{...document.querySelector("canvas")?.dataset},reading:document.querySelector("[aria-label=空载相对透光率]")?.textContent,viewport:[innerWidth,innerHeight],complete:document.querySelector("[data-testid=explore-workflow]")?.dataset.canComplete};');
const checks=[];const assert=(condition,label)=>{checks.push({label,pass:!!condition});if(!condition)throw new Error(label);};
const capture=async name=>fs.writeFile(path.join(output,name+'.png'),Buffer.from(await request(session+'/screenshot'),'base64'));
try {
 await request(session+'/window/rect','POST',{width:1920,height:1132,x:0,y:30});
 await request(session+'/url','POST',{url:baseURL+'/explore/polariscope'}); await ready();
 await wait(async()=>Number((await snapshot()).canvas.fps)>0);
 const initial = await snapshot(); assert(initial.viewport[0]===1920 && initial.viewport[1]===1080,'native Safari viewport is 1920×1080');
 await capture('safari-desktop');
 await click('[data-testid=explore-mode-practice]');
 await click('[aria-label="将上偏光片调至 0 度"]');
 await wait(async()=> (await snapshot()).reading==='100%'); assert((await snapshot()).reading==='100%','parallel empty field 100%');
 await click('[aria-label="将上偏光片调至 90 度"]');
 await wait(async()=> (await snapshot()).reading==='0%'); assert((await snapshot()).reading==='0%','crossed empty field 0%');
 await click('[aria-label=光源开关]'); assert((await snapshot()).reading==='—','power off suppresses reading');
 await click('[aria-label=光源开关]'); await click('[data-testid=explore-confirm-alignment]');
 await click('[data-testid=explore-sample-toggle]');
 const sample=await snapshot(); assert(sample.reading==='—'&&sample.complete==='false','missing measured sample remains pending');
 await capture('safari-practice');
 await click('[data-testid=explore-mode-explode]');
 await click('#explosion-amount'); await keys('#explosion-amount','\uE010');
 await wait(async()=>Number((await snapshot()).canvas.explosion)>.99);
 assert(Number((await snapshot()).canvas.explosion)>.99,'exploded view reaches full extent');
 await capture('safari-exploded');
 const performanceSamples=[];
 for(let i=0;i<12;i++) { await keys('#explosion-amount',i%2===0?'\uE014\uE014\uE014':'\uE012\uE012\uE012'); await new Promise(r=>setTimeout(r,350)); performanceSamples.push(Number((await snapshot()).canvas.fps)); }
 const resource=[];
 for(let i=0;i<3;i++) {
  await click('a.pol-explore__back'); await wait(()=>execute('return location.pathname==="/knowledge/polariscope";'));
  // History changes before a lazy route commits; wait for React to unmount the previous scene.
  assert(await wait(()=>execute('return document.querySelectorAll("canvas[data-testid=polariscope-canvas]").length===0;')),'exit removes native canvas '+i);
  await click('a[href="/explore/polariscope"]'); await ready();
  await wait(async()=>Number((await snapshot()).canvas.geometries)>0);resource.push((await snapshot()).canvas);
 }
 assert(new Set(resource.map(x=>x.geometries+':'+x.textures)).size===1,'repeated entry has stable GPU resource counts');
 const manifest=JSON.parse(await fs.readFile(path.join(project,'public/assets/3d/polariscope/manifest.json'),'utf8'));
 const evidence={date:new Date().toISOString(),capabilities:created.capabilities??{browserName:'Safari',browserVersion:'unavailable'},assetSha256:manifest.sha256,viewport:initial.viewport,checks,performance:{quality:'high',interaction:'keyboard exploded control',samples:performanceSamples,averageFps:performanceSamples.reduce((a,b)=>a+b,0)/performanceSamples.length},resource};
 await fs.writeFile(path.join(output,'safari-evidence.json'),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify(evidence,null,2));
} finally { await request(session,'DELETE'); }
